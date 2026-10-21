-- Rider wallet, payout accounts, delivery proof, voice-note storage hygiene.
-- Reviewed against the LIVE project (rhmojvcthzxuanijcjtu) on 2026-10-21. Idempotent.

-- ============================================================
-- 0. Single source of truth for the rider's share of a fare.
--    Live request_withdrawal() used 0.85; the rider app showed 0.80; ops finance
--    showed a 0.20 platform cut. CONFIRM THE RATE, then change it here only.
-- ============================================================
create or replace function public.rider_payout_rate()
returns numeric language sql immutable
set search_path = public, pg_temp
as $$ select 0.85::numeric $$;
grant execute on function public.rider_payout_rate() to authenticated, anon;

-- ============================================================
-- 1. delivered_at (real weekly earnings instead of grossEarned * 0.4)
-- ============================================================
alter table public.orders add column if not exists delivered_at timestamptz;
update public.orders set delivered_at = updated_at where status = 'delivered' and delivered_at is null;

create or replace function public.set_delivered_at()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.status = 'delivered' and old.status is distinct from 'delivered' then
    new.delivered_at := coalesce(new.delivered_at, now());
  end if;
  return new;
end $$;
drop trigger if exists trg_orders_set_delivered_at on public.orders;
create trigger trg_orders_set_delivered_at before update on public.orders
  for each row execute function public.set_delivered_at();

-- ============================================================
-- 2. Payout accounts in their OWN table.
--    riders.bank_* exist live but were never in a migration, nothing in the app writes
--    them (0 of 4 riders have details), and the riders SELECT policy
--    "Vendor can view rider assigned to their order" exposes the whole row to vendors.
--    Bank details must not live on that row. riders.bank_* stay as deprecated nulls.
-- ============================================================
create table if not exists public.rider_payout_accounts (
  user_id        uuid primary key references public.users(id) on delete cascade,
  bank_name      text not null,
  account_number text not null check (account_number ~ '^[0-9]{10}$'),
  account_name   text not null check (length(btrim(account_name)) between 2 and 100),
  updated_at     timestamptz not null default now()
);
alter table public.rider_payout_accounts enable row level security;

drop policy if exists "Rider reads own payout account" on public.rider_payout_accounts;
create policy "Rider reads own payout account" on public.rider_payout_accounts
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Admin reads payout accounts" on public.rider_payout_accounts;
create policy "Admin reads payout accounts" on public.rider_payout_accounts
  for select to authenticated using (public.is_admin());
-- No insert/update/delete policies: writes go through save_payout_account().

create or replace function public.save_payout_account(p_bank_name text, p_account_number text, p_account_name text)
returns void language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or not exists (select 1 from public.riders where user_id = v_uid) then
    raise exception 'Only riders can save a payout account';
  end if;
  if btrim(coalesce(p_bank_name,'')) = '' then raise exception 'Choose your bank'; end if;
  if p_account_number !~ '^[0-9]{10}$' then raise exception 'Account number must be 10 digits'; end if;
  if length(btrim(coalesce(p_account_name,''))) < 2 then raise exception 'Enter the account name'; end if;

  insert into public.rider_payout_accounts (user_id, bank_name, account_number, account_name)
  values (v_uid, btrim(p_bank_name), p_account_number, btrim(p_account_name))
  on conflict (user_id) do update
    set bank_name = excluded.bank_name, account_number = excluded.account_number,
        account_name = excluded.account_name, updated_at = now();
end $$;
revoke all on function public.save_payout_account(text,text,text) from public, anon;
grant execute on function public.save_payout_account(text,text,text) to authenticated;

-- Admin payout queue: one query, bank details included, no vendor-readable path.
create or replace function public.admin_pending_withdrawals()
returns table (id uuid, amount numeric, created_at timestamptz, rider_name text,
               bank_name text, account_number text, account_name text)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  return query
    select w.id, w.amount, w.created_at, u.full_name, a.bank_name, a.account_number, a.account_name
    from public.wallet_transactions w
    left join public.users u on u.id = w.rider_id
    left join public.rider_payout_accounts a on a.user_id = w.rider_id
    where w.type = 'payout_request' and w.status = 'requested'
    order by w.created_at;
end $$;
revoke all on function public.admin_pending_withdrawals() from public, anon;
grant execute on function public.admin_pending_withdrawals() to authenticated;

-- Account deletion must clear the new table too.
create or replace function public.trg_clear_payout_account_on_deactivate()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.is_active = false and old.is_active is distinct from false then
    delete from public.rider_payout_accounts where user_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists trg_users_clear_payout_account on public.users;
create trigger trg_users_clear_payout_account after update of is_active on public.users
  for each row execute function public.trg_clear_payout_account_on_deactivate();

-- ============================================================
-- 3. Wallet summary + safer request_withdrawal
-- ============================================================
create or replace function public.rider_wallet_summary()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid(); v_rider uuid; v_rate numeric := public.rider_payout_rate();
  v_gross numeric; v_week numeric; v_pending numeric; v_paid numeric;
begin
  select id into v_rider from public.riders where user_id = v_uid;
  if v_rider is null then raise exception 'No rider profile found'; end if;
  select coalesce(sum(agreed_price),0) * v_rate,
         coalesce(sum(agreed_price) filter (where delivered_at >= now() - interval '7 days'),0) * v_rate
    into v_gross, v_week from public.orders where rider_id = v_rider and status = 'delivered';
  select coalesce(sum(amount) filter (where status = 'requested'),0),
         coalesce(sum(amount) filter (where status = 'paid'),0)
    into v_pending, v_paid from public.wallet_transactions where rider_id = v_uid;
  return jsonb_build_object('rate', v_rate, 'gross_earned', floor(v_gross), 'week_earned', floor(v_week),
    'pending', floor(v_pending), 'paid_out', floor(v_paid),
    'available', greatest(floor(v_gross - v_pending - v_paid), 0),
    'min_withdrawal', 1000);
end $$;
revoke all on function public.rider_wallet_summary() from public, anon;
grant execute on function public.rider_wallet_summary() to authenticated;

create or replace function public.request_withdrawal(p_amount numeric)
returns uuid language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_uid uuid := auth.uid(); v_rider uuid; v_earned numeric; v_already numeric; v_available numeric; v_id uuid;
begin
  -- Row lock serialises concurrent requests (the old version could be raced into over-withdrawing).
  select id into v_rider from public.riders where user_id = v_uid for update;
  if v_rider is null then raise exception 'No rider profile found'; end if;
  if not exists (select 1 from public.rider_payout_accounts where user_id = v_uid) then
    raise exception 'Add your bank account before requesting a withdrawal';
  end if;
  if p_amount is null or p_amount < 1000 then raise exception 'Minimum withdrawal is ₦1,000'; end if;

  select coalesce(sum(agreed_price),0) * public.rider_payout_rate() into v_earned
    from public.orders where rider_id = v_rider and status = 'delivered';
  select coalesce(sum(amount),0) into v_already
    from public.wallet_transactions where rider_id = v_uid and status in ('requested','paid');
  v_available := v_earned - v_already;
  if p_amount > v_available then
    raise exception 'Requested amount (%) exceeds available balance (%)', p_amount, floor(v_available);
  end if;

  insert into public.wallet_transactions (rider_id, amount, type, status)
  values (v_uid, p_amount, 'payout_request', 'requested') returning id into v_id;
  return v_id;
end $$;

-- ============================================================
-- 4. Delivery proof is required (admins can still close orders manually)
-- ============================================================
create or replace function public.enforce_delivery_photo()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if coalesce(btrim(new.delivery_photo_url),'') = '' and not public.is_admin() then
    raise exception 'DELIVERY_PHOTO_REQUIRED' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists trg_orders_require_delivery_photo on public.orders;
create trigger trg_orders_require_delivery_photo before update on public.orders
  for each row when (new.status = 'delivered' and old.status is distinct from 'delivered')
  execute function public.enforce_delivery_photo();

-- ============================================================
-- 5. Voice notes: private bucket, bare storage paths, served via /api/voice-note.
--    Existing rows hold dead "public" URLs; strip them to bare paths.
-- ============================================================
update public.orders set
  voice_note_url         = regexp_replace(voice_note_url,         '^.*/object/public/documents/', ''),
  pickup_voice_note_url  = regexp_replace(pickup_voice_note_url,  '^.*/object/public/documents/', ''),
  dropoff_voice_note_url = regexp_replace(dropoff_voice_note_url, '^.*/object/public/documents/', '')
where voice_note_url like '%/object/public/documents/%'
   or pickup_voice_note_url like '%/object/public/documents/%'
   or dropoff_voice_note_url like '%/object/public/documents/%';

-- "Public Uploads" let anonymous callers write to the private documents bucket.
drop policy if exists "Public Uploads" on storage.objects;

-- =====================================================================
-- ONE MIGRATION - safe to run now, before or after deploying the new code.
-- Everything is additive and defaults to TODAY'S behaviour:
--   * Payment policy defaults to "optional" (pay after a rider accepts).
--     Nothing changes until you flip it on the ops "Payment Policy" page.
--   * Orders created by the OLD code are never forced to pay first.
--   * stop_count defaults to 1, scheduled windows are off for every vendor.
-- Rollback block at the bottom.
-- =====================================================================
begin;

-- 1. Columns -----------------------------------------------------------
alter table public.orders  add column if not exists scheduled_at     timestamptz;   -- already exists live; no-op
alter table public.orders  add column if not exists stop_count       integer not null default 1;
alter table public.orders  add column if not exists payment_required boolean not null default false;
alter table public.vendors add column if not exists scheduled_enabled boolean not null default false;
alter table public.vendors add column if not exists payment_policy   text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'vendors_payment_policy_check') then
    alter table public.vendors add constraint vendors_payment_policy_check
      check (payment_policy is null or payment_policy in ('required', 'optional'));
  end if;
end $$;

-- 2. Admin-controlled settings ------------------------------------------
create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.app_settings enable row level security;   -- no policies: only the server (service role) can touch it
revoke all on public.app_settings from anon, authenticated;
grant all on public.app_settings to service_role;

insert into public.app_settings (key, value) values
  ('payment_policy',        '{"mode": "optional"}'::jsonb),
  ('unpaid_expiry_minutes', '{"minutes": 30}'::jsonb)
on conflict (key) do nothing;

-- 3. Payment policy: decided by the DATABASE when an order is created ----
create or replace function public.payment_required_for_vendor(p_vendor_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_policy text;
  v_mode   text;
begin
  select payment_policy into v_policy from public.vendors where id = p_vendor_id;
  if v_policy = 'required' then return true; end if;
  if v_policy = 'optional' then return false; end if;
  select value ->> 'mode' into v_mode from public.app_settings where key = 'payment_policy';
  return coalesce(v_mode, 'optional') = 'required';
end;
$$;

-- Used only to word the vendor screen; the order's own flag is what counts.
create or replace function public.payment_required_for_me()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select public.payment_required_for_vendor(v.id)
       from public.vendors v where v.user_id = auth.uid() limit 1),
    false);
$$;

revoke all on function public.payment_required_for_vendor(uuid) from public, anon;
revoke all on function public.payment_required_for_me() from public, anon;
grant execute on function public.payment_required_for_vendor(uuid) to authenticated, service_role;
grant execute on function public.payment_required_for_me() to authenticated, service_role;

-- A vendor's browser cannot opt out: the flag is stamped here, not by the client.
create or replace function public.set_order_payment_required()
returns trigger
language plpgsql
as $$
begin
  NEW.payment_required := (NEW.scheduled_at is not null) or public.payment_required_for_vendor(NEW.vendor_id);
  return NEW;
end;
$$;

drop trigger if exists trg_orders_set_payment_required on public.orders;
create trigger trg_orders_set_payment_required
  before insert on public.orders
  for each row
  execute function public.set_order_payment_required();

-- A rider can only be assigned to a pay-first order once it is paid.
create or replace function public.enforce_paid_before_accept()
returns trigger
language plpgsql
as $$
begin
  if NEW.payment_required
     and NEW.payment_status is distinct from 'paid'
     and (
           (OLD.rider_id is null and NEW.rider_id is not null)
        or (NEW.status in ('matched', 'accepted')
            and OLD.status in ('pending', 'looking_for_driver'))
         )
  then
    raise exception 'ORDER_NOT_PAID: this order must be paid before a rider can accept it';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_orders_require_paid_before_accept on public.orders;
create trigger trg_orders_require_paid_before_accept
  before update on public.orders
  for each row
  execute function public.enforce_paid_before_accept();

-- 4. Extra drop-offs on one order ----------------------------------------
create table if not exists public.order_stops (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders(id) on delete cascade,
  seq             integer not null check (seq >= 1),
  dropoff_name    text not null,
  dropoff_lat     double precision not null,
  dropoff_lng     double precision not null,
  dropoff_details text,
  recipient_name  text,
  recipient_phone text,
  status          text not null default 'pending' check (status in ('pending', 'delivered')),
  delivered_at    timestamptz,
  created_at      timestamptz not null default now(),
  unique (order_id, seq)
);
create index if not exists order_stops_order_id_idx on public.order_stops (order_id);
alter table public.order_stops enable row level security;

create or replace function public.order_stops_visible(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
           select 1 from public.orders o
           join public.vendors v on v.id = o.vendor_id
           where o.id = p_order_id and v.user_id = auth.uid())
      or exists (
           select 1 from public.orders o
           join public.riders r on r.id = o.rider_id
           where o.id = p_order_id and r.user_id = auth.uid())
      or exists (
           select 1 from public.order_broadcasts b
           join public.riders r on r.id = b.rider_id
           where b.order_id = p_order_id and r.user_id = auth.uid());
$$;

create or replace function public.order_stops_can_insert(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.orders o
    join public.vendors v on v.id = o.vendor_id
    where o.id = p_order_id
      and v.user_id = auth.uid()
      and o.status = 'pending'
      and o.rider_id is null);
$$;

drop policy if exists order_stops_select on public.order_stops;
create policy order_stops_select on public.order_stops
  for select to authenticated using (public.order_stops_visible(order_id));

drop policy if exists order_stops_insert on public.order_stops;
create policy order_stops_insert on public.order_stops
  for insert to authenticated with check (public.order_stops_can_insert(order_id));

revoke all on public.order_stops from anon;
grant select, insert on public.order_stops to authenticated;
grant all on public.order_stops to service_role;

revoke all on function public.order_stops_visible(uuid) from public, anon;
revoke all on function public.order_stops_can_insert(uuid) from public, anon;
grant execute on function public.order_stops_visible(uuid) to authenticated, service_role;
grant execute on function public.order_stops_can_insert(uuid) to authenticated, service_role;

-- A rider marks ONE stop delivered: assigned rider only, trip in transit only.
create or replace function public.complete_order_stop(p_stop_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
begin
  select s.order_id into v_order_id from public.order_stops s where s.id = p_stop_id;
  if v_order_id is null then
    raise exception 'STOP_NOT_FOUND';
  end if;

  if not exists (
    select 1 from public.orders o
    join public.riders r on r.id = o.rider_id
    where o.id = v_order_id
      and r.user_id = auth.uid()
      and o.status = 'in_transit'
  ) then
    raise exception 'NOT_ALLOWED: only the assigned rider can complete stops while the order is in transit';
  end if;

  update public.order_stops
     set status = 'delivered', delivered_at = now()
   where id = p_stop_id and status <> 'delivered';
end;
$$;

revoke all on function public.complete_order_stop(uuid) from public, anon;
grant execute on function public.complete_order_stop(uuid) to authenticated;

-- An order cannot become 'delivered' while any of its stops is pending.
create or replace function public.enforce_stops_before_delivered()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.order_stops s
    where s.order_id = NEW.id and s.status <> 'delivered'
  ) then
    raise exception 'STOPS_REMAINING: complete every drop-off before marking this order delivered';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_orders_stops_before_delivered on public.orders;
create trigger trg_orders_stops_before_delivered
  before update on public.orders
  for each row
  when (NEW.status = 'delivered' and OLD.status is distinct from 'delivered')
  execute function public.enforce_stops_before_delivered();

-- 5. Cancel abandoned pay-first orders -------------------------------------
-- Only orders that REQUIRE payment, are still waiting for a rider and were
-- never paid. Orders on the "pay after a rider accepts" flow are never touched.
create or replace function public.expire_unpaid_orders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_minutes integer;
  v_count   integer;
begin
  select (value ->> 'minutes')::integer into v_minutes
    from public.app_settings where key = 'unpaid_expiry_minutes';
  v_minutes := coalesce(v_minutes, 30);
  if v_minutes <= 0 then
    return 0;
  end if;

  with cancelled as (
    update public.orders
       set status = 'cancelled',
           cancellation_reason = 'Payment not completed in time'
     where payment_required
       and status in ('pending', 'looking_for_driver')
       and rider_id is null
       and payment_status in ('unpaid', 'pending')
       and created_at < now() - make_interval(mins => v_minutes)
    returning 1
  )
  select count(*) into v_count from cancelled;

  return v_count;
end;
$$;

revoke all on function public.expire_unpaid_orders() from public, anon, authenticated;
grant execute on function public.expire_unpaid_orders() to service_role;

commit;

-- 6. Run the expiry every 5 minutes (needs the pg_cron extension) ------------
-- If this prints a notice instead, enable pg_cron in Supabase:
--   Dashboard > Database > Extensions > pg_cron, then run this block again.
-- Without it everything still works; use the "Run now" button on the ops
-- Payment Policy page whenever you want to clear abandoned orders.
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron could not be enabled automatically (%). Enable it in Dashboard > Database > Extensions, then re-run this block.', sqlerrm;
  end;

  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'expire-unpaid-orders') then
      perform cron.unschedule('expire-unpaid-orders');
    end if;
    perform cron.schedule('expire-unpaid-orders', '*/5 * * * *', 'select public.expire_unpaid_orders()');
    raise notice 'Scheduled expire-unpaid-orders every 5 minutes.';
  end if;
exception when others then
  raise notice 'Could not schedule the expiry job (%). Use "Run now" on the ops Payment Policy page instead.', sqlerrm;
end $$;

-- ---------------------------------------------------------------------
-- ROLLBACK (only if needed; the old app keeps working with all of this in place):
--   select cron.unschedule('expire-unpaid-orders');   -- if pg_cron was used
--   drop trigger if exists trg_orders_require_paid_before_accept on public.orders;
--   drop trigger if exists trg_orders_set_payment_required on public.orders;
--   drop trigger if exists trg_orders_stops_before_delivered on public.orders;
--   drop function if exists public.enforce_paid_before_accept();
--   drop function if exists public.set_order_payment_required();
--   drop function if exists public.enforce_stops_before_delivered();
--   drop function if exists public.expire_unpaid_orders();
--   drop function if exists public.complete_order_stop(uuid);
--   drop function if exists public.payment_required_for_me();
--   drop function if exists public.payment_required_for_vendor(uuid);
--   drop table if exists public.order_stops;
--   drop function if exists public.order_stops_visible(uuid);
--   drop function if exists public.order_stops_can_insert(uuid);
--   drop table if exists public.app_settings;
--   alter table public.orders  drop column if exists payment_required;
--   alter table public.orders  drop column if exists stop_count;
--   alter table public.vendors drop column if exists payment_policy;
--   alter table public.vendors drop column if exists scheduled_enabled;
-- ---------------------------------------------------------------------

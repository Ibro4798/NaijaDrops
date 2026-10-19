-- Customer wallet: a closed-loop, double-entry style balance for people who PAY for deliveries.
-- (Not the rider payout table: public.wallet_transactions already holds rider payout requests.)

create table if not exists public.user_wallets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null unique references public.users(id) on delete cascade,
  balance    numeric(12,2) not null default 0.00 check (balance >= 0),
  currency   text not null default 'NGN',
  is_locked  boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wallet_ledger (
  id             uuid primary key default gen_random_uuid(),
  wallet_id      uuid not null references public.user_wallets(id) on delete restrict,
  user_id        uuid not null references public.users(id) on delete restrict,
  amount         numeric(12,2) not null check (amount > 0),
  type           text not null check (type in ('credit', 'debit')),
  category       text not null check (category in ('topup', 'order_payment', 'refund', 'bonus', 'adjustment')),
  reference      text not null unique,
  order_id       uuid references public.orders(id) on delete restrict,
  balance_before numeric(12,2) not null check (balance_before >= 0),
  balance_after  numeric(12,2) not null check (balance_after >= 0),
  description    text not null,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  constraint wallet_ledger_math check (
    (type = 'credit' and balance_after = balance_before + amount) or
    (type = 'debit'  and balance_after = balance_before - amount))
);
create index if not exists wallet_ledger_user_idx    on public.wallet_ledger (user_id, created_at desc);
create index if not exists wallet_ledger_wallet_idx  on public.wallet_ledger (wallet_id);

alter table public.orders add column if not exists payment_method text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orders_payment_method_check') then
    alter table public.orders add constraint orders_payment_method_check check (payment_method in ('paystack', 'wallet'));
  end if;
end $$;
update public.orders set payment_method = 'paystack' where payment_status = 'paid' and payment_method is null;

-- The ledger can never be edited or deleted.
create or replace function public.wallet_ledger_immutable()
returns trigger language plpgsql set search_path to 'public', 'pg_temp'
as $function$
begin
  raise exception 'WALLET_LEDGER_IMMUTABLE: ledger rows cannot be changed or deleted';
end;
$function$;
drop trigger if exists trg_wallet_ledger_immutable on public.wallet_ledger;
create trigger trg_wallet_ledger_immutable before update or delete on public.wallet_ledger
  for each row execute function public.wallet_ledger_immutable();
drop trigger if exists trg_wallet_ledger_no_truncate on public.wallet_ledger;
create trigger trg_wallet_ledger_no_truncate before truncate on public.wallet_ledger
  for each statement execute function public.wallet_ledger_immutable();
revoke execute on function public.wallet_ledger_immutable() from public, anon, authenticated;

-- People can READ their own wallet and history; nothing else. All money moves go through the functions below.
alter table public.user_wallets  enable row level security;
alter table public.wallet_ledger enable row level security;
revoke all on public.user_wallets, public.wallet_ledger from anon, authenticated;
grant select on public.user_wallets, public.wallet_ledger to authenticated;
drop policy if exists "own wallet" on public.user_wallets;
create policy "own wallet" on public.user_wallets for select to authenticated using (user_id = auth.uid());
drop policy if exists "own ledger" on public.wallet_ledger;
create policy "own ledger" on public.wallet_ledger for select to authenticated using (user_id = auth.uid());

-- Add money. Idempotent on reference: replaying a webhook or retrying can never credit twice.
create or replace function public.wallet_credit(
  p_user_id uuid, p_amount numeric, p_reference text, p_category text, p_description text,
  p_order_id uuid default null, p_metadata jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  w          public.user_wallets%rowtype;
  v_existing public.wallet_ledger%rowtype;
  v_after    numeric(12,2);
  v_id       uuid;
begin
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) then raise exception 'INVALID_AMOUNT'; end if;
  if p_category not in ('topup', 'refund', 'bonus', 'adjustment') then raise exception 'INVALID_CATEGORY'; end if;
  if p_reference is null or length(trim(p_reference)) = 0 then raise exception 'REFERENCE_REQUIRED'; end if;
  if not exists (select 1 from public.users where id = p_user_id) then raise exception 'USER_NOT_FOUND'; end if;

  insert into public.user_wallets (user_id) values (p_user_id) on conflict (user_id) do nothing;
  select * into w from public.user_wallets where user_id = p_user_id for update;

  select * into v_existing from public.wallet_ledger where reference = p_reference;
  if found then
    if v_existing.user_id <> p_user_id then raise exception 'REFERENCE_CONFLICT'; end if;
    return jsonb_build_object('status', 'duplicate', 'balance', w.balance, 'ledger_id', v_existing.id);
  end if;

  v_after := w.balance + p_amount;
  update public.user_wallets set balance = v_after, updated_at = now() where id = w.id;
  insert into public.wallet_ledger
    (wallet_id, user_id, amount, type, category, reference, order_id, balance_before, balance_after, description, metadata)
  values
    (w.id, p_user_id, p_amount, 'credit', p_category, p_reference, p_order_id, w.balance, v_after, p_description, coalesce(p_metadata, '{}'::jsonb))
  returning id into v_id;

  return jsonb_build_object('status', 'credited', 'balance', v_after, 'ledger_id', v_id);
end;
$function$;

-- Pay for an order from the wallet: debit + mark the order paid, in one transaction.
create or replace function public.wallet_pay_order(p_user_id uuid, p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  o       public.orders%rowtype;
  w       public.user_wallets%rowtype;
  v_after numeric(12,2);
  v_pin   text;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if not exists (select 1 from public.vendors v where v.id = o.vendor_id and v.user_id = p_user_id) then
    raise exception 'NOT_ORDER_OWNER';
  end if;
  if o.payment_status = 'paid' then return jsonb_build_object('status', 'already_paid'); end if;
  if o.status in ('cancelled', 'delivered', 'completed') then raise exception 'ORDER_NOT_PAYABLE'; end if;
  if o.agreed_price is null or o.agreed_price <= 0 then raise exception 'NO_PRICE'; end if;

  insert into public.user_wallets (user_id) values (p_user_id) on conflict (user_id) do nothing;
  select * into w from public.user_wallets where user_id = p_user_id for update;
  if w.is_locked then raise exception 'WALLET_LOCKED'; end if;
  if w.balance < o.agreed_price then raise exception 'INSUFFICIENT_FUNDS'; end if;

  v_after := w.balance - o.agreed_price;
  v_pin := (1000 + (abs(('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::int) % 9000))::text;

  update public.user_wallets set balance = v_after, updated_at = now() where id = w.id;
  insert into public.wallet_ledger
    (wallet_id, user_id, amount, type, category, reference, order_id, balance_before, balance_after, description)
  values
    (w.id, p_user_id, o.agreed_price, 'debit', 'order_payment', 'order:' || o.id::text, o.id, w.balance, v_after, 'Payment for delivery');

  update public.orders
     set payment_status = 'paid', payment_method = 'wallet', payment_reference = 'wallet:' || o.id::text,
         price_locked = true, delivery_pin = coalesce(delivery_pin, v_pin)
   where id = o.id;

  return jsonb_build_object('status', 'paid', 'balance', v_after, 'price', o.agreed_price);
end;
$function$;

-- Cancelled before the rider picked up => the wallet payment comes straight back.
create or replace function public.wallet_refund_cancelled_order()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_user uuid;
begin
  if NEW.status = 'cancelled' and OLD.status is distinct from 'cancelled'
     and NEW.payment_status = 'paid' and NEW.payment_method = 'wallet'
     and OLD.status in ('pending', 'looking_for_driver', 'matched') then
    select v.user_id into v_user from public.vendors v where v.id = NEW.vendor_id;
    if v_user is not null then
      perform public.wallet_credit(v_user, NEW.agreed_price::numeric, 'refund:' || NEW.id::text, 'refund',
                                   'Refund for cancelled delivery', NEW.id,
                                   jsonb_build_object('reason', NEW.cancellation_reason));
      update public.orders set payment_status = 'refunded' where id = NEW.id;
    end if;
  end if;
  return null;
end;
$function$;
drop trigger if exists trg_orders_wallet_refund on public.orders;
create trigger trg_orders_wallet_refund after update of status on public.orders
  for each row execute function public.wallet_refund_cancelled_order();

-- Ops integrity check: every wallet's balance must equal the sum of its ledger.
create or replace function public.wallet_reconciliation()
returns table (wallets bigint, total_balance numeric, mismatched bigint)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select count(*), coalesce(sum(w.balance), 0), count(*) filter (where w.balance <> coalesce(l.net, 0))
    from public.user_wallets w
    left join (select wallet_id, sum(case when type = 'credit' then amount else -amount end) as net
                 from public.wallet_ledger group by wallet_id) l on l.wallet_id = w.id;
$function$;

-- Only the server (service role) may move money.
revoke all on function public.wallet_credit(uuid, numeric, text, text, text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.wallet_pay_order(uuid, uuid) from public, anon, authenticated;
revoke all on function public.wallet_refund_cancelled_order() from public, anon, authenticated;
revoke all on function public.wallet_reconciliation() from public, anon, authenticated;
grant execute on function public.wallet_credit(uuid, numeric, text, text, text, uuid, jsonb) to service_role;
grant execute on function public.wallet_pay_order(uuid, uuid) to service_role;
grant execute on function public.wallet_reconciliation() to service_role;

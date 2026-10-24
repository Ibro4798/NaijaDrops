-- Server-side guard for rider bids + one ₦10 price grid for negotiation.
-- Idempotent and additive: safe to run on the live database.
--
-- Why: until now the +/-20% bid range was enforced only in the rider app.
-- Anyone calling the API directly could insert a bid of any amount (₦1 or
-- ₦1,000,000) and a vendor could accept it. All negotiated prices (bids
-- and vendor counters) must now be whole multiples of ₦10 and sit within
-- +/-20% of the order's agreed_price, enforced in the database.

-- ============================================================
-- 1. Guard trigger on bids.amount
-- ============================================================
create or replace function public.guard_bid_amount()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $func$
declare
  v_price numeric;
  v_min   numeric;
  v_max   numeric;
begin
  -- Only validate when the amount is new or actually changing.
  if tg_op = 'UPDATE' and new.amount is not distinct from old.amount then
    return new;
  end if;

  select agreed_price into v_price from public.orders where id = new.order_id;
  if v_price is null or v_price <= 0 then
    raise exception 'This order has no valid price to bid against';
  end if;

  if new.amount is null or new.amount <= 0 or mod(new.amount, 10) <> 0 then
    raise exception 'Bid must be a positive amount in multiples of ₦10';
  end if;

  v_min := ceil(v_price * 0.8 / 10) * 10;
  v_max := floor(v_price * 1.2 / 10) * 10;
  if new.amount < v_min or new.amount > v_max then
    raise exception 'Bid must be between ₦% and ₦%', v_min, v_max;
  end if;

  return new;
end;
$func$;

revoke all on function public.guard_bid_amount() from public, anon, authenticated;

drop trigger if exists bids_guard_amount on public.bids;
create trigger bids_guard_amount
  before insert or update of amount on public.bids
  for each row
  execute function public.guard_bid_amount();

-- ============================================================
-- 2. vendor_counter_bid: same ₦10 grid and +/-20% window
--    (previously a ₦50 grid). Signature unchanged.
-- ============================================================
create or replace function public.vendor_counter_bid(p_bid_id uuid, p_vendor_amount numeric)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $func$
declare
  v_bid        bids%rowtype;
  v_order      orders%rowtype;
  v_vendor_row vendors%rowtype;
  v_uid        uuid := auth.uid();
  v_min        numeric;
  v_max        numeric;
begin
  select * into v_bid from public.bids where id = p_bid_id for update;
  if not found then raise exception 'Bid not found'; end if;
  if v_bid.status <> 'pending' then
    raise exception 'This bid is no longer open for counter-offers';
  end if;

  select * into v_order from public.orders where id = v_bid.order_id for update;
  if not found then raise exception 'Order not found'; end if;

  select * into v_vendor_row from public.vendors where id = v_order.vendor_id;
  if v_vendor_row.user_id <> v_uid and not public.is_admin() then
    raise exception 'Only the vendor (or an admin) can counter a bid';
  end if;

  if p_vendor_amount is null or p_vendor_amount <= 0 or mod(p_vendor_amount, 10) <> 0 then
    raise exception 'Counter-offer must be a positive amount in multiples of ₦10';
  end if;

  v_min := ceil(v_order.agreed_price * 0.8 / 10) * 10;
  v_max := floor(v_order.agreed_price * 1.2 / 10) * 10;
  if p_vendor_amount < v_min or p_vendor_amount > v_max then
    raise exception 'Counter-offer must be between ₦% and ₦%', v_min, v_max;
  end if;

  update public.bids
     set status = 'vendor_countered',
         vendor_amount = p_vendor_amount,
         vendor_responded_at = now()
   where id = p_bid_id;
end;
$func$;

revoke all on function public.vendor_counter_bid(uuid, numeric) from public, anon;
grant execute on function public.vendor_counter_bid(uuid, numeric) to authenticated;

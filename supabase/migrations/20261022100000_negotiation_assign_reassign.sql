-- Negotiation system upgrade: vendor counter-offer, bid status extensions, reassign, force-assign.
-- All changes are additive/idempotent. Safe to run on the live database.

-- ============================================================
-- 1. Extend bids table for vendor counter-offer
-- ============================================================
ALTER TABLE public.bids
  ADD COLUMN IF NOT EXISTS vendor_amount      numeric,
  ADD COLUMN IF NOT EXISTS vendor_responded_at timestamptz;

-- Extended status values (existing: pending, accepted, rejected)
-- New: vendor_countered
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bids_status_check'
  ) THEN
    ALTER TABLE public.bids DROP CONSTRAINT bids_status_check;
  END IF;
  ALTER TABLE public.bids ADD CONSTRAINT bids_status_check
    CHECK (status IN ('pending', 'accepted', 'rejected', 'vendor_countered'));
END $$;

-- ============================================================
-- 2. vendor_counter_bid(p_bid_id, p_vendor_amount)
--    Vendor sends back a counter within ±20% of the original agreed_price.
-- ============================================================
CREATE OR REPLACE FUNCTION public.vendor_counter_bid(p_bid_id uuid, p_vendor_amount numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $func$
DECLARE
  v_bid        bids%ROWTYPE;
  v_order      orders%ROWTYPE;
  v_vendor_row vendors%ROWTYPE;
  v_uid        uuid := auth.uid();
  v_min        numeric;
  v_max        numeric;
BEGIN
  -- Fetch bid + order + verify caller is the vendor
  SELECT * INTO v_bid FROM public.bids WHERE id = p_bid_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bid not found'; END IF;
  IF v_bid.status <> 'pending' THEN
    RAISE EXCEPTION 'This bid is no longer open for counter-offers';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_bid.order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

  SELECT * INTO v_vendor_row FROM public.vendors WHERE id = v_order.vendor_id;
  IF v_vendor_row.user_id <> v_uid AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only the vendor (or an admin) can counter a bid';
  END IF;

  -- Enforce ±20% cap on the original agreed_price
  v_min := CEIL(v_order.agreed_price * 0.8 / 50) * 50;
  v_max := FLOOR(v_order.agreed_price * 1.2 / 50) * 50;
  IF p_vendor_amount < v_min OR p_vendor_amount > v_max THEN
    RAISE EXCEPTION 'Counter-offer must be between ₦% and ₦%', v_min, v_max;
  END IF;

  UPDATE public.bids
    SET status = 'vendor_countered',
        vendor_amount = p_vendor_amount,
        vendor_responded_at = now()
    WHERE id = p_bid_id;
END;
$func$;

REVOKE ALL ON FUNCTION public.vendor_counter_bid(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendor_counter_bid(uuid, numeric) TO authenticated;

-- ============================================================
-- 3. accept_bid — updated to handle vendor_countered state
--    Accepts at bid.amount if pending, at bid.vendor_amount if vendor_countered.
-- ============================================================
CREATE OR REPLACE FUNCTION public.accept_bid(p_order_id uuid, p_bid_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $func$
DECLARE
  v_bid        bids%ROWTYPE;
  v_order      orders%ROWTYPE;
  v_vendor_row vendors%ROWTYPE;
  v_rider_row  riders%ROWTYPE;
  v_uid        uuid := auth.uid();
  v_final      numeric;
  v_acceptor   text; -- 'vendor' or 'rider'
BEGIN
  SELECT * INTO v_bid FROM public.bids WHERE id = p_bid_id AND order_id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bid not found'; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.status NOT IN ('pending', 'looking_for_driver') OR v_order.rider_id IS NOT NULL THEN
    RAISE EXCEPTION 'This order is no longer available';
  END IF;

  -- Determine who is accepting and what price applies
  SELECT * INTO v_vendor_row FROM public.vendors WHERE id = v_order.vendor_id;
  SELECT * INTO v_rider_row  FROM public.riders  WHERE id = v_bid.rider_id;

  IF v_vendor_row.user_id = v_uid OR public.is_admin() THEN
    -- Vendor (or admin) accepting a rider's pending bid
    IF v_bid.status <> 'pending' THEN
      RAISE EXCEPTION 'Can only accept a pending bid from this side';
    END IF;
    v_final    := v_bid.amount;
    v_acceptor := 'vendor';
  ELSIF v_rider_row.user_id = v_uid THEN
    -- Rider accepting a vendor counter-offer
    IF v_bid.status <> 'vendor_countered' THEN
      RAISE EXCEPTION 'No vendor counter-offer to accept';
    END IF;
    v_final    := v_bid.vendor_amount;
    v_acceptor := 'rider';
  ELSE
    RAISE EXCEPTION 'Only the vendor or the bidding rider can accept this bid';
  END IF;

  -- Lock the order to this rider at the agreed price
  UPDATE public.orders
    SET rider_id      = v_bid.rider_id,
        agreed_price  = v_final,
        status        = 'matched',
        updated_at    = now()
    WHERE id = p_order_id;

  UPDATE public.riders
    SET operational_status = 'busy'
    WHERE id = v_bid.rider_id;

  -- Mark the accepted bid
  UPDATE public.bids SET status = 'accepted' WHERE id = p_bid_id;

  -- Reject all other pending/countered bids for this order
  UPDATE public.bids
    SET status = 'rejected'
    WHERE order_id = p_order_id AND id <> p_bid_id AND status IN ('pending', 'vendor_countered');
END;
$func$;

REVOKE ALL ON FUNCTION public.accept_bid(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_bid(uuid, uuid) TO authenticated;

-- ============================================================
-- 4. decline_bid — vendor declines OR rider walks away from counter
-- ============================================================
CREATE OR REPLACE FUNCTION public.decline_bid(p_bid_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $func$
DECLARE
  v_bid        bids%ROWTYPE;
  v_order      orders%ROWTYPE;
  v_vendor_row vendors%ROWTYPE;
  v_rider_row  riders%ROWTYPE;
  v_uid        uuid := auth.uid();
BEGIN
  SELECT * INTO v_bid FROM public.bids WHERE id = p_bid_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bid not found'; END IF;
  IF v_bid.status NOT IN ('pending', 'vendor_countered') THEN
    RAISE EXCEPTION 'Bid is already resolved';
  END IF;

  SELECT * INTO v_order      FROM public.orders  WHERE id = v_bid.order_id;
  SELECT * INTO v_vendor_row FROM public.vendors WHERE id = v_order.vendor_id;
  SELECT * INTO v_rider_row  FROM public.riders  WHERE id = v_bid.rider_id;

  IF v_vendor_row.user_id <> v_uid AND v_rider_row.user_id <> v_uid AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized to decline this bid';
  END IF;

  UPDATE public.bids SET status = 'rejected' WHERE id = p_bid_id;
END;
$func$;

REVOKE ALL ON FUNCTION public.decline_bid(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decline_bid(uuid) TO authenticated;

-- ============================================================
-- 5. force_assign_rider(p_order_id, p_rider_id)
--    Admin directly matches an order to a rider (no Accept tap needed).
-- ============================================================
CREATE OR REPLACE FUNCTION public.force_assign_rider(p_order_id uuid, p_rider_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $func$
DECLARE
  v_order  orders%ROWTYPE;
  v_rider  riders%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_order.status NOT IN ('pending', 'looking_for_driver') OR v_order.rider_id IS NOT NULL THEN
    RAISE EXCEPTION 'Order is not open for assignment';
  END IF;

  SELECT * INTO v_rider FROM public.riders WHERE id = p_rider_id FOR UPDATE;
  IF NOT FOUND OR v_rider.approved IS NOT TRUE THEN
    RAISE EXCEPTION 'Rider not found or not approved';
  END IF;

  -- Check rider is not already on a live job
  IF EXISTS (
    SELECT 1 FROM public.orders
    WHERE rider_id = p_rider_id AND status IN ('matched', 'picked_up', 'in_transit')
  ) THEN
    RAISE EXCEPTION 'That rider is currently on a live delivery';
  END IF;

  UPDATE public.orders
    SET rider_id = p_rider_id, status = 'matched', updated_at = now()
    WHERE id = p_order_id;

  UPDATE public.riders
    SET operational_status = 'busy'
    WHERE id = p_rider_id;
END;
$func$;

REVOKE ALL ON FUNCTION public.force_assign_rider(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.force_assign_rider(uuid, uuid) TO authenticated;

-- ============================================================
-- 6. reassign_rider(p_order_id, p_new_rider_id)
--    Admin swaps riders on a matched order without cancelling it.
-- ============================================================
CREATE OR REPLACE FUNCTION public.reassign_rider(p_order_id uuid, p_new_rider_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $func$
DECLARE
  v_order      orders%ROWTYPE;
  v_new_rider  riders%ROWTYPE;
  v_old_rid    uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_order.status NOT IN ('matched') THEN
    RAISE EXCEPTION 'Can only reassign a matched order (not picked_up or in_transit)';
  END IF;

  v_old_rid := v_order.rider_id;

  SELECT * INTO v_new_rider FROM public.riders WHERE id = p_new_rider_id FOR UPDATE;
  IF NOT FOUND OR v_new_rider.approved IS NOT TRUE THEN
    RAISE EXCEPTION 'New rider not found or not approved';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.orders
    WHERE rider_id = p_new_rider_id AND status IN ('matched', 'picked_up', 'in_transit')
      AND id <> p_order_id
  ) THEN
    RAISE EXCEPTION 'That rider is already on a live delivery';
  END IF;

  -- Free old rider
  IF v_old_rid IS NOT NULL THEN
    UPDATE public.riders SET operational_status = 'online' WHERE id = v_old_rid;
  END IF;

  -- Lock in new rider
  UPDATE public.orders SET rider_id = p_new_rider_id, updated_at = now() WHERE id = p_order_id;
  UPDATE public.riders SET operational_status = 'busy' WHERE id = p_new_rider_id;
END;
$func$;

REVOKE ALL ON FUNCTION public.reassign_rider(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reassign_rider(uuid, uuid) TO authenticated;

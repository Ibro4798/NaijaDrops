-- Fix accept_bid and decline_bid to correctly identify rider whether bids.rider_id stores users.id or riders.id.
-- Also assign orders.rider_id with the actual riders.id row.

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
  v_actual_rider riders%ROWTYPE;
  v_uid        uuid := auth.uid();
  v_final      numeric;
  v_acceptor   text;
BEGIN
  SELECT * INTO v_bid FROM public.bids WHERE id = p_bid_id AND order_id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bid not found'; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.status NOT IN ('pending', 'looking_for_driver') OR v_order.rider_id IS NOT NULL THEN
    RAISE EXCEPTION 'This order is no longer available';
  END IF;

  SELECT * INTO v_vendor_row FROM public.vendors WHERE id = v_order.vendor_id;
  -- Support both schema styles: bids.rider_id referencing riders.id or auth users.id
  SELECT * INTO v_rider_row  FROM public.riders  WHERE id = v_bid.rider_id OR user_id = v_bid.rider_id;

  IF v_vendor_row.user_id = v_uid OR public.is_admin() THEN
    IF v_bid.status <> 'pending' THEN
      RAISE EXCEPTION 'Can only accept a pending bid from this side';
    END IF;
    v_final    := v_bid.amount;
    v_acceptor := 'vendor';
  ELSIF (v_rider_row.user_id = v_uid OR v_bid.rider_id = v_uid) THEN
    IF v_bid.status <> 'vendor_countered' THEN
      RAISE EXCEPTION 'No vendor counter-offer to accept';
    END IF;
    v_final    := v_bid.vendor_amount;
    v_acceptor := 'rider';
  ELSE
    RAISE EXCEPTION 'Only the vendor or the bidding rider can accept this bid';
  END IF;

  -- Resolve actual riders table entry for foreign key on orders.rider_id
  IF v_rider_row.id IS NOT NULL THEN
    v_actual_rider := v_rider_row;
  ELSE
    SELECT * INTO v_actual_rider FROM public.riders WHERE user_id = v_bid.rider_id;
  END IF;

  UPDATE public.orders
    SET rider_id      = COALESCE(v_actual_rider.id, v_bid.rider_id),
        agreed_price  = v_final,
        status        = 'matched',
        updated_at    = now()
    WHERE id = p_order_id;

  IF v_actual_rider.id IS NOT NULL THEN
    UPDATE public.riders
      SET operational_status = 'busy'
      WHERE id = v_actual_rider.id;
  END IF;

  UPDATE public.bids SET status = 'accepted' WHERE id = p_bid_id;

  UPDATE public.bids
    SET status = 'rejected'
    WHERE order_id = p_order_id AND id <> p_bid_id AND status IN ('pending', 'vendor_countered');
END;
$func$;

REVOKE ALL ON FUNCTION public.accept_bid(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_bid(uuid, uuid) TO authenticated;

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
  SELECT * INTO v_rider_row  FROM public.riders  WHERE id = v_bid.rider_id OR user_id = v_bid.rider_id;

  IF (v_vendor_row.user_id <> v_uid) AND (v_rider_row.user_id <> v_uid) AND (v_bid.rider_id <> v_uid) AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized to decline this bid';
  END IF;

  UPDATE public.bids SET status = 'rejected' WHERE id = p_bid_id;
END;
$func$;

REVOKE ALL ON FUNCTION public.decline_bid(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decline_bid(uuid) TO authenticated;

-- NAIJADROPS REPAIR & DEPLOYMENT PATCH
-- This script safely ensures all tables mentioned in the audit exist before applying final security policies.
-- RUN THIS IN YOUR SUPABASE SQL EDITOR.

-----------------------------------------------------------
-- 1. ENSURE WALLET TABLES EXIST (Phase 3 dependencies)
-----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    amount numeric NOT NULL,
    type text NOT NULL, -- 'earning', 'payout', 'refund'
    order_id uuid REFERENCES public.orders(id),
    description text
);

ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

-----------------------------------------------------------
-- 2. ENSURE NOTIFICATIONS EXIST
-----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    is_read boolean DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-----------------------------------------------------------
-- 3. ENSURE REVIEWS EXIST
-----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reviews (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
    driver_id uuid REFERENCES public.profiles(id) NOT NULL,
    user_id uuid REFERENCES public.profiles(id) NOT NULL,
    rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
    feedback text,
    UNIQUE(order_id, user_id)
);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-----------------------------------------------------------
-- 4. APPLY DEPLOYMENT SECURITY POLICIES
-----------------------------------------------------------

-- ADMIN ORDER ACCESS
DROP POLICY IF EXISTS "Admins can view all orders" ON public.orders;
CREATE POLICY "Admins can view all orders" ON public.orders FOR SELECT USING (public.check_is_admin());

DROP POLICY IF EXISTS "Admins can update all orders" ON public.orders;
CREATE POLICY "Admins can update all orders" ON public.orders FOR UPDATE USING (public.check_is_admin());

-- PEER PROFILE DISCOVERY
DROP POLICY IF EXISTS "Users can view profiles of their delivery partners" ON public.profiles;
CREATE POLICY "Users can view profiles of their delivery partners" ON public.profiles FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.orders 
    WHERE (orders.user_id = auth.uid() AND orders.driver_id = profiles.id) 
    OR (orders.driver_id = auth.uid() AND orders.user_id = profiles.id)
  )
);

-- ADMIN BID ACCESS
DROP POLICY IF EXISTS "Admins can view all bids" ON public.bids;
CREATE POLICY "Admins can view all bids" ON public.bids FOR SELECT USING (public.check_is_admin());

-- ADMIN LOCATION ACCESS
DROP POLICY IF EXISTS "Admins can view all driver locations" ON public.driver_locations;
CREATE POLICY "Admins can view all driver locations" ON public.driver_locations FOR SELECT USING (public.check_is_admin());

-- ADMIN WALLET ACCESS
DROP POLICY IF EXISTS "Admins can view all transactions" ON public.wallet_transactions;
CREATE POLICY "Admins can view all transactions" ON public.wallet_transactions FOR SELECT USING (public.check_is_admin());

-----------------------------------------------------------
-- 5. ENABLE REALTIME FOR EVERYTHING
-----------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE public.wallet_transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.reviews;
-- Ignore errors if they were already added to the publication

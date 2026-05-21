-- ============================================================================
-- NAIJADROPS: PATCH FOR DRIVER ONBOARDING & STATUS ENGINE
-- Run this entire script in your Supabase SQL Editor to fix the schema cache error!
-- ============================================================================

-- 1. Drop the old check constraint on 'status' if it exists
ALTER TABLE public.riders DROP CONSTRAINT IF EXISTS riders_status_check;

-- 2. Add onboarding & document columns directly to the 'riders' table
ALTER TABLE public.riders
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS id_card_url TEXT,
  ADD COLUMN IF NOT EXISTS license_url TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS profile_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS documents_submitted_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS operational_status TEXT DEFAULT 'offline';

-- 3. Add clean onboarding check constraint to 'status' column
ALTER TABLE public.riders 
  ADD CONSTRAINT riders_status_check CHECK (status IN ('pending', 'approved', 'paused', 'rejected', 'offline', 'online', 'busy'));

-- 4. Add clean operational status check constraint to 'operational_status' column
ALTER TABLE public.riders
  ADD CONSTRAINT riders_operational_status_check CHECK (operational_status IN ('offline', 'online', 'busy'));

-- 5. Create 'bids' table if it is missing (for rider counter-offers)
CREATE TABLE IF NOT EXISTS public.bids (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  rider_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount NUMERIC(10, 2) NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Enable RLS on 'bids'
ALTER TABLE public.bids ENABLE ROW LEVEL SECURITY;

-- 7. Add RLS Policies for 'bids'
DROP POLICY IF EXISTS "Riders can insert bids" ON public.bids;
CREATE POLICY "Riders can insert bids" ON public.bids 
  FOR INSERT WITH CHECK (auth.uid() = rider_id);

DROP POLICY IF EXISTS "Riders can view own bids" ON public.bids;
CREATE POLICY "Riders can view own bids" ON public.bids 
  FOR SELECT USING (auth.uid() = rider_id);

DROP POLICY IF EXISTS "Vendors can view bids for their orders" ON public.bids;
CREATE POLICY "Vendors can view bids for their orders" ON public.bids 
  FOR SELECT USING (
    auth.uid() IN (
      SELECT user_id FROM public.vendors WHERE id = (
        SELECT vendor_id FROM public.orders WHERE id = order_id
      )
    )
  );

DROP POLICY IF EXISTS "Vendors can update bid status" ON public.bids;
CREATE POLICY "Vendors can update bid status" ON public.bids 
  FOR UPDATE USING (
    auth.uid() IN (
      SELECT user_id FROM public.vendors WHERE id = (
        SELECT vendor_id FROM public.orders WHERE id = order_id
      )
    )
  );

-- 8. Force reload schema cache for PostgREST so the frontend registers the changes immediately
NOTIFY pgrst, 'reload schema';


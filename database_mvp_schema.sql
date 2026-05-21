-- =================================================================================
-- NAIJADROPS MVP DATABASE SCHEMA
-- This script creates the complete backend architecture for tight dispatch logistics.
-- =================================================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =================================================================================
-- TABLE DEFINITIONS
-- =================================================================================

-- 1. USERS (Base table syncing with auth.users)
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone TEXT UNIQUE,
  role TEXT CHECK (role IN ('vendor', 'rider', 'admin')),
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. VENDORS (Sub-profile for vendors)
CREATE TABLE public.vendors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE UNIQUE,
  business_name TEXT NOT NULL,
  default_pickup_lat DOUBLE PRECISION,
  default_pickup_lng DOUBLE PRECISION,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. RIDERS (Sub-profile for riders)
CREATE TABLE public.riders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE UNIQUE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paused', 'rejected')),
  operational_status TEXT DEFAULT 'offline' CHECK (operational_status IN ('offline', 'online', 'busy')),
  rating NUMERIC(3, 2) DEFAULT 0.00,
  total_deliveries INTEGER DEFAULT 0,
  full_name TEXT,
  phone TEXT,
  vehicle_type TEXT,
  plate_number TEXT,
  id_card_url TEXT,
  license_url TEXT,
  vehicle_photo_url TEXT,
  profile_photo_url TEXT,
  documents_submitted_at TIMESTAMPTZ,
  rejection_reason TEXT,
  approved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. DRIVER DOCUMENTS
CREATE TABLE public.driver_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rider_id UUID NOT NULL REFERENCES public.riders(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  file_url TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. ORDERS (The core logistics tracking)
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  rider_id UUID REFERENCES public.riders(id) ON DELETE SET NULL,
  pickup_lat DOUBLE PRECISION NOT NULL,
  pickup_lng DOUBLE PRECISION NOT NULL,
  dropoff_lat DOUBLE PRECISION NOT NULL,
  dropoff_lng DOUBLE PRECISION NOT NULL,
  recipient_name TEXT NOT NULL,
  recipient_phone TEXT NOT NULL,
  notes TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'arrived_pickup', 'picked_up', 'in_transit', 'delivered')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. RIDER LOCATIONS (Live tracking pings)
CREATE TABLE public.rider_locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rider_id UUID NOT NULL REFERENCES public.riders(id) ON DELETE CASCADE,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- 7. MESSAGES
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. EARNINGS
CREATE TABLE public.earnings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rider_id UUID NOT NULL REFERENCES public.riders(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  amount NUMERIC(10, 2) NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'available', 'paid')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. PAYOUTS
CREATE TABLE public.payouts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rider_id UUID NOT NULL REFERENCES public.riders(id) ON DELETE CASCADE,
  amount NUMERIC(10, 2) NOT NULL,
  status TEXT DEFAULT 'requested' CHECK (status IN ('requested', 'approved', 'paid')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. RATINGS
CREATE TABLE public.ratings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  rider_id UUID NOT NULL REFERENCES public.riders(id) ON DELETE CASCADE,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =================================================================================
-- TRIGGERS & FUNCTIONS
-- =================================================================================

-- Auto update orders.updated_at
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_orders_modtime
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- Auto Sync with auth.users (Optional, if mapping happens on SignUp via metadata)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, phone, role, name)
  VALUES (
    NEW.id,
    NEW.phone,
    NEW.raw_user_meta_data->>'role',
    NEW.raw_user_meta_data->>'name'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- =================================================================================
-- REALTIME SETUP
-- =================================================================================

-- Set Replica Identity so realtime broadcasts send full old/new rows
ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.rider_locations REPLICA IDENTITY FULL;
ALTER TABLE public.messages REPLICA IDENTITY FULL;

-- Enable Realtime Publication
BEGIN;
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime FOR TABLE public.orders, public.rider_locations, public.messages;
COMMIT;

-- =================================================================================
-- ROW LEVEL SECURITY (RLS) Configuration
-- =================================================================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.riders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rider_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.earnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;

-- 1. Users policies
CREATE POLICY "Users can view own profile" ON public.users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can edit own profile" ON public.users FOR UPDATE USING (auth.uid() = id);

-- 2. Vendors policies
CREATE POLICY "Vendors view own" ON public.vendors FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Vendors update own" ON public.vendors FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Vendors insert own" ON public.vendors FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 3. Riders policies
CREATE POLICY "Riders view own" ON public.riders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Riders update own" ON public.riders FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Riders insert own" ON public.riders FOR INSERT WITH CHECK (auth.uid() = user_id);
-- Any authenticated user can view a rider's public data (for tracking pages/vendor matching)
CREATE POLICY "Public read riders" ON public.riders FOR SELECT USING (auth.role() = 'authenticated' OR auth.role() = 'anon');

-- 4. Orders policies
CREATE POLICY "Vendors see own orders" ON public.orders FOR SELECT USING (auth.uid() IN (SELECT user_id FROM public.vendors WHERE id = vendor_id));
CREATE POLICY "Vendors create orders" ON public.orders FOR INSERT WITH CHECK (auth.uid() IN (SELECT user_id FROM public.vendors WHERE id = vendor_id));

CREATE POLICY "Riders see assigned or pending" ON public.orders FOR SELECT USING (
  status = 'pending' OR 
  auth.uid() IN (SELECT user_id FROM public.riders WHERE id = rider_id)
);
CREATE POLICY "Riders update assigned orders" ON public.orders FOR UPDATE USING (
  status = 'pending' OR 
  auth.uid() IN (SELECT user_id FROM public.riders WHERE id = rider_id)
);
-- Anon access for tracking links using exact Order UUID
CREATE POLICY "Public tracking read" ON public.orders FOR SELECT USING (true);

-- 5. Rider Locations
CREATE POLICY "Riders push location" ON public.rider_locations FOR INSERT WITH CHECK (auth.uid() IN (SELECT user_id FROM public.riders WHERE id = rider_id));
CREATE POLICY "Public read location" ON public.rider_locations FOR SELECT USING (true); -- Filtered down on frontend via order_id->rider_id

-- 6. Messages
CREATE POLICY "Participants see messages" ON public.messages FOR SELECT USING (true);
CREATE POLICY "Participants send messages" ON public.messages FOR INSERT WITH CHECK (auth.uid() = sender_id);

-- 7. Earnings & Payouts 
CREATE POLICY "Riders view own earnings" ON public.earnings FOR SELECT USING (auth.uid() IN (SELECT user_id FROM public.riders WHERE id = rider_id));
CREATE POLICY "Riders view own payouts" ON public.payouts FOR SELECT USING (auth.uid() IN (SELECT user_id FROM public.riders WHERE id = rider_id));
CREATE POLICY "Riders create payouts" ON public.payouts FOR INSERT WITH CHECK (auth.uid() IN (SELECT user_id FROM public.riders WHERE id = rider_id));

-- Admin Note: Admins connect using the Supabase Service Role Key which totally bypasses RLS, so no dedicated admin policies are required here.

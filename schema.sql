-- NaijaDrops Database Schema (Current Live State)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Users Table
CREATE TABLE public.users (
  id uuid PRIMARY KEY,
  email text,
  phone text,
  role text, -- 'vendor', 'rider', 'admin', 'super_admin'
  name text,
  full_name text,
  avatar_url text,
  active_mode text DEFAULT 'vendor'::text,
  is_active boolean DEFAULT true,
  is_super_admin boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

-- 2. Vendors Table
CREATE TABLE public.vendors (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  business_name text,
  default_pickup_lat double precision,
  default_pickup_lng double precision,
  created_at timestamp with time zone DEFAULT now()
);

-- 3. Riders Table
CREATE TABLE public.riders (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  full_name text,
  phone text,
  vehicle_type text, -- 'bike', 'car'
  plate_number text,
  approved boolean DEFAULT false,
  status text DEFAULT 'offline'::text,
  operational_status text DEFAULT 'offline'::text,
  rating numeric DEFAULT 0.00,
  total_deliveries integer DEFAULT 0,
  orders_completed_today integer DEFAULT 0,
  acceptance_rate numeric DEFAULT 100.0,
  is_active boolean DEFAULT true,
  current_lat double precision,
  current_lng double precision,
  last_seen_at timestamp with time zone,
  profile_photo_url text,
  id_card_url text,
  license_url text,
  vehicle_photo_url text,
  documents_submitted_at timestamp with time zone,
  rejection_reason text,
  created_at timestamp with time zone DEFAULT now()
);

-- 4. Orders Table
CREATE TABLE public.orders (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE CASCADE,
  rider_id uuid REFERENCES public.riders(id) ON DELETE SET NULL,
  pickup_name text,
  pickup_lat double precision,
  pickup_lng double precision,
  dropoff_name text,
  dropoff_lat double precision,
  dropoff_lng double precision,
  recipient_name text,
  recipient_phone text,
  item_category text,
  item_size text,
  item_description text,
  vehicle_type text DEFAULT 'bike'::text,
  agreed_price numeric,
  delivery_pin text,
  status text DEFAULT 'pending'::text, -- 'pending', 'matched', 'assigned', 'picked_up', 'delivered', 'cancelled'
  payment_status text DEFAULT 'pending'::text, -- 'pending', 'paid'
  locked boolean DEFAULT false,
  notify_receiver boolean DEFAULT true,
  voice_note_url text,
  broadcast_radius_km numeric DEFAULT 1.5,
  max_broadcast_radius_km numeric DEFAULT 8,
  broadcast_last_expanded_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- 5. Order Broadcasts Table
CREATE TABLE public.order_broadcasts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  rider_id uuid REFERENCES public.riders(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(order_id, rider_id)
);

-- 6. Bids Table
CREATE TABLE public.bids (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  rider_id uuid REFERENCES public.riders(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  status text DEFAULT 'pending'::text, -- 'pending', 'accepted', 'rejected'
  created_at timestamp with time zone DEFAULT now()
);

-- 7. Messages Table
CREATE TABLE public.messages (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  message text,
  text text,
  type text DEFAULT 'text'::text,
  created_at timestamp with time zone DEFAULT now()
);

-- 8. Rider Locations (History) Table
CREATE TABLE public.rider_locations (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  rider_id uuid REFERENCES public.riders(id) ON DELETE CASCADE,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  timestamp timestamp with time zone DEFAULT now()
);

-- 9. Wallet Transactions Table
CREATE TABLE public.wallet_transactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  rider_id uuid REFERENCES public.riders(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  type text NOT NULL, -- 'credit', 'debit'
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- 10. Reviews Table
CREATE TABLE public.reviews (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  driver_id uuid REFERENCES public.riders(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  rating integer NOT NULL,
  feedback text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- 11. Documents Table
CREATE TABLE public.documents (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  document_type text NOT NULL,
  file_url text NOT NULL,
  verification_status text DEFAULT 'pending'::text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- 12. Resolved Links Table
CREATE TABLE public.resolved_links (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  original_url text NOT NULL,
  resolved_url text NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- 13. Admin Action Logs Table
CREATE TABLE public.admin_action_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  target_type text,
  target_id text,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

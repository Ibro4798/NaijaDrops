-- 0. Storage Setup (Manual Step in Supabase Dashboard)
-- Create a public bucket named 'documents'
-- Allow public read access (or restricted based on your security needs)
-- Allow authenticated users to upload to 'driver-docs/' folder

-- 1. Create Profiles Table (Linked to Auth)
create table public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  full_name text,
  phone text,
  role text default 'user' check (role in ('user', 'driver', 'admin')),
  is_verified boolean default false,
  vehicle_type text,
  plate_number text,
  whatsapp_number text,
  driver_status text default 'pending',
  admin_notes text,
  email text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Turn on Row Level Security
alter table public.profiles enable row level security;

-- Create a trigger to automatically create a profile when a new user signs up
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, phone, email, role)
  values (
    new.id, 
    new.raw_user_meta_data->>'full_name', 
    new.raw_user_meta_data->>'phone', 
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'user')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Create a function to check if the current user is an admin WITHOUT recursion
create or replace function public.check_is_admin()
returns boolean as $$
begin
  return exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
end;
$$ language plpgsql security definer;

-- Profiles Policies
create policy "Users can view their own profile" on profiles for select using (auth.uid() = id);
create policy "Users can update their own profile" on profiles for update using (auth.uid() = id);
create policy "Admins can view all profiles" on profiles for select using (public.check_is_admin());
create policy "Admins can update all profiles" on profiles for update using (public.check_is_admin());
create policy "Admins can delete profiles" on profiles for delete using (public.check_is_admin());


-- 2. Create Orders Table
create table public.orders (
    id uuid default gen_random_uuid() primary key,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    user_id uuid references public.profiles(id) not null,
    driver_id uuid references public.profiles(id),
    status text default 'looking_for_driver', -- looking_for_driver, accepted, picked_up, arriving, delivered
    pickup_name text not null,
    pickup_lat double precision not null,
    pickup_lng double precision not null,
    dropoff_name text not null,
    dropoff_lat double precision not null,
    dropoff_lng double precision not null,
    item_category text,
    item_size text,
    receiver_name text,
    receiver_phone text,
    fare_type text not null, -- standard, express, offer
    agreed_price numeric not null,
    delivery_pin text default '1234',
    delivery_photo_url text,
    voice_note_url text,
    pickup_details text,
    dropoff_details text,
    completed_at timestamp with time zone,
    paid_at timestamp with time zone
);

alter table public.orders enable row level security;

-- Order Policies
create policy "Users can view their own orders" on orders for select using (auth.uid() = user_id);
create policy "Drivers can view orders they accepted" on orders for select using (auth.uid() = driver_id);
create policy "Drivers can view all open orders" on orders for select using (status = 'looking_for_driver');
create policy "Users can create orders" on orders for insert with check (auth.uid() = user_id);
create policy "Users can update their open orders" on orders for update using (auth.uid() = user_id);
create policy "Drivers can update open orders it accepted" on orders for update using (auth.uid() = driver_id);


-- 3. Create Bids Table (For the Negotiation System)
create table public.bids (
    id uuid default gen_random_uuid() primary key,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    order_id uuid references public.orders(id) on delete cascade not null,
    driver_id uuid references public.profiles(id) not null,
    amount numeric not null,
    status text default 'pending' check (status in ('pending', 'accepted', 'rejected'))
);

alter table public.bids enable row level security;

-- Bids Policies
create policy "Users can view bids on their orders" on bids for select using (
    exists (select 1 from public.orders where orders.id = bids.order_id and orders.user_id = auth.uid())
);
create policy "Drivers can view their own bids" on bids for select using (auth.uid() = driver_id);
create policy "Drivers can create bids" on bids for insert with check (auth.uid() = driver_id);
create policy "Users can update bids on their orders (accept/reject)" on bids for update using (
    exists (select 1 from public.orders where orders.id = bids.order_id and orders.user_id = auth.uid())
);


-- 4. Create Driver Locations Table (High Frequency GPS Broadcasting)
create table public.driver_locations (
    driver_id uuid references public.profiles(id) primary key,
    lat double precision not null,
    lng double precision not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.driver_locations enable row level security;

-- Driver Locations Logistical Policies (Meeting the Security Requirement)
-- Drivers can insert/update their own location
create policy "Drivers can insert their own location" on driver_locations for insert with check (auth.uid() = driver_id);
create policy "Drivers can update their own location" on driver_locations for update using (auth.uid() = driver_id);

-- Users can ONLY see a driver's location IF that driver is delivering an active order for them
create policy "Users can view active delivery driver location" on driver_locations for select using (
    exists (
        select 1 from public.orders
        where orders.driver_id = driver_locations.driver_id
        and orders.user_id = auth.uid()
        and orders.status in ('accepted', 'picked_up', 'arriving')
    )
);

-- ==========================================
-- Enable Real-Time Functionality
-- ==========================================
-- By default, Realtime is disabled on tables. We must turn it on for specific tables we want to listen to via subscriptions.

alter publication supabase_realtime add table public.bids;
alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.driver_locations;
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.profiles;
alter publication supabase_realtime add table public.driver_documents;

-- 5. Create Messages Table (For Order Chat)
create table public.messages (
    id uuid default gen_random_uuid() primary key,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    order_id uuid references public.orders(id) on delete cascade not null,
    sender_id uuid references public.profiles(id) not null,
    text text not null
);

alter table public.messages enable row level security;

-- Messages Policies
create policy "Users can view messages for their orders" on messages for select using (
    exists (select 1 from public.orders where orders.id = messages.order_id and (orders.user_id = auth.uid() or orders.driver_id = auth.uid()))
);
create policy "Users can send messages for their orders" on messages for insert with check (
    exists (select 1 from public.orders where orders.id = messages.order_id and (orders.user_id = auth.uid() or orders.driver_id = auth.uid()))
);

-- 6. Create Driver Documents Table
create table public.driver_documents (
    id uuid default gen_random_uuid() primary key,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    driver_id uuid references public.profiles(id) on delete cascade not null,
    doc_type text not null, -- 'id_card', 'license'
    file_url text not null,
    status text default 'pending' check (status in ('pending', 'approved', 'rejected')),
    rejection_reason text,
    unique(driver_id, doc_type)
);

alter table public.driver_documents enable row level security;

-- Driver Documents Policies
create policy "Drivers can view their own documents" on driver_documents for select using (auth.uid() = driver_id);
create policy "Drivers can upload their own documents" on driver_documents for insert with check (auth.uid() = driver_id);
create policy "Admins can view all driver documents" on driver_documents for select using (public.check_is_admin());
create policy "Admins can update driver document status" on driver_documents for update using (public.check_is_admin());
create policy "Admins can delete driver documents" on driver_documents for delete using (public.check_is_admin());

-- 7. Create Saved Locations Table
create table public.saved_locations (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references public.profiles(id) on delete cascade not null,
    name text not null, -- 'Home', 'Office'
    address text not null,
    lat double precision not null,
    lng double precision not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.saved_locations enable row level security;
create policy "Users can manage their saved locations" on saved_locations 
    using (auth.uid() = user_id) 
    with check (auth.uid() = user_id);

-- 8. Create Wallet Transactions Table
create table public.wallet_transactions (
    id uuid default gen_random_uuid() primary key,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    profile_id uuid references public.profiles(id) on delete cascade not null,
    amount numeric not null,
    type text not null, -- 'earning', 'payout', 'refund'
    order_id uuid references public.orders(id),
    description text
);

alter table public.wallet_transactions enable row level security;
create policy "Users can view their own transactions" on wallet_transactions for select using (auth.uid() = profile_id);

-- 9. Create Notifications Table
create table public.notifications (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references public.profiles(id) on delete cascade not null,
    title text not null,
    message text not null,
    is_read boolean default false,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.notifications enable row level security;
create policy "Users can view their own notifications" on notifications for select using (auth.uid() = user_id);
create policy "Users can update their own notifications" on notifications for update using (auth.uid() = user_id);

-- ==========================================
-- Final Real-Time Additions
-- ==========================================
alter publication supabase_realtime add table public.wallet_transactions;
alter publication supabase_realtime add table public.notifications;




-- 10. Create Reviews Table
create table public.reviews (
    id uuid default gen_random_uuid() primary key,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    order_id uuid references public.orders(id) on delete cascade not null,
    driver_id uuid references public.profiles(id) not null,
    user_id uuid references public.profiles(id) not null,
    rating integer not null check (rating >= 1 and rating <= 5),
    feedback text,
    unique(order_id, user_id)
);

alter table public.reviews enable row level security;

create policy "Users can read all reviews" on reviews for select using (true);
create policy "Users can insert reviews for their assigned drivers" on reviews for insert with check (
    auth.uid() = user_id and 
    exists (
        select 1 from public.orders 
        where orders.id = reviews.order_id 
        and orders.user_id = auth.uid() 
        and orders.driver_id = reviews.driver_id
        and orders.status = 'delivered'
    )
);
create policy "Users can update their own reviews" on reviews for update using (auth.uid() = user_id);

create or replace function public.get_driver_stats(d_id uuid)
returns table(avg_rating numeric, total_trips bigint) as $$
begin
    return query
    select 
        coalesce(round(avg(rating)::numeric, 1), 5.0) as avg_rating,
        (select count(*) from orders where driver_id = d_id and status = 'delivered') as total_trips
    from reviews
    where driver_id = d_id;
end;
$$ language plpgsql security definer;

-- 11. Add Scheduled Delivery Support
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMP WITH TIME ZONE;

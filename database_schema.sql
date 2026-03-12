-- 1. Create Profiles Table (Linked to Auth)
create table public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  full_name text,
  phone text,
  role text default 'user' check (role in ('user', 'driver', 'admin')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Turn on Row Level Security
alter table public.profiles enable row level security;

-- Create a trigger to automatically create a profile when a new user signs up
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, phone, role)
  values (
    new.id, 
    new.raw_user_meta_data->>'full_name', 
    new.raw_user_meta_data->>'phone', 
    coalesce(new.raw_user_meta_data->>'role', 'user')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Profiles Policies
create policy "Users can view their own profile" on profiles for select using (auth.uid() = id);
create policy "Users can update their own profile" on profiles for update using (auth.uid() = id);


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
    agreed_price numeric not null
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

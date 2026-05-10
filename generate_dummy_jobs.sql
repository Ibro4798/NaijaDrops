-- ============================================================================
-- NAIJADROPS DUMMY DATA GENERATOR: LIVE DISPATCH & DRIVER JOBS
-- ============================================================================

-- This script generates dummy active orders (jobs) in Kano to test the driver
-- dispatch feed, negotiation flows, and ops-terminal visualizations.

DO $$
DECLARE
    vendor_uuid UUID;
BEGIN
    -- 1. Create a dummy vendor to own these orders if one doesn't exist
    -- We will try to find an existing vendor first
    SELECT id INTO vendor_uuid FROM public.users WHERE email = 'dummyvendor@naijadrops.tech' LIMIT 1;
    
    IF vendor_uuid IS NULL THEN
        vendor_uuid := gen_random_uuid();
        
        -- Insert into users
        INSERT INTO public.users (id, email, full_name, active_mode)
        VALUES (vendor_uuid, 'dummyvendor@naijadrops.tech', 'Kano Super Merchant', 'vendor');
        
        -- Insert into vendors
        INSERT INTO public.vendors (id, user_id, business_name, is_verified)
        VALUES (gen_random_uuid(), vendor_uuid, 'Kano Super Merchant Enterprise', true);
    END IF;

    -- 2. Generate Dummy Orders in 'pending' (Looking for Driver) status
    -- These will appear on the Driver Dashboard's Live Dispatch Feed
    
    -- Order 1: Central Kano (Sabon Gari to GRA)
    INSERT INTO public.orders (
        id, vendor_id, status, pickup_name, pickup_lat, pickup_lng, 
        dropoff_name, dropoff_lat, dropoff_lng, agreed_price, 
        item_category, created_at, updated_at
    ) VALUES (
        gen_random_uuid(), (SELECT id FROM public.vendors WHERE user_id = vendor_uuid LIMIT 1),
        'pending', 'Sabon Gari Market', 12.0150, 8.5300, 
        'Nassarawa GRA', 11.9800, 8.5450, 2500, 
        'Electronics', NOW(), NOW()
    );

    -- Order 2: Dala to Tarauni
    INSERT INTO public.orders (
        id, vendor_id, status, pickup_name, pickup_lat, pickup_lng, 
        dropoff_name, dropoff_lat, dropoff_lng, agreed_price, 
        item_category, created_at, updated_at
    ) VALUES (
        gen_random_uuid(), (SELECT id FROM public.vendors WHERE user_id = vendor_uuid LIMIT 1),
        'pending', 'Dala Hill Area', 12.0100, 8.5100, 
        'Tarauni Market', 11.9700, 8.5350, 1500, 
        'Foodstuff', NOW() - INTERVAL '5 minutes', NOW() - INTERVAL '5 minutes'
    );

    -- Order 3: Bompai to Fagge
    INSERT INTO public.orders (
        id, vendor_id, status, pickup_name, pickup_lat, pickup_lng, 
        dropoff_name, dropoff_lat, dropoff_lng, agreed_price, 
        item_category, created_at, updated_at
    ) VALUES (
        gen_random_uuid(), (SELECT id FROM public.vendors WHERE user_id = vendor_uuid LIMIT 1),
        'pending', 'Bompai Industrial Estate', 11.9950, 8.5500, 
        'Fagge Mosque', 12.0050, 8.5200, 3200, 
        'Documents', NOW() - INTERVAL '15 minutes', NOW() - INTERVAL '15 minutes'
    );

    -- Order 4: High Value (Requires Negotiation / Attention)
    INSERT INTO public.orders (
        id, vendor_id, status, pickup_name, pickup_lat, pickup_lng, 
        dropoff_name, dropoff_lat, dropoff_lng, agreed_price, 
        item_category, created_at, updated_at
    ) VALUES (
        gen_random_uuid(), (SELECT id FROM public.vendors WHERE user_id = vendor_uuid LIMIT 1),
        'pending', 'Kano State Secretariat', 11.9850, 8.5250, 
        'Aminu Kano Airport', 12.0450, 8.5200, 8500, 
        'Fragile / Valuables', NOW() - INTERVAL '2 minutes', NOW() - INTERVAL '2 minutes'
    );
    
    -- Order 5: Already assigned (to test Ops-Terminal active traffic)
    INSERT INTO public.orders (
        id, vendor_id, status, pickup_name, pickup_lat, pickup_lng, 
        dropoff_name, dropoff_lat, dropoff_lng, agreed_price, 
        item_category, created_at, updated_at,
        payment_status
    ) VALUES (
        gen_random_uuid(), (SELECT id FROM public.vendors WHERE user_id = vendor_uuid LIMIT 1),
        'in_transit', 'Kurmi Market', 11.9950, 8.5150, 
        'Zoo Road', 11.9650, 8.5250, 2000, 
        'Clothing', NOW() - INTERVAL '30 minutes', NOW() - INTERVAL '10 minutes',
        'authorized'
    );

END $$;

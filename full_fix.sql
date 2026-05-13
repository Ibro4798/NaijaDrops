-- ============================================================================
-- NAIJADROPS: FULL FIX SCRIPT
-- Run this entire block in your Supabase SQL Editor
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────
-- FIX 1: Grant yahaya.usama@naijadrops.tech the 'admin' role
-- ─────────────────────────────────────────────────────────────────
INSERT INTO public.admin_users (id, email, role, is_active)
SELECT 
    au.id,
    au.email,
    'admin',
    true
FROM auth.users au
WHERE au.email = 'yahaya.usama@naijadrops.tech'
ON CONFLICT (id) DO UPDATE SET 
    role = 'admin',
    is_active = true;


-- ─────────────────────────────────────────────────────────────────
-- FIX 2: Kill the infinite recursion on admin_users RLS policies
-- Replace self-referencing policies with JWT-based checks
-- ─────────────────────────────────────────────────────────────────
-- Drop all existing policies on the table first
DROP POLICY IF EXISTS "Admins can read admin_users" ON public.admin_users;
DROP POLICY IF EXISTS "Admins can update admin_users" ON public.admin_users;
DROP POLICY IF EXISTS "Admins can insert admin_users" ON public.admin_users;
DROP POLICY IF EXISTS "Admins read admin_users" ON public.admin_users;
DROP POLICY IF EXISTS "Admins update admin_users" ON public.admin_users;
DROP POLICY IF EXISTS "Admins insert admin_users" ON public.admin_users;
DROP POLICY IF EXISTS "Admins manage admin_users" ON public.admin_users;

-- Now create clean, non-recursive JWT-based policies
CREATE POLICY "admin_users_select" ON public.admin_users
FOR SELECT USING ((auth.jwt()->>'email') LIKE '%@naijadrops.tech');

CREATE POLICY "admin_users_insert" ON public.admin_users
FOR INSERT WITH CHECK ((auth.jwt()->>'email') LIKE '%@naijadrops.tech');

CREATE POLICY "admin_users_update" ON public.admin_users
FOR UPDATE USING ((auth.jwt()->>'email') LIKE '%@naijadrops.tech');


-- ─────────────────────────────────────────────────────────────────
-- FIX 3: Allow admins to UPDATE riders via RLS
-- The admin uses the service role key which bypasses RLS,
-- but the regular Supabase client still needs a policy.
-- ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins update riders" ON public.riders;
DROP POLICY IF EXISTS "Admins can approve riders" ON public.riders;

CREATE POLICY "admins_update_riders" ON public.riders
FOR UPDATE USING ((auth.jwt()->>'email') LIKE '%@naijadrops.tech');


-- ─────────────────────────────────────────────────────────────────
-- FIX 4: Auto-approval trigger for admin-invited drivers
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
    assigned_role TEXT;
    assigned_name TEXT;
BEGIN
    assigned_role := COALESCE(NEW.raw_user_meta_data->>'role', 'user');
    assigned_name := COALESCE(
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'name',
        split_part(NEW.email, '@', 1)
    );

    -- 1. Create public.users record
    INSERT INTO public.users (id, email, role, full_name)
    VALUES (NEW.id, NEW.email, assigned_role, assigned_name)
    ON CONFLICT (id) DO UPDATE SET
        role = EXCLUDED.role,
        full_name = EXCLUDED.full_name;

    -- 2. Auto-approve rider
    IF assigned_role = 'rider' THEN
        INSERT INTO public.riders (user_id, status, approved, vehicle_type)
        VALUES (
            NEW.id,
            'offline',
            true,
            COALESCE(NEW.raw_user_meta_data->>'vehicle_type', 'bike')
        )
        ON CONFLICT (user_id) DO UPDATE SET approved = true;
    END IF;

    -- 3. Auto-activate admin
    IF assigned_role = 'admin' THEN
        INSERT INTO public.admin_users (id, email, role, is_active)
        VALUES (NEW.id, NEW.email, 'admin', true)
        ON CONFLICT (id) DO UPDATE SET is_active = true;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Reattach trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Fix Infinite Recursion in admin_users Policy
BEGIN;

-- Drop the recursive policies
DROP POLICY IF EXISTS "Admins can read admin_users" ON public.admin_users;
DROP POLICY IF EXISTS "Admins can update admin_users" ON public.admin_users;
DROP POLICY IF EXISTS "Admins can insert admin_users" ON public.admin_users;

-- Create non-recursive policies:
-- 1. Admins can read all admin users (without querying the table recursively in the USING clause)
-- We can check the auth.users table or just check the email domain directly since it's in the JWT
CREATE POLICY "Admins read admin_users" ON public.admin_users
FOR SELECT USING ((auth.jwt()->>'email')::text LIKE '%@naijadrops.tech');

-- 2. Admins can insert/update other admins using the JWT email domain check
CREATE POLICY "Admins update admin_users" ON public.admin_users
FOR UPDATE USING ((auth.jwt()->>'email')::text LIKE '%@naijadrops.tech');

CREATE POLICY "Admins insert admin_users" ON public.admin_users
FOR INSERT WITH CHECK ((auth.jwt()->>'email')::text LIKE '%@naijadrops.tech');

COMMIT;

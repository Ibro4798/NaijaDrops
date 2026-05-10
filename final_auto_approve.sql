-- ============================================================================
-- AUTOMATED INVITATION & APPROVAL TRIGGER
-- ============================================================================
-- This trigger automatically intercepts any new user created (via invite or signup).
-- If their metadata specifies they are a 'rider', it instantly approves them.
-- If they are an 'admin', it instantly activates them.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
    assigned_role TEXT;
    assigned_name TEXT;
BEGIN
    -- Extract role and name from metadata, defaulting if missing
    assigned_role := COALESCE(NEW.raw_user_meta_data->>'role', 'user');
    assigned_name := COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', 'Unknown Node');

    -- 1. Create the base public user record
    INSERT INTO public.users (id, email, phone, role, full_name)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.phone,
        assigned_role,
        assigned_name
    )
    ON CONFLICT (id) DO UPDATE SET 
        role = EXCLUDED.role,
        full_name = EXCLUDED.full_name;

    -- 2. If it's a Rider, automatically insert them as APPROVED and OFFLINE
    IF assigned_role = 'rider' THEN
        INSERT INTO public.riders (user_id, status, approved, vehicle_type)
        VALUES (
            NEW.id,
            'offline', -- Ready but not active on the radar yet
            true,      -- Bypasses the manual admin verification step
            COALESCE(NEW.raw_user_meta_data->>'vehicle_type', 'bike')
        )
        ON CONFLICT (user_id) DO UPDATE SET 
            approved = true;
    END IF;

    -- 3. If it's an Admin, automatically insert them into admin_users
    IF assigned_role = 'admin' THEN
        INSERT INTO public.admin_users (id, email, role, is_active)
        VALUES (
            NEW.id,
            NEW.email,
            'admin',
            true
        )
        ON CONFLICT (id) DO UPDATE SET 
            is_active = true;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure the trigger is attached to auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Note on Emails:
-- SQL itself cannot trigger external SMTP network requests. To ensure the 
-- verification/invite email is sent, your backend MUST use the Supabase Auth API:
-- `supabase.auth.admin.inviteUserByEmail(email)`
-- This automatically generates the token and sends the email prompting for a password.

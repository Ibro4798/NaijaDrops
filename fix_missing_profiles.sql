-- ============================================================================
-- NaijaDrops: Fix Missing Profiles
-- ============================================================================
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- This backfills a profile row for any auth.users account that is missing one.
-- Safe to run multiple times (uses ON CONFLICT DO NOTHING).
-- ============================================================================

INSERT INTO public.profiles (id, email, full_name, role, is_verified)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1), 'User') AS full_name,
  COALESCE(u.raw_user_meta_data->>'role', 'user') AS role,
  false AS is_verified
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Verify: Check how many users still have no profile (should be 0 after running)
-- ============================================================================
SELECT COUNT(*) AS users_missing_profile
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

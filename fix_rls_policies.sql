-- ============================================================================
-- FIX: Missing Profiles INSERT RLS Policy
-- ============================================================================
-- The profiles table requires an INSERT policy so the application can 
-- self-heal and create user profiles locally if the database signup trigger 
-- ever fails or is delayed. Without this, silent API errors cause FOREIGN KEY 
-- drops downstream (Orders table).
--
-- RUN THIS IN SUPABASE SQL EDITOR
-- ============================================================================

-- Safely drop if it exists to avoid conflicts
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;

-- Create policy allowing users to insert their *own* row and no one else's
CREATE POLICY "Users can insert their own profile" 
ON public.profiles 
FOR INSERT 
WITH CHECK (auth.uid() = id);

-- Confirm it was applied successfully:
SELECT policyname, permissive, roles, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename = 'profiles' AND cmd = 'INSERT';

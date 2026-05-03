const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function findTargetUser() {
  const targetEmail = "ibroibrahim665@gmail.com";
  console.log(`🔍 Searching for account: ${targetEmail}...`);

  const { data: users, error } = await supabase.auth.admin.listUsers();
  
  if (error || !users) {
    console.error("❌ Could not connect to Auth system.");
    return;
  }

  const user = users.users.find(u => u.email === targetEmail);

  if (!user) {
    console.log(`❌ Could not find an account with email ${targetEmail}. Please make sure you have signed up with it!`);
    return;
  }

  console.log(`✅ Found the account! Here is your exact User ID: ${user.id}`);
  console.log(`\n======================================================`);
  console.log(`To bypass the error, copy and paste this EXACT code into your Supabase SQL Editor:`);
  console.log(`======================================================\n`);
  
  console.log(`-- 1. Create the table if it doesn't exist`);
  console.log(`CREATE TABLE IF NOT EXISTS public.admin_users (`);
  console.log(`  id UUID PRIMARY KEY REFERENCES auth.users(id),`);
  console.log(`  email TEXT,`);
  console.log(`  role TEXT DEFAULT 'super_admin',`);
  console.log(`  is_active BOOLEAN DEFAULT true`);
  console.log(`);`);
  console.log(``);
  console.log(`-- 2. Insert your account`);
  console.log(`INSERT INTO public.admin_users (id, email, role, is_active)`);
  console.log(`VALUES ('${user.id}', '${user.email}', 'super_admin', true)`);
  console.log(`ON CONFLICT (id) DO UPDATE SET is_active = true, role = 'super_admin';`);
  
  console.log(`\n======================================================`);
  console.log(`Click "Run" in Supabase, and you will instantly be the Admin!`);
}

findTargetUser();

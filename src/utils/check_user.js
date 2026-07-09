import { createClient } from '@supabase/supabase-js';

// INSTRUCTIONS:
// Run this script locally using 'node src/utils/check_user.js'
// and replace the email below with the driver's email that is experiencing issues.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Requires service role for admin checks if email is used

if (!supabaseUrl || !supabaseKey) {
  console.log("Error: Please ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in your environment.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkUserStatus(email) {
  console.log(`\nðŸ”  Checking status for: ${email}\n`);

  try {
    // 1. Check inside Users (Unified)
    const { data: user } = await supabase.from('users').select('*').eq('email', email).maybeSingle();
    console.log(`[Unified Users Table]: ${user ? '✅ Found (ID: ' + user.id + ', Role: ' + user.role + ')' : 'â Œ Not Found'}`);

    if (user) {
      if (user.role === 'admin' || user.role === 'super_admin') {
        console.log(`\n✨ Redirection Priority: Ops Terminal (Admin)`);
      } else if (user.role === 'rider') {
        const { data: rider } = await supabase.from('riders').select('*').eq('user_id', user.id).maybeSingle();
        console.log(`[Riders Sub-Profile]: ${rider ? '✅ Found (ID: ' + rider.id + ')' : 'â Œ Not Found'}`);
        console.log(`\n✨ Redirection Priority: Rider Dashboard`);
      } else if (user.role === 'vendor') {
        const { data: vendor } = await supabase.from('vendors').select('*').eq('user_id', user.id).maybeSingle();
        console.log(`[Vendors Sub-Profile]: ${vendor ? '✅ Found (ID: ' + vendor.id + ')' : 'â Œ Not Found'}`);
        console.log(`\n✨ Redirection Priority: Vendor Dashboard`);
      } else {
        console.log(`\n⚠️  Warning: User has an unknown role: ${user.role}`);
      }
    } else {
      console.log(`\n⚠️  Warning: User not found in the system.`);
    }

  } catch (err) {
    console.error("Diagnostic error:", err.message);
  }
}

// Replace with target email
const targetEmail = process.argv[2] || 'test@example.com';
checkUserStatus(targetEmail);

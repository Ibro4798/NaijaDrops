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
  console.log(`\nðŸ” Checking status for: ${email}\n`);

  try {
    // 1. Check inside Admins
    const { data: admin } = await supabase.from('admins').select('*').eq('email', email).maybeSingle();
    console.log(`[Admin Table]: ${admin ? 'âœ… Found (ID: ' + admin.id + ')' : 'âŒ Not Found'}`);

    // 2. Check inside Drivers
    const { data: driver } = await supabase.from('drivers').select('*').eq('email', email).maybeSingle();
    console.log(`[Driver Table]: ${driver ? 'âœ… Found (ID: ' + driver.id + ')' : 'âŒ Not Found'}`);

    // 3. Check inside Customers
    const { data: customer } = await supabase.from('customers').select('*').eq('email', email).maybeSingle();
    console.log(`[Customer Table]: ${customer ? 'âœ… Found (ID: ' + customer.id + ')' : 'âŒ Not Found'}`);

    if (!admin && !driver && !customer) {
      console.log(`\nâš ï¸ Warning: User not found in any role table. Redirection will default to Customer.`);
    } else {
      console.log(`\nâœ¨ Redirection Priority: ${admin ? 'Admin Dashboard' : driver ? 'Driver Console' : 'Customer Shop'}`);
    }

  } catch (err) {
    console.error("Diagnostic error:", err.message);
  }
}

// Replace with target email
const targetEmail = process.argv[2] || 'test@example.com';
checkUserStatus(targetEmail);

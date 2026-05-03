const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifySchema() {
  console.log("=========================================");
  console.log("🕵️  NAIJADROPS SYSTEM DIAGNOSTIC");
  console.log("=========================================\n");

  let allGood = true;

  // 1. Check users table
  console.log("1. Checking 'users' table...");
  const { error: err1 } = await supabase.from('users').select('id, name, email, phone').limit(1);
  if (err1) {
    console.error("   ❌ ERROR: 'users' table missing or incorrect structure.");
    console.error("      " + err1.message);
    allGood = false;
  } else {
    console.log("   ✅ 'users' table is correctly formatted.");
  }

  // 2. Check riders table
  console.log("\n2. Checking 'riders' table...");
  const { error: err2 } = await supabase.from('riders').select('id, status, operational_status').limit(1);
  if (err2) {
    console.error("   ❌ ERROR: 'riders' table missing or incorrect structure.");
    console.error("      " + err2.message);
    allGood = false;
  } else {
    console.log("   ✅ 'riders' table is correctly formatted.");
  }

  // 3. Check orders table for voice note
  console.log("\n3. Checking 'orders' table (Voice Notes)...");
  const { error: err3 } = await supabase.from('orders').select('id, voice_note_url').limit(1);
  if (err3) {
    console.error("   ❌ ERROR: 'orders' table is missing the 'voice_note_url' column.");
    console.error("      " + err3.message);
    allGood = false;
  } else {
    console.log("   ✅ 'orders' table has 'voice_note_url' support.");
  }

  // 4. Check admin_users table
  console.log("\n4. Checking 'admin_users' table...");
  const { error: err4 } = await supabase.from('admin_users').select('id, role').limit(1);
  if (err4) {
    console.error("   ❌ ERROR: 'admin_users' table missing.");
    console.error("      " + err4.message);
    allGood = false;
  } else {
    console.log("   ✅ 'admin_users' table exists.");
  }

  // 5. Check Storage Buckets
  console.log("\n5. Checking Storage Buckets...");
  const { data: buckets, error: err5 } = await supabase.storage.listBuckets();
  if (err5) {
    console.error("   ❌ ERROR: Could not read storage buckets.");
    allGood = false;
  } else {
    const docBucket = buckets.find(b => b.name === 'documents');
    if (!docBucket) {
      console.error("   ❌ ERROR: The 'documents' bucket for rider IDs is missing.");
      allGood = false;
    } else {
      console.log("   ✅ 'documents' storage bucket exists.");
    }
  }

  console.log("\n=========================================");
  if (allGood) {
    console.log("🎉 ALL SYSTEMS GO! Your database perfectly matches the Unified Blueprint!");
  } else {
    console.log("⚠️ SOME ISSUES DETECTED. Please review the errors above.");
  }
  console.log("=========================================\n");
}

verifySchema();

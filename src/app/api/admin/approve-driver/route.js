import { createAdminClient } from "@/utils/supabase/admin";
import { validateAdmin } from "@/utils/admin";
import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const { driverId } = await request.json();
    
    // Validate admin access
    const { user } = await validateAdmin();
    
    // Use admin client to bypass RLS
    const adminSupabase = createAdminClient();
    
    // Update rider
    const { error } = await adminSupabase
      .from("riders")
      .update({ status: "approved", approved: true })
      .eq("user_id", driverId);
    
    if (error) throw error;
    
    // Log action
    await adminSupabase.from("admin_action_logs").insert({
      admin_id: user.id,
      user_id: driverId,
      table_name: "riders",
      action: "approve",
      changes: { status: "approved", approved: true },
    });
    
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

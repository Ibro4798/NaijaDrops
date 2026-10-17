import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

export const runtime = "nodejs";

const BLOCKED = {
  ACTIVE_ORDERS: "You have an order in progress. Please wait until it is delivered or cancelled, then try again.",
  PENDING_PAYOUT: "You have a payout request that is still being processed. Please try again once it has been paid.",
  ADMIN_ACCOUNT: "Admin accounts can't be deleted here. Please contact support.",
};

// Uploaded files live in the private "documents" bucket. Older rows may hold
// a full storage URL instead of a bare path (same rule as utils/signedDocUrl).
function toDocumentPath(value) {
  if (!value || typeof value !== "string") return null;
  for (const marker of ["/object/public/documents/", "/object/sign/documents/"]) {
    const i = value.indexOf(marker);
    if (i !== -1) return decodeURIComponent(value.slice(i + marker.length).split("?")[0]);
  }
  return value.startsWith("http") ? null : value;
}

export async function POST(request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Please sign in to delete your account." }, { status: 401 });
    }

    let body = {};
    try { body = await request.json(); } catch { /* no body */ }
    if (body?.confirm !== "DELETE") {
      return NextResponse.json({ error: "Please type DELETE to confirm." }, { status: 400 });
    }

    const admin = createAdminClient();

    // Capture the avatar path before it is cleared so the file can be removed too.
    const { data: profileRow } = await admin.from("users").select("avatar_url").eq("id", user.id).maybeSingle();

    // 1. Scrub personal data in the database. Refuses (and changes nothing) if
    //    the account has an unfinished order or a pending payout.
    const { data: result, error: rpcError } = await admin.rpc("anonymize_account", { p_user_id: user.id });
    if (rpcError) {
      const code = Object.keys(BLOCKED).find((k) => rpcError.message?.includes(k));
      if (code) return NextResponse.json({ error: BLOCKED[code], code }, { status: 409 });
      console.error("[account/delete] anonymize_account failed:", rpcError.message);
      return NextResponse.json({ error: "We couldn't delete your account. Please try again or contact support." }, { status: 500 });
    }

    // 2. Remove uploaded files (ID, licence, photos, avatar, logo). Best effort.
    const paths = [...(result?.doc_paths || []), profileRow?.avatar_url].map(toDocumentPath).filter(Boolean);
    if (paths.length) {
      const { error: rmError } = await admin.storage.from("documents").remove(paths);
      if (rmError) console.warn("[account/delete] file cleanup:", rmError.message);
    }

    // 3. Close the sign-in. No orders/payments => remove the login completely.
    //    Otherwise keep the (now anonymous) row that those records point at,
    //    but strip the email, metadata and linked sign-ins and block the login.
    let mode = "deleted";
    if (result?.status === "no_profile" || !result?.has_records) {
      const { error: delError } = await admin.auth.admin.deleteUser(user.id);
      if (delError) {
        console.error("[account/delete] auth delete failed, falling back to anonymize:", delError.message);
        mode = "anonymized";
      }
    } else {
      mode = "anonymized";
    }

    if (mode === "anonymized") {
      const { error: updError } = await admin.auth.admin.updateUserById(user.id, {
        email: `deleted-${user.id}@deleted.naijadrops.invalid`,
        user_metadata: { full_name: null, name: null, phone: null, avatar_url: null, picture: null },
        ban_duration: "876000h",
      });
      if (updError) console.error("[account/delete] auth anonymize:", updError.message);
      // Soft delete also removes linked sign-ins (e.g. Google) while keeping the row.
      const { error: softError } = await admin.auth.admin.deleteUser(user.id, true);
      if (softError) console.warn("[account/delete] soft delete:", softError.message);
    }

    try { await supabase.auth.signOut(); } catch { /* session already invalid */ }

    return NextResponse.json({ success: true, mode });
  } catch (err) {
    console.error("[account/delete] unexpected error:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

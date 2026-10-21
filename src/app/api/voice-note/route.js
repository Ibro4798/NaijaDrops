import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

// Voice notes live in the PRIVATE "documents" bucket, and its storage policies only let the
// uploader or an admin read an object. A rider is neither, so the browser can never sign these
// itself. This route uses RLS on `orders` as the access check (vendor owner, assigned rider,
// broadcast rider, admin) and only then signs with the service role. No order access, no URL.

const COLUMNS = {
  pickup: "pickup_voice_note_url",
  dropoff: "dropoff_voice_note_url",
  general: "voice_note_url",
};
const MARKERS = ["/object/public/documents/", "/object/sign/documents/", "/object/authenticated/documents/"];

function toPath(value) {
  if (!value) return null;
  for (const m of MARKERS) {
    const i = value.indexOf(m);
    if (i !== -1) return decodeURIComponent(value.slice(i + m.length).split("?")[0]);
  }
  return /^https?:\/\//i.test(value) ? null : value;
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get("orderId");
  const column = COLUMNS[searchParams.get("kind")];
  if (!orderId || !column) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: order } = await supabase.from("orders").select(column).eq("id", orderId).maybeSingle();
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const path = toPath(order[column]);
  if (!path) return NextResponse.json({ error: "No voice note" }, { status: 404 });

  const admin = createAdminClient();
  const { data, error } = await admin.storage.from("documents").createSignedUrl(path, 600);
  if (error || !data?.signedUrl) {
    console.error("voice-note sign failed:", path, error?.message);
    return NextResponse.json({ error: "Voice note file is missing" }, { status: 404 });
  }
  return NextResponse.json({ url: data.signedUrl }, { headers: { "Cache-Control": "no-store" } });
}

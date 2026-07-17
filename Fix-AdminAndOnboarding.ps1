<#
  Fix-AdminAndOnboarding.ps1
  Compatible with Windows PowerShell 5.1 (no PS7-only syntax used).

  What this fixes:

  ADMIN LOGIN / BOOTSTRAP (Supabase side already fixed directly):
    - handle_new_user() trigger previously never set users.role or users.email,
      and unconditionally created a vendor profile for EVERY signup regardless
      of intended role - so invited riders/admins silently got a pointless
      vendor storefront and no riders/admin_users row at all. Fixed to read the
      role from invite metadata and only create the right sub-profile.
    - ibrahim@naijadrops.tech promoted to role='admin', is_super_admin=true -
      there was no working admin account on the entire platform before this.
    - ops-terminal/admins/page.jsx had "const isSuperAdmin = false" hardcoded,
      permanently hiding the "Authorize New Admin" form for everyone. Also read
      from `admin_users`, a table completely disconnected from `users` (the
      table that actually gates access) - so authorizing an admin there would
      never have actually granted access. Both fixed to use `users`.

  RIDER ONBOARDING REVIEW (this was the core ask):
    - ops-terminal/drivers/[driverId]/page.jsx - the page an admin lands on
      when clicking into a specific rider - was an exact copy-paste of the
      unrelated "approval-success" congratulations screen. There was NO way
      for an admin to actually view a rider's submitted documents or approve/
      reject them individually. Rebuilt from scratch: full profile, all 4
      submitted document images viewable full-size, and Approve / Reject-with-
      reason / Pause-with-reason actions.
    - drivers/actions.js: added real rejectRider() and pauseRider(), both
      requiring a reason (stored in riders.rejection_reason and shown to the
      rider). The old "Deactivate" button actually set status back to
      'pending' (not 'paused') despite being labeled and logged as a pause -
      replaced entirely.
    - drivers/page.jsx: fixed two column-name bugs (driver_license_url /
      government_id_url don't exist - real columns are license_url /
      id_card_url, so the document indicators never showed), removed the
      quick-action buttons that were nested inside a full-card <Link> with no
      event.stopPropagation() (clicking Approve also navigated away), grouped
      riders by status so the review queue isn't cluttered with in-progress
      drafts.
    - Rider side: a paused rider now gets a distinct, specific message
      (not lumped in with "rejected") with the reason on file and a clear
      "Message Support" button, on both the dashboard gate and the onboarding
      screen. Previously 'paused' fell through to the onboarding page's
      "resume draft" branch, which would have shown the multi-step form again
      instead of any status explanation.

  SITE STRUCTURE:
    - Footer previously linked to 11 pages, 4 of which 404 (Ship Package,
      Carrier Portal, City Map, About Us) plus 2 deliberate dead links (Blog,
      Cookie Policy). Simplified to only the 6 pages that actually exist and
      matter at pilot stage: Pricing, Contact, FAQ, Support, Privacy, Terms.

  This script writes full file content for new/rewritten files, and does
  targeted find-and-replace for two small existing files (rider dashboard,
  rider onboarding) rather than rewriting them whole. Backs up everything to
  .fix-backup-admin\ first. Uses -LiteralPath throughout because two of the
  new files live under a [driverId] folder, and square brackets are wildcard
  characters to PowerShell - the same bug that hit tracking/[orderId] before.

  Run from the ROOT of your local repo clone:
      cd C:\path\to\your\repo
      powershell -ExecutionPolicy Bypass -File .\Fix-AdminAndOnboarding.ps1
#>

$ErrorActionPreference = "Stop"
$root = Get-Location
$backupDir = Join-Path $root ".fix-backup-admin"
if (-not (Test-Path -LiteralPath $backupDir)) { New-Item -ItemType Directory -Path $backupDir | Out-Null }

function Get-FullPath($rel) { return Join-Path $root $rel }

function Backup-Path($full) {
    if (Test-Path -LiteralPath $full) {
        $rel = $full.Substring($root.Path.Length).TrimStart('\','/')
        $dest = Join-Path $backupDir $rel
        $destParent = Split-Path $dest -Parent
        if (-not (Test-Path -LiteralPath $destParent)) { New-Item -ItemType Directory -Path $destParent -Force | Out-Null }
        Copy-Item -LiteralPath $full -Destination $dest -Force
    }
}

function Resolve-TargetPath($originalRel, $movedRel) {
    if ($movedRel -ne $null) {
        $movedFull = Get-FullPath $movedRel
        if (Test-Path -LiteralPath $movedFull) { return $movedFull }
        $movedParent = Split-Path $movedFull -Parent
        if (Test-Path -LiteralPath $movedParent) { return $movedFull }
    }
    return Get-FullPath $originalRel
}

function Write-FileContent($targetFull, $content) {
    Backup-Path $targetFull
    $targetParent = Split-Path $targetFull -Parent
    if (-not (Test-Path -LiteralPath $targetParent)) { New-Item -ItemType Directory -Path $targetParent -Force | Out-Null }
    Set-Content -LiteralPath $targetFull -Value $content -NoNewline -Encoding UTF8
    Write-Host "  WROTE: $targetFull" -ForegroundColor Green
}

function Patch-File($targetFull, $oldStr, $newStr, $label) {
    if (-not (Test-Path -LiteralPath $targetFull)) {
        Write-Host "  SKIP (not found): $targetFull" -ForegroundColor Yellow
        return
    }
    $content = Get-Content -LiteralPath $targetFull -Raw -Encoding UTF8
    if ($content.Contains($oldStr)) {
        Backup-Path $targetFull
        $content = $content.Replace($oldStr, $newStr)
        Set-Content -LiteralPath $targetFull -Value $content -NoNewline -Encoding UTF8
        Write-Host "  PATCHED: $label" -ForegroundColor Green
    } elseif ($content.Contains($newStr)) {
        Write-Host "  ALREADY PATCHED: $label" -ForegroundColor Yellow
    } else {
        Write-Host "  WARNING: anchor text not found for $label - skipped, check manually" -ForegroundColor Red
    }
}

if (-not (Test-Path -LiteralPath (Get-FullPath "src\app"))) {
    Write-Host "ERROR: src\app not found. Run this script from the repo root." -ForegroundColor Red
    exit 1
}

Write-Host "`nApplying admin panel + rider review + footer fixes:" -ForegroundColor Cyan

$content0 = @'
"use server";

import { validateAdmin, logAdminAction } from "@/utils/admin";
import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

/**
 * Approve a Rider (Workforce Unit)
 */
export async function approveRider(riderId) {
  try {
    const { admin } = await validateAdmin(); // Layer 2 Security Re-validation
    const supabase = await createClient();

    const { error } = await supabase
      .from("riders")
      .update({ approved: true, status: "approved", rejection_reason: null })
      .eq("user_id", riderId);

    if (error) throw error;

    await logAdminAction(admin.id, "RIDER_APPROVAL", "rider", riderId, { status: "approved" });

    revalidatePath("/ops-terminal/drivers");
    revalidatePath(`/ops-terminal/drivers/${riderId}`);
    return { success: true };
  } catch (err) {
    console.error("Admin Action Error:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Reject a Rider outright, with a reason the rider will see on their onboarding
 * screen. Distinct from pauseRider: rejection is a hard no on this application;
 * the rider can edit their submission and resubmit from scratch.
 */
export async function rejectRider(riderId, reason) {
  try {
    const { admin } = await validateAdmin();
    const supabase = await createClient();

    if (!reason || !reason.trim()) {
      return { success: false, error: "A reason is required so the rider knows what to fix." };
    }

    const { error } = await supabase
      .from("riders")
      .update({ approved: false, status: "rejected", rejection_reason: reason.trim() })
      .eq("user_id", riderId);

    if (error) throw error;

    await logAdminAction(admin.id, "RIDER_REJECTION", "rider", riderId, { status: "rejected", reason });

    revalidatePath("/ops-terminal/drivers");
    revalidatePath(`/ops-terminal/drivers/${riderId}`);
    return { success: true };
  } catch (err) {
    console.error("Admin Action Error:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Pause a Rider that was already approved (or is under review) - takes them off
 * the road without a full rejection. Distinct from rejectRider: the rider is not
 * told to resubmit their application, they're told to contact support to resolve
 * whatever the issue is. They cannot toggle online again until an admin either
 * re-approves or rejects them.
 */
export async function pauseRider(riderId, reason) {
  try {
    const { admin } = await validateAdmin();
    const supabase = await createClient();

    if (!reason || !reason.trim()) {
      return { success: false, error: "A reason is required so support can explain the pause to the rider." };
    }

    const { error } = await supabase
      .from("riders")
      .update({ approved: false, status: "paused", rejection_reason: reason.trim(), operational_status: "offline" })
      .eq("user_id", riderId);

    if (error) throw error;

    await logAdminAction(admin.id, "RIDER_PAUSE", "rider", riderId, { status: "paused", reason });

    revalidatePath("/ops-terminal/drivers");
    revalidatePath(`/ops-terminal/drivers/${riderId}`);
    return { success: true };
  } catch (err) {
    console.error("Admin Action Error:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Invite a new Rider via email
 */
export async function inviteRider(formData) {
  try {
    const { admin } = await validateAdmin(); // Security Check
    const { createAdminClient } = await import("@/utils/supabase/admin");
    const adminSupabase = createAdminClient();

    const email = formData.get("email");
    const fullName = formData.get("full_name");
    const vehicleType = formData.get("vehicle_type");

    if (!email || !fullName) throw new Error("Email and Full Name are required");

    // The on_auth_user_created trigger now reads this metadata and creates a
    // draft riders row (status='draft') pre-filled with full_name/vehicle_type,
    // so the rider lands on a partially-filled onboarding form instead of a
    // blank one. It does NOT auto-approve - they still go through the normal
    // review flow below once they submit.
    const { data: inviteData, error: inviteError } = await adminSupabase.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName, role: 'rider', vehicle_type: vehicleType || 'bike' }
    });

    if (inviteError) throw inviteError;
    const userId = inviteData.user.id;

    await logAdminAction(admin.id, "RIDER_INVITE", "rider", userId, { email, fullName });

    revalidatePath("/ops-terminal/drivers");
    return { success: true };
  } catch (err) {
    console.error("Admin Invite Error:", err);
    return { success: false, error: err.message };
  }
}
'@
$target0 = Resolve-TargetPath "src\app\ops-terminal\drivers\actions.js" $null
Write-FileContent $target0 $content0

$content1 = @'
import { validateAdmin } from "@/utils/admin";
import { createClient } from "@/utils/supabase/server";
import Link from "next/link";
import { ArrowLeft, Phone, Truck, Hash, FileText, IdCard, Bike, UserCircle2 } from "lucide-react";
import DriverReviewActions from "./DriverReviewActions";

export const dynamic = "force-dynamic";

const STATUS_STYLES = {
  draft:    "bg-charcoal-700/40 text-charcoal-300",
  pending:  "bg-amber-500/20 text-amber-400",
  approved: "bg-emerald-500/20 text-emerald-400",
  paused:   "bg-amber-500/20 text-amber-400",
  rejected: "bg-red-500/20 text-red-400",
};

function DocCard({ label, url, Icon }) {
  return (
    <div className="bg-charcoal-900/40 border border-white/5 rounded-2xl overflow-hidden">
      <div className="aspect-[4/3] bg-black/40 flex items-center justify-center relative">
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer" className="block w-full h-full">
            <img src={url} alt={label} className="w-full h-full object-cover hover:opacity-80 transition-opacity" />
          </a>
        ) : (
          <div className="flex flex-col items-center gap-2 text-charcoal-700">
            <Icon size={28} />
            <span className="text-[10px] font-black uppercase tracking-widest">Not submitted</span>
          </div>
        )}
      </div>
      <div className="p-3 flex items-center gap-2">
        <Icon size={14} className="text-charcoal-500" />
        <span className="text-[10px] font-black uppercase tracking-widest text-charcoal-400">{label}</span>
        {url && <span className="ml-auto text-[9px] font-black uppercase text-emerald-500">Tap to enlarge</span>}
      </div>
    </div>
  );
}

export default async function DriverReviewPage({ params }) {
  await validateAdmin();
  const supabase = await createClient();
  const { driverId } = await params;

  const { data: rider } = await supabase
    .from("riders")
    .select("*, users(full_name, email, phone)")
    .eq("user_id", driverId)
    .single();

  if (!rider) {
    return (
      <div className="min-h-screen bg-black text-white p-8 font-mono">
        <Link href="/ops-terminal/drivers" className="inline-flex items-center gap-2 text-charcoal-400 hover:text-white text-sm font-bold mb-8">
          <ArrowLeft size={16} /> Back to Registry
        </Link>
        <p className="text-charcoal-500">No rider found for this ID.</p>
      </div>
    );
  }

  const name = rider.users?.full_name || rider.full_name || "Unnamed Rider";
  const statusStyle = STATUS_STYLES[rider.status] || STATUS_STYLES.draft;

  return (
    <div className="min-h-screen bg-black text-white p-8 font-mono">
      <Link href="/ops-terminal/drivers" className="inline-flex items-center gap-2 text-charcoal-400 hover:text-white text-sm font-bold mb-8 transition-colors">
        <ArrowLeft size={16} /> Back to Registry
      </Link>

      {/* Header */}
      <div className="flex items-start gap-6 mb-10 border-b border-white/10 pb-8">
        <div className="w-20 h-20 rounded-2xl bg-charcoal-800 flex-shrink-0 flex items-center justify-center overflow-hidden">
          {rider.profile_photo_url ? (
            <img src={rider.profile_photo_url} alt={name} className="w-full h-full object-cover" />
          ) : (
            <UserCircle2 size={36} className="text-charcoal-600" />
          )}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-black tracking-tight">{name}</h1>
            <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest ${statusStyle}`}>
              {rider.status || 'draft'}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-charcoal-400 text-xs font-bold">
            {(rider.users?.email) && <span>{rider.users.email}</span>}
            {(rider.phone || rider.users?.phone) && (
              <span className="flex items-center gap-1.5"><Phone size={12} /> {rider.phone || rider.users?.phone}</span>
            )}
            {rider.vehicle_type && (
              <span className="flex items-center gap-1.5"><Truck size={12} /> {rider.vehicle_type}</span>
            )}
            {rider.plate_number && (
              <span className="flex items-center gap-1.5"><Hash size={12} /> {rider.plate_number}</span>
            )}
          </div>
        </div>
      </div>

      {/* Prior reason on file, if any (rejection or pause) */}
      {rider.rejection_reason && (
        <div className="bg-charcoal-900/40 border border-white/10 rounded-2xl p-5 mb-8">
          <div className="text-[10px] font-black uppercase tracking-widest text-charcoal-500 mb-1">
            Reason on file ({rider.status})
          </div>
          <p className="text-white text-sm">{rider.rejection_reason}</p>
        </div>
      )}

      {/* Documents */}
      <div className="mb-10">
        <h2 className="text-sm font-black uppercase tracking-[0.2em] text-emerald-500 mb-6 flex items-center gap-2">
          <FileText size={16} /> Submitted Documents
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <DocCard label="Profile Photo" url={rider.profile_photo_url} Icon={UserCircle2} />
          <DocCard label="ID Card" url={rider.id_card_url} Icon={IdCard} />
          <DocCard label="Driver's License" url={rider.license_url} Icon={FileText} />
          <DocCard label="Vehicle Photo" url={rider.vehicle_photo_url} Icon={Bike} />
        </div>
      </div>

      {/* Actions */}
      <div>
        <h2 className="text-sm font-black uppercase tracking-[0.2em] text-emerald-500 mb-6">Decision</h2>
        <DriverReviewActions riderId={rider.user_id} status={rider.status} />
      </div>
    </div>
  );
}
'@
$target1 = Resolve-TargetPath "src\app\ops-terminal\drivers\[driverId]\page.jsx" $null
Write-FileContent $target1 $content1

$content2 = @'
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { approveRider, rejectRider, pauseRider } from "../actions";
import { Loader2, CheckCircle2, XCircle, PauseCircle } from "lucide-react";

export default function DriverReviewActions({ riderId, status }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState(null); // null | 'reject' | 'pause'
  const [reason, setReason] = useState("");
  const [error, setError] = useState(null);

  const runAction = async (fn, ...args) => {
    setLoading(true);
    setError(null);
    const res = await fn(...args);
    setLoading(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setMode(null);
    setReason("");
    router.refresh();
  };

  const handleApprove = () => {
    if (!confirm("Approve this rider? They'll be able to go online immediately.")) return;
    runAction(approveRider, riderId);
  };

  const handleReject = () => runAction(rejectRider, riderId, reason);
  const handlePause = () => runAction(pauseRider, riderId, reason);

  if (mode === 'reject' || mode === 'pause') {
    const isPause = mode === 'pause';
    return (
      <div className="bg-charcoal-900/60 border border-white/10 rounded-2xl p-6 space-y-4">
        <h3 className="text-sm font-black uppercase tracking-widest text-white">
          {isPause ? "Pause this rider" : "Reject this application"}
        </h3>
        <p className="text-charcoal-400 text-xs leading-relaxed">
          {isPause
            ? "The rider will be taken offline and blocked from toggling online again. They'll see this reason on their dashboard and be told to contact support - this is not a full rejection, they stay on the platform."
            : "The rider will see this reason on their onboarding screen and can edit their submission and resubmit."}
        </p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={isPause ? "e.g. Customer complaint under review, vehicle documents expired..." : "e.g. License photo is blurry, plate number doesn't match upload..."}
          className="w-full bg-charcoal-950 border border-white/10 rounded-xl p-4 min-h-[100px] text-white text-sm outline-none focus:border-emerald-500 transition-all resize-none"
        />
        {error && <p className="text-red-400 text-xs font-bold">{error}</p>}
        <div className="flex gap-3">
          <button
            onClick={() => { setMode(null); setError(null); }}
            className="px-5 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={isPause ? handlePause : handleReject}
            disabled={loading || !reason.trim()}
            className={`flex-1 px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
              loading || !reason.trim() ? 'bg-white/5 text-charcoal-600 cursor-not-allowed' :
              isPause ? 'bg-amber-500 text-charcoal-950 hover:bg-amber-400' : 'bg-red-500 text-white hover:bg-red-400'
            }`}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : isPause ? <PauseCircle size={14} /> : <XCircle size={14} />}
            {isPause ? "Confirm Pause" : "Confirm Rejection"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-red-400 text-xs font-bold">{error}</p>}
      <div className="flex flex-wrap gap-3">
        {status !== 'approved' && (
          <button
            onClick={handleApprove}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-4 rounded-2xl bg-emerald-500 text-charcoal-950 text-xs font-black uppercase tracking-widest hover:bg-emerald-400 transition-all shadow-[0_0_16px_rgba(16,185,129,0.3)] disabled:opacity-50"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            Approve Rider
          </button>
        )}
        {status !== 'rejected' && (
          <button
            onClick={() => setMode('reject')}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-black uppercase tracking-widest hover:bg-red-500/20 transition-all disabled:opacity-50"
          >
            <XCircle size={16} /> Reject
          </button>
        )}
        {status !== 'paused' && status !== 'rejected' && (
          <button
            onClick={() => setMode('pause')}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-black uppercase tracking-widest hover:bg-amber-500/20 transition-all disabled:opacity-50"
          >
            <PauseCircle size={16} /> Pause
          </button>
        )}
      </div>
    </div>
  );
}
'@
$target2 = Resolve-TargetPath "src\app\ops-terminal\drivers\[driverId]\DriverReviewActions.jsx" $null
Write-FileContent $target2 $content2

$content3 = @'
import { validateAdmin } from "@/utils/admin";
import { createClient } from "@/utils/supabase/server";
import { FileText, IdCard, ShieldCheck, ArrowRight } from "lucide-react";
import Link from "next/link";
import InviteDriverButton from "./InviteDriverButton";

export const dynamic = "force-dynamic";

function RiderRow({ rider }) {
  const name = rider.users?.full_name || rider.full_name || "Unnamed Rider";
  return (
    <Link href={`/ops-terminal/drivers/${rider.user_id}`}>
      <div className="bg-charcoal-900/40 border border-white/5 rounded-2xl p-6 flex items-center gap-6 hover:border-emerald-500/20 transition-all cursor-pointer">
        <div className="w-16 h-16 rounded-2xl bg-charcoal-800 flex-shrink-0 flex items-center justify-center text-xs font-black overflow-hidden">
          {rider.profile_photo_url ? (
            <img src={rider.profile_photo_url} alt="Profile" className="w-full h-full object-cover" />
          ) : (
            "ND"
          )}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-black">{name}</h3>
            <span className={`text-xs font-black px-2 py-1 rounded ${rider.status === "approved" ? "bg-emerald-500/20 text-emerald-400" : rider.status === "rejected" ? "bg-red-500/20 text-red-400" : "bg-amber-500/20 text-amber-400"}`}>
              {rider.status}
            </span>
          </div>
          <p className="text-charcoal-500 text-sm">{rider.users?.email || rider.phone || "No contact on file"}</p>
        </div>
        <div className="flex gap-2 items-center">
          {rider.license_url && <FileText size={18} className="text-blue-500" title="License submitted" />}
          {rider.id_card_url && <ShieldCheck size={18} className="text-emerald-500" title="ID submitted" />}
        </div>
        <div className="flex items-center gap-2 text-charcoal-500 text-[10px] font-black uppercase tracking-widest ml-4">
          Review <ArrowRight size={14} />
        </div>
      </div>
    </Link>
  );
}

export default async function AdminDriversPage() {
  await validateAdmin();
  const supabase = await createClient();

  const { data: riders } = await supabase
    .from("riders")
    .select("*, users(full_name, email, phone)")
    .order("created_at", { ascending: false });

  const all = riders || [];
  const pendingRiders = all.filter(r => r.status === "pending");
  const approvedRiders = all.filter(r => r.status === "approved");
  const pausedRiders = all.filter(r => r.status === "paused");
  const rejectedRiders = all.filter(r => r.status === "rejected");
  const draftRiders = all.filter(r => r.status === "draft" || !r.status);

  return (
    <div className="min-h-screen bg-black text-white p-8 font-mono">
      <div className="flex justify-between items-end mb-12 border-b border-white/10 pb-8">
        <div>
          <h1 className="text-3xl font-black italic tracking-tighter uppercase">Registry / Riders</h1>
          <p className="text-charcoal-500 text-xs mt-2 uppercase tracking-widest">
            {pendingRiders.length} Pending Review · {approvedRiders.length} Active · {pausedRiders.length} Paused
          </p>
        </div>
        <InviteDriverButton />
      </div>

      {pendingRiders.length > 0 && (
        <div className="mb-10">
          <h2 className="text-xs font-black uppercase tracking-[0.2em] text-amber-500 mb-4">Awaiting Review ({pendingRiders.length})</h2>
          <div className="grid grid-cols-1 gap-4">
            {pendingRiders.map((rider) => <RiderRow key={rider.user_id} rider={rider} />)}
          </div>
        </div>
      )}

      {pausedRiders.length > 0 && (
        <div className="mb-10">
          <h2 className="text-xs font-black uppercase tracking-[0.2em] text-amber-500 mb-4">Paused ({pausedRiders.length})</h2>
          <div className="grid grid-cols-1 gap-4">
            {pausedRiders.map((rider) => <RiderRow key={rider.user_id} rider={rider} />)}
          </div>
        </div>
      )}

      {approvedRiders.length > 0 && (
        <div className="mb-10">
          <h2 className="text-xs font-black uppercase tracking-[0.2em] text-emerald-500 mb-4">Active ({approvedRiders.length})</h2>
          <div className="grid grid-cols-1 gap-4">
            {approvedRiders.map((rider) => <RiderRow key={rider.user_id} rider={rider} />)}
          </div>
        </div>
      )}

      {rejectedRiders.length > 0 && (
        <div className="mb-10">
          <h2 className="text-xs font-black uppercase tracking-[0.2em] text-red-500 mb-4">Rejected ({rejectedRiders.length})</h2>
          <div className="grid grid-cols-1 gap-4">
            {rejectedRiders.map((rider) => <RiderRow key={rider.user_id} rider={rider} />)}
          </div>
        </div>
      )}

      {draftRiders.length > 0 && (
        <details className="mb-10">
          <summary className="text-xs font-black uppercase tracking-[0.2em] text-charcoal-600 mb-4 cursor-pointer select-none">
            In Progress, Not Yet Submitted ({draftRiders.length})
          </summary>
          <div className="grid grid-cols-1 gap-4 mt-4">
            {draftRiders.map((rider) => <RiderRow key={rider.user_id} rider={rider} />)}
          </div>
        </details>
      )}

      {all.length === 0 && (
        <div className="text-center py-20 text-charcoal-600">No riders yet</div>
      )}
    </div>
  );
}
'@
$target3 = Resolve-TargetPath "src\app\ops-terminal\drivers\page.jsx" $null
Write-FileContent $target3 $content3

$content4 = @'
import { validateAdmin } from "@/utils/admin";
import { createClient } from "@/utils/supabase/server";
import { Loader2, UserPlus, ShieldCheck, Mail } from "lucide-react";
import { addAdmin } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminsPage() {
  const { admin: currentAdmin } = await validateAdmin();
  const supabase = await createClient();

  // Previously hardcoded to `false`, which permanently hid the "Authorize New
  // Admin" form for everyone, including real super admins. currentAdmin already
  // comes from validateAdmin() above - just use it.
  const isSuperAdmin = currentAdmin?.is_super_admin === true;

  // Previously read from `admin_users`, a table completely disconnected from
  // the `users` table that actually gates access in validateAdmin(). An admin
  // "authorized" here would never actually be able to log into ops-terminal.
  // `users` is now the single source of truth for both.
  const { data: admins } = await supabase
    .from("users")
    .select("*")
    .in("role", ["admin", "super_admin"])
    .order("email");

  return (
    <div className="min-h-screen bg-black text-white p-8 font-mono">
      <div className="flex justify-between items-end mb-12 border-b border-white/10 pb-8">
        <div>
           <h1 className="text-3xl font-black italic tracking-tighter uppercase">Registry / Administrators</h1>
           <p className="text-charcoal-500 text-xs mt-2 uppercase tracking-widest">Security Clearance: {isSuperAdmin ? 'SUPER ADMIN' : 'ADMIN'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        <section>
          <h2 className="text-sm font-black uppercase tracking-[0.2em] text-emerald-500 mb-6 flex items-center gap-2">
            <ShieldCheck size={16} /> Active Credentials
          </h2>
          <div className="space-y-4">
            {admins?.map((a) => (
              <div key={a.id} className="bg-charcoal-900/40 border border-white/5 rounded-2xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-charcoal-500">
                    <Mail size={18} />
                  </div>
                  <div>
                    <div className="text-sm font-bold tracking-tight">{a.email || a.full_name || 'Unnamed'}</div>
                    <div className="text-[9px] font-black uppercase tracking-widest text-charcoal-600">
                      {a.is_super_admin ? 'SUPER ADMIN' : 'ADMIN'}
                    </div>
                  </div>
                </div>
                <div className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${a.is_active ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                  {a.is_active ? 'Active' : 'Inactive'}
                </div>
              </div>
            ))}
            {(!admins || admins.length === 0) && (
              <p className="text-charcoal-600 text-xs">No admins found.</p>
            )}
          </div>
        </section>

        {isSuperAdmin ? (
          <section className="bg-charcoal-900/20 border border-white/5 rounded-[2rem] p-8">
            <h2 className="text-lg font-black italic uppercase tracking-tight mb-6">Authorize New Admin</h2>
            <form action={addAdmin} className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest block mb-2 px-1">Email Address</label>
                <input 
                  name="email"
                  type="email" 
                  required
                  placeholder="admin@email.com"
                  className="w-full bg-charcoal-950 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-emerald-500 transition-all"
                />
              </div>

              <button 
                type="submit"
                className="w-full bg-white text-black hover:bg-emerald-500 transition-all font-black py-4 rounded-xl uppercase text-xs tracking-widest flex items-center justify-center gap-2"
              >
                <UserPlus size={16} />
                Authorize Admin
              </button>
            </form>
          </section>
        ) : (
          <div className="flex items-center justify-center border border-dashed border-white/5 rounded-[2rem] p-8 text-center">
             <p className="text-charcoal-600 text-[10px] font-black uppercase tracking-[0.2em]">Super Admin privileges required to manage credentials</p>
          </div>
        )}
      </div>
    </div>
  );
}
'@
$target4 = Resolve-TargetPath "src\app\ops-terminal\admins\page.jsx" $null
Write-FileContent $target4 $content4

$content5 = @'
"use server";

import { validateAdmin, logAdminAction } from "@/utils/admin";
import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

/**
 * Add a new Admin
 */
export async function addAdmin(formData) {
  try {
    // ONLY super_admin can add other admins
    const { admin: currentAdmin } = await validateAdmin('super_admin');
    const supabase = await createClient();

    const email = formData.get("email");

    if (!email) {
      throw new Error("Email is required");
    }

    // Previously checked `admin_users`, a table disconnected from the `users`
    // table that actually controls access - so this check meant nothing.
    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .in("role", ["admin", "super_admin"])
      .maybeSingle();

    if (existing) {
      throw new Error("Admin already exists");
    }

    // Invite User via Supabase Auth. Supabase handles the SMTP email sending.
    const { createAdminClient } = await import("@/utils/supabase/admin");
    const adminSupabase = createAdminClient();

    const { error: inviteError } = await adminSupabase.auth.admin.inviteUserByEmail(email, {
      data: { role: 'admin' }
    });

    if (inviteError && !inviteError.message.includes('already registered')) {
        throw inviteError;
    }

    // The on_auth_user_created trigger now reads this metadata and sets
    // users.role = 'admin' directly - no separate admin_users table involved,
    // no manual upsert needed here.

    await logAdminAction(currentAdmin.id, "ADMIN_ADDITION", "admin", null, { email });

    revalidatePath("/ops-terminal/admins");
    return { success: true };
  } catch (err) {
    console.error("Add Admin Error:", err);
    return { success: false, error: err.message };
  }
}
'@
$target5 = Resolve-TargetPath "src\app\ops-terminal\admins\actions.js" $null
Write-FileContent $target5 $content5

$content6 = @'
"use client";

import Link from "next/link";
import { Package, Instagram, Mail, MessageCircle, ArrowRight, Shield, Clock } from "lucide-react";

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-charcoal-950 text-white pt-20 pb-10 overflow-hidden relative">
      {/* Decorative Blur */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-emerald-500/5 rounded-full blur-[100px] pointer-events-none"></div>

      <div className="max-w-7xl mx-auto px-6 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12 mb-20">
          
          {/* Brand Column */}
          <div className="space-y-6">
            <Link href="/" className="flex items-center group">
              <div className="bg-emerald-500 p-2 rounded-xl mr-3 group-hover:rotate-12 transition-transform">
                <Package size={24} className="text-white" />
              </div>
              <span className="text-2xl font-black tracking-tighter text-white">
                NaijaDrops<span className="text-emerald-500">.</span>
              </span>
            </Link>
            <p className="text-charcoal-400 text-sm font-medium leading-relaxed max-w-xs">
              Building the future of logistics in Kano. High-precision delivery infrastructure for vendors and individuals.
            </p>
            <div className="flex items-center gap-4">
              <a href="https://www.instagram.com/naija.drops" target="_blank" className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center hover:bg-emerald-500 hover:text-white transition-all">
                <Instagram size={20} />
              </a>
              <a href="https://wa.me/message/3756ZAFK6RTTI1" target="_blank" className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center hover:bg-emerald-500 hover:text-white transition-all">
                <MessageCircle size={20} />
              </a>
              <a href="mailto:support@naijadrops.tech" className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center hover:bg-emerald-500 hover:text-white transition-all">
                <Mail size={20} />
              </a>
            </div>
          </div>

          {/* Company Links - only pages that actually exist */}
          <div>
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-emerald-500 mb-6">Company</h3>
            <ul className="space-y-4">
              {[
                { label: 'Pricing', href: '/pricing' },
                { label: 'Contact', href: '/contact' },
                { label: 'FAQ', href: '/faq' },
                { label: 'Support', href: '/support' },
              ].map((item) => (
                <li key={item.label}>
                  <Link 
                    href={item.href}
                    className="text-charcoal-400 hover:text-white transition-colors font-bold text-sm tracking-tight inline-flex items-center gap-2 group"
                  >
                    {item.label} <ArrowRight size={12} className="opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal Links - only pages that actually exist */}
          <div>
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-emerald-500 mb-6">Legal</h3>
            <ul className="space-y-4">
              {[
                { label: 'Privacy Policy', href: '/privacy' },
                { label: 'Terms of Service', href: '/terms' },
              ].map((item) => (
                <li key={item.label}>
                  <Link 
                    href={item.href}
                    className="text-charcoal-400 hover:text-white transition-colors font-bold text-sm tracking-tight inline-flex items-center gap-2 group"
                  >
                    {item.label} <ArrowRight size={12} className="opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>

        </div>

        {/* Bottom Banner */}
        <div className="pt-10 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-6">
          <p className="text-charcoal-600 text-xs font-bold">
            &copy; {currentYear} NaijaDrops Logistics Platform. All Rights Reserved.
          </p>
          <div className="flex items-center gap-6 text-[10px] font-black uppercase tracking-widest text-charcoal-600">
            <span className="flex items-center gap-2"><Shield size={14} className="text-emerald-500" /> Secure Payments</span>
            <span className="flex items-center gap-2"><Clock size={14} className="text-emerald-500" /> 24/7 Support</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
'@
$target6 = Resolve-TargetPath "src\components\layout\Footer.jsx" $null
Write-FileContent $target6 $content6

$patchOld0 = @'
  if (rider?.status !== 'approved') {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
        <p className="text-white font-black text-lg">
          {rider?.status === 'pending' ? 'Your application is under review.' :
           rider?.status === 'rejected' ? 'Your rider application was not approved.' :
           'Your rider account is currently paused.'}
        </p>
        <a href="/support" className="text-emerald-400 font-bold text-sm underline">Contact Support</a>
      </div>
    );
  }
'@
$patchNew0 = @'
  if (rider?.status !== 'approved') {
    const status = rider?.status;
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-4 px-6">
        <p className="text-white font-black text-lg">
          {status === 'pending' ? 'Your application is under review.' :
           status === 'rejected' ? 'Your rider application was not approved.' :
           status === 'paused' ? "You've been paused by an admin." :
           'Finish onboarding to start receiving jobs.'}
        </p>
        {status === 'paused' && (
          <p className="text-charcoal-400 text-sm max-w-xs">
            You can't go online right now. This isn't a rejection - message support below and we'll sort it out.
          </p>
        )}
        {(status === 'rejected' || status === 'paused') && rider?.rejection_reason && (
          <div className="w-full max-w-sm bg-white/[0.03] border border-white/10 rounded-2xl p-4 text-left">
            <div className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest mb-1">Reason</div>
            <p className="text-charcoal-300 text-xs">{rider.rejection_reason}</p>
          </div>
        )}
        {status !== 'pending' && status !== 'rejected' && status !== 'paused' && (
          <a href="/rider/onboarding" className="bg-emerald-500 text-charcoal-950 font-black py-3 px-8 rounded-2xl uppercase text-xs tracking-widest">
            Continue Onboarding
          </a>
        )}
        {(status === 'paused') ? (
          <a href="/support" className="bg-emerald-500 text-charcoal-950 font-black py-3 px-8 rounded-2xl uppercase text-xs tracking-widest">
            Message Support
          </a>
        ) : (
          <a href="/support" className="text-emerald-400 font-bold text-sm underline">Contact Support</a>
        )}
      </div>
    );
  }
'@
$patchTarget0 = Resolve-TargetPath "src\app\rider\dashboard\page.jsx" "src\app\rider\(main)\dashboard\page.jsx"
Patch-File $patchTarget0 $patchOld0 $patchNew0 "rider dashboard status gate"

$patchOld1 = @'
        if (rider.status === 'pending' || rider.status === 'approved') {
          setExistingStatus(rider.status);
        } else if (rider.status === 'rejected') {
          setExistingStatus('rejected');
        } else {
          // status is null/draft - resume the form where they left off
'@
$patchNew1 = @'
        if (rider.status === 'pending' || rider.status === 'approved' || rider.status === 'paused') {
          setExistingStatus(rider.status);
        } else if (rider.status === 'rejected') {
          setExistingStatus('rejected');
        } else {
          // status is null/draft - resume the form where they left off
'@
$patchTarget1 = Resolve-TargetPath "src\app\rider\onboarding\page.jsx" $null
Patch-File $patchTarget1 $patchOld1 $patchNew1 "onboarding loadData paused handling"

$patchOld2 = @'
            <button
              onClick={() => { setExistingStatus(null); setStep(1); }}
              className="w-full max-w-sm bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 font-black py-4 rounded-2xl uppercase text-sm tracking-widest mb-4"
            >
              Update & Resubmit
            </button>
          </>
        )}
        <button
          onClick={() => router.push("/support")}
          className="w-full max-w-sm py-4 bg-white/5 border border-white/10 rounded-2xl text-white font-bold text-sm hover:bg-white/10 transition-all"
        >
          Back to Support
        </button>
'@
$patchNew2 = @'
            <button
              onClick={() => { setExistingStatus(null); setStep(1); }}
              className="w-full max-w-sm bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 font-black py-4 rounded-2xl uppercase text-sm tracking-widest mb-4"
            >
              Update & Resubmit
            </button>
          </>
        )}
        {existingStatus === 'paused' && (
          <>
            <div className="w-24 h-24 bg-amber-500/10 border border-amber-500/20 rounded-full flex items-center justify-center mb-8">
              <AlertCircle className="text-amber-500" size={40} />
            </div>
            <h2 className="text-2xl font-black text-white mb-4 font-outfit">You've Been Paused</h2>
            <p className="text-charcoal-400 text-sm leading-relaxed mb-4 max-w-xs">
              This isn't a rejection - you're still a NaijaDrops rider. Message support below and we'll help resolve it so you can go back online.
            </p>
            {formData.rejection_reason && (
              <div className="w-full max-w-sm bg-amber-500/5 border border-amber-500/10 rounded-2xl p-4 mb-8 text-left">
                <div className="text-[10px] font-black text-amber-400 uppercase tracking-widest mb-1">Reason</div>
                <p className="text-charcoal-300 text-xs">{formData.rejection_reason}</p>
              </div>
            )}
          </>
        )}
        <button
          onClick={() => router.push("/support")}
          className="w-full max-w-sm py-4 bg-white/5 border border-white/10 rounded-2xl text-white font-bold text-sm hover:bg-white/10 transition-all"
        >
          Back to Support
        </button>
'@
$patchTarget2 = Resolve-TargetPath "src\app\rider\onboarding\page.jsx" $null
Patch-File $patchTarget2 $patchOld2 $patchNew2 "onboarding paused render branch"


# --- Remove now-dead component: no longer imported by the rewritten list page ---
$driverActionsPath = Get-FullPath "src\app\ops-terminal\drivers\DriverActions.jsx"
if (Test-Path -LiteralPath $driverActionsPath) {
    Backup-Path $driverActionsPath
    Remove-Item -LiteralPath $driverActionsPath -Force
    Write-Host "  REMOVED (dead code, no longer used): src\app\ops-terminal\drivers\DriverActions.jsx" -ForegroundColor Green
}

if (Test-Path -LiteralPath (Get-FullPath ".git")) {
    Write-Host "`nStaging and committing (not pushing):" -ForegroundColor Cyan
    git add -A
    git commit -m "fix: real rider document review (approve/reject/pause with reason), fix admin bootstrap and admins page, simplify footer"
    Write-Host "`nCommitted locally. Push it yourself when ready:" -ForegroundColor Cyan
    Write-Host "  git push" -ForegroundColor White
} else {
    Write-Host "`nNot a git repo - files were written but not committed." -ForegroundColor Yellow
}

Write-Host "`nDone. Backups are in .fix-backup-admin\ if needed." -ForegroundColor Green
Write-Host "Supabase side (trigger fix, ibrahim@naijadrops.tech promoted to admin) was already applied directly." -ForegroundColor Green
Write-Host "Log in as ibrahim@naijadrops.tech and you should land on /ops-terminal/dashboard." -ForegroundColor Green

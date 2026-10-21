"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Lock } from "lucide-react";
import { createClient } from "@/utils/supabase/client";

// Where people land to choose a password: after "Forgot password", and when a rider opens their invitation email.
// Handles both link styles: a session already set by /auth/callback, or tokens carried in the link itself.
export default function UpdatePasswordPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [state, setState] = useState("checking"); // checking | ready | expired | done
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      if (hash.get("error_description")) { if (alive) setState("expired"); return; }
      const at = hash.get("access_token");
      const rt = hash.get("refresh_token");
      if (at && rt) {
        await supabase.auth.setSession({ access_token: at, refresh_token: rt });
        window.history.replaceState(null, "", window.location.pathname); // keep tokens out of the address bar
      }
      for (let i = 0; i < 6; i++) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) { if (alive) setState("ready"); return; }
        await new Promise((r) => setTimeout(r, 400));
      }
      if (alive) setState("expired");
    })();
    return () => { alive = false; };
  }, [supabase]);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("Use at least 8 characters.");
    if (password !== confirm) return setError("The two passwords do not match.");
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) { setBusy(false); return setError(err.message); }
    setState("done");
    setTimeout(() => router.replace("/resolve"), 1200); // /resolve sends each person to their own dashboard
  }

  const input = "w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-ink font-bold text-sm outline-none focus:border-emerald-500";

  return (
    <main className="min-h-screen bg-charcoal-950 flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-[2.5rem] border border-white/10 bg-white/[0.04] p-8 space-y-6">
        <div className="flex items-center gap-3 text-emerald-400">
          <Lock size={22} />
          <h1 className="text-2xl font-black text-ink tracking-tight">Choose a password</h1>
        </div>

        {state === "checking" && <div className="flex justify-center py-8"><Loader2 className="animate-spin text-emerald-500" /></div>}

        {state === "expired" && (
          <div className="space-y-4">
            <p className="text-charcoal-400 text-sm leading-relaxed">
              This link has expired or was already used. Request a new one from the login page (use &quot;Forgot password&quot;), or ask NaijaDrops to send your invitation again.
            </p>
            <Link href="/auth/login" className="block text-center py-4 rounded-2xl bg-emerald-500 text-charcoal-950 font-black text-xs uppercase tracking-widest">Go to login</Link>
          </div>
        )}

        {state === "ready" && (
          <form onSubmit={submit} className="space-y-4">
            <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password (8+ characters)" className={input} />
            <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat the password" className={input} />
            {error && <p className="text-red-400 text-xs font-bold">{error}</p>}
            <button type="submit" disabled={busy} className="w-full py-4 rounded-2xl bg-emerald-500 text-charcoal-950 font-black text-xs uppercase tracking-widest disabled:opacity-60 flex items-center justify-center gap-2">
              {busy ? <Loader2 size={16} className="animate-spin" /> : "Save password"}
            </button>
          </form>
        )}

        {state === "done" && <p className="text-emerald-400 text-sm font-bold">Password saved. Taking you in...</p>}
      </div>
    </main>
  );
}

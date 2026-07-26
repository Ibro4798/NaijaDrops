"use client";

import { useEffect, useState, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Lock, ArrowRight, Loader2, Eye, EyeOff, AlertCircle, CheckCircle2 } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";

function LoginContent() {
  const [mode, setMode] = useState("login"); // overridden below from ?mode= // 'login' | 'signup' | 'reset'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [resetSent, setResetSent] = useState(false);
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next");
  useEffect(() => {
    const urlMode = searchParams.get("mode");
    if (urlMode === "signup" || urlMode === "login" || urlMode === "reset") {
      setMode(urlMode);
    }
  }, [searchParams]);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);

    if (mode === "reset") {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/auth/update-password`,
      });
      if (error) setError(error.message);
      else setResetSent(true);
      setLoading(false);
      return;
    }

    if (mode === "login") {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message === "Invalid login credentials"
          ? "Incorrect email or password."
          : error.message);
        setLoading(false);
        return;
      }
      
      // Let the central resolver handle smart routing based on the actual database role
      if (nextParam) {
        router.replace(nextParam);
      } else {
        router.replace("/resolve");
      }
      return;
    }

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { 
          emailRedirectTo: `${window.location.origin}/auth/callback${nextParam ? `?next=${encodeURIComponent(nextParam)}` : ''}`,
          data: {
             role: sessionStorage.getItem("nd_intended_role") || 'vendor'
          }
        },
      });
      if (error) setError(error.message);
      else {
        if (data.session) {
            // Auto-login succeeded, go to resolver
            if (nextParam) {
                router.replace(nextParam);
            } else {
                router.replace("/resolve");
            }
        } else {
            setInfo("Check your email to verify your account, then sign in.");
        }
      }
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-charcoal-950 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Ambient background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_-10%,#10b98114,transparent_65%)]" />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-emerald-500/[0.04] blur-[120px] rounded-full" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-sm relative z-10"
      >
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2.5 mb-5">
            <div className="w-10 h-10 bg-emerald-500 rounded-[14px] flex items-center justify-center shadow-[0_0_24px_rgba(16,185,129,0.45)]">
              <span className="text-charcoal-950 font-black text-[17px] font-outfit">N</span>
            </div>
            <span className="text-ink font-black text-xl tracking-tight font-outfit">NaijaDrops</span>
          </div>
          <AnimatePresence mode="wait">
            <motion.div key={mode} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
              <h1 className="text-2xl font-black text-ink tracking-tight">
                {mode === "login" ? "Welcome back" : mode === "signup" ? "Create account" : "Reset password"}
              </h1>
              <p className="text-charcoal-500 text-sm mt-1 font-medium">
                {mode === "login" ? "Sign in to continue" : mode === "signup" ? "Start sending packages today" : "We'll send a reset link"}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="bg-white/[0.04] border border-white/[0.08] rounded-[1.75rem] p-6 shadow-2xl">
          <AnimatePresence mode="wait">
            {resetSent ? (
              <motion.div key="sent" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-4">
                <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-500/30">
                  <Mail className="text-emerald-400" size={28} />
                </div>
                <h3 className="text-ink font-bold text-lg mb-2">Check your email</h3>
                <p className="text-charcoal-400 text-sm mb-6 leading-relaxed">
                  Reset link sent to <span className="text-emerald-400 font-semibold">{email}</span>
                </p>
                <button onClick={() => { setMode("login"); setResetSent(false); }}
                  className="text-emerald-500 text-xs font-black uppercase tracking-widest hover:text-emerald-400 transition-colors">
                  ← Back to sign in
                </button>
              </motion.div>
            ) : (
              <motion.form key={mode} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.2 }} onSubmit={handleSubmit} className="space-y-3">

                {/* Email */}
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal-600" size={15} />
                  <input type="email" required placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)}
                    className="w-full bg-charcoal-900/60 border border-white/[0.08] rounded-xl py-3.5 pl-11 pr-4 text-ink placeholder:text-charcoal-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60 transition-all text-sm font-medium" />
                </div>

                {/* Password */}
                {mode !== "reset" && (
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal-600" size={15} />
                    <input type={showPassword ? "text" : "password"} required placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}
                      className="w-full bg-charcoal-900/60 border border-white/[0.08] rounded-xl py-3.5 pl-11 pr-11 text-ink placeholder:text-charcoal-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60 transition-all text-sm font-medium" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-charcoal-600 hover:text-charcoal-300 transition-colors">
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                )}

                {/* Info (success / instructional messages, e.g. "check your inbox") */}
                <AnimatePresence>
                  {info && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                      className="flex items-start gap-2.5 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl overflow-hidden">
                      <CheckCircle2 className="text-emerald-400 shrink-0 mt-0.5" size={13} />
                      <p className="text-emerald-400 text-xs font-medium leading-relaxed">{info}</p>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Error */}
                <AnimatePresence>
                  {error && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                      className="flex items-start gap-2.5 p-3 bg-red-500/10 border border-red-500/20 rounded-xl overflow-hidden">
                      <AlertCircle className="text-red-400 shrink-0 mt-0.5" size={13} />
                      <p className="text-red-400 text-xs font-medium leading-relaxed">{error}</p>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Forgot password link */}
                {mode === "login" && (
                  <div className="text-right -mt-1">
                    <button type="button" onClick={() => { setMode("reset"); setError(null); setInfo(null); }}
                      className="text-charcoal-500 hover:text-emerald-400 text-xs font-medium transition-colors">
                      Forgot password?
                    </button>
                  </div>
                )}

                {/* Submit */}
                <button type="submit" disabled={loading}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-charcoal-950 font-black py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-[0_0_20px_rgba(16,185,129,0.3)] text-sm mt-1">
                  {loading ? <Loader2 className="animate-spin" size={18} /> : (
                    <>{mode === "login" ? "Sign In" : mode === "signup" ? "Create Account" : "Send Reset Link"}
                      <ArrowRight size={15} className="ml-0.5" /></>
                  )}
                </button>

                {/* Mode toggle */}
                <p className="text-center text-charcoal-500 text-xs pt-1">
                  {mode === "login" ? (
                    <>No account?{" "}
                      <button type="button" onClick={() => { setMode("signup"); setError(null); setInfo(null); }}
                        className="text-emerald-500 font-bold hover:text-emerald-400 transition-colors">Sign up free</button>
                    </>
                  ) : (
                    <>Already have an account?{" "}
                      <button type="button" onClick={() => { setMode("login"); setError(null); setInfo(null); }}
                        className="text-emerald-500 font-bold hover:text-emerald-400 transition-colors">Sign in</button>
                    </>
                  )}
                </p>
              </motion.form>
            )}
          </AnimatePresence>
        </div>

        <p className="text-center mt-6 text-charcoal-700 text-[10px] font-bold uppercase tracking-[0.2em]">
          Secure · Encrypted · Kano-Ready
        </p>
      </motion.div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-charcoal-950 flex items-center justify-center">
        <Loader2 className="text-emerald-500 animate-spin" size={32} />
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
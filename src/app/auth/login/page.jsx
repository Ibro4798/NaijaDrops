"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Lock, ArrowRight, Loader2, Eye, EyeOff, AlertCircle } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

export default function LoginPage() {
  const [mode, setMode] = useState("login"); // 'login' | 'signup' | 'reset'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState(null);
  const [resetSent, setResetSent] = useState(false);
  const supabase = createClient();
  const router = useRouter();

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);

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
      router.replace("/resolve");
      return;
    }

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { 
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
             role: sessionStorage.getItem("nd_intended_role") || 'vendor'
          }
        },
      });
      if (error) setError(error.message);
      else {
        if (data.session) {
            // Auto-login succeeded, go to resolver
            router.replace("/resolve");
        } else {
            setError("Check your email to verify your account, then sign in.");
        }
      }
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setGoogleLoading(true);
    setError(null);

    // Get the choice they made on the landing page
    const intendedRole = sessionStorage.getItem("nd_intended_role") || "vendor";

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { 
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        }
      },
    });
    
    if (error) {
      setError(error.message);
      setGoogleLoading(false);
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
            <span className="text-white font-black text-xl tracking-tight font-outfit">NaijaDrops</span>
          </div>
          <AnimatePresence mode="wait">
            <motion.div key={mode} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
              <h1 className="text-2xl font-black text-white tracking-tight">
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
                <h3 className="text-white font-bold text-lg mb-2">Check your email</h3>
                <p className="text-charcoal-400 text-sm mb-6 leading-relaxed">
                  Reset link sent to <span className="text-emerald-400 font-semibold">{email}</span>
                </p>
                <button onClick={() => { setMode("login"); setResetSent(false); }}
                  className="text-emerald-500 text-xs font-black uppercase tracking-widest hover:text-emerald-400 transition-colors">
                  â† Back to sign in
                </button>
              </motion.div>
            ) : (
              <motion.form key={mode} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.2 }} onSubmit={handleSubmit} className="space-y-3">

                {/* Google */}
                {mode !== "reset" && (
                  <button type="button" onClick={handleGoogle} disabled={googleLoading}
                    className="w-full flex items-center justify-center gap-3 py-3.5 bg-white hover:bg-gray-50 text-charcoal-900 font-semibold rounded-xl transition-all text-sm active:scale-[0.98] disabled:opacity-60 shadow-sm">
                    {googleLoading ? <Loader2 className="animate-spin text-charcoal-400" size={18} /> : <GoogleIcon />}
                    Continue with Google
                  </button>
                )}

                {mode !== "reset" && (
                  <div className="flex items-center gap-3 py-1">
                    <div className="h-px flex-1 bg-white/[0.08]" />
                    <span className="text-charcoal-600 text-[11px] font-bold uppercase tracking-widest">or</span>
                    <div className="h-px flex-1 bg-white/[0.08]" />
                  </div>
                )}

                {/* Email */}
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal-600" size={15} />
                  <input type="email" required placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)}
                    className="w-full bg-charcoal-900/60 border border-white/[0.08] rounded-xl py-3.5 pl-11 pr-4 text-white placeholder:text-charcoal-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60 transition-all text-sm font-medium" />
                </div>

                {/* Password */}
                {mode !== "reset" && (
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal-600" size={15} />
                    <input type={showPassword ? "text" : "password"} required placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}
                      className="w-full bg-charcoal-900/60 border border-white/[0.08] rounded-xl py-3.5 pl-11 pr-11 text-white placeholder:text-charcoal-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60 transition-all text-sm font-medium" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-charcoal-600 hover:text-charcoal-300 transition-colors">
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                )}

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
                    <button type="button" onClick={() => { setMode("reset"); setError(null); }}
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
                      <button type="button" onClick={() => { setMode("signup"); setError(null); }}
                        className="text-emerald-500 font-bold hover:text-emerald-400 transition-colors">Sign up free</button>
                    </>
                  ) : (
                    <>Already have an account?{" "}
                      <button type="button" onClick={() => { setMode("login"); setError(null); }}
                        className="text-emerald-500 font-bold hover:text-emerald-400 transition-colors">Sign in</button>
                    </>
                  )}
                </p>
              </motion.form>
            )}
          </AnimatePresence>
        </div>

        <p className="text-center mt-6 text-charcoal-700 text-[10px] font-bold uppercase tracking-[0.2em]">
          Secure Â· Encrypted Â· Kano-Ready
        </p>
      </motion.div>
    </main>
  );
}

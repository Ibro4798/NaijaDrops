# apply-login-contact-fixes.ps1
# Run from repo root: C:\Users\T450s\Documents\logistics welcome soon page
#
# What this does:
# 1. Removes the "Continue with Google" button + divider from the login page
# 2. Makes the "Check your email to verify your account" message a GREEN box
#    instead of the red error box
# 3. Removes the "Email Us" option from the Contact page (WhatsApp, Instagram,
#    and Call Support remain)

$ErrorActionPreference = "Stop"

$loginPath   = "src\app\auth\login\page.jsx"
$contactPath = "src\app\contact\page.jsx"

foreach ($p in @($loginPath, $contactPath)) {
    if (-not (Test-Path $p)) {
        Write-Host "ERROR: Cannot find $p — run this script from the repo root." -ForegroundColor Red
        exit 1
    }
}

# Backup originals first
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
Copy-Item $loginPath   "$loginPath.bak_$stamp"
Copy-Item $contactPath "$contactPath.bak_$stamp"
Write-Host "Backed up originals with .bak_$stamp suffix" -ForegroundColor DarkGray

# --- login/page.jsx ---
$loginContent = @'
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
'@
[System.IO.File]::WriteAllText((Resolve-Path $loginPath), $loginContent, (New-Object System.Text.UTF8Encoding($true)))
Write-Host "Updated $loginPath" -ForegroundColor Green

# --- contact/page.jsx ---
$contactContent = @'
"use client";

import { Instagram, Phone, ArrowLeft, MessageCircle, Clock, MapPin } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function Contact() {
  const router = useRouter();

  const contactOptions = [
    {
      name: "WhatsApp Support",
      icon: <MessageCircle className="w-8 h-8 text-emerald-500" />,
      description: "Chat with us for instant assistance",
      link: "https://wa.me/message/3756ZAFK6RTTI1",
      label: "Open WhatsApp",
      color: "bg-emerald-50 text-emerald-700"
    },
    {
      name: "Instagram",
      icon: <Instagram className="w-8 h-8 text-pink-600" />,
      description: "Follow us for updates and DM support",
      link: "https://www.instagram.com/naija.drops?igsh=bW5nN3ExbXJrZGo4",
      label: "@naija.drops",
      color: "bg-pink-50 text-pink-700"
    },
    {
      name: "Call Support",
      icon: <Phone className="w-8 h-8 text-charcoal-700" />,
      description: "Call us for urgent delivery issues",
      link: "tel:+2349118267433",
      label: "+234 911 826 7433",
      color: "bg-gray-100 text-[#18181b]"
    }
  ];

  return (
    <main className="min-h-[100dvh] bg-charcoal-50 pt-[calc(6rem+var(--safe-top))] px-4 pb-20">
      <div className="max-w-xl mx-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
            <button 
              onClick={() => router.back()} 
              className="w-12 h-12 bg-white flex items-center justify-center rounded-2xl shadow-sm border border-gray-100 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <h1 className="text-3xl font-black text-[#18181b] tracking-tight">Contact Us</h1>
            <div className="w-12 h-12"></div> {/* Spacer */}
        </div>

        {/* Support Card Container */}
        <div className="space-y-6">
          {contactOptions.map((opt, i) => (
            <Link 
              key={i} 
              href={opt.link} 
              target="_blank"
              className="block bg-white p-6 rounded-[2.5rem] border border-gray-100 shadow-sm hover:shadow-2xl hover:scale-[1.02] transition-all group"
            >
              <div className="flex items-center gap-5">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform ${opt.color}`}>
                  {opt.icon}
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-black text-[#18181b] mb-1">{opt.name}</h2>
                  <p className="text-charcoal-500 font-medium text-sm mb-3">{opt.description}</p>
                  <div className={`inline-block px-4 py-1.5 rounded-full font-bold text-xs uppercase tracking-widest ${opt.color}`}>
                    {opt.label}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Operating Hours & Location */}
        <div className="mt-12 bg-[#18181b] rounded-[2.5rem] p-8 text-white relative overflow-hidden shadow-2xl">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-12 -mt-12"></div>
            <h3 className="text-lg font-black uppercase tracking-widest text-emerald-400 mb-6 font-mono text-center">NaijaDrops Kano</h3>
            
            <div className="space-y-5">
              <div className="flex items-start gap-4">
                <div className="bg-white/10 p-2 rounded-xl border border-white/10 mt-1"><Clock size={16} /></div>
                <div>
                    <div className="font-bold text-white">Daily Operations</div>
                    <div className="text-charcoal-400 text-sm font-medium">8:00 AM — 9:00 PM</div>
                </div>
              </div>
              
              <div className="flex items-start gap-4">
                <div className="bg-white/10 p-2 rounded-xl border border-white/10 mt-1"><MapPin size={16} /></div>
                <div>
                    <div className="font-bold text-white">Service Area</div>
                    <div className="text-charcoal-400 text-sm font-medium">Full Coverage within the Kano metropolis.</div>
                </div>
              </div>
            </div>
            
            <p className="mt-10 text-center text-[10px] font-black uppercase tracking-[0.2em] text-white/30">
              Premium logistics for everyone.
            </p>
        </div>

      </div>
    </main>
  );
}
'@
[System.IO.File]::WriteAllText((Resolve-Path $contactPath), $contactContent, (New-Object System.Text.UTF8Encoding($true)))
Write-Host "Updated $contactPath" -ForegroundColor Green

Write-Host ""
Write-Host "Done. Review the diff, then:" -ForegroundColor Cyan
Write-Host "  git add $loginPath $contactPath"
Write-Host "  git commit -m 'Remove Google auth, green success message, remove email contact option'"
Write-Host "  git push origin main"

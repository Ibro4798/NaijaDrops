"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { getUserRole, getRoleRedirectPath } from "@/utils/auth";
import { Package, Mail, Lock, User, ArrowRight, Eye, EyeOff, AlertCircle, Zap, Truck, ArrowLeftRight } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedRole = searchParams.get('role') || 'user';
  const accessDenied = searchParams.get('error') === 'access_denied';

  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [errorMsg, setErrorMsg] = useState(accessDenied ? "Access denied. Your account does not have permission for that area." : "");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  // When a role mismatch is detected, store the correct portal link
  const [mismatchPortal, setMismatchPortal] = useState(null);

  const supabase = createClient();

  const isDriverPortal = requestedRole === 'driver';
  const isAdminPortal = requestedRole === 'admin';

  // If already logged in, redirect to matching portal (but enforce role)
  useEffect(() => {
    async function checkExistingSession() {
      const { user, role } = await getUserRole(supabase);
      if (user && role) {
        // If they're on the right portal, redirect
        if (role === 'admin') {
          router.replace('/admin');
          return;
        }
        if ((requestedRole === 'driver' && role === 'driver') ||
            (requestedRole === 'user' && role === 'user')) {
          router.replace(getRoleRedirectPath(role));
          return;
        }
        // Wrong portal — sign them out silently and let them re-auth on the right one
        await supabase.auth.signOut();
      }
      setChecking(false);
    }
    checkExistingSession();
  }, []);

  const handleKeyDown = (e) => {
    setCapsLockOn(e.getModifierState?.("CapsLock") ?? false);
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");
    setMismatchPortal(null);

    try {
      if (isLogin) {
        // Sign in
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;

        // Detect role
        const { role } = await getUserRole(supabase);

        // Admins always get through
        if (role === 'admin') {
          router.replace('/admin');
          return;
        }

        // ── ROLE ENFORCEMENT ──────────────────────────────────────────
        // If user is on the Driver portal but their account is a Customer
        if (requestedRole === 'driver' && role === 'user') {
          await supabase.auth.signOut();
          setErrorMsg("This email is registered as a Customer account. Please use the Customer portal to sign in.");
          setMismatchPortal({ label: "Go to Customer Portal", href: "/login?role=user" });
          return;
        }

        // If user is on the Customer portal but their account is a Driver
        if (requestedRole === 'user' && role === 'driver') {
          await supabase.auth.signOut();
          setErrorMsg("This email is registered as a Driver account. Please use the Driver portal to sign in.");
          setMismatchPortal({ label: "Go to Driver Portal", href: "/login?role=driver" });
          return;
        }

        // Roles match — proceed
        router.replace(getRoleRedirectPath(role || 'user'));

      } else {
        // Sign up — pass the role so the trigger creates the right row
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              role: requestedRole,
            },
          },
        });
        if (signUpError) throw signUpError;

        // Belt-and-suspenders: upsert role row directly
        const { data: { user: newUser } } = await supabase.auth.getUser();
        if (newUser) {
          const targetTable = requestedRole === 'driver' ? 'drivers' : 'customers';
          const payload = {
            id: newUser.id,
            email: newUser.email,
            full_name: fullName,
          };
          
          if (requestedRole === 'driver') {
            payload.driver_status = 'pending';
            payload.is_verified = false;
          }

          await supabase.from(targetTable).upsert(payload, { onConflict: 'id' });
        }

        setErrorMsg("");
        alert("Account created! Please check your email to confirm your address, then sign in.");
        setIsLogin(true);
      }
    } catch (error) {
      setErrorMsg(error.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-[100dvh] aura-gradient flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] aura-gradient flex flex-col justify-center py-12 px-6 relative overflow-hidden">
      {/* Decorative glow */}
      <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-emerald-500/10 rounded-full blur-[120px] -mr-40 -mt-40 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-emerald-500/5 rounded-full blur-[100px] -ml-32 -mb-32 pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="sm:mx-auto sm:w-full sm:max-w-md relative z-10"
      >
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <div className={`w-16 h-16 rounded-[1.5rem] flex items-center justify-center shadow-glow ${isDriverPortal ? 'bg-charcoal-800' : 'bg-emerald-500'}`}>
            {isDriverPortal ? <Truck className="h-8 w-8 text-emerald-400" /> : <Package className="h-8 w-8 text-white" />}
          </div>
        </div>
        <h1 className="text-center text-4xl font-black text-white tracking-tight leading-tight mb-2 font-outfit">
          NaijaDrops
        </h1>
        <p className="text-center text-charcoal-500 font-bold text-[11px] uppercase tracking-[0.25em] mb-10">
          {isDriverPortal ? '🚚 Driver Portal' : isAdminPortal ? '🛡️ Admin Access' : '📦 Customer Portal'}
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="sm:mx-auto sm:w-full sm:max-w-md relative z-10"
      >
        <div className="bg-white rounded-[2rem] p-8 sm:p-10 shadow-premium">
          {/* Header row */}
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-2xl font-black text-charcoal-900">
              {isLogin ? "Sign In" : "Create Account"}
            </h2>
            <button
              onClick={() => { setIsLogin(!isLogin); setErrorMsg(""); setMismatchPortal(null); }}
              className="text-[11px] font-black text-emerald-600 uppercase tracking-widest hover:text-emerald-700 transition-colors"
            >
              {isLogin ? "New account?" : "Sign in instead"}
            </button>
          </div>

          {/* Error banner */}
          {errorMsg && (
            <div className={`mb-6 p-5 rounded-[2rem] border-2 flex flex-col gap-4 animate-in slide-in-from-top-2 duration-300 ${mismatchPortal ? 'bg-amber-50 border-amber-100 text-amber-900' : 'bg-red-50 border-red-100 text-red-900'}`}>
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${mismatchPortal ? 'bg-amber-500/20 text-amber-600' : 'bg-red-500/20 text-red-600'}`}>
                    <AlertCircle size={20} />
                </div>
                <div className="pt-1">
                    <p className="text-xs font-black uppercase tracking-widest leading-none mb-1 opacity-60">System Notification</p>
                    <p className="text-sm font-bold leading-tight">{errorMsg}</p>
                </div>
              </div>

              {/* Direct link to the correct portal - HIGH VISIBILITY ACTION */}
              {mismatchPortal && (
                <Link
                  href={mismatchPortal.href}
                  className="flex items-center justify-center gap-3 bg-charcoal-900 text-white px-6 py-4 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] hover:bg-black transition-all shadow-xl hover:-translate-y-0.5 active:scale-95"
                >
                  <ArrowLeftRight size={16} className="text-emerald-400" />
                  {mismatchPortal.label}
                </Link>
              )}
            </div>
          )}

          <form className="space-y-4" onSubmit={handleAuth}>
            {/* Full Name (signup only) */}
            {!isLogin && (
              <div>
                <label className="block text-[11px] font-black text-charcoal-500 uppercase tracking-widest mb-1.5">Full Name</label>
                <div className="relative">
                  <User size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal-400" />
                  <input
                    type="text"
                    required
                    placeholder="Your full name"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    className="block w-full pl-11 pr-4 py-3.5 bg-charcoal-50 border border-charcoal-200 rounded-xl text-charcoal-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all placeholder:text-charcoal-300 text-sm font-medium"
                  />
                </div>
              </div>
            )}

            {/* Email */}
            <div>
              <label className="block text-[11px] font-black text-charcoal-500 uppercase tracking-widest mb-1.5">Email</label>
              <div className="relative">
                <Mail size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal-400" />
                <input
                  type="email"
                  required
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="block w-full pl-11 pr-4 py-3.5 bg-charcoal-50 border border-charcoal-200 rounded-xl text-charcoal-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all placeholder:text-charcoal-300 text-sm font-medium"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-[11px] font-black text-charcoal-500 uppercase tracking-widest mb-1.5">Password</label>
              <div className="relative">
                <Lock size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  onKeyDown={handleKeyDown}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="block w-full pl-11 pr-12 py-3.5 bg-charcoal-50 border border-charcoal-200 rounded-xl text-charcoal-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all placeholder:text-charcoal-300 text-sm font-medium"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-charcoal-400 hover:text-emerald-600 transition-colors"
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              {capsLockOn && (
                <p className="mt-1.5 text-[10px] text-amber-600 font-bold uppercase tracking-widest flex items-center gap-1">
                  <AlertCircle size={11} /> Caps Lock is On
                </p>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className={`w-full flex justify-center items-center gap-2 py-4 text-white rounded-2xl font-black text-sm uppercase tracking-widest focus:outline-none transition-all shadow-lg disabled:opacity-50 group mt-2 ${
                isDriverPortal
                  ? 'bg-charcoal-800 hover:bg-charcoal-900'
                  : 'bg-charcoal-900 hover:bg-black'
              }`}
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  {isLogin ? "Sign In" : "Create Account"}
                  <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
                </>
              )}
            </button>
          </form>

          {/* Switch Portal Link */}
          <div className="mt-6 pt-5 border-t border-charcoal-100">
            <Link
              href="/welcome"
              className="w-full flex items-center justify-center gap-2 text-[10px] font-black text-charcoal-400 uppercase tracking-widest hover:text-emerald-600 transition-colors py-2"
            >
              <ArrowLeftRight size={13} />
              {isDriverPortal ? "Not a driver? Switch to Customer" : "Are you a driver? Switch Portal"}
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default function Login() {
  return (
    <Suspense fallback={
      <div className="min-h-screen aura-gradient flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}

"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { getUserRole, getRoleRedirectPath } from "@/utils/auth";
import { Package, Mail, Lock, User, ArrowRight, Eye, EyeOff, AlertCircle, Zap } from "lucide-react";
import { motion } from "framer-motion";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedRole = searchParams.get('role') || 'user';
  const accessDenied = searchParams.get('error') === 'access_denied';

  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true); // checking existing session
  const [errorMsg, setErrorMsg] = useState(accessDenied ? "Access denied. Your account does not have permission for that area." : "");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  const supabase = createClient();

  // If already logged in, redirect immediately
  useEffect(() => {
    async function checkExistingSession() {
      const { user, role } = await getUserRole(supabase);
      if (user && role) {
        router.replace(getRoleRedirectPath(role));
        return;
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

    try {
      if (isLogin) {
        // Sign in
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;

        // Use the single utility — no copy-paste waterfall
        const { role } = await getUserRole(supabase);
        router.replace(getRoleRedirectPath(role || 'user'));

      } else {
        // Sign up — always pass the role so the trigger creates the right row
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              role: requestedRole, // 'user' | 'driver'
            },
          },
        });
        if (signUpError) throw signUpError;

        // Belt-and-suspenders: also upsert the profile row directly
        // in case the trigger is slow or missed.
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const table = requestedRole === 'driver' ? 'drivers' : 'customers';
          await supabase.from(table).upsert({
            id: user.id,
            email: user.email,
            full_name: fullName,
          }, { onConflict: 'id' });
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

  // Show a minimal loading state while checking session
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
          <div className="w-16 h-16 bg-emerald-500 rounded-[1.5rem] flex items-center justify-center shadow-glow">
            <Package className="h-8 w-8 text-white" />
          </div>
        </div>
        <h1 className="text-center text-4xl font-black text-white tracking-tight leading-tight mb-2 font-outfit">
          NaijaDrops
        </h1>
        <p className="text-center text-charcoal-500 font-bold text-[11px] uppercase tracking-[0.25em] mb-10">
          {requestedRole === 'driver' ? '🚚 Driver Portal' : requestedRole === 'admin' ? '🛡️ Admin Access' : '📦 Customer Portal'}
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
              onClick={() => { setIsLogin(!isLogin); setErrorMsg(""); }}
              className="text-[11px] font-black text-emerald-600 uppercase tracking-widest hover:text-emerald-700 transition-colors"
            >
              {isLogin ? "New account?" : "Sign in instead"}
            </button>
          </div>

          {/* Error banner */}
          {errorMsg && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl text-sm font-semibold flex items-start gap-2">
              <AlertCircle size={18} className="shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
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
              className="w-full flex justify-center items-center gap-2 py-4 bg-charcoal-900 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-black focus:outline-none transition-all shadow-lg disabled:opacity-50 group mt-2"
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

          <p className="mt-6 text-center text-[10px] text-charcoal-400 font-bold uppercase tracking-widest flex items-center justify-center gap-1.5">
            <Zap size={12} className="text-emerald-500" /> Secured by NaijaDrops
          </p>
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

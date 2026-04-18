"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { Package, Mail, Lock, User, ArrowRight, Eye, EyeOff, AlertCircle, MapPin, Zap } from "lucide-react";
import { motion } from "framer-motion";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedRole = searchParams.get('role') || 'user';
  
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  const supabase = createClient();
  const accessDenied = searchParams.get('error') === 'access_denied';

  useEffect(() => {
    async function checkUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        let role = 'user';
        const { data: adminProf } = await supabase.from('admins').select('id').eq('id', user.id).maybeSingle();
        if (adminProf) {
            role = 'admin';
        } else {
            const { data: driverProf } = await supabase.from('drivers').select('id').eq('id', user.id).maybeSingle();
            if (driverProf) {
                role = 'driver';
            } else {
                const { data: custProf } = await supabase.from('customers').select('id').eq('id', user.id).maybeSingle();
                if (custProf) role = 'user';
            }
        }

        if (role === 'admin') router.push('/admin');
        else if (role === 'driver') router.push('/driver');
        else router.push('/send');
      }
    }
    checkUser();
  }, [router, supabase]);

  const handleKeyDown = (e) => {
    if (e.getModifierState && e.getModifierState("CapsLock")) {
      setCapsLockOn(true);
    } else {
      setCapsLockOn(false);
    }
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    try {
      if (isLogin) {
        if (requestedRole === 'admin' && !email.endsWith('@naijadrops.tech')) {
          setErrorMsg("Only @naijadrops.tech email addresses can login as an admin.");
          setLoading(false);
          return;
        }

        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;

        let role = 'user';
        const { data: adminProf } = await supabase.from('admins').select('id').eq('id', signInData.user.id).maybeSingle();
        if (adminProf || signInData.user.email?.endsWith('@naijadrops.tech')) {
            role = 'admin';
        } else {
            const { data: driverProf } = await supabase.from('drivers').select('id').eq('id', signInData.user.id).maybeSingle();
            if (driverProf) role = 'driver';
            else {
                const { data: custProf } = await supabase.from('customers').select('id').eq('id', signInData.user.id).maybeSingle();
                if (custProf) role = 'user';
            }
        }

        router.push(role === 'admin' ? '/admin' : role === 'driver' ? '/driver' : '/send');
        router.refresh();
      } else {
        const { error: signUpError, data } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName, role: requestedRole } },
        });
        if (signUpError) throw signUpError;
        alert("Signup successful! You can now log in.");
        setIsLogin(true);
      }
    } catch (error) {
      setErrorMsg(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] aura-gradient flex flex-col justify-center py-12 px-6 relative overflow-hidden">
      {/* Visual Glare */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[120px] -mr-48 -mt-48"></div>
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="sm:mx-auto sm:w-full sm:max-w-md relative z-10"
      >
        <div className="flex justify-center mb-8">
          <div className="w-20 h-20 bg-emerald-500 rounded-[2rem] flex items-center justify-center shadow-glow">
            <Package className="h-10 w-10 text-white" />
          </div>
        </div>
        <h2 className="text-center text-5xl font-black text-white tracking-tight leading-[0.9] mb-4 font-outfit">
          Welcome to <br/>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-emerald-600">NaijaDrops.</span>
        </h2>
        <p className="text-center text-charcoal-400 font-bold tracking-wide uppercase text-xs mb-10">
          Entering as {requestedRole === 'driver' ? 'Verified Driver' : 'Customer'}
        </p>
      </motion.div>

      <motion.div 
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="sm:mx-auto sm:w-full sm:max-w-md relative z-10"
      >
        <div className="glass rounded-[3rem] py-10 px-8 sm:px-12 shadow-premium border-white/10">
          <div className="mb-8 flex justify-between items-center">
            <h3 className="text-2xl font-black text-charcoal-900 tracking-tight">
               {isLogin ? "Sign In" : "Register"}
            </h3>
            <button
               onClick={() => { setIsLogin(!isLogin); setErrorMsg(""); }}
               className="text-xs font-black text-emerald-600 uppercase tracking-widest hover:text-emerald-500 transition-colors"
            >
               {isLogin ? "Need account?" : "Have account?"}
            </button>
          </div>

          {(errorMsg || accessDenied) && (
            <div className="mb-6 bg-red-500/10 border border-red-500/20 text-red-600 px-4 py-3 rounded-2xl text-sm font-bold flex items-center gap-2">
              <AlertCircle size={18} /> 
              {accessDenied ? 'Access denied. Your account does not have admin privileges.' : errorMsg}
            </div>
          )}

          <form className="space-y-5" onSubmit={handleAuth}>
            {!isLogin && (
              <div className="space-y-1">
                <label className="block text-[11px] font-black text-charcoal-500 uppercase tracking-widest ml-1">Full Name</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-charcoal-400 group-focus-within:text-emerald-500 transition-colors">
                    <User size={18} />
                  </div>
                  <input
                    type="text"
                    required
                    className="block w-full pl-12 pr-4 py-4 bg-white/50 border border-charcoal-200 rounded-2xl text-charcoal-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all placeholder:text-charcoal-300"
                    placeholder="John Doe"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="block text-[11px] font-black text-charcoal-500 uppercase tracking-widest ml-1">Email Address</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-charcoal-400 group-focus-within:text-emerald-500 transition-colors">
                  <Mail size={18} />
                </div>
                <input
                  type="email"
                  required
                  className="block w-full pl-12 pr-4 py-4 bg-white/50 border border-charcoal-200 rounded-2xl text-charcoal-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all placeholder:text-charcoal-300"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-black text-charcoal-500 uppercase tracking-widest ml-1">Secure Password</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-charcoal-400 group-focus-within:text-emerald-500 transition-colors">
                  <Lock size={18} />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  onKeyDown={handleKeyDown}
                  className="block w-full pl-12 pr-12 py-4 bg-white/50 border border-charcoal-200 rounded-2xl text-charcoal-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all placeholder:text-charcoal-300"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-charcoal-400 hover:text-emerald-500 transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {capsLockOn && (
                <p className="mt-2 text-[10px] text-amber-600 flex items-center gap-1 font-black uppercase tracking-widest">
                  <AlertCircle size={12} /> Caps Lock is On
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center items-center gap-2 py-5 px-4 bg-charcoal-900 text-white rounded-[2rem] font-black text-lg hover:bg-black focus:outline-none transition-all shadow-premium disabled:opacity-50 group mt-4"
            >
              {loading ? "Establishing..." : isLogin ? "Proceed" : "Create Account"}
              {!loading && <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />}
            </button>
          </form>

          <p className="mt-8 text-center text-[11px] text-charcoal-400 font-bold uppercase tracking-widest flex items-center justify-center gap-2">
            <Zap size={14} className="text-emerald-500" /> Secure Enterprise Identity
          </p>
        </div>
      </motion.div>
    </div>
  );
}

export default function Login() {
  return (
    <Suspense fallback={<div className="min-h-screen aura-gradient flex items-center justify-center"><div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div></div>}>
      <LoginContent />
    </Suspense>
  );
}

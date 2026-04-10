"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { Package, Mail, Lock, User, ArrowRight, Eye, EyeOff, AlertCircle, MapPin } from "lucide-react";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedRole = searchParams.get('role') || 'user';
  
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);

  // Form State
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  const supabase = createClient();

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

  const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const isStrongPassword = (pwd) => pwd.length >= 8 && /[A-Z]/.test(pwd) && /[a-z]/.test(pwd) && /[0-9]/.test(pwd);

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    // Frontend Validations for Sign Up
    if (!isLogin) {
      if (!isValidEmail(email)) {
        setErrorMsg("Please enter a valid email address.");
        setLoading(false);
        return;
      }
      if (requestedRole === 'admin' && !email.endsWith('@naijadrops.tech')) {
        setErrorMsg("Only @naijadrops.tech email addresses can register or login as an admin.");
        setLoading(false);
        return;
      }
      if (!isStrongPassword(password)) {
        setErrorMsg("Password must be at least 8 characters and include uppercase, lowercase, and a number.");
        setLoading(false);
        return;
      }
    }

    try {
      if (isLogin) {
        // Sign In
        if (requestedRole === 'admin' && !email.endsWith('@naijadrops.tech')) {
          setErrorMsg("Only @naijadrops.tech email addresses can login as an admin.");
          setLoading(false);
          return;
        }

        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;

        // Unified Role-Based Redirection
        let role = 'user';
        const { data: adminProf } = await supabase.from('admins').select('id').eq('id', signInData.user.id).maybeSingle();
        if (adminProf) {
            role = 'admin';
        } else {
            const { data: driverProf } = await supabase.from('drivers').select('id').eq('id', signInData.user.id).maybeSingle();
            if (driverProf) {
                role = 'driver';
            } else {
                const { data: custProf } = await supabase.from('customers').select('id').eq('id', signInData.user.id).maybeSingle();
                if (custProf) role = 'user';
            }
        }

        if (role === 'admin') {
          router.push('/admin');
        } else if (role === 'driver') {
          router.push('/driver');
        } else {
          router.push('/send');
        }
        router.refresh();
      } else {
        // Sign Up - Strict One-Email-One-Role Check
        let existingRole = null;
        let { data: adminExists } = await supabase.from('admins').select('id').eq('email', email).limit(1).maybeSingle();
        if (adminExists) existingRole = 'admin';
        else {
            let { data: driverExists } = await supabase.from('drivers').select('id').eq('email', email).limit(1).maybeSingle();
            if (driverExists) existingRole = 'driver';
            else {
                let { data: custExists } = await supabase.from('customers').select('id').eq('email', email).limit(1).maybeSingle();
                if (custExists) existingRole = 'user';
            }
        }

        if (existingRole) {
          if (existingRole !== requestedRole) {
            setErrorMsg(`This email is already registered as a ${existingRole === 'user' ? 'Customer' : existingRole === 'driver' ? 'Driver' : 'Admin'}. Please use another email or log in with that account.`);
            setLoading(false);
            return;
          } else {
            setErrorMsg("Email already in use. Please log in.");
            setIsLogin(true);
            setLoading(false);
            return;
          }
        }

        // Proceed to Sign Up
        const { error: signUpError, data } = await supabase.auth.signUp({
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

        if (
          data.user &&
          data.user.identities &&
          data.user.identities.length === 0
        ) {
          setErrorMsg("Email already in use. Please log in.");
          setIsLogin(true);
        } else {
          alert("Signup successful! You can now log in with your credentials.");
          setIsLogin(true);
        }
      }
    } catch (error) {
      setErrorMsg(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-charcoal-50 flex flex-col justify-center py-[calc(3rem+var(--safe-top))] sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-emerald-700 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-700/30">
            <Package className="h-10 w-10 text-white" />
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-charcoal-900 tracking-tight">
          {isLogin ? `Sign in as ${requestedRole === 'driver' ? 'Driver' : 'Customer'}` : `Register as ${requestedRole === 'driver' ? 'Driver' : 'Customer'}`}
        </h2>
        <p className="mt-2 text-center text-sm text-charcoal-500 font-medium">
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setErrorMsg("");
            }}
            className="font-bold text-emerald-600 hover:text-emerald-500"
          >
            {isLogin ? "Sign up here" : "Sign in here"}
          </button>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl shadow-gray-200/50 sm:rounded-[2rem] sm:px-10 border border-gray-100">
          {errorMsg && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm font-medium">
              {errorMsg}
            </div>
          )}

          <div className="mt-2" />

          <form className="space-y-6" onSubmit={handleAuth}>
            {!isLogin && (
              <div>
                <label className="block text-sm font-bold text-charcoal-700 mb-1">
                  Full Name
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User size={18} className="text-gray-400" />
                  </div>
                  <input
                    type="text"
                    required
                    className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-xl bg-gray-50 text-charcoal-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                    placeholder="John Doe"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    autoComplete="name"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-bold text-charcoal-700 mb-1">
                Email address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail size={18} className="text-gray-400" />
                </div>
                <input
                  type="email"
                  required
                  className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-xl bg-gray-50 text-charcoal-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  inputMode="email"
                  autoComplete="email"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-baseline mb-1">
                <label className="block text-sm font-bold text-charcoal-700">
                  Password
                </label>
                {!isLogin && (
                  <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Min 8 Chars, 1 Upper, 1 Number</span>
                )}
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock size={18} className="text-gray-400" />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  onKeyDown={handleKeyDown}
                  onKeyUp={handleKeyDown}
                  className="block w-full pl-10 pr-12 py-3 border border-gray-300 rounded-xl bg-gray-50 text-charcoal-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={isLogin ? "current-password" : "new-password"}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-emerald-500 transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {capsLockOn && (
                <p className="mt-2 text-xs text-amber-600 flex items-center gap-1.5 font-bold">
                  <AlertCircle size={14} /> CAPS LOCK IS ON
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center items-center gap-2 py-4 px-4 border border-transparent rounded-2xl shadow-lg shadow-charcoal-900/20 text-sm font-bold text-white bg-charcoal-900 hover:bg-black focus:outline-none transition-all disabled:opacity-50"
            >
              {loading
                ? "Processing..."
                : isLogin
                  ? "Sign in"
                  : "Create Account"}
              {!loading && <ArrowRight size={18} />}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function Login() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-charcoal-50"><div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div></div>}>
      <LoginContent />
    </Suspense>
  );
}

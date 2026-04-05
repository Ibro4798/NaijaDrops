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

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${location.origin}/auth/callback`,
        },
      });
      if (error) throw error;
    } catch (error) {
      setErrorMsg(error.message);
      setLoading(false);
    }
  };

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
      if (!isStrongPassword(password)) {
        setErrorMsg("Password must be at least 8 characters and include uppercase, lowercase, and a number.");
        setLoading(false);
        return;
      }
    }

    try {
      if (isLogin) {
        // Sign In
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;

        // Unified Role-Based Redirection
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', signInData.user.id)
          .single();

        if (profileError) throw profileError;

        if (profile.role === 'admin') {
          router.push('/admin');
        } else if (profile.role === 'driver') {
          router.push('/driver');
        } else {
          router.push('/');
        }
        router.refresh();
      } else {
        // Sign Up - Strict One-Email-One-Role Check
        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('role')
          .eq('email', email)
          .single();

        if (existingProfile) {
          if (existingProfile.role !== requestedRole) {
            setErrorMsg(`This email is already registered as a ${existingProfile.role === 'user' ? 'Customer' : existingProfile.role === 'driver' ? 'Driver' : 'Admin'}. Please use another email or log in with that account.`);
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
          alert("Signup successful! Check your email to verify your account.");
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

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full flex justify-center items-center gap-3 py-3 px-4 border border-gray-200 rounded-2xl bg-white hover:bg-gray-50 text-sm font-bold text-charcoal-700 focus:outline-none transition-all shadow-sm mb-6 disabled:opacity-50"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 15.01 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>
          
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-3 rounded-full bg-white text-gray-400 font-bold uppercase tracking-widest text-[10px]">Or continue with email</span>
            </div>
          </div>

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

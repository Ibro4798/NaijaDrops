"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { MapPin, Package, ShoppingCart, ChevronRight, LayoutDashboard, Truck } from "lucide-react";

export default function Home() {
  const [profile, setProfile] = useState(null);
  const [activeOrders, setActiveOrders] = useState([]);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        setProfile(prof);

        // 1. Check if they are a driver on an active trip
        const { data: driverOrders } = await supabase.from('orders')
          .select('*')
          .eq('driver_id', user.id)
          .in('status', ['accepted', 'arriving_pickup', 'picked_up', 'arriving'])
          .order('created_at', { ascending: false });

        if (driverOrders && driverOrders.length > 0) {
          router.push('/driver');
          return;
        }

        // 2. Check if they are a customer with an active trip
        const { data: orders } = await supabase.from('orders')
          .select('*')
          .eq('user_id', user.id)
          .in('status', ['looking_for_driver', 'awaiting_payment', 'accepted', 'picked_up', 'arriving'])
          .order('created_at', { ascending: false });
        
        if (orders && orders.length > 0) {
          const active = orders[0];
          // Determine where to redirect based on status
          if (active.status === 'looking_for_driver') {
            router.push(`/matching?orderId=${active.id}`);
            return;
          } else if (active.status === 'awaiting_payment') {
            router.push(`/payment?orderId=${active.id}`);
            return;
          } else {
            router.push(`/tracking/${active.id}`);
            return;
          }
        }

        // 3. If no active trip, auto-redirect based on role
        if (prof.role === 'driver' || prof.role === 'admin') {
          router.push(prof.role === 'admin' ? '/admin' : '/driver');
          return;
        } else {
          router.push('/send');
          return;
        }
      }
      setIsCheckingAuth(false);
    }
    loadData();
  }, [supabase, router]);

  // Dual-Entry Landing View (Nexus)
  return (
    <main className="min-h-[100dvh] bg-charcoal-50 pt-[calc(7rem+var(--safe-top))] px-4 pb-[calc(5rem+var(--safe-bottom))]">
      <div className="max-w-4xl mx-auto">
        
        {/* Branding & Welcome */}
        <div className="text-center mb-12">
          {profile ? (
            <div className="animate-in fade-in slide-in-from-top-4 duration-700">
               <h1 className="text-4xl sm:text-5xl font-black text-charcoal-900 tracking-tight mb-2">
                Welcome back, <span className="text-emerald-700">{profile.full_name?.split(' ')[0] || 'User'}</span>
              </h1>
              <p className="text-charcoal-500 font-medium text-lg">Choose your workspace for today.</p>
            </div>
          ) : (
            <div className="animate-in fade-in slide-in-from-top-4 duration-700">
              <h1 className="text-4xl sm:text-5xl font-black text-charcoal-900 tracking-tight mb-4">
                Logistics simplified <br/><span className="text-emerald-700">for everyone.</span>
              </h1>
              <p className="text-charcoal-500 font-medium text-lg max-w-xl mx-auto">
                Drop a Precise Pin anywhere in Kano — no street address needed. Track your load in real-time, pay securely.
              </p>
            </div>
          )}
        </div>

        {/* Roles Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pb-12">
          
          {/* Customer Portal Card */}
          <div 
            className="bg-white rounded-[3rem] p-10 border border-gray-100 shadow-2xl shadow-gray-200/50 hover:shadow-emerald-500/10 transition-all group flex flex-col h-full relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-bl-[5rem] -mr-8 -mt-8 group-hover:bg-emerald-100 transition-colors"></div>
            
            <div className="w-20 h-20 bg-emerald-700 text-white rounded-3xl flex items-center justify-center mb-8 shadow-xl shadow-emerald-700/30 group-hover:scale-110 group-hover:rotate-3 transition-transform relative z-10">
              <Package size={40} />
            </div>
            
            <h2 className="text-4xl font-black text-charcoal-900 mb-4 tracking-tight relative z-10">Customer</h2>
            <p className="text-charcoal-500 font-medium text-lg mb-10 flex-1 relative z-10">
              Send packages across Kano with ease. Track in real-time and pay securely.
            </p>

            {profile ? (
              <Link href="/send" className="flex items-center justify-between w-full py-5 px-8 bg-emerald-700 hover:bg-emerald-800 text-white rounded-2xl font-bold text-xl transition-all shadow-lg hover:shadow-emerald-700/40">
                Go to Dashboard <ChevronRight size={24} />
              </Link>
            ) : (
              <Link href="/login?role=user" className="flex items-center justify-between w-full py-5 px-8 bg-emerald-700 hover:bg-emerald-800 text-white rounded-2xl font-bold text-xl transition-all shadow-lg hover:shadow-emerald-700/40">
                Login / Signup <ChevronRight size={24} />
              </Link>
            )}
          </div>

          {/* Driver Portal Card */}
          <div 
            className="bg-charcoal-900 rounded-[3rem] p-10 shadow-2xl shadow-black/20 hover:shadow-charcoal-900/30 transition-all group flex flex-col h-full border border-charcoal-800 relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-bl-[5rem] -mr-8 -mt-8 group-hover:bg-white/10 transition-colors"></div>

            <div className="w-20 h-20 bg-white/10 text-white rounded-3xl flex items-center justify-center mb-8 backdrop-blur-md group-hover:scale-110 group-hover:-rotate-3 transition-transform border border-white/20 relative z-10 shadow-xl">
              <Truck size={40} />
            </div>
            
            <h2 className="text-4xl font-black text-white mb-4 tracking-tight relative z-10">Driver</h2>
            <p className="text-charcoal-300 font-medium text-lg mb-10 flex-1 relative z-10">
              Receive delivery requests, navigate smoothly, and build your earnings today.
            </p>

            {profile?.role === 'driver' || profile?.role === 'admin' ? (
              <Link href="/driver" className="flex items-center justify-between w-full py-5 px-8 bg-white text-charcoal-900 hover:bg-gray-100 rounded-2xl font-bold text-xl transition-all shadow-lg">
                Driver Console <LayoutDashboard size={24} />
              </Link>
            ) : (
              <Link href="/login?role=driver" className="flex items-center justify-between w-full py-5 px-8 bg-white text-charcoal-900 hover:bg-gray-100 rounded-2xl font-bold text-xl transition-all shadow-lg">
                Join our Fleet <ChevronRight size={24} />
              </Link>
            )}
          </div>
        </div>

        {/* Fix 2: Low-Friction Feature Preview for Unauthenticated Users */}
        {!profile && !isCheckingAuth && (
          <div className="mb-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <p className="text-center text-charcoal-400 font-semibold text-sm uppercase tracking-widest mb-6">How it works</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm text-center">
                <div className="text-4xl mb-3">📍</div>
                <h3 className="font-black text-charcoal-900 text-lg mb-1">Drop a Precise Pin</h3>
                <p className="text-charcoal-400 text-sm">No address? No problem. Pin any gate, shop, or warehouse in Kano.</p>
              </div>
              <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm text-center">
                <div className="text-4xl mb-3">🚚</div>
                <h3 className="font-black text-charcoal-900 text-lg mb-1">Track in Real-Time</h3>
                <p className="text-charcoal-400 text-sm">Watch your driver navigate directly to your pin. No more &ldquo;where are you?&rdquo; calls.</p>
              </div>
              <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm text-center">
                <div className="text-4xl mb-3">💳</div>
                <h3 className="font-black text-charcoal-900 text-lg mb-1">Pay on Delivery</h3>
                <p className="text-charcoal-400 text-sm">Secure payment released only when your load arrives safely.</p>
              </div>
            </div>
            <div className="text-center mt-6">
              <a
                href="/login?role=user"
                className="inline-flex items-center gap-2 text-emerald-700 font-bold text-base hover:underline"
              >
                Try it free — takes 2 minutes →
              </a>
            </div>
          </div>
        )}

        {/* Active Orders Section (Only for Customers) */}
        {profile && activeOrders.length > 0 && (
          <div className="mt-8 animate-in fade-in slide-in-from-bottom-8 duration-1000">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-black text-charcoal-900 tracking-tight">Your Active Deliveries</h3>
              <Link href="/history" className="text-emerald-700 font-bold hover:underline">View History</Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {activeOrders.map(order => (
                <Link 
                  href={`/tracking/${order.id}`} 
                  key={order.id} 
                  className="bg-white border border-gray-100 rounded-[2rem] p-6 shadow-sm flex items-center justify-between group cursor-pointer transition-all hover:shadow-md hover:-translate-y-1"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center font-bold">
                       {order.status === 'looking_for_driver' ? '🔎' : '🚚'}
                    </div>
                    <div>
                      <div className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-0.5">{order.status.split('_').join(' ')}</div>
                      <div className="font-bold text-charcoal-900 text-lg line-clamp-1">{order.dropoff_name}</div>
                    </div>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center group-hover:bg-emerald-700 group-hover:text-white transition-colors">
                    <ChevronRight size={20} />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Trust Indicators */}
        <div className="mt-16 pt-12 border-t border-gray-200 flex flex-wrap justify-center gap-12 opacity-60 grayscale hover:grayscale-0 transition-all duration-500">
           <div className="flex items-center gap-3 font-bold text-charcoal-500"><span className="text-3xl">🛡️</span> Secure Payments</div>
           <div className="flex items-center gap-3 font-bold text-charcoal-500"><span className="text-3xl">📍</span> Real-time Tracking</div>
           <div className="flex items-center gap-3 font-bold text-charcoal-500"><span className="text-3xl">✅</span> Verified Drivers</div>
        </div>

      </div>
    </main>
  );
}

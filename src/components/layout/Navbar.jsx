"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Package, LogOut, Shield, User, Wallet, ArrowRight } from "lucide-react";
import { createClient } from "@/utils/supabase/client";

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const [profile, setProfile] = useState(null);
  const [activeOrder, setActiveOrder] = useState(null);

  useEffect(() => {
    let profileChannel;
    let ordersChannel;

    async function setupProfile() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        let role = 'user';
        try {
            const [adminRes, driverRes, customerRes] = await Promise.all([
                supabase.from('admins').select('id').eq('id', user.id).maybeSingle(),
                supabase.from('drivers').select('id').eq('id', user.id).maybeSingle(),
                supabase.from('customers').select('id').eq('id', user.id).maybeSingle()
            ]);

            if (adminRes.data) {
                role = 'admin';
            } else if (driverRes.data) {
                role = 'driver';
            } else if (customerRes.data) {
                role = 'user';
            }
        } catch (err) {
            console.error("Navbar profile check error:", err);
        }
        
        setProfile({ role });

        // If they are a standard user, check for active orders and subscribe
        if (role === 'user') {
            const checkActiveOrder = async () => {
                const { data: orders } = await supabase.from('orders')
                  .select('id, status')
                  .eq('user_id', user.id)
                  .in('status', ['looking_for_driver', 'awaiting_payment', 'accepted', 'picked_up', 'arriving'])
                  .order('created_at', { ascending: false })
                  .limit(1);
                  
                if (orders && orders.length > 0) {
                    setActiveOrder(orders[0]);
                } else {
                    setActiveOrder(null);
                }
            };
            
            await checkActiveOrder();

            ordersChannel = supabase.channel(`public:orders:user_id=eq.${user.id}`)
              .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'orders',
                filter: `user_id=eq.${user.id}`
              }, () => {
                 checkActiveOrder();
              }).subscribe();
        }
      }
    }
    setupProfile();

    return () => {
      if (profileChannel) supabase.removeChannel(profileChannel);
      if (ordersChannel) supabase.removeChannel(ordersChannel);
    };
  }, [supabase]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  // Hide Navbar on Admin pages to avoid double nav
  if (pathname?.startsWith('/admin')) return null;

  return (
    <nav className="fixed top-0 left-0 right-0 z-[100] bg-white/80 backdrop-blur-md border-b border-gray-100 transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 sm:h-20 items-center">
          <Link href="/" className="flex-shrink-0 flex items-center h-12">
            <img 
              src="/logo.png" 
              alt="NaijaDrops" 
              className="h-full w-auto object-contain"
            />
          </Link>
          
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-1 bg-white/50 backdrop-blur-sm border border-gray-200 rounded-xl shadow-sm p-1">
              <Link 
                href="/contact" 
                className="text-xs sm:text-sm font-bold px-3 py-1.5 text-charcoal-600 hover:text-emerald-700 transition-all rounded-lg"
              >
                Contact
              </Link>
              <div className="h-4 w-px bg-gray-200" />
              <a 
                href="https://wa.me/2348000000000?text=Hi%20NaijaDrops%2C%20I%20want%20to%20test%20the%20app%20and%20give%20feedback."
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 rounded-lg transition-colors flex items-center justify-center animate-pulse"
                title="Chat on WhatsApp"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
              </a>
            </div>
            {profile?.role === 'admin' && (
              <Link 
                href="/admin" 
                className="text-xs sm:text-sm font-black flex items-center gap-2 bg-blue-50 text-blue-700 border border-blue-100 px-4 py-2 rounded-xl hover:bg-blue-100 transition-all font-mono"
              >
                <Shield size={16} /> Admin
              </Link>
            )}

            {profile?.role === 'driver' && (
              <Link 
                href="/driver/wallet" 
                className="text-xs sm:text-sm font-black flex items-center gap-2 bg-emerald-50 text-emerald-700 border border-emerald-100 px-4 py-2 rounded-xl hover:bg-emerald-100 transition-all"
              >
                <Wallet size={16} /> Wallet
              </Link>
            )}

            {/* Global Active Trip Shortcut for Customers */}
            {profile?.role === 'user' && activeOrder && !pathname?.startsWith('/driver') && (
               <Link 
                 href={
                   activeOrder.status === 'looking_for_driver' ? `/matching?orderId=${activeOrder.id}` :
                   activeOrder.status === 'awaiting_payment' ? `/payment?orderId=${activeOrder.id}` :
                   `/tracking/${activeOrder.id}`
                 }
                 className="text-[10px] sm:text-xs font-black flex items-center gap-2 bg-charcoal-900 text-white border border-charcoal-800 shadow-md shadow-charcoal-900/10 px-3 sm:px-4 py-2 rounded-xl hover:bg-charcoal-800 transition-all uppercase tracking-widest relative"
               >
                 <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white"></div>
                 <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full animate-ping"></div>
                 Active Trip
               </Link>
            )}

            {profile && (
              <button 
                onClick={handleLogout}
                className="p-2 text-charcoal-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                title="Logout"
              >
                <LogOut size={20} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Aggressive Floating Notification Banner for Customers */}
      {profile?.role === 'user' && activeOrder && !pathname?.startsWith('/driver') && (
          <div className="absolute top-[100%] left-0 right-0 p-4 animate-in slide-in-from-top-4 fade-in duration-500 z-50">
            <Link 
              href={
                activeOrder.status === 'looking_for_driver' ? `/matching?orderId=${activeOrder.id}` :
                activeOrder.status === 'awaiting_payment' ? `/payment?orderId=${activeOrder.id}` :
                `/tracking/${activeOrder.id}`
              }
              className={`block max-w-2xl mx-auto shadow-2xl rounded-2xl p-4 sm:p-5 border flex items-center justify-between group cursor-pointer transition-all hover:scale-[1.02] ${
                activeOrder.status === 'awaiting_payment' ? 'bg-amber-400 border-amber-500' : 
                activeOrder.status === 'looking_for_driver' ? 'bg-blue-500 border-blue-600' :
                'bg-emerald-500 border-emerald-600'
              }`}
            >
               <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${
                     activeOrder.status === 'awaiting_payment' ? 'bg-amber-500 text-white' : 
                     activeOrder.status === 'looking_for_driver' ? 'bg-blue-600 text-white' :
                     'bg-emerald-600 text-white'
                  }`}>
                     {activeOrder.status === 'awaiting_payment' ? <Wallet size={24} className="animate-pulse" /> : <Package size={24} />}
                  </div>
                  <div>
                     <div className="font-black text-charcoal-900 text-sm sm:text-base uppercase tracking-tight">
                        {activeOrder.status === 'awaiting_payment' ? 'Driver Accepted Quotation!' : 
                         activeOrder.status === 'looking_for_driver' ? 'Searching for Drivers...' :
                         'Delivery in Progress!'}
                     </div>
                     <div className="text-xs sm:text-sm text-charcoal-900/80 font-bold leading-tight mt-0.5">
                        {activeOrder.status === 'awaiting_payment' ? 'Review and complete payment to start the trip.' : 
                         activeOrder.status === 'looking_for_driver' ? 'Waiting for drivers to accept your base offer.' :
                         'Driver is en-route. Click to view live map.'}
                     </div>
                  </div>
               </div>
               
               <div className="bg-charcoal-900 text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest hidden sm:flex items-center gap-2 group-hover:bg-charcoal-800 transition-colors shrink-0">
                  Open <ArrowRight size={14} />
               </div>
            </Link>
          </div>
      )}
    </nav>
  );
}

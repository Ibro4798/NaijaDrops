"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { ArrowLeft, Clock, MapPin, Package, History as HistoryIcon, ChevronRight } from 'lucide-react';
import Link from 'next/link';

export default function VendorHistoryPage() {
    const router = useRouter();
    const supabase = createClient();
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchHistory() {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) {
                    router.push('/auth/login');
                    return;
                }

                // Fetch vendor ID first
                const { data: vendorProfile } = await supabase
                    .from('vendors')
                    .select('id')
                    .eq('user_id', user.id)
                    .single();

                if (!vendorProfile) {
                    setOrders([]);
                    setLoading(false);
                    return;
                }

                const { data, error } = await supabase
                    .from('orders')
                    .select('*, riders!rider_id(user_id, vehicle_type)')
                    .eq('vendor_id', vendorProfile.id)
                    .order('created_at', { ascending: false });

                if (error) throw error;
                setOrders(data || []);
            } catch (err) {
                console.error("Failed to fetch history:", err);
            } finally {
                setLoading(false);
            }
        }
        fetchHistory();
    }, [supabase, router]);

    const getStatusStyle = (status) => {
        switch (status) {
            case 'delivered': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
            case 'pending': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
            case 'in_transit': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
            default: return 'bg-white/10 text-charcoal-400 border-white/10';
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Link href="/vendor/dashboard" className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors border border-white/10">
                    <ArrowLeft size={20} className="text-white" />
                </Link>
                <div>
                    <h1 className="text-3xl font-black text-white tracking-tight font-outfit italic">
                        Operation <span className="text-emerald-500 text-outfit italic">History</span>
                    </h1>
                    <p className="text-charcoal-400 text-sm font-medium">Registry of all city-wide dispatches.</p>
                </div>
            </div>

            {loading ? (
                <div className="space-y-4">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="bg-white/[0.03] rounded-[2rem] p-6 border border-white/10 h-32 animate-pulse" />
                    ))}
                </div>
            ) : orders.length === 0 ? (
                <div className="bg-white/[0.03] border border-white/10 rounded-[2.5rem] p-12 text-center flex flex-col items-center justify-center">
                    <div className="w-20 h-20 bg-charcoal-900 rounded-full flex items-center justify-center mb-6 border border-white/5">
                        <Package size={40} className="text-charcoal-600" />
                    </div>
                    <h2 className="text-xl font-black text-white mb-2">No active records found.</h2>
                    <p className="text-charcoal-500 mb-8 max-w-xs mx-auto text-sm">Initialize your first delivery to start logging operations.</p>
                    <Link href="/send-package/step-1" className="bg-emerald-500 text-charcoal-950 font-black py-4 px-8 rounded-2xl shadow-glow hover:bg-emerald-400 transition-all uppercase tracking-widest text-xs">
                        Dispatch Load
                    </Link>
                </div>
            ) : (
                <div className="space-y-4">
                    {orders.map((order) => (
                        <Link 
                            href={`/tracking/${order.id}`} 
                            key={order.id}
                            className="group block bg-white/[0.03] hover:bg-white/[0.05] rounded-[2rem] p-6 border border-white/10 transition-all hover:border-emerald-500/30 overflow-hidden relative"
                        >
                            <div className="absolute top-0 right-0 p-6 flex flex-col items-end">
                                <div className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border ${getStatusStyle(order.status)}`}>
                                    {order.status}
                                </div>
                                <div className="mt-2 text-2xl font-black text-white italic tracking-tighter">â‚¦{order.agreed_price?.toLocaleString()}</div>
                            </div>

                            <div className="flex items-start gap-4 mb-6">
                                <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500 border border-emerald-500/20">
                                    <Package size={24} />
                                </div>
                                <div>
                                    <div className="text-[10px] font-black tracking-widest text-charcoal-500 uppercase mb-1">
                                        ID: {order.id.slice(0, 8)} â€¢ {new Date(order.created_at).toLocaleDateString()}
                                    </div>
                                    <h3 className="text-lg font-black text-white font-outfit uppercase tracking-tight">{order.item_category || 'General Package'}</h3>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-white/5 pt-6">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-charcoal-900 flex items-center justify-center text-emerald-500 border border-white/5">
                                        <MapPin size={16} />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="text-[9px] font-black text-charcoal-600 uppercase tracking-widest font-outfit">Origin</div>
                                        <div className="text-sm font-bold text-white truncate max-w-[200px]">{order.pickup_name}</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-charcoal-900 flex items-center justify-center text-emerald-500 border border-white/5">
                                        <Navigation size={16} />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="text-[9px] font-black text-charcoal-600 uppercase tracking-widest font-outfit italic">Terminal</div>
                                        <div className="text-sm font-bold text-white truncate max-w-[200px]">{order.dropoff_name}</div>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="mt-6 flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-charcoal-400 group-hover:text-emerald-500 transition-colors">
                                <span>Rider ID: {order.rider_id ? order.rider_id.slice(0, 8) : 'AWAITING ASSIGNMENT'}</span>
                                <div className="flex items-center gap-2">View Analysis <ChevronRight size={14} /></div>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}

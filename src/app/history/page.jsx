"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { ArrowLeft, Clock, MapPin, Package, History } from 'lucide-react';
import Link from 'next/link';

export default function HistoryPage() {
    const router = useRouter();
    const supabase = createClient();
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchHistory() {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) {
                    router.push('/login');
                    return;
                }

                const { data, error } = await supabase
                    .from('orders')
                    .select('*, driver:drivers!driver_id(full_name, vehicle_type)')
                    .eq('user_id', user.id)
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

    const getStatusColor = (status) => {
        if (status === 'delivered') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
        if (status === 'cancelled') return 'bg-red-100 text-red-700 border-red-200';
        if (status === 'scheduled') return 'bg-blue-100 text-blue-700 border-blue-200';
        return 'bg-blue-100 text-blue-700 border-blue-200';
    };

    const getStatusText = (order) => {
        if (order.status === 'delivered') return 'Completed';
        if (order.status === 'cancelled') return 'Cancelled';
        if (order.scheduled_at && new Date(order.scheduled_at) > new Date()) return 'Scheduled';
        return 'In Progress';
    };

    return (
        <main className="bg-gray-50 min-h-screen pt-24 pb-32">
            <div className="max-w-xl mx-auto px-4 sm:px-6">
                
                {/* Header */}
                <div className="flex items-center gap-3 mb-8">
                    <button onClick={() => router.back()} className="w-10 h-10 bg-white hover:bg-gray-100 rounded-full flex items-center justify-center shadow-sm border border-gray-200 transition-colors">
                        <ArrowLeft size={20} className="text-charcoal-700" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-extrabold text-charcoal-900 tracking-tight">Your Deliveries</h1>
                        <p className="text-charcoal-500 font-medium text-sm flex items-center gap-1">
                            <History size={12} /> Past and ongoing orders
                        </p>
                    </div>
                </div>

                {loading ? (
                    <div className="space-y-4">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="bg-white rounded-3xl p-5 border border-gray-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] h-32 animate-pulse">
                                <div className="h-4 bg-gray-200 rounded w-1/3 mb-4"></div>
                                <div className="h-4 bg-gray-200 rounded w-2/3 mb-2"></div>
                                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                            </div>
                        ))}
                    </div>
                ) : orders.length === 0 ? (
                    <div className="text-center py-20">
                        <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
                            <Package size={40} className="text-gray-400" />
                        </div>
                        <h2 className="text-xl font-black text-charcoal-900 mb-2">No deliveries yet</h2>
                        <p className="text-charcoal-500 mb-8 max-w-xs mx-auto">You haven't made any delivery requests yet. Send a package to get started.</p>
                        <Link href="/send" className="bg-emerald-500 text-white font-bold py-3 px-8 rounded-full shadow-lg hover:bg-emerald-600 transition-colors">
                            Send Package
                        </Link>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {orders.map((order) => (
                            <Link 
                                href={order.status === 'delivered' ? `/history/${order.id}` : `/tracking/${order.id}`} 
                                key={order.id}
                                className="block bg-white hover:bg-gray-50 rounded-3xl p-5 border border-gray-100 shadow-[0_8px_30px_-4px_rgba(0,0,0,0.05)] transition-all hover:shadow-md group"
                            >
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <div className="text-[10px] font-black tracking-widest text-charcoal-400 uppercase mb-1">
                                            {new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} • {new Date(order.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                                        </div>
                                        <div className="text-lg font-black text-charcoal-900 leading-none group-hover:text-emerald-600 transition-colors">
                                            ₦{order.agreed_price}
                                        </div>
                                    </div>
                                    <div className={`text-[10px] uppercase tracking-widest font-black px-2.5 py-1 rounded-md border ${getStatusColor(order.status === 'looking_for_driver' && order.scheduled_at && new Date(order.scheduled_at) > new Date() ? 'scheduled' : order.status)}`}>
                                        {getStatusText(order)}
                                    </div>
                                </div>

                                {order.scheduled_at && new Date(order.scheduled_at) > new Date() && (
                                    <div className="mb-4 flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-2 rounded-xl text-xs font-bold border border-blue-100">
                                        <Clock size={14} />
                                        Scheduled for: {new Date(order.scheduled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} @ {new Date(order.scheduled_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                                    </div>
                                )}

                                <div className="relative pl-6 space-y-3 mb-4">
                                    <div className="absolute left-1.5 top-1.5 bottom-1.5 w-0.5 bg-gray-200"></div>
                                    <div className="relative flex items-start gap-3">
                                        <div className="absolute -left-[1.35rem] top-1 w-2.5 h-2.5 bg-emerald-500 rounded-full border border-white"></div>
                                        <div>
                                            <div className="text-xs font-bold text-charcoal-400 uppercase tracking-widest">Pickup</div>
                                            <div className="text-sm font-semibold text-charcoal-900 truncate max-w-[220px] sm:max-w-xs">{order.pickup_name}</div>
                                        </div>
                                    </div>
                                    <div className="relative flex items-start gap-3">
                                        <div className="absolute -left-[1.35rem] top-1 w-2.5 h-2.5 bg-charcoal-900 rounded-sm border border-white"></div>
                                        <div>
                                            <div className="text-xs font-bold text-charcoal-400 uppercase tracking-widest">Dropoff</div>
                                            <div className="text-sm font-semibold text-charcoal-900 truncate max-w-[220px] sm:max-w-xs">{order.dropoff_name}</div>
                                        </div>
                                    </div>
                                </div>
                                
                                {order.driver && (
                                    <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                                        <div className="text-xs font-medium text-charcoal-500 flex items-center gap-1.5">
                                            <div className="w-5 h-5 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 font-bold text-[10px]">
                                                {order.driver.full_name.charAt(0)}
                                            </div>
                                            {order.driver.full_name} • {order.driver.vehicle_type}
                                        </div>
                                    </div>
                                )}
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </main>
    );
}

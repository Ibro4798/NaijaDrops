"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { ArrowLeft, Clock, MapPin, Package, History as HistoryIcon, ChevronRight, Navigation, Trash2, Loader2 } from 'lucide-react';
import Link from 'next/link';
import Skeleton from '@/components/ui/Skeleton';

export default function VendorHistoryPage() {
    const router = useRouter();
    const supabase = createClient();
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [vendorId, setVendorId] = useState(null);
    const [deletingId, setDeletingId] = useState(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState(null);

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
                setVendorId(vendorProfile.id);

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

    // Cancelled orders are just noise once they're done - the vendor asked to
    // be able to clear them out so only real (delivered / still in-flight)
    // history remains. Scoped to vendor_id again here even though RLS
    // already allows it, so this can never touch another vendor's row.
    async function handleDeleteCancelled(orderId) {
        setDeletingId(orderId);
        try {
            const { error } = await supabase
                .from('orders')
                .delete()
                .eq('id', orderId)
                .eq('vendor_id', vendorId)
                .eq('status', 'cancelled');
            if (error) throw error;
            setOrders(prev => prev.filter(o => o.id !== orderId));
        } catch (err) {
            console.error("Failed to delete order:", err);
            alert("Couldn't delete this order. Try again.");
        } finally {
            setDeletingId(null);
            setConfirmDeleteId(null);
        }
    }

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Link href="/vendor/dashboard" className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors border border-white/10">
                    <ArrowLeft size={20} className="text-ink" />
                </Link>
                <div>
                    <h1 className="text-3xl font-black text-ink tracking-tight font-outfit italic">
                        Operation <span className="text-emerald-500 text-outfit italic">History</span>
                    </h1>
                    <p className="text-charcoal-400 text-sm font-medium">Registry of all city-wide dispatches.</p>
                </div>
            </div>

            {loading ? (
                <div className="space-y-4">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="bg-white/[0.03] rounded-[2rem] p-6 border border-white/10 space-y-6">
                            <div className="flex items-start justify-between">
                                <div className="flex items-start gap-4">
                                    <Skeleton className="w-12 h-12 rounded-2xl shrink-0" />
                                    <div className="space-y-2">
                                        <Skeleton className="h-2.5 w-32" />
                                        <Skeleton className="h-5 w-40" />
                                    </div>
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                    <Skeleton className="h-5 w-16 rounded-lg" />
                                    <Skeleton className="h-6 w-20" />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-white/5 pt-6">
                                {[1, 2].map((j) => (
                                    <div key={j} className="flex items-center gap-3">
                                        <Skeleton className="w-8 h-8 rounded-lg shrink-0" />
                                        <div className="space-y-1.5 flex-1">
                                            <Skeleton className="h-2.5 w-12" />
                                            <Skeleton className="h-3.5 w-28" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            ) : orders.length === 0 ? (
                <div className="bg-white/[0.03] border border-white/10 rounded-[2.5rem] p-12 text-center flex flex-col items-center justify-center">
                    <div className="w-20 h-20 bg-charcoal-900 rounded-full flex items-center justify-center mb-6 border border-white/5">
                        <Package size={40} className="text-charcoal-600" />
                    </div>
                    <h2 className="text-xl font-black text-ink mb-2">No active records found.</h2>
                    <p className="text-charcoal-500 mb-8 max-w-xs mx-auto text-sm">Initialize your first delivery to start logging operations.</p>
                    <Link href="/send-package/step-1" className="bg-emerald-500 text-charcoal-950 font-black py-4 px-8 rounded-2xl shadow-glow hover:bg-emerald-400 transition-all uppercase tracking-widest text-xs">
                        Dispatch Load
                    </Link>
                </div>
            ) : (
                <div className="space-y-4">
                    {orders.map((order) => (
                        <div
                            key={order.id}
                            className="group relative bg-white/[0.03] hover:bg-white/[0.05] rounded-[2rem] border border-white/10 transition-all hover:border-emerald-500/30 overflow-hidden"
                        >
                            <Link
                                href={order.status === 'delivered' ? `/receipt/${order.id}` : `/tracking/${order.id}`}
                                className="block p-6"
                            >
                                {/* FIX: the status pill + price used to be absolutely
                                    positioned over this row with no reserved space,
                                    so on anything narrower than a wide tablet the
                                    package icon/title and the price/status pill
                                    physically overlapped each other. This now lays
                                    out as a normal flex row - title truncates and
                                    the price/status block keeps a fixed width next
                                    to it instead of floating on top. */}
                                <div className="flex items-start justify-between gap-3 mb-6">
                                    <div className="flex items-start gap-4 min-w-0">
                                        <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500 border border-emerald-500/20 shrink-0">
                                            <Package size={24} />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="text-[10px] font-black tracking-widest text-charcoal-500 uppercase mb-1 truncate">
                                                ID: {order.id.slice(0, 8)} â€¢ {new Date(order.created_at).toLocaleDateString()}
                                            </div>
                                            <h3 className="text-lg font-black text-ink font-outfit uppercase tracking-tight truncate">{order.item_category || 'General Package'}</h3>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end gap-2 shrink-0">
                                        <div className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border whitespace-nowrap ${getStatusStyle(order.status)}`}>
                                            {order.status}
                                        </div>
                                        <div className="text-xl font-black text-ink italic tracking-tighter whitespace-nowrap">â‚¦{order.agreed_price?.toLocaleString()}</div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-white/5 pt-6">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-8 h-8 rounded-lg bg-charcoal-900 flex items-center justify-center text-emerald-500 border border-white/5 shrink-0">
                                            <MapPin size={16} />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="text-[9px] font-black text-charcoal-600 uppercase tracking-widest font-outfit">Origin</div>
                                            <div className="text-sm font-bold text-ink truncate">{order.pickup_name}</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-8 h-8 rounded-lg bg-charcoal-900 flex items-center justify-center text-emerald-500 border border-white/5 shrink-0">
                                            <Navigation size={16} />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="text-[9px] font-black text-charcoal-600 uppercase tracking-widest font-outfit italic">Terminal</div>
                                            <div className="text-sm font-bold text-ink truncate">{order.dropoff_name}</div>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-6 flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-charcoal-400 group-hover:text-emerald-500 transition-colors">
                                    <span className="truncate">Rider ID: {order.rider_id ? order.rider_id.slice(0, 8) : 'AWAITING ASSIGNMENT'}</span>
                                    <div className="flex items-center gap-2 shrink-0">View Analysis <ChevronRight size={14} /></div>
                                </div>
                            </Link>

                            {/* Only cancelled orders are deletable - delivered history
                                and anything still in-flight stays put. */}
                            {order.status === 'cancelled' && (
                                <div className="px-6 pb-6 -mt-2">
                                    {confirmDeleteId === order.id ? (
                                        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-2xl p-3">
                                            <span className="text-[10px] font-black text-red-400 uppercase tracking-widest flex-1">Delete this record?</span>
                                            <button
                                                onClick={(e) => { e.preventDefault(); setConfirmDeleteId(null); }}
                                                className="px-3 py-2 rounded-xl bg-white/5 text-charcoal-300 text-[10px] font-black uppercase tracking-widest"
                                            >
                                                Keep
                                            </button>
                                            <button
                                                onClick={(e) => { e.preventDefault(); handleDeleteCancelled(order.id); }}
                                                disabled={deletingId === order.id}
                                                className="px-3 py-2 rounded-xl bg-red-500 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 disabled:opacity-60"
                                            >
                                                {deletingId === order.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                                                Delete
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={(e) => { e.preventDefault(); setConfirmDeleteId(order.id); }}
                                            className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-charcoal-500 hover:text-red-400 transition-colors"
                                        >
                                            <Trash2 size={12} /> Remove from history
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
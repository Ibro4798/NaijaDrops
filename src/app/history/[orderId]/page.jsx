"use client";

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { ArrowLeft, CheckCircle2, MapPin, Package, Calendar, Clock, DollarSign, User, Shield } from 'lucide-react';
import { motion } from 'framer-motion';

export default function OrderDetailPage() {
    const { orderId } = useParams();
    const router = useRouter();
    const supabase = createClient();
    const [order, setOrder] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchOrder() {
            const { data, error } = await supabase
                .from('orders')
                .select('*, driver:drivers!driver_id(*)')
                .eq('id', orderId)
                .single();
            
            if (data) setOrder(data);
            setLoading(false);
        }
        if (orderId) fetchOrder();
    }, [orderId, supabase]);

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="w-10 h-10 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
            </div>
        );
    }

    if (!order) {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
                <h1 className="text-2xl font-black text-charcoal-900 mb-4">Order Not Found</h1>
                <button onClick={() => router.push('/history')} className="text-emerald-600 font-bold">Back to History</button>
            </div>
        );
    }

    return (
        <main className="min-h-screen bg-gray-50 pb-20">
            {/* Header */}
            <div className="bg-white border-b border-gray-100 p-6 pt-12 flex items-center gap-4">
                <button onClick={() => router.back()} className="w-10 h-10 bg-gray-50 flex items-center justify-center rounded-xl hover:bg-gray-100 transition-colors">
                    <ArrowLeft size={20} />
                </button>
                <div>
                   <h1 className="text-xl font-black text-charcoal-900 tracking-tight">Receipt #{order.id.slice(0, 8)}</h1>
                   <div className="text-[10px] font-black text-charcoal-400 uppercase tracking-widest mt-0.5">Delivered on {new Date(order.created_at).toLocaleDateString()}</div>
                </div>
            </div>

            <div className="max-w-xl mx-auto px-6 py-10 space-y-8">
                
                {/* Success Banner */}
                <div className="bg-emerald-50 border border-emerald-100 rounded-[2.5rem] p-8 text-center">
                   <div className="w-16 h-16 bg-emerald-500 text-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-glow">
                      <CheckCircle2 size={32} />
                   </div>
                   <h2 className="text-2xl font-black text-emerald-900 mb-2">Delivery Successful</h2>
                   <p className="text-emerald-700 font-medium text-sm leading-relaxed">This mission was completed and verified by our geospatial engine.</p>
                </div>

                {/* Logistics Chain */}
                <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100">
                   <h3 className="text-xs font-black uppercase text-charcoal-400 tracking-widest mb-8">Route Intelligence</h3>
                   <div className="space-y-8 relative">
                      <div className="absolute left-4 top-4 bottom-4 w-0.5 bg-gray-100"></div>
                      
                      <div className="flex items-start gap-6 relative">
                         <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 border-4 border-white shadow-sm z-10">
                            <MapPin size={14} />
                         </div>
                         <div>
                            <div className="text-[10px] font-black uppercase text-charcoal-400 tracking-widest mb-1">Pickup Information</div>
                            <div className="text-lg font-black text-charcoal-900 leading-tight">{order.pickup_name}</div>
                         </div>
                      </div>

                      <div className="flex items-start gap-6 relative">
                         <div className="w-8 h-8 rounded-full bg-charcoal-100 flex items-center justify-center text-charcoal-600 border-4 border-white shadow-sm z-10">
                            <Package size={14} />
                         </div>
                         <div>
                            <div className="text-[10px] font-black uppercase text-charcoal-400 tracking-widest mb-1">Destination Resolved</div>
                            <div className="text-lg font-black text-charcoal-900 leading-tight">{order.dropoff_name}</div>
                         </div>
                      </div>
                   </div>
                </div>

                {/* Settlement */}
                <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100">
                   <h3 className="text-xs font-black uppercase text-charcoal-400 tracking-widest mb-8">Settlement Details</h3>
                   <div className="space-y-6">
                      <div className="flex justify-between items-center bg-gray-50 p-5 rounded-2xl">
                         <span className="font-bold text-charcoal-600">Base Fare</span>
                         <span className="font-black text-charcoal-900">₦{order.agreed_price || order.price}</span>
                      </div>
                      <div className="flex justify-between items-center text-xl">
                         <span className="font-black text-charcoal-900 uppercase tracking-tighter">Total Paid</span>
                         <span className="font-black text-emerald-600">₦{order.agreed_price || order.price}</span>
                      </div>
                   </div>
                </div>

                {/* Carrier Information */}
                {order.driver && (
                   <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100 flex items-center gap-5">
                      <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center text-charcoal-400">
                         <User size={32} />
                      </div>
                      <div>
                         <div className="text-[10px] font-black uppercase text-emerald-600 tracking-widest mb-1">Verified Carrier</div>
                         <div className="text-xl font-black text-charcoal-900 leading-none mb-1">{order.driver.full_name}</div>
                         <div className="text-xs font-bold text-charcoal-400">{order.driver.vehicle_type} • Verified Partner</div>
                      </div>
                   </div>
                )}

                <div className="pt-10 flex flex-col gap-4">
                   <button className="w-full py-5 bg-charcoal-900 text-white rounded-2xl font-black text-lg transition-all active:scale-95 flex items-center justify-center gap-3">
                      <Shield size={20} className="text-emerald-400" /> Resolution Support
                   </button>
                   <p className="text-center text-[10px] font-black uppercase text-charcoal-400 tracking-widest">
                      Mission finalized on {new Date(order.created_at).toLocaleString()}
                   </p>
                </div>
            </div>
        </main>
    );
}

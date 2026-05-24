"use client";

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { ArrowLeft, CheckCircle2, CreditCard, Lock, X, QrCode, ShieldCheck, ChevronRight, Loader2, AlertTriangle } from 'lucide-react';
import { loadPaystackScript, initializePaystack } from '@/utils/paystack';
import { motion, AnimatePresence } from 'framer-motion';

import { Suspense } from 'react';

function PaymentContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const orderId = searchParams.get('orderId');
    const supabase = createClient();
    
    const [driverData, setDriverData] = useState(null);
    const [orderData, setOrderData] = useState(null);
    const [method, setMethod] = useState('');
    const [showGateway, setShowGateway] = useState(null); // 'paystack' | 'opay'
    const [isProcessing, setIsProcessing] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!orderId) {
            router.push('/send');
            return;
        }

        async function fetchPaymentDetails() {
            loadPaystackScript();
            
            try {
                const { data: order, error: orderErr } = await supabase
                    .from('orders')
                    .select('*')
                    .eq('id', orderId)
                    .single();
                
                if (orderErr) throw orderErr;
                setOrderData(order);

                if (order.rider_id) {
                    const { data: driver, error: driverErr } = await supabase
                        .from('riders')
                        .select('*, users(full_name)')
                        .eq('user_id', order.rider_id)
                        .single();
                    
                    if (driverErr) throw driverErr;
                    setDriverData({ ...driver, full_name: driver?.users?.full_name });
                }
            } catch (err) {
                console.error("Fetch payment details failed", err);
            } finally {
                setLoading(false);
            }
        }

        fetchPaymentDetails();
    }, [orderId, supabase, router]);

    const handleInitiatePayment = () => {
        if (!method) return;

        if (method === 'paystack') {
            const userEmail = orderData.user_id ? `${orderData.user_id}@naijadrops.com` : 'customer@naijadrops.com';
            
            initializePaystack({
                email: userEmail,
                amount: orderData.agreed_price,
                reference: `ND_${Date.now()}_${orderId.slice(0, 5)}`,
                onSuccess: (response) => {
                    handleRealPaymentSuccess(response.reference);
                },
                onClose: () => {
                    console.log("Paystack closed");
                }
            });
            return;
        }

        setShowGateway(method);
    };

    const handleRealPaymentSuccess = async (reference) => {
        setIsProcessing(true);
        try {
            const verifyRes = await fetch('/api/verify-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reference, orderId })
            });

            const verifyData = await verifyRes.json();
            if (!verifyRes.ok || !verifyData.success) throw new Error(verifyData.error || 'Verification failed');

            setShowGateway(null);
            setIsSuccess(true);
            setIsProcessing(false);

            setTimeout(() => {
                router.push(`/track/${orderId}`);
            }, 2000);
        } catch (err) {
            console.error(err);
            alert(`Payment verification failed: ${err.message}`);
            setIsProcessing(false);
        }
    };

    const handleMockPaymentSuccess = async () => {
        setIsProcessing(true);
        const generatedPin = Math.floor(1000 + Math.random() * 9000).toString();

        setTimeout(async () => {
            try {
                const { error: updateErr } = await supabase
                    .from('orders')
                    .update({
                        status: 'confirmed',
                        delivery_pin: generatedPin
                    })
                    .eq('id', orderId);

                if (updateErr) throw updateErr;

                setShowGateway(null);
                setIsSuccess(true);
                setIsProcessing(false);

                setTimeout(() => {
                    router.push(`/track/${orderId}`);
                }, 2000);
            } catch (err) {
                console.error(err);
                setIsProcessing(false);
            }
        }, 1500);
    };

    const handleCancelOrder = async () => {
        if (!window.confirm("Are you sure you want to terminate this mission? The courier will be notified.")) return;
        
        try {
            await supabase
                .from('orders')
                .update({ status: 'cancelled' })
                .eq('id', orderId);
            
            router.push('/');
        } catch (err) {
            console.error("Cancellation failed", err);
        }
    };

    if (loading) return (
        <div className="min-h-screen aura-gradient flex items-center justify-center p-10 font-black tracking-tight text-white italic">
            <div className="flex flex-col items-center gap-4">
                <Loader2 className="animate-spin text-emerald-500" size={40} />
                <p>Initializing Secure Channel...</p>
            </div>
        </div>
    );

    if (!orderData) return <div className="min-h-screen aura-gradient flex items-center justify-center p-10 text-red-400 font-black uppercase tracking-widest">Protocol Sync Error: Order Missing</div>;

    return (
        <main className="aura-gradient min-h-[100dvh] relative overflow-hidden flex flex-col items-center justify-start py-20 px-4">
            <div className="w-full max-w-lg z-10">
                {/* Header */}
                <div className="flex items-center justify-between mb-12">
                    <button 
                        onClick={() => !showGateway && router.back()} 
                        className="w-12 h-12 glass-dark rounded-2xl flex items-center justify-center text-charcoal-400 hover:text-white transition-all border border-white/5 group shadow-premium"
                    >
                        <ArrowLeft size={22} className="group-hover:-translate-x-1 transition-transform" />
                    </button>
                    <div className="glass-dark px-4 py-2 rounded-full border border-white/5 flex items-center gap-2">
                        <Lock size={14} className="text-emerald-500" />
                        <span className="text-[10px] font-black text-white uppercase tracking-[0.3em] font-outfit italic">Secure Checkout</span>
                    </div>
                </div>

                <AnimatePresence mode="wait">
                    {isSuccess ? (
                        <motion.div 
                            key="success"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="glass rounded-[3.5rem] p-12 text-center shadow-premium border-emerald-500/20"
                        >
                            <div className="w-24 h-24 bg-white text-emerald-500 rounded-[3rem] flex items-center justify-center mx-auto mb-8 shadow-premium border-2 border-emerald-500/20 rotate-3">
                                <CheckCircle2 size={56} className="stroke-[3]" />
                            </div>
                            <h1 className="text-5xl font-black text-charcoal-900 mb-4 tracking-tighter italic">Mission Live</h1>
                            <p className="text-charcoal-400 font-bold text-sm uppercase tracking-widest mb-10 leading-relaxed">
                                {driverData?.full_name || 'Unit'} is synchronized. <br />Estimated Arrival: <span className="text-emerald-600">30-50m</span>
                            </p>
                            <div className="bg-charcoal-950 text-emerald-400 px-6 py-4 rounded-3xl font-black text-[10px] uppercase tracking-[0.4em] inline-block shadow-glow animate-pulse">
                                Routing to Hub...
                            </div>
                        </motion.div>
                    ) : (
                        <div className="space-y-8">
                            {/* Summary Card */}
                            <motion.div 
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="glass rounded-[3.5rem] p-10 shadow-premium relative overflow-hidden"
                            >
                                <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-emerald-500/5 rounded-full blur-[100px] -mr-48 -mt-48 pointer-events-none"></div>
                                <div className="text-center mb-8">
                                    <div className="text-[10px] font-black text-charcoal-400 uppercase tracking-[0.4em] mb-2">Synchronized Fare</div>
                                    <div className="text-6xl font-black text-charcoal-900 tracking-tighter italic">â‚¦{orderData.agreed_price?.toLocaleString()}</div>
                                </div>
                                <div className="bg-charcoal-950/5 rounded-3xl p-6 space-y-4 border border-black/5">
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] font-black text-charcoal-400 uppercase tracking-widest">Protocol Type</span>
                                        <span className="font-black text-xs text-charcoal-900 uppercase italic">Delivery Manifest</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] font-black text-charcoal-400 uppercase tracking-widest">Assigned Unit</span>
                                        <span className="font-black text-xs text-emerald-600 uppercase italic flex items-center gap-2">
                                            <ShieldCheck size={14} /> {driverData?.full_name || 'Carrier'}
                                        </span>
                                    </div>
                                </div>
                            </motion.div>

                            {/* Method Selection */}
                            <motion.div 
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.1 }}
                                className="space-y-4"
                            >
                                <h3 className="text-[10px] font-black text-white/40 uppercase tracking-[0.4em] ml-6 mb-4">Transfer Protocol</h3>
                                
                                <div className="grid grid-cols-1 gap-4">
                                    {/* OPAY */}
                                    <button 
                                        onClick={() => setMethod('opay')}
                                        className={`glass rounded-[2.5rem] p-6 text-left transition-all border-2 flex items-center justify-between group ${method === 'opay' ? 'border-emerald-500 bg-white ring-4 ring-emerald-500/10' : 'border-white/20 hover:border-white/50'}`}
                                    >
                                        <div className="flex items-center gap-5">
                                            <div className="w-16 h-16 bg-emerald-50 rounded-[1.4rem] flex items-center justify-center border border-emerald-100 text-emerald-600 font-black text-2xl group-hover:scale-105 transition-transform italic">O</div>
                                            <div>
                                                <div className={`font-black text-xl tracking-tighter italic ${method === 'opay' ? 'text-charcoal-950' : 'text-charcoal-900'}`}>OPay Digital</div>
                                                <div className="text-[9px] font-black text-charcoal-400 uppercase tracking-widest mt-1">Instant App Transfer</div>
                                            </div>
                                        </div>
                                        <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center ${method === 'opay' ? 'border-emerald-500 bg-emerald-500' : 'border-charcoal-200'}`}>
                                            {method === 'opay' && <CheckCircle2 size={18} className="text-white stroke-[3]" />}
                                        </div>
                                    </button>

                                    {/* PAYSTACK */}
                                    <button 
                                        onClick={() => setMethod('paystack')}
                                        className={`glass rounded-[2.5rem] p-6 text-left transition-all border-2 flex items-center justify-between group ${method === 'paystack' ? 'border-blue-500 bg-white ring-4 ring-blue-500/10' : 'border-white/20 hover:border-white/50'}`}
                                    >
                                        <div className="flex items-center gap-5">
                                            <div className="w-16 h-16 bg-blue-50 rounded-[1.4rem] flex items-center justify-center border border-blue-100 text-blue-500 group-hover:scale-105 transition-transform">
                                                <CreditCard size={32} />
                                            </div>
                                            <div>
                                                <div className={`font-black text-xl tracking-tighter italic ${method === 'paystack' ? 'text-charcoal-950' : 'text-charcoal-900'}`}>Card / USSD</div>
                                                <div className="text-[9px] font-black text-charcoal-400 uppercase tracking-widest mt-1">Multi-Channel Terminal</div>
                                            </div>
                                        </div>
                                        <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center ${method === 'paystack' ? 'border-blue-500 bg-blue-500' : 'border-charcoal-200'}`}>
                                            {method === 'paystack' && <CheckCircle2 size={18} className="text-white stroke-[3]" />}
                                        </div>
                                    </button>
                                </div>
                            </motion.div>

                            {/* Action Area */}
                            <motion.div 
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.2 }}
                                className="pt-4 space-y-6"
                            >
                                <button 
                                    onClick={handleInitiatePayment}
                                    disabled={!method}
                                    className={`w-full py-6 rounded-[2.5rem] font-black text-xl uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-4 shadow-premium active:scale-95 overflow-hidden relative group ${
                                        !method ? 'bg-white/10 text-white/30 cursor-not-allowed border border-white/5' : 
                                        'bg-charcoal-900 hover:bg-black text-white hover:shadow-glow hover:shadow-black/20'
                                    }`}
                                >
                                    <span className="relative z-10 flex items-center gap-3">Commit Protocol <ChevronRight size={24} className="group-hover:translate-x-1 transition-transform" /></span>
                                    <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                </button>

                                <button 
                                    onClick={handleCancelOrder}
                                    className="w-full py-6 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-[2.5rem] font-black text-[10px] uppercase tracking-[0.6em] transition-all border border-red-500/20 active:scale-95 flex items-center justify-center gap-2"
                                >
                                    <AlertTriangle size={14} /> Terminate Request
                                </button>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>
            </div>

            {/* OPay Gateway Overlay */}
            <AnimatePresence>
                {showGateway === 'opay' && (
                    <motion.div 
                        initial={{ opacity: 0 }} 
                        animate={{ opacity: 1 }} 
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center px-6 bg-charcoal-950/80 backdrop-blur-xl"
                    >
                        <motion.div 
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            className="glass bg-white w-full max-w-sm rounded-[3.5rem] overflow-hidden shadow-2xl overflow-hidden relative"
                        >
                            <div className="bg-emerald-50 p-8 flex items-center justify-between border-b border-emerald-100">
                                <div className="font-black text-xl text-emerald-600 flex items-center gap-3 italic">
                                    <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center text-sm not-italic">O</div>
                                    OPay Web
                                </div>
                                <button onClick={() => !isProcessing && setShowGateway(null)} className="w-10 h-10 glass flex items-center justify-center text-charcoal-400 hover:text-charcoal-900 transition-colors border border-black/5 rounded-2xl"><X size={20} /></button>
                            </div>
                            <div className="p-8 text-center">
                                <div className="mb-10">
                                    <div className="text-[10px] font-black text-charcoal-400 uppercase tracking-widest mb-2">Protocol Fee</div>
                                    <div className="text-5xl font-black text-charcoal-900 tracking-tighter italic">â‚¦{orderData.agreed_price?.toLocaleString()}</div>
                                </div>
                                
                                <div className="bg-white border-8 border-emerald-50 rounded-[3rem] p-10 mx-auto w-60 h-60 mb-10 flex items-center justify-center shadow-inner relative overflow-hidden group">
                                    <div className="absolute inset-0 bg-emerald-500/5 animate-pulse"></div>
                                    <QrCode size={160} className="text-charcoal-900 relative z-10 opacity-80 group-hover:opacity-100 transition-opacity" />
                                    <div className="absolute top-1/2 left-0 w-full h-1 bg-emerald-500 shadow-[0_0_15px_4px_#10b981] animate-scan z-20"></div>
                                </div>

                                <p className="text-xs font-bold text-charcoal-500 uppercase tracking-widest mb-10 leading-relaxed px-4">
                                    Open your OPay Hub, select <strong className="text-charcoal-900">Scan</strong>, and authorize the transmission.
                                </p>

                                <button 
                                    onClick={handleMockPaymentSuccess} 
                                    disabled={isProcessing}
                                    className="w-full py-5 bg-emerald-500 hover:bg-emerald-600 text-white font-black rounded-3xl text-sm uppercase tracking-[0.2em] flex justify-center items-center transition-all shadow-glow active:scale-95"
                                >
                                    {isProcessing ? <Loader2 className="animate-spin" size={24} /> : 'Acknowledge Scan'}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Background Decor */}
            <div className="absolute top-0 right-0 w-[700px] h-[700px] bg-emerald-500/10 rounded-full blur-[160px] -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
            <div className="absolute bottom-0 left-0 w-[700px] h-[700px] bg-blue-500/10 rounded-full blur-[160px] translate-y-1/2 -translate-x-1/2 pointer-events-none"></div>
        </main>
    );
}

export default function PaymentPage() {
  return (
    <Suspense fallback={<div className="min-h-screen aura-gradient flex flex-col items-center justify-center p-10 font-black text-white italic animate-in fade-in">Loading terminal...</div>}>
      <PaymentContent />
    </Suspense>
  );
}

"use client";

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { ArrowLeft, CheckCircle2, CreditCard, Lock, ShieldCheck, ChevronRight, Loader2, AlertTriangle } from 'lucide-react';
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
    const [paystackError, setPaystackError] = useState(null);
    // FIX: this used to fire loadPaystackScript() and forget about it - no
    // state tracked whether it actually finished, so a fast click on "Pay
    // Now" (or a slow connection) could hit initializePaystack() before
    // window.PaystackPop existed yet, showing "gateway failed to load" even
    // though it would have worked a moment later. Now the button itself
    // reflects real load state: disabled + spinning while loading, a clear
    // error if the script genuinely fails to load, and only enabled once
    // Paystack's SDK has actually confirmed ready.
    const [paystackReady, setPaystackReady] = useState(false);
    const [paystackLoadFailed, setPaystackLoadFailed] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [loading, setLoading] = useState(true);

    // FIX: this used to be inlined directly in the mount effect below with
    // no way to run it again - if the Paystack script genuinely failed to
    // load (ad-blocker, flaky connection, anything blocking a third-party
    // script), the "Couldn't load the payment gateway" error would show,
    // but the only way forward was a full page reload, and the "Pay Now"
    // button itself just stayed on "Loading Secure Gateway..." forever with
    // no click doing anything - which is exactly what looks like "I click
    // it and nothing happens." Pulling this out into its own function lets
    // the retry button below re-run the exact same load attempt in place.
    const attemptLoadPaystack = () => {
        setPaystackLoadFailed(false);
        loadPaystackScript().then((ok) => {
            setPaystackReady(!!ok);
            setPaystackLoadFailed(!ok);
        });
        // Safety net: if the script request itself never fires onload or
        // onerror at all (e.g. blocked entirely by an ad/tracker
        // blocker rather than cleanly failing), the button would
        // otherwise be stuck on "Loading Secure Gateway..." forever
        // with no way forward.
        setTimeout(() => {
            setPaystackReady((ready) => {
                if (!ready) setPaystackLoadFailed(true);
                return ready;
            });
        }, 8000);
    };

    useEffect(() => {
        if (!orderId) {
            router.push('/send');
            return;
        }

        async function fetchPaymentDetails() {
            attemptLoadPaystack();

            try {
                const { data: order, error: orderErr } = await supabase
                    .from('orders')
                    .select('*')
                    .eq('id', orderId)
                    .single();

                if (orderErr) throw orderErr;

                // FIX ("closed circle" back-button bug): this page used to
                // render its Pay Now form for ANY order it could fetch,
                // with no check for whether payment had already gone
                // through. Combined with the success redirect below using
                // router.push (which leaves this page in browser history),
                // pressing back after a completed order landed right back
                // here showing a stale, already-paid order as if it still
                // needed payment. Guard directly against that: if this
                // order is already paid or delivered, this page has
                // nothing to do - send the visitor to where the order
                // actually is instead.
                if (order.status === 'delivered') {
                    router.replace(`/receipt/${orderId}`);
                    return;
                }
                if (order.payment_status === 'paid') {
                    router.replace(`/tracking/${orderId}`);
                    return;
                }

                setOrderData(order);

                if (order.rider_id) {
                    // FIX: orders.rider_id is a foreign key to riders.id, not
                    // riders.user_id - querying by user_id here meant this
                    // .single() lookup almost never matched anything, threw,
                    // and got swallowed by the outer catch, so the assigned
                    // rider's name silently never showed up (fell back to
                    // the generic "Rider" label instead).
                    const { data: driver, error: driverErr } = await supabase
                        .from('riders')
                        .select('*, users(full_name, receipt_display_name)')
                        .eq('id', order.rider_id)
                        .single();

                    if (driverErr) throw driverErr;
                    setDriverData({ ...driver, full_name: driver?.users?.receipt_display_name || driver?.users?.full_name });
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
        if (!paystackReady) return;
        setPaystackError(null);
        // FIX: orders has no user_id column at all (never has - vendor and
        // customer flows both only ever set vendor_id), so this was always
        // undefined and every transaction showed up in Paystack's dashboard
        // under the exact same generic email, making real transactions
        // impossible to tell apart. Keying it to the order's actual
        // vendor_id at least makes each vendor's payments distinguishable.
        const userEmail = orderData.vendor_id ? `vendor-${orderData.vendor_id}@naijadrops.com` : 'customer@naijadrops.com';

        initializePaystack({
            email: userEmail,
            amount: orderData.agreed_price,
            reference: `ND_${Date.now()}_${orderId.slice(0, 5)}`,
            onSuccess: (response) => {
                handleRealPaymentSuccess(response.reference);
            },
            onClose: () => {
                console.log("Paystack closed");
            },
            onError: (message) => {
                setPaystackError(message);
            }
        });
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

            setIsSuccess(true);
            setIsProcessing(false);

            setTimeout(() => {
                router.replace(`/tracking/${orderId}`);
            }, 2000);
        } catch (err) {
            console.error(err);
            setPaystackError(`Payment verification failed: ${err.message}`);
            setIsProcessing(false);
        }
    };

    // FIX: removed the fake "OPay" payment path entirely. It used to fake
    // a Paystack-style reference (ND_OPAY_...) and mark the order paid via
    // /api/verify-payment's dev-only simulateSuccess fallback - but the
    // moment a real PAYSTACK_SECRET_KEY is configured (which is the whole
    // point of "fully wiring up" this integration), that verify call tries
    // to check the fake reference against Paystack's real API, which
    // correctly rejects it as a transaction that never happened. So this
    // button would go from "fake-successful" in dev to permanently broken
    // the moment real payments were turned on - and even before that, no
    // actual money was ever collected through it, just a UI simulation.
    // Paystack's own real checkout already supports card, bank transfer,
    // USSD, and mobile money as channels within one verified transaction,
    // so there's no coverage lost by removing the separate fake button -
    // just one single, real, fully verified payment path now.

    const handleCancelOrder = async () => {
        if (!window.confirm("Cancel this order? The rider will be notified right away.")) return;

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
        <div className="min-h-screen bg-charcoal-950 flex items-center justify-center p-10 font-black tracking-tight text-ink">
            <div className="flex flex-col items-center gap-4">
                <Loader2 className="animate-spin text-emerald-500" size={40} />
                <p>Loading your order...</p>
            </div>
        </div>
    );

    if (!orderData) return <div className="min-h-screen bg-charcoal-950 flex items-center justify-center p-10 text-red-400 font-black text-center">We couldn't find this order. Check the link and try again.</div>;

    return (
        <main className="bg-charcoal-950 min-h-[100dvh] relative overflow-hidden flex flex-col items-center justify-start py-20 px-4">
            <div className="w-full max-w-lg z-10">
                {/* Header */}
                <div className="flex items-center justify-between mb-12">
                    <button
                        onClick={() => router.back()}
                        className="w-12 h-12 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center text-charcoal-400 hover:text-ink hover:bg-white/10 transition-all group"
                    >
                        <ArrowLeft size={22} className="group-hover:-translate-x-1 transition-transform" />
                    </button>
                    <div className="bg-white/5 border border-white/10 px-4 py-2 rounded-full flex items-center gap-2">
                        <Lock size={14} className="text-emerald-500" />
                        <span className="text-[10px] font-black text-ink uppercase tracking-[0.3em]">Secure Checkout</span>
                    </div>
                </div>

                <AnimatePresence mode="wait">
                    {isSuccess ? (
                        <motion.div
                            key="success"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="bg-white/[0.03] border border-emerald-500/20 backdrop-blur-xl rounded-3xl p-12 text-center shadow-premium"
                        >
                            <div className="w-24 h-24 bg-emerald-500/10 border-2 border-emerald-500/30 text-emerald-500 rounded-3xl flex items-center justify-center mx-auto mb-8">
                                <CheckCircle2 size={56} className="stroke-[3]" />
                            </div>
                            <h1 className="text-4xl font-black text-ink mb-4 tracking-tight">Payment Successful</h1>
                            <p className="text-charcoal-400 font-medium text-sm mb-10 leading-relaxed">
                                {driverData?.full_name || 'Your rider'} has been notified and can now head to pickup.
                                <br />Estimated arrival: <span className="text-emerald-500 font-bold">30-50 minutes</span>
                            </p>
                            <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-6 py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.3em] inline-block animate-pulse">
                                Taking you to your order...
                            </div>
                        </motion.div>
                    ) : (
                        <div className="space-y-8">
                            {/* Summary Card */}
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="bg-white/[0.03] border border-white/10 backdrop-blur-xl rounded-3xl p-8 shadow-premium relative overflow-hidden"
                            >
                                <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-emerald-500/5 rounded-full blur-[100px] -mr-48 -mt-48 pointer-events-none"></div>
                                <div className="text-center mb-8">
                                    <div className="text-[10px] font-black text-charcoal-400 uppercase tracking-[0.3em] mb-2">Delivery Fare</div>
                                    <div className="text-6xl font-black text-ink tracking-tighter">₦{orderData.agreed_price?.toLocaleString()}</div>
                                </div>
                                <div className="bg-black/20 rounded-2xl p-5 space-y-3 border border-white/5">
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] font-black text-charcoal-400 uppercase tracking-widest">Delivery Type</span>
                                        <span className="font-black text-xs text-ink uppercase">Package Delivery</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] font-black text-charcoal-400 uppercase tracking-widest">Rider</span>
                                        <span className="font-black text-xs text-emerald-500 uppercase flex items-center gap-2">
                                            <ShieldCheck size={14} /> {driverData?.full_name || 'Assigned rider'}
                                        </span>
                                    </div>
                                </div>
                            </motion.div>

                            {/* Payment Action - single, real Paystack path. Paystack's own
                                checkout already presents card, bank transfer, USSD, and
                                mobile money as channels inside one verified transaction,
                                so there's nothing missing by not having a separate fake
                                "OPay" button next to it. */}
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.1 }}
                                className="space-y-4"
                            >
                                <div className="bg-white/[0.03] border border-blue-500/20 rounded-2xl p-6 flex items-center gap-5">
                                    <div className="w-14 h-14 bg-blue-500/10 border border-blue-500/20 rounded-2xl flex items-center justify-center text-blue-400 shrink-0">
                                        <CreditCard size={28} />
                                    </div>
                                    <div>
                                        <div className="font-black text-lg tracking-tight text-ink">Pay with Paystack</div>
                                        <div className="text-[9px] font-black text-charcoal-400 uppercase tracking-widest mt-1">Card, Bank Transfer, USSD & Mobile Money</div>
                                    </div>
                                </div>
                            </motion.div>

                            {/* Action Area */}
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.2 }}
                                className="pt-4 space-y-6"
                            >
                                {paystackError && (
                                    <div className="flex items-start gap-2.5 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl">
                                        <AlertTriangle className="text-red-400 shrink-0 mt-0.5" size={16} />
                                        <p className="text-red-400 text-xs font-medium leading-relaxed">{paystackError}</p>
                                    </div>
                                )}

                                {paystackLoadFailed && (
                                    <div className="flex items-start gap-2.5 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl">
                                        <AlertTriangle className="text-red-400 shrink-0 mt-0.5" size={16} />
                                        <div className="flex-1">
                                            <p className="text-red-400 text-xs font-medium leading-relaxed mb-2">Couldn't load the payment gateway. This is usually an ad-blocker or privacy extension blocking a third-party script, or a flaky connection. Try disabling any ad-blocker for this site, then retry.</p>
                                            <button
                                                onClick={attemptLoadPaystack}
                                                className="text-red-400 hover:text-red-300 text-[10px] font-black uppercase tracking-widest underline underline-offset-2 transition-colors"
                                            >
                                                Retry
                                            </button>
                                        </div>
                                    </div>
                                )}

                                <button
                                    onClick={handleInitiatePayment}
                                    disabled={!paystackReady || isProcessing}
                                    className={`w-full py-5 rounded-2xl font-black text-lg uppercase tracking-[0.15em] transition-all flex items-center justify-center gap-3 shadow-premium active:scale-95 relative group ${
                                        (!paystackReady || isProcessing) ? 'bg-white/10 text-white/30 cursor-not-allowed border border-white/5' :
                                        'bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 hover:shadow-glow'
                                    }`}
                                >
                                    <span className="relative z-10 flex items-center gap-3">
                                        {isProcessing ? (
                                            <><Loader2 size={22} className="animate-spin" /> Verifying...</>
                                        ) : !paystackReady ? (
                                            <><Loader2 size={22} className="animate-spin" /> Loading Secure Gateway...</>
                                        ) : (
                                            <>Pay ₦{orderData.agreed_price?.toLocaleString()} Now <ChevronRight size={22} className="group-hover:translate-x-1 transition-transform" /></>
                                        )}
                                    </span>
                                </button>

                                <button
                                    onClick={handleCancelOrder}
                                    className="w-full py-4 bg-white/5 hover:bg-red-500/10 text-red-400 hover:text-red-300 rounded-2xl font-black text-[10px] uppercase tracking-[0.3em] transition-all border border-white/10 hover:border-red-500/20 active:scale-95 flex items-center justify-center gap-2"
                                >
                                    <AlertTriangle size={14} /> Cancel Order
                                </button>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>
            </div>

            {/* Background Decor */}
            <div className="absolute top-0 right-0 w-[700px] h-[700px] bg-emerald-500/10 rounded-full blur-[160px] -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
            <div className="absolute bottom-0 left-0 w-[700px] h-[700px] bg-blue-500/10 rounded-full blur-[160px] translate-y-1/2 -translate-x-1/2 pointer-events-none"></div>
        </main>
    );
}

export default function PaymentPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-charcoal-950 flex flex-col items-center justify-center p-10 font-black text-ink animate-in fade-in">Loading...</div>}>
      <PaymentContent />
    </Suspense>
  );
}
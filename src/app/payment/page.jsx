"use client";

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { ArrowLeft, CheckCircle2, CreditCard, Lock, X, QrCode } from 'lucide-react';
import { loadPaystackScript, initializePaystack } from '@/utils/paystack';

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
            // Pre-load Paystack script silently
            loadPaystackScript();
            
            try {
                const { data: order, error: orderErr } = await supabase
                    .from('orders')
                    .select('*')
                    .eq('id', orderId)
                    .single();
                
                if (orderErr) throw orderErr;
                setOrderData(order);

                if (order.driver_id) {
                    const { data: driver, error: driverErr } = await supabase
                        .from('profiles')
                        .select('*')
                        .eq('id', order.driver_id)
                        .single();
                    
                    if (driverErr) throw driverErr;
                    setDriverData(driver);
                }
            } catch (err) {
                console.error("Fetch payment details failed", err?.message || err);
                alert(`Fetch payment details failed: ${err?.message || JSON.stringify(err)}`);
            } finally {
                setLoading(false);
            }
        }

        fetchPaymentDetails();
    }, [orderId, supabase, router]);

    const handleInitiatePayment = () => {
        if (!method) {
            alert("Please select a payment method.");
            return;
        }

        if (method === 'paystack') {
            const userEmail = orderData.user_id ? `${orderData.user_id}@naijadrops.com` : 'customer@naijadrops.com'; // Fallback if no email
            
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
            // Send reference to backend for secure verification
            const verifyRes = await fetch('/api/verify-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reference, orderId })
            });

            const verifyData = await verifyRes.json();

            if (!verifyRes.ok || !verifyData.success) {
                throw new Error(verifyData.error || 'Verification failed');
            }

            // Backend has updated order status successfully
            setShowGateway(null);
            setIsSuccess(true);
            setIsProcessing(false);

            setTimeout(() => {
                localStorage.removeItem('currentOrder');
                localStorage.removeItem('agreedPrice');
                localStorage.removeItem('fareType');
                localStorage.removeItem('matchedDriver');
                router.push(`/tracking/${orderId}`);
            }, 1500);

        } catch (err) {
            console.error("Payment verification caught error", err);
            alert(`Payment verification failed: ${err.message}. Please contact support.`);
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
                        status: 'accepted',
                        delivery_pin: generatedPin
                    })
                    .eq('id', orderId);

                if (updateErr) throw updateErr;

                setShowGateway(null);
                setIsSuccess(true);
                setIsProcessing(false);

                setTimeout(() => {
                    localStorage.removeItem('currentOrder');
                    localStorage.removeItem('agreedPrice');
                    localStorage.removeItem('fareType');
                    localStorage.removeItem('matchedDriver');
                    router.push(`/tracking/${orderId}`);
                }, 1500);

            } catch (err) {
                console.error("Payment finishing caught error", err);
                alert("Payment successful but failed to register PIN. Please contact support.");
                setIsProcessing(false);
            }
        }, 1500);
    };

    const handleCancelOrder = async () => {
        if (!window.confirm("Are you sure you want to cancel this delivery request? Your matched driver will be notified.")) return;
        
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

    if (loading) return <div className="p-10 text-center animate-pulse font-bold text-charcoal-900 min-h-screen flex items-center justify-center">Loading Checkout...</div>;
    if (!orderData) return <div className="p-10 text-center text-red-500 font-bold min-h-screen flex items-center justify-center">Order not found.</div>;

    if (isSuccess) {
        return (
            <main className="bg-emerald-500 min-h-screen flex flex-col items-center justify-center p-6 text-center">
                <div className="w-24 h-24 bg-white text-emerald-500 rounded-full flex items-center justify-center shadow-2xl mb-6 scale-up-center">
                    <CheckCircle2 size={48} className="stroke-[3]" />
                </div>
                <h1 className="text-4xl font-black text-white mb-2 tracking-tight">Payment Confirmed</h1>
                <p className="text-emerald-50 font-medium text-lg mb-8 max-w-xs">{driverData?.full_name || 'Driver'} will arrive for pickup in <span className="underline font-black">30-50 mins</span>.</p>
                <div className="bg-black/10 backdrop-blur-md px-6 py-3 rounded-2xl border border-white/20 text-white font-bold text-sm">
                    Routing to Live Tracking...
                </div>
            </main>
        );
    }


    return (
        <main className="bg-gray-50 min-h-screen pt-24 pb-32 relative">
            <div className="max-w-md mx-auto px-4 sm:px-6">
                
                {/* Header */}
                <div className="flex items-center gap-3 mb-8">
                    <button onClick={() => !showGateway && router.back()} className="w-10 h-10 bg-white hover:bg-gray-100 rounded-full flex items-center justify-center shadow-sm border border-gray-200">
                        <ArrowLeft size={20} className="text-charcoal-700" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-extrabold text-charcoal-900 tracking-tight">Checkout</h1>
                        <p className="text-charcoal-500 font-medium text-sm flex items-center gap-1">
                            <Lock size={12} /> Secure encrypted payment
                        </p>
                    </div>
                </div>

                <div className="bg-white rounded-3xl p-6 shadow-xl border border-gray-100 mb-8 text-center">
                    <div className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-1">Amount to Pay</div>
                    <div className="text-5xl font-black text-charcoal-900 mb-6">₦{orderData.agreed_price}</div>
                    <div className="text-left bg-gray-50 p-4 rounded-2xl">
                        <div className="flex justify-between text-sm mb-2">
                             <span className="font-bold text-charcoal-500">Service</span>
                             <span className="font-bold text-charcoal-900">Delivery</span>
                        </div>
                        <div className="flex justify-between text-sm">
                             <span className="font-bold text-charcoal-500">To Pay</span>
                             <span className="font-bold text-charcoal-900">{driverData?.full_name || 'Matched Driver'}</span>
                        </div>
                    </div>
                </div>

                <div className="mb-4">
                    <h2 className="font-bold text-sm text-charcoal-500 uppercase tracking-widest mb-3 ml-2">Select Payment Method</h2>
                    
                    <div className="space-y-3">
                        {/* OPAY */}
                        <label className={`block relative bg-white border-2 rounded-2xl p-4 transition-all cursor-pointer ${method === 'opay' ? 'border-green-500 bg-green-50 ring-4 ring-green-500/20' : 'border-gray-200 hover:border-gray-300'}`}>
                            <input type="radio" name="payment" value="opay" checked={method === 'opay'} onChange={() => setMethod('opay')} className="hidden" />
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-green-50 rounded-xl flex items-center justify-center border border-green-100 text-green-600 font-black text-xl">
                                    O
                                </div>
                                <div className="flex-1">
                                    <div className="font-bold text-charcoal-900 text-lg">Pay with OPay</div>
                                    <div className="text-xs text-charcoal-500 font-medium">Scan QR to pay instantly</div>
                                </div>
                                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${method === 'opay' ? 'border-green-500 bg-green-500' : 'border-gray-300'}`}>
                                    {method === 'opay' && <CheckCircle2 size={16} className="text-white" />}
                                </div>
                            </div>
                        </label>

                        {/* PAYSTACK */}
                        <label className={`block relative bg-white border-2 rounded-2xl p-4 transition-all cursor-pointer ${method === 'paystack' ? 'border-cyan-500 bg-cyan-50 ring-4 ring-cyan-500/20' : 'border-gray-200 hover:border-gray-300'}`}>
                            <input type="radio" name="payment" value="paystack" checked={method === 'paystack'} onChange={() => setMethod('paystack')} className="hidden" />
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-cyan-50 rounded-xl flex items-center justify-center border border-cyan-100 text-cyan-600">
                                    <CreditCard size={24} />
                                </div>
                                <div className="flex-1">
                                    <div className="font-bold text-charcoal-900 text-lg">Pay with Paystack</div>
                                    <div className="text-xs text-charcoal-500 font-medium">Card, Bank Transfer, USSD</div>
                                </div>
                                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${method === 'paystack' ? 'border-cyan-500 bg-cyan-500' : 'border-gray-300'}`}>
                                    {method === 'paystack' && <CheckCircle2 size={16} className="text-white" />}
                                </div>
                            </div>
                        </label>
                    </div>
                </div>

                {/* Cancel Request Button */}
                <div className="mt-8 text-center">
                    <button 
                        onClick={handleCancelOrder}
                        className="text-[10px] font-black uppercase tracking-[0.2em] text-red-400 hover:text-red-600 transition-colors py-4 px-8 border border-red-500/10 rounded-full"
                    >
                        Cancel Delivery Request
                    </button>
                </div>

            </div>

            <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4 pb-8 z-40 shadow-[0_-20px_40px_-20px_rgba(0,0,0,0.1)]">
                <button 
                  onClick={handleInitiatePayment}
                  disabled={!method}
                  className={`w-full py-5 rounded-2xl font-black text-lg transition-all flex items-center justify-center shadow-lg ${
                      !method ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 
                      'bg-charcoal-900 hover:bg-black text-white hover:shadow-xl hover:shadow-black/20 hover:-translate-y-1'
                  }`}
                >
                  Pay ₦{orderData.agreed_price}
                </button>
            </div>

            {/* MOCK GATEWAY OVERLAYS - Kept only OPay as Paystack is now real */}

            {showGateway === 'opay' && (
                <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white w-full max-w-sm rounded-[2rem] overflow-hidden shadow-2xl animate-slide-up">
                        <div className="bg-green-50 p-5 flex items-center justify-between border-b border-green-100">
                            <div className="font-black text-lg text-green-600 flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-green-500 text-white flex items-center justify-center text-xs">O</div>
                                OPay Web
                            </div>
                            <button onClick={() => !isProcessing && setShowGateway(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                        </div>
                        <div className="p-6 text-center">
                            <div className="mb-6">
                                <div className="text-charcoal-500 text-sm font-medium">Scan to Pay</div>
                                <div className="text-3xl font-black text-charcoal-900">₦{orderData.agreed_price}</div>
                            </div>
                            
                            <div className="bg-white border-4 border-green-50 rounded-3xl p-6 mx-auto w-48 h-48 mb-6 flex items-center justify-center shadow-inner relative overflow-hidden">
                                <div className="absolute inset-0 bg-green-500/10 animate-pulse"></div>
                                <QrCode size={120} className="text-charcoal-900 relative z-10" />
                                <div className="absolute top-1/2 left-0 w-full h-0.5 bg-green-500 shadow-[0_0_8px_2px_#22c55e] animate-scan z-20"></div>
                            </div>

                            <p className="text-sm font-medium text-charcoal-600 mb-6">Open your OPay App, tap <strong>Scan</strong>, and scan this QR code to confirm.</p>

                            <button 
                                onClick={handleMockPaymentSuccess} 
                                disabled={isProcessing}
                                className="w-full py-4 bg-green-500 hover:bg-green-600 text-white font-black rounded-xl text-lg flex justify-center items-center transition-colors"
                            >
                                {isProcessing ? <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : 'Simulate App Scan Success'}
                            </button>
                        </div>
                    </div>
                </div>
            )}


        </main>
    );
}

export default function PaymentPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-10 font-bold text-charcoal-900">Loading payment gateway...</div>}>
      <PaymentContent />
    </Suspense>
  );
}

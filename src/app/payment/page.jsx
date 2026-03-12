"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { ArrowLeft, CheckCircle2, CreditCard, Lock, X, QrCode } from 'lucide-react';

export default function PaymentPage() {
    const router = useRouter();
    const supabase = createClient();
    
    const [driverData, setDriverData] = useState(null);
    const [orderData, setOrderData] = useState(null);
    const [method, setMethod] = useState('');
    const [showGateway, setShowGateway] = useState(null); // 'paystack' | 'opay'
    const [isProcessing, setIsProcessing] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);

    useEffect(() => {
        const dData = localStorage.getItem('matchedDriver');
        const oData = localStorage.getItem('currentOrder');
        if (dData && oData) {
            setDriverData(JSON.parse(dData));
            setOrderData(JSON.parse(oData));
        } else {
            router.push('/send');
        }
    }, [router]);

    const handleInitiatePayment = () => {
        if (!method) {
            alert("Please select a payment method.");
            return;
        }
        setShowGateway(method);
    };

    const handleMockPaymentSuccess = async () => {
        setIsProcessing(true);

        setTimeout(async () => {
            setShowGateway(null);
            setIsSuccess(true);
            setIsProcessing(false);

            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) console.warn("No auth user found");

                const fareType = localStorage.getItem('fareType') || 'standard';
                const finalPrice = driverData.price || 1500;

                const { data, error } = await supabase.from('orders').insert({
                    user_id: user?.id || null,
                    pickup_name: orderData.pickup.name,
                    pickup_lat: orderData.pickup.coords.lat,
                    pickup_lng: orderData.pickup.coords.lng,
                    dropoff_name: orderData.dropoff.name,
                    dropoff_lat: orderData.dropoff.coords.lat,
                    dropoff_lng: orderData.dropoff.coords.lng,
                    item_category: orderData.category,
                    item_size: orderData.size,
                    receiver_name: orderData.receiver.name,
                    receiver_phone: orderData.receiver.phone,
                    fare_type: fareType,
                    agreed_price: finalPrice,
                    status: 'accepted'
                }).select().single();

                if (error) console.error("Mock order insert failed", error);

                setTimeout(() => {
                    localStorage.removeItem('currentOrder');
                    localStorage.removeItem('agreedPrice');
                    localStorage.removeItem('fareType');
                    localStorage.removeItem('matchedDriver');
                    
                    if (data?.id) {
                        router.push(`/tracking/${data.id}`);
                    } else {
                        router.push(`/tracking/mock_tracking_id`);
                    }
                }, 1500);

            } catch (err) {
                console.error("Payment insert caught error", err);
            }
        }, 1500);
    };

    if (!driverData) return <div className="p-10 text-center font-bold">Loading Checkout...</div>;

    if (isSuccess) {
        return (
            <main className="bg-emerald-500 min-h-screen flex flex-col items-center justify-center p-6 text-center animate-pulse">
                <div className="w-24 h-24 bg-white text-emerald-500 rounded-full flex items-center justify-center shadow-2xl mb-6">
                    <CheckCircle2 size={48} className="stroke-[3]" />
                </div>
                <h1 className="text-4xl font-black text-white mb-2 tracking-tight">Payment Successful</h1>
                <p className="text-emerald-50 font-medium text-lg">Routing you to live tracking...</p>
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
                    <div className="text-5xl font-black text-charcoal-900 mb-6">₦{driverData.price}</div>
                    <div className="text-left bg-gray-50 p-4 rounded-2xl">
                        <div className="flex justify-between text-sm mb-2">
                             <span className="font-bold text-charcoal-500">Service</span>
                             <span className="font-bold text-charcoal-900">Delivery</span>
                        </div>
                        <div className="flex justify-between text-sm">
                             <span className="font-bold text-charcoal-500">To Pay</span>
                             <span className="font-bold text-charcoal-900">{driverData.name}</span>
                        </div>
                    </div>
                </div>

                <div className="mb-4">
                    <h2 className="font-bold text-sm text-charcoal-500 uppercase tracking-widest mb-3 ml-2">Select Payment Method</h2>
                    
                    <div className="space-y-3">
                        {/* OPAY */}
                        <label className={`block relative bg-white border-2 rounded-2xl p-4 transition-all cursor-pointer ${method === 'opay' ? 'border-green-500 ring-4 ring-green-500/20' : 'border-gray-200 hover:border-gray-300'}`}>
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
                        <label className={`block relative bg-white border-2 rounded-2xl p-4 transition-all cursor-pointer ${method === 'paystack' ? 'border-cyan-500 ring-4 ring-cyan-500/20' : 'border-gray-200 hover:border-gray-300'}`}>
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
                  Pay ₦{driverData.price}
                </button>
            </div>

            {/* MOCK GATEWAY OVERLAYS */}
            {showGateway === 'paystack' && (
                <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white w-full max-w-sm rounded-[2rem] overflow-hidden shadow-2xl animate-slide-up">
                        <div className="bg-[#0ba4db]/10 p-5 flex items-center justify-between border-b border-[#0ba4db]/20">
                            <div className="font-black text-lg text-[#0ba4db] flex items-center gap-2">
                                <div className="w-6 h-6 rounded bg-[#0ba4db] text-white flex items-center justify-center text-xs">P</div>
                                Paystack
                            </div>
                            <button onClick={() => !isProcessing && setShowGateway(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                        </div>
                        <div className="p-6">
                            <div className="text-center mb-6">
                                <div className="text-charcoal-500 text-sm font-medium">yoursite.com</div>
                                <div className="text-3xl font-black text-charcoal-900">₦{driverData.price}</div>
                            </div>
                            <div className="space-y-4 mb-6">
                                <input type="text" placeholder="Card Number (mock)" className="w-full border-b-2 border-gray-200 py-3 text-lg font-bold focus:outline-none focus:border-[#0ba4db] text-charcoal-900" />
                                <div className="flex gap-4">
                                    <input type="text" placeholder="MM/YY" className="w-1/2 border-b-2 border-gray-200 py-3 text-lg font-bold focus:outline-none focus:border-[#0ba4db] text-charcoal-900" />
                                    <input type="text" placeholder="CVV" className="w-1/2 border-b-2 border-gray-200 py-3 text-lg font-bold focus:outline-none focus:border-[#0ba4db] text-charcoal-900" />
                                </div>
                            </div>
                            <button 
                                onClick={handleMockPaymentSuccess} 
                                disabled={isProcessing}
                                className="w-full py-4 bg-[#0ba4db] hover:bg-[#098bbd] text-white font-black rounded-xl text-lg flex justify-center items-center transition-colors"
                            >
                                {isProcessing ? <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : `Pay ₦${driverData.price}`}
                            </button>
                            <div className="mt-4 text-center text-xs text-gray-400 font-bold flex items-center justify-center gap-1"><Lock size={10} /> Secured by Paystack</div>
                        </div>
                    </div>
                </div>
            )}

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
                                <div className="text-3xl font-black text-charcoal-900">₦{driverData.price}</div>
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

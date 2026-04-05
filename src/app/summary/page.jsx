"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Navigation, User, ShieldCheck } from 'lucide-react';
import MiniRouteMap from '@/components/MiniRouteMap';

export default function OrderSummary() {
  const router = useRouter();
  const [orderData, setOrderData] = useState(null);
  const [driverData, setDriverData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const data = localStorage.getItem('currentOrder');
    const driver = localStorage.getItem('matchedDriver');
    if (data && driver) {
      setOrderData(JSON.parse(data));
      setDriverData(JSON.parse(driver));
    } else {
        router.push('/send');
    }
  }, []);

  if (!orderData || !driverData) return <div className="p-10 text-center">Loading...</div>;

  const handleProceed = () => {
    // Navigate to local payment gateway mock
    router.push('/payment');
  };

  return (
    <main className="bg-charcoal-50 min-h-screen pt-24 pb-32">
      <div className="max-w-2xl mx-auto px-4 sm:px-6">
        <div className="flex items-center gap-3 mb-8">
          <button onClick={() => router.back()} className="w-10 h-10 bg-white hover:bg-gray-50 rounded-full flex items-center justify-center shadow-sm border border-gray-100">
            <ArrowLeft size={20} className="text-charcoal-700" />
          </button>
          <div>
            <h1 className="text-2xl font-extrabold text-charcoal-900 tracking-tight">Final Summary</h1>
            <p className="text-charcoal-500 font-medium text-sm mt-0.5">Review your matched driver and route.</p>
          </div>
        </div>

        {/* Driver Section */}
        <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-gray-100 mb-6">
            <h3 className="text-sm font-bold text-charcoal-400 uppercase tracking-widest mb-4">Confirmed Driver</h3>
            <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center overflow-hidden">
                        <User size={28} />
                    </div>
                    <div>
                        <div className="font-bold text-lg text-charcoal-900 flex items-center gap-1">
                            {driverData?.full_name || 'Matched Driver'}
                            <ShieldCheck size={16} className="text-blue-500" />
                        </div>
                        <div className="text-sm text-charcoal-500 font-medium">Verified Driver</div>
                    </div>
                </div>
                <div className="text-right">
                    <div className="text-xs text-charcoal-500 font-bold uppercase tracking-widest mb-1">Total Due</div>
                    <div className="font-black text-2xl text-emerald-600">₦{orderData.agreed_price}</div>
                </div>
            </div>
        </div>

        {/* Route Details with Mapbox Integrated */}
        <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-gray-100 mb-6">
            <h3 className="text-sm font-bold text-charcoal-400 uppercase tracking-widest mb-4">Confirmed Route</h3>
            
            <div className="animate-in zoom-in-95 duration-500 mb-6">
                 <MiniRouteMap 
                    pickup={{lat: parseFloat(orderData.pickup_lat), lng: parseFloat(orderData.pickup_lng)}} 
                    dropoff={{lat: parseFloat(orderData.dropoff_lat), lng: parseFloat(orderData.dropoff_lng)}} 
                 />
            </div>

            <div className="flex gap-4">
                <div className="flex flex-col items-center mt-1">
                    <div className="w-3 h-3 rounded-full bg-charcoal-800 ring-4 ring-gray-100 mt-1 shadow-sm"></div>
                    <div className="w-0.5 h-16 bg-gradient-to-b from-gray-200 to-emerald-200 my-1"></div>
                    <div className="w-3 h-3 rounded-full bg-emerald-500 ring-4 ring-emerald-50 mb-1 shadow-sm animate-pulse"></div>
                </div>
                <div className="flex-1">
                    <div className="mb-6">
                        <div className="text-xs font-bold text-charcoal-500 uppercase tracking-widest mb-1">Pickup Location</div>
                        <div className="font-bold text-charcoal-900 bg-gray-50 px-3 py-2.5 rounded-xl border border-gray-100">{orderData.pickup_name}</div>
                    </div>
                    <div>
                        <div className="text-xs font-bold text-emerald-600 uppercase tracking-widest mb-1">Dropoff Location</div>
                        <div className="font-bold text-emerald-900 bg-emerald-50/50 border border-emerald-100 px-3 py-2.5 rounded-xl">{orderData.dropoff_name}</div>
                    </div>
                </div>
            </div>
        </div>

        {/* Parcel Section */}
        <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-gray-100 mb-6">
             <h3 className="text-sm font-bold text-charcoal-400 uppercase tracking-widest mb-4">Parcel & Receiver</h3>
             <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-xl">
                 <div>
                     <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">Category</div>
                     <div className="font-bold text-charcoal-900 text-sm">{orderData.item_category}</div>
                 </div>
                 <div>
                     <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">Size</div>
                     <div className="font-bold text-charcoal-900 text-sm">{orderData.item_size} Box</div>
                 </div>
                 <div className="col-span-2 pt-3 border-t border-gray-200">
                     <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">Receiver</div>
                     <div className="font-bold text-charcoal-900 text-sm">{orderData.receiver_name} • {orderData.receiver_phone}</div>
                 </div>
             </div>
        </div>

      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4 pb-8 z-40 lg:hidden shadow-[0_-20px_40px_-20px_rgba(0,0,0,0.1)]">
        <button 
          onClick={handleProceed}
          disabled={loading}
          className="w-full py-4 bg-charcoal-900 hover:bg-black text-white font-bold rounded-2xl shadow-xl shadow-black/20 transition-transform focus:outline-none flex items-center justify-center gap-2 text-lg disabled:opacity-50"
        >
          Proceed to Payment <Navigation size={20} className="stroke-[3]" />
        </button>
      </div>
    </main>
  );
}

"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { ArrowLeft } from 'lucide-react';

export default function Pricing() {
  const router = useRouter();
  const supabase = createClient();
  const [distance, setDistance] = useState(0);
  const [costs, setCosts] = useState({ standard: 1500, express: 1800 });
  const [orderData, setOrderData] = useState(null);
  const [fareType, setFareType] = useState('standard');
  const [customOffer, setCustomOffer] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const data = localStorage.getItem('currentOrder');
    if (data) {
      const parsed = JSON.parse(data);
      setOrderData(parsed);

      // --- NEW: MOCK PRICING LOGIC ---
      if (!process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN) {
        // Use Haversine distance for demo
        const getDistance = (lat1, lon1, lat2, lon2) => {
          const R = 6371; // km
          const dLat = (lat2 - lat1) * Math.PI / 180;
          const dLon = (lon2 - lon1) * Math.PI / 180;
          const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          return R * c;
        };

        const d = getDistance(
          parsed.pickup.coords.lat,
          parsed.pickup.coords.lng,
          parsed.dropoff.coords.lat,
          parsed.dropoff.coords.lng
        );
        
        setDistance(d.toFixed(1));
        const base = 500;
        const perKm = 200;
        const vehicleMultipliers = { bike: 1.0, car: 1.5, van: 2.5 };
        const multiplier = vehicleMultipliers[parsed.vehicleType] || 1.0;

        const calcStandard = Math.round((base + (d * perKm)) * multiplier / 10) * 10;
        setCosts({
          standard: calcStandard,
          express: Math.round(calcStandard * 1.3 / 10) * 10
        });
      }
      // -------------------------------
    }
  }, []);

  const handleBidding = async () => {
    let finalCost = fareType === 'offer' ? Number(customOffer) : (fareType === 'standard' ? costs.standard : costs.express);
    
    if (fareType === 'offer' && !customOffer) {
      alert("Please enter your offer amount");
      return;
    }

    if (!orderData) return;
    setIsSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert("Please login to continue.");
        router.push('/login');
        return;
      }

      // Generate a random 4-digit PIN
      const pin = Math.floor(1000 + Math.random() * 9000).toString();

      const orderInsert = {
        user_id: user.id,
        pickup_name: orderData.pickup.name,
        pickup_lat: orderData.pickup.coords.lat,
        pickup_lng: orderData.pickup.coords.lng,
        dropoff_name: orderData.dropoff.name,
        dropoff_lat: orderData.dropoff.coords.lat,
        dropoff_lng: orderData.dropoff.coords.lng,
        item_category: orderData.category,
        item_size: orderData.size,
        recipient_name: orderData.receiver.name,
        recipient_phone: orderData.receiver.phone,
        fare_type: fareType,
        agreed_price: finalCost,
        status: 'looking_for_driver',
        delivery_pin: pin,
        pickup_details: orderData.pickup.details || null,
        dropoff_details: orderData.dropoff.details || null,
        scheduled_at: orderData.scheduledAt || null,
        voice_note_url: orderData.voiceNoteUrl || null
      };


      const { data, error } = await supabase
        .from('orders')
        .insert(orderInsert)
        .select()
        .single();

      if (error) throw error;

      router.push(`/matching?orderId=${data.id}`);
    } catch (err) {
      console.error("Order creation failed", err);
      alert("Failed to create order. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };


  if (!orderData) return <div className="p-10 text-center">Loading...</div>;

  return (
    <main className="bg-white min-h-screen pt-24 pb-32">
      <div className="max-w-2xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <button onClick={() => router.back()} className="w-10 h-10 bg-gray-50 hover:bg-gray-100 rounded-full flex items-center justify-center transition-colors">
              <ArrowLeft size={20} className="text-charcoal-700" />
            </button>
            <div>
              <h1 className="text-2xl font-extrabold text-charcoal-900 tracking-tight">Set Your Price</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-charcoal-500 font-medium text-sm">Choose a fare that works for you.</p>
                {orderData.scheduledAt && (
                   <span className="bg-blue-100 text-blue-700 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border border-blue-200">
                     Scheduled
                   </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Fare Options */}
        <div className="space-y-4 mb-8">
          {/* Standard */}
          <label className={`block relative border rounded-2xl p-4 transition-all cursor-pointer overflow-hidden ${fareType === 'standard' ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/20' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
            <input type="radio" name="fareType" value="standard" checked={fareType === 'standard'} onChange={() => setFareType('standard')} className="hidden" />
            <div className="flex justify-between items-center mb-1">
              <div className="flex items-center gap-2">
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${fareType === 'standard' ? 'border-emerald-500' : 'border-gray-300'}`}>
                  {fareType === 'standard' && <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full"></div>}
                </div>
                <span className="font-bold text-charcoal-900">Standard Delivery</span>
              </div>
              <span className="font-extrabold text-lg text-emerald-800">â‚¦{costs.standard}</span>
            </div>
            <div className="text-charcoal-500 text-xs font-medium pl-7 uppercase tracking-wider">
               {orderData.vehicleType || 'bike'} â€¢ Driver accepts within ~5 mins. {distance > 0 && `(${distance} km)`}
            </div>
          </label>

          {/* Express */}
          <label className={`block relative border border-gray-200 rounded-2xl p-4 transition-all cursor-pointer overflow-hidden ${fareType === 'express' ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/20' : 'bg-white hover:border-gray-300'}`}>
            <div className="absolute top-0 right-0 bg-yellow-400 text-yellow-900 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-bl-xl">Fastest</div>
            <input type="radio" name="fareType" value="express" checked={fareType === 'express'} onChange={() => setFareType('express')} className="hidden" />
            <div className="flex justify-between items-center mb-1">
              <div className="flex items-center gap-2">
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${fareType === 'express' ? 'border-emerald-500' : 'border-gray-300'}`}>
                  {fareType === 'express' && <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full"></div>}
                </div>
                <span className="font-bold text-charcoal-900">Priority Express</span>
              </div>
              <span className="font-extrabold text-lg text-charcoal-900">â‚¦{costs.express}</span>
            </div>
            <div className="text-charcoal-500 text-xs font-medium pl-7">Matched instantly. Priority routing.</div>
          </label>

          {/* Offer Your Price */}
          <label className={`block relative border border-gray-200 rounded-2xl p-4 transition-all cursor-pointer overflow-hidden ${fareType === 'offer' ? 'border-charcoal-900 bg-charcoal-50 ring-2 ring-charcoal-900/10' : 'bg-white hover:border-gray-300'}`}>
            <input type="radio" name="fareType" value="offer" checked={fareType === 'offer'} onChange={() => setFareType('offer')} className="hidden" />
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center border-gray-300 ${fareType === 'offer' ? 'border-charcoal-900' : ''}`}>
                {fareType === 'offer' && <div className="w-2.5 h-2.5 bg-charcoal-900 rounded-full"></div>}
              </div>
              <span className="font-bold text-charcoal-900">Offer Your Price</span>
            </div>
            <div className="pl-7">
              <div className="relative flex items-center">
                <span className="absolute left-4 font-bold text-charcoal-400">â‚¦</span>
                <input 
                  type="number" 
                  disabled={fareType !== 'offer'}
                  value={customOffer}
                  onChange={(e) => setCustomOffer(e.target.value)}
                  placeholder={`Suggest ~â‚¦${costs.standard}`}
                  className="w-full bg-white border border-gray-300 rounded-xl py-3 pl-8 pr-4 font-bold text-charcoal-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-charcoal-900 disabled:opacity-50 disabled:bg-gray-50"
                  step="10"
                />
              </div>
              <div className="text-charcoal-500 text-xs font-medium mt-2">Drivers may counter-offer if too low.</div>
            </div>
          </label>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4 pb-8 z-40 shadow-[0_-20px_40px_-20px_rgba(0,0,0,0.1)] focus-within:relative focus-within:pb-4 focus-within:shadow-none focus-within:border-t-0">
        <button 
          onClick={handleBidding}
          disabled={isSubmitting}
          className={`w-full max-w-2xl mx-auto py-4 bg-charcoal-900 hover:bg-black text-white font-bold rounded-2xl shadow-lg transition-transform focus:outline-none flex items-center justify-center gap-2 ${isSubmitting ? 'opacity-70 cursor-not-allowed' : ''}`}
        >
          {isSubmitting ? 'Initialising...' : (fareType === 'offer' ? 'Start Negotiation' : 'Find Drivers')}
          {isSubmitting && <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin ml-2"></div>}
        </button>
      </div>

    </main>
  );
}

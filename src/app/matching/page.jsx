"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, MapPin, Check, ShieldCheck, User } from 'lucide-react';

export default function Matching() {
  const router = useRouter();
  const [orderData, setOrderData] = useState(null);
  const [fareData, setFareData] = useState(null);
  
  // States: 'searching' | 'driver_found' | 'accepted'
  const [matchState, setMatchState] = useState('searching');
  const [driverOffer, setDriverOffer] = useState(null);

  useEffect(() => {
    const data = localStorage.getItem('currentOrder');
    const fare = localStorage.getItem('agreedPrice');
    
    if (data && fare) {
      setOrderData(JSON.parse(data));
      setFareData(fare);

      // Simulate a search delay
      const searchTimer = setTimeout(() => {
        // Mock Driver Output
        setDriverOffer({
          name: "Abdullahi M.",
          rating: 4.9,
          trips: 342,
          vehicle: "TVS King Tricycle (KANO-123)",
          eta: "6 mins",
          price: fare // Match their price for simplicity
        });
        setMatchState('driver_found');
      }, 4000);

      return () => clearTimeout(searchTimer);
    }
  }, []);

  const handleAcceptDriver = () => {
    setMatchState('accepted');
    // Save matched driver to localStorage
    localStorage.setItem('matchedDriver', JSON.stringify(driverOffer));
    
    setTimeout(() => {
       router.push('/summary');
    }, 1500);
  };

  if (!orderData) return <div className="min-h-screen bg-charcoal-900 text-white p-10 font-bold">Initializing...</div>;

  return (
    <main className="bg-charcoal-900 min-h-screen relative overflow-hidden flex flex-col items-center justify-center p-4">
      {/* Search Radar UI */}
      {matchState === 'searching' && (
        <div className="flex flex-col items-center z-10 text-center">
          <div className="relative mb-8">
            <div className="w-24 h-24 rounded-full bg-emerald-500 flex items-center justify-center absolute inset-0 m-auto z-10">
               <Search size={40} className="text-charcoal-900 animate-pulse" />
            </div>
            {/* Radar Ripples */}
            <div className="w-24 h-24 rounded-full border border-emerald-500/50 absolute inset-0 m-auto animate-ping duration-1000"></div>
            <div className="w-48 h-48 rounded-full border border-emerald-500/30 absolute -inset-12 m-auto animate-ping delay-300 duration-1000"></div>
            <div className="w-72 h-72 rounded-full border border-emerald-500/10 absolute -inset-24 m-auto animate-ping delay-700 duration-1000"></div>
          </div>
          <h2 className="text-3xl font-black text-white mb-2 tracking-tight animate-pulse">Contacting Drivers</h2>
          <p className="text-emerald-400 font-bold text-sm uppercase tracking-widest bg-emerald-500/10 px-4 py-2 rounded-full border border-emerald-500/20">
            Bid: ₦{fareData}
          </p>
        </div>
      )}

      {/* Driver Found UI */}
      {matchState === 'driver_found' && driverOffer && (
        <div className="w-full max-w-sm bg-white rounded-[2rem] p-6 shadow-2xl animate-slide-up z-20">
            <div className="text-center mb-6">
                <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3 border-4 border-white shadow-lg -mt-12 relative z-10">
                    <Check size={32} className="stroke-[3]" />
                </div>
                <h2 className="text-xl font-black text-charcoal-900 tracking-tight">Driver Matched!</h2>
                <p className="text-charcoal-500 text-sm font-medium">Please review and accept.</p>
            </div>

            <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 mb-6">
               <div className="flex justify-between items-start mb-4">
                   <div className="flex items-center gap-3">
                       <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center overflow-hidden">
                          <User size={24} className="text-gray-500" />
                       </div>
                       <div>
                           <div className="font-bold text-charcoal-900 flex items-center gap-1">
                               {driverOffer.name} 
                               <ShieldCheck size={14} className="text-blue-500" />
                           </div>
                           <div className="text-xs text-charcoal-500 font-medium">★ {driverOffer.rating} • {driverOffer.trips} trips</div>
                       </div>
                   </div>
                   <div className="text-right">
                       <div className="font-black text-xl text-emerald-600">₦{driverOffer.price}</div>
                   </div>
               </div>
               
               <div className="bg-white border border-gray-200 p-3 rounded-xl flex items-center justify-between text-sm">
                   <div className="font-bold text-charcoal-800">{driverOffer.vehicle}</div>
                   <div className="font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded border border-emerald-100">ETA: {driverOffer.eta}</div>
               </div>
            </div>

            <div className="flex gap-2">
               <button onClick={() => setMatchState('searching')} className="w-1/3 py-3 rounded-xl font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors">
                 Decline
               </button>
               <button onClick={handleAcceptDriver} className="w-2/3 py-3 rounded-xl font-black text-white bg-charcoal-900 hover:bg-black transition-colors shadow-lg shadow-black/20 text-lg">
                 Accept ₦{driverOffer.price}
               </button>
            </div>
        </div>
      )}

      {/* Accepted Feedback UI */}
      {matchState === 'accepted' && (
        <div className="flex flex-col items-center z-10 text-center animate-pulse">
           <div className="w-20 h-20 bg-emerald-500 text-charcoal-900 rounded-full flex items-center justify-center mb-4">
               <Check size={40} className="stroke-[3]" />
           </div>
           <h2 className="text-2xl font-black text-white tracking-tight">Driver Confirmed</h2>
           <p className="text-gray-400 font-medium">Preparing your invoice...</p>
        </div>
      )}

      {/* Subtle Background Elements */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-20 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-gray-700 via-charcoal-900 to-black z-0"></div>
    </main>
  );
}

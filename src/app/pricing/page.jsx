"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Wallet, ShieldCheck, Banknote } from 'lucide-react';

export default function Pricing() {
  const router = useRouter();
  const [orderData, setOrderData] = useState(null);
  const [fareType, setFareType] = useState('standard');
  const [customOffer, setCustomOffer] = useState('');
  
  // Dummy calculated prices based on local storage
  const rawCost = 1500;
  const standardCost = Math.round(rawCost * 0.85);

  useEffect(() => {
    const data = localStorage.getItem('currentOrder');
    if (data) {
      setOrderData(JSON.parse(data));
    }
  }, []);

  const handleBidding = () => {
    let finalCost = fareType === 'offer' ? Number(customOffer) : (fareType === 'standard' ? standardCost : rawCost);
    
    if (fareType === 'offer' && !customOffer) {
      alert("Please enter your offer amount");
      return;
    }

    // In a real app we'd dispatch to Supabase here
    localStorage.setItem('agreedPrice', finalCost);
    localStorage.setItem('fareType', fareType);
    router.push('/matching');
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
              <p className="text-charcoal-500 font-medium text-sm mt-0.5">Choose a fare that works for you.</p>
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
              <span className="font-extrabold text-lg text-emerald-800">₦{standardCost}</span>
            </div>
            <div className="text-charcoal-500 text-xs font-medium pl-7">Driver accepts within ~5 mins.</div>
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
              <span className="font-extrabold text-lg text-charcoal-900">₦{rawCost}</span>
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
                <span className="absolute left-4 font-bold text-charcoal-400">₦</span>
                <input 
                  type="number" 
                  disabled={fareType !== 'offer'}
                  value={customOffer}
                  onChange={(e) => setCustomOffer(e.target.value)}
                  placeholder={`Suggest ~₦${standardCost}`}
                  className="w-full bg-white border border-gray-300 rounded-xl py-3 pl-8 pr-4 font-bold text-charcoal-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-charcoal-900 disabled:opacity-50 disabled:bg-gray-50"
                  step="10"
                />
              </div>
              <div className="text-charcoal-500 text-xs font-medium mt-2">Drivers may counter-offer if too low.</div>
            </div>
          </label>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4 pb-8 z-40 lg:hidden shadow-[0_-20px_40px_-20px_rgba(0,0,0,0.1)] focus-within:relative focus-within:pb-4 focus-within:shadow-none focus-within:border-t-0">
        <button 
          onClick={handleBidding}
          className="w-full py-4 bg-charcoal-900 hover:bg-black text-white font-bold rounded-2xl shadow-lg transition-transform focus:outline-none flex items-center justify-center gap-2"
        >
          Find Drivers <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin ml-2"></div>
        </button>
      </div>
    </main>
  );
}

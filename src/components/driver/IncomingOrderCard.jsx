import { useState } from 'react';
import { MapPin, Navigation, Clock, Check, Plus, Minus, Package, User, Volume2, ChevronDown, ChevronUp, Zap, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function IncomingOrderCard({ order, onAcceptBase, onCounterOffer, onReject }) {
  const [customOffer, setCustomOffer] = useState(order?.agreed_price ? parseInt(order.agreed_price) : 0);
  const [showDetails, setShowDetails] = useState(false);

  if (!order) return null;

  return (
    <motion.div 
      initial={{ y: 100, opacity: 0, scale: 0.9 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ y: 100, opacity: 0, scale: 0.9 }}
      className="fixed inset-x-6 bottom-[calc(8rem+var(--safe-bottom))] z-50 glass-dark rounded-[3rem] shadow-premium overflow-hidden ring-1 ring-white/10 backdrop-blur-3xl"
    >
      {/* Background Pulse */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-40 h-40 bg-emerald-500/10 rounded-full blur-3xl animate-pulse"></div>
      </div>

      {/* Header */}
      <div className="bg-charcoal-900/40 p-6 border-b border-white/5 flex justify-between items-center relative z-10">
        <div>
          <div className="flex items-center gap-2 mb-1">
             <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping"></div>
             <h3 className="font-black text-white text-xl uppercase tracking-tighter italic font-outfit">Priority Task</h3>
          </div>
          <p className="text-emerald-400 font-black text-[10px] uppercase tracking-[0.3em] opacity-80">{order.item_category} • {order.item_size}</p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-black text-white leading-none font-outfit italic">₦{order.agreed_price}</div>
          <div className="text-[9px] text-charcoal-500 font-bold tracking-[0.2em] uppercase mt-1">Base Yield</div>
        </div>
      </div>
      
      <div className="p-6 space-y-5 relative z-10">
        {/* Route Visualization */}
        <div className="relative pl-8 py-4 bg-charcoal-950/40 rounded-[2rem] border border-white/5 shadow-inner">
          <div className="absolute left-4 top-8 bottom-8 w-px bg-gradient-to-b from-emerald-500 via-emerald-500/20 to-charcoal-500/20"></div>
          
          <div className="relative mb-6">
            <div className="absolute -left-[20px] top-1.5 w-3 h-3 rounded-full border border-emerald-500 bg-charcoal-950 shadow-glow"></div>
            <div>
               <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest leading-none mb-1 opacity-60">Source Node</p>
               <p className="text-[14px] font-black text-white leading-tight font-outfit">{order.pickup_name}</p>
            </div>
          </div>
          
          <div className="relative">
            <div className="absolute -left-[20px] top-1.5 w-3 h-3 rounded-md border border-white/40 bg-charcoal-950"></div>
            <div>
               <p className="text-[9px] font-black text-charcoal-500 uppercase tracking-widest leading-none mb-1">Destination</p>
               <p className="text-[14px] font-black text-white leading-tight font-outfit opacity-80">{order.dropoff_name}</p>
            </div>
          </div>
        </div>

        {/* Dynamic Metadata */}
        <div className="flex flex-wrap gap-2">
          {order.distanceKm && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 glass-dark text-white rounded-xl text-[10px] font-black uppercase tracking-widest border border-white/10">
              <Navigation size={12} className="text-emerald-500" /> {order.distanceKm}KM
            </div>
          )}
          <div className="flex items-center gap-1.5 px-3 py-1.5 glass-dark text-white rounded-xl text-[10px] font-black uppercase tracking-widest border border-white/10">
            <Package size={12} className="text-emerald-500" /> {order.item_size}
          </div>
          {order.scheduled_at && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 text-emerald-400 rounded-xl text-[10px] font-black uppercase tracking-widest border border-emerald-500/20">
              <Clock size={12} /> Scheduled
            </div>
          )}
        </div>

        {/* Counter Offer Engine (High Contrast) */}
        <div className="pt-4 border-t border-white/5 space-y-4">
          <div className="flex items-center justify-between px-2">
             <p className="text-[9px] font-black text-charcoal-500 uppercase tracking-[0.3em]">Negotiate Bid</p>
             <Zap size={12} className="text-emerald-500 animate-pulse" />
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={() => setCustomOffer(prev => Math.max(0, prev - 100))} 
              className="w-14 h-16 rounded-2xl glass-dark hover:bg-emerald-500/10 text-white border border-white/5 hover:border-emerald-500 transition-all flex items-center justify-center active:scale-95"
            >
              <Minus size={20} className="stroke-[3]" />
            </button>
            <div className="flex-1 relative group">
              <span className="absolute left-6 top-1/2 -translate-y-1/2 text-emerald-500/40 font-black text-xl italic font-outfit">₦</span>
              <input 
                type="number" 
                value={customOffer}
                onChange={(e) => setCustomOffer(parseInt(e.target.value) || 0)}
                className="w-full h-16 rounded-2xl bg-charcoal-950/80 border border-white/5 text-center font-black text-3xl text-emerald-500 focus:outline-none focus:border-emerald-500 focus:bg-black transition-all font-outfit italic shadow-inner"
              />
            </div>
            <button 
              onClick={() => setCustomOffer(prev => prev + 100)} 
              className="w-14 h-16 rounded-2xl glass-dark hover:bg-emerald-500/10 text-white border border-white/5 hover:border-emerald-500 transition-all flex items-center justify-center active:scale-95"
            >
              <Plus size={20} className="stroke-[3]" />
            </button>
          </div>

          <div className="flex gap-2">
             {[100, 500, 1000].map(amt => (
                <button 
                  key={amt}
                  onClick={() => setCustomOffer(prev => prev + amt)}
                  className="flex-1 py-2.5 rounded-xl glass-dark border border-white/5 text-white/40 font-black text-[9px] uppercase tracking-widest hover:border-emerald-500 hover:text-emerald-500 transition-all active:scale-95"
                >
                  +{amt}
                </button>
             ))}
          </div>

          <button 
             onClick={() => onCounterOffer(customOffer)}
             className="w-full py-4 rounded-2xl bg-white text-charcoal-950 font-black text-[11px] uppercase tracking-[0.25em] transition-all hover:bg-emerald-400 active:scale-95 shadow-premium"
          >
            Submit Custom Yield (₦{customOffer})
          </button>
        </div>

        {/* Primary Rapid Access */}
        <div className="flex gap-3 pt-2">
          <button onClick={onReject} className="w-16 h-16 rounded-[1.5rem] glass-dark border border-white/5 text-charcoal-600 hover:text-red-500 hover:border-red-500/30 flex items-center justify-center transition-all active:scale-95">
             <X size={24} />
          </button>
          <button onClick={onAcceptBase} className="flex-1 h-16 rounded-[1.5rem] bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 font-black text-sm uppercase tracking-[0.2em] flex items-center justify-center gap-3 transition-all active:scale-[0.98] shadow-glow">
             Initialize <Check size={20} className="stroke-[3]" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

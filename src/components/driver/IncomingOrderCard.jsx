import { useState } from 'react';
import { MapPin, Navigation, Clock, Check, Plus, Minus, Package, User, Volume2, ChevronDown, ChevronUp, Zap, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function IncomingOrderCard({ order, onAcceptBase, onCounterOffer, onReject, isEmbedded = false }) {
  const [customOffer, setCustomOffer] = useState(order?.agreed_price ? parseInt(order.agreed_price) : 0);
  const [showDetails, setShowDetails] = useState(false);

  if (!order) return null;

  return (
    <motion.div 
      initial={!isEmbedded ? { y: 100, opacity: 0 } : { opacity: 0, y: 30 }}
      animate={!isEmbedded ? { y: 0, opacity: 1 } : { opacity: 1, y: 0 }}
      exit={!isEmbedded ? { y: 100, opacity: 0 } : { opacity: 0, y: 30 }}
      className={`${!isEmbedded ? 'fixed inset-x-6 bottom-[calc(8rem+var(--safe-bottom))] z-50' : 'relative w-full'} bg-charcoal-900 border border-white/10 rounded-[2.8rem] shadow-premium overflow-hidden transition-all`}
    >
      <div className="p-8">
        {/* Header: Type and Price */}
        <div className="flex justify-between items-start mb-10">
           <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                 <div className="w-2 h-2 bg-emerald-500 rounded-full shadow-glow"></div>
                 <p className="text-white font-black text-[10px] uppercase tracking-[0.4em] font-outfit opacity-60 italic">Live Payload</p>
              </div>
              <div className="text-5xl font-black text-white font-outfit tracking-tighter italic">â‚¦{order.agreed_price?.toLocaleString()}</div>
           </div>
           
           <button 
             onClick={onReject}
             className="w-12 h-12 bg-white/5 hover:bg-white/10 rounded-2xl flex items-center justify-center text-charcoal-500 hover:text-white transition-all border border-white/5 active:scale-90"
           >
             <X size={20} />
           </button>
        </div>

        {/* Info Strip */}
        <div className="flex items-center gap-4 mb-8">
           <div className="bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 rounded-xl flex items-center gap-2">
              <Package size={14} className="text-emerald-500" />
              <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">{order.item_size || 'FLAT RATE'}</span>
           </div>
           <div className="bg-white/5 border border-white/5 px-4 py-2 rounded-xl flex items-center gap-2">
              <Navigation size={14} className="text-charcoal-400" />
              <span className="text-[10px] font-black text-charcoal-400 uppercase tracking-widest">{order.distanceKm || '4.2'}km</span>
           </div>
        </div>

        {/* Route Visualization */}
        <div className="space-y-6 mb-10 pl-2 border-l-2 border-emerald-500/20 ml-3">
           <div className="relative">
              <div className="absolute -left-[11px] top-1 w-4 h-4 rounded-full bg-emerald-500 border-4 border-charcoal-900 shadow-glow"></div>
              <p className="text-[9px] font-black text-charcoal-500 uppercase tracking-widest mb-1 italic">Source</p>
              <p className="text-base font-black text-white font-outfit uppercase tracking-tight">{order.pickup_name}</p>
           </div>
           <div className="relative">
              <div className="absolute -left-[11px] top-1 w-4 h-4 rounded-full bg-amber-500 border-4 border-charcoal-900 shadow-glow"></div>
              <p className="text-[9px] font-black text-charcoal-500 uppercase tracking-widest mb-1 italic">Destination</p>
              <p className="text-base font-black text-white font-outfit uppercase tracking-tight opacity-70">{order.dropoff_name}</p>
           </div>
        </div>

        {/* Primary Action */}
        <button 
          onClick={onAcceptBase}
          className="w-full py-6 bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 rounded-[2rem] font-black text-lg uppercase tracking-[0.25em] shadow-glow transition-all active:scale-95 flex items-center justify-center gap-3"
        >
          Accept Signal <ChevronRight size={24} />
        </button>
      </div>
    </motion.div>
  );
}

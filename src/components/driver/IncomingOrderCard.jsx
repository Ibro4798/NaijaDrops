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
      className={`${!isEmbedded ? 'fixed inset-x-6 bottom-[calc(8rem+var(--safe-bottom))] z-50' : 'relative w-full'} bg-charcoal-900 border border-white/5 rounded-[2.5rem] shadow-premium overflow-hidden transition-all`}
    >
      {/* Design Sync: Premium Shadow and Aura */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-[80px] -mr-16 -mt-16"></div>

      <div className="p-8">
        {/* Header: Type and Size */}
        <div className="flex justify-between items-start mb-6">
           <div>
              <p className="text-amber-400 font-black text-[10px] uppercase tracking-[0.3em] mb-1">Instant Delivery</p>
              <div className="text-4xl font-black text-white font-outfit tracking-tighter">₦{order.agreed_price}</div>
           </div>
           <div className="flex flex-col items-end gap-2">
              <div className="bg-charcoal-800/80 backdrop-blur-md px-4 py-2 rounded-xl flex items-center gap-2 border border-white/5 shadow-inner">
                 <Package size={14} className="text-emerald-500" />
                 <span className="text-[10px] font-black text-white uppercase tracking-widest leading-none">{order.item_size || 'SMALL BOX'}</span>
              </div>
           </div>
        </div>

        {/* Route: Vertical Dot Style per Stitch Reference */}
        <div className="space-y-6 mb-8 relative">
           <div className="flex items-start gap-4 h-full relative">
              <div className="flex flex-col items-center gap-1 group">
                 <div className="w-5 h-5 rounded-full border-2 border-emerald-500 flex items-center justify-center bg-charcoal-900 shadow-glow">
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>
                 </div>
                 <div className="w-px h-10 bg-white/10"></div>
                 <div className="w-5 h-5 rounded-full border-2 border-amber-500 flex items-center justify-center bg-charcoal-900">
                    <MapPin size={10} className="text-amber-500" />
                 </div>
              </div>
              
              <div className="flex flex-col gap-8 flex-1">
                 <div>
                    <p className="text-[9px] font-black text-charcoal-500 uppercase tracking-widest leading-none mb-1">Pickup</p>
                    <p className="text-sm font-black text-white font-outfit leading-tight">{order.pickup_name}</p>
                 </div>
                 <div>
                    <p className="text-[9px] font-black text-charcoal-500 uppercase tracking-widest leading-none mb-1">Drop-off</p>
                    <p className="text-sm font-black text-white font-outfit leading-tight opacity-90">{order.dropoff_name}</p>
                 </div>
              </div>
           </div>
        </div>

        {/* Action Bar */}
        <div className="flex items-center justify-between">
           <div className="flex items-center gap-2">
              <Navigation size={14} className="text-emerald-500" />
              <span className="text-xs font-black text-white/60 font-outfit">{order.distanceKm || '4.2'} km total</span>
           </div>
           
           <button 
             onClick={onAcceptBase}
             className="px-10 py-4 bg-emerald-500 hover:bg-emerald-400 text-charcoal-900 rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] shadow-glow transition-all active:scale-95"
           >
             Accept Job
           </button>
        </div>
      </div>
    </motion.div>
  );
}

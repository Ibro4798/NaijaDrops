import { useState } from 'react';
import { MapPin, Navigation, Clock, Check, Plus, Minus, Package, User, Volume2, ChevronDown, ChevronUp, ChevronRight, Zap, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function IncomingOrderCard({ order, onAcceptBase, onCounterOffer, onReject, isEmbedded = false }) {
  const [customOffer, setCustomOffer] = useState(order?.agreed_price ? parseInt(order.agreed_price) : 0);
  const [showDetails, setShowDetails] = useState(false);
  const [photoExpanded, setPhotoExpanded] = useState(false);
  const [confirmingAccept, setConfirmingAccept] = useState(false);

  if (!order) return null;

  return (
    <motion.div 
      initial={!isEmbedded ? { y: 100, opacity: 0 } : { opacity: 0, y: 30 }}
      animate={!isEmbedded ? { y: 0, opacity: 1 } : { opacity: 1, y: 0 }}
      exit={!isEmbedded ? { y: 100, opacity: 0 } : { opacity: 0, y: 30 }}
      className={`${!isEmbedded ? 'fixed inset-x-6 bottom-[calc(8rem+var(--safe-bottom))] z-50' : 'relative w-full'} bg-charcoal-900 border border-white/10 rounded-[2.8rem] shadow-premium overflow-hidden transition-all`}
    >
      <div className="p-6 sm:p-8">
        {/* Header: Type and Price */}
        {/* FIX: on narrow phones (360-390px wide) the huge text-5xl price
            next to the fixed 48px reject button had no min-w-0/shrink
            handling, so a long price (e.g. 6+ digits) could push under or
            crowd the button instead of just wrapping/shrinking. Padding
            also dropped from p-8 to p-6 on small screens to give a bit
            more breathing room. */}
        <div className="flex justify-between items-start mb-10 gap-3">
           <div className="flex flex-col gap-1 min-w-0">
              <div className="flex items-center gap-2">
                 <div className="w-2 h-2 bg-emerald-500 rounded-full shadow-glow shrink-0"></div>
                 <p className="text-white font-black text-[10px] uppercase tracking-[0.4em] font-outfit opacity-60 italic">Live Payload</p>
              </div>
              <div className="text-4xl sm:text-5xl font-black text-white font-outfit tracking-tighter italic truncate">₦{order.agreed_price?.toLocaleString()}</div>
           </div>
           
           <button 
             onClick={onReject}
             className="w-12 h-12 bg-white/5 hover:bg-white/10 rounded-2xl flex items-center justify-center text-charcoal-500 hover:text-white transition-all border border-white/5 active:scale-90 shrink-0"
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

        {/* Package Photo - shown uncropped so the rider can actually inspect
            the item (size, condition, packaging) before accepting, not just
            after. Tapping opens it full-screen. */}
        {order.package_photo_url && (
          <button
            type="button"
            onClick={() => setPhotoExpanded(true)}
            className="w-full mb-8 rounded-2xl overflow-hidden border border-white/10 bg-charcoal-950 block"
          >
            <img
              src={order.package_photo_url}
              alt="Package"
              className="w-full max-h-72 object-contain bg-charcoal-950"
            />
            <div className="flex items-center justify-center gap-1.5 py-2 bg-white/5 text-charcoal-400 text-[9px] font-black uppercase tracking-widest">
              <Package size={11} /> Tap to view full size
            </div>
          </button>
        )}

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

        {/* Tap-to-expand full details - the collapsed card above only ever
            showed price, size, distance and the two addresses. The rider
            had no way to see item description, delivery notes, or recipient
            info before committing. Tapping this bar reveals everything else
            on the order without cluttering the default view. */}
        <button
          type="button"
          onClick={() => setShowDetails(v => !v)}
          className="w-full flex items-center justify-center gap-2 py-3 mb-6 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 text-charcoal-400 text-[10px] font-black uppercase tracking-widest transition-all"
        >
          {showDetails ? <>Hide Full Details <ChevronUp size={14} /></> : <>View Full Details <ChevronDown size={14} /></>}
        </button>

        <AnimatePresence initial={false}>
          {showDetails && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mb-8 space-y-4 bg-charcoal-950/60 border border-white/10 rounded-2xl p-5">
                {order.item_description && (
                  <div>
                    <p className="text-[9px] font-black text-charcoal-500 uppercase tracking-widest mb-1">Item</p>
                    <p className="text-sm font-bold text-ink">{order.item_description}</p>
                  </div>
                )}
                {order.delivery_type && (
                  <div>
                    <p className="text-[9px] font-black text-charcoal-500 uppercase tracking-widest mb-1">Delivery Type</p>
                    <p className="text-sm font-bold text-ink capitalize">{order.delivery_type}</p>
                  </div>
                )}
                {order.recipient_name && (
                  <div>
                    <p className="text-[9px] font-black text-charcoal-500 uppercase tracking-widest mb-1">Recipient</p>
                    <p className="text-sm font-bold text-ink">{order.recipient_name}{order.recipient_phone ? ` • ${order.recipient_phone}` : ''}</p>
                  </div>
                )}
                {order.pickup_details && (
                  <div>
                    <p className="text-[9px] font-black text-charcoal-500 uppercase tracking-widest mb-1">Pickup Note</p>
                    <p className="text-sm text-ink/90">{order.pickup_details}</p>
                  </div>
                )}
                {order.dropoff_details && (
                  <div>
                    <p className="text-[9px] font-black text-charcoal-500 uppercase tracking-widest mb-1">Dropoff Note</p>
                    <p className="text-sm text-ink/90">{order.dropoff_details}</p>
                  </div>
                )}
                {!order.item_description && !order.delivery_type && !order.recipient_name && !order.pickup_details && !order.dropoff_details && (
                  <p className="text-sm text-charcoal-500 italic">No additional details provided for this job.</p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Primary Action - now a two-step confirm. Tapping "Accept Signal"
            no longer instantly commits the rider to the job; it opens a
            second, explicit confirmation so a mis-tap doesn't lock someone
            into a job they didn't mean to take. */}
        {!confirmingAccept ? (
          <button
            onClick={() => setConfirmingAccept(true)}
            className="w-full py-6 bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 rounded-[2rem] font-black text-lg uppercase tracking-[0.25em] shadow-glow transition-all active:scale-95 flex items-center justify-center gap-3"
          >
            Accept Signal <ChevronRight size={24} />
          </button>
        ) : (
          <div className="space-y-3">
            <div className="text-center text-[10px] font-black uppercase tracking-widest text-amber-500 mb-1">
              Confirm - this job is yours once accepted
            </div>
            <button
              onClick={onAcceptBase}
              className="w-full py-6 bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 rounded-[2rem] font-black text-lg uppercase tracking-[0.25em] shadow-glow transition-all active:scale-95 flex items-center justify-center gap-3"
            >
              <Check size={22} /> Yes, This Job Is Mine
            </button>
            <button
              onClick={() => setConfirmingAccept(false)}
              className="w-full py-4 bg-white/5 hover:bg-white/10 text-charcoal-400 rounded-2xl font-black text-xs uppercase tracking-widest transition-all"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Full-scale photo viewer - true full size, not object-cover cropped,
          so the rider can actually judge what they're picking up. */}
      <AnimatePresence>
        {photoExpanded && order.package_photo_url && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPhotoExpanded(false)}
            className="fixed inset-0 z-[200] bg-charcoal-950/95 backdrop-blur-md flex items-center justify-center p-6"
          >
            <button
              onClick={() => setPhotoExpanded(false)}
              className="absolute top-6 right-6 w-10 h-10 bg-white/10 rounded-2xl flex items-center justify-center text-ink"
            >
              <X size={20} />
            </button>
            <img
              src={order.package_photo_url}
              alt="Package full size"
              className="max-w-full max-h-full object-contain rounded-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

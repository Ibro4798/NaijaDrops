import { useState } from 'react';
import { MapPin, Navigation, Clock, Check, Plus, Minus, Package, User, Volume2, ChevronDown, ChevronUp, ChevronRight, Zap, X, HandCoins, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// FIX: this card accepted an `onCounterOffer` prop from day one, but never
// actually rendered anything that called it - there was no input field, no
// button, nothing. A rider had no way to propose a price at all; the only
// action available was accepting the base price outright. This adds the
// missing UI: a "Suggest a price" toggle with an amount field, and once a
// bid is pending, the card switches to a waiting state instead of showing
// stale accept/negotiate actions for an offer already in flight.
export default function IncomingOrderCard({ order, myBid, bidSubmitting, onAcceptBase, onCounterOffer, onReject, isEmbedded = false }) {
  const [showDetails, setShowDetails] = useState(false);
  const [photoExpanded, setPhotoExpanded] = useState(false);
  const [confirmingAccept, setConfirmingAccept] = useState(false);
  const [showBidInput, setShowBidInput] = useState(false);
  const [bidAmount, setBidAmount] = useState('');

  if (!order) return null;

  const basePrice = parseInt(order.agreed_price) || 0;
  const hasPendingBid = myBid && myBid.status === 'pending';

  const submitBid = () => {
    const amount = Number(bidAmount);
    if (!amount || amount < 100) return;
    onCounterOffer?.(amount);
    setShowBidInput(false);
  };

  return (
    <motion.div 
      initial={!isEmbedded ? { y: 100, opacity: 0 } : { opacity: 0, y: 30 }}
      animate={!isEmbedded ? { y: 0, opacity: 1 } : { opacity: 1, y: 0 }}
      exit={!isEmbedded ? { y: 100, opacity: 0 } : { opacity: 0, y: 30 }}
      className={`${!isEmbedded ? 'fixed inset-x-6 bottom-[calc(8rem+var(--safe-bottom))] z-50' : 'relative w-full'} bg-charcoal-900 border border-white/10 rounded-[2.8rem] shadow-premium overflow-hidden transition-all`}
    >
      <div className="p-6 sm:p-8">
        {/* Header: Type and Price */}
        <div className="flex justify-between items-start mb-10 gap-3">
           <div className="flex flex-col gap-1 min-w-0">
              <div className="flex items-center gap-2">
                 <div className="w-2 h-2 bg-emerald-500 rounded-full shadow-glow shrink-0"></div>
                 <p className="text-white font-black text-[10px] uppercase tracking-[0.4em] font-outfit opacity-60 italic">Live Payload</p>
              </div>
              <div className="text-4xl sm:text-5xl font-black text-white font-outfit tracking-tighter italic truncate">₦{basePrice.toLocaleString()}</div>
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

        {/* Package Photo */}
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

        {/* Tap-to-expand full details */}
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

        {/* Primary Action area */}
        {hasPendingBid ? (
          // A bid is already in flight for this job - accepting the base
          // price or sending another bid would both be confusing while the
          // vendor still has an outstanding offer to respond to.
          <div className="space-y-3">
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-[2rem] px-6 py-5 flex items-center gap-4">
              <div className="w-11 h-11 bg-amber-500/20 rounded-2xl flex items-center justify-center shrink-0">
                <HandCoins size={20} className="text-amber-400" />
              </div>
              <div className="min-w-0">
                <p className="text-amber-400 font-black text-lg font-outfit">₦{Number(myBid.amount).toLocaleString()}</p>
                <p className="text-[10px] font-black text-amber-400/70 uppercase tracking-widest">Your offer • Waiting for vendor</p>
              </div>
            </div>
            <button
              onClick={onAcceptBase}
              className="w-full py-4 bg-white/5 hover:bg-white/10 text-charcoal-300 rounded-2xl font-black text-xs uppercase tracking-widest transition-all border border-white/5"
            >
              Or just accept ₦{basePrice.toLocaleString()} now instead
            </button>
          </div>
        ) : !confirmingAccept ? (
          <div className="space-y-3">
            <button
              onClick={() => setConfirmingAccept(true)}
              className="w-full py-6 bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 rounded-[2rem] font-black text-lg uppercase tracking-[0.25em] shadow-glow transition-all active:scale-95 flex items-center justify-center gap-3"
            >
              Accept Signal <ChevronRight size={24} />
            </button>

            {!showBidInput ? (
              <button
                onClick={() => { setShowBidInput(true); setBidAmount(basePrice ? String(basePrice) : ''); }}
                className="w-full py-4 bg-white/5 hover:bg-white/10 text-emerald-400 rounded-2xl font-black text-xs uppercase tracking-widest transition-all border border-white/5 flex items-center justify-center gap-2"
              >
                <HandCoins size={14} /> Suggest a different price
              </button>
            ) : (
              <div className="bg-charcoal-950/60 border border-white/10 rounded-2xl p-4 space-y-3">
                <p className="text-[9px] font-black text-charcoal-500 uppercase tracking-widest">Your offer to the vendor</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-500 font-black">₦</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={bidAmount}
                      onChange={e => setBidAmount(e.target.value)}
                      className="w-full pl-9 pr-3 py-3 bg-charcoal-950 border border-white/10 rounded-xl text-white font-black text-sm focus:outline-none focus:border-emerald-500"
                      autoFocus
                    />
                  </div>
                  <button
                    onClick={submitBid}
                    disabled={bidSubmitting || !bidAmount || Number(bidAmount) < 100}
                    className="px-5 py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-charcoal-950 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center gap-2"
                  >
                    {bidSubmitting ? <Loader2 size={14} className="animate-spin" /> : 'Send'}
                  </button>
                  <button
                    onClick={() => setShowBidInput(false)}
                    className="w-11 h-11 bg-white/5 rounded-xl flex items-center justify-center text-charcoal-400 shrink-0"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
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

      {/* Full-scale photo viewer */}
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

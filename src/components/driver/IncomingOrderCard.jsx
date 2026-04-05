import { useState } from 'react';
import { MapPin, Navigation, Clock, Check, Plus, Minus, Package, User, Volume2, ChevronDown, ChevronUp } from 'lucide-react';

export default function IncomingOrderCard({ order, onAcceptBase, onCounterOffer, onReject }) {
  const [customOffer, setCustomOffer] = useState(order?.agreed_price ? parseInt(order.agreed_price) : 0);
  const [showDetails, setShowDetails] = useState(false);

  if (!order) return null;

  return (
    <div className="fixed inset-x-4 bottom-[calc(7rem+var(--safe-bottom))] z-50 bg-white rounded-[2rem] shadow-2xl overflow-hidden animate-slide-up ring-4 ring-emerald-500/10">
      {/* Header */}
      <div className="bg-charcoal-900 p-4 text-white flex justify-between items-center">
        <div>
          <h3 className="font-extrabold text-lg leading-tight">New Request</h3>
          <p className="text-emerald-400 font-bold text-[10px] uppercase tracking-widest">{order.item_category} • {order.item_size}</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-black text-emerald-500 leading-none">₦{order.agreed_price}</div>
          <div className="text-[10px] text-gray-400 font-bold tracking-widest">CUSTOMER OFFER</div>
        </div>
      </div>
      
      <div className="p-5 space-y-4">
        {/* Route */}
        <div className="relative pl-4 h-[72px]">
          <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-gray-200"></div>
          <div className="relative flex items-center gap-3 h-8">
            <div className="absolute -left-[14.5px] w-3 h-3 rounded-full border-[3px] border-charcoal-900 bg-white"></div>
            <p className="text-sm font-bold text-charcoal-900 truncate">{order.pickup_name}</p>
          </div>
          <div className="relative flex items-center gap-3 h-8 mt-2">
            <div className="absolute -left-[14.5px] w-3 h-3 bg-charcoal-900 shadow-[0_0_0_2px_#fff_inset]"></div>
            <p className="text-sm font-bold text-charcoal-900 truncate">{order.dropoff_name}</p>
          </div>
        </div>

        {/* Distance & Category Quick View */}
        <div className="flex gap-2">
          {order.distanceKm && (
            <span className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-xl text-xs font-bold border border-blue-100">
              <Navigation size={12} /> {order.distanceKm} km away
            </span>
          )}
          {order.item_size && (
            <span className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-charcoal-600 rounded-xl text-xs font-bold">
              <Package size={12} /> {order.item_size}
            </span>
          )}
          {order.scheduled_at && (
            <span className="flex items-center gap-1 px-3 py-1.5 bg-orange-50 text-orange-700 rounded-xl text-xs font-bold border border-orange-100">
              <Clock size={12} /> Scheduled
            </span>
          )}
        </div>

        {/* Show More Details Toggle */}
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="w-full flex items-center justify-between py-2 text-xs font-bold text-charcoal-500 uppercase tracking-widest border-t border-gray-100"
        >
          Order Details
          {showDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {showDetails && (
          <div className="space-y-3 bg-gray-50 rounded-2xl p-4 border border-gray-100">
            {/* Receiver */}
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-charcoal-900/10 flex items-center justify-center shrink-0">
                <User size={14} className="text-charcoal-700" />
              </div>
              <div>
                <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Receiver</div>
                <div className="text-sm font-bold text-charcoal-900">{order.receiver_name || 'Not specified'}</div>
                {order.receiver_phone && <div className="text-xs text-charcoal-500">{order.receiver_phone}</div>}
              </div>
            </div>

            {/* Package Details */}
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-charcoal-900/10 flex items-center justify-center shrink-0">
                <Package size={14} className="text-charcoal-700" />
              </div>
              <div>
                <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Package</div>
                <div className="text-sm font-bold text-charcoal-900">{order.item_category} — {order.parcel_size}</div>
                {order.pickup_details && <div className="text-xs text-charcoal-500 mt-0.5">Note: {order.pickup_details}</div>}
              </div>
            </div>

            {/* Voice Note */}
            {order.voice_note_url && (
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                  <Volume2 size={14} className="text-emerald-600" />
                </div>
                <div className="flex-1">
                  <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">Customer Voice Note</div>
                  <audio controls src={order.voice_note_url} className="w-full h-10 rounded-lg" style={{ accentColor: '#10b981' }} />
                </div>
              </div>
            )}

            {/* Scheduled time */}
            {order.scheduled_at && (
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-orange-500/10 flex items-center justify-center shrink-0">
                  <Clock size={14} className="text-orange-600" />
                </div>
                <div>
                  <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Scheduled For</div>
                  <div className="text-sm font-bold text-charcoal-900">
                    {new Date(order.scheduled_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Counter Offer Engine */}
        <div className="pt-3 border-t border-gray-100">
          <p className="text-[10px] font-bold text-center text-charcoal-500 mb-2 uppercase tracking-widest">Your Counter Offer</p>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setCustomOffer(prev => Math.max(0, prev - 50))} 
              className="w-10 h-12 rounded-xl bg-gray-50 hover:bg-red-50 text-charcoal-600 border border-gray-200 hover:border-red-200 hover:text-red-600 flex items-center justify-center transition-colors"
            >
              <Minus size={18} className="stroke-[3]" />
            </button>
            <div className="flex-1 relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-400 font-bold">₦</span>
              <input 
                type="number" 
                value={customOffer}
                onChange={(e) => setCustomOffer(parseInt(e.target.value) || 0)}
                className="w-full h-12 rounded-xl bg-gray-50 border border-gray-200 text-center font-black text-lg text-charcoal-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-shadow"
              />
            </div>
            <button 
              onClick={() => setCustomOffer(prev => prev + 50)} 
              className="w-10 h-12 rounded-xl bg-gray-50 hover:bg-emerald-50 text-charcoal-600 border border-gray-200 hover:border-emerald-300 hover:text-emerald-700 flex items-center justify-center transition-colors"
            >
              <Plus size={18} className="stroke-[3]" />
            </button>
          </div>
          <button 
             onClick={() => onCounterOffer(customOffer)}
             className="w-full mt-2 py-3 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold text-sm transition-colors border border-emerald-200"
          >
            Submit ₦{customOffer} Bid
          </button>
        </div>

        {/* Primary Actions */}
        <div className="flex gap-2 pt-2">
          <button onClick={onReject} className="w-[60px] rounded-2xl bg-gray-100 hover:bg-red-50 text-gray-400 hover:text-red-500 flex items-center justify-center transition-colors">
             <span className="font-extrabold text-xl flex items-center justify-center mb-0.5">✕</span>
          </button>
          <button onClick={onAcceptBase} className="flex-1 py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-600 shadow-xl shadow-emerald-500/30 text-white font-black text-lg flex items-center justify-center gap-2 transition-transform active:scale-[0.98]">
             <Check size={22} className="stroke-[3]" /> Accept ₦{order.agreed_price}
          </button>
        </div>
      </div>
    </div>
  );
}

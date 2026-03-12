import { useState } from 'react';
import { Navigation, Phone, MessageSquare, CheckCircle2, User, X } from 'lucide-react';
import OrderChat from '@/components/OrderChat';

export default function ActiveTripPanel({ order, onUpdateStatus }) {
  const [showPinModal, setShowPinModal] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [pinEntry, setPinEntry] = useState('');
  const [pinError, setPinError] = useState('');

  if (!order) return null;

  const getNavLinks = () => {
    let lat, lng;
    if (order.status === 'accepted' || order.status === 'arriving_pickup') {
      lat = order.pickup_lat;
      lng = order.pickup_lng;
    } else {
      lat = order.dropoff_lat;
      lng = order.dropoff_lng;
    }
    return {
      google: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
      waze: `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`
    };
  };

  const getNextAction = () => {
    switch (order.status) {
      case 'accepted': return { label: 'Mark Arrived at Pickup', next: 'arriving_pickup', color: 'bg-charcoal-900 border-charcoal-900 shadow-charcoal-900/30' };
      case 'arriving_pickup': return { label: 'Confirm Picked Up', next: 'picked_up', color: 'bg-amber-500 border-amber-500 shadow-amber-500/30' };
      case 'picked_up': return { label: 'Mark Arrived at Dropoff', next: 'arriving', color: 'bg-charcoal-900 border-charcoal-900 shadow-charcoal-900/30' };
      case 'arriving': return { label: 'Complete Delivery', next: 'delivered', color: 'bg-emerald-500 border-emerald-500 shadow-emerald-500/30 text-white' };
      default: return null;
    }
  };

  const action = getNextAction();

  const handleActionClick = () => {
    if (action.next === 'delivered') {
      setShowPinModal(true);
    } else {
      onUpdateStatus(action.next);
    }
  };

  const submitPin = () => {
    // Determine the correct PIN: either from DB, or fallback to '1234' for local testing
    const correctPin = order.delivery_pin || '1234'; 
    
    if (pinEntry === correctPin) {
      onUpdateStatus('delivered');
      setShowPinModal(false);
    } else {
      setPinError('Incorrect PIN. Please ask the customer.');
      setTimeout(() => setPinError(''), 3000);
    }
  };

  return (
    <div className="absolute inset-x-0 bottom-0 z-50 bg-white rounded-t-3xl shadow-[0_-20px_40px_rgba(0,0,0,0.15)] overflow-hidden">
      <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mt-4 mb-2"></div>
      
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
           <div className="flex items-center gap-3">
             <div className="w-12 h-12 rounded-full bg-gray-50 border-2 border-emerald-500 flex items-center justify-center text-emerald-600 shadow-sm">
               <User size={20} className="stroke-[2.5]" />
             </div>
             <div>
               <h3 className="font-extrabold text-charcoal-900 text-lg leading-tight">Live Delivery</h3>
               <div className="text-xs font-bold text-gray-400 mt-0.5">
                   {order.status === 'picked_up' || order.status === 'arriving' ? 'En route to Dropoff' : 'En route to Pickup'}
               </div>
             </div>
           </div>
           
           <div className="flex gap-2">
             <button onClick={() => setShowChat(true)} className="w-11 h-11 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 hover:bg-emerald-100 transition-colors relative">
               <MessageSquare size={18} />
             </button>
           </div>
        </div>

        <div className="bg-charcoal-50 rounded-2xl p-4 mb-6 border border-gray-100">
          <div className="text-[10px] font-bold text-charcoal-500 uppercase tracking-widest mb-1">Current Destination</div>
          <div className="text-sm font-bold text-charcoal-900 truncate mb-3">
            {order.status === 'accepted' || order.status === 'arriving_pickup' ? order.pickup_name : order.dropoff_name}
          </div>
          <div className="flex gap-2">
             <button onClick={() => window.open(getNavLinks().google, '_blank')} className="flex-1 py-2 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 font-bold text-xs flex items-center justify-center gap-2 transition-colors border border-blue-100">
               <Navigation size={14} /> Google Maps
             </button>
             <button onClick={() => window.open(getNavLinks().waze, '_blank')} className="flex-1 py-2 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 font-bold text-xs flex items-center justify-center gap-2 transition-colors border border-blue-100">
               <Navigation size={14} /> Waze
             </button>
          </div>
        </div>

        {action && !showPinModal && (
          <button 
            onClick={handleActionClick}
            className={`w-full py-4 rounded-2xl font-black text-white text-[17px] flex items-center justify-center gap-2 shadow-2xl border transition-all active:scale-[0.98] ${action.color}`}
          >
            {action.next === 'delivered' && <CheckCircle2 size={22} className="stroke-[3]" />}
            {action.label}
          </button>
        )}

        {showPinModal && (
          <div className="animate-slide-up border-t border-gray-100 pt-4 mt-2">
            <div className="flex justify-between items-center mb-4">
               <div>
                 <h4 className="font-extrabold text-charcoal-900 leading-none">Proof of Delivery</h4>
                 <p className="text-xs font-bold text-gray-400 mt-1">Ask customer for 4-digit PIN</p>
               </div>
               <button onClick={() => setShowPinModal(false)} className="bg-gray-100 p-1.5 rounded-full text-gray-500 hover:bg-gray-200">
                 <X size={16} />
               </button>
            </div>
            
            <input 
              type="text" 
              inputMode="numeric"
              maxLength={4}
              value={pinEntry}
              onChange={(e) => setPinEntry(e.target.value.replace(/\D/g, ''))}
              placeholder="0 0 0 0" 
              className="w-full text-center text-3xl tracking-[1em] font-black font-mono py-4 bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl focus:outline-none focus:border-emerald-500 focus:bg-white transition-colors"
            />
            {pinError && <p className="text-red-500 text-xs font-bold text-center mt-2">{pinError}</p>}
            
            <button 
              onClick={submitPin}
              disabled={pinEntry.length !== 4}
              className="w-full mt-4 py-4 rounded-xl font-black text-white text-[17px] bg-emerald-500 shadow-xl shadow-emerald-500/30 disabled:opacity-50 disabled:shadow-none transition-all"
            >
              Verify & Complete
            </button>
          </div>
        )}

        {showChat && (
          <OrderChat 
            orderId={order.id} 
            currentUserId={order.driver_id} 
            onClose={() => setShowChat(false)} 
          />
        )}
      </div>
    </div>
  );
}

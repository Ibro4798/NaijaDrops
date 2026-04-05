import { useState } from 'react';
import { Navigation, Phone, MessageSquare, CheckCircle2, User, X, Camera, MapPin, AlertTriangle } from 'lucide-react';
import OrderChat from '@/components/OrderChat';
import { createClient } from '@/utils/supabase/client';
import { calculateDistance } from '@/utils/distance';

export default function ActiveTripPanel({ order, onUpdateStatus, driverProfile, currentLocation }) {
  const supabase = createClient();
  const [showPinModal, setShowPinModal] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [pinEntry, setPinEntry] = useState('');
  const [pinError, setPinError] = useState('');
  const [photo, setPhoto] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [proximityError, setProximityError] = useState(false);

  if (!order) return null;

  const getDistanceToDropoff = () => {
    if (!currentLocation || !order.dropoff_lat || !order.dropoff_lng) return null;
    return calculateDistance(
      currentLocation.lat,
      currentLocation.lng,
      order.dropoff_lat,
      order.dropoff_lng
    ) * 1000; // Convert to meters
  };

  const getNextAction = () => {
    switch (order.status) {
      case 'accepted': 
        return { label: 'Arrive at Pickup', next: 'arriving_pickup', color: 'bg-emerald-500 hover:bg-emerald-600 border-emerald-600' };
      case 'arriving_pickup':
        return { label: 'Confirm Pickup', next: 'picked_up', color: 'bg-blue-500 hover:bg-blue-600 border-blue-600' };
      case 'picked_up':
        return { label: 'Arrive at Dropoff', next: 'arriving', color: 'bg-indigo-500 hover:bg-indigo-600 border-indigo-600' };
      case 'arriving':
        return { label: 'Complete Delivery', next: 'delivered', color: 'bg-green-600 hover:bg-green-700 border-green-700' };
      default: return null;
    }
  };

  const action = getNextAction();

  const getNavLinks = () => {
    const isPickup = order.status === 'accepted' || order.status === 'arriving_pickup';
    const lat = isPickup ? order.pickup_lat : order.dropoff_lat;
    const lng = isPickup ? order.pickup_lng : order.dropoff_lng;
    return {
      google: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
      waze: `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`
    };
  };

  const handleActionClick = () => {
    if (action.next === 'delivered') {
      setShowPinModal(true);
    } else {
      onUpdateStatus(action.next);
    }
  };

  const handlePhotoChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 2 * 1024 * 1024) {
        setPinError('Photo too large. Please use a smaller file (<2MB).');
        return;
      }
      setPhoto(file);
      setPinError('');
    }
  };

  const submitPin = async () => {
    if (!photo) {
      setPinError('Please capture a delivery photo first.');
      return;
    }

    setUploading(true);
    const correctPin = order.delivery_pin || '1234'; 
    
    if (pinEntry === correctPin) {
      try {
        const fileExt = photo.name.split('.').pop();
        const fileName = `${order.id}/delivery_${Date.now()}.${fileExt}`;
        const filePath = fileName;

        const { error: uploadErr } = await supabase.storage
          .from('delivery-photos')
          .upload(filePath, photo);
        
        if (uploadErr) throw uploadErr;

        const { data: { publicUrl } } = supabase.storage
          .from('delivery-photos')
          .getPublicUrl(filePath);

        onUpdateStatus('delivered', { delivery_photo_url: publicUrl });
        setShowPinModal(false);
      } catch (err) {
        setPinError('Failed to upload photo. Try again.');
      } finally {
        setUploading(false);
      }
    } else {
      setPinError('Incorrect PIN. Please ask the customer.');
      setUploading(false);
      setTimeout(() => setPinError(''), 3000);
    }
  };


  return (
    <div className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-[2rem] shadow-[0_-20px_40px_rgba(0,0,0,0.15)] overflow-hidden pb-[var(--safe-bottom)]">
      <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mt-4 mb-2"></div>
      

      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
           <div className="flex items-center gap-3">
             <div className="w-12 h-12 rounded-full bg-gray-50 border-2 border-emerald-500 flex items-center justify-center text-emerald-600 shadow-sm">
               <User size={20} className="stroke-[2.5]" />
             </div>
             <div>
               <h3 className="font-extrabold text-charcoal-900 text-lg leading-tight">Live Delivery</h3>
               <div className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full w-fit mt-1">
                 {driverProfile?.vehicle_type?.toUpperCase() || 'VEHICLE'} • {driverProfile?.plate_number || '---'}
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
          <div className="text-sm font-bold text-charcoal-900 mb-0.5">
            {order.status === 'accepted' || order.status === 'arriving_pickup' ? order.pickup_name : order.dropoff_name}
          </div>
          {(order.status === 'accepted' || order.status === 'arriving_pickup') && order.pickup_details && (
            <div className="text-[11px] font-bold text-emerald-600 mb-3 bg-emerald-50 px-2 py-1 rounded-lg w-fit">
              STALL/GATE: {order.pickup_details}
            </div>
          )}
          {(order.status === 'picked_up' || order.status === 'arriving') && order.dropoff_details && (
            <div className="text-[11px] font-bold text-emerald-600 mb-3 bg-emerald-50 px-2 py-1 rounded-lg w-fit">
              STALL/GATE: {order.dropoff_details}
            </div>
          )}
          <div className="flex gap-2">
             <button onClick={() => {
                const mapElement = document.querySelector('.absolute.inset-0.transition-opacity');
                if (mapElement) mapElement.scrollIntoView({ behavior: 'smooth' });
             }} className="flex-1 py-3 rounded-xl bg-emerald-500 text-charcoal-900 hover:bg-emerald-400 font-black text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20 active:scale-95">
               <Navigation size={14} className="stroke-[3]" /> Mapbox Radar
             </button>
             <button onClick={() => window.open(getNavLinks().google, '_blank')} className="w-12 h-12 rounded-xl bg-gray-100 text-charcoal-400 hover:text-charcoal-600 flex items-center justify-center border border-gray-200 transition-colors">
               <MapPin size={18} />
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
                 <p className="text-xs font-bold text-gray-400 mt-1">Capture photo & enter 4-digit PIN</p>
               </div>
               <button onClick={() => setShowPinModal(false)} className="bg-gray-100 p-1.5 rounded-full text-gray-500 hover:bg-gray-200">
                 <X size={16} />
               </button>
            </div>

            <div className="mb-4">
              <label className={`w-full h-32 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors ${photo ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-gray-50 text-gray-400 hover:border-emerald-500 hover:text-emerald-500'}`}>
                <input type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} className="hidden" />
                {photo ? (
                  <>
                    <CheckCircle2 size={32} />
                    <span className="font-bold text-sm">Photo Captured</span>
                  </>
                ) : (
                  <>
                    <Camera size={32} />
                    <span className="font-bold text-sm text-center px-4">Take Dropoff Photo</span>
                  </>
                )}
              </label>
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
              disabled={pinEntry.length !== 4 || !photo || uploading}
              className="w-full mt-4 py-4 rounded-xl font-black text-white text-[17px] bg-emerald-500 shadow-xl shadow-emerald-500/30 disabled:opacity-50 disabled:shadow-none transition-all flex items-center justify-center gap-2"
            >
              {uploading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : 'Verify & Complete'}
            </button>
          </div>
        )}

        {showChat && (
          <OrderChat 
            orderId={order.id} 
            currentUserId={order.driver_id} 
            onClose={() => setShowChat(false)} 
            isReadOnly={order.status === 'delivered'}
          />
        )}
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Navigation, Phone, MessageSquare, CheckCircle2, User, X, Camera, MapPin, AlertTriangle, ChevronRight, Zap } from 'lucide-react';
import OrderChat from '@/components/OrderChat';
import { createClient } from '@/utils/supabase/client';
import { calculateDistance } from '@/utils/distance';
import { motion, AnimatePresence } from 'framer-motion';

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
        return { label: 'Dock at Pickup', next: 'arriving_pickup', color: 'bg-emerald-500 text-charcoal-950 shadow-glow border-emerald-400' };
      case 'arriving_pickup':
        return { label: 'Confirm Payload', next: 'picked_up', color: 'bg-white text-charcoal-950 shadow-premium border-white/20' };
      case 'picked_up':
        return { label: 'Navigate to Dropoff', next: 'arriving', color: 'bg-emerald-500 text-charcoal-950 shadow-glow border-emerald-400' };
      case 'arriving':
        return { label: 'Finalize Delivery', next: 'delivered', color: 'bg-emerald-400 text-charcoal-950 shadow-glow border-emerald-300' };
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
        setPinError('Image too heavy. Max 2MB.');
        return;
      }
      setPhoto(file);
      setPinError('');
    }
  };

  const submitPin = async () => {
    if (!photo) {
      setPinError('Visual confirmation required.');
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
        setPinError('Cloud sync failed. Retry.');
      } finally {
        setUploading(false);
      }
    } else {
      setPinError('PIN mismatch.');
      setUploading(false);
      setTimeout(() => setPinError(''), 3000);
    }
  };


  return (
    <div className="fixed inset-x-0 bottom-0 z-50 glass-dark rounded-t-[3rem] shadow-premium overflow-hidden backdrop-blur-3xl border-t border-white/10 pb-[var(--safe-bottom)]">
      <div className="w-16 h-1 bg-white/10 rounded-full mx-auto mt-4 mb-2"></div>
      
      <div className="p-8">
        <div className="flex justify-between items-center mb-8">
           <div className="flex items-center gap-4">
             <div className="relative">
                <div className="absolute inset-0 bg-emerald-500/20 rounded-2xl animate-pulse"></div>
                <div className="w-14 h-14 rounded-2xl glass flex items-center justify-center text-emerald-500 border-white/20 shadow-premium relative z-10">
                   <User size={24} />
                </div>
             </div>
             <div>
               <h3 className="font-black text-white text-xl leading-none font-outfit uppercase tracking-tighter italic">Live Payload</h3>
               <div className="flex items-center gap-2 mt-2">
                 <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                   {driverProfile?.plate_number || 'ACTIVE'}
                 </span>
               </div>
             </div>
           </div>
           
           <div className="flex gap-3">
             <button onClick={() => setShowChat(true)} className="w-12 h-12 rounded-2xl glass-dark text-white flex items-center justify-center border border-white/5 hover:bg-emerald-500 transition-all group scale-100 hover:scale-105 active:scale-95 shadow-premium">
               <MessageSquare size={20} className="group-hover:fill-current transition-all" />
             </button>
           </div>
        </div>

        <div className="glass-dark rounded-[2rem] p-6 mb-8 border border-white/5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl -mr-16 -mt-16 group-hover:bg-emerald-500/10 transition-all duration-700"></div>
          
          <div className="text-[9px] font-black text-white/40 uppercase tracking-[0.3em] mb-2 flex items-center gap-2">
             <MapPin size={10} className="text-emerald-500" /> Target Proximity
          </div>
          
          <div className="text-lg font-black text-white mb-2 font-outfit uppercase tracking-tight leading-tight">
            {order.status === 'accepted' || order.status === 'arriving_pickup' ? order.pickup_name : order.dropoff_name}
          </div>

          <div className="flex items-center gap-2 mb-6">
            <div className="h-1.5 w-1.5 bg-emerald-500 rounded-full shadow-glow"></div>
            <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-widest">
              STALL/GATE: { (order.status === 'accepted' || order.status === 'arriving_pickup') ? (order.pickup_details || 'N/A') : (order.dropoff_details || 'N/A') }
            </span>
          </div>

          <div className="flex gap-3">
             <button onClick={() => {
                const mapElement = document.querySelector('.absolute.inset-0.transition-opacity');
                if (mapElement) mapElement.scrollIntoView({ behavior: 'smooth' });
             }} className="flex-1 py-4 rounded-2xl bg-charcoal-950 text-white hover:bg-black font-black text-[11px] uppercase tracking-[0.2em] flex items-center justify-center gap-3 transition-all border border-white/5 shadow-premium active:scale-95">
               <Navigation size={16} /> Radar View
             </button>
             <button onClick={() => window.open(getNavLinks().google, '_blank')} className="w-14 h-14 rounded-2xl glass text-emerald-500 hover:bg-emerald-500 hover:text-white flex items-center justify-center border border-white/20 transition-all shadow-premium active:scale-95 group">
                <ChevronRight size={24} className="group-hover:translate-x-0.5 transition-transform" />
             </button>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {action && !showPinModal && (
            <motion.button 
              key="action-btn"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              onClick={handleActionClick}
              className={`w-full py-5 rounded-[2.5rem] font-black text-[15px] uppercase tracking-[0.25em] flex items-center justify-center gap-3 shadow-premium transition-all active:scale-[0.97] border italic ${action.color}`}
            >
              {action.next === 'delivered' && <Zap size={20} fill="currentColor" />}
              {action.label}
            </motion.button>
          )}

          {showPinModal && (
            <motion.div 
              key="pin-modal"
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="border-t border-white/5 pt-6 mt-2"
            >
              <div className="flex justify-between items-center mb-6">
                 <div>
                   <h4 className="font-black text-white text-lg font-outfit uppercase tracking-tighter italic">Proof of Service</h4>
                   <p className="text-[10px] font-bold text-charcoal-500 uppercase tracking-widest mt-1">Acquire biometric & input key</p>
                 </div>
                 <button onClick={() => setShowPinModal(false)} className="glass-dark p-2 rounded-xl text-charcoal-400 hover:text-white border border-white/5">
                   <X size={18} />
                 </button>
              </div>

              <div className="mb-6 grid grid-cols-2 gap-4">
                <label className={`h-40 border-2 border-dashed rounded-[2rem] flex flex-col items-center justify-center gap-3 cursor-pointer transition-all duration-500 relative overflow-hidden ${photo ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400 shadow-glow' : 'border-white/10 bg-charcoal-900/40 text-charcoal-600 hover:border-emerald-500 hover:text-emerald-500'}`}>
                  <input type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} className="hidden" />
                  {photo ? (
                    <>
                       <div className="absolute inset-0 bg-emerald-500/10 animate-pulse"></div>
                       <CheckCircle2 size={32} className="relative z-10" />
                       <span className="font-black text-[10px] uppercase tracking-widest relative z-10">Capture Synced</span>
                    </>
                  ) : (
                    <>
                      <Camera size={32} />
                      <span className="font-black text-[10px] uppercase tracking-widest">Open Sensor</span>
                    </>
                  )}
                </label>

                <div className="flex flex-col gap-3">
                   <div className="relative flex-1">
                      <input 
                        type="text" 
                        inputMode="numeric"
                        maxLength={4}
                        value={pinEntry}
                        onChange={(e) => setPinEntry(e.target.value.replace(/\D/g, ''))}
                        placeholder="----" 
                        className="w-full h-full text-center text-4xl font-black font-outfit uppercase bg-charcoal-950/60 border border-white/5 rounded-[2rem] focus:outline-none focus:border-emerald-500 focus:bg-black transition-all text-emerald-500 placeholder:text-charcoal-800"
                      />
                      <div className="absolute top-2 left-1/2 -translate-x-1/2 text-[8px] font-black text-white/20 uppercase tracking-[0.3em]">Code Entry</div>
                   </div>
                </div>
              </div>
              
              {pinError && <p className="text-red-500 text-[10px] font-black uppercase tracking-widest text-center mb-4">{pinError}</p>}
              
              <button 
                onClick={submitPin}
                disabled={pinEntry.length !== 4 || !photo || uploading}
                className="w-full py-5 rounded-[2.5rem] font-black text-charcoal-950 text-sm uppercase tracking-[0.3em] bg-emerald-500 hover:bg-emerald-400 shadow-glow disabled:opacity-30 disabled:shadow-none transition-all flex items-center justify-center gap-3 active:scale-95 shadow-premium"
              >
                {uploading ? (
                  <div className="w-6 h-6 border-2 border-charcoal-900 border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <>Dock Payload & Finish <ChevronRight size={18} /></>
                )}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

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

import { useState } from 'react';
import { Navigation, Phone, MessageSquare, CheckCircle2, User, X, Camera, MapPin, AlertTriangle, ChevronRight, Zap, Check } from 'lucide-react';
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
    <div className="fixed inset-x-0 bottom-0 z-50 bg-charcoal-900 rounded-t-[3.5rem] shadow-premium overflow-hidden border-t border-white/5 pb-[var(--safe-bottom)]">
      {/* Visual Indicator Grabber */}
      <div className="w-16 h-1.5 bg-white/10 rounded-full mx-auto mt-6 mb-2"></div>
      
      <div className="p-8">
        {/* Step Progress Indicator per Stitch Reference */}
        <div className="flex items-center justify-between mb-10 px-2 relative">
           {/* Connecting Line */}
           <div className="absolute top-4 left-4 right-4 h-0.5 bg-white/5 z-0"></div>
           <div className="absolute top-4 left-4 h-0.5 bg-emerald-500 z-10 transition-all duration-1000" style={{ width: order.status === 'delivered' ? '100%' : order.status === 'picked_up' || order.status === 'arriving' ? '66%' : '33%' }}></div>

           {[
             { id: 'requested', label: 'Requested' },
             { id: 'picked_up', label: 'Picked Up' },
             { id: 'arriving', label: 'In Transit' },
             { id: 'delivered', label: 'Delivered' }
           ].map((s, i) => {
             const isActive = order.status === s.id || (i === 0 && order.status === 'accepted') || (i === 1 && order.status === 'arriving_pickup');
             const isComplete = i < (order.status === 'delivered' ? 4 : order.status === 'picked_up' || order.status === 'arriving' ? 2 : 1);
             
             return (
               <div key={s.id} className="flex flex-col items-center gap-3 relative z-20">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-500 ${isComplete ? 'bg-emerald-500 text-charcoal-900 shadow-glow' : isActive ? 'bg-charcoal-900 border-2 border-emerald-500 text-emerald-500' : 'bg-charcoal-900 border-2 border-white/10 text-white/20'}`}>
                     {isComplete ? <Check size={14} className="stroke-[4]" /> : <div className="w-1.5 h-1.5 rounded-full bg-current"></div>}
                  </div>
                  <span className={`text-[8px] font-black uppercase tracking-widest ${isActive ? 'text-emerald-500' : 'text-charcoal-500'}`}>{s.label}</span>
               </div>
             )
           })}
        </div>

        {/* Profile Stats Area */}
        <div className="flex items-center justify-between mb-10">
           <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-3xl border-2 border-emerald-500/20 overflow-hidden shadow-premium p-1 bg-charcoal-950">
                 <img src={driverProfile?.avatar_url || "https://ui-avatars.com/api/?name=Driver&background=10b981&color=fff"} className="w-full h-full object-cover rounded-2xl" alt="Driver" />
              </div>
              <div>
                 <h3 className="text-white font-black text-xl font-outfit tracking-tighter leading-none mb-1">{driverProfile?.full_name || 'Musa Danjuma'}</h3>
                 <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 bg-amber-500/10 text-amber-500 px-2 py-0.5 rounded-lg border border-amber-500/20">
                       <Zap size={10} fill="currentColor" />
                       <span className="text-[10px] font-black uppercase tracking-widest">4.9 Rare</span>
                    </div>
                 </div>
              </div>
           </div>
           
           <div className="flex gap-2">
              <button 
                onClick={() => window.open(`tel:${order.customer_phone}`, '_self')}
                className="w-14 h-14 glass flex items-center justify-center text-white rounded-2xl border border-white/5 shadow-premium hover:bg-white/10 transition-all active:scale-90"
              >
                 <Phone size={20} />
              </button>
              <button 
                onClick={() => setShowChat(true)}
                className="w-14 h-14 glass flex items-center justify-center text-emerald-500 rounded-2xl border border-white/5 shadow-premium hover:bg-emerald-500 hover:text-white transition-all active:scale-90"
              >
                 <MessageSquare size={20} />
              </button>
           </div>
        </div>

        {/* Action Button Section per Stitch Tall Button Style */}
        <div className="space-y-4">
           {action && !showPinModal && (
             <motion.button 
               whileTap={{ scale: 0.98 }}
               onClick={handleActionClick}
               className={`w-full py-6 rounded-[2.5rem] font-black text-sm uppercase tracking-[0.3em] flex items-center justify-center gap-3 shadow-xl transition-all ${action.color}`}
             >
               {action.label}
               <ChevronRight size={18} />
             </motion.button>
           )}

           {showPinModal && (
              <div className="bg-charcoal-950/50 p-6 rounded-[3rem] border border-white/5 mb-4">
                  <div className="flex justify-between items-center mb-6">
                    <h4 className="text-white font-black text-md font-outfit uppercase tracking-widest italic">Verify Handover</h4>
                    <button onClick={() => setShowPinModal(false)} className="text-charcoal-500 hover:text-white">
                       <X size={20} />
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <label className={`h-32 border-2 border-dashed rounded-[2rem] flex flex-col items-center justify-center gap-2 cursor-pointer transition-all ${photo ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400' : 'border-white/10 text-charcoal-600'}`}>
                      <input type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} className="hidden" />
                      {photo ? <CheckCircle2 size={24} /> : <Camera size={24} />}
                      <span className="text-[8px] font-black uppercase tracking-widest">{photo ? 'Photo Clear' : 'Take Photo'}</span>
                    </label>
                    <input 
                       type="text" 
                       inputMode="numeric"
                       maxLength={4}
                       value={pinEntry}
                       onChange={(e) => setPinEntry(e.target.value.replace(/\D/g, ''))}
                       placeholder="XXXX"
                       className="w-full bg-charcoal-900 border border-white/5 rounded-[2rem] text-center text-3xl font-black text-emerald-500 font-outfit focus:outline-none focus:border-emerald-500 placeholder:text-charcoal-800"
                    />
                  </div>

                  <button 
                    onClick={submitPin}
                    disabled={pinEntry.length !== 4 || !photo || uploading}
                    className="w-full py-5 rounded-[2rem] bg-emerald-500 text-charcoal-900 font-black text-[11px] uppercase tracking-[0.2em] shadow-glow"
                  >
                    Complete Delivery Mission
                  </button>
              </div>
           )}

           <button 
             onClick={() => {
                const lat = order.status === 'accepted' || order.status === 'arriving_pickup' ? order.pickup_lat : order.dropoff_lat;
                const lng = order.status === 'accepted' || order.status === 'arriving_pickup' ? order.pickup_lng : order.dropoff_lng;
                window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');
             }}
             className="w-full py-5 rounded-[2.5rem] bg-charcoal-950 text-white border border-white/5 font-black text-[10px] uppercase tracking-[0.25em] flex items-center justify-center gap-3 transition-all active:scale-[0.98]"
           >
              <Navigation size={16} /> Radar Assist
           </button>
        </div>

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

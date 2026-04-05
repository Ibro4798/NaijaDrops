"use client";

import { useState } from 'react';
import { Star, X } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';

export default function ReviewModal({ order, driverProfile, isOpen, onClose }) {
  const supabase = createClient();
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  if (!isOpen || !order || !driverProfile) return null;

  const handleSubmit = async () => {
    if (rating === 0) {
      alert("Please select a rating.");
      return;
    }

    setIsSubmitting(true);
    try {
       const { error } = await supabase.from('reviews').insert({
          order_id: order.id,
          driver_id: order.driver_id,
          user_id: order.user_id,
          rating,
          feedback
       });

       if (error && error.code === '23505') {
           // Unique constraint violation - already reviewed
           setSuccess(true);
       } else if (error) {
           throw error;
       } else {
           setSuccess(true);
           setTimeout(() => {
               onClose();
           }, 2000);
       }
    } catch (err) {
       console.error("Review submission failed", err);
       alert("Failed to submit review. Please try again later.");
    } finally {
       setIsSubmitting(false);
    }
  };

  if (success) {
      return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-charcoal-900/60 backdrop-blur-sm animate-in fade-in">
             <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl animate-in zoom-in-95">
                <div className="w-16 h-16 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4">
                   <Star size={32} className="fill-emerald-500" />
                </div>
                <h3 className="text-xl font-black text-charcoal-900 mb-2">Review Submitted!</h3>
                <p className="text-charcoal-500 font-medium mb-6">Thank you for your feedback.</p>
                <button onClick={onClose} className="w-full py-3 bg-gray-100 font-bold rounded-xl hover:bg-gray-200 transition-colors">Close</button>
             </div>
          </div>
      );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-charcoal-900/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden animate-slide-up sm:animate-in sm:zoom-in-95">
        
        <div className="p-4 flex justify-end">
            <button onClick={onClose} className="p-2 bg-gray-50 rounded-full text-gray-500 hover:bg-gray-100">
                <X size={20} />
            </button>
        </div>

        <div className="px-6 pb-6 text-center">
             <img src={`https://api.dicebear.com/7.x/initials/svg?seed=${driverProfile.full_name}&backgroundColor=10b981`} alt="Driver" className="w-20 h-20 rounded-full border-4 border-emerald-50 mx-auto object-cover mb-4" />
             <h3 className="text-2xl font-black text-charcoal-900 mb-1">Rate your driver</h3>
             <p className="text-charcoal-500 font-medium mb-8">How was your delivery with {driverProfile.full_name}?</p>

             {/* Star Rating */}
             <div className="flex justify-center gap-2 mb-8">
                 {[1, 2, 3, 4, 5].map((star) => (
                     <button
                        key={star}
                        onMouseEnter={() => setHoveredRating(star)}
                        onMouseLeave={() => setHoveredRating(0)}
                        onClick={() => setRating(star)}
                        className="transition-transform hover:scale-110 focus:outline-none"
                     >
                         <Star 
                            size={40} 
                            className={`transition-colors ${
                                star <= (hoveredRating || rating) 
                                ? 'text-yellow-400 fill-yellow-400' 
                                : 'text-gray-200'
                            }`} 
                         />
                     </button>
                 ))}
             </div>

             <textarea 
                placeholder="Leave an optional tip or feedback..."
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-2xl p-4 min-h-[100px] mb-6 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-medium text-charcoal-900 resize-none"
             />

             <button 
                 onClick={handleSubmit}
                 disabled={isSubmitting || rating === 0}
                 className={`w-full py-4 rounded-xl font-black text-lg flex items-center justify-center transition-all ${
                     isSubmitting || rating === 0 
                     ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                     : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-xl shadow-emerald-500/20 active:scale-[0.98]'
                 }`}
             >
                 {isSubmitting ? 'Submitting...' : 'Submit Rating'}
             </button>
        </div>
      </div>
    </div>
  );
}

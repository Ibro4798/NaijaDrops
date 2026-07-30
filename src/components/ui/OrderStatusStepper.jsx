"use client";

import { CheckCircle2, UserCheck, Package, Truck, PartyPopper, Search } from 'lucide-react';

const STEP_META = {
  pending: { label: 'Finding a rider', icon: Search },
  looking_for_driver: { label: 'Finding a rider', icon: Search },
  matched: { label: 'Rider assigned', icon: UserCheck },
  picked_up: { label: 'Package picked up', icon: Package },
  in_transit: { label: 'On the way', icon: Truck },
  delivered: { label: 'Delivered', icon: PartyPopper },
};

/**
 * A connected, visual step tracker for order status - replaces the old
 * flat checkmark + label list. Each step is a filled circle (done),
 * pulsing ring (current), or outline (upcoming), joined by a progress
 * line that fills as the order advances.
 */
export default function OrderStatusStepper({ steps, currentStatus }) {
  const currentIndex = steps.indexOf(currentStatus);

  return (
    <div className="space-y-0">
      {steps.map((step, i) => {
        const meta = STEP_META[step] || { label: step, icon: CheckCircle2 };
        const Icon = meta.icon;
        const isDone = i < currentIndex;
        const isCurrent = i === currentIndex;
        const isLast = i === steps.length - 1;

        return (
          <div key={step} className="flex gap-4">
            <div className="flex flex-col items-center">
              <div
                className={`relative w-9 h-9 rounded-full flex items-center justify-center shrink-0 border-2 transition-all ${
                  isDone
                    ? 'bg-emerald-500 border-emerald-500 text-charcoal-950'
                    : isCurrent
                    ? 'bg-emerald-500/10 border-emerald-500 text-emerald-500'
                    : 'bg-white/5 border-white/10 text-charcoal-600'
                }`}
              >
                {isCurrent && (
                  <span className="absolute w-9 h-9 rounded-full bg-emerald-500/30 animate-ping" />
                )}
                <Icon size={16} className="relative" />
              </div>
              {!isLast && (
                <div className={`w-0.5 flex-1 min-h-[28px] transition-all ${isDone ? 'bg-emerald-500' : 'bg-white/10'}`} />
              )}
            </div>
            <div className={`pb-7 pt-1.5 ${isLast ? 'pb-0' : ''}`}>
              <p className={`text-sm font-black ${isDone || isCurrent ? 'text-ink' : 'text-charcoal-600'}`}>
                {meta.label}
              </p>
              {isCurrent && (
                <p className="text-emerald-500 text-[10px] font-bold uppercase tracking-widest mt-0.5">In progress</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
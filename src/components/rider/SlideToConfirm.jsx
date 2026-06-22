"use client";

import { useState, useRef } from "react";
import { motion, useMotionValue, useTransform } from "framer-motion";
import { ChevronRight, Check } from "lucide-react";

export default function SlideToConfirm({ onConfirm, text = "Slide to Confirm", color = "bg-emerald-500" }) {
  const [isConfirmed, setIsConfirmed] = useState(false);
  const x = useMotionValue(0);
  const background = useTransform(
    x,
    [0, 200],
    ["rgba(255,255,255,0.05)", "rgba(16,185,129,0.5)"]
  );
  
  const handleDragEnd = () => {
    if (x.get() > 180) {
      setIsConfirmed(true);
      x.set(240);
      onConfirm();
    } else {
      x.set(0);
    }
  };

  return (
    <div className="relative w-full h-20 bg-white/[0.03] border border-white/10 rounded-3xl overflow-hidden p-2 flex items-center">
      {/* Background Track Fill */}
      <motion.div 
        style={{ background, width: x }} 
        className="absolute left-0 top-0 bottom-0 z-0 rounded-l-2xl"
      />
      
      {/* Label */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
        <span className={`text-xs font-black uppercase tracking-[0.3em] transition-opacity ${isConfirmed ? 'opacity-0' : 'opacity-40 text-white'}`}>
          {text}
        </span>
      </div>

      {/* Slider Knob */}
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 240 }}
        dragElastic={0.1}
        onDragEnd={handleDragEnd}
        style={{ x }}
        className={`relative z-20 w-16 h-16 ${isConfirmed ? 'bg-emerald-500' : color} rounded-2xl flex items-center justify-center text-charcoal-950 shadow-2xl cursor-grab active:cursor-grabbing transition-colors`}
      >
        {isConfirmed ? <Check size={24} strokeWidth={4} /> : <ChevronRight size={24} strokeWidth={4} />}
      </motion.div>
    </div>
  );
}

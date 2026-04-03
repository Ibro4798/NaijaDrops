"use client";

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronLeft, Package, MapPin, Mic, ShieldPulse, ArrowRight, Truck } from 'lucide-react';

const slides = [
  {
    title: "Logistics Simplified. Delivered in Kano.",
    subtitle: "Peer-to-peer delivery network built for the streets of Kano.",
    image: "/marketing/slide1.png", // Hero slide
    color: "bg-emerald-800",
    icon: <Package className="w-8 h-8 text-emerald-400" />
  },
  {
    title: "Real-time Tracking",
    subtitle: "Track your value in real-time. No more guessing. Our MiniRouteMap gives you instant visibility.",
    image: "/marketing/slide2.png", // Tracking slide
    color: "bg-charcoal-900",
    icon: <MapPin className="w-8 h-8 text-emerald-500" />
  },
  {
    title: "Engineered for Kano",
    subtitle: "Smart Link Resolution. Voice Instructions. Price Negotiation. Everything you need, exactly as you expect it.",
    image: "/marketing/slide3.png", // App mockup
    color: "bg-emerald-950",
    icon: <Mic className="w-8 h-8 text-emerald-400" />
  },
  {
    title: "JOIN THE FLEET. SCALE YOUR BUSINESS.",
    subtitle: "Visit NaijaDrops.tech. We're on a mission to simplify logistics for everyone.",
    image: "/marketing/slide4.png", // CTA slide
    color: "bg-emerald-900",
    icon: <Truck className="w-8 h-8 text-white" />
  }
];

export default function PitchDeck() {
  const [current, setCurrent] = useState(0);

  const nextSlide = () => setCurrent((prev) => (prev + 1) % slides.length);
  const prevSlide = () => setCurrent((prev) => (prev - 1 + slides.length) % slides.length);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "ArrowRight") nextSlide();
      if (e.key === "ArrowLeft") prevSlide();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <main className="fixed inset-0 bg-black text-white overflow-hidden font-sans">
      <AnimatePresence mode="wait">
        <motion.div
          key={current}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center"
        >
          {/* Background Gradient */}
          <div className={`absolute inset-0 ${slides[current].color} opacity-20 blur-3xl`} />
          
          <div className="relative z-10 max-w-4xl w-full">
            <motion.div 
               initial={{ scale: 0.8 }}
               animate={{ scale: 1 }}
               className="mb-8 flex justify-center"
            >
               <div className="p-6 bg-white/5 backdrop-blur-xl border border-white/10 rounded-full shadow-2xl">
                    {slides[current].icon}
               </div>
            </motion.div>

            <motion.h1 
                className="text-6xl md:text-8xl font-black mb-8 tracking-tighter leading-tight"
                initial={{ y: 20 }}
                animate={{ y: 0 }}
            >
              {slides[current].title}
            </motion.h1>

            <motion.p 
                className="text-xl md:text-2xl text-gray-400 font-bold max-w-2xl mx-auto mb-12"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
            >
              {slides[current].subtitle}
            </motion.p>

            <motion.div 
                className="flex gap-4 justify-center"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
            >
                {current === slides.length - 1 ? (
                    <a href="/" className="px-12 py-6 bg-emerald-500 hover:bg-emerald-600 rounded-full font-black text-2xl flex items-center gap-3 transition-transform hover:scale-105 active:scale-95 shadow-2xl shadow-emerald-500/20">
                        Launch Live App <ArrowRight />
                    </a>
                ) : (
                    <button onClick={nextSlide} className="px-12 py-6 bg-white text-black hover:bg-emerald-500 hover:text-white rounded-full font-black text-2xl flex items-center gap-2 transition-transform hover:scale-105 active:scale-95 shadow-2xl">
                        Next Slide <ChevronRight />
                    </button>
                )}
            </motion.div>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Progress Dots */}
      <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex gap-3 z-50">
        {slides.map((_, i) => (
          <div 
            key={i} 
            className={`h-2 rounded-full transition-all duration-500 ${current === i ? 'w-12 bg-emerald-500' : 'w-2 bg-white/20'}`}
          />
        ))}
      </div>

      {/* Manual Controls */}
      <div className="absolute inset-y-0 left-0 flex items-center p-4">
        <button onClick={prevSlide} className="p-4 rounded-full bg-white/5 backdrop-blur-md hover:bg-white/10 transition-colors text-white/40 hover:text-white">
            <ChevronLeft size={32} />
        </button>
      </div>
      <div className="absolute inset-y-0 right-0 flex items-center p-4">
        <button onClick={nextSlide} className="p-4 rounded-full bg-white/5 backdrop-blur-md hover:bg-white/10 transition-colors text-white/40 hover:text-white">
            <ChevronRight size={32} />
        </button>
      </div>

      {/* Branding Overlay */}
      <div className="absolute top-12 left-12 flex items-center gap-3">
        <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center font-black text-xs shadow-lg">ND</div>
        <div className="text-xl font-black tracking-widest uppercase">NaijaDrops.tech</div>
      </div>
    </main>
  );
}

"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, MessageSquare, Search, Plus, Minus } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

export default function FAQPage() {
  const [openIndex, setOpenIndex] = useState(0);

  const faqs = [
    {
      q: "How fast is a standard delivery?",
      a: "Standard city-wide deliveries within Kano usually take between 30 to 60 minutes, depending on the pickup location and traffic flow."
    },
    {
      q: "Are the drivers verified?",
      a: "Yes. Every driver on our platform undergoes a multi-stage background check, including address verification and vehicle inspection, before they are allowed to accept orders."
    },
    {
      q: "What items are prohibited?",
      a: "We do not carry illegal substances, hazardous materials, or extremely fragile items that require specialized equipment. Standard logistics items, electronics, fabric, and food are all welcome."
    },
    {
      q: "How do I track my delivery?",
      a: "Once your order is accepted, you can track your driver in real-time on our high-precision map through the tracking link sent to your device or within your dashboard."
    },
    {
      q: "How is the delivery price calculated?",
      a: "Our pricing is transparent and based on a base fare plus a per-kilometer rate. Variables like vehicle type and cargo size also influence the final estimate."
    }
  ];

  return (
    <main className="min-h-screen bg-charcoal-50">
      <Navbar />
      
      <section className="pt-32 pb-20 max-w-3xl mx-auto px-6">
        <div className="text-center mb-20 animate-in fade-in slide-in-from-top-8">
           <div className="inline-flex p-3 bg-emerald-500/10 text-emerald-600 rounded-2xl mb-6">
              <MessageSquare size={32} />
           </div>
           <h1 className="text-5xl font-black text-charcoal-900 tracking-tighter mb-4 leading-none">Frequently Asked <br/>Questions</h1>
           <p className="text-charcoal-500 font-bold tracking-tight text-lg">Everything you need to know about NaijaDrops.</p>
        </div>

        <div className="space-y-4">
           {faqs.map((faq, i) => (
             <div 
                key={i} 
                className="bg-white rounded-[2rem] border border-gray-100 overflow-hidden shadow-sm hover:shadow-md transition-shadow"
             >
                <button 
                  onClick={() => setOpenIndex(openIndex === i ? -1 : i)}
                  className="w-full px-8 py-8 text-left flex items-center justify-between group"
                >
                   <span className="text-lg font-black text-charcoal-900 tracking-tight group-hover:text-emerald-600 transition-colors">{faq.q}</span>
                   <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${openIndex === i ? 'bg-emerald-500 text-white rotate-180' : 'bg-gray-100 text-charcoal-400'}`}>
                      <ChevronDown size={20} />
                   </div>
                </button>
                <AnimatePresence>
                   {openIndex === i && (
                     <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                     >
                        <div className="px-8 pb-8 text-charcoal-600 font-medium leading-relaxed">
                           {faq.a}
                        </div>
                     </motion.div>
                   )}
                </AnimatePresence>
             </div>
           ))}
        </div>

        <div className="mt-20 p-10 bg-charcoal-900 rounded-[3rem] text-center text-white relative overflow-hidden">
           <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-transparent"></div>
           <h3 className="text-2xl font-black mb-4 relative z-10">Still have questions?</h3>
           <p className="text-charcoal-400 font-medium mb-8 relative z-10">Our support team is available 24/7 to assist you.</p>
           <a href="/contact" className="inline-flex px-8 py-4 bg-emerald-500 hover:bg-emerald-400 text-white rounded-2xl font-black transition-all relative z-10 shadow-glow">
              Contact Support
           </a>
        </div>
      </section>

      <Footer />
    </main>
  );
}

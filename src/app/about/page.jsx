"use client";

import { motion } from "framer-motion";
import { ArrowLeft, Rocket, Target, Users, ShieldCheck, Globe, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

export default function AboutPage() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-charcoal-50">
      <Navbar />
      
      {/* Hero Section */}
      <section className="relative pt-32 pb-20 overflow-hidden bg-charcoal-900 text-white">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-emerald-500/10 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/2"></div>
        
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <h1 className="text-6xl sm:text-8xl font-black tracking-tighter mb-8 leading-[0.9]">
              Logistics at <br/>
              <span className="text-emerald-500">Scale.</span>
            </h1>
            <p className="text-xl text-charcoal-400 max-w-2xl font-bold leading-relaxed tracking-tight">
              NaijaDrops is redefining city-wide logistics in Kano with precision mapping, verified carriers, and a commitment to absolute reliability.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Narrative Section */}
      <section className="py-20 max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-20">
          <div>
            <h2 className="text-4xl font-black text-charcoal-900 mb-8 tracking-tighter">Our Mission</h2>
            <p className="text-charcoal-600 text-lg font-medium leading-relaxed mb-6">
              Founded with the goal of solving the "last-mile" problem in Kano metropolis, NaijaDrops connects local vendors and individuals with a network of verified carriers.
            </p>
            <p className="text-charcoal-600 text-lg font-medium leading-relaxed">
              We leverage proprietary geospatial data and precise pin resolution to ensure that your packages reach their destination with unmatched accuracy.
            </p>
          </div>
          
          <div className="grid grid-cols-2 gap-6">
             {[
               { icon: <Rocket className="text-emerald-500" />, label: "Fast Dispatch" },
               { icon: <Target className="text-emerald-500" />, label: "Precision Pin" },
               { icon: <Users className="text-emerald-500" />, label: "Verified Carriers" },
               { icon: <ShieldCheck className="text-emerald-500" />, label: "Secure Escrow" },
             ].map((item, i) => (
               <div key={i} className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col items-center justify-center text-center">
                  <div className="mb-4">{item.icon}</div>
                  <div className="font-black text-xs uppercase tracking-widest text-charcoal-900">{item.label}</div>
               </div>
             ))}
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="bg-white py-32">
         <div className="max-w-7xl mx-auto px-6">
            <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-emerald-500 mb-2">Our Core Values</h2>
            <h3 className="text-5xl font-black text-charcoal-900 tracking-tighter mb-20 leading-none">Built for the city. <br/>Defined by trust.</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
               {[
                 { title: "Precision", desc: "Every drop is handled with high-precision mapping data specific to Kano's unique geography." },
                 { title: "Velocity", desc: "Our dispatch engine optimizes routes in real-time, ensuring the fastest possible delivery times." },
                 { title: "Transparency", desc: "Full live tracking and transparent pricing. No hidden fees, ever." }
               ].map((v, i) => (
                 <div key={i} className="space-y-4">
                    <h4 className="text-2xl font-black text-charcoal-900 tracking-tight">{v.title}</h4>
                    <p className="text-charcoal-500 font-medium leading-relaxed">{v.desc}</p>
                 </div>
               ))}
            </div>
         </div>
      </section>

      <Footer />
    </main>
  );
}

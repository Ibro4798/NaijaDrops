"use client";

import { ArrowLeft, MessageCircle, Mail, Phone } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function SupportPage() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-charcoal-950 flex flex-col p-6">
      <div className="flex items-center gap-4 pt-10 pb-8">
        <button 
          onClick={() => router.back()} 
          className="w-10 h-10 rounded-2xl bg-white/[0.05] border border-white/10 flex items-center justify-center text-white hover:bg-white/10 transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-2xl font-black text-white tracking-tight font-outfit">Support & Contact</h1>
      </div>

      <div className="flex-1 max-w-md mx-auto w-full space-y-6 pt-10">
        <div className="text-center mb-10">
          <div className="w-20 h-20 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <MessageCircle size={36} className="text-emerald-500" />
          </div>
          <h2 className="text-3xl font-black text-white tracking-tighter mb-3">How can we help?</h2>
          <p className="text-charcoal-400 text-sm font-medium leading-relaxed">
            We're currently in our Kano pilot phase. Reach out to our dispatch team directly for immediate assistance.
          </p>
        </div>

        <a 
          href="https://wa.me/2348000000000" 
          target="_blank" 
          rel="noopener noreferrer"
          className="flex flex-col items-center justify-center gap-3 py-6 bg-emerald-500 hover:bg-emerald-400 transition-all rounded-3xl shadow-glow active:scale-95 text-white group"
        >
          <Phone size={28} className="group-hover:scale-110 transition-transform" />
          <span className="font-black text-sm tracking-widest uppercase">Chat on WhatsApp</span>
        </a>

        <a 
          href="mailto:support@naijadrops.tech" 
          className="flex flex-col items-center justify-center gap-3 py-6 bg-white/[0.03] border border-white/10 hover:bg-white/10 transition-all rounded-3xl active:scale-95 text-white group"
        >
          <Mail size={28} className="text-charcoal-500 group-hover:text-white transition-colors" />
          <span className="font-black text-sm tracking-widest uppercase text-charcoal-400 group-hover:text-white transition-colors">Email Support</span>
        </a>
      </div>
    </main>
  );
}

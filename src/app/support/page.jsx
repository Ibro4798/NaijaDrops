"use client";

import Link from "next/link";
import { MessageCircle, Mail, ArrowLeft } from "lucide-react";

export default function SupportPage() {
  return (
    <div className="min-h-screen bg-charcoal-950 flex flex-col items-center justify-center px-6 py-24">
      <div className="w-full max-w-md">
        <Link href="/" className="inline-flex items-center gap-2 text-charcoal-500 hover:text-white text-sm font-bold mb-10 transition-colors">
          <ArrowLeft size={16} /> Back to home
        </Link>

        <h1 className="text-4xl font-black text-white tracking-tight mb-3">
          Support
        </h1>
        <p className="text-charcoal-400 text-base mb-10 leading-relaxed">
          NaijaDrops is in active pilot in Kano. If you have a question, issue, or feedback â€” reach us directly.
        </p>

        <div className="space-y-4">
          <a
            href="https://wa.me/2348000000000"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center gap-4 p-5 bg-white/[0.04] border border-white/10 rounded-2xl hover:bg-white/[0.07] transition-all group"
          >
            <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center">
              <MessageCircle size={22} className="text-emerald-400" />
            </div>
            <div>
              <div className="text-white font-black text-sm">WhatsApp Support</div>
              <div className="text-charcoal-500 text-xs font-medium">Fastest response â€” usually under 1 hour</div>
            </div>
          </a>

          <a
            href="mailto:support@naijadrops.tech"
            className="w-full flex items-center gap-4 p-5 bg-white/[0.04] border border-white/10 rounded-2xl hover:bg-white/[0.07] transition-all group"
          >
            <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center">
              <Mail size={22} className="text-emerald-400" />
            </div>
            <div>
              <div className="text-white font-black text-sm">Email</div>
              <div className="text-charcoal-500 text-xs font-medium">support@naijadrops.tech</div>
            </div>
          </a>
        </div>

        <p className="text-charcoal-600 text-xs font-medium mt-10 text-center">
          Operating hours: Monâ€“Sat, 8amâ€“8pm WAT
        </p>
      </div>
    </div>
  );
}

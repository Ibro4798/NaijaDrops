"use client";

import Link from "next/link";
import { Package, Instagram, Mail, MessageCircle, ArrowRight, Shield, Clock } from "lucide-react";

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-charcoal-950 text-white pt-20 pb-10 overflow-hidden relative">
      {/* Decorative Blur */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-emerald-500/5 rounded-full blur-[100px] pointer-events-none"></div>

      <div className="max-w-7xl mx-auto px-6 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12 mb-20">
          
          {/* Brand Column */}
          <div className="space-y-6">
            <Link href="/" className="flex items-center group">
              <div className="bg-emerald-500 p-2 rounded-xl mr-3 group-hover:rotate-12 transition-transform">
                <Package size={24} className="text-white" />
              </div>
              <span className="text-2xl font-black tracking-tighter text-white">
                NaijaDrops<span className="text-emerald-500">.</span>
              </span>
            </Link>
            <p className="text-charcoal-400 text-sm font-medium leading-relaxed max-w-xs">
              Building the future of logistics in Kano. High-precision delivery infrastructure for vendors and individuals.
            </p>
            <div className="flex items-center gap-4">
              <a href="https://www.instagram.com/naija.drops" target="_blank" className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center hover:bg-emerald-500 hover:text-white transition-all">
                <Instagram size={20} />
              </a>
              <a href="https://wa.me/message/3756ZAFK6RTTI1" target="_blank" className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center hover:bg-emerald-500 hover:text-white transition-all">
                <MessageCircle size={20} />
              </a>
            </div>
          </div>

          {/* Company Links - only pages that actually exist */}
          <div>
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-emerald-500 mb-6">Company</h3>
            <ul className="space-y-4">
              {[
                { label: 'Pricing', href: '/pricing' },
                { label: 'Contact', href: '/contact' },
                { label: 'FAQ', href: '/faq' },
                { label: 'Support', href: '/support' },
              ].map((item) => (
                <li key={item.label}>
                  <Link 
                    href={item.href}
                    className="text-charcoal-400 hover:text-white transition-colors font-bold text-sm tracking-tight inline-flex items-center gap-2 group"
                  >
                    {item.label} <ArrowRight size={12} className="opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal Links - only pages that actually exist */}
          <div>
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-emerald-500 mb-6">Legal</h3>
            <ul className="space-y-4">
              {[
                { label: 'Privacy Policy', href: '/privacy' },
                { label: 'Terms of Service', href: '/terms' },
              ].map((item) => (
                <li key={item.label}>
                  <Link 
                    href={item.href}
                    className="text-charcoal-400 hover:text-white transition-colors font-bold text-sm tracking-tight inline-flex items-center gap-2 group"
                  >
                    {item.label} <ArrowRight size={12} className="opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>

        </div>

        {/* Bottom Banner */}
        <div className="pt-10 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-6">
          <p className="text-charcoal-600 text-xs font-bold">
            &copy; {currentYear} NaijaDrops Logistics Platform. All Rights Reserved.
          </p>
          <div className="flex items-center gap-6 text-[10px] font-black uppercase tracking-widest text-charcoal-600">
            <span className="flex items-center gap-2"><Shield size={14} className="text-emerald-500" /> Secure Payments</span>
            <span className="flex items-center gap-2"><Clock size={14} className="text-emerald-500" /> 24/7 Support</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
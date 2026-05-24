"use client";

import { Instagram, Mail, Phone, ArrowLeft, MessageCircle, Clock, MapPin } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function Contact() {
  const router = useRouter();

  const contactOptions = [
    {
      name: "WhatsApp Support",
      icon: <MessageCircle className="w-8 h-8 text-emerald-500" />,
      description: "Chat with us for instant assistance",
      link: "https://wa.me/message/3756ZAFK6RTTI1",
      label: "Open WhatsApp",
      color: "bg-emerald-50 text-emerald-700"
    },
    {
      name: "Instagram",
      icon: <Instagram className="w-8 h-8 text-pink-600" />,
      description: "Follow us for updates and DM support",
      link: "https://www.instagram.com/naija.drops?igsh=bW5nN3ExbXJrZGo4",
      label: "@naija.drops",
      color: "bg-pink-50 text-pink-700"
    },
    {
      name: "Email Us",
      icon: <Mail className="w-8 h-8 text-blue-600" />,
      description: "Send us a detailed message",
      link: "mailto:yahaya.usama@naijadrops.tech",
      label: "yahaya.usama@naijadrops.tech",
      color: "bg-blue-50 text-blue-700"
    },
    {
      name: "Call Support",
      icon: <Phone className="w-8 h-8 text-charcoal-700" />,
      description: "Call us for urgent delivery issues",
      link: "tel:+2349118267433",
      label: "+234 911 826 7433",
      color: "bg-gray-100 text-charcoal-900"
    }
  ];

  return (
    <main className="min-h-[100dvh] bg-charcoal-50 pt-[calc(6rem+var(--safe-top))] px-4 pb-20">
      <div className="max-w-xl mx-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
            <button 
              onClick={() => router.back()} 
              className="w-12 h-12 bg-white flex items-center justify-center rounded-2xl shadow-sm border border-gray-100 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <h1 className="text-3xl font-black text-charcoal-900 tracking-tight">Contact Us</h1>
            <div className="w-12 h-12"></div> {/* Spacer */}
        </div>

        {/* Support Card Container */}
        <div className="space-y-6">
          {contactOptions.map((opt, i) => (
            <Link 
              key={i} 
              href={opt.link} 
              target="_blank"
              className="block bg-white p-6 rounded-[2.5rem] border border-gray-100 shadow-sm hover:shadow-2xl hover:scale-[1.02] transition-all group"
            >
              <div className="flex items-center gap-5">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform ${opt.color}`}>
                  {opt.icon}
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-black text-charcoal-900 mb-1">{opt.name}</h2>
                  <p className="text-charcoal-500 font-medium text-sm mb-3">{opt.description}</p>
                  <div className={`inline-block px-4 py-1.5 rounded-full font-bold text-xs uppercase tracking-widest ${opt.color}`}>
                    {opt.label}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Operating Hours & Location */}
        <div className="mt-12 bg-charcoal-900 rounded-[2.5rem] p-8 text-white relative overflow-hidden shadow-2xl">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-12 -mt-12"></div>
            <h3 className="text-lg font-black uppercase tracking-widest text-emerald-400 mb-6 font-mono text-center">NaijaDrops Kano</h3>
            
            <div className="space-y-5">
              <div className="flex items-start gap-4">
                <div className="bg-white/10 p-2 rounded-xl border border-white/10 mt-1"><Clock size={16} /></div>
                <div>
                    <div className="font-bold text-white">Daily Operations</div>
                    <div className="text-charcoal-400 text-sm font-medium">8:00 AM â€” 9:00 PM</div>
                </div>
              </div>
              
              <div className="flex items-start gap-4">
                <div className="bg-white/10 p-2 rounded-xl border border-white/10 mt-1"><MapPin size={16} /></div>
                <div>
                    <div className="font-bold text-white">Service Area</div>
                    <div className="text-charcoal-400 text-sm font-medium">Full Coverage within the Kano metropolis.</div>
                </div>
              </div>
            </div>
            
            <p className="mt-10 text-center text-[10px] font-black uppercase tracking-[0.2em] text-white/30">
              Premium logistics for everyone.
            </p>
        </div>

      </div>
    </main>
  );
}

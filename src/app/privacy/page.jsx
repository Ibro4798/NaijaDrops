"use client";

import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Lock, Eye, ShieldCheck, Database } from "lucide-react";

export default function PrivacyPage() {
  const sections = [
    {
      title: "Data Collection",
      icon: <Database size={24} />,
      content: "We collect only the information necessary to provide our logistics services, including your contact details, location data during active orders, and transaction history."
    },
    {
      title: "How We Use Data",
      icon: <Eye size={24} />,
      content: "Your data is used to match you with available drivers, calculate accurate delivery distance, and provide real-time tracking of your packages."
    },
    {
      title: "Data Security",
      icon: <ShieldCheck size={24} />,
      content: "We implement high-grade encryption and secure database management to protect your information from unauthorized access."
    }
  ];

  return (
    <main className="min-h-screen bg-white">
      <Navbar />
      
      <section className="pt-40 pb-20 max-w-4xl mx-auto px-6">
        <div className="flex items-center gap-4 text-emerald-500 mb-6">
           <Lock size={40} />
           <h1 className="text-5xl font-black text-charcoal-900 tracking-tighter">Privacy Policy</h1>
        </div>
        <p className="text-charcoal-500 font-bold mb-12 uppercase tracking-widest text-xs">Protecting your digital footprint in Kano.</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
           {sections.map((sec, i) => (
             <div key={i} className="p-8 bg-charcoal-50 rounded-[2.5rem] border border-gray-100">
                <div className="text-emerald-500 mb-4">{sec.icon}</div>
                <h2 className="text-xl font-black text-charcoal-900 mb-3 tracking-tight">{sec.title}</h2>
                <p className="text-charcoal-600 text-sm font-medium leading-relaxed">{sec.content}</p>
             </div>
           ))}
        </div>

        <div className="prose prose-lg prose-emerald">
           <h2 className="text-2xl font-black text-charcoal-900 mb-4 tracking-tight">Your Rights</h2>
           <p className="text-charcoal-600 font-medium leading-relaxed">
              You have the right to request access to your data, correction of any inaccuracies, and deletion of your account at any time. For privacy concerns, please contact our Data Protection Officer at privacy@naijadrops.tech.
           </p>
        </div>
      </section>

      <Footer />
    </main>
  );
}

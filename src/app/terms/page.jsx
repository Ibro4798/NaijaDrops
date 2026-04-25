"use client";

import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Shield, FileText, Lock, Globe } from "lucide-react";

export default function TermsPage() {
  const sections = [
    {
      title: "1. Acceptance of Terms",
      content: "By accessing and using the NaijaDrops platform, you agree to be bound by these Terms of Service. If you do not agree, please do not use our services."
    },
    {
      title: "2. Service Description",
      content: "NaijaDrops provides a logistics matching platform connecting customers with independent carriers for delivery services within Kano. We do not provide physical logistics services ourselves but facilitate the connection."
    },
    {
      title: "3. User Obligations",
      content: "Users are responsible for ensuring that items submitted for delivery are legal, safe, and appropriately packaged. Any violation of local laws will result in immediate termination of account access."
    },
    {
      title: "4. Payments and Refunds",
      content: "Payments are processed through our secure gateway. Refunds are subject to our cancellation policy, which varies based on the status of the delivery request."
    }
  ];

  return (
    <main className="min-h-screen bg-white">
      <Navbar />
      
      <section className="pt-40 pb-20 max-w-4xl mx-auto px-6">
        <div className="flex items-center gap-4 text-emerald-500 mb-6">
           <FileText size={40} />
           <h1 className="text-5xl font-black text-charcoal-900 tracking-tighter">Terms of Service</h1>
        </div>
        <p className="text-charcoal-500 font-bold mb-12 uppercase tracking-widest text-xs">Last Updated: April 2026</p>

        <div className="prose prose-lg prose-emerald max-w-none">
           {sections.map((sec, i) => (
             <div key={i} className="mb-12">
                <h2 className="text-2xl font-black text-charcoal-900 mb-4 tracking-tight">{sec.title}</h2>
                <p className="text-charcoal-600 font-medium leading-relaxed">{sec.content}</p>
             </div>
           ))}
        </div>
      </section>

      <Footer />
    </main>
  );
}

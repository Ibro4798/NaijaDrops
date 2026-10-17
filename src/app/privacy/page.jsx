import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Lock, Eye, ShieldCheck, Database } from "lucide-react";

export const metadata = {
  title: "Privacy Policy | NaijaDrops",
  description: "What NaijaDrops collects, why, who we share it with, and how you can delete your data.",
};

const CONTACT = "privacy@naijadrops.tech";
const UPDATED = "October 16, 2026";

const highlights = [
  {
    title: "What we collect",
    icon: <Database size={24} />,
    content: "Account details, order details, your location when you use location features, and - for riders - onboarding documents and payout details.",
  },
  {
    title: "How we use it",
    icon: <Eye size={24} />,
    content: "To match and track deliveries, process payments and payouts, send order updates, prevent fraud and settle disputes. We do not sell your data or show ads.",
  },
  {
    title: "Your control",
    icon: <ShieldCheck size={24} />,
    content: "You can delete your account in the app at any time, or ask us to access or correct your information.",
  },
];

const sections = [
  {
    title: "Who we are",
    body: [
      "NaijaDrops is a delivery platform in Kano, Nigeria that connects vendors, customers and riders. This policy explains what personal information we handle and why. Questions: " + CONTACT + ".",
    ],
  },
  {
    title: "Information we collect",
    list: [
      "Account information: name, email address, phone number, profile photo, and business name and logo for vendors. You can sign in with email and password or with Google.",
      "Rider information: full name, phone number, vehicle type and plate number, ID card, driver's licence (if provided), vehicle and profile photos, and bank account details used to pay you.",
      "Location: your device's precise location when you use \"use my location\", set pickup or drop-off points, or - if you are a rider - while you are online or on a delivery with the app open. We also store the pickup and drop-off addresses and coordinates of each order. We do not collect your location when the app is closed.",
      "Order information: addresses, package description and size, the receiver's name and phone number, delivery notes, voice notes, delivery confirmation photos, chat messages, and ratings and reviews.",
      "Payments: card, bank-transfer and mobile-money payments are handled by Paystack. We receive a payment reference and status. We never see or store your card number.",
      "Notifications and technical data: if you turn on notifications we store the web-push subscription for your device so we can send order alerts, plus basic technical logs needed to run and secure the service.",
    ],
  },
  {
    title: "How we use your information",
    list: [
      "To create and run your account and complete deliveries: matching riders to orders, routing, live tracking and order updates.",
      "To take payments, calculate fares and pay riders.",
      "To keep the platform safe: fraud prevention, verifying riders, and investigating disputes or incidents.",
      "To communicate with you about your orders and support requests.",
      "To meet legal and accounting obligations.",
    ],
  },
  {
    title: "Who can see your information",
    body: [
      "People on the same order see what is needed to complete it. For example, vendors and customers can see the assigned rider's name and live location during the delivery, and a rider can see the pickup and drop-off points and the receiver's name and phone number. We do not sell personal data.",
    ],
  },
  {
    title: "Service providers we use",
    list: [
      "Supabase - database, sign-in and file storage (data is stored in Europe, Ireland).",
      "Vercel - website and app hosting.",
      "Paystack - payment processing.",
      "Mapbox and OpenStreetMap-based search services - maps, address search and routes. They receive coordinates and search text.",
      "Google - only if you choose to sign in with Google.",
      "Your browser or phone's push-notification service - to deliver notifications you have turned on.",
    ],
  },
  {
    title: "Keeping your data",
    body: [
      "We keep your account information while your account is active. Order, delivery and payment records are kept as long as needed for accounting, fraud prevention, dispute handling and legal obligations, even after you delete your account - but after deletion they are no longer linked to your name or contact details.",
    ],
  },
  {
    title: "Deleting your account and your rights",
    body: [
      "You can delete your account yourself in the app (Profile, then Delete account) or follow the steps on our Delete Account page. If you can't sign in, email " + CONTACT + " from the address on your account.",
      "When an account is deleted we remove your name, contact details, photos, documents, bank details, saved location history and notification subscriptions, and clear the text of your chat messages and written review feedback. You can't delete while an order is in progress or a payout is pending.",
      "You may also ask us to access or correct the information we hold about you, in line with the Nigeria Data Protection Act 2023.",
    ],
  },
  {
    title: "Security",
    body: [
      "Data is sent over HTTPS, our database provider encrypts stored data, and access to records is restricted by role. No online service can promise perfect security, so please use a strong, unique password.",
    ],
  },
  {
    title: "Transfers outside Nigeria",
    body: [
      "Some of our providers process data outside Nigeria (for example in Europe). We choose providers that protect personal data and use them only to run NaijaDrops.",
    ],
  },
  {
    title: "Children",
    body: ["NaijaDrops is not intended for anyone under 18, and we do not knowingly collect their information."],
  },
  {
    title: "Changes to this policy",
    body: ["If we make a meaningful change we will update the date below and, where appropriate, tell you in the app."],
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-white">
      <Navbar />

      <section className="pt-40 pb-20 max-w-4xl mx-auto px-6">
        <div className="flex items-center gap-4 text-emerald-500 mb-6">
          <Lock size={40} />
          <h1 className="text-5xl font-black text-[#18181b] tracking-tighter">Privacy Policy</h1>
        </div>
        <p className="text-charcoal-500 font-bold mb-12 uppercase tracking-widest text-xs">
          Last updated {UPDATED}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          {highlights.map((sec) => (
            <div key={sec.title} className="p-8 bg-charcoal-50 rounded-[2.5rem] border border-gray-100">
              <div className="text-emerald-500 mb-4">{sec.icon}</div>
              <h2 className="text-xl font-black text-[#18181b] mb-3 tracking-tight">{sec.title}</h2>
              <p className="text-charcoal-600 text-sm font-medium leading-relaxed">{sec.content}</p>
            </div>
          ))}
        </div>

        <div className="space-y-10">
          {sections.map((sec) => (
            <div key={sec.title}>
              <h2 className="text-2xl font-black text-[#18181b] mb-4 tracking-tight">{sec.title}</h2>
              {sec.body?.map((p) => (
                <p key={p} className="text-charcoal-600 font-medium leading-relaxed mb-3">{p}</p>
              ))}
              {sec.list && (
                <ul className="list-disc pl-6 space-y-2 text-charcoal-600 font-medium leading-relaxed">
                  {sec.list.map((item) => <li key={item}>{item}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>

        <p className="mt-12 text-charcoal-500 text-sm font-medium">
          Want to delete your account? <Link href="/delete-account" className="text-emerald-600 underline">Here&apos;s how</Link>.
        </p>
      </section>

      <Footer />
    </main>
  );
}

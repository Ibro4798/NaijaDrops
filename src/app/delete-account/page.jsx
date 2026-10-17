import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Trash2, Mail } from "lucide-react";

export const metadata = {
  title: "Delete your account | NaijaDrops",
  description: "How to delete your NaijaDrops account and what happens to your data.",
};

const CONTACT = "privacy@naijadrops.tech";

const steps = [
  "Sign in to NaijaDrops.",
  "Open Profile and scroll to the Delete account section.",
  "Tap Delete my account, type DELETE to confirm, and tap Delete forever.",
];

const removed = [
  "Your name, email address, phone number and profile photo",
  "Business name and logo (vendors)",
  "ID card, licence, vehicle photo, vehicle plate number and bank details (riders)",
  "Saved live-location history and last known location (riders)",
  "Notification subscriptions on your devices",
  "The text of chat messages you sent, and written feedback you left in reviews",
];

const kept = [
  "Order, delivery and payment records (addresses, amounts, status, payment references), kept for accounting, fraud prevention and dispute handling. After deletion they are no longer linked to your name or contact details.",
  "Payout records for riders, for the same reasons.",
];

export default function DeleteAccountPage() {
  return (
    <main className="min-h-screen bg-white">
      <Navbar />

      <section className="pt-40 pb-20 max-w-3xl mx-auto px-6">
        <div className="flex items-center gap-4 text-red-500 mb-6">
          <Trash2 size={36} />
          <h1 className="text-4xl md:text-5xl font-black text-[#18181b] tracking-tighter">Delete your account</h1>
        </div>
        <p className="text-charcoal-500 font-bold mb-10 uppercase tracking-widest text-xs">
          NaijaDrops - vendors, customers and riders
        </p>

        <h2 className="text-2xl font-black text-[#18181b] mb-4 tracking-tight">Delete it yourself, in the app</h2>
        <ol className="list-decimal pl-6 space-y-2 text-charcoal-600 font-medium leading-relaxed mb-6">
          {steps.map((s) => <li key={s}>{s}</li>)}
        </ol>
        <Link
          href="/profile"
          className="inline-flex items-center justify-center px-8 py-4 rounded-2xl bg-[#18181b] text-white font-black text-xs uppercase tracking-widest mb-4"
        >
          Go to my profile
        </Link>
        <p className="text-charcoal-500 text-sm font-medium leading-relaxed mb-12">
          You can&apos;t delete while an order is in progress or a payout is still pending. Finish or cancel the order,
          or wait for the payout, then try again.
        </p>

        <h2 className="text-2xl font-black text-[#18181b] mb-4 tracking-tight">Can&apos;t sign in?</h2>
        <p className="text-charcoal-600 font-medium leading-relaxed mb-4">
          Email us from the address on your account with the subject &quot;Delete my NaijaDrops account&quot; and
          we&apos;ll verify it&apos;s you and delete the account for you.
        </p>
        <a
          href={`mailto:${CONTACT}?subject=Delete%20my%20NaijaDrops%20account`}
          className="inline-flex items-center gap-2 text-emerald-600 font-black mb-12"
        >
          <Mail size={18} /> {CONTACT}
        </a>

        <h2 className="text-2xl font-black text-[#18181b] mb-4 tracking-tight">What is deleted</h2>
        <ul className="list-disc pl-6 space-y-2 text-charcoal-600 font-medium leading-relaxed mb-10">
          {removed.map((s) => <li key={s}>{s}</li>)}
        </ul>

        <h2 className="text-2xl font-black text-[#18181b] mb-4 tracking-tight">What we keep, and why</h2>
        <ul className="list-disc pl-6 space-y-2 text-charcoal-600 font-medium leading-relaxed mb-10">
          {kept.map((s) => <li key={s}>{s}</li>)}
        </ul>

        <p className="text-charcoal-500 text-sm font-medium leading-relaxed">
          More detail is in our <Link href="/privacy" className="text-emerald-600 underline">Privacy Policy</Link>.
        </p>
      </section>

      <Footer />
    </main>
  );
}

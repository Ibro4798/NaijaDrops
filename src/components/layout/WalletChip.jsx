"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wallet } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { naira } from "@/utils/wallet";

// Small balance link in the navbar for signed-in people. Riders are paid out, not charged, so it is hidden for them.
export default function WalletChip() {
  const supabase = useMemo(() => createClient(), []);
  const pathname = usePathname();
  const [balance, setBalance] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase.from("user_wallets").select("balance").eq("user_id", user.id).maybeSingle();
        if (alive) setBalance(Number(data?.balance || 0));
      } catch { /* chip simply stays hidden */ }
    })();
    return () => { alive = false; };
  }, [supabase, pathname]);

  if (balance === null || pathname.startsWith("/rider") || pathname.startsWith("/ops-terminal")) return null;
  return (
    <Link
      href="/wallet"
      title="NaijaDrops Wallet"
      className="hidden sm:flex items-center gap-2 h-10 px-4 rounded-2xl text-xs font-black text-emerald-500 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-white/10 transition-all"
    >
      <Wallet size={16} /> {naira(balance)}
    </Link>
  );
}

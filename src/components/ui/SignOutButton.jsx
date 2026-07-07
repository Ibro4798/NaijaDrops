"use client";

import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";

export default function SignOutButton({ className = "", children }) {
  const supabase = createClient();
  const router = useRouter();

  const handleSignOut = async (e) => {
    e.preventDefault();
    await supabase.auth.signOut();
    router.replace("/auth/login");
  };

  return (
    <button onClick={handleSignOut} className={className}>
      {children}
    </button>
  );
}

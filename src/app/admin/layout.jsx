"use client";

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import { ShieldAlert, BarChart3, Users, Package, Power } from 'lucide-react';
import Link from 'next/link';

export default function AdminLayout({ children }) {
  const supabase = createClient();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkAdmin() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const { data: adminData } = await supabase
        .from('admins')
        .select('id')
        .eq('id', user.id)
        .maybeSingle();
      if (!adminData) {
        router.push('/'); // Redirect non-admins
      } else {
        setIsAdmin(true);
      }
      setLoading(false);
    }
    checkAdmin();
  }, [supabase, router]);

  if (loading) return <div className="min-h-screen bg-charcoal-900 text-white flex items-center justify-center font-bold animate-pulse">Verifying Admin Access...</div>;
  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-charcoal-900 text-white flex">
      {/* Sidebar */}
      <aside className="w-64 border-r border-charcoal-800 flex flex-col p-6">
        <div className="flex items-center gap-2 mb-10">
          <div className="w-8 h-8 bg-emerald-500 rounded flex items-center justify-center">
            <ShieldAlert size={18} className="text-charcoal-900" />
          </div>
          <span className="font-black tracking-tight text-xl">ND Admin</span>
        </div>

        <nav className="flex-1 space-y-2">
          <Link href="/admin" className="flex items-center gap-3 p-3 rounded-xl bg-charcoal-800 text-emerald-400 font-bold">
            <BarChart3 size={20} /> Dashboard
          </Link>
          <Link href="/admin/orders" className="flex items-center gap-3 p-3 rounded-xl text-gray-400 hover:bg-charcoal-800 hover:text-white transition-colors">
            <Package size={20} /> All Orders
          </Link>
          <Link href="/admin/drivers" className="flex items-center gap-3 p-3 rounded-xl text-gray-400 hover:bg-charcoal-800 hover:text-white transition-colors">
            <Users size={20} /> Driver Fleet
          </Link>
        </nav>

        <button 
          onClick={() => supabase.auth.signOut().then(() => router.push('/'))}
          className="flex items-center gap-3 p-3 rounded-xl text-red-400 hover:bg-red-500/10 transition-colors mt-auto font-bold"
        >
          <Power size={20} /> Sign Out
        </button>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-10">
        {children}
      </main>
    </div>
  );
}

import { validateAdmin } from "@/utils/admin";
import { createClient } from "@/utils/supabase/server";
import { Loader2, UserPlus, ShieldCheck, Mail } from "lucide-react";
import { addAdmin } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminsPage() {
  const { user, admin: currentAdmin } = await validateAdmin();
  const supabase = await createClient();

  // Superadmin check (as requested: ibrahim@naijadrops.tech)
  // admin comes from validateAdmin in the layout; if not present, user is not super admin
const isSuperAdmin = false;

  // Load existing admins
  const { data: admins, error: adminErr } = await supabase
    .from("admin_users")
    .select("*")
    .order("email");

  return (
    <div className="min-h-screen bg-black text-white p-8 font-mono">
      <div className="flex justify-between items-end mb-12 border-b border-white/10 pb-8">
        <div>
           <h1 className="text-3xl font-black italic tracking-tighter uppercase">Registry / Administrators</h1>
           <p className="text-charcoal-500 text-xs mt-2 uppercase tracking-widest">Security Clearance: {isSuperAdmin ? 'SUPER ADMIN' : 'ADMIN'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        {/* Admin List */}
        <section>
          <h2 className="text-sm font-black uppercase tracking-[0.2em] text-emerald-500 mb-6 flex items-center gap-2">
            <ShieldCheck size={16} /> Active Credentials
          </h2>
          <div className="space-y-4">
            {admins?.map((a) => (
              <div key={a.id || a.email} className="bg-charcoal-900/40 border border-white/5 rounded-2xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-charcoal-500">
                    <Mail size={18} />
                  </div>
                  <div>
                    <div className="text-sm font-bold tracking-tight">{a.email}</div>
                    <div className="text-[9px] font-black uppercase tracking-widest text-charcoal-600">{a.role || 'ADMIN'}</div>
                  </div>
                </div>
                <div className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${a.is_active ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                  {a.is_active ? 'Active' : 'Inactive'}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Add Admin Form (Super Admin Only) */}
        {isSuperAdmin && (
          <section className="bg-charcoal-900/20 border border-white/5 rounded-[2rem] p-8">
            <h2 className="text-lg font-black italic uppercase tracking-tight mb-6">Authorize New Admin</h2>
            <form action={addAdmin} className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-charcoal-500 uppercase tracking-widest block mb-2 px-1">Email Address</label>
                <input 
                  name="email"
                  type="email" 
                  required
                  placeholder="admin@email.com"
                  className="w-full bg-charcoal-950 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-emerald-500 transition-all"
                />
              </div>

              <button 
                type="submit"
                className="w-full bg-white text-black hover:bg-emerald-500 transition-all font-black py-4 rounded-xl uppercase text-xs tracking-widest flex items-center justify-center gap-2"
              >
                <UserPlus size={16} />
                Authorize Admin
              </button>
            </form>
          </section>
        )}

        {!isSuperAdmin && (
          <div className="flex items-center justify-center border border-dashed border-white/5 rounded-[2rem] p-8 text-center">
             <p className="text-charcoal-600 text-[10px] font-black uppercase tracking-[0.2em]">Super Admin privileges required to manage credentials</p>
          </div>
        )}
      </div>
    </div>
  );
}





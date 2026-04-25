"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { getUserRole } from '@/utils/auth';
import { User, ShieldCheck, Mail, Phone, MapPin, LogOut, ChevronRight, Settings, Bell, Shield, HelpCircle } from 'lucide-react';
import { motion } from 'framer-motion';

export default function DriverProfile() {
    const router = useRouter();
    const supabase = createClient();
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [isVerifying, setIsVerifying] = useState(true);

    useEffect(() => {
        async function fetchProfile() {
            const { user, role, profile: prof } = await getUserRole(supabase);
            if (user && role === 'driver') {
                setUser(user);
                setProfile(prof);
            } else {
                router.push('/login');
            }
            setIsVerifying(false);
        }
        fetchProfile();
    }, [supabase, router]);

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        router.push('/login');
    };

    if (isVerifying) {
        return (
            <div className="min-h-screen bg-charcoal-950 flex items-center justify-center">
                <div className="w-10 h-10 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-y-auto bg-charcoal-950 px-6 pt-12 pb-32">
            {/* Header Area */}
            <div className="flex flex-col items-center mb-10">
                <div className="relative mb-6">
                    <div className="w-28 h-28 rounded-[2.5rem] border-4 border-emerald-500/20 overflow-hidden shadow-premium">
                        <img 
                            src={profile?.avatar_url || "https://ui-avatars.com/api/?name=Driver&background=10b981&color=fff"} 
                            className="w-full h-full object-cover" 
                            alt="Profile" 
                        />
                    </div>
                    {profile?.driver_status === 'active' && (
                        <div className="absolute -bottom-2 -right-2 bg-emerald-500 text-charcoal-950 p-2 rounded-2xl shadow-glow border-4 border-charcoal-950">
                            <ShieldCheck size={18} />
                        </div>
                    )}
                </div>
                
                <h1 className="text-3xl font-black text-white tracking-tighter italic mb-1 font-outfit uppercase">
                    {profile?.full_name || 'Protocol Unit'}
                </h1>
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                    <span className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.3em]">
                        {profile?.driver_status === 'active' ? 'Authorized Carrier' : 'Awaiting Metadata'}
                    </span>
                </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-4 mb-10">
                <div className="glass p-6 rounded-[2.5rem] border-white/5 flex flex-col items-center">
                    <div className="text-[9px] font-black text-charcoal-400 uppercase tracking-widest mb-2">Platform Rank</div>
                    <div className="text-2xl font-black text-white italic">4.92</div>
                </div>
                <div className="glass p-6 rounded-[2.5rem] border-white/5 flex flex-col items-center text-center">
                    <div className="text-[9px] font-black text-charcoal-400 uppercase tracking-widest mb-2">Payload Success</div>
                    <div className="text-2xl font-black text-white italic">142</div>
                </div>
            </div>

            {/* Account Settings */}
            <div className="space-y-4 mb-10">
                <h3 className="text-[10px] font-black text-white/30 uppercase tracking-[0.4em] ml-6 mb-4">Core Metadata</h3>
                
                <div className="glass-dark rounded-[3rem] overflow-hidden border border-white/5 shadow-premium">
                    {[
                        { icon: <Mail size={18} />, label: 'Neural Channel', value: user?.email },
                        { icon: <Phone size={18} />, label: 'Transmission Link', value: '+234 9118267433' },
                        { icon: <MapPin size={18} />, label: 'Operation Base', value: profile?.city || 'Kano Cluster' }
                    ].map((item, i) => (
                        <div key={i} className="flex items-center gap-5 p-6 border-b border-white/5 last:border-b-0 hover:bg-white/5 transition-all">
                            <div className="w-11 h-11 bg-white/5 rounded-2xl flex items-center justify-center text-emerald-500">
                                {item.icon}
                            </div>
                            <div className="flex-1">
                                <div className="text-[9px] font-black text-charcoal-500 uppercase tracking-widest mb-0.5">{item.label}</div>
                                <div className="text-sm font-bold text-white tracking-tight">{item.value}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Navigation Menus */}
            <div className="space-y-4 mb-10">
                <h3 className="text-[10px] font-black text-white/30 uppercase tracking-[0.4em] ml-6 mb-4">Administrative</h3>
                
                <div className="glass-dark rounded-[3rem] overflow-hidden border border-white/5 shadow-premium">
                    {[
                        { icon: <Shield size={18}/>, label: 'Security Protocols' },
                        { icon: <Bell size={18}/>, label: 'Transmission Alerts' },
                        { icon: <Settings size={18}/>, label: 'Unit Calibration' },
                        { icon: <HelpCircle size={18}/>, label: 'Support Nexus' }
                    ].map((item, i) => (
                        <div key={i} className="flex items-center gap-5 p-6 border-b border-white/5 last:border-b-0 hover:bg-white/5 transition-all cursor-pointer group">
                            <div className="w-11 h-11 bg-white/5 rounded-2xl flex items-center justify-center text-charcoal-400 group-hover:text-white transition-colors">
                                {item.icon}
                            </div>
                            <div className="flex-1 font-black text-xs text-white/80 uppercase tracking-widest group-hover:text-white transition-colors">
                                {item.label}
                            </div>
                            <ChevronRight size={18} className="text-charcoal-600 group-hover:text-emerald-500 transition-all group-hover:translate-x-1" />
                        </div>
                    ))}
                </div>
            </div>

            {/* Action Group */}
            <div className="px-2">
                <button 
                    onClick={handleSignOut}
                    className="w-full py-6 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-[2.5rem] font-black text-[11px] uppercase tracking-[0.5em] transition-all border border-red-500/10 flex items-center justify-center gap-3 active:scale-95 shadow-premium"
                >
                    <LogOut size={16} /> Terminate Session
                </button>
            </div>

            {/* Footer Version Info */}
            <div className="mt-12 text-center">
                <div className="text-[10px] font-black text-charcoal-700 uppercase tracking-widest">NaijaDrops Core v2.4.1</div>
            </div>
        </div>
    );
}

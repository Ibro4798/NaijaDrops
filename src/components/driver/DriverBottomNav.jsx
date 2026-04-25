'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Briefcase, CreditCard, User, Map } from 'lucide-react';

export default function DriverBottomNav() {
  const pathname = usePathname();

  const navItems = [
    { label: 'Jobs', icon: <Briefcase size={20} />, href: '/driver' },
    { label: 'Earnings', icon: <CreditCard size={20} />, href: '/driver/wallet' },
    { label: 'Map', icon: <Map size={20} />, href: '/driver/map' },
    { label: 'Account', icon: <User size={20} />, href: '/driver/profile' },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[60] bg-charcoal-900/90 backdrop-blur-2xl border-t border-white/5 pb-[var(--safe-bottom)] px-6">
      <div className="max-w-md mx-auto flex justify-between items-center h-20">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link 
              key={item.label} 
              href={item.href}
              className={`flex flex-col items-center gap-1.5 transition-all duration-300 ${isActive ? 'text-emerald-500 scale-110' : 'text-charcoal-500 hover:text-white'}`}
            >
              <div className={`${isActive ? 'bg-emerald-500/10 p-2 rounded-xl shadow-glow' : ''}`}>
                {item.icon}
              </div>
              <span className="text-[9px] font-black uppercase tracking-[0.2em]">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

import Link from "next/link";
import { Package } from "lucide-react";

export default function Navbar() {
  return (
    <nav className="fixed w-full z-50 bg-white/80 backdrop-blur-md border-b border-gray-100 transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-20 items-center">
          {/* Logo */}
          <Link href="/" className="flex-shrink-0 flex items-center gap-2">
            <div className="w-10 h-10 bg-emerald-700 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-700/30">
              <Package className="h-6 w-6 text-white" />
            </div>
            <span className="font-extrabold text-2xl tracking-tight text-charcoal-900">
              Naija<span className="text-emerald-700">Drops</span>
            </span>
          </Link>
          
          {/* Prototype Badge & Driver Link */}
          <div className="hidden md:flex items-center gap-4">
            <Link 
              href="/driver" 
              className="text-sm font-bold border border-charcoal-200 px-3 py-1.5 rounded-full text-charcoal-600 hover:text-emerald-600 hover:border-emerald-200 transition-colors bg-white/50 backdrop-blur-sm shadow-sm"
            >
              Switch to Driver
            </Link>
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-bold tracking-wide py-1.5 px-4 rounded-full flex items-center gap-2">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
              React Prototype
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}

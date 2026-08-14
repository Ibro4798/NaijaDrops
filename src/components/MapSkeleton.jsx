import { MapPin } from "lucide-react";
import Skeleton from "@/components/ui/Skeleton";

/**
 * Shown via next/dynamic's `loading` option while MapCanvas's JS chunk
 * downloads, and Mapbox GL JS's WebGL context spins up - both genuinely
 * take a noticeable moment on a weaker phone. Without this, that whole
 * window was just blank space, which reads as broken rather than loading.
 */
export default function MapSkeleton() {
  return (
    <div className="w-full h-full rounded-2xl overflow-hidden border border-white/10 relative bg-charcoal-900">
      <Skeleton className="absolute inset-0 rounded-2xl" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
        <MapPin size={22} className="text-charcoal-600 animate-pulse" />
        <span className="text-charcoal-600 text-[10px] font-black uppercase tracking-widest">Loading map...</span>
      </div>
    </div>
  );
}

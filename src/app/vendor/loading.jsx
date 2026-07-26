import Skeleton from "@/components/ui/Skeleton";

// Shown instantly on navigation into any /vendor/* route while the layout's
// server-side auth check and the page's own data resolve. See the matching
// comment in rider/(main)/loading.jsx - kept deliberately lightweight since
// it's only visible for a moment before each page's own loading state
// (matching that page's real content shape) takes over.
export default function Loading() {
  return (
    <div className="min-h-screen bg-charcoal-900 p-6 space-y-6 max-w-7xl mx-auto w-full">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-40 w-full rounded-2xl" />
      <Skeleton className="h-40 w-full rounded-2xl" />
    </div>
  );
}
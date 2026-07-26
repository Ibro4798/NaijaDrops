import Skeleton from "@/components/ui/Skeleton";

// Shown instantly on navigation into /tracking/[orderId] before the page
// component itself has even mounted. The page's own loading state (matching
// its real layout shape) takes over immediately after - see the matching
// skeleton in tracking/[orderId]/page.jsx.
export default function Loading() {
  return (
    <div className="min-h-screen bg-charcoal-950">
      <Skeleton className="h-64 w-full rounded-none" />
      <div className="px-6 py-8 space-y-4">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-3 w-64" />
      </div>
    </div>
  );
}
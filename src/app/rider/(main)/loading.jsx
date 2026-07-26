import Skeleton from "@/components/ui/Skeleton";

// Shown instantly on navigation into any /rider/* route while the layout's
// server-side auth/profile check and the page's own data resolve - replaces
// the blank flash that used to happen before anything (even the nav) had
// rendered. Deliberately generic/lightweight per Next.js guidance: this is
// only visible for a moment, so it doesn't try to mirror every page's exact
// layout - each page's own loading state (see dashboard/jobs pages) takes
// over immediately after this for the data-fetch itself.
export default function Loading() {
  return (
    <div className="min-h-screen bg-charcoal-950 p-6 space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-10 w-10 rounded-xl" />
      </div>
      <Skeleton className="h-32 w-full rounded-2xl" />
      <Skeleton className="h-32 w-full rounded-2xl" />
    </div>
  );
}
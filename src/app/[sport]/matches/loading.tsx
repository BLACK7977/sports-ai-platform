import { PageLoadingShell } from "@/components/skeletons/page-loading-shell";
import { SkeletonBlock } from "@/components/skeletons/skeleton-block";
import { SkeletonLine } from "@/components/skeletons/skeleton-line";

export default function Loading() {
  return (
    <PageLoadingShell
      width={ "min(90%, 1200px)" }
      minHeight={ "calc(100dvh - 4rem)" }
      className="grid grid-cols-1 gap-4 px-4 py-8"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <SkeletonBlock className="h-6 w-1/3" />
        <SkeletonBlock className="h-6 w-1/4" />
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex flex-col gap-2 p-4 bg-slate-800/40 rounded-lg">
            <SkeletonBlock className="h-6 w-1/2" />
            <SkeletonLine className="w-1/2" />
            <SkeletonLine className="w-3/4" />
            <div className="flex gap-2">
              <SkeletonBlock className="h-4 w-20 rounded" />
              <SkeletonBlock className="h-4 w-20 rounded" />
            </div>
          </div>
        ))}
      </div>
    </PageLoadingShell>
  );
}
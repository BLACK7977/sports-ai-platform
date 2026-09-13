import { PageLoadingShell } from "@/components/skeletons/page-loading-shell";
import { SkeletonBlock } from "@/components/skeletons/skeleton-block";
import { SkeletonLine } from "@/components/skeletons/skeleton-line";

export default function Loading() {
  return (
    <PageLoadingShell
      width={ "min(90%, 1200px)" }
      minHeight={ "calc(100dvh - 4rem)" }
      className="grid grid-cols-1 gap-6 px-6 py-8"
    >
      <header className="flex flex-col gap-2">
        <SkeletonBlock className="h-6 w-1/4" />
        <SkeletonBlock className="h-8 w-2/5" />
      </header>
      <div className="flex flex-col gap-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex flex-col gap-2 p-4 bg-slate-800/40 rounded-lg">
            <div className="flex items-center justify-between">
              <SkeletonBlock className="h-6 w-1/3" />
              <SkeletonBlock className="h-5 w-24 rounded" />
            </div>
            <SkeletonLine className="w-1/2" />
            <SkeletonLine className="w-3/4" />
            <div className="flex gap-2">
              <SkeletonBlock className="h-4 w-20 rounded" />
              <SkeletonBlock className="h-4 w-20 rounded" />
              <SkeletonBlock className="h-4 w-20 rounded" />
            </div>
          </div>
        ))}
      </div>
    </PageLoadingShell>
  );
}
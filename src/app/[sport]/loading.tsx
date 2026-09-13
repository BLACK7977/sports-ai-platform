import { PageLoadingShell } from "@/components/skeletons/page-loading-shell";
import { SkeletonBlock } from "@/components/skeletons/skeleton-block";
import { SkeletonLine } from "@/components/skeletons/skeleton-line";

export default function Loading() {
  return (
    <PageLoadingShell
      width={ "min(90%, 1200px)" }
      minHeight={ "calc(100dvh - 4rem)" }
      className="grid grid-cols-1 gap-8 px-6 py-12"
    >
      <header className="flex flex-col gap-2">
        <SkeletonBlock className="h-6 w-1/4" />
        <SkeletonBlock className="h-10 w-2/5" />
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex flex-col gap-2 p-4 bg-slate-800/40 rounded-lg">
            <SkeletonBlock className="h-6 w-1/3" />
            <SkeletonLine className="w-1/2" />
            <SkeletonLine className="w-3/4" />
          </div>
        ))}
      </div>
    </PageLoadingShell>
  );
}
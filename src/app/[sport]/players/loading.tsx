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
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-3 bg-slate-800/40 rounded-lg">
            <SkeletonBlock className="h-10 w-10 rounded-full" />
            <div className="flex-1 flex flex-col gap-1">
              <SkeletonLine className="w-1/3" />
              <SkeletonLine className="w-1/4" />
            </div>
          </div>
        ))}
      </div>
    </PageLoadingShell>
  );
}
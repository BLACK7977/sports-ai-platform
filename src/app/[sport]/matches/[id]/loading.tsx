import { PageLoadingShell } from "@/components/skeletons/page-loading-shell";
import { SkeletonBlock } from "@/components/skeletons/skeleton-block";
import { SkeletonLine } from "@/components/skeletons/skeleton-line";

export default function Loading() {
  return (
    <PageLoadingShell
      width={ "min(90%, 1400px)" }
      minHeight={ "calc(100dvh - 4rem)" }
      className="grid grid-cols-1 gap-6 px-6 py-8"
    >
      <header className="flex flex-wrap items-center justify-between gap-4">
        <SkeletonBlock className="h-6 w-2/5" />
        <SkeletonBlock className="h-6 w-1/3" />
      </header>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="flex flex-col gap-2 p-4 bg-slate-800/40 rounded-lg">
            <SkeletonBlock className="h-6 w-1/3" />
            <SkeletonBlock className="h-4 w-full" />
          </div>
          <div className="flex flex-col gap-2 p-4 bg-slate-800/40 rounded-lg">
            <SkeletonBlock className="h-4 w-full" />
            <SkeletonBlock className="h-4 w-full" />
          </div>
          <div className="flex flex-col gap-2 p-4 bg-slate-800/40 rounded-lg">
            <SkeletonBlock className="h-4 w-full" />
            <SkeletonBlock className="h-4 w-full" />
            <SkeletonBlock className="h-4 w-full" />
          </div>
        </div>
        <aside className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 p-4 bg-slate-800/40 rounded-lg">
            <SkeletonBlock className="h-6 w-1/3" />
            <SkeletonBlock className="h-4 w-full" />
            <SkeletonBlock className="h-4 w-full" />
          </div>
          <div className="flex flex-col gap-2 p-4 bg-slate-800/40 rounded-lg">
            <SkeletonBlock className="h-6 w-1/3" />
            <SkeletonBlock className="h-4 w-full" />
            <SkeletonBlock className="h-4 w-full" />
          </div>
        </aside>
      </div>
    </PageLoadingShell>
  );
}
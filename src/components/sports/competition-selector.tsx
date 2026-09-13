"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { selectCompetitionAction } from "@/app/actions/competition-selection";
import type { CompetitionCandidate, ActiveCompetition } from "@/lib/db/repositories/active-competition-repo";

type Props = {
  sportId: string;
  active: ActiveCompetition | null;
  candidates: CompetitionCandidate[];
};

export function CompetitionSelector({ sportId, active, candidates }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <details className="relative shrink-0">
      <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-lg border border-slate-700/80 bg-slate-950/40 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:border-cyan-400/70 hover:text-cyan-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 [&::-webkit-details-marker]:hidden">
        <span className="text-cyan-300">◌</span>
        Competiciones
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-cyan-400/25 bg-slate-950/95 p-2 shadow-2xl shadow-slate-950/70 backdrop-blur">
        <div className="border-b border-slate-800 px-3 py-2 text-xs text-slate-400">
          Elegí la liga y temporada que querés consultar.
        </div>
        <div className="max-h-80 overflow-y-auto py-1">
          {candidates.map(({ league, seasons }) => {
            const season = seasons.find((entry) => entry.is_current) ?? seasons[0];
            if (!season) return null;
            const selected = active?.league.id === league.id && active.season.id === season.id;
            const provider = league.provider ?? season.provider;
            return (
              <form
                key={`${league.id}-${season.id}`}
                action={(formData) =>
                  startTransition(async () => {
                    await selectCompetitionAction(formData);
                    router.refresh();
                  })
                }
              >
                <input type="hidden" name="sportId" value={sportId} />
                <input type="hidden" name="leagueId" value={league.id} />
                <input type="hidden" name="seasonId" value={season.id} />
                <button
                  type="submit"
                  disabled={isPending || selected}
                  className={`grid w-full grid-cols-[1fr_auto] gap-x-3 rounded-lg px-3 py-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-cyan-300 ${
                    selected
                      ? "cursor-default bg-cyan-400/10 text-cyan-100"
                      : "text-slate-200 hover:bg-slate-800/90"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{league.name}</span>
                    <span className="mt-0.5 block text-xs text-slate-400">
                      {league.country || "País no informado"} · {season.name}
                    </span>
                  </span>
                  <span className="self-center text-right text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    {selected ? "Activa" : provider ?? "Interna"}
                  </span>
                </button>
              </form>
            );
          })}
        </div>
      </div>
    </details>
  );
}

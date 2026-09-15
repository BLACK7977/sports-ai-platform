"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
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
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [leagueId, setLeagueId] = useState(active?.league.id ?? candidates[0]?.league.id ?? "");
  const selectedCandidate = useMemo(
    () => candidates.find((candidate) => candidate.league.id === leagueId) ?? candidates[0],
    [candidates, leagueId],
  );
  const [seasonId, setSeasonId] = useState(active?.season.id ?? selectedCandidate?.seasons[0]?.id ?? "");
  const hasMultipleSeasons = (selectedCandidate?.seasons.length ?? 0) > 1;

  useEffect(() => {
    const openFromHash = () => {
      if (window.location.hash !== "#competition-selector") return;
      detailsRef.current?.setAttribute("open", "");
      detailsRef.current?.querySelector("summary")?.focus();
    };
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, []);

  const updateLeague = (nextLeagueId: string) => {
    setLeagueId(nextLeagueId);
    const next = candidates.find((candidate) => candidate.league.id === nextLeagueId);
    setSeasonId(next?.seasons.find((season) => season.is_current)?.id ?? next?.seasons[0]?.id ?? "");
  };

  const provider = selectedCandidate?.league.provider ?? selectedCandidate?.seasons.find((season) => season.id === seasonId)?.provider;
  const isActive = active?.league.id === leagueId && active.season.id === seasonId;

  return (
    <details id="competition-selector" ref={detailsRef} className="relative shrink-0 scroll-mt-24">
      <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-lg border border-slate-700/80 bg-slate-950/40 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:border-cyan-400/70 hover:text-cyan-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 [&::-webkit-details-marker]:hidden">
        <span className="text-cyan-300">◌</span>
        Competición y temporada
      </summary>
      <div className="absolute bottom-full right-0 z-30 mb-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-cyan-400/25 bg-slate-950/95 p-3 shadow-2xl shadow-slate-950/70">
        <p className="border-b border-slate-800 pb-3 text-xs text-slate-400">Elegí una competición y la temporada con equipos y partidos disponibles.</p>
        {candidates.length === 0 ? <p className="py-4 text-sm text-slate-400">No hay competiciones disponibles todavía.</p> : <form className="space-y-3 pt-3" action={(formData) => startTransition(async () => { await selectCompetitionAction(formData); router.refresh(); })}>
          <input type="hidden" name="sportId" value={sportId} />
          <input type="hidden" name="leagueId" value={leagueId} />
          <input type="hidden" name="seasonId" value={seasonId} />
          <label className="grid gap-1.5 text-xs font-medium text-slate-300">Competición
            <select value={leagueId} onChange={(event) => updateLeague(event.target.value)} className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/30">
              {candidates.map(({ league }) => <option key={league.id} value={league.id}>{league.name} · {league.country || "País no informado"}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5 text-xs font-medium text-slate-300">Temporada
            <select value={seasonId} onChange={(event) => setSeasonId(event.target.value)} disabled={!hasMultipleSeasons} className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/30 disabled:cursor-not-allowed disabled:opacity-70">
              {selectedCandidate?.seasons.map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}
            </select>
          </label>
          <div className="flex items-center justify-between gap-3 text-xs text-slate-400"><span>{provider ? `Fuente: ${provider}` : "Fuente interna"}</span>{isActive ? <span className="text-cyan-200">Activa</span> : null}</div>
          <button type="submit" disabled={isPending || !leagueId || !seasonId || isActive} className="inline-flex w-full items-center justify-center rounded-md bg-cyan-300 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:opacity-60">{isPending ? "Actualizando…" : "Aplicar selección"}</button>
        </form>}
      </div>
    </details>
  );
}

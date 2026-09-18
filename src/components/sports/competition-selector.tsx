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

  const closeSelector = () => {
    const initialLeagueId = active?.league.id ?? candidates[0]?.league.id ?? "";
    const initialCandidate = candidates.find((candidate) => candidate.league.id === initialLeagueId);
    setLeagueId(initialLeagueId);
    setSeasonId(active?.season.id ?? initialCandidate?.seasons[0]?.id ?? "");
    if (detailsRef.current) detailsRef.current.open = false;
    if (window.location.hash === "#competition-selector") {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  };

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

  const isActive = active?.league.id === leagueId && active.season.id === seasonId;

  return (
    <details id="competition-selector" ref={detailsRef} className="comp-selector" onKeyDown={(event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeSelector();
        detailsRef.current?.querySelector("summary")?.focus();
      }
    }}>
      <summary className="comp-selector-trigger">
        <svg className="comp-selector-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v8M8 12h8" />
        </svg>
        Competición y temporada
      </summary>
      <div className="comp-selector-panel">
        <div className="comp-selector-panel-head">
          <p className="comp-selector-hint">Elegí una competición y la temporada con equipos y partidos disponibles.</p>
          <button type="button" className="comp-selector-close" onClick={closeSelector} aria-label="Cerrar selector de competición">Cerrar ×</button>
        </div>
        {candidates.length === 0 ? (
          <p className="comp-selector-empty">No hay competiciones disponibles todavía.</p>
        ) : (
          <form
            className="comp-selector-form"
            action={(formData) =>
              startTransition(async () => {
                await selectCompetitionAction(formData);
                router.refresh();
              })
            }
          >
            <input type="hidden" name="sportId" value={sportId} />
            <input type="hidden" name="leagueId" value={leagueId} />
            <input type="hidden" name="seasonId" value={seasonId} />
            <label className="comp-selector-field">
              Competición
              <select
                value={leagueId}
                onChange={(event) => updateLeague(event.target.value)}
                className="comp-selector-select"
              >
                {candidates.map(({ league }) => (
                  <option key={league.id} value={league.id}>
                    {league.name} · {league.country || "País no informado"}
                  </option>
                ))}
              </select>
            </label>
            <label className="comp-selector-field">
              Temporada
              <select
                value={seasonId}
                onChange={(event) => setSeasonId(event.target.value)}
                disabled={!hasMultipleSeasons}
                className="comp-selector-select"
              >
                {selectedCandidate?.seasons.map((season) => (
                  <option key={season.id} value={season.id}>
                    {season.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="comp-selector-footer">
              <span className="comp-selector-status">
                {isActive ? "Seleccionada" : ""}
              </span>
              <button type="button" className="comp-selector-cancel" onClick={closeSelector}>Cancelar</button>
              <button
                type="submit"
                disabled={isPending || !leagueId || !seasonId || isActive}
                className="comp-selector-apply"
              >
                {isPending ? "Actualizando…" : "Aplicar selección"}
              </button>
            </div>
          </form>
        )}
      </div>
    </details>
  );
}

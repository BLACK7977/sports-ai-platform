"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { actionGenerateProbableLineup } from "@/app/[sport]/matches/[id]/actions";
import type { ProbableLineupTeamView } from "@/lib/types/probable-lineup";
import type { SportId } from "@/types/core/sport";
import { TacticalPitch, type TacticalPitchPlayer } from "./tactical-pitch";

function coverPercent(coverage: number): number {
  return Math.round(coverage * 100);
}

function toPitchPlayer(team: ProbableLineupTeamView): TacticalPitchPlayer[] {
  return team.players.map((player, index) => ({
    id: player.playerId ?? `prob-${team.teamId}-${index}-${player.deterministicOrder}`,
    fullName: player.playerName,
    jerseyNumber: null,
    positionName: null,
    formationField: player.formationField,
  })).filter((player) => Boolean(player.formationField));
}

/**
 * Probable lineup panel. Precedence is decided server-side (official →
 * probable → CTA). In CTA mode the user is invited to generate the probable
 * lineup on demand for both teams; the canonical runs are persisted server
 * side and shown here after generation.
 */
export function ProbableLineupPanel({ sportId, matchId, homeTeamId, homeTeamName, awayTeamId, awayTeamName, mode, initialTeams }: {
  sportId: SportId;
  matchId: string;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  mode: "cta" | "probable";
  initialTeams: ProbableLineupTeamView[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [teams, setTeams] = useState<ProbableLineupTeamView[]>(initialTeams);
  const [available, setAvailable] = useState(mode === "probable");
  const [error, setError] = useState<string | null>(null);
  const [activeTeamId, setActiveTeamId] = useState<string>(initialTeams[0]?.teamId ?? "");

  const generate = () => {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await actionGenerateProbableLineup(sportId, matchId);
      if (result.ok) {
        setTeams(result.teams);
        setAvailable(true);
        if (!result.teams.some((t) => t.teamId === activeTeamId)) {
          setActiveTeamId(result.teams[0]?.teamId ?? "");
        }
        router.refresh();
      } else {
        setError(result.error);
        if (result.code === "UNAVAILABLE") {
          // Re-render: official lineup may have been published meanwhile.
          router.refresh();
        }
      }
    });
  };

  if (!available) {
    return (
      <section className="probable-lineup-cta" aria-label="Predicción de alineación probable">
        <p className="probable-lineup-cta-title">¿Cuándo se publican las alineaciones?</p>
        <p className="probable-lineup-cta-text">
          Aún no hay alineación oficial para este partido. Podés ver la alineación más probable de ambos equipos, generada automáticamente por SPORTS AI a partir de alineaciones oficiales y formaciones recientes.
        </p>
        <button className="probable-lineup-cta-button" type="button" onClick={generate} disabled={pending}>
          {pending ? "Generando alineación…" : "Predecir alineación"}
        </button>
        {error ? <p className="probable-lineup-error" role="alert">{error}</p> : null}
        <p className="probable-lineup-disclaimer">Esta alineación es una estimación y puede variar respecto de la alineación oficial.</p>
      </section>
    );
  }

  const orderedTeams = [...teams].sort((a, b) => {
    const homeRank = (t: ProbableLineupTeamView) => (t.teamId === homeTeamId ? 0 : t.teamId === awayTeamId ? 1 : 2);
    return homeRank(a) - homeRank(b);
  });
  const active = orderedTeams.find((t) => t.teamId === activeTeamId) ?? orderedTeams[0] ?? null;
  if (!active) return null;

  const teamLabel = active.teamId === homeTeamId ? homeTeamName : active.teamId === awayTeamId ? awayTeamName : active.teamId;
  const players = toPitchPlayer(active);

  return (
    <section className="probable-lineup" aria-label={`Alineación probable de ${teamLabel}`}>
      <header className="probable-lineup-header">
        <p className="probable-lineup-kicker">ALINEACIÓN PROBABLE · SPORTS AI</p>
        <p className="probable-lineup-meta">Formación estimada: <strong>{active.formation || "—"}</strong></p>
        <p className="probable-lineup-meta">Cobertura de evidencia: <strong>{coverPercent(active.coverage)}%</strong></p>
        <p className="probable-lineup-source">Generada a partir de alineaciones y formaciones recientes.</p>
      </header>
      <div className="probable-lineup-teams" role="tablist" aria-label="Equipos">
        {orderedTeams.map((t) => (
          <button
            className={`probable-lineup-team-toggle${t.teamId === active.teamId ? " probable-lineup-team-toggle-active" : ""}`}
            type="button"
            key={t.teamId}
            role="tab"
            aria-selected={t.teamId === active.teamId}
            onClick={() => setActiveTeamId(t.teamId)}
          >
            {t.teamId === homeTeamId ? homeTeamName : t.teamId === awayTeamId ? awayTeamName : t.teamId}
          </button>
        ))}
      </div>
      <TacticalPitch teamName={teamLabel} formation={active.formation} players={players} />
      <p className="probable-lineup-disclaimer">Esta alineación es una estimación generada por SPORTS AI y puede variar respecto de la alineación oficial.</p>
    </section>
  );
}

export default ProbableLineupPanel;
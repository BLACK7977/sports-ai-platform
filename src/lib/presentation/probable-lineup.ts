import type {
  ProbableLineupPlayer,
  ProbableLineupRun,
} from "@/types/db/tables";
import type {
  ProbableLineupPlayerView,
  ProbableLineupTeamView,
} from "@/lib/types/probable-lineup";

/** Official lineup exists → it takes UI precedence over everything. */
export type LineupPrecedence =
  | "official"
  | "probable"
  | "cta"
  | "unavailable";

export function lineupUIPrecedence(options: {
  hasOfficial: boolean;
  hasCanonicalProbable: boolean;
  isFutureScheduled: boolean;
}): LineupPrecedence {
  if (options.hasOfficial) return "official";
  if (options.hasCanonicalProbable) return "probable";
  if (options.isFutureScheduled) return "cta";
  return "unavailable";
}

function playerView(player: ProbableLineupPlayer): ProbableLineupPlayerView {
  return {
    formationField: player.formation_field,
    playerId: player.player_id,
    playerName: player.player_name,
    evidenceScore: Number(player.evidence_score),
    deterministicOrder: player.deterministic_order,
  };
}

/** Server-side only helper: snake rows → client-safe view payload. */
export function probableLineupViews(
  runs: ProbableLineupRun[],
  players: ProbableLineupPlayer[],
): ProbableLineupTeamView[] {
  const byRun = new Map<string, ProbableLineupPlayerView[]>();
  for (const player of players) {
    const list = byRun.get(player.run_id) ?? [];
    list.push(playerView(player));
    byRun.set(player.run_id, list);
  }
  return runs
    .filter((run) => run.status === "AVAILABLE")
    .map((run) => ({
      teamId: run.team_id,
      formation: run.formation,
      coverage: Number(run.evidence_coverage) / 100,
      generatedAt: run.generated_at,
      players: (byRun.get(run.id) ?? []).sort((a, b) => a.deterministicOrder - b.deterministicOrder),
    }))
    .filter((view) => view.players.length > 0);
}
/**
 * Shared DTOs for probable-lineup rendering (safe for client components).
 * No server-only imports, no secret material. Public UI never receives
 * internal model identifiers: only what SPORTS AI denotes as "probable".
 */

export interface ProbableLineupPlayerView {
  /** Slot identifier ("depth:lane") derived from historical observations. */
  formationField: string;
  playerId: string | null;
  playerName: string;
  /** Recency-weighted evidence for this exact slot (0..1). Not confidence. */
  evidenceScore: number;
  /** Deterministic display order within the run (1..n). */
  deterministicOrder: number;
}

export interface ProbableLineupTeamView {
  teamId: string;
  formation: string;
  /** Filled slots / 11 (0..1). Mathematical evidence coverage. */
  coverage: number;
  generatedAt: string;
  players: ProbableLineupPlayerView[];
}
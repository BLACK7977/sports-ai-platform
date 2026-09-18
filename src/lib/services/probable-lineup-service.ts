/**
 * SPORTS AI — probable lineup service (V0).
 *
 * Server-only. No Sportmonks, no OpenAI, no external APIs. Deterministic
 * model over persisted official starting XIs.
 *
 * Canonical/immutable rules:
 *  - One probable lineup per (match, team, model_version): UNIQUE index in
 *    migration 012 is the real guarantee; the production store re-reads on a
 *    unique violation and reuses the winning row (created:false).
 *  - Never regenerates, never overwrites, never DELETE/UPDATE.
 *  - Never writes to match_lineups (official storage stays clean).
 *  - Official lineup present → OFFICIAL_PRESENT (UI must suppress the CTA
 *    and prefer ALINEACIÓN OFICIAL).
 *  - Insufficient evidence for either team → NOT_AVAILABLE, zero writes.
 */

import "server-only";
import {
  computeProbableLineupForTeam,
  MAX_EVIDENCE_XIS,
  type ProbableLineupEvidenceXI,
} from "@/lib/ai/probable-lineup-model";
import type {
  ProbableLineupTeamView,
} from "@/lib/types/probable-lineup";

export const DEFAULT_PROBABLE_LINEUP_MODEL_VERSION = "v1-probable-xi-2026-09";

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export interface ProbableLineupMatchRef {
  id: string;
  home_team_id: string;
  away_team_id: string;
  match_date: string;
  status: string;
}

export interface StoredProbablePlayer {
  id: string;
  playerId: string | null;
  playerName: string;
  formationField: string;
  /** 0..100, two decimals. Evidence, NOT confidence. */
  evidenceScore: number;
  deterministicOrder: number;
}

export interface StoredProbableLineup {
  id: string;
  matchId: string;
  teamId: string;
  modelVersion: string;
  generatedAt: string;
  inputCutoffAt: string;
  formation: string;
  /** 0..100, two decimals. Filled slots / 11. */
  evidenceCoverage: number;
  status: "AVAILABLE" | "NOT_AVAILABLE" | "FAILED";
  players: StoredProbablePlayer[];
}

export interface ProbableLineupPlayerInsert {
  playerId: string | null;
  playerName: string;
  formationField: string;
  /** 0..100. */
  evidenceScore: number;
  deterministicOrder: number;
}

export interface ProbableLineupRunInsert {
  matchId: string;
  teamId: string;
  modelVersion: string;
  inputCutoffAt: string;
  formation: string;
  /** 0..100. */
  evidenceCoverage: number;
  status: "AVAILABLE";
  players: ProbableLineupPlayerInsert[];
}

export interface ProbableLineupStore {
  getMatchById(matchId: string): Promise<ProbableLineupMatchRef | null>;
  hasOfficialLineups(matchId: string): Promise<boolean>;
  findExistingRun(
    matchId: string,
    teamId: string,
    modelVersion: string,
  ): Promise<StoredProbableLineup | null>;
  listExistingRuns(matchId: string): Promise<StoredProbableLineup[]>;
  /** Only finished matches with official starters, strictly before cutoff. */
  loadTeamLineupEvidence(
    teamId: string,
    cutoffAt: string,
    maxXis: number,
  ): Promise<ProbableLineupEvidenceXI[]>;
  insertRun(run: ProbableLineupRunInsert): Promise<{
    lineup: StoredProbableLineup;
    created: boolean;
  }>;
}

export interface ProbableLineupServiceDeps {
  store: ProbableLineupStore;
  /** Inyectable para tests. Default: Date.now. */
  nowMs?: () => number;
}

export interface GenerateProbableLineupResult {
  teams: StoredProbableLineup[];
  created: boolean;
}

// --------------------------------------------------------------------------
// Errors (mensajes sanitizados: solo IDs y motivos, sin secretos)
// --------------------------------------------------------------------------

export class ProbableLineupServiceError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ProbableLineupServiceError";
    this.code = code;
  }
}

export const ProbableLineupErrorCodes = {
  MATCH_NOT_FOUND: "MATCH_NOT_FOUND",
  MATCH_INVALID: "MATCH_INVALID",
  MATCH_NOT_SCHEDULED: "MATCH_NOT_SCHEDULED",
  KICKOFF_PASSED: "KICKOFF_PASSED",
  OFFICIAL_PRESENT: "OFFICIAL_PRESENT",
  INSUFFICIENT_EVIDENCE: "INSUFFICIENT_EVIDENCE",
  INVALID_RUN: "INVALID_RUN",
} as const;

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function toPercent(value: number): number {
  return Math.round(value * 100 * 100) / 100;
}

/** Stored run → client-safe public view (no internal model identifiers). */
export function storedProbableLineupView(run: StoredProbableLineup): ProbableLineupTeamView {
  return {
    teamId: run.teamId,
    formation: run.formation,
    coverage: run.evidenceCoverage / 100,
    generatedAt: run.generatedAt,
    players: run.players.map((player, index) => ({
      formationField: player.formationField,
      playerId: player.playerId,
      playerName: player.playerName,
      evidenceScore: player.evidenceScore / 100,
      deterministicOrder: player.deterministicOrder || index + 1,
    })),
  };
}

/**
 * Defense in depth: the store contract guarantees strictly-before-cutoff
 * evidence; this re-applies the strict cutoff so a future lineup can never
 * leak into the model.
 */
function applyStrictCutoff(
  xis: ProbableLineupEvidenceXI[],
  cutoffMs: number,
): ProbableLineupEvidenceXI[] {
  return xis.filter((xi) => {
    const km = Date.parse(xi.kickoffAt);
    return Number.isFinite(km) && km < cutoffMs;
  });
}

// --------------------------------------------------------------------------
// Service
// --------------------------------------------------------------------------

export async function generateProbableLineups(
  deps: ProbableLineupServiceDeps,
  input: { matchId: string; modelVersion?: string; nowMs?: number },
): Promise<GenerateProbableLineupResult> {
  const modelVersion = input.modelVersion ?? DEFAULT_PROBABLE_LINEUP_MODEL_VERSION;
  const nowMs = input.nowMs ?? (deps.nowMs ?? Date.now)();

  const match = await deps.store.getMatchById(input.matchId);
  if (!match) {
    throw new ProbableLineupServiceError(
      ProbableLineupErrorCodes.MATCH_NOT_FOUND,
      "Partido no encontrado",
    );
  }
  const kickoffMs = Date.parse(match.match_date);
  if (!Number.isFinite(kickoffMs)) {
    throw new ProbableLineupServiceError(
      ProbableLineupErrorCodes.MATCH_INVALID,
      "Fecha del partido inválida",
    );
  }
  if (match.status !== "scheduled") {
    throw new ProbableLineupServiceError(
      ProbableLineupErrorCodes.MATCH_NOT_SCHEDULED,
      "El partido no está programado",
    );
  }
  if (!(nowMs < kickoffMs)) {
    throw new ProbableLineupServiceError(
      ProbableLineupErrorCodes.KICKOFF_PASSED,
      "El partido ya inició; no se puede predecir la alineación",
    );
  }
  const officialPresent = await deps.store.hasOfficialLineups(match.id);
  if (officialPresent) {
    throw new ProbableLineupServiceError(
      ProbableLineupErrorCodes.OFFICIAL_PRESENT,
      "Ya existe la alineación oficial",
    );
  }

  // Canonical reuse: existing runs for this match are returned as-is.
  const existing = await deps.store.listExistingRuns(match.id);
  if (existing.length > 0) {
    return { teams: existing, created: false };
  }

  const cutoffIso = new Date(nowMs).toISOString();
  const teams: StoredProbableLineup[] = [];
  let anyCreated = false;

  for (const teamId of [match.home_team_id, match.away_team_id]) {
    const evidence = applyStrictCutoff(
      await deps.store.loadTeamLineupEvidence(teamId, cutoffIso, MAX_EVIDENCE_XIS),
      nowMs,
    );
    const computed = computeProbableLineupForTeam(evidence);
    if (!computed) {
      throw new ProbableLineupServiceError(
        ProbableLineupErrorCodes.INSUFFICIENT_EVIDENCE,
        `Evidencia insuficiente para el equipo ${teamId}: sin alineaciones oficiales recientes antes del corte`,
      );
    }
    const players = computed.slots.map((slot, index) => ({
      playerId: slot.playerId,
      playerName: slot.playerName ?? "Jugador no identificado",
      formationField: slot.formationField,
      evidenceScore: toPercent(Math.min(1, slot.evidenceScore)),
      deterministicOrder: index + 1,
    }));
    const payload: ProbableLineupRunInsert = {
      matchId: match.id,
      teamId,
      modelVersion,
      inputCutoffAt: cutoffIso,
      formation: computed.formation,
      evidenceCoverage: toPercent(computed.evidenceCoverage),
      status: "AVAILABLE",
      players,
    };
    const result = await deps.store.insertRun(payload);
    teams.push(result.lineup);
    if (result.created) anyCreated = true;
  }

  return { teams, created: anyCreated };
}
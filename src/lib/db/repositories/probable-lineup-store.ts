import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEnv, getSupabaseProjectUrl } from "@/lib/config/env";
import type {
  ProbableLineupMatchRef,
  ProbableLineupPlayerInsert,
  ProbableLineupRunInsert,
  ProbableLineupStore,
  StoredProbableLineup,
  StoredProbablePlayer,
} from "@/lib/services/probable-lineup-service";
import type { ProbableLineupEvidenceXI } from "@/lib/ai/probable-lineup-model";
import type { ProbableStarter } from "@/lib/ai/probable-lineup-model";

const MIN_USABLE_XI_STARTERS = 6;
const MATCH_PAGE_SIZE = 12;

function client(): SupabaseClient {
  const env = getEnv();
  const url = getSupabaseProjectUrl();
  if (!url) throw new Error("ProbableLineupStore: Supabase no configurado");
  return createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

function runId(matchId: string, teamId: string): string {
  return `plr-${matchId}-${teamId}`.replace(/[:/]/g, "_");
}

function playerId(runId: string, order: number): string {
  return `plp-${runId}-${order}`.replace(/[:/]/g, "_");
}

function toStoredPlayer(row: Record<string, unknown>): StoredProbablePlayer {
  return {
    id: String(row.id),
    playerId: (row.player_id as string | null) ?? null,
    playerName: String(row.player_name ?? ""),
    formationField: String(row.formation_field ?? ""),
    evidenceScore: Number(row.evidence_score ?? 0),
    deterministicOrder: Number(row.deterministic_order ?? 1),
  };
}

export function createProductionProbableLineupStore(
  sb: SupabaseClient = client(),
): ProbableLineupStore {
  const selectRunRow = async (
    filters: Record<string, string>,
  ): Promise<Record<string, unknown> | null> => {
    let query = sb.from("probable_lineup_runs").select("*");
    for (const [key, value] of Object.entries(filters)) query = query.eq(key, value);
    const { data, error } = await query.limit(1).maybeSingle();
    if (error) throw new Error(`probable_lineup_runs: ${error.message}`);
    return (data as Record<string, unknown> | null) ?? null;
  };

  const loadPlayers = async (runId: string): Promise<StoredProbablePlayer[]> => {
    const { data, error } = await sb
      .from("probable_lineup_players")
      .select("*")
      .eq("run_id", runId)
      .order("deterministic_order", { ascending: true });
    if (error) throw new Error(`probable_lineup_players: ${error.message}`);
    return (data ?? []).map((row) => toStoredPlayer(row as Record<string, unknown>));
  };

  const toStored = (runRow: Record<string, unknown>, players: StoredProbablePlayer[]): StoredProbableLineup => ({
    id: String(runRow.id),
    matchId: String(runRow.match_id),
    teamId: String(runRow.team_id),
    modelVersion: String(runRow.model_version),
    generatedAt: String(runRow.generated_at ?? ""),
    inputCutoffAt: String(runRow.input_cutoff_at ?? ""),
    formation: String(runRow.formation ?? ""),
    evidenceCoverage: Number(runRow.evidence_coverage ?? 0),
    status: (runRow.status === "NOT_AVAILABLE" || runRow.status === "FAILED"
      ? runRow.status
      : "AVAILABLE") as StoredProbableLineup["status"],
    players,
  });

  return {
    getMatchById: async (matchId) => {
      const { data, error } = await sb.from("matches").select("*").eq("id", matchId).maybeSingle();
      if (error) throw new Error(`matches: ${error.message}`);
      if (!data) return null;
      return data as unknown as ProbableLineupMatchRef;
    },
    hasOfficialLineups: async (matchId) => {
      const { data, error } = await sb
        .from("match_lineups")
        .select("id")
        .eq("match_id", matchId)
        .limit(1);
      if (error) throw new Error(`match_lineups: ${error.message}`);
      return (data?.length ?? 0) > 0;
    },
    findExistingRun: async (matchId, teamId, modelVersion) => {
      const runRow = await selectRunRow({ match_id: matchId, team_id: teamId, model_version: modelVersion });
      if (!runRow) return null;
      return toStored(runRow, await loadPlayers(String(runRow.id)));
    },
    listExistingRuns: async (matchId) => {
      const { data, error } = await sb
        .from("probable_lineup_runs")
        .select("*")
        .eq("match_id", matchId)
        .order("generated_at", { ascending: true });
      if (error) throw new Error(`probable_lineup_runs: ${error.message}`);
      const runs: StoredProbableLineup[] = [];
      for (const row of data ?? []) {
        runs.push(toStored(row as Record<string, unknown>, await loadPlayers(String((row as Record<string, unknown>).id))));
      }
      return runs;
    },
    loadTeamLineupEvidence: async (teamId, cutoffAt, maxXis) => {
      const { data: matches, error: matchError } = await sb
        .from("matches")
        .select("id, match_date")
        .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
        .eq("status", "finished")
        .lt("match_date", cutoffAt)
        .order("match_date", { ascending: true })
        .limit(MATCH_PAGE_SIZE);
      if (matchError) throw new Error(`matches: ${matchError.message}`);

      const xis: ProbableLineupEvidenceXI[] = [];
      for (const matchRow of matches ?? []) {
        const m = matchRow as { id: string; match_date: string };
        const { data: rows, error } = await sb
          .from("match_lineups")
          .select("*")
          .eq("match_id", m.id)
          .eq("team_id", teamId)
          .eq("is_starter", true);
        if (error) throw new Error(`match_lineups: ${error.message}`);
        const starters: ProbableStarter[] = [];
        for (const row of rows ?? []) {
          const r = row as Record<string, unknown>;
          const formationField = r.formation_field;
          if (typeof formationField !== "string" || !formationField.trim()) continue;
          const playerName = typeof r.player_name === "string" ? r.player_name : null;
          const playerId = typeof r.player_id === "string" ? r.player_id : null;
          if (playerName || playerId) {
            starters.push({
              playerId,
              playerName,
              formationField: formationField.trim(),
            });
          }
        }
        if (starters.length >= MIN_USABLE_XI_STARTERS) {
          xis.push({ matchId: m.id, kickoffAt: m.match_date, starters });
        }
      }
      // Matches are iterated oldest → newest, so xis are already kickoff-asc;
      // keep only the most recent usable XIs.
      return xis.slice(-maxXis);
    },
    insertRun: async (run: ProbableLineupRunInsert) => {
      const id = runId(run.matchId, run.teamId);
      const runPayload = {
        id,
        match_id: run.matchId,
        team_id: run.teamId,
        model_version: run.modelVersion,
        input_cutoff_at: run.inputCutoffAt,
        formation: run.formation,
        evidence_coverage: run.evidenceCoverage,
        status: run.status,
      };
      let runRow: Record<string, unknown> | null = null;
      try {
        const { data, error } = await sb.from("probable_lineup_runs").insert(runPayload).select("*").single();
        if (error) throw new Error(`probable_lineup_runs insert: ${error.message}`);
        runRow = data as Record<string, unknown>;
      } catch (insertErr) {
        // Concurrent race: UNIQUE(match_id, team_id, model_version) decided.
        const raced = await selectRunRow({
          match_id: run.matchId,
          team_id: run.teamId,
          model_version: run.modelVersion,
        });
        if (raced) return { lineup: toStored(raced, await loadPlayers(String(raced.id))), created: false };
        throw insertErr;
      }

      const playerRows = run.players.map((player: ProbableLineupPlayerInsert, index) => ({
        id: playerId(id, index + 1),
        run_id: id,
        player_id: player.playerId,
        player_name: player.playerName,
        formation_field: player.formationField,
        evidence_score: player.evidenceScore,
        deterministic_order: player.deterministicOrder,
      }));
      const { data: insertedPlayers, error: playerError } = await sb
        .from("probable_lineup_players")
        .insert(playerRows)
        .select("*");
      if (playerError) {
        throw new Error(`probable_lineup_players insert: ${playerError.message}`);
      }
      const players = (insertedPlayers ?? []).map((row) => toStoredPlayer(row as Record<string, unknown>));
      return { lineup: toStored(runRow as Record<string, unknown>, players), created: true };
    },
  };
}
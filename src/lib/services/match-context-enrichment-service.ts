import "server-only";
import type { Match } from "@/types/db/tables";
import { SportmonksClient } from "@/sports/soccer/data-sources/sportmonks-client";
import { normalizeFixtureMatchContext } from "@/sports/soccer/data-sources/sportmonks-context-normalize";
import { persistMatchContext } from "@/lib/db/repositories/match-context-repo";

export type ContextCandidate = Pick<Match, "id" | "home_team_id" | "away_team_id" | "match_date" | "sport_specific">;
export type ContextRunResult = { matchId: string; fixtureId: number; status: "WOULD_ENRICH" | "ENRICHED" | "FAILED"; error?: string };
export type MatchContextDeps = {
  fetchFixture: (fixtureId: number) => Promise<unknown>;
  persist: typeof persistMatchContext;
  wait: (ms: number) => Promise<void>;
};

export function sportmonksFixtureId(match: ContextCandidate): number | null {
  const source = match.sport_specific && typeof match.sport_specific === "object" && !Array.isArray(match.sport_specific)
    ? (match.sport_specific as Record<string, unknown>).source : null;
  const external = source && typeof source === "object" && !Array.isArray(source)
    ? (source as Record<string, unknown>).external_id : null;
  const raw = typeof external === "string" ? external.match(/(?:match:)?(\d+)$/)?.[1] : null;
  const value = typeof external === "number" ? external : raw ? Number(raw) : NaN;
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export async function enrichMatchContexts(candidates: ContextCandidate[], options: { confirm: boolean; delayMs: number }, provided?: Partial<MatchContextDeps>): Promise<ContextRunResult[]> {
  const api = options.confirm && !provided?.fetchFixture ? new SportmonksClient() : null;
  const deps: MatchContextDeps = {
    fetchFixture: provided?.fetchFixture ?? ((id) => api!.getFixturePreparationContext(id)),
    persist: provided?.persist ?? persistMatchContext,
    wait: provided?.wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
  };
  const ordered = [...candidates].sort((a, b) => a.match_date.localeCompare(b.match_date) || a.id.localeCompare(b.id));
  const results: ContextRunResult[] = [];
  for (let index = 0; index < ordered.length; index++) {
    const match = ordered[index];
    const fixtureId = sportmonksFixtureId(match);
    if (!fixtureId) continue;
    if (!options.confirm) { results.push({ matchId: match.id, fixtureId, status: "WOULD_ENRICH" }); continue; }
    try {
      const snapshot = normalizeFixtureMatchContext(await deps.fetchFixture(fixtureId));
      await deps.persist(match.id, { home: match.home_team_id, away: match.away_team_id }, snapshot);
      results.push({ matchId: match.id, fixtureId, status: "ENRICHED" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error desconocido";
      results.push({ matchId: match.id, fixtureId, status: "FAILED", error: message });
      if (/HTTP (401|403|429)\b/.test(message)) break;
    }
    if (index < ordered.length - 1 && options.delayMs > 0) await deps.wait(options.delayMs);
  }
  return results;
}

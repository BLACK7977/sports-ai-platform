import { getSport, hasSport } from "@/lib/config/sports-registry";
import type { SportModule } from "@/types/core/sport";

export function getHasSport(
  id: string,
): { ok: true; sport: SportModule } | null {
  if (!hasSport(id)) return null;
  const s = getSport(id);
  return s ? { ok: true, sport: s } : null;
}

export function formatSeasonName(seasonId: string): string {
  if (!seasonId) return "";
  const m = /season[-_]?(\d{4})/.exec(seasonId);
  return m ? `Temporada ${m[1]}` : seasonId;
}

export function formatLeagueName(league: {
  name: string;
  country?: string;
}): string {
  if (!league) return "";
  return league.country ? `${league.name} (${league.country})` : league.name;
}

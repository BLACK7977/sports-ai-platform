/** Builds the canonical, URL-safe route for a SPORTS AI match entity. */
export function matchDetailHref(sport: string, matchId: string): string {
  return `/${encodeURIComponent(sport)}/matches/${encodeURIComponent(matchId)}`;
}

import type { SoccerCompetitionTarget, SoccerProviderRequirements } from "./provider-contract";

/**
 * Target definition only: it intentionally contains no data and no network
 * implementation. A selected provider will normalize into these stable ids.
 */
export const ARGENTINA_PRIMERA_PROFESSIONAL: SoccerCompetitionTarget = {
  leagueId: "argentina-primera-profesional",
  seasonId: "argentina-primera-profesional-2026",
  displayName: "Liga Profesional Argentina",
  country: "Argentina",
};

export const ARGENTINA_PRIMERA_IMPORT_REQUIREMENTS: SoccerProviderRequirements = {
  needsCredential: true,
  requiredEntities: ["competition", "season", "team", "player", "match", "player_match_stats"],
};

/** Initial free Sportmonks target. It coexists with, and never replaces, demo rows. */
export const DENMARK_SUPERLIGA: SoccerCompetitionTarget = {
  leagueId: "sportmonks-denmark-superliga",
  seasonId: "sportmonks-denmark-superliga-2026-2027",
  displayName: "Superliga",
  country: "Denmark",
};

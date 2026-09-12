import type { DataSource } from "@/types/core/data-source";
import type { SoccerMatchPayload } from "../types";

export interface MockSourceInput {
  leagueId?: string;
  seasonId?: string;
  limit?: number;
}

export const soccerMockSource: DataSource<MockSourceInput, SoccerMatchPayload[]> =
  {
    id: "soccer-mock",
    name: "Soccer Mock DataSource (fixtures demo)",
    async fetch(input) {
      const leagueId = input?.leagueId ?? "demo-liga-1";
      const seasonId = input?.seasonId ?? "season-2026-1";
      const limit = input?.limit ?? 5;

      const teams = [
        { id: "aguilas-fc", short: "AGU" },
        { id: "leones-united", short: "LEO" },
        { id: "dragones-cf", short: "DRA" },
        { id: "halcones-sc", short: "HAL" },
        { id: "tiburones-ac", short: "TIB" },
      ];

      const result: SoccerMatchPayload[] = [];
      let k = 0;
      outer: for (let i = 0; i < teams.length; i++) {
        for (let j = i + 1; j < teams.length; j++) {
          if (k >= limit) break outer;
          const home = teams[i];
          const away = teams[j];
          const homeScore = (k * 3) % 4;
          const awayScore = (k * 2) % 3;
          result.push({
            external_id: `mock-${leagueId}-${k}`,
            league_id: leagueId,
            season_id: seasonId,
            home_team_id: home.id,
            away_team_id: away.id,
            match_date: new Date(
              2026,
              1,
              1 + k * 3,
              19,
              0,
              0,
            ).toISOString(),
            status: "finished",
            home_score: homeScore,
            away_score: awayScore,
            specific: {
              round: k + 1,
              referee: `Mock Ref ${k + 1}`,
              attendance: 10000 + k * 1500,
              ballPossession: {
                home: 45 + ((k * 7) % 15),
                away: 40 + (((k + 2) * 5) % 15),
              },
              shots: { home: 8 + (k % 6), away: 5 + (k % 5) },
              shotsOnTarget: {
                home: 3 + ((k * 2) % 4),
                away: 2 + ((k + 1) % 3),
              },
              corners: { home: 3 + (k % 4), away: 2 + ((k + 1) % 4) },
              fouls: { home: 8 + (k % 8), away: 6 + (k % 9) },
            },
            playerStats: [],
          });
          k++;
        }
      }
      return result;
    },
  };

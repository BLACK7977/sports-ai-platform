import type { EntityMapper } from "@/types/core/data-source";
import type {
  MatchInsert,
  PlayerMatchStatsInsert,
} from "@/types/db/tables";
import type {
  SoccerMatchPayload,
  SoccerPlayerStatsSpecific,
} from "./types";
import { soccerConfig } from "./config";

const SPORT_ID = "soccer";

export interface SoccerDbRows {
  match: MatchInsert;
  playerStats: PlayerMatchStatsInsert[];
}

export const soccerMatchMapper: EntityMapper<
  SoccerMatchPayload,
  SoccerDbRows
> = {
  id: "soccer-match-mapper",
  toDb: (dto) => {
    const now = new Date().toISOString();
    const matchId = `m-${SPORT_ID}-${dto.external_id}`;
    const match: MatchInsert = {
      id: matchId,
      sport_id: SPORT_ID,
      league_id: dto.league_id,
      season_id: dto.season_id,
      home_team_id: dto.home_team_id,
      away_team_id: dto.away_team_id,
      match_date: dto.match_date,
      status: dto.status,
      home_score: dto.home_score,
      away_score: dto.away_score,
      external_id: dto.external_id,
      sport_specific: {
        duration_minutes: soccerConfig.matchDurationMinutes,
        ...(dto.specific ?? {}),
      },
      created_at: now,
      updated_at: now,
    };
    const playerStats: PlayerMatchStatsInsert[] = (dto.playerStats ?? []).map(
      (ps) => ({
        id: `s-${matchId}-${ps.player_id}`,
        match_id: matchId,
        player_id: ps.player_id,
        team_id: ps.team_id,
        minutes_played: ps.minutes_played,
        sport_specific: ps.specific,
        created_at: now,
        updated_at: now,
      }),
    );
    return { match, playerStats };
  },
  fromDb: (db) => {
    const m = db.match;
    const homeScore = m.home_score;
    const awayScore = m.away_score;
    const payload: SoccerMatchPayload = {
      external_id: m.external_id ?? m.id ?? "",
      league_id: m.league_id,
      season_id: m.season_id,
      home_team_id: m.home_team_id,
      away_team_id: m.away_team_id,
      match_date: m.match_date,
      status: m.status as SoccerMatchPayload["status"],
      home_score: homeScore,
      away_score: awayScore,
      specific: m.sport_specific as SoccerMatchPayload["specific"],
      playerStats: db.playerStats.map((ps) => ({
        player_id: ps.player_id,
        team_id: ps.team_id,
        minutes_played: ps.minutes_played,
        specific: ps.sport_specific as SoccerPlayerStatsSpecific,
      })),
    };
    return payload;
  },
};

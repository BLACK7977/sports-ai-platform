import type {
  Match as DbMatch,
  PlayerMatchStats as DbPlayerMatchStats,
} from "@/types/db/tables";
import type {
  SoccerStandingsRow as SoccerStandingsRowImpl,
  SoccerPlayerSeasonAggregate as SoccerPlayerSeasonAggregateImpl,
} from "@/sports/soccer/types";

export type Match = DbMatch;
export type PlayerMatchStats = DbPlayerMatchStats;

export type SoccerStandingsRow = SoccerStandingsRowImpl;
export type SoccerPlayerSeasonAggregate = SoccerPlayerSeasonAggregateImpl;

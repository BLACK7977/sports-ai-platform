"use client";

import { useState } from "react";
import { TacticalPitch, type TacticalPitchPlayer } from "./tactical-pitch";
import type { MatchLineup, Player, Team } from "@/types/db/tables";
import { presentSoccerPosition } from "@/lib/presentation/soccer";

type OfficialLineupTeamData = {
  team: Team;
  teamLineups: MatchLineup[];
  hasStarterStatus: boolean;
  starters: MatchLineup[];
  subs: MatchLineup[];
  unclassified: MatchLineup[];
  pitchPlayers: TacticalPitchPlayer[];
  formationLabel: string | null;
  unresolvedCount: number;
};

function buildTeamData(
  team: Team,
  formationLabel: string | null,
  enrichmentLineups: MatchLineup[],
  playerMap: Map<string, Player>
): OfficialLineupTeamData {
  const teamLineups = enrichmentLineups.filter((lineup) => lineup.team_id === team.id);
  const hasStarterStatus = teamLineups.some((lineup) => lineup.is_starter !== null && lineup.is_starter !== undefined);
  const starters = teamLineups.filter((lineup) => lineup.is_starter === true);
  const subs = teamLineups.filter((lineup) => lineup.is_starter === false);
  const unclassified = teamLineups.filter((lineup) => lineup.is_starter === null || lineup.is_starter === undefined);
  const playerName = (lineup: MatchLineup) => lineup.player_id ? playerMap.get(lineup.player_id)?.full_name ?? lineup.player_name ?? null : lineup.player_name ?? null;
  const pitchPlayers: TacticalPitchPlayer[] = starters.flatMap((lineup) => {
    const fullName = playerName(lineup);
    return fullName && lineup.formation_field ? [{
      id: lineup.id,
      fullName,
      jerseyNumber: lineup.jersey_number ?? null,
      positionName: lineup.position_name ?? null,
      formationField: lineup.formation_field,
    }] : [];
  });
  const unresolved = teamLineups.filter((lineup) => !playerName(lineup)).length;
  return { team, teamLineups, hasStarterStatus, starters, subs, unclassified, pitchPlayers, formationLabel, unresolvedCount: unresolved };
}

function renderLineupItem(
  lineup: MatchLineup,
  tone: string,
  playerMap: Map<string, Player>,
  presentSoccerPosition: (positionName: string | null | undefined) => string | null
) {
  const fullName = lineup.player_id ? playerMap.get(lineup.player_id)?.full_name ?? lineup.player_name ?? null : lineup.player_name ?? null;
  return (
    <div className={`match-lineup-player${tone}`} key={lineup.id}>
      {lineup.jersey_number != null ? <span className="match-lineup-jersey">#{lineup.jersey_number}</span> : null}
      {presentSoccerPosition(lineup.position_name) ? <span className="match-lineup-pos">{presentSoccerPosition(lineup.position_name)}</span> : null}
      {fullName ? <span className="match-lineup-name">{fullName}</span> : null}
    </div>
  );
}

export function OfficialLineupsRenderer({
  home,
  away,
  enrichment,
  homeFormationLabel,
  awayFormationLabel,
  playerMap,
}: {
  home: Team;
  away: Team;
  enrichment: { lineups: MatchLineup[] };
  homeFormationLabel: string | null;
  awayFormationLabel: string | null;
  playerMap: Map<string, Player>;
}) {
  const [activeTeamId, setActiveTeamId] = useState<string>(home.id);

  const homeData = buildTeamData(home, homeFormationLabel, enrichment.lineups, playerMap);
  const awayData = buildTeamData(away, awayFormationLabel, enrichment.lineups, playerMap);
  const activeData = activeTeamId === home.id ? homeData : awayData;
  const inactiveData = activeTeamId === home.id ? awayData : homeData;

  return (
    <div className="match-lineups-mobile">
      <div className="match-lineups-team-selector" role="tablist" aria-label="Seleccionar equipo">
        <button
          className={`match-lineups-team-tab${activeTeamId === home.id ? " match-lineups-team-tab-active" : ""}`}
          type="button"
          role="tab"
          aria-selected={activeTeamId === home.id}
          onClick={() => setActiveTeamId(home.id)}
        >
          {home.short_name} · LOCAL
        </button>
        <button
          className={`match-lineups-team-tab${activeTeamId === away.id ? " match-lineups-team-tab-active" : ""}`}
          type="button"
          role="tab"
          aria-selected={activeTeamId === away.id}
          onClick={() => setActiveTeamId(away.id)}
        >
          {away.short_name} · VISITANTE
        </button>
      </div>

      <section className="match-lineup-team" aria-labelledby={`team-${activeData.team.id}`}>
        <header id={`team-${activeData.team.id}`}><b>{activeData.team.short_name}</b><small>{activeData.hasStarterStatus ? `${activeData.starters.length} titulares · ${activeData.subs.length} suplentes${activeData.unclassified.length ? ` · ${activeData.unclassified.length} sin clasificación` : ""}` : `${activeData.teamLineups.length} jugadores registrados · titularidad no informada`}</small></header>
        {activeData.hasStarterStatus && activeData.pitchPlayers.length > 0 ? <TacticalPitch teamName={activeData.team.name} formation={activeData.formationLabel} players={activeData.pitchPlayers} /> : null}
        <div className="match-lineup-list">
          {activeData.hasStarterStatus ? <>{activeData.pitchPlayers.length < activeData.starters.length ? <div className="match-empty-state">Algunos titulares no tienen una ubicación táctica estructurada.</div> : null}{activeData.subs.length > 0 ? <div className="match-lineup-subs-header">Suplentes</div> : null}{activeData.subs.filter((lineup) => lineup.player_id ? playerMap.get(lineup.player_id)?.full_name ?? lineup.player_name ?? null : lineup.player_name ?? null).map((lineup) => renderLineupItem(lineup, " match-lineup-sub", playerMap, presentSoccerPosition))}{activeData.unclassified.length > 0 ? <><div className="match-lineup-subs-header">Sin clasificación</div>{activeData.unclassified.filter((lineup) => lineup.player_id ? playerMap.get(lineup.player_id)?.full_name ?? lineup.player_name ?? null : lineup.player_name ?? null).map((lineup) => renderLineupItem(lineup, "", playerMap, presentSoccerPosition))}</> : null}</> : activeData.teamLineups.filter((lineup) => lineup.player_id ? playerMap.get(lineup.player_id)?.full_name ?? lineup.player_name ?? null : lineup.player_name ?? null).map((lineup) => renderLineupItem(lineup, "", playerMap, presentSoccerPosition))}
          {activeData.unresolvedCount > 0 ? <div className="match-empty-state">{activeData.unresolvedCount} jugador{activeData.unresolvedCount === 1 ? "" : "es"} no pudo identificarse con la fuente.</div> : null}
        </div>
      </section>

      <div className="match-lineup-team-inactive" aria-hidden="true">
        <header><b>{inactiveData.team.short_name}</b><small>{inactiveData.hasStarterStatus ? `${inactiveData.starters.length} titulares · ${inactiveData.subs.length} suplentes${inactiveData.unclassified.length ? ` · ${inactiveData.unclassified.length} sin clasificación` : ""}` : `${inactiveData.teamLineups.length} jugadores registrados · titularidad no informada`}</small></header>
        {inactiveData.hasStarterStatus && inactiveData.pitchPlayers.length > 0 ? <div className="match-lineup-inactive-pitch"><TacticalPitch teamName={inactiveData.team.name} formation={inactiveData.formationLabel} players={inactiveData.pitchPlayers} /></div> : null}
        <div className="match-lineup-list">
          {inactiveData.hasStarterStatus ? <>{inactiveData.subs.length > 0 ? <div className="match-lineup-subs-header">Suplentes</div> : null}{inactiveData.subs.filter((lineup) => lineup.player_id ? playerMap.get(lineup.player_id)?.full_name ?? lineup.player_name ?? null : lineup.player_name ?? null).map((lineup) => renderLineupItem(lineup, " match-lineup-sub", playerMap, presentSoccerPosition))}{inactiveData.unclassified.length > 0 ? <><div className="match-lineup-subs-header">Sin clasificación</div>{inactiveData.unclassified.filter((lineup) => lineup.player_id ? playerMap.get(lineup.player_id)?.full_name ?? lineup.player_name ?? null : lineup.player_name ?? null).map((lineup) => renderLineupItem(lineup, "", playerMap, presentSoccerPosition))}</> : null}</> : inactiveData.teamLineups.filter((lineup) => lineup.player_id ? playerMap.get(lineup.player_id)?.full_name ?? lineup.player_name ?? null : lineup.player_name ?? null).map((lineup) => renderLineupItem(lineup, "", playerMap, presentSoccerPosition))}
          {inactiveData.unresolvedCount > 0 ? <div className="match-empty-state">{inactiveData.unresolvedCount} jugador{inactiveData.unresolvedCount === 1 ? "" : "es"} no pudo identificarse con la fuente.</div> : null}
        </div>
      </div>
    </div>
  );
}
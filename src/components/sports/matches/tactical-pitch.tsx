"use client";

import { useState } from "react";
import { presentSoccerPosition } from "@/lib/presentation/soccer";

export type TacticalPitchPlayer = {
  id: string;
  fullName: string;
  jerseyNumber: number | null;
  positionName: string | null;
  formationField: string;
};

type PitchCoordinate = { depth: number; lane: number };

function parseFormationField(value: string): PitchCoordinate | null {
  const match = /^(\d+):(\d+)$/.exec(value.trim());
  if (!match) return null;
  const depth = Number(match[1]);
  const lane = Number(match[2]);
  return Number.isSafeInteger(depth) && depth > 0 && Number.isSafeInteger(lane) && lane > 0
    ? { depth, lane }
    : null;
}

function shortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts.at(-1) ?? fullName;
}

/** Compact position code derived ONLY from the observed tactical depth band.
 *  Provider/internal names are never shown. Deterministic: depth 1 = keeper,
 *  depth 2 = defenders, depth 3 = midfield, deeper = attacking line. */
function positionCode(depth: number): string {
  if (depth === 1) return "POR";
  if (depth === 2) return "DF";
  if (depth === 3) return "MC";
  return "DL";
}

function lineNamePitch(depth: number): string {
  if (depth === 1) return "Portero";
  if (depth === 2) return "Defensas";
  if (depth === 3) return "Mediocampo";
  return "Delantera";
}

/**
 * A tactical view based strictly on persisted `formation_field`
 * (`line:lane`). It never derives a position from lineup order and never
 * fakes player positions.
 *
 * Field orientation: own goal at the bottom, attacking goal at the top
 * (subtle ATAQUE ↑ indicator). Goalkeeper sits near the own goal; defenders →
 * midfielders → forwards progress toward the attacking goal.
 */
export function TacticalPitch({ teamName, formation, players, attackLabel = "ATAQUE ↑" }: {
  teamName: string;
  formation: string | null;
  players: TacticalPitchPlayer[];
  attackLabel?: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<"pitch" | "list">("pitch");
  const positioned = players.flatMap((player) => {
    const coordinate = parseFormationField(player.formationField);
    return coordinate ? [{ ...player, coordinate }] : [];
  });
  const duplicateSlots = new Set<string>();
  const seenSlots = new Set<string>();
  for (const player of positioned) {
    const slot = `${player.coordinate.depth}:${player.coordinate.lane}`;
    if (seenSlots.has(slot)) duplicateSlots.add(slot);
    seenSlots.add(slot);
  }
  const maxDepth = Math.max(...positioned.map((item) => item.coordinate.depth), 1);
  const maxLaneFor = new Map<number, number>();
  for (const item of positioned) {
    maxLaneFor.set(item.coordinate.depth, Math.max(maxLaneFor.get(item.coordinate.depth) ?? 1, item.coordinate.lane));
  }
  const hasDuplicateSlots = duplicateSlots.size > 0;
  const selected = positioned.find((item) => item.id === selectedId) ?? null;
  const coordinateByPlayer = new Map<string, PitchCoordinate>();
  for (const item of positioned) coordinateByPlayer.set(item.id, item.coordinate);
  const listRows: TacticalPitchPlayer[] = hasDuplicateSlots
    ? players
    : [...positioned]
        .sort((a, b) => a.coordinate.depth - b.coordinate.depth || a.coordinate.lane - b.coordinate.lane)
        .map((item) => item);

  const markerLeft = (lane: number, lineMax: number): number =>
    lineMax === 1 ? 50 : 88 - ((lane - 1) / (lineMax - 1)) * 76;
  const markerTop = (depth: number): number =>
    maxDepth === 1 ? 50 : 90 - ((depth - 1) / (maxDepth - 1)) * 80;

  const renderMarker = (player: (typeof positioned)[number]) => {
    const isSelected = selected?.id === player.id;
    // The persisted provider data places lane 1 on the right flank and
    // increases lane numbers toward the left (right/left backs confirm it).
    const left = markerLeft(player.coordinate.lane, maxLaneFor.get(player.coordinate.depth) ?? 1);
    const top = markerTop(player.coordinate.depth);
    return (
      <button
        className={`tactical-player${isSelected ? " tactical-player-selected" : ""}`}
        key={player.id}
        type="button"
        aria-pressed={isSelected}
        aria-label={`${player.fullName}${player.jerseyNumber != null ? `, camiseta ${player.jerseyNumber}` : ""}, ${positionCode(player.coordinate.depth)}`}
        style={{ left: `${left}%`, top: `${top}%` }}
        onClick={() => setSelectedId(isSelected ? null : player.id)}
      >
        <span className="tactical-shirt">{player.jerseyNumber ?? ""}</span>
        <b className="tactical-name" title={player.fullName}>{shortName(player.fullName)}</b>
        <i className="tactical-poscode">{positionCode(player.coordinate.depth)}</i>
      </button>
    );
  };

  return (
    <section className="tactical-pitch-wrap" aria-label={`Pizarra táctica de ${teamName}`}>
      <header className="tactical-pitch-heading">
        <span className="tactical-pitch-team">{teamName}</span>
        <strong>{formation ?? "Formación no disponible"}</strong>
        <button className="tactical-view-toggle" type="button" onClick={() => setView(view === "pitch" ? "list" : "pitch")}>
          {view === "pitch" ? "Ver en lista" : "Ver en el campo"}
        </button>
      </header>

      {view === "list" ? (
        <div className="tactical-pitch-list" role="list" aria-label={`Alineación de ${teamName} en lista`}>
          {listRows.map((player) => {
            const coordinate = coordinateByPlayer.get(player.id) ?? null;
            return (
              <div className="tactical-pitch-player-row" key={player.id}>
                {player.jerseyNumber != null ? <span className="tactical-pitch-player-jersey">#{player.jerseyNumber}</span> : null}
                <span className="tactical-pitch-player-name">{player.fullName}</span>
                <span className="tactical-pitch-player-poscode">{coordinate ? positionCode(coordinate.depth) : "—"}</span>
              </div>
            );
          })}
        </div>
      ) : hasDuplicateSlots ? (
        <div className="tactical-pitch-fallback" role="status">
          <p>La fuente informó ubicaciones tácticas duplicadas. Se muestra la alineación en lista para no superponer jugadores.</p>
          <ul>{players.map((player) => <li key={player.id}>{player.jerseyNumber != null ? `#${player.jerseyNumber} ` : ""}{player.fullName}{presentSoccerPosition(player.positionName) ? ` · ${presentSoccerPosition(player.positionName)}` : ""}</li>)}</ul>
        </div>
      ) : (
        <div className="tactical-pitch" role="group" aria-label={`Jugadores titulares de ${teamName}`}>
          <span className="tactical-goal tactical-goal-top" aria-hidden="true" />
          <span className="tactical-goal tactical-goal-bottom" aria-hidden="true" />
          <span className="tactical-penalty-area tactical-penalty-area-top" aria-hidden="true" />
          <span className="tactical-penalty-area tactical-penalty-area-bottom" aria-hidden="true" />
          <span className="tactical-six-yard tactical-six-yard-top" aria-hidden="true" />
          <span className="tactical-six-yard tactical-six-yard-bottom" aria-hidden="true" />
          <span className="tactical-penalty-spot tactical-penalty-spot-top" aria-hidden="true" />
          <span className="tactical-penalty-spot tactical-penalty-spot-bottom" aria-hidden="true" />
          <span className="tactical-penalty-arc tactical-penalty-arc-top" aria-hidden="true" />
          <span className="tactical-penalty-arc tactical-penalty-arc-bottom" aria-hidden="true" />
          <span className="tactical-halfway-line" aria-hidden="true" />
          <span className="tactical-center-circle" aria-hidden="true" />
          <span className="tactical-center-spot" aria-hidden="true" />
          <span className="tactical-corner-arc tactical-corner-tl" aria-hidden="true" />
          <span className="tactical-corner-arc tactical-corner-tr" aria-hidden="true" />
          <span className="tactical-corner-arc tactical-corner-bl" aria-hidden="true" />
          <span className="tactical-corner-arc tactical-corner-br" aria-hidden="true" />
          <span className="tactical-attack-indicator" aria-hidden="true">{attackLabel}</span>
          <span className="tactical-band-label tactical-band-label-top" aria-hidden="true">{lineNamePitch(maxDepth)}</span>
          {positioned.map(renderMarker)}
        </div>
      )}

      {view === "pitch" && !hasDuplicateSlots && (selected ? (
        <div className="tactical-player-detail" role="status">
          <strong>{selected.fullName}</strong>
          {selected.jerseyNumber != null ? <span>#{selected.jerseyNumber}</span> : null}
          <span>{positionCode(selected.coordinate.depth)}</span>
          {presentSoccerPosition(selected.positionName) ? <span>{presentSoccerPosition(selected.positionName)}</span> : null}
        </div>
      ) : (
        <p className="tactical-pitch-hint">Tocá un jugador para ver su ficha disponible.</p>
      ))}
    </section>
  );
}
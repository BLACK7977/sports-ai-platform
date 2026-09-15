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

/**
 * A tactical view based strictly on Sportmonks' `formation_field` (`line:lane`).
 * It never derives a position from lineup order.
 */
export function TacticalPitch({ teamName, formation, players }: {
  teamName: string;
  formation: string | null;
  players: TacticalPitchPlayer[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
  const hasDuplicateSlots = duplicateSlots.size > 0;
  const maxDepth = Math.max(...positioned.map((item) => item.coordinate.depth), 1);
  const selected = positioned.find((item) => item.id === selectedId) ?? null;

  return (
    <section className="tactical-pitch-wrap" aria-label={`Pizarra táctica de ${teamName}`}>
      <header className="tactical-pitch-heading">
        <span>{teamName}</span>
        <strong>{formation ?? "Formación no disponible"}</strong>
      </header>
      {hasDuplicateSlots ? <div className="tactical-pitch-fallback" role="status">
        <p>La fuente informó ubicaciones tácticas duplicadas. Se muestra la alineación en lista para no superponer jugadores.</p>
        <ul>{players.map((player) => <li key={player.id}>{player.jerseyNumber != null ? `#${player.jerseyNumber} ` : ""}{player.fullName}{presentSoccerPosition(player.positionName) ? ` · ${presentSoccerPosition(player.positionName)}` : ""}</li>)}</ul>
      </div> : <div className="tactical-pitch" role="group" aria-label={`Jugadores titulares de ${teamName}`}>
        <div className="tactical-pitch-center" aria-hidden="true" />
        {positioned.map((player) => {
          const sameLine = positioned.filter((item) => item.coordinate.depth === player.coordinate.depth);
          const maxLane = Math.max(...sameLine.map((item) => item.coordinate.lane), 1);
          // The persisted provider data places lane 1 on the right flank and
          // increases lane numbers toward the left (right/left backs confirm it).
          const left = maxLane === 1 ? 50 : 88 - ((player.coordinate.lane - 1) / (maxLane - 1)) * 76;
          const top = maxDepth === 1 ? 50 : 10 + ((player.coordinate.depth - 1) / (maxDepth - 1)) * 80;
          const isSelected = selected?.id === player.id;
          return (
            <button
              className={`tactical-player${isSelected ? " tactical-player-selected" : ""}`}
              key={player.id}
              type="button"
              aria-pressed={isSelected}
              aria-label={`${player.fullName}${player.jerseyNumber != null ? `, camiseta ${player.jerseyNumber}` : ""}${presentSoccerPosition(player.positionName) ? `, ${presentSoccerPosition(player.positionName)}` : ""}`}
              style={{ left: `${left}%`, top: `${top}%` }}
              onClick={() => setSelectedId(isSelected ? null : player.id)}
            >
              <span>{player.jerseyNumber ?? "—"}</span>
              <b title={player.fullName}>{shortName(player.fullName)}</b>
            </button>
          );
        })}
      </div>}
      {!hasDuplicateSlots && (selected ? <div className="tactical-player-detail" role="status">
        <strong>{selected.fullName}</strong>
        {selected.jerseyNumber != null ? <span>#{selected.jerseyNumber}</span> : null}
        {presentSoccerPosition(selected.positionName) ? <span>{presentSoccerPosition(selected.positionName)}</span> : null}
      </div> : <p className="tactical-pitch-hint">Tocá un jugador para ver su ficha disponible.</p>)}
    </section>
  );
}

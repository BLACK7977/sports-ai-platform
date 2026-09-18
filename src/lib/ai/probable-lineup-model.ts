/**
 * SPORTS AI — probable lineup V0 model (deterministic).
 *
 * Pure functions. No DB, no network, no Sportmonks, no randomness, no
 * external APIs. Inputs are persisted official starting XIs (source data);
 * outputs are the probable XI for a team.
 *
 * DESIGN (documented on purpose, nothing implicit):
 *  - Evidence: up to the last `MAX_EVIDENCE_XIS` usable official starting XIs
 *    strictly BEFORE the input cutoff (loader + service guarantee this).
 *  - A usable XI has at least MIN_PLAYERS_PER_XI starters with a structured
 *    formation_field.
 *  - Formation: chosen by recency-weighted frequency over the usable XIs;
 *    deterministic tie-break by most recent occurrence, then lexicographic.
 *  - Slots: ONLY formation_field values actually observed in XIs that used
 *    the chosen formation. A slot is only ever filled by a player observed
 *    starting in that exact slot (SUFFICIENT_SLOT_OBSERVATIONS = 1).
 *  - Player score at a slot: recency-weighted starter frequency
 *    (half-life decay per XI back) + continuity bonus when the player
 *    started at that slot in the last two usable XIs. Scores are evidence
 *    (0..1, clamped), never "confidence".
 *  - Matching: global score ordering (score desc → slot order → player id)
 *    with one player per slot and one slot per player. Never a forced 11:
 *    if a slot cannot be backed it stays empty and coverage reflects it.
 *  - evidence_coverage = filled slots / 11. This is EVIDENCE, not
 *    probability of correctness. No arbitrary "confidence" numbers.
 *  - Insufficient evidence (no usable XIs, no formation, zero fillable
 *    slots) → sibling returns null → outer service reports NOT_AVAILABLE.
 */

export interface ProbableStarter {
  playerId: string | null;
  playerName: string | null;
  formationField: string;
}

export interface ProbableLineupEvidenceXI {
  matchId: string;
  kickoffAt: string;
  starters: ProbableStarter[];
}

export interface ProbableXISlot {
  formationField: string;
  playerId: string | null;
  playerName: string | null;
  /** Recency-weighted evidence for this exact slot (0..1). Not confidence. */
  evidenceScore: number;
}

export interface ProbableXI {
  formation: string;
  slots: ProbableXISlot[];
  /** filled slots / 11 (0..1). Mathematical evidence coverage. */
  evidenceCoverage: number;
  /** Official matches whose lineups fed this run (ordered oldest → newest). */
  usedMatchIds: string[];
}

export const MAX_EVIDENCE_XIS = 5;
export const MIN_PLAYERS_PER_XI = 6;
export const SUFFICIENT_SLOT_OBSERVATIONS = 1;
export const EVIDENCE_DECAY = 0.5;

type FieldCoords = { depth: number; lane: number };

function parseField(value: string): FieldCoords | null {
  const m = /^(\d+):(\d+)$/.exec(value.trim());
  if (!m) return null;
  const depth = Number(m[1]);
  const lane = Number(m[2]);
  return Number.isSafeInteger(depth) && depth > 0 && Number.isSafeInteger(lane) && lane > 0
    ? { depth, lane }
    : null;
}

/** "d:l" key for stable slot identity. */
function slotKey(coords: FieldCoords): string {
  return `${coords.depth}:${coords.lane}`;
}

function sameSlot(a: string, b: string): boolean {
  const ca = parseField(a);
  const cb = parseField(b);
  return ca !== null && cb !== null && ca.depth === cb.depth && ca.lane === cb.lane;
}

/** Formation string (GK depth excluded) or null when the XI lacks structure. */
export function formationFromStarters(starters: ProbableStarter[]): string | null {
  const depths = new Map<number, number>();
  let gkCount = 0;
  for (const starter of starters) {
    const coords = parseField(starter.formationField);
    if (!coords) continue;
    if (coords.depth === 1) {
      gkCount++;
      continue;
    }
    depths.set(coords.depth, (depths.get(coords.depth) ?? 0) + 1);
  }
  if (gkCount !== 1 || depths.size < 2) return null;
  return [...depths.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, count]) => count)
    .join("-");
}

/** Recency weights for n XIs (oldest first): newest = 1, halves per XI back. */
function recencyWeights(n: number): number[] {
  const weights: number[] = [];
  for (let index = 0; index < n; index++) {
    const stepsBack = n - 1 - index;
    weights.push(Math.pow(EVIDENCE_DECAY, stepsBack));
  }
  return weights;
}

function usableXIs(xis: ProbableLineupEvidenceXI[]): ProbableLineupEvidenceXI[] {
  return xis
    .filter((xi) => xi.starters.filter((s) => parseField(s.formationField)).length >= MIN_PLAYERS_PER_XI)
    .sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt) || a.matchId.localeCompare(b.matchId))
    .slice(-MAX_EVIDENCE_XIS);
}

/**
 * Compute one team's probable XI from its recent official starting XIs.
 * Returns null when evidence is insufficient to produce a lineup.
 */
export function computeProbableLineupForTeam(
  evidence: ProbableLineupEvidenceXI[],
): ProbableXI | null {
  const xis = usableXIs(evidence);
  if (xis.length === 0) return null;
  const weights = recencyWeights(xis.length);
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  if (!Number.isFinite(totalWeight) || totalWeight <= 0) return null;

  // --- Formation selection by recency-weighted frequency -----------------
  const formations = xis.map((xi) => ({ xi, formation: formationFromStarters(xi.starters) }));
  const pickable = formations.filter((entry): entry is { xi: ProbableLineupEvidenceXI; formation: string } => entry.formation !== null);
  if (pickable.length === 0) return null;
  const freq = new Map<string, { weight: number; latestIndex: number }>();
  formations.forEach((entry, index) => {
    if (entry.formation === null) return;
    const current = freq.get(entry.formation) ?? { weight: 0, latestIndex: -1 };
    current.weight += weights[index];
    if (index > current.latestIndex) current.latestIndex = index;
    freq.set(entry.formation, current);
  });
  const chosenFormation = [...freq.entries()]
    .sort(
      ([formationA, a], [formationB, b]) =>
        b.weight - a.weight || b.latestIndex - a.latestIndex || formationA.localeCompare(formationB),
    )[0][0];

  // --- Observed slots from XIs that actually used the chosen formation ----
  const matchingXIs = pickable
    .filter((entry) => entry.formation === chosenFormation)
    .map((entry) => entry.xi);
  const observedSlots = new Map<string, FieldCoords>();
  for (const xi of matchingXIs) {
    for (const starter of xi.starters) {
      const coords = parseField(starter.formationField);
      if (!coords) continue;
      observedSlots.set(slotKey(coords), coords);
    }
  }
  if (observedSlots.size === 0) return null;

  // --- Per-player per-slot recency-weighted evidence ----------------------
  const playerKey = (starter: ProbableStarter): string => starter.playerId ?? starter.playerName ?? "";
  type Candidate = { slotIndex: number; playerId: string; score: number };
  const playerNameAtSlot = (player: string, slot: string): string | null => {
    for (const xi of xis) {
      for (const starter of xi.starters) {
        if (playerKey(starter) === player && sameSlot(starter.formationField, slot)) {
          if (starter.playerName) return starter.playerName;
        }
      }
    }
    return null;
  };

  const slotsOrdered = [...observedSlots.values()].sort(
    (a, b) => a.depth - b.depth || a.lane - b.lane,
  );
  const candidates: Candidate[] = [];
  for (let slotIndex = 0; slotIndex < slotsOrdered.length; slotIndex++) {
    const slot = slotKey(slotsOrdered[slotIndex]);
    const players = new Set<string>();
    for (const xi of xis) {
      for (const starter of xi.starters) {
        if (sameSlot(starter.formationField, slot)) players.add(playerKey(starter));
      }
    }
    for (const player of players) {
      if (player.length === 0) continue;
      let weightedCount = 0;
      for (let index = 0; index < xis.length; index++) {
        const startedHere = xis[index].starters.some(
          (starter) => playerKey(starter) === player && sameSlot(starter.formationField, slot),
        );
        if (startedHere) weightedCount += weights[index];
      }
      if (weightedCount <= 0) continue;
      const base = weightedCount / totalWeight;
      // Continuity bonus: player started at this exact slot in the two most
      // recent usable XIs (deterministic, documented).
      const continuityBonus =
        xis.length >= 2 &&
        sameSlotPlayer(xis[xis.length - 1], player, slot) &&
        sameSlotPlayer(xis[xis.length - 2], player, slot)
          ? 0.15
          : 0;
      candidates.push({ slotIndex, playerId: player, score: Math.min(1, base + continuityBonus) });
    }
  }

  // --- Greedy global matching: best score first ---------------------------
  const chosenPlayer = new Set<string>();
  const usedSlot = new Set<number>();
  const assigned: { slotIndex: number; playerId: string; score: number }[] = [];
  const ordered = [...candidates].sort(
    (a, b) =>
      b.score - a.score || a.slotIndex - b.slotIndex || a.playerId.localeCompare(b.playerId),
  );
  for (const candidate of ordered) {
    if (usedSlot.has(candidate.slotIndex)) continue;
    if (chosenPlayer.has(candidate.playerId)) continue;
    usedSlot.add(candidate.slotIndex);
    chosenPlayer.add(candidate.playerId);
    assigned.push(candidate);
  }
  if (assigned.length === 0) return null;

  // --- Deterministic output ordered by (depth, lane) -----------------------
  const slots = [...assigned]
    .sort((a, b) => a.slotIndex - b.slotIndex)
    .map((entry) => {
      const coords = slotsOrdered[entry.slotIndex];
      const playerName = playerNameAtSlot(entry.playerId, slotKey(coords));
      const resolved = xis
        .flatMap((xi) => xi.starters)
        .find((starter) => playerKey(starter) === entry.playerId && sameSlot(starter.formationField, slotKey(coords)));
      return {
        formationField: slotKey(coords),
        playerId: resolved?.playerId ?? null,
        playerName: playerName ?? resolved?.playerName ?? null,
        evidenceScore: entry.score,
      };
    });
  const usedMatchIds = [...new Set(matchingXIs.map((xi) => xi.matchId))];

  return {
    formation: chosenFormation,
    slots,
    evidenceCoverage: Math.min(1, slots.length / 11),
    usedMatchIds,
  };
}

function sameSlotPlayer(xi: ProbableLineupEvidenceXI, player: string, slot: string): boolean {
  const keyOf = (starter: ProbableStarter): string => starter.playerId ?? starter.playerName ?? "";
  return xi.starters.some(
    (starter) => keyOf(starter) === player && sameSlot(starter.formationField, slot),
  );
}
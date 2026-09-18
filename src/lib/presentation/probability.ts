/**
 * Deterministic 1X2 probability → integer percentage presentation.
 *
 * Persisted canonical probabilities are NEVER modified. This module only
 * converts a read-only copy into DISPLAY integers with the guarantee that
 * home + draw + away always total exactly 100 (largest-remainder / Hamilton
 * apportionment), so UI pages cannot show contradictory rounding (e.g.
 * independent Math.round yielding 44 + 30 + 30 = 104).
 *
 * Inputs can be raw 0–1 probabilities or any consistent scale: the method
 * normalizes by the sum before allocation, so different call sites with
 * different scales produce identical, comparable results.
 */

export interface ProbabilitySplit {
  home: number;
  draw: number;
  away: number;
}

export interface PercentageDistribution {
  home: number;
  draw: number;
  away: number;
  total: number;
}

const KEYS: Array<keyof ProbabilitySplit> = ["home", "draw", "away"];

/**
 * Returns integer percentages (0–100) for the three 1X2 outcomes.
 *
 * Algorithm (Hamilton / largest-remainder):
 *  1. Normalize each probability to its share of the total × 100.
 *  2. Take the integer floor of every share.
 *  3. Distribute the remaining whole points one at a time to the shares with
 *     the largest fractional remainder.
 *  4. Deterministic tie-break: equal remainders resolve by fixed key order
 *     (home → draw → away).
 *
 * Invariants: integers, non-negative, home+draw+away === 100 (or all 0 when
 * the input distribution is all-zero). Throws on invalid input (non-finite or
 * negative) instead of silently showing garbage.
 */
export function probabilityPercentages(
  probabilities: ProbabilitySplit,
): PercentageDistribution {
  for (const key of KEYS) {
    const value = probabilities[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new Error(
        "probabilityPercentages: las probabilidades deben ser números finitos no negativos",
      );
    }
  }

  const sum = probabilities.home + probabilities.draw + probabilities.away;
  if (!(sum > 0)) {
    return { home: 0, draw: 0, away: 0, total: 0 };
  }

  const share = (key: keyof ProbabilitySplit): number =>
    (probabilities[key] * 100) / sum;

  const floors: Record<keyof ProbabilitySplit, number> = {
    home: Math.floor(share("home")),
    draw: Math.floor(share("draw")),
    away: Math.floor(share("away")),
  };

  const remainders = KEYS.map((key) => ({
    key,
    value: share(key) - floors[key],
  })).sort((a, b) => b.value - a.value || KEYS.indexOf(a.key) - KEYS.indexOf(b.key));

  const allocated = Math.round(floors.home + floors.draw + floors.away);
  const remaining = Math.max(0, Math.min(KEYS.length, 100 - allocated));

  for (let i = 0; i < remaining; i += 1) {
    floors[remainders[i % remainders.length].key] += 1;
  }

  const total = floors.home + floors.draw + floors.away;
  return { home: floors.home, draw: floors.draw, away: floors.away, total };
}
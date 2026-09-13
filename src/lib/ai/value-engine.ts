/**
 * Value Engine V1 — mercado 1X2, TypeScript puro.
 *
 * Sin dependencias: no Supabase, no React, no APIs, no providers de odds.
 * Recibe cuotas decimales + probabilidades del modelo y devuelve
 * probabilidades implícitas, overround, normalizadas, edge, EV y flags.
 *
 * Definiciones:
 * - P_raw[o]  = 1 / odds[o]                    (probabilidad implícita bruta, CON margen)
 * - sumRaw    = Σ P_raw                          (1 + overround)
 * - P_book[o] = P_raw[o] / sumRaw                (probabilidad de mercado SIN margen)
 * - edge[o]   = P_model[o] - P_book[o]           (desviación vs mercado sin margen, descriptiva)
 * - EV[o]     = P_model[o] * odds[o] - 1         (valor económico a la cuota concreta)
 *
 * Relación importante (NO son equivalentes):
 *   EV > 0   ⟺   P_model > P_raw
 *   edge > 0 ⟺   P_model > P_book
 * Como P_book < P_raw casi siempre, existe la zona
 *   P_book < P_model < P_raw  ⇒  edge > 0 PERO EV < 0.
 *
 * Regla V1 (conservadora): value[o] = EV[o] > 0 AND edge[o] > 0.
 * EV es el criterio económico principal; edge es solo descriptivo.
 *
 * ESTO NO ES RECOMENDACIÓN FINANCIERA. NO GARANTIZA RENTABILIDAD.
 * Modelo experimental, parámetros no calibrados.
 */

export type Outcome1X2 = "home" | "draw" | "away";

export interface Odds1X2 {
  home: number;
  draw: number;
  away: number;
}

export interface Probs1X2 {
  home: number;
  draw: number;
  away: number;
}

export interface ValueFlags1X2 {
  home: boolean;
  draw: boolean;
  away: boolean;
}

export interface ValueResult1X2 {
  rawImpliedProbabilities: Probs1X2;
  normalizedBookmakerProbabilities: Probs1X2;
  overround: number;
  edge: Probs1X2;
  ev: Probs1X2;
  valueFlags: ValueFlags1X2;
}

export class InvalidOddsError extends Error {
  constructor(message: string) {
    super(`[value-engine] odds inválidas: ${message}`);
    this.name = "InvalidOddsError";
  }
}

export class InvalidModelProbabilitiesError extends Error {
  constructor(message: string) {
    super(`[value-engine] probabilidades del modelo inválidas: ${message}`);
    this.name = "InvalidModelProbabilitiesError";
  }
}

const OUTCOMES: Outcome1X2[] = ["home", "draw", "away"];
const MODEL_SUM_TOLERANCE = 0.0001;

/**
 * Valida que el valor sea un objeto plano con EXACTAMENTE las keys
 * home/draw/away: rechaza null, arrays, primitivos, keys faltantes y extras.
 */
function assertExact1X2Shape(value: unknown, label: string, Err: new (msg: string) => Error): asserts value is Record<Outcome1X2, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Err(`debe ser un objeto {home, draw, away} (recibido: ${Array.isArray(value) ? "array" : String(value)})`);
  }
  const keys = Object.keys(value);
  for (const outcome of OUTCOMES) {
    if (!Object.prototype.hasOwnProperty.call(value, outcome)) {
      throw new Err(`falta la key "${outcome}" (recibido: {${keys.join(", ")}})`);
    }
  }
  const extras = keys.filter((k) => k !== "home" && k !== "draw" && k !== "away");
  if (extras.length > 0) {
    throw new Err(`keys extra no permitidas: ${extras.join(", ")} (solo home/draw/away)`);
  }
  void label;
}

function isValidNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function validateOdds1X2(odds: Odds1X2): void {
  assertExact1X2Shape(odds, "odds", InvalidOddsError);
  for (const outcome of OUTCOMES) {
    const value = (odds as unknown as Record<string, unknown>)[outcome];
    if (!isValidNumber(value)) {
      throw new InvalidOddsError(
        `${outcome} debe ser un número finito (recibido: ${String(value)})`,
      );
    }
    if (value <= 1) {
      throw new InvalidOddsError(
        `${outcome} debe ser > 1 (recibido: ${value})`,
      );
    }
  }
}

export function validateModelProbs1X2(probs: Probs1X2): void {
  assertExact1X2Shape(probs, "modelProbs", InvalidModelProbabilitiesError);
  let sum = 0;
  for (const outcome of OUTCOMES) {
    const value = (probs as unknown as Record<string, unknown>)[outcome];
    if (!isValidNumber(value)) {
      throw new InvalidModelProbabilitiesError(
        `${outcome} debe ser un número finito (recibido: ${String(value)})`,
      );
    }
    if (value < 0 || value > 1) {
      throw new InvalidModelProbabilitiesError(
        `${outcome} debe estar en [0, 1] (recibido: ${value})`,
      );
    }
    sum += value;
  }
  if (Math.abs(sum - 1) > MODEL_SUM_TOLERANCE) {
    throw new InvalidModelProbabilitiesError(
      `la suma debe ser 1 ± ${MODEL_SUM_TOLERANCE} (recibido: ${sum})`,
    );
  }
}

export function computeValue1X2(
  odds: Odds1X2,
  modelProbs: Probs1X2,
): ValueResult1X2 {
  validateOdds1X2(odds);
  validateModelProbs1X2(modelProbs);

  const rawImpliedProbabilities: Probs1X2 = {
    home: 1 / odds.home,
    draw: 1 / odds.draw,
    away: 1 / odds.away,
  };

  const sumRaw =
    rawImpliedProbabilities.home +
    rawImpliedProbabilities.draw +
    rawImpliedProbabilities.away;

  // Soporta overround positivo, cero o negativo (raro pero válido).
  const overround = sumRaw - 1;

  const normalizedBookmakerProbabilities: Probs1X2 = {
    home: rawImpliedProbabilities.home / sumRaw,
    draw: rawImpliedProbabilities.draw / sumRaw,
    away: rawImpliedProbabilities.away / sumRaw,
  };

  const edge: Probs1X2 = {
    home: modelProbs.home - normalizedBookmakerProbabilities.home,
    draw: modelProbs.draw - normalizedBookmakerProbabilities.draw,
    away: modelProbs.away - normalizedBookmakerProbabilities.away,
  };

  const ev: Probs1X2 = {
    home: modelProbs.home * odds.home - 1,
    draw: modelProbs.draw * odds.draw - 1,
    away: modelProbs.away * odds.away - 1,
  };

  // Criterio conservador V1: EV > 0 AND edge > 0.
  const valueFlags: ValueFlags1X2 = {
    home: ev.home > 0 && edge.home > 0,
    draw: ev.draw > 0 && edge.draw > 0,
    away: ev.away > 0 && edge.away > 0,
  };

  return {
    rawImpliedProbabilities,
    normalizedBookmakerProbabilities,
    overround,
    edge,
    ev,
    valueFlags,
  };
}

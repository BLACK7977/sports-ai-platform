import { createHash } from "node:crypto";
import {
  EXPLANATION_LANGUAGE,
  EXPLANATION_PROMPT_SCHEMA,
  EXPLANATION_PROMPT_VERSION,
} from "@/lib/ai/prediction-explanation-schema";

/**
 * ALLOWED INPUT BUILDER (server-only concept, pure functions).
 *
 * The SPORTS AI mathematical model owns every quantitative value. Gemini may
 * ONLY receive the frozen subset of already-persisted canonical fields listed
 * below. This module (a) whitelists those fields explicitly, (b) builds a
 * deterministic prompt from them, and (c) computes a deterministic SHA-256
 * fingerprint of the exact input used, so a stored explanation can be audited
 * against "same inputs → same explanation" without ever storing secrets.
 *
 * FORBIDDEN: live Sportmonks, odds, Edge/EV, Sports AI Score, injuries, live
 * form, lineups, venue reasoning, referee, invented stats, exact-score
 * predictions. None of them are typed here, so they cannot leak into the
 * prompt.
 */

export interface GroupedDataQuality {
  homeMatchesUsed: number;
  awayMatchesUsed: number;
  leagueMatchesUsed: number;
}

/** Persisted-only frozen input eligible for Gemini. */
export interface CanonicalExplanationSource {
  predictionId: number;
  matchId: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  competition: string;
  kickoffAt: string;
  marketId: string;
  modelVersionId: string;
  probabilities: { home: number; draw: number; away: number };
  expectedGoals?: { home: number; away: number } | null;
  dataQuality?: GroupedDataQuality | null;
}

export interface PredictedOutcomeKey {
  key: "home" | "draw" | "away";
  label: string;
}

const OUTCOME_LABELS: Record<PredictedOutcomeKey["key"], string> = {
  home: "local",
  draw: "empate",
  away: "visitante",
};

const PROB_SUM_TOLERANCE = 0.0001;

function assertValidProbabilities(source: CanonicalExplanationSource): void {
  const { home, draw, away } = source.probabilities;
  for (const value of [home, draw, away]) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error(
        `PredictionExplanation: probabilidad persistida inválida en prediction_id=${source.predictionId}`,
      );
    }
  }
  if (Math.abs(home + draw + away - 1) > PROB_SUM_TOLERANCE) {
    throw new Error(
      `PredictionExplanation: las probabilidades persisted deben sumar 1 en prediction_id=${source.predictionId}`,
    );
  }
}

export function topOutcomeKey(
  probabilities: CanonicalExplanationSource["probabilities"],
): PredictedOutcomeKey {
  const sorted = (["home", "draw", "away"] as const)
    .map((key) => ({ key, value: probabilities[key] }))
    .sort((a, b) => b.value - a.value);
  return { key: sorted[0].key, label: OUTCOME_LABELS[sorted[0].key] };
}

/**
 * Whitelists the allowed fields into a canonical, deterministic shape.
 * Multiple requests with identical persisted data yield byte-identical output
 * (stable key order, no environment/timing state).
 */
export function buildCanonicalContext(
  source: CanonicalExplanationSource,
): CanonicalExplanationSource {
  assertValidProbabilities(source);
  const expectedGoals = source.expectedGoals
    ? { home: source.expectedGoals.home, away: source.expectedGoals.away }
    : null;
  const dataQuality = source.dataQuality
    ? {
        homeMatchesUsed: source.dataQuality.homeMatchesUsed,
        awayMatchesUsed: source.dataQuality.awayMatchesUsed,
        leagueMatchesUsed: source.dataQuality.leagueMatchesUsed,
      }
    : null;
  return {
    predictionId: source.predictionId,
    matchId: source.matchId,
    homeTeamId: source.homeTeamId,
    awayTeamId: source.awayTeamId,
    homeTeamName: source.homeTeamName,
    awayTeamName: source.awayTeamName,
    competition: source.competition,
    kickoffAt: source.kickoffAt,
    marketId: source.marketId,
    modelVersionId: source.modelVersionId,
    probabilities: { ...source.probabilities },
    expectedGoals,
    dataQuality,
  };
}

/**
 * Deterministic canonical parts for fingerprinting. Fixed order,
 * schema/version/language included so a changed schema produces a new
 * fingerprint (regeneration provenance). No secrets can reach here: the
 * source type only exposes persisted canonical data.
 */
export function canonicalContextParts(
  context: CanonicalExplanationSource,
): unknown[] {
  return [
    EXPLANATION_PROMPT_SCHEMA,
    EXPLANATION_PROMPT_VERSION,
    EXPLANATION_LANGUAGE,
    context.predictionId,
    context.matchId,
    context.homeTeamId,
    context.awayTeamId,
    context.homeTeamName,
    context.awayTeamName,
    context.competition,
    context.kickoffAt,
    context.marketId,
    context.modelVersionId,
    context.probabilities.home,
    context.probabilities.draw,
    context.probabilities.away,
    context.expectedGoals?.home ?? null,
    context.expectedGoals?.away ?? null,
    context.dataQuality?.homeMatchesUsed ?? null,
    context.dataQuality?.awayMatchesUsed ?? null,
    context.dataQuality?.leagueMatchesUsed ?? null,
  ];
}

export function computeExplanationFingerprint(
  context: CanonicalExplanationSource,
): string {
  const canonical = JSON.stringify(canonicalContextParts(context));
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

const SYSTEM_INSTRUCTION = `Eres un analista de SPORTS AI, una plataforma de análisis deportivo.

Reglas inquebrantables:
- Los NUMEROS que recibis (probabilidades 1X2, goles esperados) provienen del modelo matematico SPORTS AI ya persistido. NO los modifiques, inventes ni contradigas.
- NO inventes cuotas (odds), Edge, EV, scores exactos, lesiones, alineaciones, estadisticas, condiciones de estadio ni arbitro.
- NO sumes contexto que no venga en los datos.
- El output es SOLO JSON valido con exactamente estas claves: summary (string), key_factors (array de 2 a 4 strings), model_reading (string). Sin texto fuera del JSON, sin bloques de codigo.
- Idioma: espanol (Argentina), conciso y factual.
- summary: maximo 30 palabras. key_factors: 2 a 4 factores breves. model_reading: maximo 25 palabras, explicando la lectura del modelo.

Datos congelados validados por el modelo (no los repitas literalmente salvo que aporte):`;

export function buildExplanationPrompt(
  context: CanonicalExplanationSource,
): string {
  const percentile = (value: number): string =>
    `${(value * 100).toFixed(1).replace(".", ",")}%`;
  const top = topOutcomeKey(context.probabilities);

  const dataLines = [
    `COMPETENCIA: ${context.competition}`,
    `LOCAL: ${context.homeTeamName}`,
    `VISITA: ${context.awayTeamName}`,
    `FECHA: ${context.kickoffAt}`,
    `MERCADO: ${context.marketId}`,
    `MODELO: ${context.modelVersionId}`,
    `PROBABILIDAD LOCAL (1): ${percentile(context.probabilities.home)}`,
    `PROBABILIDAD EMPATE (X): ${percentile(context.probabilities.draw)}`,
    `PROBABILIDAD VISITA (2): ${percentile(context.probabilities.away)}`,
  ];
  if (context.expectedGoals) {
    dataLines.push(
      `GOLES ESPERADOS LOCAL: ${context.expectedGoals.home.toFixed(2)}`,
    );
    dataLines.push(
      `GOLES ESPERADOS VISITA: ${context.expectedGoals.away.toFixed(2)}`,
    );
  }
  if (context.dataQuality) {
    dataLines.push(
      `CALIDAD DE DATOS (partidos usados): local=${context.dataQuality.homeMatchesUsed}, visita=${context.dataQuality.awayMatchesUsed}, liga=${context.dataQuality.leagueMatchesUsed}`,
    );
  }
  dataLines.push(`FAVORITO DEL MODELO: ${top.label}`);

  const modelReadingExample =
    `Recall que las probabilidades son el output canonico del modelo y ` +
    `los goles esperados una lectura interna del mismo. Escribi model_reading ` +
    `describiendo la lectura que el modelo hace del partido (que equipo pondera ` +
    `mas, que tan cerrado lo ve) sin afirmar un marcador exacto.`;

  return `${SYSTEM_INSTRUCTION}\n\n${dataLines.join("\n")}\n\n${modelReadingExample}`;
}
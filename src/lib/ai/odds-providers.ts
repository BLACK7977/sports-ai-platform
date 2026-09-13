/**
 * Odds providers V1 — abstracción + implementaciones offline.
 *
 * Capas separadas:
 *   Provider (obtención) → Quote (validación) → Snapshot Payload (persistencia futura) → Value Engine (cálculo)
 *
 * Este módulo cubre obtención + validación + payload. NO hace INSERTs,
 * NO llama red, NO depende de Supabase/React.
 *
 * DATOS SINTÉTICOS: SyntheticOddsProvider y ManualOddsProvider existen
 * EXCLUSIVAMENTE para desarrollo/tests/validación de arquitectura.
 * Nunca deben presentarse al usuario final como cuotas reales.
 *
 * provider vs source (ambos obligatorios, distintos):
 * - provider: qué implementación produjo la quote en código
 *   ("synthetic" | "manual" | futuro "sportmonks"). Trazabilidad de runtime.
 * - source: etiqueta de proveniencia que se persiste en
 *   odds_snapshots.source (migration 004, NOT NULL). El mapper la copia
 *   tal cual y nunca produce source vacío (validado non-empty).
 */

import { validateOdds1X2, type Odds1X2 } from "@/lib/ai/value-engine";

export type OddsMarketId = "1x2";

export interface OddsQuote1X2 {
  provider: string;
  bookmakerId: string;
  marketId: OddsMarketId;
  /** ID interno del partido (matches.id). Para fuentes externas futuras, mapear antes a este ID. */
  matchId: string;
  /** ID externo del fixture en el proveedor original (opcional, solo trazabilidad). */
  externalFixtureId?: string;
  odds: Odds1X2;
  /** ISO 8601, compatible con TIMESTAMPTZ. */
  capturedAt: string;
  source: string;
}

export interface GetPreMatchOddsInput {
  matchId?: string;
  bookmakerId?: string;
  marketId?: OddsMarketId;
}

export interface OddsProvider {
  readonly id: string;
  getPreMatchOdds(input?: GetPreMatchOddsInput): Promise<OddsQuote1X2[]>;
}

export class InvalidOddsQuoteError extends Error {
  constructor(message: string) {
    super(`[odds-providers] quote inválida: ${message}`);
    this.name = "InvalidOddsQuoteError";
  }
}

function assertNonEmptyString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidOddsQuoteError(`${field} debe ser un string no vacío`);
  }
}

function assertValidTimestamp(value: unknown, field: string): asserts value is string {
  assertNonEmptyString(value, field);
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) {
    throw new InvalidOddsQuoteError(`${field} debe ser un timestamp ISO válido (recibido: ${value})`);
  }
}

/**
 * Valida una quote completa en runtime: forma exacta de odds (reutiliza
 * 4C.2), bookmakerId/matchId no vacíos, marketId === "1x2", capturedAt válido.
 * Rechaza null, arrays, objetos incompletos y keys inválidas donde corresponda.
 */
export function validateOddsQuote1X2(quote: unknown): asserts quote is OddsQuote1X2 {
  if (typeof quote !== "object" || quote === null || Array.isArray(quote)) {
    throw new InvalidOddsQuoteError(
      `debe ser un objeto (recibido: ${Array.isArray(quote) ? "array" : String(quote)})`,
    );
  }
  const q = quote as Record<string, unknown>;
  assertNonEmptyString(q.provider, "provider");
  assertNonEmptyString(q.bookmakerId, "bookmakerId");
  if (q.marketId !== "1x2") {
    throw new InvalidOddsQuoteError(`marketId debe ser "1x2" (recibido: ${String(q.marketId)})`);
  }
  assertNonEmptyString(q.matchId, "matchId");
  assertValidTimestamp(q.capturedAt, "capturedAt");
  assertNonEmptyString(q.source, "source");
  if (q.externalFixtureId !== undefined) {
    assertNonEmptyString(q.externalFixtureId, "externalFixtureId");
  }
  validateOdds1X2(q.odds as Odds1X2);
}

/**
 * Payload compatible con la tabla odds_snapshots (migration 004).
 * Puro: NO hace INSERT. El insert futuro debe respetar el
 * UNIQUE(match_id, bookmaker_id, market_id, captured_at).
 */
export interface OddsSnapshotPayload {
  match_id: string;
  bookmaker_id: string;
  market_id: string;
  odds: Odds1X2;
  captured_at: string;
  source: string;
}

export function toOddsSnapshotPayload(quote: OddsQuote1X2): OddsSnapshotPayload {
  validateOddsQuote1X2(quote);
  return {
    match_id: quote.matchId,
    bookmaker_id: quote.bookmakerId,
    market_id: quote.marketId,
    odds: { home: quote.odds.home, draw: quote.odds.draw, away: quote.odds.away },
    captured_at: quote.capturedAt,
    source: quote.source,
  };
}

/**
 * Normaliza un timestamp a forma canónica UTC (ISO con Z).
 * Dos strings que representan el mismo instante (ej. "2026-09-13T15:00:00Z"
 * y "2026-09-13T12:00:00-03:00") producen la misma salida.
 */
export function normalizeTimestamp(value: string): string {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) {
    throw new InvalidOddsQuoteError(`timestamp inválido para normalizar (recibido: ${value})`);
  }
  return new Date(ms).toISOString();
}

/**
 * Identidad lógica de snapshot = UNIQUE(match_id, bookmaker_id, market_id, captured_at).
 * capturedAt se normaliza a UTC canónico: timestamps equivalentes con distinto
 * formato timezone producen la MISMA identidad (igual que Postgres TIMESTAMPTZ,
 * que compara instantes, no strings).
 * Dos payloads con la misma identidad colisionarían en INSERT.
 */
export function snapshotIdentity(payload: Pick<OddsSnapshotPayload, "match_id" | "bookmaker_id" | "market_id" | "captured_at">): string {
  let captured = payload.captured_at;
  const ms = Date.parse(captured);
  if (Number.isFinite(ms)) captured = new Date(ms).toISOString();
  return `${payload.match_id}|${payload.bookmaker_id}|${payload.market_id}|${captured}`;
}

/**
 * Scope de serie lógica de odds: (matchId, bookmakerId, marketId).
 * Los selectores NUNCA mezclan series distintas: solo consideran quotes
 * que coinciden exactamente en las tres dimensiones.
 */
export interface OddsSeriesScope {
  matchId: string;
  bookmakerId: string;
  marketId: OddsMarketId;
}

export interface ClosingOddsScope extends OddsSeriesScope {
  kickoffAt: string;
}

function assertScope(scope: OddsSeriesScope, label: string): void {
  assertNonEmptyString(scope.matchId, `${label}.matchId`);
  assertNonEmptyString(scope.bookmakerId, `${label}.bookmakerId`);
  if (scope.marketId !== "1x2") {
    throw new InvalidOddsQuoteError(`${label}.marketId debe ser "1x2" (recibido: ${String(scope.marketId)})`);
  }
}

function inScope(quote: OddsQuote1X2, scope: OddsSeriesScope): boolean {
  return (
    quote.matchId === scope.matchId &&
    quote.bookmakerId === scope.bookmakerId &&
    quote.marketId === scope.marketId
  );
}

/**
 * Closing odds V1: último snapshot de LA SERIE (match, bookmaker, market)
 * ESTRICTAMENTE anterior al kickoff.
 * Política: capturedAt < kickoff (capturedAt === kickoff se ignora).
 * Independiente del orden del array. Sin snapshot previo en la serie → null.
 */
export function selectClosingOdds(
  quotes: OddsQuote1X2[],
  scope: ClosingOddsScope,
): OddsQuote1X2 | null {
  assertScope(scope, "scope");
  const kickoffMs = Date.parse(scope.kickoffAt);
  if (!Number.isFinite(kickoffMs)) {
    throw new InvalidOddsQuoteError(`scope.kickoffAt debe ser un timestamp ISO válido (recibido: ${scope.kickoffAt})`);
  }
  let best: OddsQuote1X2 | null = null;
  let bestMs = -Infinity;
  for (const quote of quotes) {
    if (!inScope(quote, scope)) continue;
    const capturedMs = Date.parse(quote.capturedAt);
    if (!Number.isFinite(capturedMs)) continue;
    if (capturedMs < kickoffMs && capturedMs > bestMs) {
      best = quote;
      bestMs = capturedMs;
    }
  }
  return best;
}

/**
 * Current odds: snapshot más reciente de LA SERIE (match, bookmaker, market),
 * sin filtro de kickoff.
 *
 * CURRENT ODDS ≠ CLOSING/PRE-KICKOFF ODDS ≠ ODDS USED BY PREDICTION.
 * Las odds usadas por una predicción quedan congeladas vía
 * predictions.odds_snapshot_id + predictions.odds_used.
 */
export function selectCurrentOdds(
  quotes: OddsQuote1X2[],
  scope: OddsSeriesScope,
): OddsQuote1X2 | null {
  assertScope(scope, "scope");
  let best: OddsQuote1X2 | null = null;
  let bestMs = -Infinity;
  for (const quote of quotes) {
    if (!inScope(quote, scope)) continue;
    const capturedMs = Date.parse(quote.capturedAt);
    if (!Number.isFinite(capturedMs)) continue;
    if (capturedMs > bestMs) {
      best = quote;
      bestMs = capturedMs;
    }
  }
  return best;
}

export interface SyntheticSnapshotConfig {
  capturedAt: string;
  odds: Odds1X2;
}

export interface SyntheticFixtureConfig {
  matchId: string;
  bookmakerId: string;
  marketId?: OddsMarketId;
  externalFixtureId?: string;
  source?: string;
  snapshots: SyntheticSnapshotConfig[];
}

/**
 * SyntheticOddsProvider — 100% offline, determinista, sin network, sin random.
 * Acepta configuración sintética y devuelve quotes validadas, ordenadas por
 * (matchId, bookmakerId, capturedAt) para determinismo total.
 * SOLO desarrollo/tests. Nunca exponer como cuotas reales en UI.
 */
export class SyntheticOddsProvider implements OddsProvider {
  readonly id = "synthetic";
  private readonly quotes: OddsQuote1X2[];

  constructor(fixtures: SyntheticFixtureConfig[]) {
    const built: OddsQuote1X2[] = [];
    for (const fixture of fixtures) {
      for (const snapshot of fixture.snapshots) {
        const quote: OddsQuote1X2 = {
          provider: "synthetic",
          bookmakerId: fixture.bookmakerId,
          marketId: fixture.marketId ?? "1x2",
          matchId: fixture.matchId,
          externalFixtureId: fixture.externalFixtureId,
          odds: { ...snapshot.odds },
          capturedAt: snapshot.capturedAt,
          source: fixture.source ?? "synthetic",
        };
        validateOddsQuote1X2(quote);
        built.push(quote);
      }
    }
    built.sort((a, b) =>
      a.matchId < b.matchId ? -1
      : a.matchId > b.matchId ? 1
      : a.bookmakerId < b.bookmakerId ? -1
      : a.bookmakerId > b.bookmakerId ? 1
      : a.capturedAt < b.capturedAt ? -1
      : a.capturedAt > b.capturedAt ? 1
      : 0,
    );
    this.quotes = built;
  }

  async getPreMatchOdds(input?: GetPreMatchOddsInput): Promise<OddsQuote1X2[]> {
    return this.quotes
      .filter((q) => (input?.matchId === undefined || q.matchId === input.matchId))
      .filter((q) => (input?.bookmakerId === undefined || q.bookmakerId === input.bookmakerId))
      .filter((q) => (input?.marketId === undefined || q.marketId === input.marketId))
      .map((q) => ({ ...q, odds: { ...q.odds } }));
  }
}

/**
 * ManualOddsProvider — adapter que acepta OddsQuote1X2[] directamente.
 * Aplica las mismas validaciones. Sin CSV, sin archivos externos, sin UI.
 * SOLO desarrollo/tests.
 */
export class ManualOddsProvider implements OddsProvider {
  readonly id = "manual";

  constructor(private readonly quotes: OddsQuote1X2[]) {
    for (const quote of quotes) {
      validateOddsQuote1X2(quote);
    }
  }

  async getPreMatchOdds(input?: GetPreMatchOddsInput): Promise<OddsQuote1X2[]> {
    return this.quotes
      .filter((q) => (input?.matchId === undefined || q.matchId === input.matchId))
      .filter((q) => (input?.bookmakerId === undefined || q.bookmakerId === input.bookmakerId))
      .filter((q) => (input?.marketId === undefined || q.marketId === input.marketId))
      .map((q) => ({ ...q, odds: { ...q.odds } }));
  }
}

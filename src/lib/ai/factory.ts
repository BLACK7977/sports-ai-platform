import "server-only";
import type { LLMProvider } from "@/types/ai";
import { MockLlmProvider } from "@/lib/ai/providers/mock-provider";
import { OpenAILlmProvider } from "@/lib/ai/providers/openai-provider";
import { getFeatureFlag } from "@/lib/config/feature-flags";
import { hasOpenAI } from "@/lib/config/env";

const MOCK = new MockLlmProvider();
let openaiInstance: LLMProvider | null = null;

// ------------------------------------------------------------------
// Cache de resultados AI en memoria, por proceso.
//
// LIMITACIONES (documentadas a propósito):
//  - No es compartido entre instancias / serverless.
//  - Se pierde al reiniciar el proceso.
//  - Es una optimización y protección blanda, NO un sistema distribuido.
//  - El TTL evita servir resultados eternos y da espacio a datos nuevos.
// ------------------------------------------------------------------
type CacheEntry = { value: unknown; expiresAt: number };
const DEFAULT_TTL_MS = 10 * 60_000;
const MAX_CACHE_ENTRIES = 500;

const aiCache = new Map<string, CacheEntry>();
const aiCacheHits = { hits: 0, misses: 0 };
const inFlight = new Map<string, Promise<unknown>>();

function pruneExpired(now = Date.now()): void {
  for (const [key, entry] of aiCache) {
    if (entry.expiresAt <= now) aiCache.delete(key);
  }
}

export function resetAiCache(): void {
  aiCache.clear();
  aiCacheHits.hits = 0;
  aiCacheHits.misses = 0;
  inFlight.clear();
}

export function getAiCacheStats(): {
  hits: number;
  misses: number;
  size: number;
} {
  pruneExpired();
  return {
    hits: aiCacheHits.hits,
    misses: aiCacheHits.misses,
    size: aiCache.size,
  };
}

export function getCachedAiResult<T>(key: string): T | undefined {
  const entry = aiCache.get(key);
  if (!entry) {
    aiCacheHits.misses++;
    return undefined;
  }
  if (entry.expiresAt <= Date.now()) {
    aiCache.delete(key);
    aiCacheHits.misses++;
    return undefined;
  }
  aiCacheHits.hits++;
  return entry.value as T;
}

export function setCachedAiResult<T>(
  key: string,
  value: T,
  ttlMs = DEFAULT_TTL_MS,
): T {
  pruneExpired();
  if (aiCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = aiCache.keys().next().value;
    if (oldest !== undefined) aiCache.delete(oldest);
  }
  aiCache.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

/**
 * Deduplica requests concurrentes con la misma key: N clicks simultáneos
 * comparten una sola promesa ("in-flight") y por lo tanto una sola generación.
 */
export function dedupeAiRequest<T>(
  key: string,
  produce: () => Promise<T>,
): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;
  const promise = produce().finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
}

export function resetInFlight(): void {
  inFlight.clear();
}

export function getLlmProvider(force?: "mock" | "openai"): LLMProvider {
  if (force === "mock") return MOCK;

  const useMock = getFeatureFlag("USE_LLM_MOCK");
  if (useMock) return MOCK;

  if (force === "openai" || hasOpenAI()) {
    if (!openaiInstance) openaiInstance = new OpenAILlmProvider();
    return openaiInstance;
  }

  return MOCK;
}
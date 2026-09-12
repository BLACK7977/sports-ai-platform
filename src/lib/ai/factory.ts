// Server-only enforcement
import "@/lib/config/env";
import type { LLMProvider } from "@/types/ai";
import { MockLlmProvider } from "@/lib/ai/providers/mock-provider";
import { OpenAILlmProvider } from "@/lib/ai/providers/openai-provider";
import { getFeatureFlag } from "@/lib/config/feature-flags";
import { hasOpenAI } from "@/lib/config/env";

const MOCK = new MockLlmProvider();
let openaiInstance: LLMProvider | null = null;

const aiCache = new Map<string, unknown>();
const aiCacheHits = { hits: 0, misses: 0 };

export function resetAiCache(): void {
  aiCache.clear();
  aiCacheHits.hits = 0;
  aiCacheHits.misses = 0;
}

export function getAiCacheStats(): { hits: number; misses: number; size: number } {
  return {
    hits: aiCacheHits.hits,
    misses: aiCacheHits.misses,
    size: aiCache.size,
  };
}

export function getCachedAiResult<T>(key: string): T | undefined {
  if (!getFeatureFlag("ENABLE_AI_CACHE")) return undefined;
  if (aiCache.has(key)) {
    aiCacheHits.hits++;
    return aiCache.get(key) as T;
  }
  aiCacheHits.misses++;
  return undefined;
}

export function setCachedAiResult<T>(key: string, value: T): T {
  if (!getFeatureFlag("ENABLE_AI_CACHE")) return value;
  aiCache.set(key, value);
  return value;
}

export function getLlmProvider(force?: "mock" | "openai"): LLMProvider {
  if (force === "mock") return MOCK;

  const useMock = getFeatureFlag("USE_LLM_MOCK");
  if (useMock) return MOCK;

  if (force === "openai" || hasOpenAI()) {
    if (!openaiInstance) openaiInstance = new OpenAILlmProvider();
    return openaiInstance;
  }

  // Fallback silencioso: no hay key y no hay force.
  return MOCK;
}

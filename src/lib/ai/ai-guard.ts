import "server-only";
import type { LLMProvider } from "@/types/ai";
import { getLlmProvider } from "@/lib/ai/factory";
import { getFeatureFlag } from "@/lib/config/feature-flags";
import { hasOpenAI } from "@/lib/config/env";

/**
 * Política explícita de qué provider se usa, según entorno:
 *
 *  - DESARROLLO / offline / tests: el mock está permitido cuando no hay key.
 *    (Se loguea provider=mock; nunca se etiqueta como OpenAI.)
 *  - PRODUCCIÓN: si la feature AI está "habilitada" pero falta
 *    OPENAI_API_KEY, NO se devuelve un análisis mock maquillado de AI real:
 *    se lanza AiFeatureUnavailableError para que la acción muestre
 *    indisponibilidad. El mock en producción SOLO es válido con el flag
 *    explícito USE_LLM_MOCK=true (demo intencional, logueado como mock).
 */
export class AiFeatureUnavailableError extends Error {
  constructor() {
    super("Funcionalidad de IA no disponible.");
    this.name = "AiFeatureUnavailableError";
  }
}

export function resolveProviderForFeature(
  providerHint?: "mock" | "openai",
): LLMProvider {
  if (providerHint === "mock") return getLlmProvider("mock");

  const isProd = process.env.NODE_ENV === "production";
  const mockFlagExplicit = getFeatureFlag("USE_LLM_MOCK") === true;

  if (providerHint === "openai") {
    if (!hasOpenAI()) throw new AiFeatureUnavailableError();
    return getLlmProvider("openai");
  }

  if (mockFlagExplicit) return getLlmProvider("mock");
  if (hasOpenAI()) return getLlmProvider("openai");

  if (isProd) throw new AiFeatureUnavailableError();

  // Dev / test sin key: mock explícito.
  return getLlmProvider("mock");
}
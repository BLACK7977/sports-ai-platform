import { getEnv } from "@/lib/config/env";

/** Lee flags de entorno sin romper la app si faltan credenciales core
 *  (modo offline/demo). Los defaults son seguros y no loguean secretos. */
function readEnvFlags(): {
  USE_LLM_MOCK: boolean;
  ENABLE_OFFLINE_MODE: boolean;
} {
  try {
    const env = getEnv();
    return {
      USE_LLM_MOCK: env.USE_LLM_MOCK,
      ENABLE_OFFLINE_MODE: env.ENABLE_OFFLINE_MODE,
    };
  } catch {
    return { USE_LLM_MOCK: false, ENABLE_OFFLINE_MODE: false };
  }
}

const { USE_LLM_MOCK, ENABLE_OFFLINE_MODE } = readEnvFlags();

export const featureFlags = {
  USE_LLM_MOCK,
  ENABLE_OFFLINE_MODE,
  ENABLE_STATS_CACHE: true,
  ENABLE_AI_CACHE: true,
} as const;

export type FeatureFlagKey = keyof typeof featureFlags;

export function getFeatureFlag<K extends FeatureFlagKey>(
  key: K,
): (typeof featureFlags)[K] {
  return featureFlags[key];
}
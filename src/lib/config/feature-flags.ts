import { getEnv } from "@/lib/config/env";

const env = getEnv();

export const featureFlags = {
  USE_LLM_MOCK: env.USE_LLM_MOCK,
  ENABLE_OFFLINE_MODE: env.ENABLE_OFFLINE_MODE,
  ENABLE_STATS_CACHE: true,
  ENABLE_AI_CACHE: true,
} as const;

export type FeatureFlagKey = keyof typeof featureFlags;

export function getFeatureFlag<K extends FeatureFlagKey>(
  key: K,
): (typeof featureFlags)[K] {
  return featureFlags[key];
}
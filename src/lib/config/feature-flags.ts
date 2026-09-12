export const featureFlags = {
  USE_LLM_MOCK: true,
  ENABLE_OFFLINE_MODE: true,
  ENABLE_STATS_CACHE: true,
  ENABLE_AI_CACHE: true,
} as const;

export type FeatureFlagKey = keyof typeof featureFlags;

export function getFeatureFlag<K extends FeatureFlagKey>(
  key: K,
): (typeof featureFlags)[K] {
  return featureFlags[key];
}

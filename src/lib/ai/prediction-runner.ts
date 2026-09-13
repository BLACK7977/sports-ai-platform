/**
 * Adapter real: prediction-service → probability-service (modelo 4B).
 *
 * Server-only. Recibe PredictionMatchRef, mapea sport/league/season/match,
 * ejecuta runProbabilityModel() y devuelve ModelRunResult compatible con
 * prediction-service, incluyendo probabilities, expectedGoals, fallback,
 * dataQuality, effectiveParameters e inputs de reproducibilidad.
 *
 * NO duplica matemática. NO llama APIs externas, OpenAI ni odds.
 * runFn es inyectable para tests offline (default: modelo real).
 */

import "server-only";
import { runProbabilityModel } from "@/lib/ai/probability-service";
import type { SportId } from "@/types/core/sport";
import type {
  ModelRunner,
  ModelRunResult,
  PredictionMatchRef,
} from "@/lib/ai/prediction-service";

export function createRealModelRunner(
  runFn: typeof runProbabilityModel = runProbabilityModel,
): ModelRunner {
  return {
    async run(match: PredictionMatchRef): Promise<ModelRunResult> {
      const result = await runFn(
        match.sport_id as SportId,
        match.league_id,
        match.season_id,
        match.id,
      );
      return {
        probabilities: { ...result.probabilities },
        expectedGoals: { ...result.expectedGoals },
        usedFallback: result.usedFallback,
        fallbackReason: result.fallbackReason,
        dataQuality: { ...result.dataQuality },
        parameters: { ...result.parameters },
        reproducibility: result.inputs
          ? {
              cutoff: result.inputs.cutoff,
              home: {
                matches: result.inputs.home.matches.map((m) => ({ ...m })),
                attack: result.inputs.home.attack,
                defense: result.inputs.home.defense,
              },
              away: {
                matches: result.inputs.away.matches.map((m) => ({ ...m })),
                attack: result.inputs.away.attack,
                defense: result.inputs.away.defense,
              },
              leagueAverages: { ...result.inputs.leagueAverages },
            }
          : null,
      };
    },
  };
}

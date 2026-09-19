import { createSyncSportmonksController } from "@/lib/api/sync-sportmonks-controller";
import { getEnv } from "@/lib/config/env";
import { compactSyncOutcome, defaultSportmonksSyncInput, runSportmonksCompetitionSync } from "@/lib/services/sportmonks-sync-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const { GET } = createSyncSportmonksController({
  getCronSecret: () => getEnv().CRON_SECRET,
  runSync: async () => {
    const outcome = await runSportmonksCompetitionSync(defaultSportmonksSyncInput());
    return compactSyncOutcome(outcome);
  },
});

export { GET };
import type { SportModule } from "@/types/core/sport";
import type { DataSource, EntityMapper, StatCalculator } from "@/types/core/data-source";
import { soccerConfig, type SoccerConfig } from "./config";
import { soccerMatchMapper } from "./mappers";
import { soccerMockSource } from "./data-sources/mock-source";
import { soccerStatsBombOpenDataSource } from "./data-sources/statsbomb-open-data-source";
import { soccerSportmonksSource } from "./data-sources/sportmonks-argentina-source";
import {
  soccerStandingsCalculator,
  soccerPlayerAggregateCalculator,
} from "./statistics/calculators";

const soccerModule: SportModule<SoccerConfig> = {
  id: "soccer",
  name: "soccer",
  displayName: "Fútbol",
  emoji: "⚽",
  config: soccerConfig as unknown as SoccerConfig,
  routesPath: "/soccer",
  dataSources: {
    mock: soccerMockSource as unknown as DataSource<unknown, unknown>,
    statsbomb: soccerStatsBombOpenDataSource as unknown as DataSource<unknown, unknown>,
    sportmonks: soccerSportmonksSource as unknown as DataSource<unknown, unknown>,
  },
  mappers: {
    match: soccerMatchMapper as unknown as EntityMapper<unknown, unknown>,
  },
  calculators: {
    standings:
      soccerStandingsCalculator as unknown as StatCalculator<unknown, unknown>,
    playerAggregate:
      soccerPlayerAggregateCalculator as unknown as StatCalculator<
        unknown,
        unknown
      >,
  },
};

export default soccerModule;
export { soccerModule };

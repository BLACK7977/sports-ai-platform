import type { DataSource } from "./data-source";
import type { StatCalculator } from "./data-source";
import type { EntityMapper } from "./data-source";

export type SportId = string;

export interface SportModuleConfig {
  pointsPerWin?: number;
  pointsPerDraw?: number;
  playerPositions?: readonly string[];
  [key: string]: unknown;
}

export interface SportModule<TConfig extends SportModuleConfig = SportModuleConfig> {
  id: SportId;
  name: string;
  displayName: string;
  emoji: string;
  config: TConfig;
  routesPath: string;
  dataSources: Record<string, DataSource<unknown, unknown>>;
  mappers: Record<string, EntityMapper<unknown, unknown>>;
  calculators: Record<string, StatCalculator<unknown, unknown>>;
}

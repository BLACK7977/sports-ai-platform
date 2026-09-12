export const soccerConfig = {
  pointsPerWin: 3,
  pointsPerDraw: 1,
  pointsPerLoss: 0,
  playerPositions: [
    "Portero",
    "Defensa",
    "Mediocampista",
    "Delantero",
  ] as const,
  matchDurationMinutes: 90,
  maxSubstitutions: 5,
} as const;

export type SoccerConfig = typeof soccerConfig;

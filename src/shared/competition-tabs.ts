export function getCompetitionTabs(sport: string) {
  return [
    { label: "Resumen", href: `/${sport}` },
    { label: "Partidos", href: `/${sport}/matches` },
    { label: "Tabla", href: `/${sport}/standings` },
    { label: "Equipos", href: `/${sport}/players` },
    { label: "Estadísticas", href: `/${sport}/leaderboard` },
  ];
}

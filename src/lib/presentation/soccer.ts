const POSITION_LABELS: Record<string, string> = {
  goalkeeper: "Arquero",
  defender: "Defensor",
  midfielder: "Mediocampista",
  attacker: "Delantero",
  forward: "Delantero",
  "central midfield": "Mediocampista central",
  "defensive midfield": "Mediocampista defensivo",
  "attacking midfield": "Mediocampista ofensivo",
  "centre back": "Defensor central",
  "right back": "Lateral derecho",
  "left back": "Lateral izquierdo",
  "right midfield": "Volante derecho",
  "left midfield": "Volante izquierdo",
  "right wing": "Extremo derecho",
  "left wing": "Extremo izquierdo",
  "centre forward": "Delantero centro",
};

/** Provider terminology stays in storage; this only adapts public Spanish UI. */
export function presentSoccerPosition(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  return POSITION_LABELS[value.trim().toLowerCase()] ?? value.trim();
}

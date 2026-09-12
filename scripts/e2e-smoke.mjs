const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
const checks = [
  ["/", 200],
  ["/soccer", 200],
  ["/soccer/matches", 200],
  ["/soccer/matches/m-l1-1", 200],
  ["/soccer/players", 200],
  ["/soccer/standings", 200],
  ["/soccer/leaderboard", 200],
  ["/soccer/matches/no-existe", 404],
];

for (const [path, expected] of checks) {
  const response = await fetch(`${baseUrl}${path}`);
  if (response.status !== expected) {
    throw new Error(`${path}: expected ${expected}, got ${response.status}`);
  }
  console.log(`PASS ${response.status} ${path}`);
}
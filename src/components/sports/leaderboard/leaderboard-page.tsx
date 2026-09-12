import Link from "next/link";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  CardSubtitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Container, Stack, Row, Divider } from "@/components/ui/container";
import { LinkButton } from "@/components/ui/button";
import {
  DataTable,
  TableHead,
  Th,
  TableBody,
  Tr,
  Td,
} from "@/components/ui/table";
import { MiniGauge, StandingsBars } from "@/components/charts/svg-charts";
import { getHasSport } from "@/components/sports/sport-helpers";
import type { SoccerPlayerSeasonAggregate } from "@/sports/soccer/types";

type RankRow = SoccerPlayerSeasonAggregate & { teamName: string };

function medalColor(i: number) {
  if (i === 0) return "bg-yellow-400 text-yellow-900";
  if (i === 1) return "bg-slate-300 text-slate-700";
  if (i === 2) return "bg-amber-600 text-amber-50";
  return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200";
}

export default async function LeaderboardPage({
  sport,
  leagueName,
  seasonName,
  squadRanking,
  topN = 15,
  chart = "goals",
}: {
  sport: string;
  leagueName: string;
  seasonName: string;
  squadRanking: RankRow[];
  topN?: number;
  chart?: "goals" | "assists" | "ga";
}) {
  const has = getHasSport(sport);
  const sportEmoji = has?.sport.emoji ?? "⚽";
  const sportName = has?.sport.displayName ?? "Deporte";

  const byGoals = [...squadRanking]
    .sort((a, b) => b.goals - a.goals || b.assists - a.assists)
    .slice(0, topN);
  const byAssists = [...squadRanking]
    .sort((a, b) => b.assists - a.assists || b.goals - a.goals)
    .slice(0, topN);
  const byGa = [...squadRanking]
    .sort(
      (a, b) =>
        b.goals + b.assists - (a.goals + a.assists) ||
        b.goals - a.goals,
    )
    .slice(0, topN);
  const byCards = [...squadRanking]
    .sort(
      (a, b) =>
        b.yellowCards * 1 + b.redCards * 3 - (a.yellowCards * 1 + a.redCards * 3),
    )
    .slice(0, 10);
  const maxG = Math.max(1, ...byGoals.map((r) => r.goals));
  const maxA = Math.max(1, ...byAssists.map((r) => r.assists));
  const maxGa = Math.max(1, ...byGa.map((r) => r.goals + r.assists));

  const chartRows = chart === "assists" ? byAssists : chart === "ga" ? byGa : byGoals;
  const chartMax = chart === "assists" ? maxA : chart === "ga" ? maxGa : maxG;
  const chartLabel = chart === "assists" ? "asistencias" : chart === "ga" ? "G+A" : "goles";
  const chartData = chartRows.slice(0, 8).map((r) => ({
    name: r.fullName,
    short: r.fullName.split(" ").slice(-1).join(" ") || r.fullName.slice(0, 8),
    value: chart === "assists" ? r.assists : chart === "ga" ? r.goals + r.assists : r.goals,
    max: chartMax,
  }));

  return (
    <Container size="wide">
      <Stack gap="xl">
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div className="space-y-2">
            <Row className="flex-wrap gap-2">
              <Badge tone="primary">
                <span className="mr-1">{sportEmoji}</span>
                {sportName}
              </Badge>
              <Badge tone="info">{leagueName}</Badge>
              <Badge tone="neutral">{seasonName}</Badge>
              <Badge tone="success">{squadRanking.length} jugadores</Badge>
            </Row>
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white">
              Tabla de líderes
            </h1>
            <p className="text-slate-500 max-w-2xl">
              Goleadores, asistentes, G+A total y tarjetas. Ranking por equipo
              con comparativo visual.
            </p>
          </div>
          <Row className="flex-wrap gap-2">
            <LinkButton href={`/${sport}`} tone="ghost" size="md">
              ← Volver
            </LinkButton>
            <LinkButton href={`/${sport}/standings`} tone="outline" size="md">
              Tabla equipos
            </LinkButton>
            <LinkButton href={`/${sport}/matches`} tone="primary" size="md">
              Fixtures
            </LinkButton>
          </Row>
        </header>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardBody>
              <div className="text-xs text-slate-500">Goles (temporada)</div>
              <div className="text-3xl font-bold">
                {squadRanking.reduce((a, r) => a + r.goals, 0)}
              </div>
              <div className="text-xs text-emerald-600 mt-2 font-medium">
                Líder: {byGoals[0]?.fullName ?? "—"} · {byGoals[0]?.goals ?? 0}G
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <div className="text-xs text-slate-500">Asistencias</div>
              <div className="text-3xl font-bold">
                {squadRanking.reduce((a, r) => a + r.assists, 0)}
              </div>
              <div className="text-xs text-indigo-600 mt-2 font-medium">
                Líder: {byAssists[0]?.fullName ?? "—"} · {byAssists[0]?.assists ?? 0}A
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <div className="text-xs text-slate-500">Partidos jugados</div>
              <div className="text-3xl font-bold tabular-nums">
                {squadRanking.reduce((a, r) => a + r.matchesPlayed, 0)}
              </div>
              <div className="text-xs text-slate-500 mt-2">Acumulado liga</div>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <div className="text-xs text-slate-500">Tarjetas (TA+3·TR)</div>
              <div className="text-3xl font-bold tabular-nums text-amber-600">
                {squadRanking.reduce(
                  (a, r) => a + r.yellowCards + r.redCards * 3,
                  0,
                )}
              </div>
              <div className="text-xs text-slate-500 mt-2">
                Índice disciplinario
              </div>
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Comparativo de rendimiento</CardTitle>
            <CardSubtitle>Primeros 8 puestos · {chartLabel}</CardSubtitle>
          </CardHeader>
          <CardBody>
            <nav aria-label="Métrica de gráfica" className="mb-4 flex flex-wrap gap-2">
              {([
                ["goals", "Goles"],
                ["assists", "Asistencias"],
                ["ga", "G+A"],
              ] as const).map(([value, label]) => (
                <LinkButton
                  key={value}
                  href={`/${sport}/leaderboard?chart=${value}`}
                  size="sm"
                  tone={chart === value ? "primary" : "outline"}
                >
                  {label}
                </LinkButton>
              ))}
            </nav>
            {chartRows.length === 0 ? (
              <p className="text-sm text-slate-400">Sin datos.</p>
            ) : (
              <StandingsBars data={chartData} />
            )}
          </CardBody>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Tabla goleadores · Top {topN}</CardTitle>
              <CardSubtitle>Desempate: asistencias</CardSubtitle>
            </CardHeader>
            <CardBody className="!p-0">
              <DataTable>
                <TableHead>
                  <tr>
                    <Th className="w-10">#</Th>
                    <Th>Jugador</Th>
                    <Th>Equipo</Th>
                    <Th className="text-right">PJ</Th>
                    <Th className="text-right">G</Th>
                    <Th className="w-[160px]"></Th>
                  </tr>
                </TableHead>
                <TableBody>
                  {byGoals.map((r, i) => (
                    <Tr key={r.playerId} hoverable>
                      <Td>
                        <span
                          className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold ${medalColor(
                            i,
                          )}`}
                        >
                          {i + 1}
                        </span>
                      </Td>
                      <Td>
                        <Link
                          href={`/${sport}/players/${r.playerId}`}
                          className="font-medium hover:underline text-slate-800 dark:text-slate-100"
                        >
                          {r.fullName}
                        </Link>
                        <div className="text-xs text-slate-500">
                          {r.position}
                        </div>
                      </Td>
                      <Td className="text-slate-600 dark:text-slate-300">
                        <Badge tone="neutral">{r.teamName}</Badge>
                      </Td>
                      <Td className="text-right tabular-nums">
                        {r.matchesPlayed}
                      </Td>
                      <Td className="text-right tabular-nums font-bold text-emerald-600 text-lg">
                        {r.goals}
                      </Td>
                      <Td>
                        <MiniGauge
                          value={r.goals}
                          max={maxG}
                          tone="success"
                        />
                      </Td>
                    </Tr>
                  ))}
                </TableBody>
              </DataTable>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tabla asistentes · Top {topN}</CardTitle>
              <CardSubtitle>Desempate: goles</CardSubtitle>
            </CardHeader>
            <CardBody className="!p-0">
              <DataTable>
                <TableHead>
                  <tr>
                    <Th className="w-10">#</Th>
                    <Th>Jugador</Th>
                    <Th>Equipo</Th>
                    <Th className="text-right">PJ</Th>
                    <Th className="text-right">A</Th>
                    <Th className="w-[160px]"></Th>
                  </tr>
                </TableHead>
                <TableBody>
                  {byAssists.map((r, i) => (
                    <Tr key={r.playerId} hoverable>
                      <Td>
                        <span
                          className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold ${medalColor(
                            i,
                          )}`}
                        >
                          {i + 1}
                        </span>
                      </Td>
                      <Td>
                        <Link
                          href={`/${sport}/players/${r.playerId}`}
                          className="font-medium hover:underline text-slate-800 dark:text-slate-100"
                        >
                          {r.fullName}
                        </Link>
                        <div className="text-xs text-slate-500">
                          {r.position}
                        </div>
                      </Td>
                      <Td className="text-slate-600 dark:text-slate-300">
                        <Badge tone="neutral">{r.teamName}</Badge>
                      </Td>
                      <Td className="text-right tabular-nums">
                        {r.matchesPlayed}
                      </Td>
                      <Td className="text-right tabular-nums font-bold text-indigo-600 text-lg">
                        {r.assists}
                      </Td>
                      <Td>
                        <MiniGauge
                          value={r.assists}
                          max={maxA}
                          tone="primary"
                        />
                      </Td>
                    </Tr>
                  ))}
                </TableBody>
              </DataTable>
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>
              Jugadores más influyentes · G + A · Top {topN}
            </CardTitle>
            <CardSubtitle>
              Suma ponderada de goles y asistencias. Impacto total.
            </CardSubtitle>
          </CardHeader>
          <CardBody className="!p-0">
            <DataTable>
              <TableHead>
                <tr>
                  <Th className="w-10">#</Th>
                  <Th>Jugador</Th>
                  <Th>Equipo</Th>
                  <Th className="text-right">PJ</Th>
                  <Th className="text-right">Min</Th>
                  <Th className="text-right">G</Th>
                  <Th className="text-right">A</Th>
                  <Th className="text-right">G+A</Th>
                  <Th className="w-[200px]"></Th>
                </tr>
              </TableHead>
              <TableBody>
                {byGa.map((r, i) => (
                  <Tr key={r.playerId} hoverable>
                    <Td>
                      <span
                        className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold ${medalColor(
                          i,
                        )}`}
                      >
                        {i + 1}
                      </span>
                    </Td>
                    <Td>
                      <Link
                        href={`/${sport}/players/${r.playerId}`}
                        className="font-medium hover:underline text-slate-800 dark:text-slate-100"
                      >
                        {r.fullName}
                      </Link>
                      <div className="text-xs text-slate-500">{r.position}</div>
                    </Td>
                    <Td className="text-slate-600 dark:text-slate-300">
                      <Badge tone="neutral">{r.teamName}</Badge>
                    </Td>
                    <Td className="text-right tabular-nums">
                      {r.matchesPlayed}
                    </Td>
                    <Td className="text-right tabular-nums">{r.totalMinutes}</Td>
                    <Td className="text-right tabular-nums font-semibold text-emerald-600">
                      {r.goals}
                    </Td>
                    <Td className="text-right tabular-nums font-semibold text-indigo-600">
                      {r.assists}
                    </Td>
                    <Td className="text-right tabular-nums font-black text-fuchsia-600 text-lg">
                      {r.goals + r.assists}
                    </Td>
                    <Td>
                      <MiniGauge
                        value={r.goals + r.assists}
                        max={maxGa}
                        tone={i === 0 ? "success" : "primary"}
                      />
                    </Td>
                  </Tr>
                ))}
              </TableBody>
            </DataTable>
          </CardBody>
        </Card>

        <Divider label="Disciplina" />

        <Card>
          <CardHeader>
            <CardTitle>Tarjetas · Top 10</CardTitle>
            <CardSubtitle>
              Índice: 1 punto por amarilla, 3 por roja
            </CardSubtitle>
          </CardHeader>
          <CardBody className="!p-0">
            {byCards.every((c) => c.yellowCards + c.redCards === 0) ? (
              <div className="p-6 text-sm text-slate-400">
                Sin tarjetas registradas en modo demo.
              </div>
            ) : (
              <DataTable>
                <TableHead>
                  <tr>
                    <Th className="w-10">#</Th>
                    <Th>Jugador</Th>
                    <Th>Equipo</Th>
                    <Th className="text-right">TA</Th>
                    <Th className="text-right">TR</Th>
                    <Th className="text-right">Índice</Th>
                  </tr>
                </TableHead>
                <TableBody>
                  {byCards.map((r, i) => (
                    <Tr key={r.playerId} hoverable>
                      <Td>
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200">
                          {i + 1}
                        </span>
                      </Td>
                      <Td>
                        <Link
                          href={`/${sport}/players/${r.playerId}`}
                          className="font-medium hover:underline text-slate-800 dark:text-slate-100"
                        >
                          {r.fullName}
                        </Link>
                      </Td>
                      <Td>
                        <Badge tone="neutral">{r.teamName}</Badge>
                      </Td>
                      <Td className="text-right tabular-nums">
                        <Badge tone="warning">{r.yellowCards}</Badge>
                      </Td>
                      <Td className="text-right tabular-nums">
                        <Badge tone="danger">{r.redCards}</Badge>
                      </Td>
                      <Td className="text-right tabular-nums font-bold text-amber-700 dark:text-amber-300">
                        {r.yellowCards + r.redCards * 3}
                      </Td>
                    </Tr>
                  ))}
                </TableBody>
              </DataTable>
            )}
          </CardBody>
        </Card>
      </Stack>
    </Container>
  );
}

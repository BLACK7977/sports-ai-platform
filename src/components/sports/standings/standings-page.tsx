import Link from "next/link";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  CardSubtitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Container, Stack, Row } from "@/components/ui/container";
import { LinkButton } from "@/components/ui/button";
import {
  DataTable,
  TableHead,
  Th,
  TableBody,
  Tr,
  Td,
} from "@/components/ui/table";
import { getHasSport } from "@/components/sports/sport-helpers";
import { StandingsBars, TeamFormStrip } from "@/components/charts/svg-charts";
import type { SoccerStandingsRow } from "@/sports/soccer/types";

export default async function StandingsPage({
  sport,
  leagueName,
  seasonName,
  standings,
}: {
  sport: string;
  leagueName: string;
  seasonName: string;
  standings: SoccerStandingsRow[];
}) {
  const has = getHasSport(sport);
  const sportEmoji = has?.sport.emoji ?? "⚽";
  const sportName = has?.sport.displayName ?? "Deporte";

  const maxPts = Math.max(1, ...standings.map((s) => s.points));

  return (
    <Container size="wide">
      <Stack gap="xl">
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div className="space-y-2">
            <Row>
              <Badge tone="primary">
                <span className="mr-1">{sportEmoji}</span>
                {sportName}
              </Badge>
              <Badge tone="info">{leagueName}</Badge>
              <Badge tone="neutral">{seasonName}</Badge>
            </Row>
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white">
              Tabla de posiciones
            </h1>
            <p className="text-slate-500 max-w-2xl">
              Clasificación oficial con forma reciente, diferencia de gol y
              gráfico comparativo de puntos.
            </p>
          </div>
          <Row className="flex-wrap gap-2">
            <LinkButton href={`/${sport}`} tone="ghost" size="md">
              ← Volver
            </LinkButton>
            <LinkButton href={`/${sport}/matches`} tone="outline" size="md">
              Ver fixtures
            </LinkButton>
            <LinkButton
              href={`/${sport}/leaderboard`}
              tone="primary"
              size="md"
            >
              Ranking jugadores
            </LinkButton>
          </Row>
        </header>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardBody>
              <div className="text-xs text-slate-500">Equipos</div>
              <div className="text-3xl font-bold">{standings.length}</div>
              <div className="text-xs text-slate-500 mt-2">
                {standings.reduce((a, s) => a + s.played, 0) / 2} fechas
                disputadas
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <div className="text-xs text-slate-500">Líder</div>
              <div className="text-2xl font-bold truncate">
                {standings[0]?.teamName ?? "—"}
              </div>
              <div className="text-xs text-emerald-600 mt-2 font-medium">
                {standings[0]?.points ?? 0} pts
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <div className="text-xs text-slate-500">Goles a favor</div>
              <div className="text-3xl font-bold">
                {standings.reduce((a, s) => a + s.goalsFor, 0)}
              </div>
              <div className="text-xs text-slate-500 mt-2">Temporada</div>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <div className="text-xs text-slate-500">Dif. gol total</div>
              <div
                className={`text-3xl font-bold ${
                  standings.reduce((a, s) => a + s.goalDifference, 0) >= 0
                    ? "text-emerald-600"
                    : "text-rose-600"
                }`}
              >
                {standings.reduce((a, s) => a + s.goalDifference, 0) >= 0
                  ? "+"
                  : ""}
                {standings.reduce((a, s) => a + s.goalDifference, 0)}
              </div>
              <div className="text-xs text-slate-500 mt-2">Acumulado</div>
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Comparativo de puntos</CardTitle>
            <CardSubtitle>Barras por equipo · colores por puesto</CardSubtitle>
          </CardHeader>
          <CardBody>
            {standings.length === 0 ? (
              <p className="text-sm text-slate-400">Sin datos.</p>
            ) : (
              <StandingsBars
                data={standings.map((s) => ({
                  name: s.teamName,
                  short: s.shortName,
                  value: s.points,
                  max: maxPts,
                }))}
              />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tabla completa</CardTitle>
            <CardSubtitle>
              Criterio: Puntos → Dif. gol → Goles a favor → Nombre
            </CardSubtitle>
          </CardHeader>
          <CardBody className="!p-0">
            {standings.length === 0 ? (
              <div className="p-6 text-sm text-slate-400">Sin datos.</div>
            ) : (
              <DataTable>
                <TableHead>
                  <tr>
                    <Th className="w-10">#</Th>
                    <Th>Equipo</Th>
                    <Th className="text-right">PJ</Th>
                    <Th className="text-right">W</Th>
                    <Th className="text-right">D</Th>
                    <Th className="text-right">L</Th>
                    <Th className="text-right">GF</Th>
                    <Th className="text-right">GC</Th>
                    <Th className="text-right">Diff</Th>
                    <Th className="text-right">Pts</Th>
                    <Th className="min-w-[120px]">Forma</Th>
                  </tr>
                </TableHead>
                <TableBody>
                  {standings.map((s, i) => (
                    <Tr key={s.teamId} hoverable>
                      <Td>
                        <span
                          className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold ${
                            i === 0
                              ? "bg-indigo-600 text-white"
                              : i === 1
                                ? "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-200"
                                : i === 2
                                  ? "bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-200"
                                  : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200"
                          }`}
                        >
                          {i + 1}
                        </span>
                      </Td>
                      <Td>
                        <Link
                          href={`/${sport}/leaderboard`}
                          className="font-medium hover:underline text-slate-800 dark:text-slate-100"
                        >
                          {s.teamName}
                        </Link>
                      </Td>
                      <Td className="text-right tabular-nums">{s.played}</Td>
                      <Td className="text-right tabular-nums text-emerald-600 font-medium">
                        {s.won}
                      </Td>
                      <Td className="text-right tabular-nums text-amber-600 font-medium">
                        {s.drawn}
                      </Td>
                      <Td className="text-right tabular-nums text-rose-600 font-medium">
                        {s.lost}
                      </Td>
                      <Td className="text-right tabular-nums">{s.goalsFor}</Td>
                      <Td className="text-right tabular-nums">
                        {s.goalsAgainst}
                      </Td>
                      <Td
                        className={`text-right tabular-nums font-semibold ${
                          s.goalDifference >= 0
                            ? "text-emerald-600"
                            : "text-rose-600"
                        }`}
                      >
                        {s.goalDifference >= 0 ? "+" : ""}
                        {s.goalDifference}
                      </Td>
                      <Td className="text-right tabular-nums font-bold text-lg">
                        {s.points}
                      </Td>
                      <Td>
                        <TeamFormStrip form={s.recentForm} size={20} />
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

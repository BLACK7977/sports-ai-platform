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
  EmptyRow,
} from "@/components/ui/table";
import { PlayerStatsRadar, MiniGauge } from "@/components/charts/svg-charts";
import PlayerReportPanel from "@/components/sports/players/player-report-panel";
import { getHasSport } from "@/components/sports/sport-helpers";
import type { Player, Team } from "@/types/db/tables";
import type { SoccerPlayerSeasonAggregate } from "@/sports/soccer/types";

function jerseyColor(teamId: string) {
  const colors = [
    ["bg-indigo-500", "text-white"],
    ["bg-emerald-500", "text-white"],
    ["bg-rose-500", "text-white"],
    ["bg-amber-500", "text-white"],
    ["bg-sky-500", "text-white"],
    ["bg-violet-500", "text-white"],
  ];
  let h = 0;
  for (let i = 0; i < teamId.length; i++)
    h = (h * 31 + teamId.charCodeAt(i)) >>> 0;
  return colors[h % colors.length];
}

function playerAge(dateOfBirth?: string): number | null {
  if (!dateOfBirth) return null;
  const birth = new Date(dateOfBirth);
  if (!Number.isFinite(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  if (today < new Date(today.getFullYear(), birth.getMonth(), birth.getDate())) age--;
  return age;
}

export default async function PlayerDetailPage({
  sport,
  leagueId,
  seasonId,
  seasonName,
  player,
  team,
  seasonAgg,
  careerStats,
  allSeasonRank,
  plan,
}: {
  sport: string;
  leagueId: string;
  seasonId: string;
  seasonName: string;
  player: Player;
  team: Team | null;
  seasonAgg: SoccerPlayerSeasonAggregate | null;
  careerStats: Awaited<
    ReturnType<
      typeof import("@/lib/services/statistics-service").getPlayerCareerStats
    >
  >;
  allSeasonRank: SoccerPlayerSeasonAggregate[];
  plan: "free" | "pro";
}) {
  const has = getHasSport(sport);
  const sportEmoji = has?.sport.emoji ?? "⚽";
  const sportName = has?.sport.displayName ?? "Deporte";
  const [jBg, jTxt] = jerseyColor(player.team_id);
  const age = playerAge(player.date_of_birth);

  const goals = seasonAgg?.goals ?? careerStats.goals;
  const assists = seasonAgg?.assists ?? careerStats.assists;
  const played = seasonAgg?.matchesPlayed ?? careerStats.matchesPlayed;
  const minutes = seasonAgg?.totalMinutes ?? careerStats.totalMinutes;
  const passAcc = seasonAgg?.avgPassAccuracyPct ?? null;
  const yellows = seasonAgg?.yellowCards ?? careerStats.yellowCards;
  const reds = seasonAgg?.redCards ?? careerStats.redCards;
  const rating = careerStats.ratingAvg > 0 ? careerStats.ratingAvg : null;

  const maxG = Math.max(1, ...allSeasonRank.map((r) => r.goals), goals);
  const maxA = Math.max(1, ...allSeasonRank.map((r) => r.assists), assists);
  const maxMin = Math.max(
    1,
    ...allSeasonRank.map((r) => r.totalMinutes),
    minutes,
  );
  const maxPass = 100;
  const tacklesEst = null;
  const maxTackles = Math.max(
    1,
    ...allSeasonRank.map((r) => Math.round(r.matchesPlayed * 1.8)),
  );
  const maxRating = 10;

  const radarValues = [
    Math.round((goals / maxG) * 100),
    Math.round((assists / maxA) * 100),
    Math.round(((passAcc ?? 0) / maxPass) * 100),
    Math.round((minutes / maxMin) * 100),
    Math.round(((tacklesEst ?? 0) / maxTackles) * 100),
    Math.min(100, Math.round(((rating ?? 0) / maxRating) * 100)),
  ];
const radarLabels = [
    "Goles",
    "Asistencias",
    "Prec. Pase",
    "Minutos",
    "Recuperos",
    "Rating",
  ];

  return (
    <Container size="wide" className="product-page player-detail-page">
      <Stack gap="xl">
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <Row className="flex-wrap gap-2">
            <LinkButton href={`/${sport}/players`} tone="ghost" size="md">
              ← Todos los jugadores
            </LinkButton>
          </Row>
          <Row className="flex-wrap gap-2">
            <LinkButton href={`/${sport}/standings`} tone="outline" size="md">
              Tabla
            </LinkButton>
            <LinkButton
              href={`/${sport}/leaderboard`}
              tone="primary"
              size="md"
            >
              Ranking
            </LinkButton>
          </Row>
        </header>

        <Card className="product-panel overflow-hidden">
          <div
            className={`h-40 ${jBg} bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 relative`}
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.25),transparent_60%)]" />
          </div>
          <CardBody className="-mt-24 relative z-10">
            <div className="flex flex-col md:flex-row gap-6 md:items-end">
              <div
                className={`h-32 w-32 rounded-2xl flex items-center justify-center text-5xl font-black border-4 border-white dark:border-slate-900 shadow-lg ${jBg} ${jTxt}`}
              >
                #{player.jersey_number ?? player.full_name[0] ?? "?"}
              </div>
              <div className="flex-1 min-w-0 space-y-3">
                <Row className="flex-wrap gap-2">
                  <Badge tone="primary">
                    <span className="mr-1">{sportEmoji}</span>
                    {sportName}
                  </Badge>
                  <Badge tone="info">{seasonName}</Badge>
                  <Badge tone="success">
                    {player.position ?? "Posición"}
                  </Badge>
                  {team ? (
                    <Badge tone="neutral">{team.name}</Badge>
                  ) : null}
                  {player.nationality ? (
                    <Badge tone="warning">{player.nationality}</Badge>
                  ) : null}
                  {age !== null ? <Badge tone="neutral">{age} años</Badge> : null}
                </Row>
                <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white break-words">
                  {player.full_name}
                </h1>
                <p className="text-slate-500 max-w-3xl">
                  Dorsal #{player.jersey_number ?? "—"}{player.date_of_birth ? ` · Nació el ${new Date(player.date_of_birth).toLocaleDateString("es-AR")}` : ""} · Últimos partidos con
                  análisis de rendimiento e IA.
                </p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-2 gap-3 w-full md:w-auto">
                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 text-center">
                  <div className="text-xs text-slate-500">Goles</div>
                  <div className="text-2xl font-bold text-emerald-600">
                    {goals}
                  </div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 text-center">
                  <div className="text-xs text-slate-500">Asistencias</div>
                  <div className="text-2xl font-bold text-indigo-600">
                    {assists}
                  </div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 text-center">
                  <div className="text-xs text-slate-500">Partidos</div>
                  <div className="text-2xl font-bold">{played}</div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 text-center">
                  <div className="text-xs text-slate-500">Minutos</div>
                  <div className="text-2xl font-bold tabular-nums">
                    {minutes}
                  </div>
                </div>
              </div>
            </div>
          </CardBody>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="product-panel lg:col-span-2">
            <CardHeader>
              <CardTitle>Perfil de rendimiento</CardTitle>
              <CardSubtitle>
                Radar comparativo · ejes normalizados sobre el máximo de la
                liga
              </CardSubtitle>
            </CardHeader>
            <CardBody>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                <PlayerStatsRadar
                  labels={radarLabels}
                  values={radarValues}
                  label={`Radar ${player.full_name}`}
                />
                <Stack gap="md">
                  <div>
                    <MiniGauge
                      value={goals}
                      max={maxG}
                      label={`Goles (liga max ${maxG})`}
                      tone="success"
                    />
                  </div>
                  <div>
                    <MiniGauge
                      value={assists}
                      max={maxA}
                      label={`Asistencias (liga max ${maxA})`}
                      tone="primary"
                    />
                  </div>
                  <div>
                    {passAcc === null ? (
                      <p className="text-sm text-slate-400">Precisión de pases: No disponible</p>
                    ) : (
                      <MiniGauge value={passAcc} max={100} label="Precisión de pases %" tone="primary" />
                    )}
                  </div>
                  <div>
                    <MiniGauge
                      value={minutes}
                      max={maxMin}
                      label={`Minutos jugados (liga max ${maxMin})`}
                      tone="success"
                    />
                  </div>
                  <div>
                    {rating === null ? (
                      <p className="text-sm text-slate-400">Rating promedio: No disponible</p>
                    ) : (
                      <MiniGauge
                        value={Math.min(10, rating)}
                        max={10}
                        label={`Rating promedio ${rating.toFixed(1)} / 10`}
                        tone={rating >= 7.5 ? "success" : rating >= 6.5 ? "warning" : "danger"}
                      />
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-lg p-3 text-center">
                      <div className="text-xs text-amber-700 dark:text-amber-300">
                        TA
                      </div>
                      <div className="text-xl font-bold text-amber-700 dark:text-amber-200">
                        {yellows}
                      </div>
                    </div>
                    <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-lg p-3 text-center">
                      <div className="text-xs text-rose-700 dark:text-rose-300">
                        TR
                      </div>
                      <div className="text-xl font-bold text-rose-700 dark:text-rose-200">
                        {reds}
                      </div>
                    </div>
                  </div>
                </Stack>
              </div>
            </CardBody>
          </Card>

<PlayerReportPanel
            sport={sport}
            leagueId={leagueId}
            seasonId={seasonId}
            playerId={player.id}
            plan={plan}
          />
        </div>

        <Card className="product-panel">
          <CardHeader>
            <CardTitle>Últimos partidos</CardTitle>
            <CardSubtitle>
              Rendimiento por encuentro · orden reciente
            </CardSubtitle>
          </CardHeader>
          <CardBody className="!p-0">
{careerStats.matches.length === 0 ? (
              <DataTable>
                <TableBody>
                  <EmptyRow
                    message="Sin partidos registrados para este jugador (modo demo)."
                    cols={6}
                  />
                </TableBody>
              </DataTable>
            ) : (
              <DataTable>
                <TableHead>
                    <Th>Fecha</Th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 bg-slate-50 dark:bg-slate-900 dark:text-slate-400">
                      Rival
                    </th>
                    <Th className="text-right">Min</Th>
                    <Th className="text-right">G</Th>
                    <Th className="text-right">A</Th>
                    <Th className="w-24"></Th>
                </TableHead>
                <TableBody>
                  {careerStats.matches.slice(0, 10).map((m, i) => (
                    <Tr key={i} hoverable>
                      <Td className="tabular-nums text-slate-600 dark:text-slate-300">
                        {m.matchDate
                          ? new Date(m.matchDate).toLocaleDateString("es-AR", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })
                          : "—"}
                      </Td>
                      <Td className="font-medium">
                        {m.opponent ? (
                          <Link
                            href={`/${sport}/standings`}
                            className="hover:underline"
                          >
                            vs {m.opponent}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </Td>
                      <Td className="text-right tabular-nums">{m.minutes}</Td>
                      <Td className="text-right tabular-nums font-semibold text-emerald-600">
                        {m.goals}
                      </Td>
                      <Td className="text-right tabular-nums font-semibold text-indigo-600">
                        {m.assists}
                      </Td>
                      <Td className="text-right">
                        <Badge
                          tone={
                            m.goals + m.assists >= 2
                              ? "success"
                              : m.minutes >= 75
                                ? "info"
                                : "neutral"
                          }
                        >
                          {m.goals + m.assists >= 2
                            ? "MVP"
                            : m.minutes >= 75
                              ? "Titular"
                              : "Rotación"}
                        </Badge>
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

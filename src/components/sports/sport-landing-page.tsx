import Link from "next/link";
import { notFound } from "next/navigation";
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
import { getHasSport } from "@/components/sports/sport-helpers";
import { getLeaguesBySportId } from "@/lib/db/repositories/leagues-repo";
import { getMatchesBySportId } from "@/lib/db/repositories/matches-repo";
import { countPlayers } from "@/lib/db/repositories/players-repo";
import {
  getTeamStandings,
  getPlayerSeasonRanking,
} from "@/lib/services/statistics-service";
import { StandingsBars, TeamFormStrip } from "@/components/charts/svg-charts";
import { ensureDbReady } from "@/lib/db/client";

export default async function SportLandingPage({
  sport,
}: {
  sport: string;
}) {
  const has = getHasSport(sport);
  if (!has) notFound();

  await ensureDbReady();
  const sportDef = has.sport;
  const [leagues, matches, totalPlayers] = await Promise.all([
    getLeaguesBySportId(sport),
    getMatchesBySportId(sport),
    countPlayers(),
  ]);

  const mainLeague = leagues.find((l) => l.id === "demo-liga-1") ?? leagues[0];
  const mainSeason = mainLeague?.id === "demo-liga-1" ? "season-2026-1" : (mainLeague ? `season-${mainLeague.id}` : "");
  const standings = mainLeague && mainSeason
    ? await getTeamStandings(sport, mainLeague.id, mainSeason)
    : [];

  const topPlayers = mainLeague && mainSeason
    ? (await getPlayerSeasonRanking(sport, mainLeague.id, mainSeason)).slice(0, 5)
    : [];

  const finished = matches.filter((m) => m.status === "finished").length;
  const scheduled = matches.filter((m) => m.status === "scheduled").length;

  return (
    <Container size="wide">
      <Stack gap="xl">
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div className="space-y-2">
            <Row>
              <Badge tone="primary">
                <span className="mr-1">{sportDef.emoji}</span>
                {sportDef.displayName}
              </Badge>
              <Badge tone="info">{leagues.length} ligas</Badge>
              <Badge tone="neutral">{totalPlayers} jugadores</Badge>
            </Row>
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white">
              {sportDef.displayName} · Centro de estadísticas
            </h1>
            <p className="text-slate-500 max-w-2xl">
              Tabla de posiciones, fixtures, pronósticos y reportes de jugador
              con IA. Datos demo offline listos para explorar.
            </p>
          </div>
          <Row className="flex-wrap">
            <LinkButton href={`/${sport}/matches`} tone="primary" size="md">
              Fixtures
            </LinkButton>
            <LinkButton href={`/${sport}/standings`} tone="outline" size="md">
              Tabla
            </LinkButton>
            <LinkButton href={`/${sport}/players`} tone="outline" size="md">
              Jugadores
            </LinkButton>
            <LinkButton href={`/${sport}/leaderboard`} tone="ghost" size="md">
              Ranking
            </LinkButton>
          </Row>
        </header>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardBody>
              <div className="text-xs text-slate-500">Partidos totales</div>
              <div className="text-3xl font-bold">{matches.length}</div>
              <Row className="mt-2">
                <Badge tone="success">{finished} finalizados</Badge>
                <Badge tone="info">{scheduled} programados</Badge>
              </Row>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <div className="text-xs text-slate-500">Ligas</div>
              <div className="text-3xl font-bold">{leagues.length}</div>
              <div className="text-xs text-slate-500 mt-2 truncate">
                {leagues.map((l) => l.name).join(" · ")}
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <div className="text-xs text-slate-500">Equipos Liga1</div>
              <div className="text-3xl font-bold">{standings.length}</div>
              <div className="text-xs text-emerald-600 mt-2">
                Líder: {standings[0]?.teamName ?? "—"}
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <div className="text-xs text-slate-500">Jugadores únicos</div>
              <div className="text-3xl font-bold">
                {new Set(matches.flatMap((m) => [m.home_team_id, m.away_team_id])).size === 0 ? totalPlayers : totalPlayers}
              </div>
              <div className="text-xs text-slate-500 mt-2">
                Plantillas completas demo
              </div>
            </CardBody>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <Card className="lg:col-span-3">
            <CardHeader
              action={
                <LinkButton size="sm" tone="ghost" href={`/${sport}/standings`}>
                  Ver tabla completa
                </LinkButton>
              }
            >
              <CardTitle>Tabla de posiciones</CardTitle>
              <CardSubtitle>
                {mainLeague?.name ?? "Liga principal"}
              </CardSubtitle>
            </CardHeader>
            <CardBody>
              {standings.length === 0 ? (
                <p className="text-sm text-slate-400">Sin datos.</p>
              ) : (
                <div className="space-y-6">
                  <StandingsBars
                    data={standings.map((s) => ({
                      name: s.teamName,
                      short: s.shortName,
                      value: s.points,
                      max: Math.max(...standings.map((x) => x.points), 1),
                    }))}
                  />
                  <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                    {standings.map((s, i) => (
                      <li
                        key={s.teamId}
                        className="grid grid-cols-[32px_1fr_auto] items-center gap-3 py-2"
                      >
                        <span
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-lg font-semibold text-sm ${
                            i === 0
                              ? "bg-indigo-600 text-white"
                              : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200"
                          }`}
                        >
                          {i + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="font-medium text-slate-800 dark:text-slate-100 truncate">
                            <Link
                              href={`/${sport}/standings`}
                              className="hover:underline"
                            >
                              {s.teamName}
                            </Link>
                          </div>
                          <div className="mt-0.5 flex items-center gap-3 text-xs text-slate-500">
                            <span>PJ {s.played}</span>
                            <span>
                              GD {s.goalDifference >= 0 ? "+" : ""}
                              {s.goalDifference}
                            </span>
                            <TeamFormStrip form={s.recentForm} size={20} />
                          </div>
                        </div>
                        <span className="text-lg font-bold tabular-nums">
                          {s.points}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardBody>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader
              action={
                <LinkButton size="sm" tone="ghost" href={`/${sport}/leaderboard`}>
                  Ver ranking
                </LinkButton>
              }
            >
              <CardTitle>Top jugadores (G+A)</CardTitle>
              <CardSubtitle>Temporada actual</CardSubtitle>
            </CardHeader>
            <CardBody>
              <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                {topPlayers.length === 0 ? (
                  <li className="text-sm text-slate-400">Sin datos.</li>
                ) : (
                  topPlayers.map((p, i) => (
                    <li
                      key={p.playerId}
                      className="py-3 grid grid-cols-[32px_1fr_auto] items-center gap-3"
                    >
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600 text-sm font-semibold dark:bg-slate-800 dark:text-slate-200">
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <Link
                          href={`/${sport}/players/${p.playerId}`}
                          className="font-medium text-slate-800 dark:text-slate-100 hover:underline truncate block"
                        >
                          {p.fullName}
                        </Link>
                        <div className="text-xs text-slate-500 flex gap-3">
                          <span>{p.position}</span>
                          <span>{p.matchesPlayed} PJ</span>
                        </div>
                      </div>
                      <div className="text-right tabular-nums">
                        <div className="font-bold text-slate-800 dark:text-slate-100">
                          {p.goals + p.assists}
                        </div>
                        <div className="text-xs text-slate-500">
                          {p.goals}G · {p.assists}A
                        </div>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </CardBody>
          </Card>
        </div>
      </Stack>
    </Container>
  );
}

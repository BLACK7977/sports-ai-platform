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
import { getCompetitionSelectionState } from "@/lib/db/repositories/active-competition-repo";
import { getMatchesByLeagueSeason } from "@/lib/db/repositories/matches-repo";
import { getPlayersByTeamIds } from "@/lib/db/repositories/players-repo";
import { getTeamsByLeagueId } from "@/lib/db/repositories/teams-repo";
import {
  getTeamStandings,
  getPlayerSeasonRanking,
} from "@/lib/services/statistics-service";
import { StandingsBars, TeamFormStrip } from "@/components/charts/svg-charts";
import { ensureDbReady } from "@/lib/db/client";
import { CompetitionSelector } from "@/components/sports/competition-selector";
import { TeamCrest } from "@/components/sports/teams/team-crest";

export default async function SportLandingPage({
  sport,
}: {
  sport: string;
}) {
  const has = getHasSport(sport);
  if (!has) notFound();

  await ensureDbReady();
  const sportDef = has.sport;
  const { active, candidates } = await getCompetitionSelectionState(sport);
  const mainLeague = active?.league;
  const mainSeason = active?.season.id ?? "";
  const [leagues, matches, teams, standings, topPlayers] = await Promise.all([
    getLeaguesBySportId(sport),
    mainLeague && mainSeason
      ? getMatchesByLeagueSeason(mainLeague.id, mainSeason)
      : Promise.resolve([]),
    mainLeague ? getTeamsByLeagueId(mainLeague.id) : Promise.resolve([]),
    mainLeague && mainSeason
      ? getTeamStandings(sport, mainLeague.id, mainSeason)
      : Promise.resolve([]),
    mainLeague && mainSeason
      ? getPlayerSeasonRanking(sport, mainLeague.id, mainSeason)
      : Promise.resolve([]),
  ]);
  const competitionPlayers = new Set(
    (await getPlayersByTeamIds(teams.map((team) => team.id))).map(
      (player) => player.id,
    ),
  );

  const finished = matches.filter((m) => m.status === "finished").length;
  const scheduled = matches.filter((m) => m.status === "scheduled").length;
  const teamMap = new Map(teams.map((team) => [team.id, team]));

  return (
    <Container size="wide" className="cyber-page cyber-dashboard">
      <Stack gap="xl">
        <header className="dashboard-hero">
          <div className="dashboard-hero-copy">
            <div className="dashboard-kicker"><i /> COMPETICIÓN ACTIVA · {sportDef.emoji} {sportDef.displayName}</div>
            <h1>{sportDef.displayName}<span> / Resumen de competición</span></h1>
            <p>Resultados, tabla y planteles de la liga y temporada seleccionadas.</p>
            <div className="dashboard-signal-row">
              <span><b>{mainLeague?.name ?? "Competición"}</b><small>Liga activa</small></span>
              <span><b>{mainLeague?.country ?? "—"}</b><small>País / región</small></span>
              <span><b>{matches.length}</b><small>Partidos indexados</small></span>
            </div>
          </div>
          <Row className="dashboard-actions flex-wrap">
            <CompetitionSelector sportId={sport} active={active} candidates={candidates} />
            <LinkButton href={`/${sport}/matches`} tone="primary" size="md">
              Partidos →
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

        <section className="dashboard-section-heading"><span>01 / RESUMEN</span><p>Actividad de la competición seleccionada</p></section>
        <div className="dashboard-metrics">
          <Link href={`/${sport}/matches`} className="dashboard-metric-link" aria-label="Ver partidos de la competición">
            <Card className="dashboard-metric dashboard-metric-cyan"><CardBody><div className="text-xs text-slate-500">Partidos de esta competición</div><div className="text-3xl font-bold">{matches.length}</div><Row className="mt-2"><Badge tone="success">{finished} finalizados</Badge><Badge tone="info">{scheduled} programados</Badge></Row></CardBody></Card>
          </Link>
          <Link href="#competition-selector" className="dashboard-metric-link" aria-label="Elegir competición y temporada">
            <Card className="dashboard-metric dashboard-metric-violet"><CardBody><div className="text-xs text-slate-500">Competiciones con datos</div><div className="text-3xl font-bold">{candidates.length}</div><div className="mt-2 text-xs text-slate-500">{leagues.length} registradas en SPORTS AI · Elegir</div></CardBody></Card>
          </Link>
          <Link href={`/${sport}/players`} className="dashboard-metric-link" aria-label="Ver equipos y planteles de la competición">
            <Card className="dashboard-metric dashboard-metric-green"><CardBody><div className="text-xs text-slate-500">Equipos de la competición</div><div className="text-3xl font-bold">{teams.length}</div><div className="text-xs text-emerald-600 mt-2">Líder: {standings[0]?.teamName ?? "—"}</div></CardBody></Card>
          </Link>
          <Link href={`/${sport}/players`} className="dashboard-metric-link" aria-label="Ver jugadores de la competición">
            <Card className="dashboard-metric dashboard-metric-sky"><CardBody><div className="text-xs text-slate-500">Jugadores en planteles</div><div className="text-3xl font-bold">{competitionPlayers.size}</div><div className="text-xs text-slate-500 mt-2">Asociados actualmente a la competición</div></CardBody></Card>
          </Link>
        </div>

        <section className="dashboard-section-heading"><span>02 / TABLA Y JUGADORES</span><p>Posiciones y rendimiento disponible</p></section>
        <div className="dashboard-data-grid">
          <Card className="dashboard-panel dashboard-standings lg:col-span-3">
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
                        className="grid grid-cols-[32px_32px_1fr_auto] items-center gap-3 py-2"
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
                        <TeamCrest name={teamMap.get(s.teamId)?.name ?? s.teamName} shortName={teamMap.get(s.teamId)?.short_name ?? s.shortName} logoUrl={teamMap.get(s.teamId)?.logo_url} />
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

          <Card className="dashboard-panel dashboard-players lg:col-span-2">
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
                  topPlayers.slice(0, 5).map((p, i) => (
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

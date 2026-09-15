import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardBody, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Container, Stack, Row } from "@/components/ui/container";
import { LinkButton } from "@/components/ui/button";
import { getHasSport } from "@/components/sports/sport-helpers";
import { getLeaguesBySportId } from "@/lib/db/repositories/leagues-repo";
import { getCompetitionSelectionState } from "@/lib/db/repositories/active-competition-repo";
import { getMatchesByLeagueSeason } from "@/lib/db/repositories/matches-repo";
import { getPlayersByTeamIds } from "@/lib/db/repositories/players-repo";
import { getTeamsByLeagueId } from "@/lib/db/repositories/teams-repo";
import { getTeamStandings, getPlayerSeasonRanking } from "@/lib/services/statistics-service";
import { ensureDbReady } from "@/lib/db/client";
import { CompetitionSelector } from "@/components/sports/competition-selector";
import { CompetitionNav } from "@/components/sports/competition-nav";
import { TeamCrest } from "@/components/sports/teams/team-crest";

export default async function SportLandingPage({ sport }: { sport: string }) {
  const has = getHasSport(sport);
  if (!has) notFound();
  await ensureDbReady();
  const sportDef = has.sport;
  const { active, candidates } = await getCompetitionSelectionState(sport);
  const mainLeague = active?.league;
  const mainSeason = active?.season.id ?? "";
  const [leagues, matches, teams, standings, topPlayers] = await Promise.all([
    getLeaguesBySportId(sport),
    mainLeague && mainSeason ? getMatchesByLeagueSeason(mainLeague.id, mainSeason) : Promise.resolve([]),
    mainLeague ? getTeamsByLeagueId(mainLeague.id) : Promise.resolve([]),
    mainLeague && mainSeason ? getTeamStandings(sport, mainLeague.id, mainSeason) : Promise.resolve([]),
    mainLeague && mainSeason ? getPlayerSeasonRanking(sport, mainLeague.id, mainSeason) : Promise.resolve([]),
  ]);
  const competitionPlayers = new Set(
    (await getPlayersByTeamIds(teams.map((team) => team.id))).map((player) => player.id),
  );

  const finished = matches.filter((m) => m.status === "finished").length;
  const scheduled = matches.filter((m) => m.status === "scheduled").length;

  const tabs = [
    { label: "Resumen", href: `/${sport}` },
    { label: "Partidos", href: `/${sport}/matches` },
    { label: "Tabla", href: `/${sport}/standings` },
    { label: "Equipos", href: `/${sport}/players` },
    { label: "Ranking", href: `/${sport}/leaderboard` },
  ];

  return (
    <Container size="wide" className="product-page competition-page">
      <Stack gap="lg">
        <header className="comp-header">
          <div className="comp-header-info">
            <span className="comp-header-eyebrow">
              {sportDef.emoji} {sportDef.displayName}
            </span>
            <h1 className="comp-header-title">
              {mainLeague?.name ?? "Competición"}
            </h1>
            <div className="comp-header-meta">
              {mainLeague?.country && (
                <span className="comp-header-country">{mainLeague.country}</span>
              )}
              <span className="comp-header-season">{active?.season.name ?? "Temporada"}</span>
              <span className="comp-header-provider">
                {mainLeague?.provider ? `${mainLeague.provider}` : "Datos internos"}
              </span>
            </div>
          </div>
          <div className="comp-header-actions">
            <CompetitionSelector sportId={sport} active={active} candidates={candidates} />
          </div>
        </header>

        <CompetitionNav sport={sport} activeTab={`/${sport}`} tabs={tabs} />

        <div className="comp-metrics">
          <Link href={`/${sport}/matches`} className="comp-metric-link">
            <Card className="comp-metric">
              <CardBody>
                <div className="comp-metric-label">Partidos</div>
                <div className="comp-metric-value">{matches.length}</div>
                <div className="comp-metric-detail">
                  <Badge tone="success">{finished} finalizados</Badge>
                  <Badge tone="info">{scheduled} programados</Badge>
                </div>
              </CardBody>
            </Card>
          </Link>
          <Link href={`/${sport}/standings`} className="comp-metric-link">
            <Card className="comp-metric">
              <CardBody>
                <div className="comp-metric-label">Equipos</div>
                <div className="comp-metric-value">{teams.length}</div>
                <div className="comp-metric-detail">
                  {standings[0]?.teamName ? `Líder: ${standings[0].teamName}` : "Sin datos"}
                </div>
              </CardBody>
            </Card>
          </Link>
          <Link href={`/${sport}/players`} className="comp-metric-link">
            <Card className="comp-metric">
              <CardBody>
                <div className="comp-metric-label">Jugadores</div>
                <div className="comp-metric-value">{competitionPlayers.size}</div>
                <div className="comp-metric-detail">En planteles</div>
              </CardBody>
            </Card>
          </Link>
          <Link href={`/${sport}/leaderboard`} className="comp-metric-link">
            <Card className="comp-metric">
              <CardBody>
                <div className="comp-metric-label">Ranking</div>
                <div className="comp-metric-value">{topPlayers.length}</div>
                <div className="comp-metric-detail">Jugadores rankeados</div>
              </CardBody>
            </Card>
          </Link>
        </div>

        <div className="comp-data-grid">
          <Card className="comp-panel">
            <CardHeader action={<LinkButton size="sm" tone="ghost" href={`/${sport}/standings`}>Ver tabla completa</LinkButton>}>
              <CardTitle>Tabla de posiciones</CardTitle>
              <CardSubtitle>{mainLeague?.name ?? "Liga"}</CardSubtitle>
            </CardHeader>
            <CardBody className="!p-0">
              {standings.length === 0 ? (
                <div className="comp-empty-inline">
                  <span>No hay datos de tabla disponibles.</span>
                </div>
              ) : (
                <div className="standings-mini">
                  {standings.slice(0, 8).map((s, i) => {
                    const team = teams.find((t) => t.id === s.teamId);
                    return (
                      <Link key={s.teamId} href={`/${sport}/standings`} className="standings-mini-row">
                        <span className="standings-mini-pos">{i + 1}</span>
                        <TeamCrest
                          name={team?.name ?? s.teamName}
                          shortName={team?.short_name ?? s.shortName}
                          logoUrl={team?.logo_url}
                          size="sm"
                        />
                        <span className="standings-mini-name">{s.teamName}</span>
                        <span className="standings-mini-pj">{s.played} PJ</span>
                        <span className="standings-mini-pts">{s.points}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </CardBody>
          </Card>

          <Card className="comp-panel">
            <CardHeader action={<LinkButton size="sm" tone="ghost" href={`/${sport}/leaderboard`}>Ver ranking</LinkButton>}>
              <CardTitle>Top jugadores</CardTitle>
              <CardSubtitle>Temporada actual</CardSubtitle>
            </CardHeader>
            <CardBody className="!p-0">
              {topPlayers.length === 0 ? (
                <div className="comp-empty-inline">
                  <span>No hay datos de ranking disponibles.</span>
                </div>
              ) : (
                <div className="players-mini">
                  {topPlayers.slice(0, 8).map((p, i) => (
                    <Link key={p.playerId} href={`/${sport}/players/${p.playerId}`} className="players-mini-row">
                      <span className="players-mini-rank">{i + 1}</span>
                      <div className="players-mini-info">
                        <span className="players-mini-name">{p.fullName}</span>
                        <span className="players-mini-meta">{p.position} · {p.matchesPlayed} PJ</span>
                      </div>
                      <div className="players-mini-stats">
                        <span className="players-mini-ga">{p.goals + p.assists}</span>
                        <span className="players-mini-detail">{p.goals}G · {p.assists}A</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </Stack>
    </Container>
  );
}

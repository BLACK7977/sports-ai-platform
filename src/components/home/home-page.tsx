import Link from "next/link";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  CardSubtitle,
} from "@/components/ui/card";
import { Badge, formatBadgeForStatus } from "@/components/ui/badge";
import { Container, Stack, Row } from "@/components/ui/container";
import { LinkButton } from "@/components/ui/button";
import {
  countMatches,
  getMatchesByLeagueSeason,
} from "@/lib/db/repositories/matches-repo";
import { countPlayers } from "@/lib/db/repositories/players-repo";
import { getAllLeagues as getLeagues } from "@/lib/db/repositories/leagues-repo";
import { getCompetitionSelectionState } from "@/lib/db/repositories/active-competition-repo";
import { getTeamsByIds } from "@/lib/db/repositories/teams-repo";
import { matchDetailHref } from "@/lib/navigation/match-detail-href";
import { getActiveSports } from "@/lib/config/sports-registry";
import { ensureDbReady } from "@/lib/db/client";

const features = [
  ["01", "Partidos", "Forma, contexto y lectura previa de cada encuentro.", "/soccer/matches"],
  ["02", "Jugadores", "Rendimiento individual, rankings y reportes comparables.", "/soccer/players"],
  ["03", "Estadísticas", "Tabla, tendencias y señales visibles en un mismo flujo.", "/soccer/standings"],
  ["04", "Análisis IA", "Interpretaciones basadas en los datos disponibles.", "/soccer/matches/m-l1-1"],
] as const;

export default async function HomePage() {
  await ensureDbReady();
  const [matchesCount, playersCount, leagues, sports, competitionState] = await Promise.all([
    countMatches(),
    countPlayers(),
    getLeagues(),
    Promise.resolve(getActiveSports()),
    getCompetitionSelectionState("soccer"),
  ]);
  const activeCompetition = competitionState.active;

  const activeMatches = activeCompetition
    ? await getMatchesByLeagueSeason(
        activeCompetition.league.id,
        activeCompetition.season.id,
      )
    : [];
  const activeTeamIds = [...new Set(activeMatches.flatMap((match) => [match.home_team_id, match.away_team_id]))];
  const activeTeams = await getTeamsByIds(activeTeamIds);
  const activeTeamMap = new Map(activeTeams.map((team) => [team.id, team.name]));
  const lastMatches = activeMatches.slice(0, 5);
  const activeCompetitionLabel = activeCompetition
    ? `${activeCompetition.league.name} · ${activeCompetition.season.name}`
    : "Competición activa";

  return (
    <div className="home-stage">
      <Container size="wide">
        <Stack as="section" gap="xl">
          <header className="home-hero">
            <div className="home-hero-grid" aria-hidden />
            <div className="relative z-10 max-w-3xl space-y-6">
              <div className="flex flex-wrap items-center gap-3">
                <Badge tone="primary" className="home-kicker">SPORTS AI / FOOTBALL INTELLIGENCE</Badge>
                <span className="home-live-dot"><span /> Sistema operativo</span>
              </div>
              <h1 className="home-title">Análisis inteligente de fútbol<span className="home-title-mark">.</span></h1>
              <p className="home-lede">
                Un centro de lectura deportiva para explorar partidos, rendimiento y señales de forma con datos disponibles y análisis asistido por IA.
              </p>
              <Row className="flex-wrap gap-3">
                <LinkButton href="/soccer" tone="primary" size="lg">Abrir centro de fútbol</LinkButton>
                <LinkButton href="/soccer/matches" tone="ghost" size="lg" className="home-ghost-button">Ver partidos</LinkButton>
              </Row>
              <div className="home-proof-row">
                <span><strong>{matchesCount}</strong> partidos en SPORTS AI</span>
                <span><strong>{playersCount}</strong> perfiles de jugadores</span>
                <span><strong>{leagues.length}</strong> competiciones disponibles</span>
              </div>
            </div>
            <div className="home-signal-panel" aria-label="Estado de la competición activa">
              <div className="home-panel-top"><span>COMPETICIÓN ACTIVA</span><span className="home-panel-status">FÚTBOL</span></div>
              <div className="home-signal-ring"><span>AI</span></div>
              <div className="home-panel-reading"><span>Lectura del sistema</span><strong>{activeCompetitionLabel}</strong></div>
              <div className="home-signal-bars" aria-hidden><i /><i /><i /><i /><i /><i /><i /></div>
              <p>Los últimos resultados corresponden exclusivamente a esta competición y temporada.</p>
            </div>
          </header>

          <section className="home-section-head">
            <div><span className="home-eyebrow">NÚCLEO / CAPACIDADES</span><h2>Todo el partido, en una sola lectura.</h2></div>
            <p>Una base modular para sumar fuentes deportivas, mercados e inteligencia sin perder claridad.</p>
          </section>

          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {features.map(([index, title, description, href]) => (
              <Link key={title} href={href} className="home-feature-card">
                <span className="home-feature-index">{index}</span>
                <span className="home-feature-title">{title}</span>
                <span className="home-feature-description">{description}</span>
                <span className="home-feature-arrow">↗</span>
              </Link>
            ))}
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2 home-surface">
              <CardHeader action={<LinkButton href="/soccer/matches" size="sm" tone="ghost">Ver todos</LinkButton>}>
                <CardTitle>Últimos resultados</CardTitle>
                <CardSubtitle>{activeCompetitionLabel} · actividad reciente</CardSubtitle>
              </CardHeader>
              <CardBody>
                <Stack gap="sm">
                  {lastMatches.length === 0 ? <p className="text-sm text-slate-400">No hay partidos para mostrar.</p> : lastMatches.map((match) => {
                    const badge = formatBadgeForStatus(match.status);
                    const home = activeTeamMap.get(match.home_team_id) ?? match.home_team_id;
                    const away = activeTeamMap.get(match.away_team_id) ?? match.away_team_id;
                    return <Link key={match.id} href={matchDetailHref("soccer", match.id)} className="home-match-row">
                      <span className="home-match-date">{new Date(match.match_date).toLocaleDateString()}</span>
                      <span className="home-match-team home-match-team-right">{home}</span>
                      <span className="home-match-score">{match.status === "finished" || match.status === "in_progress" ? `${match.home_score ?? 0} - ${match.away_score ?? 0}` : "vs"}</span>
                      <span className="home-match-team">{away}</span>
                      <Badge tone={badge.tone}>{badge.label}</Badge>
                    </Link>;
                  })}
                </Stack>
              </CardBody>
            </Card>

            <Card className="home-surface">
              <CardHeader action={<LinkButton href="/soccer/standings" size="sm" tone="ghost">Tabla</LinkButton>}>
                <CardTitle>Centro de fútbol</CardTitle>
                <CardSubtitle>Accesos de análisis</CardSubtitle>
              </CardHeader>
              <CardBody><Stack gap="sm">
                <Link href="/soccer" className="home-access-row"><span>Visión general</span><span>↗</span></Link>
                <Link href="/soccer/players" className="home-access-row"><span>Jugadores</span><span>↗</span></Link>
                <Link href="/soccer/leaderboard" className="home-access-row"><span>Ranking</span><span>↗</span></Link>
                <div className="home-demo-note"><span className="home-live-dot"><span /> Demo / offline</span><p>La plataforma conserva datos demo cuando no hay conexión externa.</p></div>
              </Stack></CardBody>
            </Card>
          </section>

          <footer className="home-footnote"><span>SPORTS AI / SIGNALS FOR THE BEAUTIFUL GAME</span><span>{sports.map((sport) => sport.displayName).join(" · ")}</span></footer>
        </Stack>
      </Container>
    </div>
  );
}

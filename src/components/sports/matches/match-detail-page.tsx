import Link from "next/link";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  CardSubtitle,
} from "@/components/ui/card";
import { Badge, formatBadgeForStatus } from "@/components/ui/badge";
import { Container, Stack, Row, Divider } from "@/components/ui/container";
import { LinkButton } from "@/components/ui/button";
import { TeamFormStrip, MatchPointsComparison } from "@/components/charts/svg-charts";
import MatchAiPanels from "@/components/sports/matches/match-ai-panels";
import type { Match, League, Player, PlayerMatchStats, Team } from "@/types/db/tables";
import type { SoccerStandingsRow } from "@/sports/soccer/types";

/* eslint-disable @next/next/no-img-element */

type Metric = { label: string; home: number | null; away: number | null; unit?: "count" | "percent" };
type ClubInfo = { logoUrl?: string; stadium?: string; city?: string; capacity?: number; nickname?: string };

function jsonNumber(source: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = Number(source[key]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase();
}

function formLabel(form: readonly ("W" | "D" | "L")[]): string {
  return form.length ? form.map((item) => (item === "W" ? "G" : item === "D" ? "E" : "P")).join(" ") : "No disponible";
}

function formTone(item: "W" | "D" | "L"): string {
  return item === "W" ? "match-form-win" : item === "D" ? "match-form-draw" : "match-form-loss";
}

function formatMetric(value: number | null | undefined, unit: Metric["unit"] = "count"): { text: string; isMissing: boolean } {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return { text: "No disponible", isMissing: true };
  }
  if (unit === "percent") {
    return { text: `${Math.round(value)}%`, isMissing: false };
  }
  return { text: String(value), isMissing: false };
}

function getClubInfo(team: Team): ClubInfo {
  const data = (team.sport_specific ?? {}) as Record<string, unknown>;
  const capacity = Number(data.capacity);
  return {
    logoUrl: team.logo_url,
    stadium: typeof data.stadium === "string" ? data.stadium : undefined,
    city: typeof data.city === "string" ? data.city : undefined,
    capacity: Number.isFinite(capacity) ? capacity : undefined,
    nickname: typeof data.nickname === "string" ? data.nickname : undefined,
  };
}

function ClubCrest({ team, away = false }: { team: Team; away?: boolean }) {
  const info = getClubInfo(team);
  return info.logoUrl ? (
    <span className={`match-crest match-crest-image${away ? " match-crest-away" : ""}`}>
      <img src={info.logoUrl} alt={`Escudo de ${team.name}`} />
    </span>
  ) : (
    <span className={`match-crest${away ? " match-crest-away" : ""}`} aria-label={`Escudo no disponible de ${team.name}`}>
      <span>{initials(team.name)}</span>
    </span>
  );
}

export default function MatchDetailPage({
  sport,
  match,
  home,
  away,
  league,
  matchStats,
  standings,
  allSeasonMatches,
  squadRanking,
  playerMap,
}: {
  sport: string;
  match: Match;
  home: Team;
  away: Team;
  league?: League;
  matchStats: PlayerMatchStats[];
  standings: SoccerStandingsRow[];
  allSeasonMatches: Match[];
  squadRanking: import("@/sports/soccer/types").SoccerPlayerSeasonAggregate[];
  playerMap: Map<string, Player>;
}) {
  const homeStanding = standings.find((row) => row.teamId === home.id);
  const awayStanding = standings.find((row) => row.teamId === away.id);
  const hForm = homeStanding?.recentForm ?? [];
  const aForm = awayStanding?.recentForm ?? [];
  const homeScore = match.home_score;
  const awayScore = match.away_score;
  const matchData = (match.sport_specific ?? {}) as Record<string, unknown>;
  const homeClub = getClubInfo(home);
  const awayClub = getClubInfo(away);
  const h2h = allSeasonMatches.filter(
    (item) => item.id !== match.id &&
      ((item.home_team_id === home.id && item.away_team_id === away.id) ||
        (item.home_team_id === away.id && item.away_team_id === home.id)),
  );
  const h2hSummary = h2h.reduce(
    (summary, item) => {
      const localWon = item.home_team_id === home.id && (item.home_score ?? 0) > (item.away_score ?? 0);
      const visitorWon = item.away_team_id === home.id && (item.away_score ?? 0) > (item.home_score ?? 0);
      if ((item.home_score ?? 0) === (item.away_score ?? 0)) summary.draws++;
      else if (localWon || visitorWon) summary.homeWins++;
      else summary.awayWins++;
      return summary;
    },
    { homeWins: 0, draws: 0, awayWins: 0 },
  );
  const seasonMetrics = (teamId: string) => {
    const played = allSeasonMatches.filter((item) => item.home_team_id === teamId || item.away_team_id === teamId);
    return played.reduce(
      (summary, item) => {
        const isHome = item.home_team_id === teamId;
        const goalsFor = isHome ? item.home_score : item.away_score;
        const goalsAgainst = isHome ? item.away_score : item.home_score;
        summary.goals += goalsFor ?? 0;
        summary.conceded += goalsAgainst ?? 0;
        if (item.status === "finished") {
          if ((goalsFor ?? 0) > (goalsAgainst ?? 0)) summary.wins++;
          else if ((goalsFor ?? 0) === (goalsAgainst ?? 0)) summary.draws++;
          else summary.losses++;
        }
        return summary;
      },
      { goals: 0, conceded: 0, wins: 0, draws: 0, losses: 0 },
    );
  };
  const homeSeason = seasonMetrics(home.id);
  const awaySeason = seasonMetrics(away.id);
  const matchShots = jsonNumber(matchData, ["shots", "total_shots"]);
  const matchShotsOnTarget = jsonNumber(matchData, ["shots_on_target", "shotsOnTarget"]);
  const matchCorners = jsonNumber(matchData, ["corners", "corner_kicks"]);
  const matchPossession = jsonNumber(matchData, ["possession", "possession_pct"]);
  const matchCards = jsonNumber(matchData, ["yellow_cards", "cards"]);
  const comparison: Metric[] = [
    { label: "Goles · temporada", home: homeSeason.goals, away: awaySeason.goals },
    { label: "Goles recibidos · temporada", home: homeSeason.conceded, away: awaySeason.conceded },
    { label: "Tiros · partido", home: matchShots, away: jsonNumber(matchData, ["away_shots", "shots_away"]) },
    { label: "Tiros al arco · partido", home: matchShotsOnTarget, away: jsonNumber(matchData, ["away_shots_on_target", "shotsOnTarget_away"]) },
    { label: "Córners · partido", home: matchCorners, away: jsonNumber(matchData, ["away_corners", "corners_away"]) },
    { label: "Posesión · partido", home: matchPossession, away: jsonNumber(matchData, ["away_possession", "possession_away"]), unit: "percent" },
    { label: "Tarjetas · partido", home: matchCards, away: jsonNumber(matchData, ["away_yellow_cards", "cards_away"]) },
  ];
  const predictionAvailable = Boolean(homeStanding && awayStanding && (hForm.length || aForm.length));
  const dataSignals = [
    homeStanding && awayStanding ? "forma y tabla" : null,
    homeSeason.goals + awaySeason.goals > 0 ? "producción de goles" : null,
    matchStats.length > 0 ? "estadísticas de jugadores" : null,
  ].filter(Boolean) as string[];
  const liveMinute = jsonNumber(matchData, ["minute", "match_minute", "elapsed"]);
  const scoreContext = match.status === "in_progress" ? `${liveMinute ?? 0}'` : match.status === "finished" ? "FINAL" : "PRÓXIMAMENTE";
  const teamLeaders = (teamId: string) => squadRanking
    .filter((player) => player.teamId === teamId)
    .sort((a, b) => (b.goals + b.assists) - (a.goals + a.assists) || b.goals - a.goals)
    .slice(0, 3);
  const teamProduction = (teamId: string) => teamLeaders(teamId).reduce((total, player) => total + player.goals + player.assists, 0);
  const ageOf = (player?: Player) => {
    if (!player?.date_of_birth) return null;
    const birth = new Date(player.date_of_birth);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    if (today < new Date(today.getFullYear(), birth.getMonth(), birth.getDate())) age--;
    return Number.isFinite(age) ? age : null;
  };

  return (
    <div className={`match-intelligence-stage match-status-${match.status}`}>
      <Container size="wide">
        <Stack gap="xl">
          <nav className="match-nav-bar" aria-label="Breadcrumb">
            <LinkButton size="sm" tone="ghost" href={`/${sport}/matches`}>← Volver a partidos</LinkButton>
            <div className="match-breadcrumbs">
              <Link href={`/${sport}`}>Fútbol</Link><span>/</span><Link href={`/${sport}/matches`}>Partidos</Link><span>/</span><strong>{home.short_name} vs {away.short_name}</strong>
            </div>
          </nav>

          <section className="match-hero-panel">
            <div className="match-hero-top-strip">
              <span className="match-hero-competition">{league?.name ?? match.league_id}</span>
              <span className="match-hero-sep">·</span>
              <time className="match-hero-datetime">{new Date(match.match_date).toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short", year: "numeric" })} — {new Date(match.match_date).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</time>
              <span className="match-hero-sep">·</span>
              <span className={`match-vs-label match-vs-label-${match.status}`}>{match.status === "finished" ? "FINALIZADO" : match.status === "in_progress" ? "EN VIVO" : "PRÓXIMO"}</span>
            </div>
            <div className="match-hero-id"><span>MATCH CENTER</span> <b>{`// ${match.id}`}</b></div>
            <div className="match-hero-scoreboard">
              <Link href={`/${sport}/standings`} className="match-team-block"><ClubCrest team={home} /><strong>{home.name}</strong><small>{home.short_name} · LOCAL</small></Link>
              <div className="match-score-block"><strong>{homeScore == null || awayScore == null ? "— : —" : `${homeScore} : ${awayScore}`}</strong><small>{scoreContext}</small></div>
              <Link href={`/${sport}/standings`} className="match-team-block"><ClubCrest team={away} away /><strong>{away.name}</strong><small>{away.short_name} · VISITANTE</small></Link>
            </div>
            <div className="match-form-row"><div><span>Forma local</span><strong>{formLabel(hForm)}</strong><TeamFormStrip form={hForm} size={20} /></div><div><span>Forma visitante</span><strong>{formLabel(aForm)}</strong><TeamFormStrip form={aForm} size={20} /></div></div>
            <div className="match-club-meta-grid"><div><b>{home.short_name}</b><span>ESTADIO <strong>{homeClub.stadium ?? "No disponible"}</strong></span><span>CIUDAD <strong>{homeClub.city ?? "No disponible"}</strong></span><span>CAPACIDAD <strong>{homeClub.capacity ? homeClub.capacity.toLocaleString() : "No disponible"}</strong></span><span>APODO <strong>{homeClub.nickname ?? "No disponible"}</strong></span></div><div><b>{away.short_name}</b><span>ESTADIO <strong>{awayClub.stadium ?? "No disponible"}</strong></span><span>CIUDAD <strong>{awayClub.city ?? "No disponible"}</strong></span><span>CAPACIDAD <strong>{awayClub.capacity ? awayClub.capacity.toLocaleString() : "No disponible"}</strong></span><span>APODO <strong>{awayClub.nickname ?? "No disponible"}</strong></span></div></div>
          </section>

          <section className="match-primary-data grid grid-cols-1 lg:grid-cols-5 gap-4" aria-label="Datos disponibles del partido">
            <Card className="match-panel match-real-data-panel match-comparison-module lg:col-span-3"><CardHeader className="match-module-header"><CardTitle><span className="module-kicker">DATOS DISPONIBLES</span> Comparación</CardTitle><CardSubtitle>Local frente a visitante · temporada y partido cuando existe el dato</CardSubtitle></CardHeader><CardBody><div className="match-comparison"><div className="match-comparison-head"><span>Métrica</span><strong>{home.short_name}</strong><strong>{away.short_name}</strong></div>{comparison.map((metric) => {
              const hFmt = formatMetric(metric.home, metric.unit);
              const aFmt = formatMetric(metric.away, metric.unit);
              return (
                <div className="match-comparison-row" key={metric.label}>
                  <span>{metric.label}</span>
                  <strong className={hFmt.isMissing ? "val-missing" : ""}>{hFmt.text}</strong>
                  <strong className={aFmt.isMissing ? "val-missing" : ""}>{aFmt.text}</strong>
                </div>
              );
            })}<div className="match-comparison-row"><span>Forma reciente</span><strong>{formLabel(hForm)}</strong><strong>{formLabel(aForm)}</strong></div></div>{homeStanding && awayStanding ? <div className="mt-4 pt-4" style={{ borderTop: "1px solid rgba(83,205,255,0.1)" }}><MatchPointsComparison homeName={home.name} homeShort={home.short_name} homePoints={homeStanding.points} homePosition={standings.indexOf(homeStanding) + 1} awayName={away.name} awayShort={away.short_name} awayPoints={awayStanding.points} awayPosition={standings.indexOf(awayStanding) + 1} maxPoints={Math.max(homeStanding.points, awayStanding.points, 1)} /></div> : null}</CardBody></Card>
            <Card className="match-panel match-secondary-data-panel match-form-module lg:col-span-2"><CardHeader className="match-module-header"><CardTitle><span className="module-kicker">MOMENTO RECIENTE</span> Forma reciente</CardTitle><CardSubtitle>G ganó · E empató · P perdió</CardSubtitle></CardHeader><CardBody><div className="match-form-columns">{[[home, hForm], [away, aForm]].map(([team, form]) => <div key={(team as Team).id}><strong>{(team as Team).short_name}</strong><div className="match-form-pills">{(form as ("W" | "D" | "L")[]).length ? (form as ("W" | "D" | "L")[]).map((item, index) => <span className={formTone(item)} key={`${item}-${index}`}>{item === "W" ? "G" : item === "D" ? "E" : "P"}</span>) : <span className="val-missing">No disponible</span>}</div></div>)}</div></CardBody></Card>
          </section>

          <Card className="match-panel match-h2h-module"><CardHeader className="match-module-header"><CardTitle><span className="module-kicker">ARCHIVE / H2H</span> Historial directo</CardTitle><CardSubtitle>Enfrentamientos disponibles en esta temporada</CardSubtitle></CardHeader><CardBody>{h2h.length === 0 ? <div className="match-empty-state">No se registran enfrentamientos directos previos entre estos equipos en la temporada actual.</div> : <><div className="match-h2h-summary"><span><strong>{h2h.length}</strong> partidos</span><span><strong>{h2hSummary.homeWins}</strong> {home.short_name}</span><span><strong>{h2hSummary.draws}</strong> empates</span><span><strong>{h2hSummary.awayWins}</strong> {away.short_name}</span></div><div className="match-history-list">{h2h.map((item) => <Link href={`/${sport}/matches/${item.id}`} key={item.id}><span>{new Date(item.match_date).toLocaleDateString()}</span><strong>{item.home_team_id === home.id ? home.short_name : away.short_name} {item.home_score ?? 0} - {item.away_score ?? 0} {item.away_team_id === away.id ? away.short_name : home.short_name}</strong></Link>)}</div></>}</CardBody></Card>

          <Card className="match-panel match-roster-module"><CardHeader className="match-module-header"><CardTitle><span className="module-kicker">SQUAD / SEASON</span> Jugadores clave</CardTitle><CardSubtitle>Referentes de esta competición, separados por equipo.</CardSubtitle></CardHeader><CardBody><div className="match-squad-summary"><span><b>{home.short_name}</b> {teamProduction(home.id)} contribuciones G+A</span><span><b>{away.short_name}</b> {teamProduction(away.id)} contribuciones G+A</span></div><div className="match-squad-grid">{[[home, teamLeaders(home.id)], [away, teamLeaders(away.id)]].map(([team, leaders]) => <section key={(team as Team).id} className="match-squad-team"><header><b>{(team as Team).name}</b><small>TOP 3 · TEMPORADA</small></header>{(leaders as import("@/sports/soccer/types").SoccerPlayerSeasonAggregate[]).length ? (leaders as import("@/sports/soccer/types").SoccerPlayerSeasonAggregate[]).map((leader) => { const player = playerMap.get(leader.playerId); const age = ageOf(player); return <Link key={leader.playerId} href={`/${sport}/players/${leader.playerId}`} className="match-squad-player"><span><strong>{leader.fullName}</strong><small>{leader.position}{player?.nationality ? ` · ${player.nationality}` : ""}{age ? ` · ${age} años` : ""}</small></span><b>{leader.goals}<i>G</i> · {leader.assists}<i>A</i></b></Link>; }) : <div className="match-empty-state">Sin estadísticas de temporada disponibles.</div>}</section>)}</div></CardBody></Card>

          <section className="match-experimental-zone" aria-labelledby="experimental-modules-title">
            <div className="match-experimental-heading"><span>CAPA EXPERIMENTAL</span><h2 id="experimental-modules-title">Lecturas complementarias</h2><p>Se muestran aparte del marcador y de los datos registrados. Son interpretaciones de las señales disponibles, no resultados oficiales.</p></div>
<div className="match-experimental-grid">
              <MatchAiPanels
                sport={sport}
                matchId={match.id}
                leagueId={match.league_id}
                seasonId={match.season_id}
                predictionAvailable={predictionAvailable}
                homeShort={home.short_name}
                awayShort={away.short_name}
              />
              <Card className="match-panel match-experimental-module match-signal-module"><CardHeader className="match-module-header"><CardTitle><span className="module-kicker">SEÑALES</span> Cobertura disponible</CardTitle><CardSubtitle>Datos que alimentan esta lectura</CardSubtitle></CardHeader><CardBody><div className="match-signal-list">{dataSignals.length ? dataSignals.map((signal) => <div key={signal}><span>+</span>{signal}</div>) : <div className="match-empty-state">No hay señales suficientes registradas.</div>}<div><span>·</span> Tiros, córners y posesión en directo cuando la fuente los entregue</div></div></CardBody></Card>
            </div>
          </section>

          <section className="match-future-grid"><Card className="match-panel match-future-module"><CardHeader className="match-module-header"><CardTitle><span className="module-kicker">MÓDULO FUTURO</span> DT vs DT</CardTitle><CardSubtitle>Historial de entrenadores</CardSubtitle></CardHeader><CardBody><div className="match-empty-state">Disponible cuando exista una fuente con entrenadores, enfrentamientos y resultados históricos.</div></CardBody></Card><Card className="match-panel match-future-module"><CardHeader className="match-module-header"><CardTitle><span className="module-kicker">MÓDULO FUTURO</span> Modelo Sports AI</CardTitle><CardSubtitle>Arquitectura de modelos futuros</CardSubtitle></CardHeader><CardBody><div className="match-model-list"><span>Modelo estadístico <b>Próximamente</b></span><span>Modelo de forma <b>Próximamente</b></span><span>Modelo ofensivo <b>Próximamente</b></span><span>Modelo defensivo <b>Próximamente</b></span></div></CardBody></Card></section>

          <Divider label="Otros partidos de la temporada" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{allSeasonMatches.filter((item) => item.id !== match.id).slice(0, 6).map((item) => <Link key={item.id} href={`/${sport}/matches/${item.id}`}><Card className="match-panel match-related-card"><CardBody><Row className="justify-between"><span className="text-xs text-slate-400 font-mono">{new Date(item.match_date).toLocaleDateString()}</span><Badge tone={formatBadgeForStatus(item.status).tone}>{formatBadgeForStatus(item.status).label}</Badge></Row><div className="mt-3 grid grid-cols-[1fr_auto_1fr] gap-2 text-sm"><span className="truncate text-slate-300 font-medium">{item.home_team_id.replaceAll("-", " ")}</span><strong className="text-center font-bold text-slate-100 tabular-nums">{item.status === "finished" ? `${item.home_score ?? 0} - ${item.away_score ?? 0}` : "vs"}</strong><span className="truncate text-right text-slate-300 font-medium">{item.away_team_id.replaceAll("-", " ")}</span></div></CardBody></Card></Link>)}</div>
        </Stack>
      </Container>
    </div>
  );
}

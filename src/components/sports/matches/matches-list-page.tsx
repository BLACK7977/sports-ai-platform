import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardBody, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/card";
import { Badge, formatBadgeForStatus } from "@/components/ui/badge";
import { Container, Stack, Row } from "@/components/ui/container";
import { LinkButton } from "@/components/ui/button";
import { DataTable, TableHead, Th, TableBody, Tr, Td, EmptyRow } from "@/components/ui/table";
import { getHasSport } from "@/components/sports/sport-helpers";
import { getCompetitionSelectionState } from "@/lib/db/repositories/active-competition-repo";
import { getMatchesByLeagueSeason, getMatchesByLeagueSeasonDateRange, getMatchesByLeagueSeasonStatuses } from "@/lib/db/repositories/matches-repo";
import { getTeamsByIds } from "@/lib/db/repositories/teams-repo";
import { ensureDbReady } from "@/lib/db/client";
import { matchDetailHref } from "@/lib/navigation/match-detail-href";
import { TeamCrest } from "@/components/sports/teams/team-crest";
import type { Match, Team } from "@/types/db/tables";

const views = ["week", "today", "upcoming", "finished", "all"] as const;
type MatchView = (typeof views)[number];
const labels: Record<MatchView, string> = { week: "Esta semana", today: "Hoy", upcoming: "Próximos", finished: "Finalizados", all: "Todos" };

function validView(value?: string): MatchView { return views.includes(value as MatchView) ? value as MatchView : "week"; }
function validWeekOffset(value?: string): number { const parsed = Number(value); return Number.isInteger(parsed) && Math.abs(parsed) <= 52 ? parsed : 0; }
function dateRange(date: Date) { const start = new Date(date); start.setHours(0, 0, 0, 0); const end = new Date(date); end.setHours(23, 59, 59, 999); return { start, end }; }
function weekDates(offset: number) { const now = new Date(); const start = new Date(now); const day = start.getDay(); start.setDate(start.getDate() - (day === 0 ? 6 : day - 1) + offset * 7); start.setHours(0, 0, 0, 0); const end = new Date(start); end.setDate(end.getDate() + 6); end.setHours(23, 59, 59, 999); return { start, end }; }
function weekLabel(start: Date, end: Date) { const formatter = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short" }); return `${formatter.format(start)} — ${formatter.format(end)}`; }
function href(view: MatchView, week: number) { const query = new URLSearchParams(); if (view !== "week") query.set("view", view); if (view === "week" && week !== 0) query.set("week", String(week)); const suffix = query.toString(); return suffix ? `?${suffix}` : ""; }

export default async function MatchesListPage({ sport, view: rawView, week: rawWeek }: { sport: string; view?: string; week?: string }) {
  const has = getHasSport(sport);
  if (!has) notFound();
  await ensureDbReady();
  const view = validView(rawView);
  const week = validWeekOffset(rawWeek);
  const { active } = await getCompetitionSelectionState(sport);
  const league = active?.league;
  const seasonId = active?.season.id ?? "";
  const seasonName = active?.season.name ?? "Temporada";
  const weekRange = weekDates(week);
  const today = dateRange(new Date());
  const matches = !league ? [] : view === "week"
    ? await getMatchesByLeagueSeasonDateRange(league.id, seasonId, weekRange.start.toISOString(), weekRange.end.toISOString())
    : view === "today"
      ? await getMatchesByLeagueSeasonDateRange(league.id, seasonId, today.start.toISOString(), today.end.toISOString())
      : view === "upcoming"
        ? await getMatchesByLeagueSeasonStatuses(league.id, seasonId, ["scheduled", "in_progress"])
        : view === "finished"
          ? await getMatchesByLeagueSeasonStatuses(league.id, seasonId, ["finished"])
          : await getMatchesByLeagueSeason(league.id, seasonId);
  const mainMatches = [...matches].sort((a, b) => a.match_date.localeCompare(b.match_date));
  const teams = await getTeamsByIds([...new Set(mainMatches.flatMap((match) => [match.home_team_id, match.away_team_id]))]);
  const teamMap = new Map(teams.map((team) => [team.id, team]));
  const context = view === "week" ? `Semana: ${weekLabel(weekRange.start, weekRange.end)}` : labels[view];

  return <Container size="wide" className="product-page match-list-page"><Stack gap="xl">
    <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><div><div className="page-eyebrow">{has.sport.emoji} {has.sport.displayName} · Centro de partidos</div><h1 className="page-title">Fixtures · Partidos</h1><p className="mt-1 max-w-2xl text-slate-400">Calendario y resultados de {league?.name ?? "la competición activa"} · {seasonName}.</p></div><Row><LinkButton href={`/${sport}/standings`} tone="outline">Tabla</LinkButton><LinkButton href={`/${sport}/leaderboard`} tone="ghost">Ranking jugadores</LinkButton></Row></header>
    <Card className="product-panel match-list-panel"><CardHeader action={<LinkButton href={`/${sport}`} size="sm" tone="ghost">← Volver</LinkButton>}><CardTitle>Competición · {league?.name ?? "Liga"}</CardTitle><CardSubtitle>{seasonName} · {context} · {mainMatches.length} partidos</CardSubtitle></CardHeader><CardBody className="space-y-4 !p-0">
      <nav className="flex flex-wrap gap-2 border-y border-slate-800/80 px-4 py-3" aria-label="Filtros de partidos">{views.map((entry) => <Link key={entry} href={href(entry, week)} aria-current={view === entry ? "page" : undefined} className={`rounded-md px-3 py-2 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 ${view === entry ? "bg-cyan-400/15 text-cyan-200" : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"}`}>{labels[entry]}</Link>)}</nav>
      {view === "week" && <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-1 text-sm"><span className="font-medium text-slate-300">Semana del {weekLabel(weekRange.start, weekRange.end)}</span><div className="flex gap-2"><Link href={href("week", week - 1)} className="match-week-link">← Semana anterior</Link><Link href={href("week", week + 1)} className="match-week-link">Semana siguiente →</Link></div></div>}
      <div className="mobile-match-list md:hidden">{mainMatches.length === 0 ? <p className="p-5 text-sm text-slate-400">No hay partidos {view === "week" ? "en esta semana" : "para este filtro"} en la competición activa.</p> : mainMatches.map((match) => <MobileMatch key={match.id} match={match} sport={sport} teams={teamMap} />)}</div>
      <div className="hidden md:block"><DataTable><TableHead><Th>Fecha</Th><Th>Local</Th><Th align="center">Marcador</Th><Th>Visita</Th><Th align="right">Estado</Th></TableHead><TableBody>{mainMatches.length === 0 ? <EmptyRow message="No hay partidos para este filtro en la competición activa." cols={5} /> : mainMatches.map((match) => <DesktopMatch key={match.id} match={match} sport={sport} teams={teamMap} />)}</TableBody></DataTable></div>
    </CardBody></Card>
  </Stack></Container>;
}

type MatchProps = { match: Match; sport: string; teams: Map<string, Team> };

function MobileMatch({ match, sport, teams }: MatchProps) {
  const badge = formatBadgeForStatus(match.status);
  const date = new Date(match.match_date);
  const scored = match.status === "finished" || match.status === "in_progress";
  const home = teams.get(match.home_team_id);
  const away = teams.get(match.away_team_id);
  return <Link href={matchDetailHref(sport, match.id)} className="mobile-match-row focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"><div className="mobile-match-meta"><time>{date.toLocaleDateString("es-AR", { day: "2-digit", month: "short" })} · {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time><Badge tone={badge.tone}>{badge.label}</Badge></div><div className="mobile-match-scoreline"><span className="inline-flex min-w-0 items-center gap-2"><TeamCrest name={home?.name ?? "Equipo no disponible"} shortName={home?.short_name} logoUrl={home?.logo_url} /><strong>{home?.name ?? "Equipo no disponible"}</strong></span><b>{scored ? `${match.home_score ?? 0} : ${match.away_score ?? 0}` : "VS"}</b><span className="inline-flex min-w-0 items-center justify-end gap-2"><strong>{away?.name ?? "Equipo no disponible"}</strong><TeamCrest name={away?.name ?? "Equipo no disponible"} shortName={away?.short_name} logoUrl={away?.logo_url} /></span></div></Link>;
}

function DesktopMatch({ match, sport, teams }: MatchProps) {
  const badge = formatBadgeForStatus(match.status);
  const date = new Date(match.match_date);
  const scored = match.status === "finished" || match.status === "in_progress";
  const home = teams.get(match.home_team_id);
  const away = teams.get(match.away_team_id);
  const homeName = home?.name ?? "Equipo no disponible";
  const awayName = away?.name ?? "Equipo no disponible";
  const destination = matchDetailHref(sport, match.id);
  const linkClass = "-mx-4 -my-3 block px-4 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-cyan-300";
  const accessibleLabel = `${homeName} contra ${awayName}. ${badge.label}. Abrir detalle del partido`;

  return <Tr hoverable className="group focus-within:bg-cyan-300/10">
    <Td><Link href={destination} aria-label={accessibleLabel} className={linkClass}><div className="font-medium">{date.toLocaleDateString()}</div><div className="text-xs text-slate-400">{date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div></Link></Td>
    <Td><Link href={destination} tabIndex={-1} aria-hidden className={`${linkClass} inline-flex items-center gap-2`}><TeamCrest name={homeName} shortName={home?.short_name} logoUrl={home?.logo_url} />{homeName}</Link></Td>
    <Td align="center"><Link href={destination} tabIndex={-1} aria-hidden className={linkClass}><div className="inline-flex items-center gap-3 rounded-lg bg-slate-100 px-3 py-1 font-bold tabular-nums dark:bg-slate-800"><span className={scored ? "" : "opacity-0"}>{match.home_score ?? 0}</span><span className="text-slate-400">{scored ? ":" : "vs"}</span><span className={scored ? "" : "opacity-0"}>{match.away_score ?? 0}</span></div></Link></Td>
    <Td><Link href={destination} tabIndex={-1} aria-hidden className={`${linkClass} inline-flex items-center gap-2`}><TeamCrest name={awayName} shortName={away?.short_name} logoUrl={away?.logo_url} />{awayName}</Link></Td>
    <Td align="right"><Link href={destination} tabIndex={-1} aria-hidden className={linkClass}><span className="inline-flex items-center gap-2"><Badge tone={badge.tone}>{badge.label}</Badge><span aria-hidden className="text-cyan-300/70">→</span></span></Link></Td>
  </Tr>;
}

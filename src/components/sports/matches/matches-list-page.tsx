import Link from "next/link";
import { notFound } from "next/navigation";
import { Container, Stack } from "@/components/ui/container";
import { getHasSport } from "@/components/sports/sport-helpers";
import { getCompetitionSelectionState } from "@/lib/db/repositories/active-competition-repo";
import { getMatchesByLeagueSeason, getMatchesByLeagueSeasonDateRange, getMatchesByLeagueSeasonStatuses } from "@/lib/db/repositories/matches-repo";
import { getTeamsByIds } from "@/lib/db/repositories/teams-repo";
import { ensureDbReady } from "@/lib/db/client";
import { matchDetailHref } from "@/lib/navigation/match-detail-href";
import { TeamCrest } from "@/components/sports/teams/team-crest";
import { CompetitionNav } from "@/components/sports/competition-nav";
import { getCompetitionTabs } from "@/shared/competition-tabs";
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

function statusBadge(status: Match["status"]) {
  const map: Record<Match["status"], { label: string; cls: string }> = {
    finished: { label: "Finalizado", cls: "status-finished" },
    in_progress: { label: "En vivo", cls: "status-live" },
    scheduled: { label: "Programado", cls: "status-scheduled" },
    postponed: { label: "Pospuesto", cls: "status-postponed" },
    cancelled: { label: "Cancelado", cls: "status-cancelled" },
  };
  return map[status] ?? map.scheduled;
}

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
  const tabs = getCompetitionTabs(sport);

  return (
    <Container size="wide" className="product-page match-list-page">
      <Stack gap="lg">
        <header className="comp-header">
          <div className="comp-header-info">
            <span className="comp-header-eyebrow">
              {league?.name ?? "Competición"} · {seasonName}
            </span>
            <h1 className="comp-header-title">Partidos</h1>
            <span className="comp-header-season">{context}</span>
          </div>
        </header>

        <CompetitionNav sport={sport} activeTab={`/${sport}/matches`} tabs={tabs} />

        <div className="match-filters">
          {views.map((entry) => (
            <Link
              key={entry}
              href={href(entry, week)}
              className={`match-filter-btn${view === entry ? " match-filter-btn--active" : ""}`}
              aria-current={view === entry ? "page" : undefined}
            >
              {labels[entry]}
            </Link>
          ))}
        </div>

        {view === "week" && (
          <div className="week-nav">
            <span className="week-label">Semana del {weekLabel(weekRange.start, weekRange.end)}</span>
            <div className="week-links">
              <Link href={href("week", week - 1)} className="match-week-link">← Anterior</Link>
              <Link href={href("week", week + 1)} className="match-week-link">Siguiente →</Link>
            </div>
          </div>
        )}

        {mainMatches.length === 0 ? (
          <div className="comp-empty-state">
            <span className="comp-empty-icon">⚽</span>
            <p>No hay partidos {view === "week" ? "en esta semana" : "para este filtro"}.</p>
            <p className="comp-empty-sub">Los partidos aparecen cuando se indexan datos de la competición.</p>
          </div>
        ) : (
          <div className="match-cards">
            {mainMatches.map((match) => {
              const badge = statusBadge(match.status);
              const date = new Date(match.match_date);
              const scored = match.status === "finished" || match.status === "in_progress";
              const home = teamMap.get(match.home_team_id);
              const away = teamMap.get(match.away_team_id);
              const dest = matchDetailHref(sport, match.id);
              const accessibleLabel = `${home?.name ?? "Local"} contra ${away?.name ?? "Visitante"}. ${badge.label}. Abrir detalle`;

              return (
                <Link key={match.id} href={dest} className="match-card" aria-label={accessibleLabel}>
                  <div className="match-card-date">
                    <time dateTime={match.match_date}>
                      {date.toLocaleDateString("es-AR", { day: "2-digit", month: "short" })}
                    </time>
                    <span className="match-card-time">
                      {date.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>

                  <div className="match-card-teams">
                    <div className="match-card-team">
                      <TeamCrest
                        name={home?.name ?? "Local"}
                        shortName={home?.short_name}
                        logoUrl={home?.logo_url}
                        size="sm"
                      />
                      <span className="match-card-name">{home?.name ?? "Equipo no disponible"}</span>
                    </div>

                    <div className="match-card-score">
                      {scored ? (
                        <span className="match-card-result">
                          <span>{match.home_score ?? 0}</span>
                          <span className="match-card-sep">:</span>
                          <span>{match.away_score ?? 0}</span>
                        </span>
                      ) : (
                        <span className="match-card-vs">VS</span>
                      )}
                    </div>

                    <div className="match-card-team match-card-team--away">
                      <span className="match-card-name">{away?.name ?? "Equipo no disponible"}</span>
                      <TeamCrest
                        name={away?.name ?? "Visitante"}
                        shortName={away?.short_name}
                        logoUrl={away?.logo_url}
                        size="sm"
                      />
                    </div>
                  </div>

                  <div className="match-card-footer">
                    <span className={`match-card-status ${badge.cls}`}>{badge.label}</span>
                    <span className="match-card-arrow">→</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </Stack>
    </Container>
  );
}

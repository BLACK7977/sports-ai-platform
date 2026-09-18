import Link from "next/link";
import type { CSSProperties } from "react";
import { Container, Stack } from "@/components/ui/container";
import { MiniGauge, StandingsBars } from "@/components/charts/svg-charts";
import { getHasSport } from "@/components/sports/sport-helpers";
import { CompetitionNav } from "@/components/sports/competition-nav";
import { getCompetitionTabs } from "@/shared/competition-tabs";
import type { SoccerPlayerSeasonAggregate } from "@/sports/soccer/types";

type RankRow = SoccerPlayerSeasonAggregate & { teamName: string };
type Metric = "goals" | "assists" | "ga";

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((item) => item[0]).join("").toUpperCase();
const impact = (row: RankRow) => row.goals + row.assists;
const rankTone = (rank: number) => rank === 0 ? "champion" : rank === 1 ? "runner" : rank === 2 ? "third" : "field";

function PlayerMark({ row, rank = 10 }: { row: RankRow; rank?: number }) {
  return <span className={`player-stamp player-stamp-${rankTone(rank)}`} aria-hidden>{initials(row.fullName)}</span>;
}

export default async function LeaderboardPage({ sport, leagueName, seasonName, squadRanking, topN = 15, chart = "goals", aggregate }: {
  sport: string; leagueName: string; seasonName: string; squadRanking: RankRow[]; topN?: number; chart?: Metric; aggregate?: { played: number; finished: number; totalGoals: number; averageGoals: number | null };
}) {
  const has = getHasSport(sport);
  const sportName = has?.sport.displayName ?? "Deporte";
  const sportEmoji = has?.sport.emoji ?? "⚽";
  const byGoals = [...squadRanking].sort((a, b) => b.goals - a.goals || b.assists - a.assists).slice(0, topN);
  const byAssists = [...squadRanking].sort((a, b) => b.assists - a.assists || b.goals - a.goals).slice(0, topN);
  const byImpact = [...squadRanking].sort((a, b) => impact(b) - impact(a) || b.goals - a.goals).slice(0, topN);
  const activeRows = chart === "assists" ? byAssists : chart === "ga" ? byImpact : byGoals;
  const max = Math.max(1, ...activeRows.map((row) => chart === "goals" ? row.goals : chart === "assists" ? row.assists : impact(row)));
  const label = chart === "goals" ? "Goles" : chart === "assists" ? "Asistencias" : "Impacto G+A";
  const totalGoals = squadRanking.reduce((sum, row) => sum + row.goals, 0);
  const totalAssists = squadRanking.reduce((sum, row) => sum + row.assists, 0);
  const totalMinutes = squadRanking.reduce((sum, row) => sum + row.totalMinutes, 0);
  const podium = byImpact.slice(0, 3);
  const hasIndividualStats = squadRanking.length > 0;
  const tabs = getCompetitionTabs(sport);

  return (
    <Container size="wide" className="product-page leaderboard-page">
      <Stack gap="xl">
        <header className="comp-header">
          <div className="comp-header-info">
            <span className="comp-header-eyebrow">
              {sportEmoji} {sportName} · {leagueName}
            </span>
            <h1 className="comp-header-title">Estadísticas</h1>
            <span className="comp-header-season">{seasonName}</span>
          </div>
        </header>

        <CompetitionNav sport={sport} activeTab={`/${sport}/leaderboard`} tabs={tabs} />

        {hasIndividualStats ? <section className="signal-strip" aria-label="Resumen de rendimiento">
          <div><span>GOLES</span><strong>{totalGoals}</strong><small>{byGoals[0]?.fullName ?? "Sin líder"}</small></div>
          <div><span>ASISTENCIAS</span><strong>{totalAssists}</strong><small>{byAssists[0]?.fullName ?? "Sin líder"}</small></div>
          <div><span>MINUTOS</span><strong>{totalMinutes.toLocaleString("es-AR")}</strong><small>volumen registrado</small></div>
          <div><span>IMPACTO</span><strong>{squadRanking.reduce((sum, row) => sum + impact(row), 0)}</strong><small>acciones de gol</small></div>
        </section> : <section className="leaderboard-empty-state" aria-labelledby="leaderboard-empty-title">
          <span>ESTADÍSTICAS INDIVIDUALES</span>
          <h2 id="leaderboard-empty-title">Las estadísticas por jugador estarán disponibles al completar la sincronización.</h2>
          <p>La competición ya tiene equipos y partidos publicados. Los goles, asistencias, minutos y demás métricas de cada jugador aparecerán cuando se sincronicen las estadísticas individuales por partido.</p>
          {aggregate && aggregate.finished > 0 ? <div className="leaderboard-empty-aggregates" aria-label={`Competición: ${aggregate.played} partidos programados, ${aggregate.finished} jugados, ${aggregate.totalGoals} goles`}>
            <div><span>PARTIDOS CARGADOS</span><strong>{aggregate.played}</strong></div>
            <div><span>JUGADOS</span><strong>{aggregate.finished}</strong></div>
            <div><span>GOLES</span><strong>{aggregate.totalGoals}</strong></div>
            <div><span>PROMEDIO</span><strong>{aggregate.averageGoals ?? "—"}</strong><small>goles por partido</small></div>
          </div> : null}
        </section>}

        {hasIndividualStats ? <><section className="podium-section">
          <div className="section-intro"><span>01 / LÍDERES DE IMPACTO</span><h2>Los tres que inclinan el campo.</h2><p>Ordenados por contribución directa de gol. No es una predicción: es producción registrada.</p></div>
          {podium.length ? <div className="impact-podium">{[podium[1], podium[0], podium[2]].filter(Boolean).map((row, visualIndex) => {
            const rank = visualIndex === 0 ? 1 : visualIndex === 1 ? 0 : 2;
            const height = rank === 0 ? "podium-first" : rank === 1 ? "podium-second" : "podium-third";
            return <Link key={row.playerId} href={`/${sport}/players/${row.playerId}`} className={`podium-player ${height}`} style={{ "--delay": `${visualIndex * 90}ms` } as CSSProperties}><div className="podium-avatar"><PlayerMark row={row} rank={rank} /><span>#{rank + 1}</span></div><div className="podium-name"><strong>{row.fullName}</strong><small>{row.teamName} · {row.position}</small></div><div className="podium-score"><b>{impact(row)}</b><span>G + A</span></div><div className="podium-base"><i /><i /><i /></div></Link>;
          })}</div> : <div className="signal-empty">Aún no hay rendimiento individual para mostrar.</div>}
        </section>

        <section className="ranking-workbench">
          <div className="workbench-copy"><span>02 / CAMPO DE RENDIMIENTO</span><h2>Leé la producción a tu manera.</h2><p>El ranking se reordena por una métrica, manteniendo el contexto de equipo, minutos y participación.</p></div>
          <nav aria-label="Métrica de ranking" className="metric-switch">{([ ["goals", "Goles", "G"], ["assists", "Asistencias", "A"], ["ga", "Impacto", "G+A"] ] as const).map(([value, name, short]) => <Link key={value} href={`/${sport}/leaderboard?chart=${value}`} className={chart === value ? "metric-switch-active" : ""}><b>{short}</b><span>{name}</span></Link>)}</nav>
          <div className="workbench-chart">{activeRows.length ? <StandingsBars data={activeRows.slice(0, 7).map((row) => ({ name: row.fullName, short: row.fullName.split(" ").slice(-1)[0], value: chart === "goals" ? row.goals : chart === "assists" ? row.assists : impact(row), max, metricLabel: chart === "goals" ? "G" : chart === "assists" ? "A" : "G+A", detail: `${row.teamName} · ${row.matchesPlayed} PJ`, variant: chart }))} /> : <div className="signal-empty">Sin datos.</div>}</div>
        </section>

        <section className="ranking-ledger">
          <div className="ledger-head"><div><span>03 / REGISTRO DE RANKING</span><h2>{label} · clasificación viva</h2></div><p>La barra muestra la distancia respecto del valor más alto disponible.</p></div>
          <div className="ledger-columns"><span>Pos.</span><span>Jugador / equipo</span><span>Producción</span><span>Ritmo</span></div>
          <div className="ledger-list">{activeRows.map((row, index) => {
            const value = chart === "goals" ? row.goals : chart === "assists" ? row.assists : impact(row);
            return <Link key={row.playerId} href={`/${sport}/players/${row.playerId}`} className={`ledger-row ledger-row-${rankTone(index)}`} style={{ "--delay": `${Math.min(index * 34, 450)}ms` } as CSSProperties}><div className="ledger-rank"><b>{String(index + 1).padStart(2, "0")}</b><span>{index < 3 ? "TOP" : "RANK"}</span></div><div className="ledger-player"><PlayerMark row={row} rank={index} /><div><strong>{row.fullName}</strong><span>{row.teamName} · {row.position}</span></div></div><div className="ledger-production"><b>{value}</b><span>{chart === "goals" ? "goles" : chart === "assists" ? "asistencias" : "G + A"}</span><small>{row.goals}G · {row.assists}A · {row.matchesPlayed} PJ</small></div><div className="ledger-gauge"><MiniGauge value={value} max={max} tone={index === 0 ? "success" : "primary"} /></div></Link>;
          })}</div>
        </section></> : null}
      </Stack>
    </Container>
  );
}

import Link from "next/link";
import { TeamCrest } from "@/components/sports/teams/team-crest";
import { matchDetailHref } from "@/lib/navigation/match-detail-href";
import { publicModelVersionName } from "@/lib/presentation/model-version";
import { probabilityPercentages } from "@/lib/presentation/probability";
import type { CompetitionIntelligence } from "@/lib/services/competition-intelligence-service";
import type { Match, Team } from "@/types/db/tables";

function dateLabel(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "Fecha no disponible";
}

function MatchTeam({ team, side }: { team: Team | undefined; side: "home" | "away" }) {
  const name = team?.name ?? "Equipo no disponible";
  return <span className={`intel-match-team intel-match-team-${side}`}>
    <TeamCrest name={name} shortName={team?.short_name} logoUrl={team?.logo_url} size="sm" />
    <span>{name}</span>
  </span>;
}

function MatchRow({ match, sport, teams, score }: {
  match: Match; sport: string; teams: Map<string, Team>;
  score?: { homeScore: number; awayScore: number };
}) {
  return <Link href={matchDetailHref(sport, match.id)} className="intel-match-row">
    <span className="intel-match-date">{dateLabel(match.match_date)}</span>
    <span className="intel-match-line">
      <MatchTeam team={teams.get(match.home_team_id)} side="home" />
      <strong className="intel-match-score">{score ? `${score.homeScore} – ${score.awayScore}` : "VS"}</strong>
      <MatchTeam team={teams.get(match.away_team_id)} side="away" />
    </span>
    <span className={`intel-match-status ${score ? "intel-match-status-finished" : ""}`}>
      {score ? "Finalizado" : "Programado"}
    </span>
    <span className="intel-match-arrow" aria-hidden="true">↗</span>
  </Link>;
}

function ModuleTitle({ index, title, href, label }: { index: string; title: string; href?: string; label?: string }) {
  return <div className="intel-module-head">
    <div><span className="intel-index">{index}</span><h2>{title}</h2></div>
    {href && label ? <Link href={href} className="intel-module-link">{label} ↗</Link> : null}
  </div>;
}

export function CompetitionIntelligenceContent({ sport, data, showQuickNav = true }: {
  sport: string; data: CompetitionIntelligence; showQuickNav?: boolean;
}) {
  const teams = new Map(data.teams.map(team => [team.id, team]));
  const analysis = data.analysis;
  const analysisHome = analysis ? teams.get(analysis.match.home_team_id)?.name ?? "Equipo no disponible" : "";
  const analysisAway = analysis ? teams.get(analysis.match.away_team_id)?.name ?? "Equipo no disponible" : "";
  return <div className="intelligence-content">
    <div className="intel-lead-grid">
      <section className="intel-module intel-upcoming" aria-label="Próximos partidos">
        <ModuleTitle index="01 / CALENDARIO" title="Próximos partidos" href={`/${sport}/matches?view=upcoming`} label="Todos" />
        {data.upcoming.length ? data.upcoming.map(match =>
          <MatchRow key={match.id} match={match} sport={sport} teams={teams} />
        ) : <p className="intel-empty">No hay partidos próximos registrados para esta temporada.</p>}
      </section>

      <section className="intel-module intel-analysis" aria-label="Análisis SPORTS AI">
        <ModuleTitle index="02 / MODELO" title="Análisis SPORTS AI" href={`/${sport}/predictions`} label="Historial" />
        {analysis ? <div className="intel-analysis-body">
          <span className="intel-analysis-tag">Modelo experimental · Probabilidad del modelo</span>
          <Link href={matchDetailHref(sport, analysis.match.id)} className="intel-analysis-match">
            <MatchTeam team={teams.get(analysis.match.home_team_id)} side="home" />
            <span>VS</span>
            <MatchTeam team={teams.get(analysis.match.away_team_id)} side="away" />
          </Link>
          <div className="intel-prob-grid" aria-label={`Probabilidades del modelo para ${analysisHome} contra ${analysisAway}`}>
            {(() => {
              const percentages = probabilityPercentages(analysis.probabilities);
              return (["Local", "Empate", "Visitante"] as const).map((label, index) => {
                const percentage = index === 0 ? percentages.home : index === 1 ? percentages.draw : percentages.away;
                return <div key={label}><span>{label}</span><strong>{percentage}%</strong></div>;
              });
            })()}
          </div>
          <div className="intel-prob-track" aria-hidden="true">
            <i style={{ flexGrow: analysis.probabilities.home }} />
            <i style={{ flexGrow: analysis.probabilities.draw }} />
            <i style={{ flexGrow: analysis.probabilities.away }} />
          </div>
          {analysis.expectedGoals ? <p className="intel-xg">
            Goles esperados del modelo: local {analysis.expectedGoals.home.toFixed(2)} · visitante {analysis.expectedGoals.away.toFixed(2)}
          </p> : null}
          <p className="intel-analysis-meta">{publicModelVersionName(analysis.modelVersion)} · Predicción guardada {dateLabel(analysis.predictedAt)}</p>
        </div> : <p className="intel-empty">Análisis SPORTS AI aún no disponible</p>}
      </section>
    </div>

    <div className="intel-snapshot" aria-label="Resumen de la competición seleccionada">
      <span><small>Partidos con resultado válido</small><strong>{data.finishedCount}</strong></span>
      <span><small>Goles en esos partidos</small><strong>{data.goalsCount}</strong></span>
      <span><small>Líder de la tabla calculada</small><strong>{data.standings[0]?.teamName ?? "Aún no disponible"}</strong></span>
    </div>

    <div className="intel-secondary-grid">
      <section className="intel-module intel-table" aria-label="Tabla rápida">
        <ModuleTitle index="03 / COMPETICIÓN" title="Tabla rápida" href={`/${sport}/standings`} label="Tabla completa" />
        {data.standings.length ? <div className="intel-table-list">
          {data.standings.slice(0, 5).map((row, index) => {
            const team = teams.get(row.teamId);
            return <div key={row.teamId} className="intel-table-row">
              <span className="intel-table-position">{index + 1}</span>
              <TeamCrest name={team?.name ?? row.teamName} shortName={team?.short_name} logoUrl={team?.logo_url} size="sm" />
              <span className="intel-table-name">{row.teamName}</span>
              <span className="intel-table-played">{row.played} PJ</span>
              <strong className="intel-table-points">{row.points} pts</strong>
            </div>;
          })}
        </div> : <p className="intel-empty">La tabla estará disponible cuando haya resultados válidos.</p>}
      </section>

      <section className="intel-module intel-form" aria-label="Forma reciente">
        <ModuleTitle index="04 / TENDENCIA" title="Forma reciente" href={`/${sport}/standings`} label="Ver tabla" />
        {data.standings.some(row => row.recentForm.length > 0) ?
          data.standings.filter(row => row.recentForm.length > 0).slice(0, 3).map(row =>
            <div key={row.teamId} className="intel-form-row">
              <span>{row.teamName}</span>
              <span className="intel-form-pills" aria-label={`Últimos resultados de ${row.teamName}: ${row.recentForm.map(item => item === "W" ? "Ganó" : item === "D" ? "Empató" : "Perdió").join(", ")}`}>
                {row.recentForm.map((item, index) =>
                  <b key={`${row.teamId}-${index}`} className={`intel-form-${item}`} title={item === "W" ? "Ganó" : item === "D" ? "Empató" : "Perdió"}>
                    {item === "W" ? "G" : item === "D" ? "E" : "P"}
                  </b>
                )}
              </span>
            </div>
          ) : <p className="intel-empty">Forma reciente aún no disponible.</p>}
        <p className="intel-form-note">G ganó · E empató · P perdió. Calculada con resultados válidos.</p>
      </section>

      <section className="intel-module intel-results" aria-label="Últimos resultados">
        <ModuleTitle index="05 / RESULTADOS" title="Últimos resultados" href={`/${sport}/matches?view=finished`} label="Todos" />
        {data.results.length ? data.results.map(({ match, homeScore, awayScore }) =>
          <MatchRow key={match.id} match={match} sport={sport} teams={teams} score={{ homeScore, awayScore }} />
        ) : <p className="intel-empty">Todavía no hay resultados finalizados con marcador válido.</p>}
      </section>
    </div>

    {showQuickNav ? <nav className="intel-quick-nav" aria-label="Explorar la competición">
      <Link href={`/${sport}/matches`}>Partidos ↗</Link>
      <Link href={`/${sport}/standings`}>Tabla ↗</Link>
      <Link href={`/${sport}/players`}>Equipos ↗</Link>
      <Link href={`/${sport}/leaderboard`}>Estadísticas ↗</Link>
    </nav> : null}
  </div>;
}

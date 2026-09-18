import Link from "next/link";
import { Container, Stack } from "@/components/ui/container";
import { TeamCrest } from "@/components/sports/teams/team-crest";
import { CompetitionNav } from "@/components/sports/competition-nav";
import { getCompetitionTabs } from "@/shared/competition-tabs";
import type { SoccerStandingsRow } from "@/sports/soccer/types";
import type { Team } from "@/types/db/tables";

const FORM_MAP: Record<string, { letter: string; label: string }> = {
  W: { letter: "G", label: "Ganado" },
  D: { letter: "E", label: "Empatado" },
  L: { letter: "P", label: "Perdido" },
};

export default async function StandingsPage({
  sport,
  leagueName,
  seasonName,
  standings,
  teams,
}: {
  sport: string;
  leagueName: string;
  seasonName: string;
  standings: SoccerStandingsRow[];
  teams: Team[];
}) {
  const teamMap = new Map(teams.map((team) => [team.id, team]));
  const tabs = getCompetitionTabs(sport);

  return (
    <Container size="wide" className="product-page standings-page">
      <Stack gap="lg">
        <header className="comp-header">
          <div className="comp-header-info">
            <span className="comp-header-eyebrow">
              {leagueName}
            </span>
            <h1 className="comp-header-title">Tabla de posiciones</h1>
            <span className="comp-header-season">{seasonName}</span>
          </div>
        </header>

        <CompetitionNav sport={sport} activeTab={`/${sport}/standings`} tabs={tabs} />

        {standings.length === 0 ? (
          <div className="comp-empty-state">
            <span className="comp-empty-icon">📊</span>
            <p>No hay datos de tabla disponibles para esta competición.</p>
            <p className="comp-empty-sub">La tabla se muestra cuando hay partidos finalizados en la temporada.</p>
          </div>
        ) : (
          <div className="standings-table-wrap">
            <table className="standings-table">
              <caption className="sr-only">Tabla de posiciones de {leagueName}</caption>
              <thead>
                <tr>
                  <th scope="col" className="col-pos">#</th>
                  <th scope="col" className="col-team">Equipo</th>
                  <th scope="col" className="col-pj">PJ</th>
                  <th scope="col" className="col-extra col-g">G</th>
                  <th scope="col" className="col-extra col-e">E</th>
                  <th scope="col" className="col-extra col-p">P</th>
                  <th scope="col" className="col-extra col-gf">GF</th>
                  <th scope="col" className="col-extra col-gc">GC</th>
                  <th scope="col" className="col-extra col-dg">DG</th>
                  <th scope="col" className="col-pts">PTS</th>
                  <th scope="col" className="col-extra col-form">Forma</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((s, i) => {
                  const team = teamMap.get(s.teamId);
                  return (
                    <tr key={s.teamId}>
                      <td className="col-pos">
                        <span className="pos-badge">{i + 1}</span>
                      </td>
                      <td className="col-team">
                        <div className="team-cell">
                          <TeamCrest
                            name={team?.name ?? s.teamName}
                            shortName={team?.short_name ?? s.shortName}
                            logoUrl={team?.logo_url}
                            size="sm"
                          />
                          <span className="team-name">{s.teamName}</span>
                        </div>
                      </td>
                      <td className="col-pj tabular">{s.played}</td>
                      <td className="col-extra col-g tabular">{s.won}</td>
                      <td className="col-extra col-e tabular">{s.drawn}</td>
                      <td className="col-extra col-p tabular">{s.lost}</td>
                      <td className="col-extra col-gf tabular">{s.goalsFor}</td>
                      <td className="col-extra col-gc tabular">{s.goalsAgainst}</td>
                      <td className={`col-extra col-dg tabular ${s.goalDifference >= 0 ? "dg-pos" : "dg-neg"}`}>
                        {s.goalDifference >= 0 ? "+" : ""}{s.goalDifference}
                      </td>
                      <td className="col-pts tabular">{s.points}</td>
                      <td className="col-extra col-form">
                        <span className="form-strip" role="img" aria-label={`Forma reciente: ${s.recentForm.slice(-5).map((r) => FORM_MAP[r]?.label ?? r).join(", ")}`}>
                          {s.recentForm.slice(-5).map((r, fi) => {
                            const mapped = FORM_MAP[r];
                            return (
                              <span
                                key={fi}
                                className={`form-letter form-${r}`}
                                title={mapped?.label ?? r}
                              >
                                {mapped?.letter ?? r}
                              </span>
                            );
                          })}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Stack>
    </Container>
  );
}

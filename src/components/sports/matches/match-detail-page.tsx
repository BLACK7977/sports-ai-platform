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
import {
  DataTable,
  TableHead,
  Th,
  TableBody,
  Tr,
  Td,
  EmptyRow,
} from "@/components/ui/table";
import { MiniGauge, TeamFormStrip } from "@/components/charts/svg-charts";
import type { Match, Player, PlayerMatchStats, Team } from "@/types/db/tables";
import type { SoccerStandingsRow } from "@/sports/soccer/types";
import type {
  MatchAnalysisResult,
  MatchPredictionResult,
} from "@/types/ai";

export default function MatchDetailPage({
  sport,
  match,
  home,
  away,
  analysis,
  prediction,
  matchStats,
  standings,
  allSeasonMatches,
  playerMap,
}: {
  sport: string;
  match: Match;
  home: Team;
  away: Team;
  analysis: MatchAnalysisResult;
  prediction: MatchPredictionResult;
  matchStats: PlayerMatchStats[];
  standings: SoccerStandingsRow[];
  allSeasonMatches: Match[];
  playerMap: Map<string, Player>;
}) {
  const homeStats = matchStats.filter((s) => s.team_id === home.id);
  const awayStats = matchStats.filter((s) => s.team_id === away.id);
  const statusBadge = formatBadgeForStatus(match.status);
  const hForm = standings.find((x) => x.teamId === home.id)?.recentForm ?? [];
  const aForm = standings.find((x) => x.teamId === away.id)?.recentForm ?? [];
  const hs = match.home_score ?? 0;
  const as = match.away_score ?? 0;

  const leagueId = match.league_id;
  void leagueId;

  function buildRows(
    team: Team,
    list: PlayerMatchStats[],
  ): Array<{
    key: string;
    team: string;
    name: string;
    pid: string;
    pos: string;
    min: number;
    g: number;
    a: number;
    ta: number;
    tr: number;
    rating: number;
  }> {
    return list.map((s) => {
      const p = playerMap.get(s.player_id);
      const sp = (s.sport_specific ?? {}) as Record<string, unknown>;
      const g = Number(sp.goals ?? 0) || 0;
      const a = Number(sp.assists ?? 0) || 0;
      const ta = Number(sp.yellow_cards ?? 0) || 0;
      const tr = Number(sp.red_cards ?? 0) || 0;
      const rt = Number(sp.rating);
      return {
        key: s.id,
        team: team.short_name,
        name: p?.full_name ?? s.player_id,
        pid: s.player_id,
        pos: p?.position ?? "—",
        min: s.minutes_played,
        g,
        a,
        ta,
        tr,
        rating: Number.isFinite(rt) ? rt : 0,
      };
    });
  }

  const rowsCount =
    buildRows(home, homeStats).length + buildRows(away, awayStats).length;

  return (
    <Container size="wide">
      <Stack gap="xl">
        <Row className="mb-2">
          <LinkButton size="sm" tone="ghost" href={`/${sport}/matches`}>
            ← Volver a fixtures
          </LinkButton>
          <Badge tone={statusBadge.tone}>{statusBadge.label}</Badge>
        </Row>

        <Card>
          <CardBody className="py-8">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-6 md:gap-8 text-center">
              <div className="space-y-3">
                <div className="text-4xl" aria-hidden>
                  {home.name.split(" ")[0].charAt(0) +
                    (home.name.split(" ")[1]?.charAt(0) ?? "")}
                </div>
                <div className="text-xl font-bold break-words">{home.name}</div>
                <div className="text-xs text-slate-500">{home.short_name}</div>
                <div className="flex justify-center">
                  <TeamFormStrip form={hForm} size={22} />
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-xs text-slate-400">
                  {new Date(match.match_date).toLocaleString()}
                </div>
                <div className="text-5xl md:text-6xl font-black tabular-nums tracking-tight text-slate-900 dark:text-white">
                  {hs}
                  <span className="mx-3 text-slate-300 font-light">-</span>
                  {as}
                </div>
                <div className="text-xs text-slate-500">
                  {match.league_id} · {match.season_id}
                </div>
              </div>
              <div className="space-y-3">
                <div className="text-4xl" aria-hidden>
                  {away.name.split(" ")[0].charAt(0) +
                    (away.name.split(" ")[1]?.charAt(0) ?? "")}
                </div>
                <div className="text-xl font-bold break-words">{away.name}</div>
                <div className="text-xs text-slate-500">{away.short_name}</div>
                <div className="flex justify-center">
                  <TeamFormStrip form={aForm} size={22} />
                </div>
              </div>
            </div>
          </CardBody>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Análisis del partido (IA)</CardTitle>
              <CardSubtitle>Generado por el proveedor LLM configurado</CardSubtitle>
            </CardHeader>
            <CardBody className="space-y-4">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 p-4">
                <div className="text-xs text-slate-400 mb-1">Resumen</div>
                <p className="text-slate-800 dark:text-slate-100 leading-7">
                  {analysis.summary}
                </p>
              </div>
              <div>
                <div className="text-xs text-slate-400 mb-2">Insights clave</div>
                <ul className="list-disc pl-5 space-y-1 text-slate-700 dark:text-slate-200 text-sm">
                  {analysis.keyInsights.map((k, i) => (
                    <li key={i}>{k}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-xs text-slate-400 mb-2">Narrativa</div>
                <p className="leading-7 text-slate-700 dark:text-slate-200 text-sm">
                  {analysis.narrative}
                </p>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pronóstico</CardTitle>
              <CardSubtitle>IA antes/si el partido no hubiera finalizado</CardSubtitle>
            </CardHeader>
            <CardBody className="space-y-5">
              <div className="grid grid-cols-3 items-end gap-3 text-center">
                <div>
                  <MiniGauge
                    value={prediction.homeWinProbability}
                    max={100}
                    label={`${home.short_name} win`}
                    tone="primary"
                  />
                </div>
                <div>
                  <MiniGauge
                    value={prediction.drawProbability}
                    max={100}
                    label="Empate"
                    tone="warning"
                  />
                </div>
                <div>
                  <MiniGauge
                    value={prediction.awayWinProbability}
                    max={100}
                    label={`${away.short_name} win`}
                    tone="success"
                  />
                </div>
              </div>
              <div className="rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-400/30 p-4">
                <div className="text-xs text-indigo-700 dark:text-indigo-200 mb-1">
                  Marcador pronosticado
                </div>
                <div className="text-2xl font-bold text-indigo-900 dark:text-indigo-100 tabular-nums">
                  {prediction.predictedHomeScore} -{" "}
                  {prediction.predictedAwayScore}
                </div>
              </div>
              <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                {prediction.explanation}
              </p>
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Estadísticas de jugador</CardTitle>
            <CardSubtitle>
              {home.name} ({homeStats.length}) y {away.name} ({awayStats.length})
            </CardSubtitle>
          </CardHeader>
          <CardBody className="!p-0">
            <DataTable>
              <TableHead>
                <Th>Equipo</Th>
                <Th>Jugador</Th>
                <Th>Pos</Th>
                <Th align="right">Min</Th>
                <Th align="right">G</Th>
                <Th align="right">A</Th>
                <Th align="right">TA</Th>
                <Th align="right">TR</Th>
                <Th align="right">Rating</Th>
              </TableHead>
              <TableBody>
                {rowsCount === 0 ? (
                  <EmptyRow
                    message="Sin estadísticas de jugador en este partido (fixtures demo sin stats)."
                    cols={9}
                  />
                ) : (
                  [
                    ...buildRows(home, homeStats),
                    ...buildRows(away, awayStats),
                  ].map((r) => (
                    <Tr key={r.key} hoverable>
                      <Td>
                        <span className="font-medium">{r.team}</span>
                      </Td>
                      <Td>
                        <Link
                          href={`/${sport}/players/${r.pid}`}
                          className="hover:underline"
                        >
                          {r.name}
                        </Link>
                      </Td>
                      <Td>{r.pos}</Td>
                      <Td align="right">{r.min}</Td>
                      <Td align="right">{r.g}</Td>
                      <Td align="right">{r.a}</Td>
                      <Td align="right">{r.ta}</Td>
                      <Td align="right">{r.tr}</Td>
                      <Td align="right">
                        {r.rating > 0 ? r.rating.toFixed(1) : "—"}
                      </Td>
                    </Tr>
                  ))
                )}
              </TableBody>
            </DataTable>
          </CardBody>
        </Card>

        <Divider label="Otros partidos de la temporada" />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {allSeasonMatches
            .filter((m) => m.id !== match.id)
            .slice(0, 6)
            .map((m) => {
              const badge = formatBadgeForStatus(m.status);
              const showScore =
                m.status === "finished" || m.status === "in_progress";
              return (
                <Link
                  key={m.id}
                  href={`/${sport}/matches/${m.id}`}
                  className="block"
                >
                  <Card className="hover:border-indigo-300 transition">
                    <CardBody className="!py-4">
                      <Row className="justify-between">
                        <span className="text-xs text-slate-400">
                          {new Date(m.match_date).toLocaleDateString()}
                        </span>
                        <Badge tone={badge.tone}>{badge.label}</Badge>
                      </Row>
                      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-sm">
                        <div className="font-medium truncate">
                          {m.home_team_id
                            .replaceAll("-", " ")
                            .replace(
                              /\b\w/g,
                              (c) => c.toUpperCase(),
                            )}
                        </div>
                        <div className="font-bold tabular-nums px-2">
                          {showScore
                            ? `${m.home_score ?? 0} - ${m.away_score ?? 0}`
                            : "vs"}
                        </div>
                        <div className="font-medium truncate text-right">
                          {m.away_team_id
                            .replaceAll("-", " ")
                            .replace(
                              /\b\w/g,
                              (c) => c.toUpperCase(),
                            )}
                        </div>
                      </div>
                    </CardBody>
                  </Card>
                </Link>
              );
            })}
        </div>
      </Stack>
    </Container>
  );
}

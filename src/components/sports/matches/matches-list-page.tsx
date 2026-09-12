import Link from "next/link";
import { notFound } from "next/navigation";
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
  DataTable,
  TableHead,
  Th,
  TableBody,
  Tr,
  Td,
  EmptyRow,
} from "@/components/ui/table";
import { getHasSport } from "@/components/sports/sport-helpers";
import { getLeaguesBySportId } from "@/lib/db/repositories/leagues-repo";
import {
  getAllMatches,
  getMatchesByLeagueSeason,
} from "@/lib/db/repositories/matches-repo";
import { getTeamsByIds } from "@/lib/db/repositories/teams-repo";
import { getSeasonsByLeagueId } from "@/lib/db/repositories/seasons-repo";
import { ensureDbReady } from "@/lib/db/client";

export default async function MatchesListPage({
  sport,
}: {
  sport: string;
}) {
  const has = getHasSport(sport);
  if (!has) notFound();
  await ensureDbReady();

  const [leagues, allMatches] = await Promise.all([
    getLeaguesBySportId(sport),
    getAllMatches(),
  ]);
  const sportMatches = allMatches.filter(
    (m) => leagues.some((l) => l.id === m.league_id),
  );
  const mainLeague = leagues.find((l) => l.id === "demo-liga-1") ?? leagues[0];
  const mainSeasonId =
    mainLeague?.id === "demo-liga-1"
      ? "season-2026-1"
      : (
          await getSeasonsByLeagueId(mainLeague?.id ?? leagues[0]?.id ?? "")
        )[0]?.id ??
        "";
  const mainMatches = mainLeague
    ? await getMatchesByLeagueSeason(mainLeague.id, mainSeasonId)
    : [];
  const teamIds = new Set(
    mainMatches.flatMap((m) => [m.home_team_id, m.away_team_id]),
  );
  const teams = await getTeamsByIds([...teamIds]);
  const teamMap = new Map(teams.map((t) => [t.id, t]));

  return (
    <Container size="wide">
      <Stack gap="xl">
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <Row className="mb-2">
              <Badge tone="primary">{has.sport.emoji} {has.sport.displayName}</Badge>
              <Badge tone="neutral">{sportMatches.length} partidos totales</Badge>
            </Row>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
              Fixtures · Partidos
            </h1>
            <p className="text-slate-500 mt-1 max-w-2xl">
              Resultados, próximos encuentros y acceso al detalle con análisis
              de IA y pronóstico.
            </p>
          </div>
          <Row>
            <LinkButton href={`/${sport}/standings`} tone="outline">
              Tabla
            </LinkButton>
            <LinkButton href={`/${sport}/leaderboard`} tone="ghost">
              Ranking jugadores
            </LinkButton>
          </Row>
        </header>

        <Card>
          <CardHeader
            action={
              <LinkButton href={`/${sport}`} size="sm" tone="ghost">
                Volver
              </LinkButton>
            }
          >
            <CardTitle>{mainLeague?.name ?? "Liga"}</CardTitle>
            <CardSubtitle>{mainSeasonId} · {mainMatches.length} partidos</CardSubtitle>
          </CardHeader>
          <CardBody className="!p-0">
            <DataTable>
              <TableHead>
                <Th>Fecha</Th>
                <Th>Local</Th>
                <Th align="center">Marcador</Th>
                <Th>Visita</Th>
                <Th align="right">Estado</Th>
              </TableHead>
              <TableBody>
                {mainMatches.length === 0 ? (
                  <EmptyRow message="Sin partidos para esta liga/temporada." cols={5} />
                ) : (
                  [...mainMatches]
                    .sort((a, b) => (a.match_date < b.match_date ? 1 : -1))
                    .map((m) => {
                      const b = formatBadgeForStatus(m.status);
                      const d = new Date(m.match_date);
                      const showScore =
                        m.status === "finished" || m.status === "in_progress";
                      return (
                        <Tr
                          key={m.id}
                          onClick={() => {
                            // Link manual para evitar Next 16 hooks issues (MVP simple)
                            if (typeof window !== "undefined") {
                              // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                              window.location.href = `/${sport}/matches/${m.id}`;
                            }
                          }}
                        >
                          <Td>
                            <div className="font-medium">
                              {d.toLocaleDateString()}
                            </div>
                            <div className="text-xs text-slate-400">
                              {d.toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </div>
                          </Td>
                          <Td>
                            <Link
                              href={`/${sport}/matches/${m.id}`}
                              className="hover:underline"
                            >
                              {teamMap.get(m.home_team_id)?.name ??
                                m.home_team_id}
                            </Link>
                          </Td>
                          <Td align="center">
                            <div className="inline-flex items-center gap-3 rounded-lg bg-slate-100 dark:bg-slate-800 px-3 py-1 font-bold tabular-nums">
                              <span className={showScore ? "" : "opacity-0"}>
                                {m.home_score ?? 0}
                              </span>
                              <span className="text-slate-400">
                                {showScore ? ":" : "vs"}
                              </span>
                              <span className={showScore ? "" : "opacity-0"}>
                                {m.away_score ?? 0}
                              </span>
                            </div>
                          </Td>
                          <Td>
                            <Link
                              href={`/${sport}/matches/${m.id}`}
                              className="hover:underline"
                            >
                              {teamMap.get(m.away_team_id)?.name ??
                                m.away_team_id}
                            </Link>
                          </Td>
                          <Td align="right">
                            <Badge tone={b.tone}>{b.label}</Badge>
                          </Td>
                        </Tr>
                      );
                    })
                )}
              </TableBody>
            </DataTable>
          </CardBody>
        </Card>
      </Stack>
    </Container>
  );
}

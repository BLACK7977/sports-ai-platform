import Link from "next/link";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  CardSubtitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { getHasSport } from "@/components/sports/sport-helpers";
import type { Player, Team } from "@/types/db/tables";

function jerseyColor(teamId: string) {
  const colors = [
    ["bg-indigo-500", "text-white"],
    ["bg-emerald-500", "text-white"],
    ["bg-rose-500", "text-white"],
    ["bg-amber-500", "text-white"],
    ["bg-sky-500", "text-white"],
    ["bg-violet-500", "text-white"],
  ];
  let h = 0;
  for (let i = 0; i < teamId.length; i++) h = (h * 31 + teamId.charCodeAt(i)) >>> 0;
  return colors[h % colors.length];
}

function shortInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default async function PlayersListPage({
  sport,
  leagueName,
  teams,
  playersByTeam,
}: {
  sport: string;
  leagueName: string;
  teams: Team[];
  playersByTeam: Map<string, Player[]>;
}) {
  const has = getHasSport(sport);
  const sportEmoji = has?.sport.emoji ?? "⚽";
  const sportName = has?.sport.displayName ?? "Deporte";
  const totalPlayers = [...playersByTeam.values()].flat().length;

  return (
    <Container size="wide">
      <Stack gap="xl">
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div className="space-y-2">
            <Row>
              <Badge tone="primary">
                <span className="mr-1">{sportEmoji}</span>
                {sportName}
              </Badge>
              <Badge tone="info">{teams.length} equipos</Badge>
              <Badge tone="neutral">{totalPlayers} jugadores</Badge>
              <Badge tone="success">{leagueName}</Badge>
            </Row>
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white">
              Plantillas de equipos
            </h1>
            <p className="text-slate-500 max-w-2xl">
              Todos los jugadores por equipo con posición, dorsal y
              nacionalidad. Haz clic para ver el reporte detallado con IA.
            </p>
          </div>
          <Row className="flex-wrap gap-2">
            <LinkButton href={`/${sport}`} tone="ghost" size="md">
              ← Volver
            </LinkButton>
            <LinkButton href={`/${sport}/standings`} tone="outline" size="md">
              Tabla
            </LinkButton>
            <LinkButton
              href={`/${sport}/leaderboard`}
              tone="primary"
              size="md"
            >
              Ranking
            </LinkButton>
          </Row>
        </header>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardBody>
              <div className="text-xs text-slate-500">Equipos Liga1</div>
              <div className="text-3xl font-bold">{teams.length}</div>
              <div className="text-xs text-slate-500 mt-2">Plantillas completas</div>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <div className="text-xs text-slate-500">Jugadores totales</div>
              <div className="text-3xl font-bold">{totalPlayers}</div>
              <div className="text-xs text-emerald-600 mt-2 font-medium">
                {Math.round(totalPlayers / Math.max(1, teams.length))} por equipo
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <div className="text-xs text-slate-500">Arqueros</div>
              <div className="text-3xl font-bold">
                {[...playersByTeam.values()].flat().filter((p) =>
                  p.position.toLowerCase().includes("arquero") ||
                  p.position.toLowerCase().includes("portero") ||
                  p.position === "GK"
                ).length}
              </div>
              <div className="text-xs text-slate-500 mt-2">Posición GK</div>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <div className="text-xs text-slate-500">Delanteros</div>
              <div className="text-3xl font-bold">
                {[...playersByTeam.values()].flat().filter((p) =>
                  ["FW", "ST", "CF", "Delantero"].includes(p.position)
                ).length}
              </div>
              <div className="text-xs text-slate-500 mt-2">Atacantes</div>
            </CardBody>
          </Card>
        </div>

        {teams.map((team, tIdx) => {
          const players = playersByTeam.get(team.id) ?? [];
          const [jBg, jTxt] = jerseyColor(team.id);
          return (
            <Card key={team.id}>
              <CardHeader
                action={
                  <Badge tone="neutral">{players.length} jugadores</Badge>
                }
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`h-10 w-10 rounded-xl flex items-center justify-center font-bold ${jBg} ${jTxt}`}
                  >
                    {shortInitials(team.short_name ?? team.name)}
                  </div>
                  <div>
                    <CardTitle>{team.name}</CardTitle>
                    <CardSubtitle>
                      Plantilla {team.short_name ?? team.name}
                    </CardSubtitle>
                  </div>
                </div>
              </CardHeader>
              <CardBody className="!p-0">
                {players.length === 0 ? (
                  <EmptyRow
                    message="Sin jugadores en esta plantilla."
                    cols={6}
                  />
                ) : (
                  <DataTable>
                    <TableHead>
                      <tr>
                        <Th className="w-12">#</Th>
                        <Th>Jugador</Th>
                        <Th>Posición</Th>
                        <Th>Nacionalidad</Th>
                        <Th>Detalles</Th>
                        <Th className="w-20"></Th>
                      </tr>
                    </TableHead>
                    <TableBody>
                      {players.map((p) => (
                        <Tr
                          key={p.id}
                          hoverable
                          className="cursor-pointer"
                        >
                          <Td className="font-semibold text-slate-500 tabular-nums">
                            {p.jersey_number ?? "—"}
                          </Td>
                          <Td>
                            <Link
                              href={`/${sport}/players/${p.id}`}
                              className="font-medium hover:underline text-slate-800 dark:text-slate-100"
                            >
                              {p.full_name}
                            </Link>
                          </Td>
                          <Td>
                            <Badge
                              tone={
                                ["GK", "Arquero", "Portero"].includes(p.position)
                                  ? "warning"
                                  : ["DF", "Defensor"].includes(p.position)
                                    ? "info"
                                    : ["MF", "Mediocampista", "Volante"].includes(p.position)
                                      ? "primary"
                                      : "success"
                              }
                            >
                              {p.position}
                            </Badge>
                          </Td>
                          <Td className="text-slate-600 dark:text-slate-300">
                            {p.nationality ?? "—"}
                          </Td>
                          <Td className="text-slate-500 text-sm">
                            {p.short_name ?? p.position}
                          </Td>
                          <Td className="text-right">
                            <LinkButton
                              href={`/${sport}/players/${p.id}`}
                              size="sm"
                              tone="ghost"
                            >
                              Ver →
                            </LinkButton>
                          </Td>
                        </Tr>
                      ))}
                    </TableBody>
                  </DataTable>
                )}
              </CardBody>
              {tIdx < teams.length - 1 ? <Divider /> : null}
            </Card>
          );
        })}
      </Stack>
    </Container>
  );
}

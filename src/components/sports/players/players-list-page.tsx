import Link from "next/link";
import { Card, CardBody, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Container, Stack, Row } from "@/components/ui/container";
import { LinkButton } from "@/components/ui/button";
import { DataTable, TableHead, Th, TableBody, Tr, Td, EmptyRow } from "@/components/ui/table";
import { getHasSport } from "@/components/sports/sport-helpers";
import type { Player, Team } from "@/types/db/tables";

function jerseyColor(teamId: string) {
  const colors = [["bg-indigo-500", "text-white"], ["bg-emerald-500", "text-white"], ["bg-rose-500", "text-white"], ["bg-amber-500", "text-white"], ["bg-sky-500", "text-white"], ["bg-violet-500", "text-white"]];
  let hash = 0;
  for (let index = 0; index < teamId.length; index++) hash = (hash * 31 + teamId.charCodeAt(index)) >>> 0;
  return colors[hash % colors.length];
}

function shortInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.length === 1 ? parts[0].slice(0, 2).toUpperCase() : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function positionTone(position: string) {
  if (["GK", "Arquero", "Portero"].includes(position)) return "warning" as const;
  if (["DF", "Defensor"].includes(position)) return "info" as const;
  if (["MF", "Mediocampista", "Volante"].includes(position)) return "primary" as const;
  return "success" as const;
}

function isGoalkeeper(position: string) {
  return ["GK", "Arquero", "Portero", "Goalkeeper"].includes(position);
}

function isForward(position: string) {
  return ["FW", "ST", "CF", "Delantero", "Attacker", "Forward"].includes(position);
}

export default function PlayersListPage({ sport, leagueName, teams, selectedTeam, players }: { sport: string; leagueName: string; teams: Team[]; selectedTeam: Team | null; players: Player[] }) {
  const has = getHasSport(sport);
  const sportEmoji = has?.sport.emoji ?? "⚽";
  const sportName = has?.sport.displayName ?? "Deporte";
  const goalkeepers = players.filter((player) => isGoalkeeper(player.position)).length;
  const forwards = players.filter((player) => isForward(player.position)).length;
  const [jerseyBackground, jerseyText] = jerseyColor(selectedTeam?.id ?? "team");

  return <Container size="wide" className="product-page players-page"><Stack gap="xl">
    <header className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between"><div className="space-y-2"><Row><Badge tone="primary"><span className="mr-1">{sportEmoji}</span>{sportName}</Badge><Badge tone="info">{teams.length} equipos</Badge><Badge tone="neutral">{players.length} jugadores del plantel</Badge><Badge tone="success">{leagueName}</Badge></Row><div className="page-eyebrow">{sportEmoji} {sportName} · Base de plantillas</div><h1 className="page-title">Plantillas de equipos</h1><p className="max-w-2xl text-slate-400">Elegí un equipo para consultar su plantel, posición, dorsal y nacionalidad sin cargar el resto de las plantillas.</p></div><Row className="flex-wrap gap-2"><LinkButton href={`/${sport}`} tone="ghost" size="md">← Volver</LinkButton><LinkButton href={`/${sport}/standings`} tone="outline" size="md">Tabla</LinkButton><LinkButton href={`/${sport}/leaderboard`} tone="primary" size="md">Ranking</LinkButton></Row></header>

    <section aria-labelledby="team-selector-title" className="product-panel rounded-xl p-4 sm:p-5"><div className="mb-3 flex flex-wrap items-baseline justify-between gap-2"><div><p className="page-eyebrow">Selección de plantel</p><h2 id="team-selector-title" className="mt-1 text-xl font-semibold text-slate-100">Equipos de la competición</h2></div><span className="text-sm text-slate-400">{teams.length} disponibles</span></div><nav className="flex gap-2 overflow-x-auto pb-2" aria-label="Elegir equipo">{teams.map((team) => { const selected = selectedTeam?.id === team.id; return <Link key={team.id} href={`/${sport}/players?team=${encodeURIComponent(team.id)}`} aria-current={selected ? "page" : undefined} className={`shrink-0 rounded-lg border px-3 py-2 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 ${selected ? "border-cyan-300/60 bg-cyan-400/15 text-cyan-100" : "border-slate-700 bg-slate-950/30 text-slate-300 hover:border-cyan-300/40 hover:text-cyan-100"}`}>{team.short_name || team.name}</Link>; })}</nav></section>

    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4"><Card className="product-stat"><CardBody><div className="text-xs text-slate-500">Equipos de la competición</div><div className="text-3xl font-bold">{teams.length}</div><div className="mt-2 text-xs text-slate-500">Plantel bajo demanda</div></CardBody></Card><Card className="product-stat product-stat-assists"><CardBody><div className="text-xs text-slate-500">Jugadores del plantel</div><div className="text-3xl font-bold">{players.length}</div><div className="mt-2 text-xs font-medium text-emerald-600">{selectedTeam?.short_name ?? selectedTeam?.name ?? "Sin selección"}</div></CardBody></Card><Card className="product-stat product-stat-discipline"><CardBody><div className="text-xs text-slate-500">Arqueros</div><div className="text-3xl font-bold">{goalkeepers}</div><div className="mt-2 text-xs text-slate-500">Posición GK</div></CardBody></Card><Card className="product-stat"><CardBody><div className="text-xs text-slate-500">Delanteros</div><div className="text-3xl font-bold">{forwards}</div><div className="mt-2 text-xs text-slate-500">Plantel seleccionado</div></CardBody></Card></div>

    <Card className="product-panel"><CardHeader action={selectedTeam ? <Badge tone="neutral">{players.length} jugadores</Badge> : undefined}><div className="flex items-center gap-3"><div className={`flex h-10 w-10 items-center justify-center rounded-xl font-bold ${jerseyBackground} ${jerseyText}`}>{shortInitials(selectedTeam?.short_name ?? selectedTeam?.name ?? "—")}</div><div><CardTitle>{selectedTeam?.name ?? "Elegí un equipo"}</CardTitle><CardSubtitle>{selectedTeam ? `Plantilla ${selectedTeam.short_name ?? selectedTeam.name}` : "Seleccioná un equipo para cargar su plantel."}</CardSubtitle></div></div></CardHeader><CardBody className="!p-0">{!selectedTeam ? <EmptyRow message="No hay equipos disponibles en esta competición." cols={6} /> : players.length === 0 ? <EmptyRow message="Sin jugadores en esta plantilla." cols={6} /> : <DataTable><TableHead><Th className="w-12">#</Th><Th>Jugador</Th><Th>Posición</Th><Th>Nacionalidad</Th><Th>Detalles</Th><Th className="w-20" /></TableHead><TableBody>{players.map((player) => <Tr key={player.id} hoverable className="cursor-pointer"><Td className="font-semibold tabular-nums text-slate-500">{player.jersey_number ?? "—"}</Td><Td><Link href={`/${sport}/players/${player.id}`} className="font-medium text-slate-800 hover:underline dark:text-slate-100">{player.full_name}</Link></Td><Td><Badge tone={positionTone(player.position)}>{player.position}</Badge></Td><Td className="text-slate-600 dark:text-slate-300">{player.nationality ?? "—"}</Td><Td className="text-sm text-slate-500">{player.short_name ?? player.position}</Td><Td className="text-right"><LinkButton href={`/${sport}/players/${player.id}`} size="sm" tone="ghost">Ver →</LinkButton></Td></Tr>)}</TableBody></DataTable>}</CardBody></Card>
  </Stack></Container>;
}

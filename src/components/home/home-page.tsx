import Link from "next/link";
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
  countMatches,
  getMatchesByLeagueSeason,
} from "@/lib/db/repositories/matches-repo";
import { countPlayers } from "@/lib/db/repositories/players-repo";
import { getAllLeagues as getLeagues } from "@/lib/db/repositories/leagues-repo";
import { getActiveSports } from "@/lib/config/sports-registry";
import { ensureDbReady } from "@/lib/db/client";

export default async function HomePage() {
  await ensureDbReady();
  const [matchesCount, playersCount, leagues, sports] = await Promise.all([
    countMatches(),
    countPlayers(),
    getLeagues(),
    Promise.resolve(getActiveSports()),
  ]);

  const demoMatches =
    leagues.length > 0
      ? await getMatchesByLeagueSeason(
          leagues[0].id,
          leagues[0].id === "demo-liga-1" ? "season-2026-1" : "season-2026-2",
        )
      : [];
  const lastMatches = demoMatches.slice(0, 5);

  return (
    <Container size="wide">
      <Stack as="section" gap="xl">
        <header className="rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-8 sm:p-12 text-white shadow-lg">
          <div className="max-w-2xl space-y-4">
            <Badge tone="primary" className="bg-white/20 text-white ring-0">
              Plataforma deportiva con IA
            </Badge>
            <h1 className="text-3xl sm:text-4xl font-bold leading-tight">
              Estadísticas, partidos y análisis inteligente de tus deportes
              favoritos
            </h1>
            <p className="text-white/80 text-base sm:text-lg max-w-xl">
              Modo offline con datos demo de fútbol. Pronósticos, análisis de
              partido y reportes de jugador con LLM.
            </p>
            <Row>
              <LinkButton href="/soccer" tone="secondary" size="lg">
                Explorar Fútbol
              </LinkButton>
              <LinkButton
                href="/soccer/matches"
                tone="ghost"
                size="lg"
                className="text-white hover:bg-white/15 border border-white/20"
              >
                Ver partidos
              </LinkButton>
            </Row>
          </div>
        </header>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardBody className="space-y-1">
              <div className="text-xs text-slate-500">Deportes activos</div>
              <div className="text-3xl font-bold text-slate-900 dark:text-white">
                {sports.length}
              </div>
              <div className="text-xs text-indigo-600 dark:text-indigo-400">
                {sports.map((s) => s.emoji).join(" ")}{" "}
                {sports.map((s) => s.displayName).join(", ")}
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="space-y-1">
              <div className="text-xs text-slate-500">Partidos demo</div>
              <div className="text-3xl font-bold text-slate-900 dark:text-white">
                {matchesCount}
              </div>
              <div className="text-xs text-emerald-600">
                Modo offline activo
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="space-y-1">
              <div className="text-xs text-slate-500">Ligas</div>
              <div className="text-3xl font-bold text-slate-900 dark:text-white">
                {leagues.length}
              </div>
              <div className="text-xs text-slate-500">
                {leagues.slice(0, 2).map((l) => l.name).join(" · ")}
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="space-y-1">
              <div className="text-xs text-slate-500">Jugadores</div>
              <div className="text-3xl font-bold text-slate-900 dark:text-white">
                {playersCount}
              </div>
              <div className="text-xs text-slate-500">20 plantillas x 10</div>
            </CardBody>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader
              action={
                <LinkButton href="/soccer/matches" size="sm" tone="ghost">
                  Ver todos
                </LinkButton>
              }
            >
              <CardTitle>Últimos resultados</CardTitle>
              <CardSubtitle>Demo Liga Apertura</CardSubtitle>
            </CardHeader>
            <CardBody>
              <Stack gap="sm">
                {lastMatches.length === 0 ? (
                  <p className="text-sm text-slate-400">
                    No hay partidos para mostrar.
                  </p>
                ) : (
                  lastMatches.map((m) => {
                    const badge = formatBadgeForStatus(m.status);
                    const home = m.home_team_id
                      .replaceAll("-", " ")
                      .replace(/\b\w/g, (c) => c.toUpperCase());
                    const away = m.away_team_id
                      .replaceAll("-", " ")
                      .replace(/\b\w/g, (c) => c.toUpperCase());
                    return (
                      <Link
                        key={m.id}
                        href={`/soccer/matches/${m.id}`}
                        className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-4 p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/60 transition"
                      >
                        <div className="text-right">
                          <div className="font-medium text-slate-800 dark:text-slate-100">
                            {home}
                          </div>
                          <div className="text-xs text-slate-400 truncate">
                            {new Date(m.match_date).toLocaleDateString()}
                          </div>
                        </div>
                        <div className="text-base font-bold tabular-nums px-2">
                          {m.status === "finished" || m.status === "in_progress"
                            ? `${m.home_score ?? 0} - ${m.away_score ?? 0}`
                            : "vs"}
                        </div>
                        <div>
                          <div className="font-medium text-slate-800 dark:text-slate-100">
                            {away}
                          </div>
                        </div>
                        <Badge tone={badge.tone}>{badge.label}</Badge>
                      </Link>
                    );
                  })
                )}
              </Stack>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              action={
                <LinkButton href="/soccer/standings" size="sm" tone="ghost">
                  Tabla
                </LinkButton>
              }
            >
              <CardTitle>Categorías</CardTitle>
              <CardSubtitle>Explorar por deporte</CardSubtitle>
            </CardHeader>
            <CardBody>
              <Stack gap="sm">
                {sports.map((s) => (
                  <Link
                    key={s.id}
                    href={`/${s.id}`}
                    className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-800 p-4 hover:border-indigo-400 hover:bg-indigo-50/40 dark:hover:bg-indigo-500/10 transition"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-3xl" aria-hidden>
                        {s.emoji}
                      </span>
                      <div>
                        <div className="font-semibold text-slate-800 dark:text-slate-100">
                          {s.displayName}
                        </div>
                        <div className="text-xs text-slate-500">
                          {s.routesPath}
                        </div>
                      </div>
                    </div>
                    <span className="text-slate-400">→</span>
                  </Link>
                ))}
              </Stack>
            </CardBody>
          </Card>
        </div>
      </Stack>
    </Container>
  );
}

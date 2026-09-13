import { notFound } from "next/navigation";
import MatchesListPage from "@/components/sports/matches/matches-list-page";
import { ensureDbReady } from "@/lib/db/client";
import { hasSport } from "@/lib/config/sports-registry";
import { parseSportId, matchViewSchema, weekOffsetSchema } from "@/lib/config/validation";

export default async function MatchesRoute({
  params,
  searchParams,
}: {
  params: Promise<{ sport: string }>;
  searchParams: Promise<{ view?: string; week?: string }>;
}) {
  const { sport } = await params;
  if (!parseSportId(sport)) notFound();
  const { view: rawView, week: rawWeek } = await searchParams;
  const view = matchViewSchema.safeParse(rawView).data;
  const weekParsed = weekOffsetSchema.safeParse(Number(rawWeek)).data;
  const week = weekParsed === undefined ? undefined : String(weekParsed);
  await ensureDbReady();
  if (!hasSport(sport)) notFound();
  return <MatchesListPage sport={sport} view={view} week={week} />;
}

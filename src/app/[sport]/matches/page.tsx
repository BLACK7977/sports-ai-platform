import { notFound } from "next/navigation";
import MatchesListPage from "@/components/sports/matches/matches-list-page";
import { ensureDbReady } from "@/lib/db/client";
import { hasSport } from "@/lib/config/sports-registry";

export default async function MatchesRoute({
  params,
  searchParams,
}: {
  params: Promise<{ sport: string }>;
  searchParams: Promise<{ view?: string; week?: string }>;
}) {
  const { sport } = await params;
  const { view, week } = await searchParams;
  await ensureDbReady();
  if (!hasSport(sport)) notFound();
  return <MatchesListPage sport={sport} view={view} week={week} />;
}

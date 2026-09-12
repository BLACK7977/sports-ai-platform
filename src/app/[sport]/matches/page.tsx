import { notFound } from "next/navigation";
import MatchesListPage from "@/components/sports/matches/matches-list-page";
import { ensureDbReady } from "@/lib/db/client";
import { hasSport } from "@/lib/config/sports-registry";

export default async function MatchesRoute({
  params,
}: {
  params: Promise<{ sport: string }>;
}) {
  const { sport } = await params;
  await ensureDbReady();
  if (!hasSport(sport)) notFound();
  return <MatchesListPage sport={sport} />;
}

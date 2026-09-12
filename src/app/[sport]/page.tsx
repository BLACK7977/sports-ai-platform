import { notFound } from "next/navigation";
import SportLandingPage from "@/components/sports/sport-landing-page";
import { ensureDbReady } from "@/lib/db/client";
import { hasSport } from "@/lib/config/sports-registry";

export default async function SportPage({
  params,
}: {
  params: Promise<{ sport: string }>;
}) {
  const { sport } = await params;
  await ensureDbReady();
  if (!hasSport(sport)) notFound();
  return <SportLandingPage sport={sport} />;
}

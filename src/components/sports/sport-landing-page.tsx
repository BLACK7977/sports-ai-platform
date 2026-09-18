import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { getHasSport } from "@/components/sports/sport-helpers";
import { CompetitionSelector } from "@/components/sports/competition-selector";
import { CompetitionNav } from "@/components/sports/competition-nav";
import { LeagueLogo } from "@/components/sports/league-logo";
import { CompetitionIntelligenceContent } from "@/components/sports/intelligence/competition-intelligence-content";
import { getCompetitionSelectionState } from "@/lib/db/repositories/active-competition-repo";
import { getCompetitionIntelligence } from "@/lib/services/competition-intelligence-service";
import { ensureDbReady } from "@/lib/db/client";
import { getCompetitionTabs } from "@/shared/competition-tabs";

export default async function SportLandingPage({ sport }: { sport: string }) {
  if (!getHasSport(sport)) notFound();
  await ensureDbReady();
  const { active, candidates } = await getCompetitionSelectionState(sport);
  const data = await getCompetitionIntelligence(active);
  const logoUrl = active?.league.sport_specific.logo_url;
  return <Container size="wide" className="product-page intelligence-page">
    <header className="intel-center-header">
      <div className="intel-competition-ident">
        {active ? <LeagueLogo name={active.league.name} logoUrl={typeof logoUrl === "string" ? logoUrl : null} size="md" /> : null}
        <div>
          <span className="intel-eyebrow">CENTRO DE INTELIGENCIA</span>
          <h1>{active?.league.name ?? "No hay competición disponible"}</h1>
          {active ? <p>{[active.league.country, active.season.name].filter(Boolean).join(" · ")}</p> : null}
        </div>
      </div>
      <CompetitionSelector sportId={sport} active={active} candidates={candidates} />
    </header>
    <CompetitionNav sport={sport} activeTab={`/${sport}`} tabs={getCompetitionTabs(sport)} />
    <CompetitionIntelligenceContent sport={sport} data={data} showQuickNav={false} />
  </Container>;
}

import { Container } from "@/components/ui/container";
import { CompetitionSelector } from "@/components/sports/competition-selector";
import { LeagueLogo } from "@/components/sports/league-logo";
import { CompetitionIntelligenceContent } from "@/components/sports/intelligence/competition-intelligence-content";
import { getCompetitionSelectionState } from "@/lib/db/repositories/active-competition-repo";
import { getCompetitionIntelligence } from "@/lib/services/competition-intelligence-service";
import { ensureDbReady } from "@/lib/db/client";

export default async function HomePage() {
  await ensureDbReady();
  const { active, candidates } = await getCompetitionSelectionState("soccer");
  const data = await getCompetitionIntelligence(active);
  const logoUrl = active?.league.sport_specific.logo_url;
  return <div className="home-stage">
    <Container size="wide" className="intelligence-page">
      <header className="intel-home-intro">
        <span className="intel-eyebrow">SPORTS AI / FÚTBOL</span>
        <h1>Inteligencia deportiva basada en datos reales</h1>
        <p>Partidos, tabla y análisis del modelo en una lectura clara de la competición que elegís.</p>
      </header>
      <section className="intel-competition-bar" aria-label="Competición seleccionada">
        <div className="intel-competition-ident">
          {active ? <LeagueLogo name={active.league.name} logoUrl={typeof logoUrl === "string" ? logoUrl : null} size="md" /> : null}
          <div>
            <span className="intel-eyebrow">COMPETICIÓN ACTIVA</span>
            <h2>{active?.league.name ?? "No hay competición disponible"}</h2>
            {active ? <p>{[active.league.country, active.season.name].filter(Boolean).join(" · ")}</p> : null}
          </div>
        </div>
        <CompetitionSelector sportId="soccer" active={active} candidates={candidates} />
      </section>
      <CompetitionIntelligenceContent sport="soccer" data={data} />
    </Container>
  </div>;
}

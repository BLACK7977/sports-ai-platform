import type { MatchCoachView, MatchVenueView } from "@/lib/types/match-context";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";

function ageAt(dateOfBirth: string | null, at: string): number | null {
  if (!dateOfBirth) return null;
  const birth = new Date(`${dateOfBirth}T00:00:00Z`);
  const reference = new Date(at);
  if (!Number.isFinite(birth.getTime()) || !Number.isFinite(reference.getTime())) return null;
  let age = reference.getUTCFullYear() - birth.getUTCFullYear();
  if (reference.getUTCMonth() < birth.getUTCMonth() || (reference.getUTCMonth() === birth.getUTCMonth() && reference.getUTCDate() < birth.getUTCDate())) age--;
  return age >= 0 && age < 120 ? age : null;
}

function initials(name: string) { return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }

export function MatchCoachesCard({ coaches, homeTeamId, awayTeamId, kickoff }: { coaches: MatchCoachView[]; homeTeamId: string; awayTeamId: string; kickoff: string }) {
  const home = coaches.find((coach) => coach.location === "home" && coach.teamId === homeTeamId);
  const away = coaches.find((coach) => coach.location === "away" && coach.teamId === awayTeamId);
  if (!home || !away) return null;
  return <Card className="match-panel match-context-card"><CardHeader><CardTitle><span className="module-kicker">DIRECCIÓN TÉCNICA</span> DT local vs DT visitante</CardTitle></CardHeader><CardBody><div className="match-coaches-grid">{[home, away].map((coach) => {
    const age = ageAt(coach.dateOfBirth, kickoff);
    return <article key={coach.id} className="match-coach"><div className="match-context-avatar">{coach.imageUrl && !coach.imageIsPlaceholder ? <img src={coach.imageUrl} alt="" /> : <span>{initials(coach.fullName)}</span>}</div><div><small>{coach.location === "home" ? "DT LOCAL" : "DT VISITANTE"}</small><strong>{coach.fullName}</strong>{coach.nationality || age !== null ? <span>{[coach.nationality, age !== null ? `${age} años` : null].filter(Boolean).join(" · ")}</span> : null}</div></article>;
  })}</div></CardBody></Card>;
}

export function MatchVenueCard({ venue }: { venue: MatchVenueView | null }) {
  if (!venue) return null;
  const details = [venue.city, venue.address, venue.capacity !== null ? `${venue.capacity.toLocaleString("es-AR")} espectadores` : null, venue.surface].filter(Boolean);
  return <Card className="match-panel match-context-card"><CardHeader><CardTitle><span className="module-kicker">SEDE DEL PARTIDO</span> Estadio</CardTitle></CardHeader><CardBody><div className="match-venue-context">{venue.imageUrl ? <img src={venue.imageUrl} alt={`Vista de ${venue.name}`} /> : <div className="match-venue-neutral" aria-hidden="true">⌖</div>}<div><strong>{venue.name}</strong>{details.length ? <span>{details.join(" · ")}</span> : null}</div></div></CardBody></Card>;
}

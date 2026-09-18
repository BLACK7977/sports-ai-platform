import type { NormalizedMatchContext } from "@/lib/types/match-context";

type Row = Record<string, unknown>;
const row = (value: unknown): Row | null => value && typeof value === "object" && !Array.isArray(value) ? value as Row : null;
const rows = (value: unknown): Row[] => Array.isArray(value) ? value.map(row).filter((v): v is Row => Boolean(v)) : [];
const text = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;
const safeInt = (value: unknown): number | null => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
const finite = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
const external = (kind: string, id: number) => `sportmonks:${kind}:${id}`;

export function isPlaceholderImage(url: string | null): boolean {
  return Boolean(url && /placeholder|no[-_ ]?image|default[-_ ]?(avatar|image)/i.test(url));
}

export function normalizeFixtureMatchContext(input: unknown): NormalizedMatchContext {
  const fixture = row(input);
  const fixtureId = safeInt(fixture?.id);
  if (!fixture || !fixtureId) throw new Error("Fixture Sportmonks inválido.");

  const locations = new Map<number, "home" | "away">();
  for (const participant of rows(fixture.participants)) {
    const id = safeInt(participant.id);
    const location = text(row(participant.meta)?.location)?.toLowerCase();
    if (id && (location === "home" || location === "away")) locations.set(id, location);
  }

  const coaches = rows(fixture.coaches).flatMap((coach) => {
    const id = safeInt(coach.id);
    const participantId = safeInt(row(coach.meta)?.participant_id);
    const location = participantId ? locations.get(participantId) : undefined;
    const fullName = text(coach.display_name) ?? text(coach.name);
    if (!id || !participantId || !location || !fullName) return [];
    const imageUrl = text(coach.image_path);
    return [{
      id: external("coach", id), externalId: String(id),
      participantExternalId: external("team", participantId), location, fullName,
      imageUrl, imageIsPlaceholder: isPlaceholderImage(imageUrl),
      nationalityId: safeInt(coach.nationality_id)?.toString() ?? null,
      nationality: text(row(coach.nationality)?.name), dateOfBirth: text(coach.date_of_birth),
    }];
  });

  const venueRow = row(fixture.venue);
  const fixtureVenueId = safeInt(fixture.venue_id);
  const venueId = safeInt(venueRow?.id);
  const venueName = text(venueRow?.name);
  const venue = fixtureVenueId && venueId === fixtureVenueId && venueName ? {
    id: external("venue", venueId), externalId: String(venueId), name: venueName,
    city: text(row(venueRow?.city)?.name) ?? text(venueRow?.city_name),
    address: text(venueRow?.address), capacity: safeInt(venueRow?.capacity),
    surface: text(venueRow?.surface), imageUrl: text(venueRow?.image_path),
    latitude: finite(venueRow?.latitude), longitude: finite(venueRow?.longitude),
  } : null;

  return { fixtureExternalId: String(fixtureId), coaches, venue };
}

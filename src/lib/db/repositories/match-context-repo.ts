import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getEnv, getSupabaseProjectUrl, hasSupabase } from "@/lib/config/env";
import type { NormalizedMatchContext, PersistedMatchContext } from "@/lib/types/match-context";

type MatchCoachRow = { team_id: string; coach_id: string; location: "home" | "away" };
type CoachRow = { id: string; full_name: string; image_url: string | null; image_is_placeholder: boolean; nationality_name: string | null; date_of_birth: string | null };
type VenueRow = { id: string; name: string; city: string | null; address: string | null; capacity: number | null; surface: string | null; image_url: string | null };

function client() {
  const env = getEnv();
  const url = getSupabaseProjectUrl();
  if (!url || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase no configurado.");
  return createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

export async function getPersistedMatchContext(matchId: string): Promise<PersistedMatchContext> {
  if (!hasSupabase()) return { coaches: [], venue: null };
  const sb = client();
  const [linksResult, metadataResult] = await Promise.all([
    sb.from("match_coaches").select("team_id,coach_id,location").eq("match_id", matchId),
    sb.from("match_metadata").select("venue_id").eq("match_id", matchId).maybeSingle(),
  ]);
  if (linksResult.error && /does not exist|schema cache/i.test(linksResult.error.message)) return { coaches: [], venue: null };
  if (linksResult.error) throw linksResult.error;
  if (metadataResult.error) throw metadataResult.error;
  const links = (linksResult.data ?? []) as MatchCoachRow[];
  const coachIds = [...new Set(links.map((link) => link.coach_id))];
  const venueId = typeof metadataResult.data?.venue_id === "string" ? metadataResult.data.venue_id : null;
  const [coachesResult, venueResult] = await Promise.all([
    coachIds.length ? sb.from("coaches").select("id,full_name,image_url,image_is_placeholder,nationality_name,date_of_birth").in("id", coachIds) : Promise.resolve({ data: [], error: null }),
    venueId ? sb.from("venues").select("id,name,city,address,capacity,surface,image_url").eq("id", venueId).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (coachesResult.error) throw coachesResult.error;
  if (venueResult.error) throw venueResult.error;
  const coachMap = new Map(((coachesResult.data ?? []) as CoachRow[]).map((row) => [row.id, row]));
  return {
    coaches: links.flatMap((link) => {
      const coach = coachMap.get(link.coach_id);
      return coach ? [{ id: coach.id, teamId: link.team_id, location: link.location, fullName: coach.full_name, imageUrl: coach.image_url, imageIsPlaceholder: coach.image_is_placeholder, nationality: coach.nationality_name, dateOfBirth: coach.date_of_birth }] : [];
    }),
    venue: (venueResult.data as VenueRow | null) ? (() => { const value = venueResult.data as VenueRow; return { id: value.id, name: value.name, city: value.city, address: value.address, capacity: value.capacity, surface: value.surface, imageUrl: value.image_url }; })() : null,
  };
}

export async function getMatchIdsWithPersistedContext(matchIds: string[]): Promise<Set<string>> {
  if (!hasSupabase() || matchIds.length === 0) return new Set();
  const result = await client().from("match_coaches").select("match_id").in("match_id", matchIds);
  if (result.error && /does not exist|schema cache/i.test(result.error.message)) return new Set();
  if (result.error) throw result.error;
  return new Set((result.data ?? []).flatMap((row) => typeof row.match_id === "string" ? [row.match_id] : []));
}

export async function persistMatchContext(matchId: string, teamIds: Record<"home" | "away", string>, snapshot: NormalizedMatchContext): Promise<void> {
  const sb = client();
  const now = new Date().toISOString();
  for (const coach of snapshot.coaches) {
    const teamId = teamIds[coach.location];
    const coachWrite = await sb.from("coaches").upsert({ id: coach.id, provider: "sportmonks", external_id: coach.externalId, full_name: coach.fullName, image_url: coach.imageUrl, image_is_placeholder: coach.imageIsPlaceholder, nationality_id: coach.nationalityId, nationality_name: coach.nationality, date_of_birth: coach.dateOfBirth, last_synced_at: now, updated_at: now }, { onConflict: "provider,external_id" });
    if (coachWrite.error) throw coachWrite.error;
    const linkWrite = await sb.from("match_coaches").upsert({ id: `sportmonks:match-coach:${snapshot.fixtureExternalId}:${coach.externalId}`, match_id: matchId, team_id: teamId, coach_id: coach.id, location: coach.location, provider: "sportmonks", provider_fixture_id: snapshot.fixtureExternalId, observed_at: now, updated_at: now }, { onConflict: "match_id,team_id,provider" });
    if (linkWrite.error) throw linkWrite.error;
  }
  if (snapshot.venue) {
    const venue = snapshot.venue;
    const venueWrite = await sb.from("venues").upsert({ id: venue.id, provider: "sportmonks", external_id: venue.externalId, name: venue.name, city: venue.city, address: venue.address, capacity: venue.capacity, surface: venue.surface, image_url: venue.imageUrl, latitude: venue.latitude, longitude: venue.longitude, last_synced_at: now, updated_at: now }, { onConflict: "provider,external_id" });
    if (venueWrite.error) throw venueWrite.error;
    const metaWrite = await sb.from("match_metadata").upsert({ match_id: matchId, venue_id: venue.id, provider: "sportmonks", provider_fixture_id: snapshot.fixtureExternalId, last_synced_at: now, updated_at: now }, { onConflict: "match_id" });
    if (metaWrite.error) throw metaWrite.error;
  }
}

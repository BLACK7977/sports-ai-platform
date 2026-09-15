import type { MatchMetadataInsert, MatchStatisticInsert, MatchEventInsert, MatchLineupInsert, Jsonb } from "@/types/db/tables";

// ============================================================================
// Sportmonks Fixture Detail → Internal Enrichment Rows
//
// Policy:
// - No hardcoded provider semantic ID maps. All semantic names come from
//   structurally nested provider data (statistics.type, events.type, etc.).
// - If the provider does not supply a semantic name, it stays null.
// - Event identity uses provider_event_id when available. Events without
//   provider_event_id get a stable fingerprint from immutable provider fields.
// - Lineup is_starter is null when not structurally determinable.
// ============================================================================

type FixtureRecord = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Strict parsers — reject empty strings, whitespace, junk, non-finite
// ---------------------------------------------------------------------------

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toStr(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function toInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && Number.isInteger(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n) && Number.isInteger(n)) return n;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Metadata (venue, referees, round, formations)
// ---------------------------------------------------------------------------

export function normalizeMetadata(matchId: string, fx: FixtureRecord, provider: string): MatchMetadataInsert {
  const venue = (fx.venue ?? {}) as FixtureRecord;
  const referees = Array.isArray(fx.referees) ? fx.referees : [];
  const referee = referees[0] as FixtureRecord | undefined;
  const round = (fx.round ?? {}) as FixtureRecord;
  const formations = Array.isArray(fx.formations) ? fx.formations : [];
  const participants = Array.isArray(fx.participants) ? fx.participants : [];

  // A formation does not carry a reliable display order. Sportmonks identifies
  // its owner through the fixture participant, whose meta.location is the
  // canonical home/away signal. Do not fall back to array order: a reversed
  // provider response must never swap the formations in our metadata.
  const participantSides = new Map<string, "home" | "away">();
  for (const rawParticipant of participants) {
    const participant = rawParticipant as FixtureRecord;
    const meta = (participant.meta ?? {}) as FixtureRecord;
    const side = toStr(meta.location)?.toLowerCase();
    const id = toStr(participant.id);
    if (id && (side === "home" || side === "away")) participantSides.set(id, side);
  }

  let homeFormation: string | null = null;
  let awayFormation: string | null = null;
  for (const rawFormation of formations) {
    const formationRecord = rawFormation as FixtureRecord;
    const participant = formationRecord.participant as FixtureRecord | undefined;
    const formation = toStr(formationRecord.formation);
    const participantId = toStr(formationRecord.participant_id)
      ?? toStr(formationRecord.team_id)
      ?? toStr(participant?.id);
    const nestedMeta = (participant?.meta ?? {}) as FixtureRecord;
    const nestedSide = toStr(nestedMeta.location)?.toLowerCase();
    const side = nestedSide === "home" || nestedSide === "away"
      ? nestedSide
      : participantId ? participantSides.get(participantId) : undefined;

    if (!formation || !side) continue;
    if (side === "home") homeFormation = formation;
    else awayFormation = formation;
  }

  const now = new Date().toISOString();
  return {
    match_id: matchId,
    venue_provider_id: toStr(venue.id),
    venue_name: toStr(venue.name),
    venue_city: toStr(venue.city_name) ?? toStr(venue.city),
    venue_capacity: toInt(venue.capacity),
    venue_address: toStr(venue.address),
    venue_latitude: toNum(venue.latitude),
    venue_longitude: toNum(venue.longitude),
    venue_surface: toStr(venue.surface),
    round_provider_id: toStr(round.id),
    round_name: toStr(round.name),
    main_referee_provider_id: referee ? toStr(referee.id) : null,
    main_referee_name: referee ? toStr(referee.fullname) ?? toStr(referee.name) : null,
    home_formation: homeFormation,
    away_formation: awayFormation,
    provider,
    provider_fixture_id: toStr(fx.id),
    last_synced_at: now,
    updated_at: now,
  };
}

// ---------------------------------------------------------------------------
// Statistics — semantic names ONLY from structurally nested type data
// ---------------------------------------------------------------------------

function statValueToNumber(raw: unknown): number | null {
  if (typeof raw === "number") return raw;
  if (typeof raw === "string" && raw.trim()) {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  if (raw !== null && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const v = obj.value;
    if (typeof v === "number") return v;
    if (typeof v === "string" && v.trim()) {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }
    const pct = obj.percentage;
    if (typeof pct === "number") return pct;
    if (typeof pct === "string" && pct.trim()) {
      const n = Number(pct);
      return Number.isFinite(n) ? n : null;
    }
  }
  return null;
}

export function normalizeStatistics(matchId: string, stats: unknown[], provider: string): MatchStatisticInsert[] {
  if (!Array.isArray(stats)) return [];
  const result: MatchStatisticInsert[] = [];
  const now = new Date().toISOString();

  for (const raw of stats) {
    const s = raw as FixtureRecord;
    const type = (s.type ?? {}) as FixtureRecord;
    const providerTypeId = toStr(s.type_id) ?? toStr(type.id);
    if (!providerTypeId) continue;

    const participantId = toStr(s.participant_id);
    const name = toStr(type.name) ?? null;
    const value = statValueToNumber(s.data);
    const location = toStr(s.location);

    result.push({
      id: `stat-${matchId}-${provider}-${participantId ?? "all"}-${providerTypeId}`,
      match_id: matchId,
      provider_participant_id: participantId,
      provider_stat_type_id: providerTypeId,
      stat_name: name,
      stat_value: value,
      stat_value_json: s.data as Jsonb,
      location,
      provider,
      sport_specific: {},
      updated_at: now,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Events — type name from structural type.name, identity from provider_event_id
// ---------------------------------------------------------------------------

function fingerprintEvent(e: FixtureRecord): string {
  const parts = [
    toStr(e.minute) ?? "",
    toStr(e.type_id) ?? "",
    toStr(e.player_id) ?? "",
    toStr(e.team_id) ?? "",
    toStr(e.description) ?? "",
    typeof e.result === "object" ? JSON.stringify(e.result) : (toStr(e.result) ?? ""),
  ];
  return `fp-${parts.join("|")}`;
}

export function normalizeEvents(matchId: string, events: unknown[], provider: string): MatchEventInsert[] {
  if (!Array.isArray(events)) return [];
  const result: MatchEventInsert[] = [];
  const now = new Date().toISOString();

  for (const raw of events) {
    const e = raw as FixtureRecord;
    const type = (e.type ?? {}) as FixtureRecord;
    const providerEventId = toStr(e.id);
    const typeStr = toStr(type.name);
    const relatedPlayerId = toStr(e.related_player_id);
    const providerPlayerName = toStr(e.player_name);
    const relatedPlayerName = toStr(e.related_player_name);
    const providerTeamId = toStr(e.team_id)
      ?? toStr(e.participant_id)
      ?? toStr((e.participant as FixtureRecord)?.id);

    // Keep the structured companion-player fields provided by Sportmonks. The
    // event table has no dedicated related-player provider column, so the
    // existing JSONB field is the lossless, backwards-compatible home for it.
    const eventContext: Record<string, string | boolean> = {};
    if (providerPlayerName) eventContext.provider_player_name = providerPlayerName;
    if (relatedPlayerId) eventContext.related_player_provider_id = relatedPlayerId;
    if (relatedPlayerName) eventContext.related_player_name = relatedPlayerName;
    if (typeof e.on_bench === "boolean") eventContext.player_on_bench = e.on_bench;

    result.push({
      id: `evt-${matchId}-${provider}-${providerEventId ?? fingerprintEvent(e)}`,
      match_id: matchId,
      provider_player_id: toStr(e.player_id),
      provider_team_id: providerTeamId,
      provider_event_id: providerEventId,
      provider_event_type_id: toStr(e.type_id) ?? toStr(type.id),
      event_type: typeStr,
      minute: toInt(e.minute),
      extra_minute: toInt(e.extra_minute),
      result: typeof e.result === "object" ? JSON.stringify(e.result) : toStr(e.result),
      event_detail: toStr(e.description),
      provider,
      sport_specific: eventContext as Jsonb,
      created_at: now,
      updated_at: now,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Lineups — position and formation values are preserved directly from the
// provider. Sportmonks' type 11/12 semantics were checked on three independent
// Superliga fixtures (11 / 9 per team); other values remain unclassified.
// ---------------------------------------------------------------------------

export function normalizeLineups(matchId: string, lineups: unknown[], provider: string): MatchLineupInsert[] {
  if (!Array.isArray(lineups)) return [];
  const result: MatchLineupInsert[] = [];
  const now = new Date().toISOString();

  for (const raw of lineups) {
    const l = raw as FixtureRecord;
    const player = (l.player ?? {}) as FixtureRecord;
    const position = (l.position ?? {}) as FixtureRecord;
    const detailedPosition = (l.detailedposition ?? l.detailed_position ?? {}) as FixtureRecord;
    const pid = toStr(l.id) ?? toStr(player.id) ?? toStr(l.player_id);
    if (!pid) continue;

    const providerTypeId = toStr(l.type_id) ?? toStr((l.type as FixtureRecord | undefined)?.id);
    // These values are verified Sportmonks semantics only. Other providers
    // remain unclassified until their own contract is explicitly confirmed.
    const isStarter = provider === "sportmonks"
      ? providerTypeId === "11" ? true : providerTypeId === "12" ? false : null
      : null;

    result.push({
      id: `lineup-${matchId}-${provider}-${pid}`,
      match_id: matchId,
      provider_player_id: toStr(player.id) ?? toStr(l.player_id),
      provider_team_id: toStr(l.team_id),
      is_starter: isStarter,
      player_name: toStr(player.display_name) ?? toStr(player.name) ?? toStr(l.player_name),
      position_id: toStr(l.position_id) ?? toStr(position.id),
      detailed_position_id: toStr(l.detailedposition_id) ?? toStr(l.detailed_position_id) ?? toStr(detailedPosition.id),
      position_name: toStr(detailedPosition.name) ?? toStr(position.name),
      provider_type_id: providerTypeId,
      jersey_number: toInt(l.jersey_number) ?? toInt(l.shirt_number),
      formation_position: toInt(l.formation_position),
      formation_field: toStr(l.formation_field),
      provider,
      sport_specific: {},
      created_at: now,
      updated_at: now,
    });
  }

  return result;
}

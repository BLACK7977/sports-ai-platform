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

  let homeFormation: string | null = null;
  let awayFormation: string | null = null;
  for (const f of formations) {
    const participant = (f as FixtureRecord).participant as FixtureRecord | undefined;
    const formation = toStr((f as FixtureRecord).formation);
    const side = toStr(participant?.meta_value) ?? toStr(participant?.position);
    if (side === "1" || side?.toLowerCase() === "home") homeFormation = formation;
    else if (side === "2" || side?.toLowerCase() === "away") awayFormation = formation;
    else if (!homeFormation) homeFormation = formation;
    else if (!awayFormation) awayFormation = formation;
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

    result.push({
      id: `evt-${matchId}-${provider}-${providerEventId ?? fingerprintEvent(e)}`,
      match_id: matchId,
      provider_player_id: toStr(e.player_id),
      provider_team_id: toStr(e.team_id) ?? toStr((e.participant as FixtureRecord)?.id),
      provider_event_id: providerEventId,
      provider_event_type_id: toStr(e.type_id) ?? toStr(type.id),
      event_type: typeStr,
      minute: toInt(e.minute),
      extra_minute: toInt(e.extra_minute),
      result: typeof e.result === "object" ? JSON.stringify(e.result) : toStr(e.result),
      event_detail: toStr(e.description),
      provider,
      sport_specific: e.result as Jsonb ?? {},
      created_at: now,
      updated_at: now,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Lineups — is_starter is null when not structurally determinable
// ---------------------------------------------------------------------------

export function normalizeLineups(matchId: string, lineups: unknown[], provider: string): MatchLineupInsert[] {
  if (!Array.isArray(lineups)) return [];
  const result: MatchLineupInsert[] = [];
  const now = new Date().toISOString();

  for (const raw of lineups) {
    const l = raw as FixtureRecord;
    const player = (l.player ?? {}) as FixtureRecord;
    const pid = toStr(l.id) ?? toStr(player.id) ?? toStr(l.player_id);
    if (!pid) continue;

    const isStarter = l.is_starter != null ? Boolean(l.is_starter) : null;

    result.push({
      id: `lineup-${matchId}-${provider}-${pid}`,
      match_id: matchId,
      provider_player_id: toStr(player.id) ?? toStr(l.player_id),
      provider_team_id: toStr(l.team_id),
      is_starter: isStarter,
      position_id: toStr(l.position_id),
      position_name: toStr((l.position as FixtureRecord)?.name),
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

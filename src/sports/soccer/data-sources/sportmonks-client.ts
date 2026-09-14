import "server-only";
import { getEnv } from "@/lib/config/env";

const DEFAULT_BASE_URL = "https://api.sportmonks.com/v3/football";

type ApiEnvelope<T> = {
  data: T;
  pagination?: { has_more?: boolean; current_page?: number; total?: number; next_page?: string | null };
};

export type SportmonksLeague = {
  id: number;
  name: string;
  country?: { name?: string } | null;
  country_id?: number;
  active?: boolean;
  type?: string;
  sub_type?: string;
  image_path?: string | null;
};
export type SportmonksSeason = { id: number; league_id: number; name: string; is_current: boolean; starting_at?: string | null; ending_at?: string | null };
export type SportmonksTeam = { id: number; name: string; short_code?: string | null; image_path?: string | null };
export type SportmonksSquadEntry = { player?: { id: number; name: string; display_name?: string | null; date_of_birth?: string | null; nationality?: { name?: string } | null }; player_id?: number; position?: { name?: string } | null; jersey_number?: number | null };
export type SportmonksFixture = Record<string, unknown>;

function asArray<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value];
}

function toUtcDate(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error(`[sportmonks] fecha inválida: ${value}.`);
  return date;
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Server-only HTTP client. It never logs the token or places it in client code. */
export class SportmonksClient {
  private readonly token: string;
  private readonly baseUrl: string;

  constructor(token = getEnv().SPORTMONKS_API_TOKEN, baseUrl = getEnv().SPORTMONKS_BASE_URL ?? DEFAULT_BASE_URL) {
    if (!token) throw new Error("[sportmonks] SPORTMONKS_API_TOKEN no está configurado.");
    this.token = token;
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  private async request<T>(path: string, params: Record<string, string | undefined> = {}): Promise<ApiEnvelope<T>> {
    const url = new URL(`${this.baseUrl}${path}`);
    url.searchParams.set("api_token", this.token);
    for (const [key, value] of Object.entries(params)) if (value) url.searchParams.set(key, value);
    const response = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
    if (!response.ok) throw new Error(`[sportmonks] ${path} respondió HTTP ${response.status}.`);
    const body = await response.json() as ApiEnvelope<T> & { message?: string };
    if (!body.data) throw new Error(`[sportmonks] ${path} no devolvió data${body.message ? `: ${body.message}` : "."}`);
    return body;
  }

  private async get<T>(path: string, params: Record<string, string | undefined> = {}): Promise<T> {
    return (await this.request<T>(path, params)).data;
  }

  private async getAll<T>(path: string, params: Record<string, string | undefined> = {}): Promise<T[]> {
    const rows: T[] = [];
    let page = 1;
    while (true) {
      const response = await this.request<T[] | T>(path, page === 1 ? params : { ...params, page: String(page) });
      rows.push(...asArray(response.data));
      if (!response.pagination?.has_more) return rows;
      const nextUrl = response.pagination.next_page;
      const next = nextUrl ? Number(new URL(nextUrl).searchParams.get("page")) : page + 1;
      if (!Number.isInteger(next)) throw new Error(`[sportmonks] paginación sin página siguiente válida en ${path}.`);
      if (next <= page) throw new Error(`[sportmonks] paginación inválida en ${path}.`);
      page = next;
    }
  }

  getLeagueById(leagueId: number): Promise<SportmonksLeague> {
    return this.get<SportmonksLeague>(`/leagues/${leagueId}`, { include: "country" });
  }

  getSeasonById(seasonId: number): Promise<SportmonksSeason> {
    return this.get<SportmonksSeason>(`/seasons/${seasonId}`);
  }

  async resolveArgentinaPrimera(): Promise<SportmonksLeague> {
    const leagues = asArray(await this.get<SportmonksLeague[] | SportmonksLeague>("/leagues/search/Liga%20Profesional"));
    const league = leagues.find((item) => item.country?.name?.toLowerCase() === "argentina" && /liga profesional/i.test(item.name));
    if (!league) throw new Error("[sportmonks] No se encontró Liga Profesional Argentina entre las competiciones accesibles.");
    return league;
  }

  async resolveCurrentSeason(leagueId: number): Promise<SportmonksSeason> {
    const seasons = asArray(await this.get<SportmonksSeason[] | SportmonksSeason>("/seasons", {
      filters: `seasonLeagues:${leagueId}`,
    }));
    const season = seasons.find((item) => item.is_current);
    if (!season) throw new Error(`[sportmonks] No hay temporada actual accesible para la liga ${leagueId}.`);
    return season;
  }

  getTeamsBySeason(seasonId: number): Promise<SportmonksTeam[]> {
    return this.get<SportmonksTeam[]>(`/teams/seasons/${seasonId}`);
  }

  getSquadBySeasonTeam(seasonId: number, teamId: number): Promise<SportmonksSquadEntry[]> {
    return this.get<SportmonksSquadEntry[]>(`/squads/seasons/${seasonId}/teams/${teamId}`, { include: "player;position" });
  }

  getStandingsBySeason(seasonId: number): Promise<Record<string, unknown>[]> {
    return this.get<Record<string, unknown>[]>(`/standings/seasons/${seasonId}`);
  }

  getFixturesBetween(leagueId: number, from: string, to: string): Promise<SportmonksFixture[]> {
    return this.getAll<SportmonksFixture>(`/fixtures/between/${from}/${to}`, {
      filters: `fixtureLeagues:${leagueId}`,
      include: "participants;scores;state",
    });
  }

  /** Single fixture by Sportmonks ID. Used by targeted score refresh. */
  getFixtureById(fixtureId: number): Promise<SportmonksFixture> {
    return this.get<SportmonksFixture>(`/fixtures/${fixtureId}`, {
      include: "participants;scores;state",
    });
  }

  /** Sportmonks rejects season-wide ranges; this keeps every request inside one calendar month. */
  async getFixturesByMonthlyWindows(leagueId: number, from: string, to: string): Promise<Array<{ from: string; to: string; fixtures: SportmonksFixture[] }>> {
    const end = toUtcDate(to);
    let cursor = toUtcDate(from);
    if (cursor > end) throw new Error("[sportmonks] la fecha inicial es posterior a la final.");

    const windows: Array<{ from: string; to: string; fixtures: SportmonksFixture[] }> = [];
    while (cursor <= end) {
      const nextMonth = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
      const monthEnd = new Date(nextMonth.getTime() - 86_400_000);
      const windowEnd = monthEnd < end ? monthEnd : end;
      const windowFrom = toDateOnly(cursor);
      const windowTo = toDateOnly(windowEnd);
      windows.push({ from: windowFrom, to: windowTo, fixtures: await this.getFixturesBetween(leagueId, windowFrom, windowTo) });
      cursor = new Date(windowEnd.getTime() + 86_400_000);
    }
    return windows;
  }
}

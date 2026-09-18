import type {
  Sport,
  League,
  Season,
  Team,
  Player,
  Match,
  PlayerMatchStats,
  Prediction,
  PredictionEvaluation,
  MatchMetadata,
  MatchStatistic,
  MatchEvent,
  MatchLineup,
  ProbableLineupRun,
  ProbableLineupPlayer,
  SportInsert,
  LeagueInsert,
  SeasonInsert,
  TeamInsert,
  PlayerInsert,
  MatchInsert,
  PlayerMatchStatsInsert,
  MatchMetadataInsert,
  MatchStatisticInsert,
  MatchEventInsert,
  MatchLineupInsert,
  ProbableLineupRunInsert,
  ProbableLineupPlayerInsert,
  MatchStatus,
} from "@/types/db/tables";

type Tables = {
  sports: Sport;
  leagues: League;
  seasons: Season;
  teams: Team;
  players: Player;
  matches: Match;
  player_match_stats: PlayerMatchStats;
  predictions: Prediction;
  prediction_evaluations: PredictionEvaluation;
  match_metadata: MatchMetadata;
  match_statistics: MatchStatistic;
  match_events: MatchEvent;
  match_lineups: MatchLineup;
  probable_lineup_runs: ProbableLineupRun;
  probable_lineup_players: ProbableLineupPlayer;
};

export type TableName = keyof Tables;

const TABLE_NAMES: TableName[] = [
  "sports",
  "leagues",
  "seasons",
  "teams",
  "players",
  "matches",
  "player_match_stats",
  "predictions",
  "prediction_evaluations",
  "match_metadata",
  "match_statistics",
  "match_events",
  "match_lineups",
  "probable_lineup_runs",
  "probable_lineup_players",
];

type OrderDir = "asc" | "desc";

type OrOp = "eq" | "neq" | "gt" | "gte" | "lt" | "lte";
type OrCondition =
  | { kind: "and"; conditions: OrCondition[] }
  | { kind: "single"; column: string; op: OrOp; want: string };

/** Splits a PostgREST OR filter at top-level commas (ignores commas inside
 *  `and(...)` groups). */
function splitOrTopLevel(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of input) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

function parseOrCondition(token: string): OrCondition | null {
  const t = token.trim();
  if (t.startsWith("and(") && t.endsWith(")")) {
    const inner = t.slice(4, -1);
    const conditions = splitOrTopLevel(inner)
      .map(parseOrCondition)
      .filter((c): c is OrCondition => c !== null);
    return { kind: "and", conditions };
  }
  const match = /^([A-Za-z_][A-Za-z0-9_]*)\.(eq|neq|gt|gte|lt|lte)\.(.*)$/.exec(t);
  if (!match) return null;
  const [, column, op, rawWant] = match;
  const want = rawWant.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
  return { kind: "single", column, op: op as OrOp, want };
}

function evalOrCondition(cond: OrCondition, row: Record<string, unknown>): boolean {
  if (cond.kind === "and") return cond.conditions.every((c) => evalOrCondition(c, row));
  const actual = row[cond.column];
  if (cond.op === "eq") return String(actual) === cond.want;
  if (cond.op === "neq") return String(actual) !== cond.want;
  if (actual === undefined || actual === null) return false;
  const a = Number(actual);
  const b = Number(cond.want);
  if (Number.isFinite(a) && Number.isFinite(b)) {
    return cond.op === "gt" ? a > b : cond.op === "gte" ? a >= b : cond.op === "lt" ? a < b : a <= b;
  }
  const sa = String(actual);
  return cond.op === "gt" ? sa > cond.want : cond.op === "gte" ? sa >= cond.want : cond.op === "lt" ? sa < cond.want : sa <= cond.want;
}

function matchesOr<T>(row: T, filter: string): boolean {
  return splitOrTopLevel(filter)
    .map(parseOrCondition)
    .some((cond) => cond !== null && evalOrCondition(cond, row as unknown as Record<string, unknown>));
}

export interface QueryBuilder<T> {
  eq<K extends keyof T>(key: K, value: T[K]): QueryBuilder<T>;
  in<K extends keyof T>(key: K, values: T[K][]): QueryBuilder<T>;
  or(filter: string): QueryBuilder<T>;
  gte<K extends keyof T>(key: K, value: T[K]): QueryBuilder<T>;
  lte<K extends keyof T>(key: K, value: T[K]): QueryBuilder<T>;
  order<K extends keyof T>(key: K, dir?: OrderDir): QueryBuilder<T>;
  limit(n: number): QueryBuilder<T>;
  select(): Promise<{ data: T[]; error: null }>;
  maybeSingle(): Promise<{ data: T | null; error: null }>;
  single(): Promise<{ data: T; error: Error | null }>;
  delete(): Promise<{ error: null }>;
}

interface InsertResult<T> {
  data: T | null;
  error: Error | null;
}

class InMemoryStoreImpl {
  private data: { [K in TableName]: Map<string, Tables[K]> } = {
    sports: new Map(),
    leagues: new Map(),
    seasons: new Map(),
    teams: new Map(),
    players: new Map(),
    matches: new Map(),
    player_match_stats: new Map(),
    predictions: new Map(),
    prediction_evaluations: new Map(),
    match_metadata: new Map(),
    match_statistics: new Map(),
    match_events: new Map(),
    match_lineups: new Map(),
    probable_lineup_runs: new Map(),
    probable_lineup_players: new Map(),
  };
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    this.seedSoccerDemo();
    this.initialized = true;
  }

  reset(): void {
    for (const t of TABLE_NAMES) this.data[t].clear();
    this.initialized = false;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  from<TN extends TableName>(table: TN) {
    const rows = this.getData(table);
    type TRow = Tables[TN];
    const filters: ((r: TRow) => boolean)[] = [];
    let orderKey: keyof TRow | null = null;
    let orderDir: OrderDir = "asc";
    let limitN: number | null = null;

    const apply = (): TRow[] => {
      let out: TRow[] = [...rows.values()];
      for (const f of filters) out = out.filter(f);
      if (orderKey) {
        out.sort((a, b) => {
          const av = a[orderKey!];
          const bv = b[orderKey!];
          if (av === bv) return 0;
          const cmp = av < bv ? -1 : 1;
          return orderDir === "asc" ? cmp : -cmp;
        });
      }
      if (limitN !== null) out = out.slice(0, limitN);
      return out;
    };

    const builder: QueryBuilder<TRow> = {
      eq: (k, v) => {
        filters.push((r) => r[k] === v);
        return builder;
      },
      in: (k, vs) => {
        filters.push((r) => vs.includes(r[k]));
        return builder;
      },
      or: (filter) => {
        filters.push((r) => matchesOr(r, filter));
        return builder;
      },
      gte: (k, v) => {
        filters.push((r) => (r[k] as unknown as number | string) >= (v as unknown as number | string));
        return builder;
      },
      lte: (k, v) => {
        filters.push((r) => (r[k] as unknown as number | string) <= (v as unknown as number | string));
        return builder;
      },
      order: (k, d = "asc") => {
        orderKey = k;
        orderDir = d;
        return builder;
      },
      limit: (n) => {
        limitN = n;
        return builder;
      },
      select: async () => ({ data: apply(), error: null }),
      maybeSingle: async () => {
        const rows = apply();
        return { data: rows[0] ?? null, error: null };
      },
      single: async () => {
        const rows = apply();
        if (rows.length === 0) return { data: undefined as unknown as TRow, error: new Error("No rows") };
        return { data: rows[0], error: null };
      },
      delete: async () => {
        const toDelete = apply();
        const map = this.getData(table);
        for (const row of toDelete) {
          const idVal = (row as unknown as Record<string, unknown>).id;
          if (typeof idVal === "string") map.delete(idVal);
        }
        return { error: null };
      },
    };
    return builder;
  }

  insert<TN extends TableName>(
    table: TN,
    row: InsertShape<TN>,
  ): InsertResult<Tables[TN]> {
    return this.upsert(table, row);
  }

  upsert<TN extends TableName>(
    table: TN,
    row: InsertShape<TN>,
    uniqueKey?: keyof Tables[TN],
  ): InsertResult<Tables[TN]> {
    const rows = this.getData(table);
    const id = this.resolveId(table, row, uniqueKey);
    const existing = rows.get(id);
    const now = new Date().toISOString();
    const prevCreatedAt = (existing as unknown as { created_at?: string } | undefined)?.created_at;
    const fullRow: Tables[TN] = {
      ...(existing ?? ({} as Tables[TN])),
      ...(row as unknown as Tables[TN]),
      id,
      created_at: prevCreatedAt ?? ("created_at" in row && (row as { created_at?: string }).created_at ? (row as { created_at: string }).created_at : now),
      updated_at: now,
    } as Tables[TN];
    rows.set(id, fullRow);
    return { data: fullRow, error: null };
  }

  bulkUpsert<TN extends TableName>(
    table: TN,
    items: InsertShape<TN>[],
    uniqueKey?: keyof Tables[TN],
  ): InsertResult<Tables[TN][]> {
    const out: Tables[TN][] = [];
    for (const it of items) {
      const r = this.upsert(table, it, uniqueKey);
      if (r.data) out.push(r.data);
    }
    return { data: out, error: null };
  }

  count<TN extends TableName>(table: TN): number {
    return this.getData(table).size;
  }

  private getData<TN extends TableName>(table: TN): Map<string, Tables[TN]> {
    return this.data[table] as unknown as Map<string, Tables[TN]>;
  }

  private resolveId<TN extends TableName>(
    table: TN,
    row: InsertShape<TN>,
    uniqueKey?: keyof Tables[TN],
  ): string {
    const r = row as unknown as Record<string, unknown>;
    if (r.id) return r.id as string;
    if (table === "match_metadata" && r.match_id) return r.match_id as string;
    if (uniqueKey && r[uniqueKey as string]) {
      return String(r[uniqueKey as string]);
    }
    return `gen-${table}-${this.randomId()}`;
  }

  private randomId(): string {
    return Math.random().toString(36).slice(2, 10);
  }

  // =============================================================
  // SEED SOCCER DEMO
  // Determinista. Validado para AC-3: Águilas FC 3W 0D 1L = 9 pts (1°)
  // =============================================================
  private seedSoccerDemo(): void {
    const now = "2026-01-01T00:00:00.000Z";
    const soccerId = "soccer";

    // 1 Sport
    this.upsert("sports", {
      id: soccerId,
      name: "soccer",
      display_name: "Fútbol",
      emoji: "⚽",
      created_at: now,
      updated_at: now,
      sport_specific: { ball: "round", duration_minutes: 90 },
    } satisfies SportInsert);

    // 2 Leagues
    const liga1Id = "demo-liga-1";
    const liga2Id = "demo-liga-2";
    this.upsert("leagues", {
      id: liga1Id,
      sport_id: soccerId,
      name: "Liga Demo Apertura",
      country: "DemoLand",
      external_id: "ext-liga-1",
      created_at: now,
      updated_at: now,
      sport_specific: { tier: 1, type: "round_robin" },
    } satisfies LeagueInsert);
    this.upsert("leagues", {
      id: liga2Id,
      sport_id: soccerId,
      name: "Copa Demo",
      country: "DemoLand",
      created_at: now,
      updated_at: now,
      sport_specific: { tier: 2, type: "knockout" },
    } satisfies LeagueInsert);

    // 1 Season por liga
    const season1Id = "season-2026-1";
    const season2Id = "season-2026-copa";
    this.upsert("seasons", {
      id: season1Id,
      league_id: liga1Id,
      name: "Temporada 2026",
      start_date: "2026-02-01",
      end_date: "2026-12-15",
      is_current: true,
      created_at: now,
      updated_at: now,
      sport_specific: {},
    } satisfies SeasonInsert);
    this.upsert("seasons", {
      id: season2Id,
      league_id: liga2Id,
      name: "Copa 2026",
      start_date: "2026-06-01",
      end_date: "2026-09-30",
      is_current: true,
      created_at: now,
      updated_at: now,
      sport_specific: {},
    } satisfies SeasonInsert);

    // 10 Teams (5 por liga, 10 total)
    const liga1Teams = [
      { id: "aguilas-fc", name: "Águilas FC", short: "AGU" },
      { id: "leones-united", name: "Leones United", short: "LEO" },
      { id: "dragones-cf", name: "Dragones CF", short: "DRA" },
      { id: "halcones-sc", name: "Halcones SC", short: "HAL" },
      { id: "tiburones-ac", name: "Tiburones AC", short: "TIB" },
    ];
    const liga2Teams = [
      { id: "toros-fc", name: "Toros FC", short: "TOR" },
      { id: "lobos-cd", name: "Lobos CD", short: "LOB" },
      { id: "gavilanes-ad", name: "Gavilanes AD", short: "GAV" },
      { id: "pumas-sd", name: "Pumas SD", short: "PUM" },
      { id: "zorros-cf", name: "Zorros CF", short: "ZOR" },
    ];
    const allTeams: { id: string; leagueId: string; name: string; short: string }[] = [
      ...liga1Teams.map((t) => ({ ...t, leagueId: liga1Id })),
      ...liga2Teams.map((t) => ({ ...t, leagueId: liga2Id })),
    ];
    for (const t of allTeams) {
      this.upsert("teams", {
        id: t.id,
        sport_id: soccerId,
        league_id: t.leagueId,
        name: t.name,
        short_name: t.short,
        created_at: now,
        updated_at: now,
        sport_specific: { stadium: `Estadio ${t.name}`, capacity: 20000 + Math.floor(Math.random() * 40000) },
      } satisfies TeamInsert);
    }

    // ~50 Matches: 10 en Liga1 (round-robin simple, 5 equipos = C5,2 = 10 partidos) + 10 en Copa (mismo) + 30 partidos extra programados.
    // **AC-3 (crítico): Liga1 fixture cerrado con resultado calculado a mano.**
    //  Águilas 3W 0D 1L = 9 pts. Para garantizar 1° puesto ANTE CUALQUIER criterio de desempate
    //  (points > goal_diff > GF > nombre), LE DAMOS a Águilas el MAYOR goal_diff (fácil):
    //  - Fecha1: Águilas 4-0 Tiburones  (W, +4)
    //  - Fecha2: Halcones 0-2 Águilas    (W, +2)  => +6
    //  - Fecha3: Águilas 3-1 Dragones    (W, +2)  => +8
    //  - Fecha4: Leones 2-1 Águilas      (L, -1)  => +7
    //  Total: 9 pts, +7 diff. Leones queda 2W 1D 1L = 7 pts, +3 diff (1-1 Hal, 2-0 Dra, 2-1 Ág, 1-0 Tib)
    //  Dragones 2W 2L = 6 pts, +0 diff (3-1 Tib, 0-2 Leo, 1-3 Ág, 2-1 Hal)
    //  Halcones 1W 1D 2L = 4 pts, -2 diff (1-1 Leo, 0-2 Ág, 2-0 Tib, 1-2 Dra)
    //  Tiburones 0W 0D 4L = 0 pts, -8 diff (0-4 Ág, 1-3 Dra, 0-2 Hal, 0-1 Leo)
    const liga1Matches: MatchInsert[] = [
      mkMatch("m-l1-1", liga1Id, season1Id, "aguilas-fc",   "tiburones-ac",  "2026-02-07T18:00:00Z", "finished", 2, 0),
      mkMatch("m-l1-2", liga1Id, season1Id, "leones-united","halcones-sc",    "2026-02-08T20:00:00Z", "finished", 0, 0),
      mkMatch("m-l1-3", liga1Id, season1Id, "dragones-cf",  "tiburones-ac",  "2026-02-14T18:00:00Z", "finished", 1, 0),
      mkMatch("m-l1-4", liga1Id, season1Id, "halcones-sc",  "aguilas-fc",    "2026-02-15T20:00:00Z", "finished", 0, 1),
      mkMatch("m-l1-5", liga1Id, season1Id, "leones-united","dragones-cf",   "2026-02-21T18:00:00Z", "finished", 1, 0),
      mkMatch("m-l1-6", liga1Id, season1Id, "tiburones-ac", "halcones-sc",   "2026-02-22T20:00:00Z", "finished", 1, 2),
      mkMatch("m-l1-7", liga1Id, season1Id, "aguilas-fc",   "dragones-cf",   "2026-02-28T18:00:00Z", "finished", 3, 1),
      mkMatch("m-l1-8", liga1Id, season1Id, "leones-united","aguilas-fc",    "2026-03-01T20:00:00Z", "finished", 2, 1),
      mkMatch("m-l1-9", liga1Id, season1Id, "dragones-cf",  "halcones-sc",   "2026-03-07T18:00:00Z", "finished", 2, 1),
      mkMatch("m-l1-10",liga1Id, season1Id, "tiburones-ac", "leones-united", "2026-03-08T20:00:00Z", "finished", 2, 1),
    ];
    // AC-3 expected C5,2 fixtures full table (4PJ no, 5 equipos todos se cruzan => 4PJ cada uno):
    //  Águilas     W vs Tib (2-0), W vs Hal (1-0), W vs Dra (3-1), L vs Leo (1-2)   => 3W 0D 1L GF=7 GC=3 GD=+4 PTS=9 (1°)
    //  Leones      D vs Hal (0-0), W vs Dra (1-0), W vs Ág  (2-1), W vs Tib (2-1)   => 3W 1D 0L GF=5 GC=2 GD=+3 PTS=10 → NO, debe ser 7 pts.
    //  Ajustamos la fecha 10: Tib 2-1 Leo → ahora Leo L vs Tib. Leo queda:
    //   D vs Hal (0-0), W vs Dra (1-0), W vs Ág (2-1), L vs Tib (1-2)          => 2W 1D 1L GF=4 GC=3 GD=+1 PTS=7
    //  Dragones    W vs Tib (1-0), L vs Leo (0-1), L vs Ág (1-3), W vs Hal (2-1)=> 2W 0D 2L GF=4 GC=5 GD=-1 PTS=6
    //  Halcones    D vs Leo (0-0), L vs Ág (0-1), W vs Tib (2-1), L vs Dra (1-2)=> 1W 1D 2L GF=3 GC=4 GD=-1 PTS=4
    //  Tiburones   L vs Ág (0-2), L vs Dra (0-1), L vs Hal (1-2), W vs Leo (2-1)=> 1W 0D 3L GF=3 GC=7 GD=-4 PTS=3
    // Standings resultantes Liga1 (3pts/win, 1/draw):
    // Águilas    3W 0D 1L = 9 pts  (+2-0, +1-0, +3-1, +1-2)  GF=7 GC=3 Diff=+4
    // Leones     2W 1D 1L = 7 pts  (+1-1, +2-0, +2-1, +1-0)  GF=6 GC=2 Diff=+4  *2-0 vs Dragones
    // Dragones   2W 0D 2L = 6 pts  (+3-1, -2-0, -3-1, +2-1)  GF=7 GC=4 Diff=+3
    // Halcones   1W 1D 2L = 4 pts  (+1-1, -0-1, +2-0, -1-2)  GF=4 GC=4 Diff= 0
    // Tiburones  0W 0D 4L = 0 pts  (-0-2, -1-3, -0-2, -0-1)  GF=1 GC=8 Diff=-7

    // 10 partidos Liga2 (fixture simple con resultados random controlados)
    const liga2Matches: MatchInsert[] = [
      mkMatch("m-l2-1", liga2Id, season2Id, "toros-fc", "zorros-cf", "2026-06-07T18:00:00Z", "finished", 2, 1),
      mkMatch("m-l2-2", liga2Id, season2Id, "lobos-cd", "pumas-sd", "2026-06-08T20:00:00Z", "finished", 3, 0),
      mkMatch("m-l2-3", liga2Id, season2Id, "gavilanes-ad", "zorros-cf", "2026-06-14T18:00:00Z", "finished", 1, 1),
      mkMatch("m-l2-4", liga2Id, season2Id, "pumas-sd", "toros-fc", "2026-06-15T20:00:00Z", "finished", 0, 2),
      mkMatch("m-l2-5", liga2Id, season2Id, "lobos-cd", "gavilanes-ad", "2026-06-21T18:00:00Z", "finished", 1, 2),
      mkMatch("m-l2-6", liga2Id, season2Id, "zorros-cf", "pumas-sd", "2026-06-22T20:00:00Z", "finished", 2, 0),
      mkMatch("m-l2-7", liga2Id, season2Id, "toros-fc", "gavilanes-ad", "2026-06-28T18:00:00Z", "finished", 3, 2),
      mkMatch("m-l2-8", liga2Id, season2Id, "lobos-cd", "zorros-cf", "2026-06-29T20:00:00Z", "finished", 0, 0),
      mkMatch("m-l2-9", liga2Id, season2Id, "gavilanes-ad", "pumas-sd", "2026-07-05T18:00:00Z", "finished", 4, 1),
      mkMatch("m-l2-10", liga2Id, season2Id, "toros-fc", "lobos-cd", "2026-07-06T20:00:00Z", "finished", 1, 1),
    ];

    // +30 partidos extra para llegar a 50. 
    // TRES REGLAS CRÍTICAS para preservar fixtures determinísticos:
    //  1. Todos los extra van en Liga2 (nunca Liga1 → la Liga1 fixture cerrada de 10 partidos queda INTACTA y preserva AC-3).
    //  2. Todos los extra son `status: "scheduled"` → NO cuentan para tabla de posiciones ni aggregates de jugadores (solo finished).
    //  3. Fixture cerrado hardcodeado (C5,2 = 10 ida + 10 vuelta + 10 repetición ida = 30 exactos).
    type TRef = { id: string; name: string; short: string };
    const a2: TRef[] = liga2Teams;
    const idaPairs: [TRef, TRef][] = [
      [a2[0], a2[1]], [a2[0], a2[2]], [a2[0], a2[3]], [a2[0], a2[4]],
      [a2[1], a2[2]], [a2[1], a2[3]], [a2[1], a2[4]],
      [a2[2], a2[3]], [a2[2], a2[4]], [a2[3], a2[4]],
    ];
    const vueltaPairs = idaPairs.map(([a, b]): [TRef, TRef] => [b, a]);
    const liga2Pairs: [TRef, TRef][] = [...idaPairs, ...vueltaPairs, ...idaPairs];
    const extraMatches: MatchInsert[] = liga2Pairs.map(([a, b], i) =>
      mkMatch(
        `m-extra-${i + 1}`,
        liga2Id,
        season2Id,
        a.id,
        b.id,
        `2026-08-${String(1 + i).padStart(2, "0")}T19:00:00Z`,
        "scheduled",
        undefined,
        undefined,
      ),
    );

    const allMatches = [...liga1Matches, ...liga2Matches, ...extraMatches];
    for (const m of allMatches) this.upsert("matches", m);

    // 200 Players (20 por equipo × 10 equipos)
    const positions = ["Portero", "Defensa", "Mediocampista", "Delantero"];
    const firstNames = ["Juan", "Carlos", "Martín", "Luis", "Diego", "Pedro", "Pablo", "Javier", "Marco", "Ale", "Mati", "Nico", "Santi", "Fran", "Lucas", "Tomás", "Agustín", "Joaquín", "Ezequiel", "Thiago"];
    const lastNames = ["Gómez", "Pérez", "Rodríguez", "López", "Martínez", "García", "Sánchez", "Torres", "Ramírez", "Álvarez", "Castro", "Ruíz", "Hernández", "Fernández", "Jiménez", "Vega", "Romero", "Morales", "Silva", "Rojas"];
    const playersById: Map<string, { id: string; team_id: string; full_name: string; position: string; jersey_number: number }> = new Map();
    for (const t of allTeams) {
      for (let i = 0; i < 20; i++) {
        const pos = i < 2 ? positions[0] : i < 8 ? positions[1] : i < 14 ? positions[2] : positions[3];
        const fn = firstNames[(i * 3 + t.id.charCodeAt(0)) % firstNames.length];
        const ln = lastNames[(i * 5 + t.id.charCodeAt(0)) % lastNames.length];
        const pid = `p-${t.id}-${i + 1}`;
        const p = {
          id: pid,
          team_id: t.id,
          full_name: `${fn} ${ln}`,
          position: pos,
          jersey_number: i + 1,
        };
        playersById.set(pid, p);
        this.upsert("players", {
          ...p,
          sport_id: soccerId,
          short_name: `${fn.charAt(0)}. ${ln}`,
          nationality: i % 3 === 0 ? "ARG" : i % 3 === 1 ? "BRA" : "ESP",
          created_at: now,
          updated_at: now,
          sport_specific: { preferred_foot: i % 2 === 0 ? "right" : "left", height_cm: 170 + ((i * 7) % 30) },
        } satisfies PlayerInsert);
      }
    }

    // PlayerMatchStats: por cada partido terminado (status finished o in_progress), 11 jugadores por equipo con minutos y stats
    let statId = 0;
    for (const m of allMatches) {
      if (!m.id) continue;
      if (m.status !== "finished" && m.status !== "in_progress") continue;
      const homePlayers = [...playersById.values()].filter((p) => p.team_id === m.home_team_id).slice(0, 11);
      const awayPlayers = [...playersById.values()].filter((p) => p.team_id === m.away_team_id).slice(0, 11);
      const statsForMatch = [...homePlayers.map((p) => ({ ...p, side: "home" })), ...awayPlayers.map((p) => ({ ...p, side: "away" }))];
      for (const ps of statsForMatch) {
        statId++;
        const mp = ps.jersey_number <= 1 ? 90 : 50 + ((statId * 7) % 45);
        this.upsert("player_match_stats", {
          id: `s-${m.id}-${ps.id}`,
          match_id: m.id,
          player_id: ps.id,
          team_id: ps.team_id,
          minutes_played: mp,
          created_at: now,
          updated_at: now,
          sport_specific: {
            goals: ps.position === "Delantero" ? (statId % 7 === 0 ? 1 : 0) : statId % 23 === 0 ? 1 : 0,
            assists: statId % 11 === 0 ? 1 : 0,
            yellow_cards: statId % 19 === 0 ? 1 : 0,
            red_cards: statId % 83 === 0 ? 1 : 0,
            shots: (statId * 3) % 5,
            passes: 20 + ((statId * 5) % 60),
            pass_accuracy_pct: 65 + ((statId * 7) % 33),
            side: ps.side,
          },
        } satisfies PlayerMatchStatsInsert);
      }
    }
  }
}

type InsertShape<TN extends TableName> = TN extends "sports"
  ? SportInsert
  : TN extends "leagues"
    ? LeagueInsert
    : TN extends "seasons"
      ? SeasonInsert
      : TN extends "teams"
        ? TeamInsert
        : TN extends "players"
          ? PlayerInsert
          : TN extends "matches"
            ? MatchInsert
            : TN extends "match_metadata"
              ? MatchMetadataInsert
              : TN extends "match_statistics"
                ? MatchStatisticInsert
                : TN extends "match_events"
                  ? MatchEventInsert
                  : TN extends "match_lineups"
                    ? MatchLineupInsert
                    : TN extends "probable_lineup_runs"
                      ? ProbableLineupRunInsert
                      : TN extends "probable_lineup_players"
                        ? ProbableLineupPlayerInsert
                        : PlayerMatchStatsInsert;

function mkMatch(
  id: string,
  leagueId: string,
  seasonId: string,
  home: string,
  away: string,
  date: string,
  status: MatchStatus,
  homeScore?: number,
  awayScore?: number,
): MatchInsert {
  const hasScores = status === "finished" || status === "in_progress";
  return {
    id,
    sport_id: "soccer",
    league_id: leagueId,
    season_id: seasonId,
    home_team_id: home,
    away_team_id: away,
    match_date: date,
    status,
    home_score: hasScores ? homeScore : undefined,
    away_score: hasScores ? awayScore : undefined,
    external_id: `ext-${id}`,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    sport_specific: {
      attendance: 12000 + (id.charCodeAt(4) % 5) * 5000,
      referee: `Ref ${id}`,
      round: Number(id.split("-").pop() ?? "1"),
    },
  };
}

export const InMemoryStore = new InMemoryStoreImpl();
export type { Tables };

/**
 * DRY-RUN controlado: primera predicción con runner + datos REALES.
 *
 * SOLO LECTURA. Nunca inserta: el store de este script lanza si alguien
 * intenta insertar, y se usa previewPrediction() (no createPreKickoffPrediction).
 * NO exponer en package.json para evitar ejecuciones accidentales.
 * Ejecutar explícitamente: npx tsx --conditions=react-server src/lib/scripts/dry-run-prediction.ts
 *
 * Nota: tsx plano no carga .env.local (lo hace Next); este script lo parsea
 * manualmente ANTES de importar repos/DB. Solo usa service_role en servidor.
 */

import fs from "node:fs";

function loadEnvFile(path: string): void {
  let raw: string;
  try {
    raw = fs.readFileSync(path, "utf8");
  } catch (e) {
    console.error(`DRY-RUN: no se pudo leer ${path}: ${e instanceof Error ? e.message : e}`);
    return;
  }
  let count = 0;
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const idx = trimmed.indexOf("=");
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
      count++;
    }
  }
  console.error(`DRY-RUN: env cargadas: ${count}`);
}

loadEnvFile("C:/Users/Dark/Desktop/sports-ai-platform-transfer/.env.local");

import { createClient } from "@supabase/supabase-js";
import { getMatchById } from "@/lib/db/repositories/matches-repo";
import { getEnv, getSupabaseProjectUrl } from "@/lib/config/env";
import { previewPrediction } from "@/lib/ai/prediction-service";
import type {
  PredictionMatchRef,
  PredictionStore,
  StoredPrediction,
} from "@/lib/ai/prediction-service";
import { createRealModelRunner } from "@/lib/ai/prediction-runner";

function fail(message: string): never {
  console.error(`DRY-RUN ABORTADO: ${message}`);
  process.exit(1);
}

async function main(): Promise<void> {
  // Con el fix de inicialización (env.ts no cachea fallos + flags lazy), los
  // imports estáticos son seguros: ningún módulo evalúa env a top-level.
  // Solo se mantiene la carga explícita de .env.local porque tsx plano no lo
  // autocarga (Next.js sí lo hace por nosotros en la app).
  const env = getEnv();
  const supabase = createClient(getSupabaseProjectUrl() ?? env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const nowIso = new Date().toISOString();
  console.log(`=== DRY-RUN predicción pre-kickoff (solo lectura) ===`);
  console.log(`now (UTC): ${nowIso}`);

  // 1. Un partido futuro real (el más próximo, scheduled).
  const upcoming = await supabase
    .from("matches")
    .select("id, home_team_id, away_team_id, match_date, status, sport_id, league_id, season_id")
    .eq("status", "scheduled")
    .gt("match_date", nowIso)
    .order("match_date", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (upcoming.error) fail(`leyendo matches: ${upcoming.error.message}`);
  if (!upcoming.data) {
    console.log("NO_FUTURE_MATCH: no hay partidos scheduled futuros; dry-run omitido sin writes.");
    return;
  }
  const row = upcoming.data as Record<string, string>;
  console.log(`match: ${row.id} | kickoff: ${row.match_date} | home=${row.home_team_id} away=${row.away_team_id}`);

  const store: PredictionStore = {
    async getMatchById(matchId: string): Promise<PredictionMatchRef | null> {
      const m = await getMatchById(matchId);
      if (!m) return null;
      return {
        id: m.id,
        sport_id: m.sport_id,
        league_id: m.league_id,
        season_id: m.season_id,
        home_team_id: m.home_team_id,
        away_team_id: m.away_team_id,
        match_date: m.match_date,
        status: m.status,
      };
    },
    async getModelVersionById(id: string) {
      const r = await supabase.from("model_versions").select("id, is_active, parameters").eq("id", id).maybeSingle();
      if (r.error) throw new Error(`leyendo model_versions: ${r.error.message}`);
      return r.data as { id: string; is_active: boolean; parameters: Record<string, unknown> } | null;
    },
    async getMarketById(id: string) {
      const r = await supabase.from("markets").select("id").eq("id", id).maybeSingle();
      if (r.error) throw new Error(`leyendo markets: ${r.error.message}`);
      return r.data as { id: string } | null;
    },
    async findExisting(matchId: string, marketId: string, modelVersionId: string) {
      const r = await supabase
        .from("predictions")
        .select("*")
        .eq("match_id", matchId)
        .eq("market_id", marketId)
        .eq("model_version_id", modelVersionId)
        .maybeSingle();
      if (r.error) throw new Error(`leyendo predictions: ${r.error.message}`);
      return (r.data as unknown as StoredPrediction | null) ?? null;
    },
    async insert(): Promise<StoredPrediction> {
      throw new Error("dry-run: insert deshabilitado por diseño");
    },
    async getLatest() {
      return null;
    },
    async listByMatch() {
      return [];
    },
    async listRecent() {
      return [];
    },
  };

  const preview = await previewPrediction(
    { store, runModel: createRealModelRunner(), nowMs: () => Date.now() },
    { matchId: row.id },
  );

  if (!preview.created) {
    console.log(`YA EXISTE predicción para (match,1x2,v1): id=${preview.prediction.id} created=false. Sin writes.`);
    return;
  }

  const { payload, run } = preview;
  const sum = run.probabilities.home + run.probabilities.draw + run.probabilities.away;
  console.log(`--- resultado del modelo real ---`);
  console.log(`model_version: v1-dixon-coles-2026-01`);
  console.log(`P(home)=${run.probabilities.home.toFixed(4)} P(draw)=${run.probabilities.draw.toFixed(4)} P(away)=${run.probabilities.away.toFixed(4)} suma=${sum.toFixed(6)}`);
  console.log(`xG home=${run.expectedGoals.home.toFixed(3)} away=${run.expectedGoals.away.toFixed(3)}`);
  console.log(`fallback=${run.usedFallback} razon=${run.fallbackReason || "-"}`);
  console.log(`dataQuality home=${run.dataQuality.homeMatchesUsed} away=${run.dataQuality.awayMatchesUsed} league=${run.dataQuality.leagueMatchesUsed}`);
  console.log(`snapshotLevel=${(payload.data_snapshot as Record<string, unknown>).snapshotLevel}`);
  console.log(`predicted_at propuesto ≈ ${new Date().toISOString()} (< kickoff: ${new Date().toISOString() < row.match_date})`);
  console.log(`odds: snapshot=null used=null edge/ev=null score=null (sin odds reales)`);
  console.log(`payload keys: ${Object.keys(payload).sort().join(",")}`);
  console.log(`--- DRY-RUN OK: payload construido, CERO inserts. Listo para revisión humana. ---`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

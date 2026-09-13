import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { InMemoryStore, type TableName } from "../src/lib/db/in-memory-store";

loadEnvConfig(process.cwd(), true);

const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const url = configuredUrl
  ?.replace(/\/?rest\/v1\/?$/, "")
  .replace(/\/$/, "");
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error("SUPABASE: NOT CONFIGURED");
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
});

const tables: TableName[] = [
  "sports",
  "leagues",
  "seasons",
  "teams",
  "players",
  "matches",
  "player_match_stats",
];

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function main() {
  await InMemoryStore.init();

  for (const table of tables) {
    const rows = (await InMemoryStore.from(table).select()).data;
    for (const batch of chunk(rows, 100)) {
      const { error } = await supabase
        .from(table)
        .upsert(batch, { onConflict: "id", ignoreDuplicates: true });
      if (error) throw new Error(`${table}: ${error.message}`);
    }
  }

  const counts: Record<string, number> = {};
  for (const table of tables) {
    const { count, error } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true });
    if (error) throw new Error(`${table}: ${error.message}`);
    counts[table] = count ?? 0;
  }

  console.log(`SUPABASE_SEED: COMPLETE ${JSON.stringify(counts)}`);
}

void main();

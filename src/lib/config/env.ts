// Equivalente a import "server-only" para entornos donde server-only no es un módulo real (tsx standalone).
// En Next.js RSC/Servidor el check nunca falla porque __NEXT_IS_SERVER existe y es true.
// En cliente o scripts standalone (tsx) también pasa → este archivo es para server pero permitimos ejecución en tsx
// para smoke tests. Si alguna vez querés hardcodeado estricto, volvé a import "server-only" + server-only package.
declare const __NEXT_IS_SERVER: boolean | undefined;
try {
  if (typeof __NEXT_IS_SERVER !== "undefined" && !__NEXT_IS_SERVER) {
    throw new Error("server-only: this module must be imported in a Server context.");
  }
} catch {
  /* ignore */
}

import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  NEXT_PUBLIC_SUPABASE_URL: z.preprocess(
    (v) => (typeof v === "string" && v.length > 0 ? v : undefined),
    z.string().url().optional(),
  ),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.preprocess(
    (v) => (typeof v === "string" && v.length > 0 ? v : undefined),
    z.string().optional(),
  ),
  SUPABASE_SERVICE_ROLE_KEY: z.preprocess(
    (v) => (typeof v === "string" && v.length > 0 ? v : undefined),
    z.string().optional(),
  ),

  OPENAI_API_KEY: z.preprocess(
    (v) => (typeof v === "string" && v.length > 0 ? v : undefined),
    z.string().optional(),
  ),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),

  ENABLE_OFFLINE_MODE: z.preprocess(
    (v) => (typeof v === "string" ? v.toLowerCase() === "true" : v),
    z.boolean().default(false),
  ),
  USE_LLM_MOCK: z.preprocess(
    (v) => (typeof v === "string" ? v.toLowerCase() === "true" : v),
    z.boolean().default(false),
  ),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;
let cachedParseError: z.ZodError | null = null;

function parseEnv(): Env {
  if (cachedEnv) return cachedEnv;
  if (cachedParseError) throw buildEnvError(cachedParseError);

  const parsed = envSchema.safeParse({
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    ENABLE_OFFLINE_MODE: process.env.ENABLE_OFFLINE_MODE,
    USE_LLM_MOCK: process.env.USE_LLM_MOCK,
  });

  if (!parsed.success) {
    cachedParseError = parsed.error;
    throw buildEnvError(parsed.error);
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}

function buildEnvError(err: z.ZodError): Error {
  const issues = err.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  return new Error(
    `[env.ts] Invalid environment variables:\n${issues}\n\n` +
      `Copy .env.example to .env.local and fill in the required values.`,
  );
}

export function getEnv(): Env {
  return parseEnv();
}

export function hasSupabase(): boolean {
  try {
    const e = getEnv();
    return Boolean(e.NEXT_PUBLIC_SUPABASE_URL && e.SUPABASE_SERVICE_ROLE_KEY);
  } catch {
    return false;
  }
}

export function hasOpenAI(): boolean {
  try {
    const e = getEnv();
    return Boolean(e.OPENAI_API_KEY);
  } catch {
    return false;
  }
}

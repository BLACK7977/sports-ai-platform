import "server-only";
import { z } from "zod";

// Convierte strings vacíos / solo espacios en `undefined` para tratar la
// ausencia igual que el vacío. Las keys opcionales pueden faltar sin error;
// las obligatorias no.
function cleanOptional(value: unknown): string | undefined {
  if (typeof value !== "string") return value as undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

const optionalString = z.preprocess(cleanOptional, z.string().optional());
const requiredString = z.preprocess(
  cleanOptional,
  z.string().min(1, "requerida"),
);
const optionalUrl = z.preprocess(cleanOptional, z.string().url().optional());
const requiredUrl = z.preprocess(
  cleanOptional,
  z.string().url("debe ser una URL válida"),
);

const booleanFromString = (value: unknown) =>
  typeof value === "string" ? value.toLowerCase() === "true" : value;

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  // OBLIGATORIAS para funcionamiento normal (Supabase cloud).
  NEXT_PUBLIC_SUPABASE_URL: requiredUrl,
  SUPABASE_SERVICE_ROLE_KEY: requiredString,

  // OPCIONALES / por feature. La app sigue funcionando sin ellas:
  // sin OpenAI usa Mock LLM, sin Sportmonks no hay sync del proveedor.
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalString,
  SPORTMONKS_API_TOKEN: optionalString,
  SPORTMONKS_BASE_URL: optionalUrl,
  OPENAI_API_KEY: optionalString,
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),

  ENABLE_OFFLINE_MODE: z
    .preprocess(booleanFromString, z.boolean().default(false)),
  USE_LLM_MOCK: z.preprocess(booleanFromString, z.boolean().default(false)),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;
let cachedParseError: z.ZodError | null = null;

/** Versión tolerante para hasSupabase()/feature-flags: false en vez de throw. */
function selfHealingParse(): { ok: true; value: Env } | { ok: false } {
  try {
    return { ok: true, value: parseEnv() };
  } catch {
    return { ok: false };
  }
}

function parseEnv(): Env {
  if (cachedEnv) return cachedEnv;
  if (cachedParseError) throw buildEnvError(cachedParseError);

  const parsed = envSchema.safeParse({
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SPORTMONKS_API_TOKEN: process.env.SPORTMONKS_API_TOKEN,
    SPORTMONKS_BASE_URL: process.env.SPORTMONKS_BASE_URL,
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

/**
 * Errores sin valores de variables: solo nombre + motivo. Nunca se incluye
 * el contenido de una key en mensajes. Las URLs inválidas se muestran como
 * "debe ser una URL válida" sin la URL original.
 */
function buildEnvError(err: z.ZodError): Error {
  const issues = err.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  return new Error(
    `[env.ts] configuración de entorno inválida:\n${issues}\n\n` +
      `OBLIGATORIAS: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.\n` +
      `Opcionales (por feature): SPORTMONKS_API_TOKEN, SPORTMONKS_BASE_URL, OPENAI_API_KEY, OPENAI_MODEL, NEXT_PUBLIC_SUPABASE_ANON_KEY.\n` +
      `Copiá .env.example a .env.local y completá los valores requeridos.`,
  );
}

export function getEnv(): Env {
  return parseEnv();
}

export function hasSupabase(): boolean {
  const result = selfHealingParse();
  if (!result.ok) return false;
  const e = result.value;
  return Boolean(e.NEXT_PUBLIC_SUPABASE_URL && e.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Supabase JS espera la URL raíz del proyecto. Aceptamos también la URL
 * histórica del endpoint REST para no obligar a cambiar configuraciones ya
 * existentes (https://<project>.supabase.co/rest/v1).
 */
export function getSupabaseProjectUrl(): string | undefined {
  const url = getEnv().NEXT_PUBLIC_SUPABASE_URL;
  return url?.replace(/\/?rest\/v1\/?$/, "").replace(/\/$/, "");
}

export function hasOpenAI(): boolean {
  const result = selfHealingParse();
  return result.ok && Boolean(result.value.OPENAI_API_KEY);
}

export function hasSportmonks(): boolean {
  const result = selfHealingParse();
  return result.ok && Boolean(result.value.SPORTMONKS_API_TOKEN);
}
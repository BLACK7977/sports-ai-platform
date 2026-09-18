// Rate limiter AI en memoria, por proceso. No contiene secretos y es
// importable desde scripts de test sin condiciones especiales.
//
// DOS VENTANAS por acción (fija, in-memory):
//  - minute: límite por minuto/IP (protege picos inmediatos de generación).
//  - hour:   límite por hora/IP (evita que esperar 1 minuto permita repetir
//            indefinidamente; hace el abuso sostenido costoso).
//
// LIMITACIONES EXPLÍCITAS (decisión deliberada de fase 3):
//  - Estado en memoria del proceso: se pierde al reiniciar.
//  - No compartido entre instancias / funciones serverless: un atacante
//    distribuido puede exceder límites por instancia.
//  - La identidad del cliente es best-effort y deriva de HEADERS: en
//    dev/localhost el propio cliente puede falsificar x-forwarded-for. En
//    Vercel la plataforma escribe el valor real, pero fuera de ese entorno
//    esto NO debe tratarse como un identificador difícil de eludir.
//  No presentar esto como protección distribuida fuerte ni como identidad.

export type AiRateAction =
  | "match-analysis"
  | "match-prediction"
  | "probable-lineup"
  | "player-report"
  | "explanation";

export type AiRateWindow = { windowMs: number; max: number };

/** Dos ventanas por acción: `minute` (pico) y `hour` (cuota aproximada). */
export type AiRatePolicy = {
  minute: AiRateWindow;
  hour: AiRateWindow;
};

export const AI_RATE_LIMITS: Record<AiRateAction, AiRatePolicy> = {
  "match-analysis": {
    minute: { windowMs: 60_000, max: 3 },
    hour: { windowMs: 3_600_000, max: 20 },
  },
  "match-prediction": {
    minute: { windowMs: 60_000, max: 3 },
    hour: { windowMs: 3_600_000, max: 20 },
  },
  "probable-lineup": {
    minute: { windowMs: 60_000, max: 3 },
    hour: { windowMs: 3_600_000, max: 20 },
  },
  "player-report": {
    minute: { windowMs: 60_000, max: 2 },
    hour: { windowMs: 3_600_000, max: 10 },
  },
  "explanation": {
    minute: { windowMs: 60_000, max: 3 },
    hour: { windowMs: 3_600_000, max: 20 },
  },
};

type WindowEntry = { windowStart: number; count: number };
type ActionState = {
  minute: WindowEntry | undefined;
  hour: WindowEntry | undefined;
};

const state = new Map<string, ActionState>();
const MAX_KEYS = 5000;

export class AiRateLimitExceededError extends Error {
  readonly retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super("AI rate limit exceeded.");
    this.name = "AiRateLimitExceededError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function nextWindow(
  current: WindowEntry | undefined,
  window: AiRateWindow,
  now: number,
): { ok: true; entry: WindowEntry } | { ok: false; retryAfterSeconds: number } {
  if (!current || now - current.windowStart >= window.windowMs) {
    return { ok: true, entry: { windowStart: now, count: 1 } };
  }
  if (current.count < window.max) {
    return {
      ok: true,
      entry: { windowStart: current.windowStart, count: current.count + 1 },
    };
  }
  const retryMs = current.windowStart + window.windowMs - now;
  return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil(retryMs / 1000)) };
}

/**
 * Consume 1 token en cada ventana (minuto y hora) si ambos lo permiten.
 * Peek-then-commit: si ALGUNA ventana está agotada, no se consume ninguna.
 */
export function checkAiRateLimit(
  action: AiRateAction,
  clientKey: string,
  now: number = Date.now(),
): void {
  const policy = AI_RATE_LIMITS[action];
  const key = `${action}:${clientKey}`;
  let st = state.get(key);
  if (!st) {
    st = { minute: undefined, hour: undefined };
    state.set(key, st);
    if (state.size > MAX_KEYS) {
      const oldest = state.keys().next().value;
      if (oldest !== undefined) state.delete(oldest);
    }
  }

  const minute = nextWindow(st.minute, policy.minute, now);
  if (!minute.ok) throw new AiRateLimitExceededError(minute.retryAfterSeconds);
  const hour = nextWindow(st.hour, policy.hour, now);
  if (!hour.ok) throw new AiRateLimitExceededError(hour.retryAfterSeconds);

  st.minute = minute.entry;
  st.hour = hour.entry;
}

// ---------------------------------------------------------------------------
// Identidad del cliente: BEST-EFFORT.
//
// Estrategia (más segura y simple compatible con Next.js/Vercel):
//  - Orden: x-vercel-forwarded-for → x-forwarded-for → x-real-ip.
//    En Vercel: x-forwarded-for es SOBRESCRITO por la plataforma con la IP
//    pública real del cliente (imposible de falsificar desde el browser), y
//    x-vercel-forwarded-for lo preserva incluso con un proxy encima. Por eso
//    se prefiere x-vercel-forwarded-for primero.
//  - De cada header se toma el valor MÁS A LA DERECHA (el que aportó el proxy
//    más cercano al origen). El valor de la izquierda proviene del cliente y
//    es triviablemente falsificable; el de la derecha NO se usa como clave.
//  - localhost/dev: si no hay header → "local". En dev un cliente SÍ puede
//    falsificar el header (no hay proxy que lo sobrescriba): limitación
//    documentada, no es autenticación.
//  - No se guardan IPs de forma permanente y no se loguean IPs completas.
// ---------------------------------------------------------------------------
const IP_HEADERS = [
  "x-vercel-forwarded-for",
  "x-forwarded-for",
  "x-real-ip",
] as const;
const MAX_IP_LEN = 64;

export function getClientIp(headers: Headers): string {
  for (const key of IP_HEADERS) {
    const raw = headers.get(key);
    if (!raw) continue;
    const parts = raw
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    const rightmost = parts[parts.length - 1];
    if (rightmost) return rightmost.slice(0, MAX_IP_LEN);
  }
  return "local";
}

/** Limpia el estado (útil para tests determinísticos). */
export function resetRateLimiter(): void {
  state.clear();
}
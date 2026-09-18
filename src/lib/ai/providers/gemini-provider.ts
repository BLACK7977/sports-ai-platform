import "server-only";

/**
 * Thin SERVER-ONLY Gemini provider for persisted prediction explanations.
 *
 * - Structured JSON responses (responseMimeType=application/json).
 * - AbortController timeout (~20s default).
 * - Maximum 2 attempts with bounded exponential backoff.
 * - NEVER retries 400/401/403/429.
 * - Sanitized errors: no API key, no prompt, no raw response ever logged.
 *
 * The key travels in the `x-goog-api-key` header (server-to-server); it is
 * never part of a URL visible to proxies, never serialized into logs and never
 * stored.
 */

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export type GeminiFailureKind =
  | "missing-key"
  | "timeout"
  | "http"
  | "network"
  | "malformed";

export type GeminiFailure = {
  kind: GeminiFailureKind;
  retryable: boolean;
  status?: number;
};

export type GeminiProviderResult =
  | { ok: true; text: string }
  | { ok: false; failure: GeminiFailure };

export interface GeminiGenerationRequest {
  prompt: string;
  apiKey?: string;
  /** Server-only configuration. Defaults to env GEMINI_MODEL. */
  model?: string;
  timeoutMs?: number;
  maxAttempts?: number;
  baseDelayMs?: number;
}

export interface GeminiProviderDeps {
  fetchImpl?: typeof fetch;
  endpoint?: string;
}

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_ATTEMPTS = 2;
const DEFAULT_BASE_DELAY_MS = 500;
const NEVER_RETRY_STATUS = new Set([400, 401, 403, 429]);

const SANITIZED_MESSAGES: Record<GeminiFailureKind, string> = {
  "missing-key": "GEMINI_API_KEY no configurada",
  timeout: "El proveedor de explicaciones no respondió dentro del tiempo límite",
  http: "El proveedor de explicaciones respondió con un estado de error",
  network: "No se pudo contactar al proveedor de explicaciones",
  malformed: "El proveedor de explicaciones devolvió una respuesta inválida",
};

function sanitizedMessage(kind: GeminiFailureKind, status?: number): string {
  return status !== undefined
    ? `${SANITIZED_MESSAGES[kind]} (status=${status})`
    : SANITIZED_MESSAGES[kind];
}

interface GeminiApiEnvelope {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

export function extractGeminiText(body: unknown): string | null {
  const envelope = body as GeminiApiEnvelope | null;
  const text = envelope?.candidates?.[0]?.content?.parts?.[0]?.text;
  return typeof text === "string" && text.trim().length > 0 ? text.trim() : null;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class GeminiExplanationProvider {
  private readonly fetchImpl: typeof fetch;
  private readonly endpoint: string;

  constructor(deps: GeminiProviderDeps = {}) {
    this.fetchImpl = deps.fetchImpl ?? ((...args) => fetch(...args));
    this.endpoint = deps.endpoint ?? GEMINI_ENDPOINT;
  }

  async generate(
    request: GeminiGenerationRequest,
  ): Promise<GeminiProviderResult> {
    const apiKey = request.apiKey;
    if (!apiKey) {
      return {
        ok: false,
        failure: { kind: "missing-key", retryable: false },
      };
    }
    const model = request.model;
    const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxAttempts = request.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    const baseDelayMs = request.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;

    let attempt = 0;
    while (attempt < maxAttempts) {
      attempt += 1;
      const result = await this.tryGenerateOnce({
        apiKey,
        model,
        prompt: request.prompt,
        timeoutMs,
      });
      if (result.ok) return result;
      if (!result.failure.retryable || attempt >= maxAttempts) return result;
      const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), 16_000);
      await wait(delay);
    }
    return {
      ok: false,
      failure: { kind: "network", retryable: false },
    };
  }

  private async tryGenerateOnce(request: {
    apiKey: string;
    model?: string;
    prompt: string;
    timeoutMs: number;
  }): Promise<GeminiProviderResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.timeoutMs);
    try {
      const response = await this.fetchImpl(
        `${this.endpoint}/${encodeURIComponent(request.model ?? "")}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": request.apiKey,
          },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: request.prompt }] }],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.3,
              maxOutputTokens: 1024,
            },
          }),
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        const retryable = !NEVER_RETRY_STATUS.has(response.status);
        return {
          ok: false,
          failure: {
            kind: "http",
            status: response.status,
            retryable,
          },
        };
      }
      const text = await response.text();
      let body: unknown;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        return {
          ok: false,
          failure: { kind: "malformed", retryable: false },
        };
      }
      const content = extractGeminiText(body);
      if (!content) {
        return {
          ok: false,
          failure: { kind: "malformed", retryable: false },
        };
      }
      return { ok: true, text: content };
    } catch (err) {
      if (isAbortError(err)) {
        return {
          ok: false,
          failure: { kind: "timeout", retryable: true },
        };
      }
      return {
        ok: false,
        failure: { kind: "network", retryable: true },
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

function isAbortError(err: unknown): boolean {
  return (
    err instanceof DOMException && err.name === "AbortError"
  ) || (
    err instanceof Error && err.name === "AbortError"
  );
}

/** Production factory: safe server configuration from env. */
export function createGeminiExplanationProvider(
  deps: GeminiProviderDeps = {},
): GeminiExplanationProvider {
  return new GeminiExplanationProvider(deps);
}

export function geminiFailureMessage(failure: GeminiFailure): string {
  return sanitizedMessage(failure.kind, failure.status);
}
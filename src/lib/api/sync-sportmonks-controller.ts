import { timingSafeEqual } from "node:crypto";

/**
 * Comparación en tiempo constante de dos strings (no revela la longitud real
 * del secreto en tiempos de fallo). El secreto nunca se incluye en la salida.
 */
export function secretEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Autoriza una request de Vercel Cron: header `Authorization: Bearer <secret>`.
 * Fallo cerrado: sin secreto configurado, o header ausente/malformado → deny.
 */
export function authorizeCronRequest(request: Request, secret: string | undefined): boolean {
  if (!secret || secret.length === 0) return false;
  const header = request.headers.get("authorization");
  if (!header) return false;
  if (header.slice(0, 7).toLowerCase() !== "bearer ") return false;
  const token = header.slice(7).trim();
  if (token.length === 0) return false;
  return secretEquals(token, secret);
}

export interface CompactSyncResult {
  ok: boolean;
  fetched: number;
  insertedMatches: number;
  updatedMatches: number;
  insertedPlayers: number;
  updatedPlayers: number;
  errors: number;
}

export interface SyncSportmonksControllerDeps {
  getCronSecret: () => string | undefined;
  runSync: () => Promise<CompactSyncResult>;
}

export interface SyncSportmonksController {
  GET: (request: Request) => Promise<Response>;
}

/**
 * Controller HTTP para /api/admin/sync-sportmonks. La autorización ocurre
 * SIEMPRE antes de cualquier trabajo de provider/DB (deps.runSync). Guard de
 * solapamiento simple por proceso: mientras una corrida está activa, una
 * segunda request recibe 409. No es un sistema de jobs: suficiente para cron
 * diario en beta; con múltiples instancias haría falta un lock externo.
 */
export function createSyncSportmonksController(deps: SyncSportmonksControllerDeps): SyncSportmonksController {
  let inFlight = false;
  return {
    GET: async (request: Request): Promise<Response> => {
      if (!authorizeCronRequest(request, deps.getCronSecret())) {
        return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
      }
      if (inFlight) {
        return Response.json({ ok: false, error: "sync_in_progress" }, { status: 409 });
      }
      inFlight = true;
      try {
        const result = await deps.runSync();
        return Response.json(result);
      } catch {
        return Response.json({ ok: false, error: "sync_failed" }, { status: 500 });
      } finally {
        inFlight = false;
      }
    },
  };
}
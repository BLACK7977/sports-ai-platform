import type { SportModule, SportId } from "@/types/core/sport";
import soccerModule from "@/sports/soccer";

// ============================================================
// Sports Registry: auto-descubrimiento dinámico via import.meta.glob
// con FALLBACK MANUAL si el glob falla en Next.js 16 (breaking changes)
// ============================================================
// Regla AC-6 / NFR-1: agregar un deporte NUEVO solo requiere crear
// `src/sports/<id>/index.ts` con export default del SportModule.
// NO hay que editar este archivo (salvo si Next.js rompe el glob).
// ============================================================

function normalizeGlobModule(mod: unknown): SportModule | null {
  if (!mod || typeof mod !== "object") return null;
  const m = mod as { default?: unknown };
  const def = m.default ?? mod;
  if (!def || typeof def !== "object") return null;
  const cand = def as Partial<SportModule>;
  if (typeof cand.id === "string" && typeof cand.displayName === "string") {
    return cand as SportModule;
  }
  return null;
}

function tryGlob(): Record<SportId, SportModule> {
  try {
    const meta = import.meta as unknown as {
      glob?: (
        pattern: string,
        opts: { eager: boolean },
      ) => Record<string, unknown>;
    };
    if (typeof meta.glob !== "function") return {};
    const glob = meta.glob("../sports/*/index.ts", { eager: true });
    const result: Record<SportId, SportModule> = {};
    for (const mod of Object.values(glob)) {
      const sm = normalizeGlobModule(mod);
      if (sm) result[sm.id] = sm;
    }
    return result;
  } catch {
    return {};
  }
}

const fromGlob = tryGlob();

// FALLBACK MANUAL
// TODO: Reemplazar MANUAL por import.meta.glob cuando Next.js 16 estabilice
// el glob en Server Components (Turbopack edge cases). El MVP funciona con ambos.
const MANUAL_REGISTRY: Record<SportId, SportModule> = {
  soccer: soccerModule,
};

function buildRegistry(): Record<SportId, SportModule> {
  const merged: Record<SportId, SportModule> = { ...MANUAL_REGISTRY };
  for (const [id, sm] of Object.entries(fromGlob)) {
    if (!id) continue;
    merged[id] = sm;
  }
  return merged;
}

const REGISTRY: Record<SportId, SportModule> = buildRegistry();

export const SPORTS_REGISTRY_USED_FALLBACK =
  Object.keys(fromGlob).length === 0;

export function getActiveSports(): SportModule[] {
  return Object.values(REGISTRY).sort((a, b) =>
    a.displayName.localeCompare(b.displayName),
  );
}

export function getSport(id: SportId): SportModule | null {
  return REGISTRY[id] ?? null;
}

export function getSportOrThrow(id: SportId): SportModule {
  const s = getSport(id);
  if (!s) throw new Error(`Sport '${id}' not registered in sports-registry`);
  return s;
}

export function hasSport(id: SportId): boolean {
  return id in REGISTRY;
}

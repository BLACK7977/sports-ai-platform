import { z } from "zod";

// ------------------------------------------------------------------
// Schemas para inputs de URLs y Server Actions (route params,
// searchParams, FormData). El objetivo es acotar tamaño y caracteres
// antes de tocar DB/repositorios; nunca se exportan valores.
// ------------------------------------------------------------------

export const sportIdSchema = z
  .string()
  .min(1, "sport inválido")
  .max(32, "sport inválido")
  .regex(/^[a-z][a-z0-9-]*$/, "sport inválido");

/** IDs de entidades (partido/jugador/equipo/liga/temporada) en URLs. */
export const entityIdSchema = z
  .string()
  .min(1, "id inválido")
  .max(120, "id inválido")
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/, "id inválido");

export const matchViewSchema = z.enum([
  "week",
  "today",
  "upcoming",
  "finished",
  "all",
]);

export const weekOffsetSchema = z
  .number()
  .int("semana inválida")
  .min(-52, "semana fuera de rango")
  .max(52, "semana fuera de rango");

export const chartSchema = z.enum(["goals", "assists", "ga"]);

export const competitionSelectionSchema = z.object({
  sportId: sportIdSchema,
  leagueId: entityIdSchema,
  seasonId: entityIdSchema,
});

export function parseSportId(value: string): string | null {
  const result = sportIdSchema.safeParse(value);
  return result.success ? result.data : null;
}

export function parseEntityId(value: string): string | null {
  const result = entityIdSchema.safeParse(value);
  return result.success ? result.data : null;
}
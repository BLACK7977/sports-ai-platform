"use server";

import { cookies } from "next/headers";
import {
  competitionSelectionCookie,
  isValidCompetitionSelection,
} from "@/lib/db/repositories/active-competition-repo";
import { competitionSelectionSchema } from "@/lib/config/validation";

export async function selectCompetitionAction(formData: FormData): Promise<void> {
  const parsed = competitionSelectionSchema.safeParse({
    sportId: formData.get("sportId"),
    leagueId: formData.get("leagueId"),
    seasonId: formData.get("seasonId"),
  });
  if (!parsed.success) {
    throw new Error("La competición seleccionada no es válida.");
  }
  const { sportId, leagueId, seasonId } = parsed.data;
  if (!(await isValidCompetitionSelection(sportId, leagueId, seasonId))) {
    throw new Error("La competición seleccionada no está disponible.");
  }

  (await cookies()).set(
    competitionSelectionCookie(sportId),
    `${leagueId}:${seasonId}`,
    { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 30 },
  );
}
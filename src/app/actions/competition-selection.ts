"use server";

import { cookies } from "next/headers";
import {
  competitionSelectionCookie,
  isValidCompetitionSelection,
} from "@/lib/db/repositories/active-competition-repo";

export async function selectCompetitionAction(formData: FormData): Promise<void> {
  const sportId = String(formData.get("sportId") ?? "");
  const leagueId = String(formData.get("leagueId") ?? "");
  const seasonId = String(formData.get("seasonId") ?? "");
  if (!sportId || !leagueId || !seasonId) {
    throw new Error("La competición seleccionada no es válida.");
  }
  if (!(await isValidCompetitionSelection(sportId, leagueId, seasonId))) {
    throw new Error("La competición seleccionada no está disponible.");
  }

  (await cookies()).set(
    competitionSelectionCookie(sportId),
    `${leagueId}:${seasonId}`,
    { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 30 },
  );
}

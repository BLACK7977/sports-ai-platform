"use server";

import "server-only";
import { runSetProfileTheme } from "@/lib/services/theme-service";

/**
 * Persiste el tema del perfil. La autorización y el entitlement (FREE = solo
 * cyan, PREMIUM = cualquiera) viven en el core testable, que corre ANTES de
 * cualquier escritura. El valor del cliente nunca se confía como-is.
 */
export async function actionSetProfileTheme(theme: string) {
  return runSetProfileTheme(theme);
}
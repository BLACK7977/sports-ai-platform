import { z } from "zod";

/**
 * Validación y builders puros de credenciales (sin Next, sin Supabase).
 * NUNCA incluyen role: aunque el FormData traiga role=premium, se ignora
 * (el trigger de DB fuerza role='free'). Testeable sin red.
 */

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email("Ingresá un email válido."),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres.").max(128),
});

export function buildLoginPayload(input: { email: string; password: string }): {
  email: string;
  password: string;
} {
  const parsed = credentialsSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Datos inválidos.");
  }
  return { email: parsed.data.email, password: parsed.data.password };
}

export function buildSignUpPayload(input: { email: string; password: string; confirm: string }): {
  email: string;
  password: string;
} {
  if (input.password !== input.confirm) throw new Error("Las contraseñas no coinciden.");
  // Intencionalmente sin role: ver arriba.
  return buildLoginPayload({ email: input.email, password: input.password });
}

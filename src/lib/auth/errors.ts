/**
 * Mapeo de errores de Supabase Auth a mensajes seguros en español.
 * NUNCA incluir: mensaje crudo del proveedor, SQL, tokens, emails ajenos,
 * detalles de configuración ni stack traces. Lo interno va al log server-side.
 */

const SAFE_MESSAGES: Record<string, string> = {
  invalid_credentials: "Email o contraseña incorrectos.",
  invalid_login_credentials: "Email o contraseña incorrectos.",
  email_not_confirmed: "Confirmá tu email antes de ingresar. Revisá tu bandeja.",
  user_already_exists: "Ese email ya está registrado. Probá ingresar.",
  user_already_registered: "Ese email ya está registrado. Probá ingresar.",
  weak_password: "La contraseña es muy débil. Usá al menos 6 caracteres.",
  password_too_short: "La contraseña es muy débil. Usá al menos 6 caracteres.",
  signup_disabled: "El registro está deshabilitado por el momento.",
  email_rate_limit_exceeded: "Demasiados intentos. Esperá unos minutos.",
  over_request_rate_limit: "Demasiados intentos. Esperá unos minutos.",
  invalid_email: "El email no es válido.",
  UNAUTHORIZED_INVALID_API_KEY: "Clave API inválida. Avisá al administrador.",
  http_401: "Clave API inválida. Avisá al administrador.",
  database_error: "Error de base de datos. Avisá al administrador.",
};

export function extractAuthErrorCode(err: unknown): string | null {
  if (typeof err !== "object" || err === null) return null;
  const record = err as Record<string, unknown>;
  for (const key of ["code", "error_code", "errorCode"]) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0 && value.length <= 120) return value;
  }
  const status = (record.status as number | undefined) ?? (record.__supabaseStatus as number | undefined);
  if (typeof status === "number" && Number.isFinite(status)) return `http_${status}`;
  return null;
}

/** Mensaje seguro para UI + log server-side sin secretos. */
export function toSafeAuthErrorMessage(err: unknown): string {
  const code = extractAuthErrorCode(err);
  if (code && SAFE_MESSAGES[code]) return SAFE_MESSAGES[code];
  // Log interno: solo código/estado, jamás el objeto completo.
  console.error(`[auth] error no mapeado (code=${code ?? "unknown"}).`);
  return "Ocurrió un error. Intentá de nuevo más tarde.";
}

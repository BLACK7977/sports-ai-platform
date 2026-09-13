/**
 * Validación de redirects post-login. Solo rutas internas (mismo origen).
 * Rechaza: URLs absolutas, protocol-relative, javascript:, data:, backslashes,
 * secuencias de escape y cualquier cosa que no empiece con un único "/".
 */
export function isSafeNextPath(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.length === 0 || value.length > 2048) return false;
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//")) return false;
  if (value.includes("\\")) return false;
  const lower = value.toLowerCase();
  if (lower.startsWith("javascript:") || lower.startsWith("data:") || lower.includes(":")) return false;
  try {
    if (decodeURIComponent(value) !== value) {
      // Rechaza %2F, %5C y otros escapes que ocultan el destino real.
      if (/%2f|%5c|%3a/i.test(value)) return false;
    }
  } catch {
    return false;
  }
  if (/[\s<>]/.test(value)) return false;
  return true;
}

export function safeNextPath(value: unknown, fallback = "/"): string {
  return isSafeNextPath(value) ? value : fallback;
}

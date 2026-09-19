import "server-only";

/**
 * Mensajes sanitizados y compartidos para resultados de acciones.
 * Un módulo ligero (sin deps de AI/proveedores) para que servicios
 * no-generativos (temas, etc.) puedan reutilizar las mismas constantes
 * sin arrastrar el árbol de generación.
 */

export const GENERIC_ERROR =
  "No se pudo generar el análisis. Intentá de nuevo en unos segundos.";

export const RATE_LIMIT_ERROR =
  "Demasiadas solicitudes. Esperá unos segundos antes de intentar de nuevo.";

export const AUTH_REQUIRED_ERROR = "Iniciá sesión para continuar.";

export const PRO_REQUIRED_ERROR =
  "Esta función está disponible con el plan Pro de NYVORX.";
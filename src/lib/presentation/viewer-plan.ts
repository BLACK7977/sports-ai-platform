import "server-only";

/**
 * ViewerPlan — the ONLY signal UI should receive for free/pro rendering.
 * Resolved server-side from session + profiles.role. Clients never pass their
 * own plan; the server decides and threads it down as a prop.
 */
export type ViewerPlan = "free" | "pro";
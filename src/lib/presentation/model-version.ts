/**
 * Public naming for model versions.
 *
 * Internal technical model identifiers (e.g. `v1-dixon-coles-2026-01`) must
 * never appear in normal public UI. They stay internal: DB, logs, audits and
 * data_snapshots keep them; rendering layers use these public labels.
 */

export const PUBLIC_MODEL_VERSION_LINE = "Modelo de probabilidad deportiva · v1.0";
export const MODEL_EXPERIMENTAL_TAG = "Modelo experimental";

const KNOWN_MODEL_VERSIONS: Record<string, string> = {
  "v1-dixon-coles-2026-01": PUBLIC_MODEL_VERSION_LINE,
};

export function publicModelVersionName(internal: string | null | undefined): string {
  return internal && KNOWN_MODEL_VERSIONS[internal]
    ? KNOWN_MODEL_VERSIONS[internal]
    : PUBLIC_MODEL_VERSION_LINE;
}
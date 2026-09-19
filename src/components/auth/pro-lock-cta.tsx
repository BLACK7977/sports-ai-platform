import Link from "next/link";

/**
 * Estado "bloqueado" de una función PRO para usuarios FREE.
 * El server gate sigue siendo la autoridad: esto es solo la experiencia
 * visual/link. El CTA apunta a la página PRO existente.
 */
export function ProLockCta({
  sport,
  title = "Función PRO",
  description,
  compact = false,
}: {
  sport: string;
  title?: string;
  description: string;
  compact?: boolean;
}) {
  return (
    <div
      className="match-explanation-locked"
      style={{ justifyItems: "center", textAlign: "center" }}
    >
      <svg
        viewBox="0 0 24 24"
        className={compact ? "h-5 w-5" : "h-6 w-6"}
        fill="currentColor"
        aria-hidden
      >
        <path d="M7 10V8a5 5 0 0 1 10 0v2h1.5c.83 0 1.5.67 1.5 1.5v8c0 .83-.67 1.5-1.5 1.5h-13A1.5 1.5 0 0 1 4 19.5v-8C4 10.67 4.67 10 5.5 10H7Zm2 0h6V8a3 3 0 1 0-6 0v2Z" />
      </svg>
      <p className="min-w-0 text-sm font-semibold text-slate-100">{title}</p>
      <p className="max-w-75 text-xs leading-relaxed text-slate-400">{description}</p>
      <Link
        href={`/${sport}/premium-test`}
        className="sa-action inline-flex min-h-10 items-center justify-center rounded-sm bg-cyan-400 px-4 text-sm font-medium text-slate-950 shadow-(--sa-cyan-glow) transition hover:bg-cyan-300"
      >
        Desbloquear con NYVORX PRO
      </Link>
    </div>
  );
}
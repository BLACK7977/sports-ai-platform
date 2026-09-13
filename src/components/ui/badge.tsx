import type { HTMLAttributes, ReactNode } from "react";

export type BadgeTone =
  | "neutral"
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "info";

const toneMap: Record<BadgeTone, string> = {
  neutral:
    "bg-slate-400/10 text-slate-300 ring-slate-300/20",
  primary:
    "bg-cyan-400/10 text-cyan-200 ring-cyan-300/30",
  success:
    "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-400/30",
  warning:
    "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-400/30",
  danger:
    "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-200 dark:ring-rose-400/30",
  info: "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-200 dark:ring-sky-400/30",
};

export function Badge({
  tone = "neutral",
  className = "",
  children,
  ...rest
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
  children: ReactNode;
}) {
  return (
    <span
      {...rest}
      className={[
        "sa-badge inline-flex items-center rounded-sm px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        toneMap[tone],
        className,
      ].join(" ")}
    >
      {children}
    </span>
  );
}

export function formatBadgeForStatus(
  status: string,
): { tone: BadgeTone; label: string } {
  switch (status) {
    case "finished":
      return { tone: "success", label: "Finalizado" };
    case "in_progress":
      return { tone: "warning", label: "En curso" };
    case "scheduled":
      return { tone: "info", label: "Programado" };
    case "postponed":
      return { tone: "warning", label: "Pospuesto" };
    case "cancelled":
      return { tone: "danger", label: "Cancelado" };
    default:
      return { tone: "neutral", label: status };
  }
}

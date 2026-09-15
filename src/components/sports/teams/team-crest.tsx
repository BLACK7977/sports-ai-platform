"use client";

import { useState } from "react";

type Props = {
  name: string;
  shortName?: string | null;
  logoUrl?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const sizes = {
  sm: "h-7 w-7 text-[10px]",
  md: "h-9 w-9 text-xs",
  lg: "h-14 w-14 text-base",
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "—";
}

/** Uses the persisted crest URL only; a failed or missing image becomes a neutral monogram. */
export function TeamCrest({ name, shortName, logoUrl, size = "sm", className = "" }: Props) {
  const [failed, setFailed] = useState(false);
  const label = shortName || name;
  const frame = `inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-cyan-200/20 bg-slate-900/90 font-semibold text-cyan-100 ${sizes[size]} ${className}`;

  if (!logoUrl || failed) {
    return <span className={frame} aria-label={`Escudo no disponible de ${name}`}>{initials(label)}</span>;
  }

  return <span className={frame}><img src={logoUrl} alt={`Escudo de ${name}`} className="h-full w-full object-contain p-0.5" onError={() => setFailed(true)} /></span>;
}

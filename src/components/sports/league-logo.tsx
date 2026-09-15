"use client";

import { useState } from "react";

type Props = {
  name: string;
  logoUrl?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const sizes = {
  sm: "h-8 w-8 text-[10px]",
  md: "h-12 w-12 text-xs",
  lg: "h-20 w-20 text-base",
};

function fallbackInitial(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "⚽";
}

export function LeagueLogo({ name, logoUrl, size = "md", className = "" }: Props) {
  const [failed, setFailed] = useState(false);
  const frame = `inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-cyan-200/15 bg-slate-900/80 font-bold text-cyan-200/70 ${sizes[size]} ${className}`;

  if (!logoUrl || failed) {
    return <span className={frame} aria-label={`Logo no disponible de ${name}`}>{fallbackInitial(name)}</span>;
  }

  return (
    <span className={frame}>
      <img
        src={logoUrl}
        alt={`Logo de ${name}`}
        className="h-full w-full object-contain p-0.5"
        onError={() => setFailed(true)}
      />
    </span>
  );
}

import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";

type Tone = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg";

const toneMap: Record<Tone, string> = {
  primary:
    "bg-cyan-400 text-slate-950 hover:bg-cyan-300 focus-visible:ring-cyan-400/40 shadow-[0_0_18px_rgba(78,234,255,0.2)] disabled:bg-cyan-400/60",
  secondary:
    "bg-sky-500/15 text-sky-100 hover:bg-sky-400/20 border border-sky-300/25 focus-visible:ring-sky-400/40",
  ghost:
    "bg-transparent text-slate-300 hover:bg-cyan-400/8 hover:text-cyan-100 focus-visible:ring-cyan-400/40",
  danger:
    "bg-rose-600 text-white hover:bg-rose-500 focus-visible:ring-rose-500/40 disabled:bg-rose-600/60",
  outline:
    "bg-transparent border border-cyan-200/25 text-slate-200 hover:border-cyan-300/55 hover:bg-cyan-400/8 hover:text-cyan-100 focus-visible:ring-cyan-400/40",
};

const sizeMap: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5 rounded-sm",
  md: "h-10 px-4 text-sm gap-2 rounded-sm",
  lg: "h-12 px-6 text-base gap-2 rounded-sm",
};

type BaseProps = {
  tone?: Tone;
  size?: Size;
  className?: string;
  children: ReactNode;
  leftSlot?: ReactNode;
  rightSlot?: ReactNode;
};

export function Button({
  tone = "primary",
  size = "md",
  className = "",
  leftSlot,
  rightSlot,
  children,
  ...rest
}: BaseProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={[
        "sa-action inline-flex items-center justify-center font-medium transition focus:outline-none focus-visible:ring-4 disabled:opacity-70 disabled:cursor-not-allowed",
        toneMap[tone],
        sizeMap[size],
        className,
      ].join(" ")}
    >
      {leftSlot}
      {children}
      {rightSlot}
    </button>
  );
}

export function LinkButton({
  tone = "outline",
  size = "md",
  className = "",
  leftSlot,
  rightSlot,
  children,
  href,
  ...rest
}: BaseProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
    href: string;
  }) {
  return (
    <Link
      href={href}
      {...rest}
      className={[
        "sa-action inline-flex items-center justify-center font-medium transition focus:outline-none focus-visible:ring-4",
        toneMap[tone],
        sizeMap[size],
        className,
      ].join(" ")}
    >
      {leftSlot}
      {children}
      {rightSlot}
    </Link>
  );
}

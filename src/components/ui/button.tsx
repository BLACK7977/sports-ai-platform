import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";

type Tone = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg";

const toneMap: Record<Tone, string> = {
  primary:
    "bg-indigo-600 text-white hover:bg-indigo-500 focus-visible:ring-indigo-500/40 shadow-sm disabled:bg-indigo-600/60",
  secondary:
    "bg-slate-900 text-white hover:bg-slate-800 focus-visible:ring-slate-500/40 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200",
  ghost:
    "bg-transparent text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 focus-visible:ring-slate-400/40",
  danger:
    "bg-rose-600 text-white hover:bg-rose-500 focus-visible:ring-rose-500/40 disabled:bg-rose-600/60",
  outline:
    "bg-transparent border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800",
};

const sizeMap: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
  lg: "h-12 px-6 text-base gap-2 rounded-xl",
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
        "inline-flex items-center justify-center font-medium transition focus:outline-none focus-visible:ring-4 disabled:opacity-70 disabled:cursor-not-allowed",
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
        "inline-flex items-center justify-center font-medium transition focus:outline-none focus-visible:ring-4",
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

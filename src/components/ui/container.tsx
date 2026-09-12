import type { HTMLAttributes, ReactNode } from "react";

export function Container({
  size = "default",
  className = "",
  children,
  as = "div",
  ...rest
}: HTMLAttributes<HTMLElement> & {
  size?: "narrow" | "default" | "wide" | "full";
  children: ReactNode;
  as?: "div" | "main" | "section" | "article";
}) {
  const sizes: Record<typeof size, string> = {
    narrow: "max-w-3xl mx-auto px-4 sm:px-6 lg:px-8",
    default: "max-w-6xl mx-auto px-4 sm:px-6 lg:px-8",
    wide: "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8",
    full: "w-full px-4 sm:px-6 lg:px-8",
  };
  const Tag = as as "div";
  return (
    <Tag {...rest} className={[sizes[size], className].join(" ")}>
      {children}
    </Tag>
  );
}

export function Stack({
  gap = "md",
  className = "",
  children,
  as = "div",
  ...rest
}: HTMLAttributes<HTMLElement> & {
  gap?: "xs" | "sm" | "md" | "lg" | "xl";
  children: ReactNode;
  as?: "div" | "section" | "article";
}) {
  const gaps: Record<typeof gap, string> = {
    xs: "space-y-1",
    sm: "space-y-2",
    md: "space-y-3",
    lg: "space-y-5",
    xl: "space-y-8",
  };
  const Tag = as as "div";
  return (
    <Tag {...rest} className={[gaps[gap], className].join(" ")}>
      {children}
    </Tag>
  );
}

export function Row({
  gap = "md",
  className = "",
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & {
  gap?: "xs" | "sm" | "md" | "lg";
  children: ReactNode;
}) {
  const gaps: Record<typeof gap, string> = {
    xs: "gap-1",
    sm: "gap-2",
    md: "gap-3",
    lg: "gap-5",
  };
  return (
    <div
      {...rest}
      className={[
        "flex flex-wrap items-center",
        gaps[gap],
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

export function Divider({
  className = "",
  label,
}: {
  className?: string;
  label?: string;
}) {
  if (!label)
    return (
      <hr
        className={[
          "my-6 border-slate-200 dark:border-slate-800",
          className,
        ].join(" ")}
      />
    );
  return (
    <div
      className={[
        "my-6 flex items-center gap-3 text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500",
        className,
      ].join(" ")}
    >
      <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
      {label}
      <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
    </div>
  );
}

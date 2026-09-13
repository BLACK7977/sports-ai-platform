import type { HTMLAttributes, ReactNode } from "react";

type Props = HTMLAttributes<HTMLDivElement> & {
  as?: "div" | "section" | "article";
};

export function Card({ as = "div", className = "", ...rest }: Props) {
  const Tag = as as "div";
  return (
    <Tag
      {...rest}
      className={[
        "sa-panel rounded-sm border border-cyan-100/12 bg-[#071321]/92 shadow-[0_16px_38px_rgba(0,0,0,0.18)]",
        className,
      ].join(" ")}
    />
  );
}

export function CardHeader({
  children,
  className = "",
  action,
}: {
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <div
      className={[
        "flex items-start justify-between gap-3 px-5 py-4 border-b border-cyan-100/10",
        className,
      ].join(" ")}
    >
      <div className="space-y-1">{children}</div>
      {action}
    </div>
  );
}

export function CardTitle({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h3
      className={[
        "text-base font-semibold text-slate-100",
        className,
      ].join(" ")}
    >
      {children}
    </h3>
  );
}

export function CardSubtitle({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={[
        "text-sm text-slate-400",
        className,
      ].join(" ")}
    >
      {children}
    </p>
  );
}

export function CardBody({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={["px-5 py-4 text-slate-200", className].join(" ")}
    >
      {children}
    </div>
  );
}

export function CardFooter({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        "px-5 py-3 border-t border-slate-200 dark:border-slate-800 text-sm text-slate-500 dark:text-slate-400",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

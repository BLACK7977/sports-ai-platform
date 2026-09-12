import type { HTMLAttributes, ReactNode } from "react";

export function DataTable({
  className = "",
  children,
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div
      className={[
        "overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800",
        className,
      ].join(" ")}
    >
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800 text-sm">
          {children}
        </table>
      </div>
    </div>
  );
}

export function TableHead({
  children,
  className = "",
}: HTMLAttributes<HTMLTableSectionElement> & { children: ReactNode }) {
  return (
    <thead
      className={[
        "bg-slate-50 text-slate-500 dark:bg-slate-900/60 dark:text-slate-400",
        className,
      ].join(" ")}
    >
      <tr>{children}</tr>
    </thead>
  );
}

export function Th({
  children,
  className = "",
  align = "left",
}: {
  children?: ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
}) {
  const alignMap = {
    left: "text-left",
    right: "text-right",
    center: "text-center",
  } as const;
  return (
    <th
      scope="col"
      className={[
        "px-4 py-3 text-xs font-medium uppercase tracking-wider",
        alignMap[align],
        className,
      ].join(" ")}
    >
      {children}
    </th>
  );
}

export function TableBody({
  children,
  className = "",
}: HTMLAttributes<HTMLTableSectionElement> & { children: ReactNode }) {
  return (
    <tbody
      className={[
        "divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200",
        className,
      ].join(" ")}
    >
      {children}
    </tbody>
  );
}

export function Tr({
  children,
  className = "",
  onClick,
  hoverable,
}: HTMLAttributes<HTMLTableRowElement> & {
  children: ReactNode;
  hoverable?: boolean;
}) {
  return (
    <tr
      className={[
        onClick || hoverable
          ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 transition"
          : "",
        className,
      ].join(" ")}
      onClick={onClick}
    >
      {children}
    </tr>
  );
}

export function Td({
  children,
  className = "",
  align = "left",
}: {
  children: ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
}) {
  const alignMap = {
    left: "text-left",
    right: "text-right",
    center: "text-center",
  } as const;
  return (
    <td
      className={[
        "whitespace-nowrap px-4 py-3",
        alignMap[align],
        className,
      ].join(" ")}
    >
      {children}
    </td>
  );
}

export function EmptyRow({
  message,
  cols = 6,
}: {
  message: string;
  cols?: number;
}) {
  return (
    <tr>
      <td
        colSpan={cols}
        className="px-4 py-10 text-center text-sm text-slate-400"
      >
        {message}
      </td>
    </tr>
  );
}

import type { HTMLAttributes, ReactNode } from "react";

export function DataTable({
  className = "",
  children,
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div
      className={[
        "sa-data-table overflow-hidden rounded-sm border border-cyan-100/12",
        className,
      ].join(" ")}
    >
      <div
        className="sa-table-scroll overflow-x-auto"
        role="region"
        aria-label="Tabla desplazable horizontalmente"
        tabIndex={0}
      >
        <table className="min-w-full divide-y divide-cyan-100/10 text-sm">
          {children}
        </table>
      </div>
      <p className="sa-table-scroll-hint" aria-hidden>
        Deslizá horizontalmente para ver todas las columnas
      </p>
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
        "sa-table-head bg-cyan-400/5 text-slate-400",
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
        "divide-y divide-cyan-100/8 bg-[#071321] text-slate-200",
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
          ? "cursor-pointer hover:bg-cyan-300/5 transition"
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

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type SportNavProps = {
  sport?: string;
  variant?: "all" | "header" | "mobile";
};

function getSections(sport: string) {
  return [
    { href: `/${sport}`, label: "Resumen", icon: "⌂", exact: true },
    { href: `/${sport}/matches`, label: "Partidos", icon: "◉", exact: false },
    { href: `/${sport}/standings`, label: "Tabla", icon: "▦", exact: false },
    { href: `/${sport}/players`, label: "Equipos", icon: "◈", exact: false },
    { href: `/${sport}/leaderboard`, label: "Estadísticas", icon: "↗", exact: false },
  ] as const;
}

export function SportsNavigation({ sport = "soccer", variant = "all" }: SportNavProps) {
  const pathname = usePathname();
  const sections = getSections(sport);

  return (
    <>
      {variant !== "mobile" ? <nav className="sports-section-nav" aria-label="Secciones de fútbol">
        {sections.map((section) => {
          const active = section.exact
            ? pathname === section.href
            : pathname === section.href || pathname.startsWith(`${section.href}/`);
          return (
            <Link
              key={section.href}
              href={section.href}
              aria-current={active ? "page" : undefined}
              className="sports-section-link"
            >
              {section.label}
            </Link>
          );
        })}
      </nav> : null}
      {variant !== "header" ? <nav className="sports-mobile-nav" aria-label="Navegación principal de fútbol">
        {sections.map((section) => {
          const active = section.exact
            ? pathname === section.href
            : pathname === section.href || pathname.startsWith(`${section.href}/`);
          return (
            <Link
              key={section.href}
              href={section.href}
              aria-current={active ? "page" : undefined}
              className="sports-mobile-link"
            >
              <b aria-hidden>{section.icon}</b>
              <span>{section.label}</span>
            </Link>
          );
        })}
      </nav> : null}
    </>
  );
}

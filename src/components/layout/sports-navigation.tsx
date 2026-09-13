"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const sections = [
  { href: "/soccer", label: "Dashboard", icon: "⌂", exact: true },
  { href: "/soccer/matches", label: "Partidos", icon: "◉", exact: false },
  { href: "/soccer/standings", label: "Tabla", icon: "▦", exact: false },
  { href: "/soccer/players", label: "Plantillas", icon: "◈", exact: false },
  { href: "/soccer/leaderboard", label: "Ranking", icon: "↗", exact: false },
] as const;

export function SportsNavigation({ variant = "all" }: { variant?: "all" | "header" | "mobile" }) {
  const pathname = usePathname();

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

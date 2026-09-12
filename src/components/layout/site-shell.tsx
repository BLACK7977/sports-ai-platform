import Link from "next/link";
import type { ReactNode } from "react";
import { getActiveSports } from "@/lib/config/sports-registry";
import { Container, Row } from "@/components/ui/container";
import { Badge } from "@/components/ui/badge";
import { getFeatureFlag } from "@/lib/config/feature-flags";
import { hasSupabase } from "@/lib/config/env";

function dbStatusBadge() {
  const offline = getFeatureFlag("ENABLE_OFFLINE_MODE") === true;
  const hasCreds = hasSupabase();
  if (offline) {
    return (
      <Badge tone="warning" className="text-[10px] tracking-wider uppercase">
        ● Offline (in-memory)
      </Badge>
    );
  }
  if (hasCreds) {
    return (
      <Badge tone="success" className="text-[10px] tracking-wider uppercase">
        ● Supabase Cloud
      </Badge>
    );
  }
  return (
    <Badge tone="danger" className="text-[10px] tracking-wider uppercase">
      ● sin credenciales
    </Badge>
  );
}

export function SiteHeader() {
  const sports = getActiveSports();
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
      <Container size="wide" className="h-16 flex items-center justify-between gap-4">
        <Link
          href="/"
          className="inline-flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100"
        >
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-sm">
            ⚽
          </span>
          <span>
            Sports <span className="text-indigo-600 dark:text-indigo-400">AI</span>
          </span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link
            href="/"
            className="hidden sm:inline-flex items-center rounded-lg px-3 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800"
          >
            Inicio
          </Link>
          {sports.slice(0, 4).map((s) => (
            <Link
              key={s.id}
              href={`/${s.id}`}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800 transition"
              prefetch={false}
            >
              <span aria-hidden>{s.emoji}</span>
              <span className="hidden md:inline">{s.displayName}</span>
            </Link>
          ))}
        </nav>
        <Row className="hidden md:flex" gap="sm">
          {dbStatusBadge()}
          <span className="text-xs text-slate-400">v0.1 · MVP</span>
        </Row>
      </Container>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40">
      <Container size="wide" className="py-10 text-sm text-slate-500 dark:text-slate-400">
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
          <div>© {new Date().getFullYear()} Sports AI Platform — MVP</div>
          <div className="flex flex-wrap gap-4">
            <Link href="/">Inicio</Link>
            <Link href="/soccer">Fútbol</Link>
            <Link href="/soccer/matches">Partidos</Link>
            <Link href="/soccer/standings">Tabla</Link>
          </div>
        </div>
      </Container>
    </footer>
  );
}

export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader />
      <main className="flex-1 py-8">{children}</main>
      <SiteFooter />
    </div>
  );
}

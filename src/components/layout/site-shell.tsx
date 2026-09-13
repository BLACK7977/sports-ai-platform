import Link from "next/link";
import type { ReactNode } from "react";
import { getActiveSports } from "@/lib/config/sports-registry";
import { Container, Row } from "@/components/ui/container";
import { Badge } from "@/components/ui/badge";
import { getFeatureFlag } from "@/lib/config/feature-flags";
import { hasSupabase } from "@/lib/config/env";
import { SportsNavigation } from "@/components/layout/sports-navigation";
import { LogoutButton } from "@/components/auth/logout-button";
import { getCurrentUser, getCurrentProfile } from "@/lib/auth/session";

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
    <Badge tone="warning" className="text-[10px] tracking-wider uppercase">
      ● Offline (fallback)
    </Badge>
  );
}

async function AuthState() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <>
        <Link href="/login" className="inline-flex items-center rounded-lg px-3 py-2 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800">Ingresar</Link>
        <Link href="/register" className="inline-flex items-center rounded-lg px-3 py-2 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800">Crear cuenta</Link>
      </>
    );
  }
  const profile = await getCurrentProfile(user.id);
  return (
    <>
      <span className="max-w-40 truncate text-xs text-slate-500 dark:text-slate-400" title={user.email ?? undefined}>
        {user.email ?? "Usuario"}
        {profile?.role === "premium" ? " · Pro" : ""}
      </span>
      <LogoutButton />
    </>
  );
}

export async function SiteHeader() {
  const sports = getActiveSports();
  return (
    <header className="sticky top-0 z-40 border-b border-cyan-100/10 bg-[#050d18]/88 backdrop-blur">
      <Container size="wide" className="h-16 flex items-center justify-between gap-4">
        <Link
          href="/"
          className="inline-flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100"
        >          <span className="brand-mark" aria-hidden><span>⚽</span></span>
          <span className="brand-wordmark">SPORTS <b>AI</b></span>
        </Link>
        <nav className="hidden lg:flex items-center gap-1 text-sm">
          <Link href="/" className="inline-flex items-center rounded-lg px-3 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800">Inicio</Link>
          {sports.slice(0, 4).map((sport) => (
            <Link key={sport.id} href={`/${sport.id}`} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800 transition" prefetch={false}>
              <span aria-hidden>{sport.emoji}</span><span className="hidden md:inline">{sport.displayName}</span>
            </Link>
          ))}
        </nav>
        <SportsNavigation variant="header" />
        <details className="hidden">
          <summary className="list-none cursor-pointer rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-200">Menú</summary>
          <div className="absolute right-0 top-12 z-50 grid min-w-44 gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <Link href="/" className="rounded-lg px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800">Inicio</Link>
            {sports.slice(0, 4).map((sport) => <Link key={sport.id} href={`/${sport.id}`} className="rounded-lg px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800">{sport.emoji} {sport.displayName}</Link>)}
          </div>
        </details>
        <Row className="hidden md:flex" gap="sm">
          {dbStatusBadge()}
          <AuthState />
          <span className="text-xs text-slate-400">v0.1 · MVP</span>
        </Row>
      </Container>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer-signal mt-16 border-t border-cyan-100/10 bg-[#050d18]/80">
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
      <main className="sports-app-main flex-1 py-8">{children}</main>
      <SportsNavigation variant="mobile" />
      <SiteFooter />
    </div>
  );
}

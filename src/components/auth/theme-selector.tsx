"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { actionSetProfileTheme } from "@/app/account/actions";
import { THEME_LABELS, type ThemeId } from "@/lib/themes";

/**
 * Selector de tema de interfaz (APARIENCIA).
 *
 * - FREE   → solo el tema cyan está activo; los otros cuatro muestran candado
 *            y NO son interactivos (la entidad server también los rechaza).
 * - PREMIUM→ los cinco temas son seleccionables.
 *
 * El cambio es inmediato y sutil (sin recarga): se muta `data-theme` en
 * <html> y se persiste vía la Server Action; si el server rechaza o falla la
 * escritura, se revierte al valor vigente. La acción server revalida el
 * entitlement; este componente solo ofrece el preview visual.
 */
export function ThemeSelector({
  currentTheme,
  plan,
}: {
  currentTheme: ThemeId;
  plan: "free" | "pro";
}) {
  const [applied, setApplied] = useState<ThemeId>(currentTheme);
  const [busy, setBusy] = useState<ThemeId | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isPro = plan === "pro";

  // The only place the DOM is mutated: a state-driven effect keeps the view
  // pure. On apply revert (server rejection or write failure), setApplied
  // re-runs this effect and the previously active theme is restored.
  useEffect(() => {
    const root = document.documentElement;
    const t = window.setTimeout(() => {
      delete root.dataset.themeTransition;
    }, 240);
    root.dataset.theme = applied;
    root.dataset.themeTransition = "on";
    return () => window.clearTimeout(t);
  }, [applied]);

  async function apply(theme: ThemeId) {
    if (!isPro && theme !== "cyan") return;
    if (busy) return;
    const previous = applied;
    setBusy(theme);
    setError(null);
    setApplied(theme);

    const res = await actionSetProfileTheme(theme);
    setBusy(null);
    if (!res.ok) {
      setApplied(previous);
      setError(res.error);
    }
  }

  return (
    <section aria-labelledby="theme-selector-title" className="space-y-4">
      <div>
        <p className="page-eyebrow">APARIENCIA</p>
        <h2 id="theme-selector-title" className="mt-1 text-xl font-semibold text-slate-100">
          Tema de interfaz
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Elegí el acento visual del producto. Tu elección se guarda en tu perfil.
        </p>
      </div>

      <div className="grid grid-cols-5 gap-2 sm:gap-3" role="radiogroup" aria-label="Tema de interfaz">
        {(
          ["cyan", "gold", "pink", "green", "red"] as const
        ).map((theme) => {
          const enabled = isPro || theme === "cyan";
          const selected = applied === theme;
          const swatchColor = {
            cyan: "#00e5ff",
            gold: "#ecc24d",
            pink: "#f43f8e",
            green: "#2fd8a5",
            red: "#f04b57",
          }[theme];
          return (
            <button
              key={theme}
              type="button"
              disabled={!enabled || busy !== null}
              onClick={() => apply(theme)}
              aria-checked={selected}
              role="radio"
              aria-disabled={!enabled}
              title={enabled ? THEME_LABELS[theme] : `Disponible con NYVORX PRO · ${THEME_LABELS[theme]}`}
              className={`group flex flex-col items-center gap-1.5 rounded-md border px-2 py-3 transition ${
                selected
                  ? "border-(--sa-cyan) bg-(--sa-cyan)/8"
                  : enabled
                    ? "border-slate-700 bg-slate-950/40 hover:border-slate-400"
                    : "border-slate-800 bg-slate-950/30 opacity-70 cursor-not-allowed"
              }`}
            >
              <span
                aria-hidden
                style={{ backgroundColor: swatchColor }}
                className={`h-7 w-7 rounded-full ring-1 ring-inset ring-white/15 ${
                  selected ? "shadow-[0_0_12px_rgba(255,255,255,0.18)]" : ""
                }`}
              />
              <span className="text-[10px] font-medium uppercase tracking-wider text-slate-300">
                {THEME_LABELS[theme]}
              </span>
              <span aria-hidden className="flex h-3 items-center text-slate-500">
                {selected ? (
                  <span className="text-[10px] text-(--sa-cyan)">ACTIVO</span>
                ) : !enabled ? (
                  <svg viewBox="0 0 16 16" className="h-3 w-3" fill="currentColor" aria-hidden>
                    <path d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2h.5c.55 0 1 .45 1 1v5c0 .55-.45 1-1 1H4c-.55 0-1-.45-1-1V8c0-.55.45-1 1-1h.5Zm1.5 0h4V5a2 2 0 1 0-4 0v2Z" />
                  </svg>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      {!isPro ? (
        <p className="text-xs text-slate-400">
          Los temas Oro, Rosa, Verde y Rojo son exclusivos de{" "}
          <Link href="/soccer/premium-test" className="text-(--sa-cyan) underline underline-offset-2 hover:text-(--sa-cyan-bright)">
            NYVORX PRO
          </Link>
          .
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-xs text-rose-400">
          No se pudo guardar el tema: {error}
        </p>
      ) : null}
    </section>
  );
}
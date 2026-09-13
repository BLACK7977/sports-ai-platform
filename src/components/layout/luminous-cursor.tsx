"use client";

import { useEffect } from "react";

const INTERACTIVE = "a, button, input, select, textarea, [role='button'], [data-cursor-interactive]";

export function LuminousCursor() {
  useEffect(() => {
    const finePointer = window.matchMedia("(pointer: fine)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!finePointer.matches || reducedMotion.matches) return;

    const root = document.documentElement;
    const move = (event: PointerEvent) => {
      root.style.setProperty("--cursor-x", `${event.clientX}px`);
      root.style.setProperty("--cursor-y", `${event.clientY}px`);
      root.classList.add("luminous-cursor-ready");
      root.classList.toggle("luminous-cursor-action", Boolean((event.target as Element | null)?.closest(INTERACTIVE)));
    };
    const leave = () => root.classList.remove("luminous-cursor-ready", "luminous-cursor-action");
    const down = () => root.classList.add("luminous-cursor-pressed");
    const up = () => root.classList.remove("luminous-cursor-pressed");

    window.addEventListener("pointermove", move, { passive: true });
    document.documentElement.addEventListener("mouseleave", leave);
    window.addEventListener("pointerdown", down, { passive: true });
    window.addEventListener("pointerup", up, { passive: true });
    return () => {
      window.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("mouseleave", leave);
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
      root.classList.remove("luminous-cursor-ready", "luminous-cursor-action", "luminous-cursor-pressed");
    };
  }, []);

  return <span className="luminous-cursor" aria-hidden />;
}

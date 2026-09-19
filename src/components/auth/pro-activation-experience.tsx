"use client";

import { useState } from "react";

const unlocked = [
  "Lectura completa de cada predicción",
  "Radiografía del partido con IA",
  "Informes avanzados de jugadores",
  "Generación de alineaciones probables",
  "Explicaciones avanzadas de predicción",
  "Temas exclusivos de interfaz (Oro, Rosa, Verde y Rojo)",
];

/**
 * Experiencia de activación NYVORX PRO (fundación).
 *
 * NO se auto-dispara: el sistema de suscripción la montará cuando confirme
 * una activación real (rol premium + bienvenida) en la siguiente navegación
 * autenticada. Hasta entonces solo existe como componente listo, con una
 * transición cyan → oro, respeto de prefers-reduced-motion y una prop de
 * QA/test (forceVisible) para validar el render.
 */
export default function ProActivationExperience({
  forceVisible = false,
}: {
  forceVisible?: boolean;
}) {
  const [dismissed, setDismissed] = useState(false);
  if (!forceVisible || dismissed) return null;

  return (
    <div
      className="pro-activation"
      role="dialog"
      aria-modal="true"
      aria-label="NYVORX PRO ACTIVADO"
    >
      <div className="pro-activation-card">
        <div className="pro-activation-sweep" aria-hidden />
        <span className="pro-activation-kicker">NYVORX PRO</span>
        <h1 className="pro-activation-title">ACTIVADO</h1>
        <p className="pro-activation-copy">
          Bienvenido a la capa Pro de Sports Intelligence. Tu cuenta ya cuenta
          con la lectura completa del modelo, los análisis con IA y los temas
          de interfaz exclusivos.
        </p>
        <ul className="pro-activation-unlock">
          {unlocked.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <button
          type="button"
          className="pro-activation-dismiss"
          onClick={() => setDismissed(true)}
        >
          Comenzar
        </button>
      </div>
    </div>
  );
}
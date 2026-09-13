"use client";

import { useState } from "react";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  CardSubtitle,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Divider } from "@/components/ui/container";
import { actionGeneratePlayerReport } from "@/app/[sport]/players/[id]/actions";
import type { PlayerInsightResult } from "@/types/ai";

export default function PlayerReportPanel({
  sport,
  leagueId,
  seasonId,
  playerId,
}: {
  sport: string;
  leagueId: string;
  seasonId: string;
  playerId: string;
}) {
  const [report, setReport] = useState<PlayerInsightResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setBusy(true);
    setError(null);
    const res = await actionGeneratePlayerReport(
      sport,
      leagueId,
      seasonId,
      playerId,
    );
    if (res.ok) setReport(res.data);
    else setError(res.error);
    setBusy(false);
  }

  return (
    <Card className="product-panel">
      <CardHeader>
        <CardTitle>Reporte con IA</CardTitle>
        <CardSubtitle>Fortalezas, debilidades y perspectiva</CardSubtitle>
      </CardHeader>
      <CardBody>
        {report ? (
          <div className="space-y-4">
            <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-xl p-4">
              <div className="text-xs uppercase tracking-wider text-emerald-700 dark:text-emerald-300 font-bold mb-2">
                Fortalezas
              </div>
              {report.strengths && report.strengths.length > 0 ? (
                <ul className="list-disc pl-5 space-y-1 text-sm text-emerald-900 dark:text-emerald-100">
                  {report.strengths.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-emerald-700/70">No disponible.</p>
              )}
            </div>
            <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-xl p-4">
              <div className="text-xs uppercase tracking-wider text-rose-700 dark:text-rose-300 font-bold mb-2">
                Debilidades
              </div>
              {report.weaknesses && report.weaknesses.length > 0 ? (
                <ul className="list-disc pl-5 space-y-1 text-sm text-rose-900 dark:text-rose-100">
                  {report.weaknesses.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-rose-700/70">No disponible.</p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Generar un informe de rendimiento con IA: fortalezas, debilidades
              y perspectiva basadas en los datos de esta temporada.
            </p>
            <Button onClick={handleGenerate} disabled={busy}>
              {busy ? "Generando…" : "Generar informe con IA"}
            </Button>
            {error ? <p className="text-sm text-rose-500">{error}</p> : null}
          </div>
        )}
      </CardBody>
      {report ? (
        <CardFooter className="flex-col items-start gap-2 border-t border-slate-200 dark:border-slate-800 !py-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-1">
              Resumen de rendimiento
            </div>
            <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
              {report.performanceSummary || "No disponible."}
            </p>
          </div>
          <Divider />
          <div>
            <div className="text-xs uppercase tracking-wider text-indigo-600 dark:text-indigo-300 font-bold mb-1">
              Perspectiva
            </div>
            <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
              {report.outlook || "No disponible."}
            </p>
          </div>
        </CardFooter>
      ) : null}
    </Card>
  );
}
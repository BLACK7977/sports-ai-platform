"use client";

import { useState } from "react";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  CardSubtitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MatchProbabilityBar } from "@/components/charts/svg-charts";
import { actionAnalyzeMatch, actionPredictMatch } from "@/app/[sport]/matches/[id]/actions";
import type { MatchAnalysisResult, MatchPredictionResult } from "@/types/ai";

type AiBusy = "analysis" | "prediction" | null;

export default function MatchAiPanels({
  sport,
  matchId,
  leagueId,
  seasonId,
  predictionAvailable,
  homeShort,
  awayShort,
}: {
  sport: string;
  matchId: string;
  leagueId: string;
  seasonId: string;
  predictionAvailable: boolean;
  homeShort: string;
  awayShort: string;
}) {
  const [analysis, setAnalysis] = useState<MatchAnalysisResult | null>(null);
  const [prediction, setPrediction] = useState<MatchPredictionResult | null>(null);
  const [busy, setBusy] = useState<AiBusy>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAnalysis() {
    setBusy("analysis");
    setError(null);
    const res = await actionAnalyzeMatch(sport, matchId);
    if (res.ok) setAnalysis(res.data);
    else setError(res.error);
    setBusy(null);
  }

  async function handlePrediction() {
    setBusy("prediction");
    setError(null);
    const res = await actionPredictMatch(sport, leagueId, seasonId, matchId);
    if (res.ok) setPrediction(res.data);
    else setError(res.error);
    setBusy(null);
  }

  return (
    <>
      <Card className="match-panel match-experimental-module match-intelligence-module lg:col-span-2">
        <CardHeader className="match-module-header">
          <CardTitle>
            <span className="module-kicker">ESTIMACIÓN EXPERIMENTAL</span>{" "}
            Lectura de escenario
          </CardTitle>
          <CardSubtitle>
            Basada en señales disponibles; no garantiza un resultado.
          </CardSubtitle>
        </CardHeader>
        <CardBody>
          {!predictionAvailable ? (
            <div className="match-empty-state">
              Datos insuficientes de forma y tabla para calcular una estimación
              confiable.
            </div>
          ) : prediction ? (
            <>
              <MatchProbabilityBar
                homeProb={prediction.homeWinProbability}
                drawProb={prediction.drawProbability}
                awayProb={prediction.awayWinProbability}
                homeLabel={`${homeShort} · Local`}
                awayLabel={`${awayShort} · Visita`}
              />
              <div className="match-prediction-score">
                <span>Marcador estimado</span>
                <strong>
                  {prediction.predictedHomeScore} - {prediction.predictedAwayScore}
                </strong>
              </div>
              <p className="match-disclaimer">{prediction.explanation}</p>
            </>
          ) : (
            <div className="match-ai-cta">
              <p>
                Generar una estimación experta con IA sobre el desarrollo del
                partido.
              </p>
              <Button
                onClick={handlePrediction}
                disabled={busy !== null}
                size="sm"
              >
                {busy === "prediction"
                  ? "Generando…"
                  : "Generar predicción con IA"}
              </Button>
            </div>
          )}
        </CardBody>
      </Card>

      <Card className="match-panel match-experimental-module match-report-module">
        <CardHeader className="match-module-header">
          <CardTitle>
            <span className="module-kicker">LECTURA COMPLEMENTARIA</span>{" "}
            Radiografía del partido
          </CardTitle>
          <CardSubtitle>
            Análisis basado exclusivamente en el historial y los datos
            disponibles.
          </CardSubtitle>
        </CardHeader>
        <CardBody>
          {analysis ? (
            <div className="match-report-grid">
              <div>
                <span className="match-report-label">Lectura del sistema</span>
                <p>{analysis.summary}</p>
                <p>{analysis.narrative}</p>
              </div>
              <div>
                <span className="match-report-label">Factores considerados</span>
                <ul>
                  {analysis.keyInsights.map((insight, index) => (
                    <li key={`${insight}-${index}`}>{insight}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <div className="match-ai-cta">
              <p>
                Generar una lectura detallada del escenario con IA, a partir del
                historial disponible.
              </p>
              <Button
                onClick={handleAnalysis}
                disabled={busy !== null}
                size="sm"
              >
                {busy === "analysis"
                  ? "Generando…"
                  : "Generar análisis con IA"}
              </Button>
            </div>
          )}
          {error ? (
            <div className="match-empty-state match-ai-error">{error}</div>
          ) : null}
        </CardBody>
      </Card>
    </>
  );
}
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardSubtitle, CardBody } from "@/components/ui/card";
import { Button, LinkButton } from "@/components/ui/button";
import {
  actionGenerateUpcomingPrediction,
  type GeneratedUpcomingPrediction,
} from "@/app/[sport]/matches/[id]/actions";
import {
  PUBLIC_MODEL_VERSION_LINE,
  MODEL_EXPERIMENTAL_TAG,
} from "@/lib/presentation/model-version";
import { probabilityPercentages } from "@/lib/presentation/probability";
import type { PredictionExplanationView } from "@/lib/types/prediction-explanation";
import type { SportId } from "@/types/core/sport";

function generatedDateLabel(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "fecha no disponible";
}

function ExplanationBlock({
  sport,
  explanation,
}: {
  sport: string;
  explanation: PredictionExplanationView | null;
}) {
  if (!explanation) {
    return (
      <section className="match-explanation match-explanation-missing" aria-label="Lectura SPORTS AI">
        <h3 className="match-explanation-kicker">LECTURA SPORTS AI</h3>
        <p className="match-explanation-missing-text">Lectura SPORTS AI todavía no generada</p>
      </section>
    );
  }

  if (explanation.plan === "free") {
    return (
      <section className="match-explanation" aria-label="Lectura SPORTS AI · resumen">
        <h3 className="match-explanation-kicker">LECTURA SPORTS AI</h3>
        <p className="match-explanation-summary">{explanation.summary}</p>
        <div className="match-explanation-locked">
          <h4 className="match-explanation-subtitle">FACTORES CLAVE Y LECTURA DEL MODELO</h4>
          <div className="match-explanation-skeleton" aria-hidden>
            <i /><i /><i />
          </div>
          <p>El desglose completo de la lectura está disponible con el plan Pro de SPORTS AI.</p>
          <LinkButton href={`/${sport}/premium-test`} tone="primary" size="sm" className="match-explanation-pro-cta">
            Conocé PRO
          </LinkButton>
        </div>
      </section>
    );
  }

  return (
    <section className="match-explanation" aria-label="Lectura SPORTS AI">
      <h3 className="match-explanation-kicker">LECTURA SPORTS AI</h3>
      <p className="match-explanation-summary">{explanation.summary}</p>
      <h4 className="match-explanation-subtitle">FACTORES CLAVE</h4>
      <ul className="match-explanation-factors">
        {explanation.keyFactors.map((factor, index) => (
          <li key={`${index}-${factor}`}>{factor}</li>
        ))}
      </ul>
      <h4 className="match-explanation-subtitle">LECTURA DEL MODELO</h4>
      <p className="match-explanation-reading">{explanation.modelReading}</p>
    </section>
  );
}

export default function MatchPredictionPanel({
  sport,
  matchId,
  initialPrediction,
  explanation,
}: {
  sport: string;
  matchId: string;
  initialPrediction: GeneratedUpcomingPrediction | null;
  explanation?: PredictionExplanationView | null;
}) {
  const router = useRouter();
  const [prediction, setPrediction] = useState<GeneratedUpcomingPrediction | null>(initialPrediction);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    const result = await actionGenerateUpcomingPrediction(sport as SportId, matchId);
    if (result.ok) {
      setPrediction(result.prediction);
      if (result.generated) router.refresh();
    } else {
      setError(result.error);
    }
    setPending(false);
  };

  return (
    <Card className="match-panel match-prediction-panel match-prematch-prediction">
      <CardHeader className="match-module-header">
        <CardTitle><span className="module-kicker">ANÁLISIS SPORTS AI</span> Predicción del partido</CardTitle>
        <CardSubtitle>{PUBLIC_MODEL_VERSION_LINE} · {MODEL_EXPERIMENTAL_TAG}</CardSubtitle>
      </CardHeader>
      <CardBody>
        {prediction ? (() => {
          const percentages = probabilityPercentages(prediction.probabilities);
          return (
          <>
            <div className="match-prediction-view">
            <span className="match-prediction-tag">{MODEL_EXPERIMENTAL_TAG} · Predicción del modelo</span>
            <div className="match-prediction-grid" aria-label="Probabilidades del modelo">
              {([
                ["Local", percentages.home],
                ["Empate", percentages.draw],
                ["Visitante", percentages.away],
              ] as const).map(([label, percentage]) => (
                <div key={label}><span>{label}</span><strong>{percentage}%</strong></div>
              ))}
            </div>
            <div className="match-prediction-track" aria-hidden="true">
              <i style={{ flexGrow: prediction.probabilities.home }} />
              <i style={{ flexGrow: prediction.probabilities.draw }} />
              <i style={{ flexGrow: prediction.probabilities.away }} />
            </div>
            {prediction.expectedGoals ? (
              <p className="match-prediction-xg">
                Goles esperados (xG) <strong>{prediction.expectedGoals.home.toFixed(2)} — {prediction.expectedGoals.away.toFixed(2)}</strong>
              </p>
            ) : null}
            <p className="match-prediction-meta">Predicción generada {generatedDateLabel(prediction.predictedAt)}</p>
          </div>
            <ExplanationBlock sport={sport} explanation={explanation ?? null} />
          </>
          );
        })() : (
          <div className="match-prediction-empty">
            <p>Análisis SPORTS AI aún no generado</p>
            <Button tone="primary" size="md" disabled={pending} onClick={handleGenerate}>
              {pending ? "Generando análisis…" : "Analizar con SPORTS AI"}
            </Button>
            {error ? <p className="match-prediction-error">{error}</p> : null}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  CardSubtitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Container, Stack, Row } from "@/components/ui/container";
import { LinkButton } from "@/components/ui/button";
import { MatchProbabilityBar } from "@/components/charts/svg-charts";
import { publicModelVersionName } from "@/lib/presentation/model-version";
import { getHasSport } from "@/components/sports/sport-helpers";
import type {
  HistoryViewRow,
} from "@/lib/db/repositories/predictions-repo";
import type { EvaluationSummary } from "@/lib/ai/evaluation-service";

function formatDateTime(value: string): string {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return value;
  return new Date(ms).toLocaleString("es-UY", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SummaryCards({ summary }: { summary: EvaluationSummary }) {
  if (summary.total === 0) {
    return (
      <Card className="product-stat">
        <CardBody>
          <span className="match-report-label">Rendimiento del modelo</span>
          <p>Todavía no hay suficientes predicciones evaluadas.</p>
        </CardBody>
      </Card>
    );
  }
  return (
    <>
      <Card className="product-stat">
        <CardBody>
          <span className="match-report-label">Evaluadas</span>
          <p className="text-2xl font-bold tabular-nums">{summary.total}</p>
        </CardBody>
      </Card>
      <Card className="product-stat">
        <CardBody>
          <span className="match-report-label">Aciertos</span>
          <p className="text-2xl font-bold tabular-nums">{summary.correct}</p>
        </CardBody>
      </Card>
      <Card className="product-stat">
        <CardBody>
          <span className="match-report-label">Accuracy</span>
          <p className="text-2xl font-bold tabular-nums">
            {summary.accuracy === null ? "—" : `${(summary.accuracy * 100).toFixed(1)}%`}
          </p>
        </CardBody>
      </Card>
      <Card className="product-stat">
        <CardBody>
          <span className="match-report-label">Brier promedio</span>
          <p className="text-2xl font-bold tabular-nums">
            {summary.avgBrier === null ? "—" : summary.avgBrier.toFixed(3)}
          </p>
        </CardBody>
      </Card>
    </>
  );
}

function PredictionCard({ row }: { row: HistoryViewRow }) {
  const evaluated = row.state === "evaluated";
  if (!row.valid) {
    return (
      <Card className="match-panel">
        <CardHeader className="match-module-header">
          <CardTitle>
            <span className="module-kicker">PREDICCIÓN INVÁLIDA</span>{" "}
            {row.homeTeamName} vs {row.awayTeamName}
          </CardTitle>
          <CardSubtitle>
            Los datos guardados de esta predicción no son válidos y se excluyen del rendimiento.
          </CardSubtitle>
        </CardHeader>
      </Card>
    );
  }
  return (
    <Card className="match-panel">
      <CardHeader className="match-module-header">
        <CardTitle>
          <span className="module-kicker">{evaluated ? "EVALUADA" : "PENDIENTE DE RESULTADO"}</span>{" "}
          {row.homeTeamName} vs {row.awayTeamName}
        </CardTitle>
        <CardSubtitle>
          Kickoff {formatDateTime(row.kickoffAt)} · Predicha {formatDateTime(row.predictedAt)} · {publicModelVersionName(row.modelVersionId)}
        </CardSubtitle>
      </CardHeader>
      <CardBody>
        <MatchProbabilityBar
          homeProb={row.probsPct.home}
          drawProb={row.probsPct.draw}
          awayProb={row.probsPct.away}
          homeLabel={`${row.homeTeamName} · Local`}
          awayLabel={`${row.awayTeamName} · Visita`}
        />
        <div className="match-prediction-score">
          <span>Pronóstico del modelo</span>
          <strong>{row.topPickLabel}</strong>
        </div>
        {row.expectedGoals ? (
          <p className="match-disclaimer">
            Goles esperados: local {row.expectedGoals.home.toFixed(2)} · visita{" "}
            {row.expectedGoals.away.toFixed(2)}
          </p>
        ) : null}
        {evaluated ? (
          <div className="match-report-grid">
            <div>
              <span className="match-report-label">Resultado final</span>
              <p>
                {row.result ? `${row.result.homeScore} - ${row.result.awayScore}` : "—"} ·{" "}
                {row.correct ? "Acierto" : "Fallo"}
              </p>
            </div>
            <div>
              <span className="match-report-label">Métricas</span>
              <p>
                Brier {row.brier === null ? "—" : row.brier.toFixed(3)} · Esperado{" "}
                {row.topPickLabel} · Real{" "}
                {row.actualOutcome === "home"
                  ? "Local"
                  : row.actualOutcome === "away"
                    ? "Visitante"
                    : "Empate"}
              </p>
            </div>
          </div>
        ) : (
          <div className="match-empty-state">Pendiente de resultado.</div>
        )}
      </CardBody>
    </Card>
  );
}

export default function PredictionsHistoryPage({
  sport,
  rows,
  summary,
  error,
}: {
  sport: string;
  rows: HistoryViewRow[];
  summary: EvaluationSummary;
  error: string | null;
}) {
  const has = getHasSport(sport);
  const sportEmoji = has?.sport.emoji ?? "⚽";
  const sportName = has?.sport.displayName ?? "Deporte";

  return (
    <Container size="wide" className="product-page predictions-page">
      <Stack gap="xl">
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div className="space-y-2">
            <Row>
              <Badge tone="primary">
                <span className="mr-1">{sportEmoji}</span>
                {sportName}
              </Badge>
              <Badge tone="info">Modelo experimental</Badge>
            </Row>
            <h1 className="page-title">Historial de predicciones</h1>
            <p className="text-slate-500 max-w-2xl">
              NYVORX genera probabilidades, no garantías. Las predicciones se
              guardan antes del inicio del partido y no se modifican después.
            </p>
          </div>
          <Row className="flex-wrap gap-2">
            <LinkButton href={`/${sport}`} tone="ghost" size="md">
              ← Volver
            </LinkButton>
            <LinkButton href={`/${sport}/matches`} tone="outline" size="md">
              Ver fixtures
            </LinkButton>
          </Row>
        </header>

        {error ? (
          <Card className="match-panel" role="alert">
            <CardBody>
              <div className="match-empty-state match-ai-error">{error}</div>
            </CardBody>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4" aria-label="Rendimiento del modelo">
              <SummaryCards summary={summary} />
            </div>

            {rows.length === 0 ? (
          <Card className="match-panel">
            <CardBody>
              <div className="match-empty-state">
                Todavía no hay predicciones registradas.
              </div>
            </CardBody>
          </Card>
        ) : (
          <Stack gap="lg" aria-label="Predicciones">
            {rows.map((row) => (
              <PredictionCard key={String(row.predictionId)} row={row} />
            ))}
          </Stack>
            )}
          </>
        )}
      </Stack>
    </Container>
  );
}

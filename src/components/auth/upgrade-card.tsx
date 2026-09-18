import { Card, CardBody, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const features = [
  "Lectura completa del modelo: resumen, factores clave y lectura técnica",
  "Probabilidades completas de local, empate y visitante",
  "Análisis del modelo por partido y predicciones de próximos partidos",
  "Historial y filtros de predicciones",
];

export function UpgradeCard() {
  return (
    <Card className="match-panel match-intelligence-module">
      <CardHeader className="match-module-header">
        <CardTitle>
          <span className="module-kicker">NYVORX PRO</span> Una capa más profunda de Sports Intelligence
        </CardTitle>
        <CardSubtitle>Pasate a PRO para desbloquear todo el análisis del modelo NYVORX.</CardSubtitle>
      </CardHeader>
      <CardBody>
        <div className="space-y-4">
          <ul className="upgrade-features">
            {features.map((feature) => (
              <li key={feature}>
                <span className="upgrade-feature-marker" aria-hidden>▸</span>
                <span>{feature}</span>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-3 pt-1">
            <Badge tone="info" className="text-[10px] tracking-wider uppercase">
              Activar PRO — próximamente
            </Badge>
            <span className="text-xs text-slate-500">
              Aún no existe un sistema de pago integrado. Cuando esté disponible, vas a poder activar PRO desde esta página.
            </span>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
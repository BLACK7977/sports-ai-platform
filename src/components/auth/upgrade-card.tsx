import { Card, CardBody, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function UpgradeCard() {
  const features = [
    "Probabilidades completas del modelo Dixon-Coles",
    "Factores avanzados de análisis",
    "Insights profundos por partido",
    "Historial y filtros avanzados",
    "Herramientas Value/EV (próximamente)",
  ];

  return (
    <Card className="match-panel match-intelligence-module">
      <CardHeader className="match-module-header">
        <CardTitle>
          <span className="module-kicker">SPORTS AI PRO</span> Desbloqueá una capa más profunda del análisis
        </CardTitle>
        <CardSubtitle>Upgrade a Pro para acceder a todo el potencial del modelo.</CardSubtitle>
      </CardHeader>
      <CardBody>
        <div className="space-y-4">
          <div className="match-empty-state">
            <ul className="space-y-2 text-sm text-slate-300">
              {features.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <span className="mt-0.5 text-cyan-400" aria-hidden>▸</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex items-center gap-3">
            <Badge tone="info" className="text-[10px] tracking-wider uppercase">
              Próximamente
            </Badge>
            <span className="text-xs text-slate-500">
              Disponible en una futura actualización.
            </span>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

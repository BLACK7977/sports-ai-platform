import { Card, CardBody, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * Preview parcial de contenido Premium para usuarios Free.
 * Muestra títulos reales y estructura real pero datos bloqueados.
 * Marca explícitamente como "preview" para no confundir.
 */
export function PremiumPreview({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <Card className="match-panel match-report-module opacity-80">
      <CardHeader className="match-module-header">
        <CardTitle>
          <span className="module-kicker">PREVIEW PRO</span> {title}
        </CardTitle>
        {description ? <CardSubtitle>{description}</CardSubtitle> : null}
      </CardHeader>
      <CardBody>
        <div className="match-empty-state">
          <div className="space-y-3">
            <div className="h-3 w-3/4 rounded bg-cyan-400/15" aria-hidden />
            <div className="h-3 w-1/2 rounded bg-cyan-400/10" aria-hidden />
            <div className="h-3 w-2/3 rounded bg-cyan-400/10" aria-hidden />
          </div>
          <div className="mt-4 flex items-center gap-2">
            <Badge tone="warning" className="text-[10px] tracking-wider uppercase">
              Preview
            </Badge>
            <span className="text-xs text-slate-500">
              Contenido completo disponible con plan Pro.
            </span>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

import { Card, CardBody, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * Preview parcial de contenido Premium para usuarios Free.
 * Muestra títulos reales y una nota de bloqueo honesta; nunca inventa datos.
 * Marca explícitamente como "preview" para no confundir.
 */
export function PremiumPreview({
  title,
  description,
  lockedLabel = "Disponible con plan Pro",
}: {
  title: string;
  description?: string;
  lockedLabel?: string;
}) {
  return (
    <Card className="match-panel match-report-module">
      <CardHeader className="match-module-header">
        <CardTitle>
          <span className="module-kicker">NYVORX PRO</span> {title}
        </CardTitle>
        {description ? <CardSubtitle>{description}</CardSubtitle> : null}
      </CardHeader>
      <CardBody>
        <div className="premium-locked-preview">
          <span className="premium-lock-icon" aria-hidden>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="11" width="16" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
          </span>
          <div className="premium-locked-copy">
            <Badge tone="warning" className="text-[10px] tracking-wider uppercase">
              Bloqueado
            </Badge>
            <p>
              {lockedLabel}. Activación de PRO disponible próximamente; primero se integra el sistema de suscripción.
            </p>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
import { redirect, notFound } from "next/navigation";
import { Container, Stack, Row } from "@/components/ui/container";
import { Card, CardBody, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { getHasSport } from "@/components/sports/sport-helpers";
import {
  getCurrentUser,
  getCurrentProfile,
  resolvePremiumAccess,
} from "@/lib/auth/session";
import { parseSportId } from "@/lib/config/validation";
import { UpgradeCard } from "@/components/auth/upgrade-card";
import { PremiumPreview } from "@/components/auth/premium-preview";

/**
 * Ruta premium de prueba. Gating 100% server-side, una sola lectura de profile.
 * - Sin sesión → redirect
 * - ok + free → UpgradeCard + previews
 * - ok + premium → contenido permitido
 * - missing → neutral, sin CTA, acceso bloqueado
 * - error → neutral, sin CTA, acceso bloqueado
 */
export default async function PremiumTestRoute({
  params,
}: {
  params: Promise<{ sport: string }>;
}) {
  const { sport } = await params;
  if (!parseSportId(sport)) notFound();
  if (!getHasSport(sport)) notFound();

  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?next=/${sport}/premium-test`);
  }

  const profileResult = await getCurrentProfile(user.id);
  const access = resolvePremiumAccess(profileResult);

  if (access.allowed) {
    return (
      <Container size="narrow" className="product-page">
        <Stack gap="lg" className="py-8">
          <div className="flex items-center gap-3">
            <Badge tone="success" className="text-[10px] tracking-wider uppercase">
              PREMIUM ACTIVO
            </Badge>
            <span className="text-xs text-slate-500">
              Acceso verificado server-side.
            </span>
          </div>
          <Card className="match-panel match-intelligence-module">
            <CardHeader className="match-module-header">
              <CardTitle>
                <span className="module-kicker">PREMIUM</span> Zona de prueba
              </CardTitle>
              <CardSubtitle>
                Tu rol Pro fue validado en el servidor. Aquí vivirán los análisis avanzados.
              </CardSubtitle>
            </CardHeader>
            <CardBody>
              <div className="match-empty-state">
                <p className="text-sm text-slate-300">
                  Acceso completo a las herramientas Premium de NYVORX.
                </p>
                <ul className="premium-active-list">
                  <li>Lectura completa de cada predicción (resumen + factores clave + lectura técnica)</li>
                  <li>Explicaciones avanzadas de predicción, generadas con IA</li>
                  <li>Radiografía del partido y análisis IA del escenario</li>
                  <li>Informes avanzados de jugadores con IA</li>
                  <li>Generación de alineaciones probables para partidos futuros</li>
                  <li>Temas exclusivos de interfaz (Oro, Rosa, Verde y Rojo)</li>
                </ul>
                <p className="mt-2 text-xs text-slate-500">
                  Los módulos restantes se activan a medida que se sincronizan los datos de la competición.
                </p>
              </div>
            </CardBody>
          </Card>
        </Stack>
      </Container>
    );
  }

  if (access.reason === "free") {
    return (
      <Container size="narrow" className="product-page">
        <Stack gap="lg" className="py-8">
          <div className="flex items-center gap-3">
            <Badge tone="info" className="text-[10px] tracking-wider uppercase">
              ZONA PRO
            </Badge>
            <span className="text-xs text-slate-500">
              Acceso restringido a usuarios Pro.
            </span>
          </div>
          <UpgradeCard />
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-slate-300">
              Esto es lo que desbloqueás con Pro:
            </h3>
            <PremiumPreview
              title="Lectura Completa del Modelo"
              description="Resumen, factores clave y lectura técnica de cada predicción, sin recortes."
            />
            <PremiumPreview
              title="Análisis Profundo"
              description="Radiografía del partido, informes avanzados de jugadores y generación de alineaciones probables con IA."
            />
          </div>
          <Card className="match-panel">
            <CardHeader className="match-module-header">
              <CardTitle>
                <span className="module-kicker">COMPARATIVA</span> Free vs NYVORX PRO
              </CardTitle>
            </CardHeader>
            <CardBody>
              <div className="premium-compare">
                <div className="premium-compare-col">
                  <strong className="premium-compare-plan">GRATIS</strong>
                  <ul>
                    <li>Probabilidades del modelo (1X2)</li>
                    <li>Predicción del modelo por partido</li>
                    <li>Resumen de la lectura NYVORX</li>
                    <li>Predicciones de próximos partidos</li>
                    <li>Historial de predicciones</li>
                  </ul>
                </div>
                <div className="premium-compare-col premium-compare-pro">
                  <strong className="premium-compare-plan">PRO</strong>
                  <ul>
                    <li>Lectura completa: factores clave + lectura técnica</li>
                    <li>Explicaciones avanzadas de predicción con IA</li>
                    <li>Radiografía del partido con IA</li>
                    <li>Informes avanzados de jugadores</li>
                    <li>Generación de alineaciones probables</li>
                    <li>Temas exclusivos de interfaz</li>
                  </ul>
                </div>
              </div>
              <p className="mt-4 text-xs text-slate-500">
                La activación de PRO se habilita cuando esté integrado el sistema de suscripción.
              </p>
            </CardBody>
          </Card>
          <Row className="mt-2">
            <LinkButton href={`/${sport}`} tone="outline" size="md">
              ← Volver a {sport === "soccer" ? "Fútbol" : sport}
            </LinkButton>
          </Row>
        </Stack>
      </Container>
    );
  }

  // missing or error → neutral, no CTA, access blocked
  return (
    <Container size="narrow" className="product-page">
      <Stack gap="lg" className="py-8">
        <Card className="match-panel">
          <CardHeader className="match-module-header">
            <CardTitle>
              <span className="module-kicker">ZONA PRO</span>{" "}
              {access.reason === "missing" ? "Perfil no encontrado" : "Error de perfil"}
            </CardTitle>
            <CardSubtitle>
              No pudimos determinar tu plan en este momento.
            </CardSubtitle>
          </CardHeader>
          <CardBody>
            <div className="match-empty-state">
              <Badge
                tone={access.reason === "missing" ? "warning" : "danger"}
                className="text-[10px] tracking-wider uppercase"
              >
                {access.reason === "missing" ? "Perfil no encontrado" : "Error"}
              </Badge>
              <p className="mt-2 text-sm text-slate-300">
                No pudimos cargar tu plan. Intentá nuevamente más tarde.
              </p>
            </div>
            <Row className="mt-4">
              <LinkButton href={`/${sport}`} tone="outline" size="md">
                ← Volver a {sport === "soccer" ? "Fútbol" : sport}
              </LinkButton>
            </Row>
          </CardBody>
        </Card>
      </Stack>
    </Container>
  );
}

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
                  Los análisis del modelo, probabilidades y factores avanzados
                  estarán disponibles aquí.
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
              title="Probabilidades del Modelo"
              description="Dixon-Coles con factores de localía, forma y más."
            />
            <PremiumPreview
              title="Análisis Profundo"
              description="Insights detallados por partido y tendencias del modelo."
            />
          </div>
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

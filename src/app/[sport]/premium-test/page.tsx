import { redirect, notFound } from "next/navigation";
import { Container, Stack, Row } from "@/components/ui/container";
import { Card, CardBody, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { getHasSport } from "@/components/sports/sport-helpers";
import {
  getCurrentUser,
  requirePremium,
  AuthRequiredError,
  PremiumRequiredError,
} from "@/lib/auth/session";
import { parseSportId } from "@/lib/config/validation";

/**
 * Ruta premium de prueba (Sprint 3). El gating es 100% server-side:
 * ocultar botones en el frontend NO cuenta como seguridad.
 * - Sin sesión → redirect a /login?next=<ruta>
 * - FREE → estado upgrade (200, sin contenido premium)
 * - PREMIUM → contenido permitido
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

  let isPremium = false;
  try {
    await requirePremium();
    isPremium = true;
  } catch (err) {
    if (!(err instanceof PremiumRequiredError) && !(err instanceof AuthRequiredError)) throw err;
  }

  if (!isPremium) {
    return (
      <Container size="narrow" className="product-page">
        <Stack gap="lg" className="py-8">
          <Card className="match-panel">
            <CardHeader className="match-module-header">
              <CardTitle>
                <span className="module-kicker">PLAN FREE</span> Contenido Premium
              </CardTitle>
              <CardSubtitle>Tu plan actual no incluye esta sección.</CardSubtitle>
            </CardHeader>
            <CardBody>
              <div className="match-empty-state">
                Esta es una zona Premium de prueba. Los análisis avanzados, las
                probabilidades completas y los insights del modelo estarán
                disponibles con el plan Pro.
              </div>
              <Row className="mt-4">
                <LinkButton href={`/${sport}`} tone="outline" size="md">
                  ← Volver
                </LinkButton>
              </Row>
            </CardBody>
          </Card>
        </Stack>
      </Container>
    );
  }

  return (
    <Container size="narrow" className="product-page">
      <Stack gap="lg" className="py-8">
        <Card className="match-panel">
          <CardHeader className="match-module-header">
            <CardTitle>
              <span className="module-kicker">PREMIUM</span> Zona de prueba
            </CardTitle>
            <CardSubtitle>
              Acceso verificado server-side para {user.email ?? "tu cuenta"}.
            </CardSubtitle>
          </CardHeader>
          <CardBody>
            <div className="match-empty-state">
              <Badge tone="success">Pro activo</Badge>
              <p className="mt-2">
                Si ves esto, tu rol premium fue validado en el servidor. Aquí
                vivirán los análisis avanzados.
              </p>
            </div>
          </CardBody>
        </Card>
      </Stack>
    </Container>
  );
}

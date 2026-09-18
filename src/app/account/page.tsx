import { redirect } from "next/navigation";
import { Container, Stack } from "@/components/ui/container";
import { Card, CardBody, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { getCurrentUser, getCurrentProfile } from "@/lib/auth/session";
import { PlanBadge } from "@/components/auth/plan-badge";
import { LogoutButton } from "@/components/auth/logout-button";

/**
 * Página de cuenta. Server-rendered, 100% server-side auth.
 * - Sin sesión → redirect a /login?next=/account
 * - Profile ok FREE → badge FREE + CTA upgrade
 * - Profile ok PREMIUM → badge PRO + info plan
 * - Profile missing → estado de error (no asume Free)
 * - Profile error → estado de error (no asume Free)
 * - No permite editar role.
 */
export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?next=/account");
  }

  const result = await getCurrentProfile(user.id);

  if (result.status === "error") {
    return (
      <Container size="narrow" className="product-page">
        <Stack gap="lg" className="py-8">
          <Card className="match-panel">
            <CardHeader className="match-module-header">
              <CardTitle>
                <span className="module-kicker">MI CUENTA</span> Tu perfil
              </CardTitle>
              <CardSubtitle>
                Información de tu cuenta en NYVORX.
              </CardSubtitle>
            </CardHeader>
            <CardBody>
              <div className="space-y-4">
                <div className="match-empty-state">
                  <Badge tone="danger" className="text-[10px] tracking-wider uppercase">
                    Error de perfil
                  </Badge>
                  <p className="mt-2 text-sm text-slate-300">
                    No pudimos cargar tu plan. Intentá nuevamente.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <LinkButton href="/account" tone="outline" size="md">
                    Reintentar
                  </LinkButton>
                  <LinkButton href="/" tone="outline" size="md">
                    Volver al inicio
                  </LinkButton>
                  <LogoutButton />
                </div>
              </div>
            </CardBody>
          </Card>
        </Stack>
      </Container>
    );
  }

  if (result.status === "missing") {
    return (
      <Container size="narrow" className="product-page">
        <Stack gap="lg" className="py-8">
          <Card className="match-panel">
            <CardHeader className="match-module-header">
              <CardTitle>
                <span className="module-kicker">MI CUENTA</span> Tu perfil
              </CardTitle>
              <CardSubtitle>
                Información de tu cuenta en NYVORX.
              </CardSubtitle>
            </CardHeader>
            <CardBody>
              <div className="space-y-4">
                <div className="match-empty-state">
                  <Badge tone="warning" className="text-[10px] tracking-wider uppercase">
                    Perfil no encontrado
                  </Badge>
                  <p className="mt-2 text-sm text-slate-300">
                    Tu cuenta existe pero aún no tiene un perfil asociado. Si el problema persiste, contactá al soporte.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <LinkButton href="/" tone="outline" size="md">
                    Volver al inicio
                  </LinkButton>
                  <LogoutButton />
                </div>
              </div>
            </CardBody>
          </Card>
        </Stack>
      </Container>
    );
  }

  const { profile } = result;
  const isPremium = profile.role === "premium";

  return (
    <Container size="narrow" className="product-page">
      <Stack gap="lg" className="py-8">
        <Card className="match-panel match-intelligence-module">
          <CardHeader className="match-module-header">
            <CardTitle>
              <span className="module-kicker">MI CUENTA</span> Tu perfil
            </CardTitle>
            <CardSubtitle>
              Información de tu cuenta en NYVORX.
            </CardSubtitle>
          </CardHeader>
          <CardBody>
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm text-slate-400">Email</p>
                  <p className="text-sm font-medium text-slate-100">
                    {user.email ?? "—"}
                  </p>
                </div>
                <PlanBadge role={profile.role} />
              </div>

              <div className="border-t border-cyan-100/10 pt-4">
                <p className="text-sm text-slate-400">Plan actual</p>
                <p className="mt-1 text-sm font-medium text-slate-100">
                  {isPremium ? "NYVORX Pro" : "NYVORX Free"}
                </p>
                {isPremium ? (
                  <p className="mt-1 text-xs text-emerald-400">
                    Tu plan Pro está activo. Tenés acceso completo a todo el análisis del modelo.
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-slate-500">
                    Actualizate a Pro para desbloquear probabilidades completas, insights avanzados y herramientas Value/EV.
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3 border-t border-cyan-100/10 pt-4">
                {!isPremium ? (
                  <LinkButton href="/soccer/premium-test" tone="primary" size="md">
                    Conocé PRO
                  </LinkButton>
                ) : null}
                <LinkButton href="/" tone="outline" size="md">
                  Volver al inicio
                </LinkButton>
                <LogoutButton />
              </div>
            </div>
          </CardBody>
        </Card>
      </Stack>
    </Container>
  );
}

import { AuthForm } from "@/components/auth/auth-form";
import { loginAction } from "@/lib/auth/actions";
import { safeNextPath } from "@/lib/auth/redirects";
import { Container, Stack } from "@/components/ui/container";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next: rawNext } = await searchParams;
  const next = safeNextPath(rawNext);
  return (
    <Container size="narrow" className="product-page">
      <Stack gap="lg" className="items-center py-8">
        <AuthForm mode="login" action={loginAction} next={next} />
      </Stack>
    </Container>
  );
}

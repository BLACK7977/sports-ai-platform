"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/card";
import type { AuthActionState } from "@/lib/auth/actions";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

const initialState: AuthActionState = { ok: false, error: "" };

export function AuthForm({
  mode,
  action,
  next,
}: {
  mode: "login" | "register";
  action: (prevState: AuthActionState, formData: FormData) => Promise<AuthActionState>;
  next: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const isLogin = mode === "login";
  return (
    <Card className="match-panel w-full max-w-md">
      <CardHeader className="match-module-header">
        <CardTitle>
          <span className="module-kicker">{isLogin ? "INGRESAR" : "CREAR CUENTA"}</span>{" "}
          {isLogin ? "Bienvenido de nuevo" : "Empezá gratis"}
        </CardTitle>
        <CardSubtitle>
          {isLogin
            ? "Ingresá con tu email y contraseña."
            : "Tu plan inicial es Free. Sin tarjeta, sin pagos."}
        </CardSubtitle>
      </CardHeader>
      <CardBody>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <div>
            <label htmlFor="auth-email" className="match-report-label">Email</label>
            <input
              id="auth-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="vos@email.com"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="auth-password" className="match-report-label">Contraseña</label>
            <input
              id="auth-password"
              name="password"
              type="password"
              required
              minLength={6}
              autoComplete={isLogin ? "current-password" : "new-password"}
              placeholder="Mínimo 6 caracteres"
              className={inputClass}
            />
          </div>
          {!isLogin ? (
            <div>
              <label htmlFor="auth-confirm" className="match-report-label">Confirmar contraseña</label>
              <input
                id="auth-confirm"
                name="confirm"
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                placeholder="Repetí tu contraseña"
                className={inputClass}
              />
            </div>
          ) : null}
          {state.ok === false && state.error ? (
            <div className="match-empty-state match-ai-error" role="alert">{state.error}</div>
          ) : null}
          {state.ok === true && state.needsConfirmation ? (
            <div className="match-empty-state" role="status">
              Cuenta creada. Revisá tu email para confirmarla antes de ingresar.
            </div>
          ) : null}
          <Button type="submit" disabled={pending} size="md">
            {pending ? "Procesando…" : isLogin ? "Ingresar" : "Crear cuenta"}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

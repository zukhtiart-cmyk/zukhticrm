"use client";

import { useActionState } from "react";
import { login } from "./actions";

export function LoginForm({ subtitle = "Team workspace", next, footer }: { subtitle?: string; next?: string; footer?: React.ReactNode }) {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="h-display text-4xl">Zukhti Home</p>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
        </div>
        <form action={action} className="card space-y-4 p-6">
          {next && <input type="hidden" name="next" value={next} />}
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" name="email" type="email" autoComplete="email" required className="input" />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
          </div>
          {state?.error && <p className="rounded-lg bg-clay-soft px-3 py-2 text-sm text-clay">{state.error}</p>}
          <button className="btn-primary w-full" disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>
        {footer && <div className="mt-4 text-center text-xs text-muted">{footer}</div>}
      </div>
    </main>
  );
}

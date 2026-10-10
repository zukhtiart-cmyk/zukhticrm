"use client";

import { ErrorNote } from "@/components/feedback";
import { useActionState, useState } from "react";
import { login } from "./actions";
import { RoomSketch } from "@/components/room-sketch";
import { Spinner } from "@/components/feedback";

export function LoginForm({
  subtitle = "Team workspace",
  next,
  footer,
}: {
  subtitle?: string;
  next?: string;
  footer?: React.ReactNode;
}) {
  const [state, action, pending] = useActionState(login, undefined);
  // Keep the email after a wrong password, so only the password needs retyping.
  const [email, setEmail] = useState("");
  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <RoomSketch className="mx-auto mb-2 w-64 max-w-full" />
          <p
            className="h-display page-in text-4xl"
            style={{ animationDelay: ".3s" }}
          >
            Zukhti Home
          </p>
          <p
            className="page-in mt-1 text-sm text-muted"
            style={{ animationDelay: ".45s" }}
          >
            {subtitle}
          </p>
        </div>
        <form
          action={action}
          className="card page-in space-y-4 p-6"
          style={{ animationDelay: ".6s" }}
        >
          {next && <input type="hidden" name="next" value={next} />}
          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="input"
              placeholder="you@zukhti.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="input"
            />
          </div>
          {state?.error && (
            <ErrorNote key={state.error}>{state.error}</ErrorNote>
          )}
          <button className="btn-primary w-full py-3" disabled={pending}>
            {pending ? (
              <>
                <Spinner /> Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </button>
        </form>
        {footer && (
          <div className="mt-4 text-center text-xs text-muted">{footer}</div>
        )}
      </div>
    </main>
  );
}

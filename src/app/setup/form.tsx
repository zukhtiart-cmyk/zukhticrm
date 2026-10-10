"use client";

import { ErrorNote } from "@/components/feedback";
import { useActionState } from "react";
import { createFirstOwner } from "./actions";

export function SetupForm() {
  const [state, action, pending] = useActionState(createFirstOwner, undefined);
  return (
    <form action={action} className="card space-y-4 p-6">
      <div>
        <label className="label" htmlFor="code">
          Setup code
        </label>
        <input
          id="code"
          name="code"
          type="password"
          required
          className="input"
        />
        <p className="mt-1 text-xs text-muted">
          The AUTH_SECRET value you added in Vercel.
        </p>
      </div>
      <div>
        <label className="label" htmlFor="name">
          Your name
        </label>
        <input id="name" name="name" required className="input" />
      </div>
      <div>
        <label className="label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="input"
        />
      </div>
      <div>
        <label className="label" htmlFor="password">
          Password (8+ characters)
        </label>
        <input
          id="password"
          name="password"
          type="password"
          minLength={8}
          required
          className="input"
        />
      </div>
      {state?.error && (
        <ErrorNote
          key={state.error + String((state as { at?: number }).at ?? "")}
        >
          {state.error}
        </ErrorNote>
      )}
      <button className="btn-primary w-full" disabled={pending}>
        {pending ? "Creating…" : "Create owner account"}
      </button>
    </form>
  );
}

"use client";

import { useActionState, useEffect, useRef } from "react";
import { ErrorNote, Spinner, SuccessNote } from "./feedback";

type State = { error?: string; ok?: string; at?: number } | undefined;

/** A form bound to a server action that returns {error} or {ok}; shows the message and resets on success. */
export function ActionForm({
  action,
  children,
  submitLabel,
  className = "grid gap-3",
  reset = true,
  buttonClass = "btn-primary",
}: {
  action: (state: State, form: FormData) => Promise<State>;
  children: React.ReactNode;
  submitLabel: string;
  className?: string;
  reset?: boolean;
  buttonClass?: string;
}) {
  const [state, run, pending] = useActionState<State, FormData>(
    action,
    undefined,
  );
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && reset) ref.current?.reset();
  }, [state?.at, state?.ok, reset]);
  return (
    <form ref={ref} action={run} className={className}>
      {children}
      {state?.error && (
        <ErrorNote
          key={`e${state.at ?? state.error}`}
          className="sm:col-span-full"
        >
          {state.error}
        </ErrorNote>
      )}
      {state?.ok && (
        <SuccessNote
          key={`o${state.at ?? state.ok}`}
          className="sm:col-span-full"
        >
          {state.ok}
        </SuccessNote>
      )}
      <div className="sm:col-span-full">
        <button className={buttonClass} disabled={pending}>
          {pending ? (
            <>
              <Spinner /> Saving…
            </>
          ) : (
            submitLabel
          )}
        </button>
      </div>
    </form>
  );
}

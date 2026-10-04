"use client";

import { useActionState, useEffect, useRef } from "react";
import { reportSnag } from "./actions";

type S = { error?: string; ok?: string } | undefined;

export function ReportSnagForm({
  token,
  projectId,
}: {
  token: string;
  projectId: string;
}) {
  const [state, action, pending] = useActionState<S, FormData>(
    reportSnag as (s: S, f: FormData) => Promise<S>,
    undefined,
  );
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="grid gap-2">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="projectId" value={projectId} />
      <div className="grid gap-2 sm:grid-cols-[160px_1fr]">
        <input name="room" placeholder="Room" className="input" />
        <input
          name="description"
          required
          placeholder="What needs attention?"
          className="input"
        />
      </div>
      <input name="photo" type="file" accept="image/*" className="text-sm" />
      {state?.error && <p className="text-sm text-clay">{state.error}</p>}
      {state?.ok && <p className="text-sm text-olive">{state.ok}</p>}
      <div>
        <button className="btn-brass" disabled={pending}>
          {pending ? "Sending…" : "Report"}
        </button>
      </div>
    </form>
  );
}

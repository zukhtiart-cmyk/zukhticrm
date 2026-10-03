"use client";

import { useActionState, useState } from "react";
import { decideDesign } from "./actions";

export function DesignDecision({ token, projectId, designId }: { token: string; projectId: string; designId: string }) {
  const [mode, setMode] = useState<"idle" | "changes">("idle");
  const [state, action, pending] = useActionState(decideDesign, undefined);

  if (state?.ok) return <p className="mt-3 rounded-lg bg-olive-soft px-3 py-2 text-sm text-olive">{state.ok}</p>;

  return (
    <form action={action} className="mt-3 grid gap-2">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="designId" value={designId} />
      {mode === "changes" && <textarea name="comment" rows={3} required placeholder="What would you like changed?" className="input" autoFocus />}
      {mode === "idle" ? (
        <div className="grid grid-cols-2 gap-2">
          <button name="decision" value="approve" disabled={pending} className="btn-brass">
            {pending ? "Saving…" : "Approve"}
          </button>
          <button type="button" onClick={() => setMode("changes")} className="btn-ghost">
            Request changes
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button name="decision" value="changes" disabled={pending} className="btn-primary">
            {pending ? "Sending…" : "Send to designer"}
          </button>
          <button type="button" onClick={() => setMode("idle")} className="btn-ghost">
            Cancel
          </button>
        </div>
      )}
      {state?.error && <p className="text-sm text-clay">{state.error}</p>}
    </form>
  );
}

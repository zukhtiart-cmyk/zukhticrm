"use client";

import { useActionState, useEffect, useRef } from "react";
import { sendReply } from "../actions";

export function ReplyForm({ id, windowOpen, templateReady }: { id: string; windowOpen: boolean; templateReady: boolean }) {
  const [state, action, pending] = useActionState(sendReply, undefined);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);
  return (
    <form ref={form} action={action} className="card sticky bottom-20 grid gap-2 p-3 lg:bottom-4">
      <input type="hidden" name="id" value={id} />
      {!windowOpen && (
        <p className="rounded-lg bg-brass-soft px-3 py-2 text-xs text-brass">
          The client hasn&apos;t messaged in 24 hours. {templateReady ? "Your message will go out as your approved WhatsApp template." : "WhatsApp only allows replies within 24 hours unless a template is set up."}
        </p>
      )}
      <div className="flex items-end gap-2">
        <textarea name="text" rows={2} placeholder="Type a reply…" className="input" required />
        <button className="btn-primary shrink-0" disabled={pending}>
          {pending ? "Sending…" : "Send"}
        </button>
      </div>
      {state?.error && <p className="text-sm text-clay">{state.error}</p>}
      {state?.ok && <p className="text-sm text-olive">{state.ok}</p>}
    </form>
  );
}

"use client";

import { useActionState, useState } from "react";
import { Camera } from "lucide-react";
import { markFixed, type FormState } from "./actions";

export function FixForm({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(markFixed, undefined);
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-primary px-3 py-1.5 text-xs">
        Mark fixed
      </button>
    );
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <label className="flex cursor-pointer items-center gap-1 text-xs text-muted">
        <Camera size={14} /> After photo
        <input name="photo" type="file" accept="image/*" capture="environment" className="max-w-40 text-xs" />
      </label>
      <button className="btn-primary px-3 py-1.5 text-xs" disabled={pending}>
        {pending ? "Saving…" : "Confirm fixed"}
      </button>
      {state?.error && <span className="text-xs text-clay">{state.error}</span>}
    </form>
  );
}

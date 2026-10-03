"use client";

import { useActionState, useEffect, useRef } from "react";
import { uploadDesign } from "../../design-actions";

export function DesignUploadForm({ projectId, rooms }: { projectId: string; rooms: string[] }) {
  const form = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(uploadDesign, undefined);
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);
  return (
    <form ref={form} action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="projectId" value={projectId} />
      <div>
        <label className="label">Room</label>
        <input name="room" list="design-rooms" placeholder="e.g. Living" className="input" />
        <datalist id="design-rooms">
          {rooms.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
      </div>
      <div>
        <label className="label">Title</label>
        <input name="title" placeholder="e.g. 3D view – TV wall" required className="input" />
        <p className="mt-1 text-xs text-muted">Same room and title = saved as a new version.</p>
      </div>
      <div className="sm:col-span-2">
        <label className="label">Render or drawing (JPG, PNG, PDF)</label>
        <input name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required className="input" />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Note for the client (optional)</label>
        <textarea name="notes" rows={2} placeholder="e.g. Walnut veneer with brass inlay, warm cove lighting" className="input" />
      </div>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="share" defaultChecked className="h-4 w-4 accent-[var(--color-olive)]" />
        Share with the client for approval now
      </label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button className="btn-primary" disabled={pending}>
          {pending ? "Uploading…" : "Upload design"}
        </button>
        {state?.error && <span className="text-sm text-clay">{state.error}</span>}
        {state?.ok && <span className="text-sm text-olive">{state.ok}</span>}
      </div>
    </form>
  );
}

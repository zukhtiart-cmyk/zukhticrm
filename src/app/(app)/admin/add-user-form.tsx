"use client";

import { useActionState } from "react";
import { addUser } from "./actions";
import { roleLabels } from "@/lib/permissions";

export function AddUserForm({ offices, canAddOwner }: { offices: { id: string; name: string }[]; canAddOwner: boolean }) {
  const [state, action, pending] = useActionState(addUser, undefined);
  const roles = Object.entries(roleLabels).filter(([r]) => canAddOwner || r !== "OWNER");
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className="label">Name</label>
        <input name="name" required className="input" />
      </div>
      <div>
        <label className="label">Email</label>
        <input name="email" type="email" required className="input" />
      </div>
      <div>
        <label className="label">Role</label>
        <select name="role" className="input" defaultValue="SUPERVISOR">
          {roles.map(([r, l]) => (
            <option key={r} value={r}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Office</label>
        <select name="officeId" className="input">
          {offices.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Phone (optional)</label>
        <input name="phone" className="input" placeholder="+91…" />
      </div>
      <div>
        <label className="label">Temporary password</label>
        <input name="password" type="text" minLength={8} required className="input" />
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button className="btn-primary" disabled={pending}>
          {pending ? "Adding…" : "Add team member"}
        </button>
        {state?.error && <span className="text-sm text-clay">{state.error}</span>}
        {state?.ok && <span className="text-sm text-olive">{state.ok}</span>}
      </div>
    </form>
  );
}

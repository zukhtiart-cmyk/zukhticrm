"use client";

import { useActionState } from "react";
import { testAiConnection, type AiCheckResult } from "./ai-check-action";

export function AiCheck() {
  const [res, run, pending] = useActionState<AiCheckResult | null, FormData>(testAiConnection, null);
  return (
    <form action={run} className="grid gap-2">
      <div>
        <button className="btn-ghost" disabled={pending}>
          {pending ? "Testing…" : "Test AI connection"}
        </button>
      </div>
      {res && (
        <div className={`rounded-xl px-3 py-2 text-sm ${res.ok ? "bg-olive-soft text-olive" : "bg-clay-soft text-clay"}`}>
          <p className="font-semibold">{res.ok ? `✓ Claude is working (${res.model})` : `✗ Claude isn't working (${res.model})`}</p>
          <p className="text-xs">Key in use: {res.key}</p>
          {!res.ok && (
            <>
              <p className="mt-1 text-xs">
                Anthropic says{res.status ? ` (${res.status}${res.type ? `, ${res.type}` : ""})` : ""}: “{res.message}”
              </p>
              {res.hint && <p className="mt-1 text-xs font-semibold">{res.hint}</p>}
            </>
          )}
        </div>
      )}
    </form>
  );
}

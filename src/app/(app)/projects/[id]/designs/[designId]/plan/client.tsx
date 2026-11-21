"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { HomeScene } from "@/lib/home-scene";
import { saveHomeScene } from "../../../../design-actions";

const PlanEditor = dynamic(() => import("@/components/plan-editor/editor"), {
  ssr: false,
  loading: () => <div className="grid h-96 place-items-center rounded-2xl border border-line bg-white text-sm text-muted">Opening the plan…</div>,
});

export function PlanCheck({ projectId, designId, scene }: { projectId: string; designId: string; scene: HomeScene }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <PlanEditor
        initial={scene}
        saving={saving}
        onSave={async (s, build) => {
          setSaving(true);
          setError(null);
          try {
            const r = await saveHomeScene(projectId, designId, JSON.stringify(s));
            if (r.error) return setError(r.error);
            if (build) router.push(`/projects/${projectId}/designs/${r.id}/3d?new=1`);
            else if (r.id !== designId) router.replace(`/projects/${projectId}/designs/${r.id}/plan`);
          } finally {
            setSaving(false);
          }
        }}
      />
      {error && <p className="mt-2 text-sm text-clay">{error}</p>}
    </>
  );
}

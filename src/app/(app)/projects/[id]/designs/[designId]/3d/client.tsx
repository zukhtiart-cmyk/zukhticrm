"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Home3D } from "@/components/home3d/home-3d";
import type { HomeScene, InteriorStyle } from "@/lib/home-scene";
import { saveHomeSnapshot } from "../../../../design-actions";

export function StaffHome3D({ projectId, designId, scene, style, canEdit, needsSnapshot }: { projectId: string; designId: string; scene: HomeScene; style: InteriorStyle; canEdit: boolean; needsSnapshot: boolean }) {
  const router = useRouter();
  const sent = useRef(false);
  const [msg, setMsg] = useState<string | null>(null);
  const save = async (blob: Blob | null, s?: InteriorStyle) => {
    const f = new FormData();
    f.set("projectId", projectId);
    f.set("id", designId);
    if (s) f.set("style", s);
    if (blob) f.set("file", new File([blob], "home.jpg", { type: "image/jpeg" }));
    const r = await saveHomeSnapshot(f);
    if (r?.error) setMsg(r.error);
    else if (s) setMsg("Saved. The design picture now shows this look.");
    router.refresh();
  };
  return (
    <>
      <Home3D
        scene={scene}
        style={style}
        canChangeStyle
        onStyleSave={canEdit ? (s, blob) => save(blob, s) : undefined}
        onFirstFrame={
          canEdit && needsSnapshot
            ? (blob) => {
                if (sent.current) return;
                sent.current = true;
                void save(blob);
              }
            : undefined
        }
      />
      {msg && <p className="mt-2 text-sm text-olive">{msg}</p>}
    </>
  );
}

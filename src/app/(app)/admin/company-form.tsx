"use client";

import { useRef, useState, useTransition } from "react";
import { saveCompany } from "./actions";
import type { CompanyProfile } from "@/lib/settings";

/** Turns any logo picture (SVG, WebP, PNG, JPG) into a crisp PNG for the PDFs. */
async function toPng(file: File): Promise<File> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const w = img.naturalWidth || 1200,
      h = img.naturalHeight || 400;
    const k = Math.min(1, 1600 / Math.max(w, h)) * (file.type === "image/svg+xml" ? Math.max(1, 1200 / Math.max(w, h)) : 1);
    const c = document.createElement("canvas");
    c.width = Math.round(w * k);
    c.height = Math.round(h * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/png"));
    if (!blob) throw new Error("Couldn't read that logo.");
    return new File([blob], "logo.png", { type: "image/png" });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function CompanyForm({ company }: { company: CompanyProfile }) {
  const [preview, setPreview] = useState<string | null>(company.logoUrl);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const file = useRef<File | null>(null);

  return (
    <form
      action={(fd) =>
        start(async () => {
          setMsg(null);
          try {
            if (file.current) fd.set("logo", await toPng(file.current));
            else fd.delete("logo");
            await saveCompany(fd);
            setMsg("Saved.");
          } catch (e) {
            setMsg((e as Error).message);
          }
        })
      }
      className="grid gap-4 md:grid-cols-[220px_1fr]"
    >
      <label className="relative grid h-36 cursor-pointer place-items-center overflow-hidden rounded-2xl border-2 border-dashed border-line bg-white p-3 text-center text-xs text-muted hover:border-brass">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Logo" className="max-h-full max-w-full object-contain" />
        ) : (
          <span>
            <b className="block text-sm text-ink">Upload logo</b>PNG, JPG or SVG · transparent background looks best
          </span>
        )}
        <input
          type="file"
          name="logo"
          accept="image/png,image/jpeg,image/svg+xml,image/webp"
          className="absolute inset-0 opacity-0"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            file.current = f;
            if (f) setPreview(URL.createObjectURL(f));
          }}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Company name</label>
          <input name="name" defaultValue={company.name} className="input" />
        </div>
        <div>
          <label className="label">Tagline</label>
          <input name="tagline" defaultValue={company.tagline} placeholder="Turnkey interiors" className="input" />
        </div>
        <div>
          <label className="label">Website</label>
          <input name="website" defaultValue={company.website} className="input" />
        </div>
        <div>
          <label className="label">Email</label>
          <input name="email" defaultValue={company.email} className="input" />
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <button className="btn-primary" disabled={pending}>
            {pending ? "Saving…" : "Save letterhead"}
          </button>
          {company.logoUrl && (
            <label className="flex items-center gap-1.5 text-xs text-muted">
              <input type="checkbox" name="removeLogo" value="1" /> Remove logo
            </label>
          )}
          {msg && <span className="text-sm text-olive">{msg}</span>}
        </div>
      </div>
    </form>
  );
}

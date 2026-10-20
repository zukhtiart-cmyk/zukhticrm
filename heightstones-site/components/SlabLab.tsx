"use client";

import { useEffect, useState } from "react";
import { FINISHES, STONES, type FinishKey } from "@/lib/data";
import LiveStone from "./LiveStone";
import StoneSwatch from "./StoneSwatch";

const THICKNESS = [20, 30, 40, 50];

export type SampleRequest = { stone: string; finish: string; thickness: number; code: string };

export function sampleCode(stoneNo: string, finish: FinishKey, mm: number) {
  return `HS-${stoneNo}-${finish.slice(0, 3).toUpperCase()}-${mm}`;
}

export default function SlabLab({ initialStone = "indian-marble" }: { initialStone?: string }) {
  const [slug, setSlug] = useState(initialStone);
  const stone = STONES.find((s) => s.slug === slug) ?? STONES[0];
  const [finish, setFinish] = useState<FinishKey>(stone.finishes[0]);
  const [mm, setMm] = useState(30);

  // Keep the finish valid when switching to a stone that doesn't offer it.
  useEffect(() => {
    if (!stone.finishes.includes(finish)) setFinish(stone.finishes[0]);
  }, [stone, finish]);

  const f = stone.finishes.includes(finish) ? finish : stone.finishes[0];
  const code = sampleCode(stone.no, f, mm);

  const request = () => {
    const detail: SampleRequest = { stone: stone.plural, finish: FINISHES[f].name, thickness: mm, code };
    window.dispatchEvent(new CustomEvent("hs:sample", { detail }));
    document.getElementById("enquiry")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="lab">
      <div className="lab-stage">
        <div className="slab" style={{ ["--mm" as string]: mm }}>
          <LiveStone stone={stone} finish={f} seed={7} className="slab-face" />
          <StoneSwatch stone={stone} finish="sawn" seed={7} className="slab-edge" />
        </div>
        <p className="lab-hint mono">
          <span className="lamp" aria-hidden="true" /> Move the lamp across the slab
        </p>
      </div>

      <div className="lab-panel">
        <fieldset className="lab-group">
          <legend className="mono">01 · Stone</legend>
          <div className="lab-stones">
            {STONES.map((s) => (
              <label key={s.slug} className={`chip-stone ${s.slug === slug ? "is-on" : ""}`}>
                <input type="radio" name="lab-stone" value={s.slug} checked={s.slug === slug} onChange={() => setSlug(s.slug)} />
                <StoneSwatch stone={s} as="span" className="chip-dot" seed={5} />
                <span>{s.name}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="lab-group">
          <legend className="mono">02 · Finish</legend>
          <div className="seg">
            {stone.finishes.map((k) => (
              <label key={k} className={k === f ? "is-on" : ""}>
                <input type="radio" name="lab-finish" value={k} checked={k === f} onChange={() => setFinish(k)} />
                {FINISHES[k].name}
              </label>
            ))}
          </div>
          <p className="lab-note">{FINISHES[f].note}</p>
        </fieldset>

        <fieldset className="lab-group">
          <legend className="mono">03 · Thickness</legend>
          <div className="seg seg-mm">
            {THICKNESS.map((t) => (
              <label key={t} className={t === mm ? "is-on" : ""}>
                <input type="radio" name="lab-mm" value={t} checked={t === mm} onChange={() => setMm(t)} />
                {t}
                <small>mm</small>
              </label>
            ))}
          </div>
        </fieldset>

        <dl className="spec">
          <div>
            <dt>Specimen</dt>
            <dd className="mono">{code}</dd>
          </div>
          <div>
            <dt>Stone</dt>
            <dd>{stone.plural}</dd>
          </div>
          <div>
            <dt>Varieties</dt>
            <dd>{stone.varieties.slice(0, 4).join(", ")}…</dd>
          </div>
          <div>
            <dt>Best for</dt>
            <dd>{stone.uses.join(" · ")}</dd>
          </div>
        </dl>

        <button type="button" className="btn btn-ink" onClick={request}>
          <span>Request this sample</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13m-5-6 6 6-6 6" /></svg>
        </button>
      </div>
    </div>
  );
}

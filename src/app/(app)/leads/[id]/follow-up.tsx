"use client";

import { useState, useTransition } from "react";
import {
  draftLeadFollowUp,
  logManualFollowUp,
  sendLeadFollowUp,
} from "../actions";

function plusDays(n: number) {
  const d = new Date(Date.now() + n * 86400000);
  return d.toISOString().slice(0, 10);
}

export function FollowUpDraft({
  leadId,
  phone,
  whatsappLive,
}: {
  leadId: string;
  phone: string;
  whatsappLive: boolean;
}) {
  const [text, setText] = useState("");
  const [next, setNext] = useState(plusDays(3));
  const [note, setNote] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const waLink = `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;

  return (
    <div className="grid gap-3">
      <button
        type="button"
        className="btn-brass"
        disabled={busy}
        onClick={() =>
          start(async () => {
            setNote(null);
            const r = await draftLeadFollowUp(leadId);
            setText(r.text);
            if (!r.ai)
              setNote(
                "Template draft (AI not available) — personalise it before sending.",
              );
          })
        }
      >
        {busy && !text
          ? "Drafting…"
          : text
            ? "Redraft"
            : "✨ Draft a follow-up"}
      </button>
      {text && (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            className="input"
            aria-label="Message"
          />
          <div>
            <label className="label">Next follow-up</label>
            <input
              type="date"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              className="input"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {whatsappLive && (
              <button
                type="button"
                className="btn-primary"
                disabled={busy}
                onClick={() =>
                  start(async () => {
                    const r = await sendLeadFollowUp(leadId, text, next);
                    if ("error" in r) setNote(r.error ?? null);
                    else {
                      setNote(`WhatsApp: ${r.note}`);
                      if (r.status === "SENT") setText("");
                    }
                  })
                }
              >
                Send via WhatsApp
              </button>
            )}
            <a
              href={waLink}
              target="_blank"
              rel="noreferrer"
              className="btn-ghost"
              onClick={() =>
                start(async () => {
                  await logManualFollowUp(leadId, text, next);
                  setNote("Opened in WhatsApp and logged in history.");
                })
              }
            >
              Open in my WhatsApp
            </a>
          </div>
        </>
      )}
      {note && <p className="text-xs text-muted">{note}</p>}
    </div>
  );
}

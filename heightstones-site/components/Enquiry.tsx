"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ENQUIRY_EMAIL, PRODUCT_TYPES, SHIPMENTS } from "@/lib/data";
import type { SampleRequest } from "./SlabLab";

function mailto(subject: string, lines: string[]) {
  return `mailto:${ENQUIRY_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\n"))}`;
}

type Status = "idle" | "sending" | "sent" | "mailed" | "error";

// Posts to /api/enquiry, which emails the sales desk. If email isn't set up
// on the server (or is down), the enquiry opens in the visitor's mail app.
export default function Enquiry({ preset }: { preset?: string }) {
  const [product, setProduct] = useState(PRODUCT_TYPES[0]);
  const [shipment, setShipment] = useState(SHIPMENTS[0]);
  const [message, setMessage] = useState(preset ?? "");
  const [sample, setSample] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    // Gallery tiles link here with ?sample=<variety>.
    const fromUrl = new URLSearchParams(window.location.search).get("sample");
    if (fromUrl) {
      const s = fromUrl.slice(0, 200);
      setSample(s);
      setMessage(`I'd like prices and a sample of ${s}.`);
    }
    const on = (e: Event) => {
      const d = (e as CustomEvent<SampleRequest>).detail;
      setSample(`${d.stone}, ${d.finish.toLowerCase()}, ${d.thickness} mm (${d.code})`);
      setProduct(PRODUCT_TYPES[0]);
      setMessage(`I'd like a sample of ${d.stone}, ${d.finish.toLowerCase()} finish, ${d.thickness} mm (${d.code}).`);
      setStatus("idle");
    };
    window.addEventListener("hs:sample", on);
    return () => window.removeEventListener("hs:sample", on);
  }, []);

  const send = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const payload = { ...data, product, shipment, message, sample: sample ?? "" };
    setStatus("sending");
    setError("");
    try {
      const res = await fetch("/api/enquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const out = (await res.json().catch(() => ({}))) as { ok?: boolean; fallback?: boolean; error?: string };
      if (out.ok) {
        setStatus("sent");
        return;
      }
      if (!out.fallback) {
        setStatus("error");
        setError(out.error ?? "Something went wrong. Please try again.");
        return;
      }
    } catch {
      // Network trouble: fall through to the mail app.
    }
    const lines = [
      `Name: ${data.name}`,
      `Email: ${data.email}`,
      `Company: ${data.company || "-"}`,
      `Country: ${data.country || "-"}`,
      `Product: ${product}`,
      `Shipment: ${shipment}`,
      `Approx. quantity: ${data.qty || "-"}`,
      ...(sample ? [`Sample: ${sample}`] : []),
      "",
      message,
    ];
    window.location.href = mailto(`${sample ? "Sample request" : "Enquiry"}: ${product} (${data.name})`, lines);
    setStatus("mailed");
  };

  if (status === "sent") {
    return (
      <div className="enquiry-done" role="status">
        <p className="display">
          Thank you. <em>It&rsquo;s with our desk.</em>
        </p>
        <p className="sec-lede">
          We reply within one working day with prices{sample ? " and sample details" : ""}. If it&rsquo;s urgent, call Jaipur on{" "}
          <a href="tel:+918888344442" className="wipe">+91 88883 44442</a>.
        </p>
        <button type="button" className="link-line" onClick={() => setStatus("idle")}>Send another enquiry</button>
      </div>
    );
  }

  return (
    <form className="enquiry" onSubmit={send}>
      {sample && (
        <p className="enquiry-sample mono">
          <span>Sample</span> {sample}
          <button type="button" onClick={() => setSample(null)} aria-label="Remove sample">
            ×
          </button>
        </p>
      )}

      <fieldset className="pick">
        <legend>What are you building with?</legend>
        <div>
          {PRODUCT_TYPES.map((p) => (
            <label key={p} className={p === product ? "is-on" : ""}>
              <input type="radio" name="product" value={p} checked={p === product} onChange={() => setProduct(p)} />
              {p}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="pick">
        <legend>How should it travel?</legend>
        <div>
          {SHIPMENTS.map((s) => (
            <label key={s} className={s === shipment ? "is-on" : ""}>
              <input type="radio" name="shipment" value={s} checked={s === shipment} onChange={() => setShipment(s)} />
              {s}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="hp" aria-hidden="true">
        Leave this empty
        <input name="website" tabIndex={-1} autoComplete="off" />
      </label>

      <div className="fields">
        <label className="field">
          <span>Your name</span>
          <input name="name" required autoComplete="name" />
        </label>
        <label className="field">
          <span>Email</span>
          <input name="email" type="email" required autoComplete="email" />
        </label>
        <label className="field">
          <span>Company <i>optional</i></span>
          <input name="company" autoComplete="organization" />
        </label>
        <label className="field">
          <span>Country</span>
          <input name="country" autoComplete="country-name" />
        </label>
        <label className="field field-wide">
          <span>Approx. quantity <i>m², pieces or containers</i></span>
          <input name="qty" />
        </label>
        <label className="field field-wide">
          <span>Tell us about the project</span>
          <textarea name="message" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />
        </label>
      </div>

      <div className="enquiry-foot">
        <button className="btn btn-ochre" type="submit" disabled={status === "sending"}>
          <span>{status === "sending" ? "Sending…" : "Get stone prices"}</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13m-5-6 6 6-6 6" /></svg>
        </button>
        <p className="mono" aria-live="polite">
          {status === "mailed"
            ? "Your mail app should open with the enquiry ready to send."
            : status === "error"
              ? error
              : "We reply within one working day."}
        </p>
      </div>
    </form>
  );
}

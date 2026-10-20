import { NextResponse } from "next/server";
import { ENQUIRY_EMAIL, PRODUCT_TYPES, SHIPMENTS } from "@/lib/data";

// Emails an enquiry to the sales desk through Resend (https://resend.com).
// Needs RESEND_API_KEY. ENQUIRY_TO (comma-separated) and ENQUIRY_FROM are
// optional; FROM must be on a domain verified in Resend, e.g.
// "Height Stones <website@heightstones.com>". Without a key the route answers
// 503 + fallback, and the form hands the enquiry to the visitor's mail app.

const LIMITS = { name: 120, email: 200, company: 160, country: 80, qty: 160, sample: 200, message: 4000 } as const;
type Field = keyof typeof LIMITS;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function clean(v: unknown, max: number) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function oneLine(s: string) {
  return s.replace(/[\r\n]+/g, " ");
}

function escape(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export async function POST(req: Request) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return NextResponse.json({ ok: false, fallback: true }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }

  // Honeypot: people never see this field, bots fill it in.
  if (clean(body.website, 200)) return NextResponse.json({ ok: true });

  const f = Object.fromEntries((Object.keys(LIMITS) as Field[]).map((k) => [k, clean(body[k], LIMITS[k])])) as Record<Field, string>;
  if (!f.name || !EMAIL.test(f.email)) {
    return NextResponse.json({ ok: false, error: "Please add your name and a valid email address." }, { status: 422 });
  }
  const product = PRODUCT_TYPES.includes(String(body.product)) ? String(body.product) : PRODUCT_TYPES[0];
  const shipment = SHIPMENTS.includes(String(body.shipment)) ? String(body.shipment) : SHIPMENTS[0];

  const rows: [string, string][] = [
    ["Name", f.name],
    ["Email", f.email],
    ["Company", f.company || "-"],
    ["Country", f.country || "-"],
    ["Product", product],
    ["Shipment", shipment],
    ["Approx. quantity", f.qty || "-"],
    ...(f.sample ? ([["Sample", f.sample]] as [string, string][]) : []),
  ];
  const text = `${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\n${f.message}`;
  const html = `<table cellpadding="6" style="font-family:sans-serif;font-size:14px;border-collapse:collapse">${rows
    .map(([k, v]) => `<tr><td style="color:#564e46">${k}</td><td><b>${escape(v)}</b></td></tr>`)
    .join("")}</table><p style="font-family:sans-serif;font-size:14px;white-space:pre-wrap">${escape(f.message)}</p>`;

  const subject = oneLine(`${f.sample ? "Sample request" : "Website enquiry"}: ${product} — ${f.name}${f.country ? ` (${f.country})` : ""}`);
  const to = (process.env.ENQUIRY_TO || ENQUIRY_EMAIL).split(",").map((s) => s.trim()).filter(Boolean);
  const from = process.env.ENQUIRY_FROM || "Height Stones website <onboarding@resend.dev>";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, reply_to: f.email, subject, text, html }),
    });
    if (!res.ok) {
      console.error("enquiry: resend failed", res.status, await res.text());
      return NextResponse.json({ ok: false, fallback: true }, { status: 502 });
    }
  } catch (err) {
    console.error("enquiry: resend unreachable", err);
    return NextResponse.json({ ok: false, fallback: true }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}

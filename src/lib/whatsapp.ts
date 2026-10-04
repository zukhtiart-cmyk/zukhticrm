import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { get } from "@vercel/blob";

/**
 * WhatsApp Business Cloud API (Meta).
 * Required env: WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID.
 * Webhook env: WHATSAPP_VERIFY_TOKEN (you choose it), WHATSAPP_APP_SECRET (from the Meta app).
 * Template env (messages outside the 24-hour window): WHATSAPP_TEMPLATE_NAME, WHATSAPP_TEMPLATE_LANG.
 */
const GRAPH = () => (process.env.WHATSAPP_GRAPH_URL || "https://graph.facebook.com/v21.0").replace(/\/$/, "");

export function whatsappConfigured() {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

export function templateConfigured() {
  return Boolean(process.env.WHATSAPP_TEMPLATE_NAME);
}

/** Digits only, e.g. "+91 98200-11111" → "919820011111" */
export function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "");
}

/** Last 10 digits, used to match numbers saved with or without a country code. */
export function phoneKey(phone: string) {
  return normalizePhone(phone).slice(-10);
}

async function graph(path: string, init: RequestInit) {
  const res = await fetch(`${GRAPH()}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, ...(init.headers ?? {}) },
  });
  const json = (await res.json().catch(() => null)) as { error?: { message?: string; code?: number }; messages?: { id: string }[]; id?: string; url?: string } | null;
  if (!res.ok) throw new Error(json?.error?.message ?? `WhatsApp error ${res.status}`);
  return json ?? {};
}

async function sendMessage(to: string, body: Record<string, unknown>) {
  const json = await graph(`${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: normalizePhone(to), ...body }),
  });
  return json.messages?.[0]?.id ?? null;
}

export function sendText(to: string, text: string) {
  return sendMessage(to, { type: "text", text: { body: text.slice(0, 4096), preview_url: true } });
}

/**
 * Sends an image. Public URLs are sent as links; files from a private store
 * (/files/…) are uploaded to WhatsApp first because WhatsApp can't open them.
 */
export async function sendImage(to: string, url: string, appUrl: string, caption?: string) {
  if (url.startsWith("/files/")) {
    const result = await get(url.slice("/files/".length), { access: "private" });
    if (!result || result.statusCode !== 200) throw new Error("Photo not found");
    const bytes = await new Response(result.stream).blob();
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", result.blob.contentType || "image/jpeg");
    form.append("file", new File([bytes], "photo.jpg", { type: result.blob.contentType || "image/jpeg" }));
    const media = await graph(`${process.env.WHATSAPP_PHONE_NUMBER_ID}/media`, { method: "POST", body: form });
    return sendMessage(to, { type: "image", image: { id: media.id, caption } });
  }
  const link = url.startsWith("http") ? url : `${appUrl}${url}`;
  return sendMessage(to, { type: "image", image: { link, caption } });
}

/**
 * Approved template for messages outside the 24-hour window.
 * Expected template body with two variables, e.g.:
 *   "Hello {{1}}, here is an update from Zukhti Home: {{2}}"
 */
export function sendTemplate(to: string, firstName: string, message: string) {
  const clean = (s: string) => s.replace(/\s*\n+\s*/g, " · ").replace(/\s{2,}/g, " ").trim();
  return sendMessage(to, {
    type: "template",
    template: {
      name: process.env.WHATSAPP_TEMPLATE_NAME,
      language: { code: process.env.WHATSAPP_TEMPLATE_LANG || "en" },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: clean(firstName).slice(0, 60) || "there" },
            { type: "text", text: clean(message).slice(0, 900) },
          ],
        },
      ],
    },
  });
}

export async function markRead(messageId: string) {
  try {
    await graph(`${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: messageId }),
    });
  } catch {
    // Not important if this fails.
  }
}

/** Downloads media a client sent (voice note, photo). */
export async function downloadMedia(mediaId: string) {
  const meta = await graph(mediaId, { method: "GET" });
  if (!meta.url) throw new Error("Media URL missing");
  const res = await fetch(meta.url, { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } });
  if (!res.ok) throw new Error(`Media download failed (${res.status})`);
  return res.blob();
}

/** Checks Meta's X-Hub-Signature-256 header against the raw body. */
export function validSignature(rawBody: string, header: string | null) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const given = header.slice(7);
  return given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

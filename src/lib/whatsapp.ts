import "server-only";

const GRAPH = "https://graph.facebook.com/v21.0";

export function whatsappConfigured() {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

async function send(to: string, body: Record<string, unknown>) {
  const res = await fetch(`${GRAPH}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: to.replace(/\D/g, ""), ...body }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(err?.error?.message ?? `WhatsApp error ${res.status}`);
  }
}

/**
 * Sends a client update: the text, then each photo.
 * Returns a short status string stored on the update.
 * Note: free-form messages only reach clients who messaged you in the last 24 hours;
 * outside that window WhatsApp requires an approved template (Phase 3).
 */
export async function sendClientUpdate(to: string, text: string, photoUrls: string[], appUrl: string): Promise<string> {
  if (!whatsappConfigured()) return "queued — WhatsApp not connected yet";
  try {
    await send(to, { type: "text", text: { body: text, preview_url: false } });
    for (const url of photoUrls.slice(0, 5)) {
      const link = url.startsWith("http") ? url : `${appUrl}${url}`;
      await send(to, { type: "image", image: { link } });
    }
    return "sent on WhatsApp";
  } catch (e) {
    return `failed: ${(e as Error).message}`.slice(0, 200);
  }
}

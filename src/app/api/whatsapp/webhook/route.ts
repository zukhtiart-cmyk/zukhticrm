import { after, NextResponse } from "next/server";
import { handleInbound, type InboundMessage } from "@/lib/wa-inbound";
import { validSignature } from "@/lib/whatsapp";

export const maxDuration = 60;

/** Meta calls this once when you save the webhook URL, to check the verify token. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token && process.env.WHATSAPP_VERIFY_TOKEN && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

type WebhookBody = {
  object?: string;
  entry?: { changes?: { field?: string; value?: { contacts?: { wa_id: string; profile?: { name?: string } }[]; messages?: InboundMessage[] } }[] }[];
};

/** Incoming messages. Answers Meta immediately, then processes in the background. */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!validSignature(raw, req.headers.get("x-hub-signature-256"))) {
    return new Response("Invalid signature", { status: 401 });
  }
  let body: WebhookBody;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const appUrl = (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");
  const jobs: { msg: InboundMessage; name: string | null }[] = [];
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      for (const msg of value?.messages ?? []) {
        const name = value?.contacts?.find((c) => c.wa_id === msg.from)?.profile?.name ?? null;
        jobs.push({ msg, name });
      }
    }
  }
  if (jobs.length) {
    after(async () => {
      for (const { msg, name } of jobs) {
        try {
          await handleInbound(msg, name, appUrl);
        } catch (e) {
          console.error("whatsapp inbound failed", msg.id, e);
        }
      }
    });
  }
  return NextResponse.json({ ok: true });
}

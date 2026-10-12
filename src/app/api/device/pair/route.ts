import { NextResponse } from "next/server";
import { pairDevice } from "@/lib/devices";

/** The device sends the 6-digit code from the Team page once and gets its secret key. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    code?: string;
    firmware?: string;
  };
  const out = await pairDevice(String(body.code ?? ""), body.firmware);
  if ("error" in out)
    return NextResponse.json({ error: out.error }, { status: 400 });
  return NextResponse.json(out);
}

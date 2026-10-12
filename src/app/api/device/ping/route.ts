import { NextResponse } from "next/server";
import { deviceFromRequest } from "@/lib/devices";

/** A quiet check-in so the Team page shows the device as online and its battery. */
export async function GET(req: Request) {
  const d = await deviceFromRequest(req);
  if (!d) return NextResponse.json({ error: "Not paired" }, { status: 401 });
  return NextResponse.json({ ok: true });
}

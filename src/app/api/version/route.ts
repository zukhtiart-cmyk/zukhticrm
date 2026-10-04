import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** The live build's id, so open pages can tell when a newer version has been deployed. */
export function GET() {
  return NextResponse.json({ v: process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || "dev" }, { headers: { "Cache-Control": "no-store" } });
}

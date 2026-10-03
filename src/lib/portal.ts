import "server-only";
import { randomBytes } from "node:crypto";
import { headers } from "next/headers";

export function newPortalToken() {
  return randomBytes(24).toString("base64url");
}

/** Base URL of the running app, from the request (works on Vercel and locally). */
export async function appBaseUrl() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
}

export function portalPath(token: string) {
  return `/portal/${token}`;
}

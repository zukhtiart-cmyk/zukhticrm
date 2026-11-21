import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/** Short-lived signed links so MeltFlex can fetch one of our pictures (our file store is private). */
const key = () => process.env.AUTH_SECRET ?? "";
export function signSource(id: string, ttlSec = 3600) {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const sig = createHmac("sha256", key()).update(`render-src:${id}:${exp}`).digest("hex").slice(0, 40);
  return `exp=${exp}&sig=${sig}`;
}
export function checkSource(id: string, exp: string | null, sig: string | null) {
  if (!exp || !sig || !key()) return false;
  if (Number(exp) < Date.now() / 1000) return false;
  const want = createHmac("sha256", key()).update(`render-src:${id}:${exp}`).digest("hex").slice(0, 40);
  return want.length === sig.length && timingSafeEqual(Buffer.from(want), Buffer.from(sig));
}

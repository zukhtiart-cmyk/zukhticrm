import "server-only";
import crypto from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { db, devices, users } from "@/db";
import { can } from "./permissions";
import {
  EMPTY_CONV,
  staffTurn,
  type Conv,
  type ConvState,
} from "./staff-conversation";

/**
 * Zuki desk devices. A device is created for one staff member on the Team page, which shows a
 * 6-digit code. The device sends that code once and gets a secret key back; from then on it talks
 * to Zuki as that person, with that person's permissions.
 */

const CODE_MINUTES = 30;
const CONVO_EXPIRE_MS = 3 * 3600 * 1000;
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export function newPairingCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}
export const pairingExpiry = () =>
  new Date(Date.now() + CODE_MINUTES * 60 * 1000);

/** Swap a pairing code for the device's secret key. */
export async function pairDevice(code: string, firmware?: string) {
  const clean = code.replace(/\D/g, "");
  if (clean.length !== 6)
    return { error: "Enter the 6-digit code from the Team page." };
  const dev = await db.query.devices.findFirst({
    where: and(
      eq(devices.pairingCode, clean),
      eq(devices.active, true),
      gt(devices.pairingExpiresAt, new Date()),
    ),
    with: { user: true },
  });
  if (!dev)
    return {
      error:
        "That code isn't valid or has expired. Make a new one on the Team page.",
    };
  const token = crypto.randomBytes(32).toString("hex");
  await db
    .update(devices)
    .set({
      tokenHash: sha(token),
      pairingCode: null,
      pairingExpiresAt: null,
      pairedAt: new Date(),
      lastSeenAt: new Date(),
      firmware: firmware?.slice(0, 40) ?? null,
    })
    .where(eq(devices.id, dev.id));
  return {
    token,
    device: { id: dev.id, name: dev.name },
    user: { name: dev.user.name },
  };
}

/** The device and its staff member, from "Authorization: Bearer <key>". Also records battery and last seen. */
export async function deviceFromRequest(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (token.length < 32) return null;
  const dev = await db.query.devices.findFirst({
    where: and(eq(devices.tokenHash, sha(token)), eq(devices.active, true)),
  });
  if (!dev) return null;
  const user = await db.query.users.findFirst({
    where: eq(users.id, dev.userId),
  });
  if (!user || !user.active || !can(user.role, "voice")) return null;
  const battery = Number(req.headers.get("x-battery"));
  const firmware = req.headers.get("x-firmware");
  await db
    .update(devices)
    .set({
      lastSeenAt: new Date(),
      ...(Number.isFinite(battery) && battery >= 0 && battery <= 100
        ? { battery: Math.round(battery) }
        : {}),
      ...(firmware ? { firmware: firmware.slice(0, 40) } : {}),
    })
    .where(eq(devices.id, dev.id));
  return { device: dev, user };
}

type Dev = NonNullable<Awaited<ReturnType<typeof deviceFromRequest>>>;

function loadConv(dev: Dev["device"]): Conv {
  const fresh =
    !!dev.stateUpdatedAt &&
    Date.now() - dev.stateUpdatedAt.getTime() < CONVO_EXPIRE_MS;
  return fresh
    ? {
        state: { ...EMPTY_CONV, ...(dev.state as Partial<ConvState>) },
        awaiting: dev.awaitingConfirm,
      }
    : { state: { ...EMPTY_CONV }, awaiting: false };
}

/** One spoken turn on the device: same conversation as WhatsApp, saved per device. */
export async function deviceTurn(d: Dev, text: string, appUrl: string) {
  const out = await staffTurn(d.user, loadConv(d.device), {
    text,
    channel: "device",
    appUrl,
  });
  await db
    .update(devices)
    .set({
      state: out.next.state,
      awaitingConfirm: out.next.awaiting,
      stateUpdatedAt: new Date(),
    })
    .where(eq(devices.id, d.device.id));
  return out;
}

export async function resetDeviceConversation(id: string) {
  await db
    .update(devices)
    .set({ state: {}, awaitingConfirm: false, stateUpdatedAt: null })
    .where(eq(devices.id, id));
}

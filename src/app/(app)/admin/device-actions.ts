"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, devices, users } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import {
  newPairingCode,
  pairingExpiry,
  resetDeviceConversation,
} from "@/lib/devices";

export async function addDevice(form: FormData) {
  await requireUser("admin");
  const data = z
    .object({
      userId: z.string().min(1),
      name: z.string().trim().max(40).optional(),
    })
    .parse(Object.fromEntries(form));
  const user = await db.query.users.findFirst({
    where: eq(users.id, data.userId),
  });
  if (!user || !can(user.role, "voice"))
    throw new Error("Pick a team member who can use Zuki.");
  await db.insert(devices).values({
    userId: user.id,
    name: data.name || `${user.name.split(" ")[0]}'s Zuki`,
    pairingCode: newPairingCode(),
    pairingExpiresAt: pairingExpiry(),
  });
  revalidatePath("/admin");
}

/** A fresh code — to pair the device again (e.g. after a reset) or hand it to someone else. */
export async function newDeviceCode(form: FormData) {
  await requireUser("admin");
  const id = String(form.get("id"));
  await db
    .update(devices)
    .set({
      pairingCode: newPairingCode(),
      pairingExpiresAt: pairingExpiry(),
      tokenHash: null,
    })
    .where(eq(devices.id, id));
  revalidatePath("/admin");
}

export async function removeDevice(form: FormData) {
  await requireUser("admin");
  await db.delete(devices).where(eq(devices.id, String(form.get("id"))));
  revalidatePath("/admin");
}

export async function clearDeviceChat(form: FormData) {
  await requireUser("admin");
  await resetDeviceConversation(String(form.get("id")));
  revalidatePath("/admin");
}

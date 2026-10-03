"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireUser } from "@/lib/auth";
import { applyVoiceUpdate, type ConfirmInput } from "@/lib/voice-apply";

export async function confirmVoiceUpdate(input: ConfirmInput) {
  const user = await requireUser("voice");
  const h = await headers();
  const appUrl = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const res = await applyVoiceUpdate(user, input, appUrl);
  if (res.ok) {
    revalidatePath(`/projects/${res.projectId}`, "layout");
    revalidatePath("/");
  }
  return res;
}

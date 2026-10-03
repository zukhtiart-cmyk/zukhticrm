import "server-only";
import { put } from "@vercel/blob";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Saves an uploaded file and returns a public URL.
 * Production: Vercel Blob (set BLOB_READ_WRITE_TOKEN).
 * Local development without a token: public/uploads.
 */
export async function saveFile(file: File, folder: string) {
  const ext = (file.name.split(".").pop() || file.type.split("/")[1] || "bin").replace(/[^a-z0-9]/gi, "").slice(0, 5);
  const key = `${folder}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(key, file, { access: "public", contentType: file.type || undefined });
    return blob.url;
  }
  if (process.env.VERCEL) throw new Error("Photo storage is not set up. Add BLOB_READ_WRITE_TOKEN in Vercel.");

  const dest = path.join(process.cwd(), "public", "uploads", key);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, Buffer.from(await file.arrayBuffer()));
  return `/uploads/${key}`;
}

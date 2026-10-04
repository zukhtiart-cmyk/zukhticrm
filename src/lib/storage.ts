import "server-only";
import { put } from "@vercel/blob";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/** Set once we learn the connected Blob store is private. */
let storeIsPrivate = process.env.BLOB_ACCESS === "private";

/**
 * Saves an uploaded file and returns a URL the app can show.
 * Production: Vercel Blob. Works with both public and private stores:
 * - public store → the blob's own public URL
 * - private store → an app URL under /files/…, served with access checks
 * Local development without Blob: public/uploads.
 */
export async function saveFile(file: File, folder: string) {
  const ext = (file.name.split(".").pop() || file.type.split("/")[1] || "bin").replace(/[^a-z0-9]/gi, "").slice(0, 5);
  const key = `${folder}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const contentType = file.type || undefined;

  if (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID) {
    if (!storeIsPrivate) {
      try {
        const blob = await put(key, file, { access: "public", contentType });
        return blob.url;
      } catch (e) {
        if (!/private/i.test((e as Error).message)) throw new Error(`Photo storage error: ${(e as Error).message}`);
        storeIsPrivate = true;
      }
    }
    const blob = await put(key, file, { access: "private", contentType });
    return `/files/${blob.pathname}`;
  }
  if (process.env.VERCEL) throw new Error("Photo storage is not set up. Connect a Blob store to this project in Vercel → Storage.");

  const dest = path.join(process.cwd(), "public", "uploads", key);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, Buffer.from(await file.arrayBuffer()));
  return `/uploads/${key}`;
}

/** Adds the portal token to private file links so clients can open them from the portal. */
export function portalFileUrl(url: string, token: string) {
  return url.startsWith("/files/") ? `${url}?t=${encodeURIComponent(token)}` : url;
}

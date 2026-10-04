"use client";

/** Updates captured with no signal, kept on the phone (IndexedDB) until they can be sent. */
export type QueuedUpdate = {
  id: string;
  projectId: string;
  projectName: string;
  typed: string;
  audio: Blob | null;
  photos: Blob[];
  createdAt: number;
};

const DB = "zukhti-desk";
const STORE = "queue";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => {
      db.close();
      resolve(req.result);
    };
    t.onerror = () => reject(t.error);
  });
}

export const queue = {
  supported: () => typeof indexedDB !== "undefined",
  add: (u: QueuedUpdate) => tx("readwrite", (s) => s.put(u)),
  remove: (id: string) => tx("readwrite", (s) => s.delete(id)),
  list: async () => ((await tx("readonly", (s) => s.getAll())) as QueuedUpdate[]).sort((a, b) => a.createdAt - b.createdAt),
};

/** True when a fetch failed because there's no connection (not a server error). */
export function isNetworkError(e: unknown) {
  return (typeof navigator !== "undefined" && !navigator.onLine) || e instanceof TypeError;
}

/** Distance in metres between two coordinates. */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

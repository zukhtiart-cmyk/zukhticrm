import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pg?: ReturnType<typeof postgres> };

const client =
  globalForDb.pg ??
  postgres(process.env.DATABASE_URL!, {
    // Serverless-friendly: small pool, works with Neon/Supabase poolers.
    max: process.env.NODE_ENV === "production" ? 5 : 10,
    prepare: false,
  });

if (process.env.NODE_ENV !== "production") globalForDb.pg = client;

export const db = drizzle(client, { schema });
export * from "./schema";

import { defineConfig } from "drizzle-kit";

// Migrations prefer a direct (unpooled) connection. The Vercel–Neon integration
// sets DATABASE_URL_UNPOOLED / POSTGRES_URL_NON_POOLING automatically, so no extra setup is needed.
const url =
  process.env.DIRECT_URL ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL;

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: url! },
});

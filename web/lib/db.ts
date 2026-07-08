import { Pool } from "pg";
import { DATABASE_URL } from "./env";

declare global {
  // eslint-disable-next-line no-var
  var _pool: Pool | undefined;
}

// Hosted Postgres (Neon/Supabase) requires SSL; local Docker does not.
const isLocal =
  DATABASE_URL.includes("localhost") || DATABASE_URL.includes("127.0.0.1");

export const pool =
  global._pool ??
  new Pool({
    connectionString: DATABASE_URL,
    max: 5,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
  });

if (process.env.NODE_ENV !== "production") global._pool = pool;

export function toVector(embedding: number[]): string {
  return "[" + embedding.join(",") + "]";
}

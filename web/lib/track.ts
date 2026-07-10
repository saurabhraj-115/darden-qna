import { pool } from "./db";

// Fire-and-forget visit logging — never let analytics break a request.
export async function logVisit(
  kind: "view" | "search" | "ask",
  detail: string | null = null,
  country: string | null = null
) {
  try {
    await pool.query(
      "insert into visits (kind, detail, country) values ($1, $2, $3)",
      [kind, detail ? detail.slice(0, 200) : null, country]
    );
  } catch {
    // swallow — tracking is best-effort
  }
}

import { config } from "dotenv";
import path from "path";

// Secrets live in the project-root .env (shared with the Python ingest side),
// not in web/. Load it once, server-side.
config({ path: path.resolve(process.cwd(), "..", ".env") });

export const DATABASE_URL = process.env.DATABASE_URL!;
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
export const PROJECT_ROOT = path.resolve(process.cwd(), "..");

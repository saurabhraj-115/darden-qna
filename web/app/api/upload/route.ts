import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import { PROJECT_ROOT } from "@/lib/env";
import { pool } from "@/lib/db";

export const runtime = "nodejs";

function slug(name: string) {
  return name
    .replace(/\.txt$/i, "")
    .replace(/[^\w\- ]+/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 80);
}

// Upload spawns the Python pipeline and writes to disk — impossible on
// serverless hosting, and unsafe as a public write endpoint. Disabled in prod.
const UPLOAD_DISABLED =
  process.env.NEXT_PUBLIC_READONLY === "1" || !!process.env.VERCEL;

export async function POST(req: NextRequest) {
  if (UPLOAD_DISABLED) {
    return NextResponse.json({ error: "Uploads are disabled." }, { status: 403 });
  }
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !file.name.endsWith(".txt")) {
    return NextResponse.json({ error: "expected a .txt export" }, { status: 400 });
  }

  const stem = slug(file.name);
  const raw = path.join(PROJECT_ROOT, "data", "raw", `${stem}.txt`);
  await fs.writeFile(raw, Buffer.from(await file.arrayBuffer()));

  const log = path.join(PROJECT_ROOT, "data", "processed", `${stem}.log`);
  const out = await fs.open(log, "w");
  const child = spawn("python3", ["ingest/run.py", raw], {
    cwd: PROJECT_ROOT,
    stdio: ["ignore", out.fd, out.fd],
    detached: true,
  });
  child.on("close", () => out.close());
  child.unref();

  return NextResponse.json({ stem, status: "processing" }, { status: 202 });
}

// Poll for completion: how many Q&A pairs the group has landed so far.
export async function GET(req: NextRequest) {
  const stem = req.nextUrl.searchParams.get("stem");
  if (!stem) return NextResponse.json({ error: "stem required" }, { status: 400 });
  const { rows } = await pool.query(
    'select count(*)::int as pairs from qa_pairs where "group" = $1',
    [stem]
  );
  return NextResponse.json({ stem, pairs: rows[0].pairs });
}

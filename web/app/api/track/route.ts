import { NextRequest, NextResponse } from "next/server";
import { logVisit } from "@/lib/track";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const country = req.headers.get("x-vercel-ip-country");
  await logVisit("view", body.path ?? null, country);
  return NextResponse.json({ ok: true });
}

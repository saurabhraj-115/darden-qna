import { NextRequest, NextResponse } from "next/server";
import { embedQuery } from "@/lib/openai";
import { toVector } from "@/lib/db";
import { searchQA } from "@/lib/qa";
import { logVisit } from "@/lib/track";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ results: [] });
  const sort = req.nextUrl.searchParams.get("sort") === "recent" ? "recent" : "match";
  await logVisit("search", q, req.headers.get("x-vercel-ip-country"));
  const vec = toVector(await embedQuery(q));
  const results = await searchQA(vec, sort);
  return NextResponse.json({ results });
}

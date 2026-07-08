import { NextRequest, NextResponse } from "next/server";
import { suggest } from "@/lib/qa";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) return NextResponse.json({ suggestions: [] });
  const suggestions = await suggest(q);
  return NextResponse.json({ suggestions });
}

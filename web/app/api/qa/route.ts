import { NextRequest, NextResponse } from "next/server";
import { pairsByCategory, subtopicsForCategory } from "@/lib/qa";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const category = req.nextUrl.searchParams.get("category")?.trim();
  const topic = req.nextUrl.searchParams.get("topic")?.trim() || null;
  const sort = req.nextUrl.searchParams.get("sort") === "recent" ? "recent" : "top";
  if (!category) return NextResponse.json({ results: [], subtopics: [] });
  const [results, subtopics] = await Promise.all([
    pairsByCategory(category, topic, sort),
    subtopicsForCategory(category),
  ]);
  return NextResponse.json({ results, subtopics });
}

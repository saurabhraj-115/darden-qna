import { NextResponse } from "next/server";
import { listCategories, listGroups, stats } from "@/lib/qa";

export const runtime = "nodejs";

export async function GET() {
  const [categories, groups, s] = await Promise.all([
    listCategories(),
    listGroups(),
    stats(),
  ]);
  return NextResponse.json({ categories, groups, stats: s });
}

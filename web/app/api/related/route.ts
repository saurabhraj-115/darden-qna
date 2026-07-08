import { NextRequest, NextResponse } from "next/server";
import { relatedVariants } from "@/lib/qa";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ variants: [] });
  const variants = await relatedVariants(id);
  return NextResponse.json({ variants });
}

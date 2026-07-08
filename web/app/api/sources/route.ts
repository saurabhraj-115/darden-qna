import { NextRequest, NextResponse } from "next/server";
import { sourceMessages } from "@/lib/qa";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  const group = req.nextUrl.searchParams.get("group") ?? "";
  if (!id || !group) return NextResponse.json({ messages: [] });
  const messages = await sourceMessages(group, id);
  return NextResponse.json({ messages });
}

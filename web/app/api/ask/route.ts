import { NextRequest, NextResponse } from "next/server";
import { pairContext } from "@/lib/qa";
import { chat, ChatMsg } from "@/lib/openai";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const id = Number(body.id);
  const question = String(body.question ?? "").trim();
  const history: ChatMsg[] = Array.isArray(body.history) ? body.history : [];
  if (!id || !question) {
    return NextResponse.json({ error: "id and question required" }, { status: 400 });
  }

  const ctx = await pairContext(id);
  if (!ctx) return NextResponse.json({ error: "not found" }, { status: 404 });

  const transcript = ctx.messages
    .map((m: any) => `${m.sender}: ${m.message}`)
    .join("\n");

  const system: ChatMsg = {
    role: "system",
    content:
      "You answer follow-up questions about one topic discussed in a UVA " +
      "Darden student WhatsApp group. Use ONLY the context below — a summarized " +
      "Q&A and the original chat messages it came from. If the answer isn't in " +
      "the context, say you don't know and suggest asking the group directly. " +
      "Be concise and practical.\n\n" +
      `ORIGINAL QUESTION:\n${ctx.question}\n\n` +
      `SUMMARIZED ANSWER:\n${ctx.answer}\n\n` +
      `ORIGINAL CHAT MESSAGES:\n${transcript}`,
  };

  const answer = await chat([
    system,
    ...history.slice(-8),
    { role: "user", content: question },
  ]);
  return NextResponse.json({ answer });
}

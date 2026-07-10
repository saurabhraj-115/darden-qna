import { NextRequest, NextResponse } from "next/server";
import { pairContext } from "@/lib/qa";
import { chat, ChatMsg } from "@/lib/openai";
import { logVisit } from "@/lib/track";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const id = Number(body.id);
  const question = String(body.question ?? "").trim();
  const history: ChatMsg[] = Array.isArray(body.history) ? body.history : [];
  if (!id || !question) {
    return NextResponse.json({ error: "id and question required" }, { status: 400 });
  }
  await logVisit("ask", question, req.headers.get("x-vercel-ip-country"));

  const ctx = await pairContext(id);
  if (!ctx) return NextResponse.json({ error: "not found" }, { status: 404 });

  const transcript = ctx.messages
    .map((m: any) => {
      const t = new Date(m.ts).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
      return `[${t}] ${m.sender}: ${m.message}`;
    })
    .join("\n");

  const system: ChatMsg = {
    role: "system",
    content:
      "You help incoming UVA Darden MBA students by answering follow-up " +
      "questions about ONE topic from their WhatsApp group. You are given the " +
      "summarized Q&A and the original chat messages, each prefixed with its " +
      "timestamp.\n" +
      "- Answer from this context, and reason over it when useful: compute time " +
      "differences between messages, compare, count, quote, or summarize.\n" +
      "- If the context genuinely doesn't cover what they asked, say so briefly " +
      "and suggest asking the group.\n" +
      "- Politely decline general-knowledge questions unrelated to this topic.\n" +
      "Be concise and practical.\n\n" +
      `ORIGINAL QUESTION:\n${ctx.question}\n\n` +
      `SUMMARIZED ANSWER:\n${ctx.answer}\n\n` +
      `ORIGINAL CHAT MESSAGES (with timestamps):\n${transcript}`,
  };

  const answer = await chat([
    system,
    ...history.slice(-8),
    { role: "user", content: question },
  ]);
  return NextResponse.json({ answer });
}

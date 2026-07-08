import OpenAI from "openai";
import { OPENAI_API_KEY } from "./env";

const client = new OpenAI({ apiKey: OPENAI_API_KEY });

export async function embedQuery(text: string): Promise<number[]> {
  const resp = await client.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return resp.data[0].embedding;
}

export type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

export async function chat(messages: ChatMsg[]): Promise<string> {
  const resp = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages,
  });
  return resp.choices[0].message.content ?? "";
}

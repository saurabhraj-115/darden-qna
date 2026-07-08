"use client";

import { useState } from "react";
import type { QAPair } from "@/lib/types";
import { categoryMeta, CategoryKey } from "@/lib/taxonomy";

const pretty = (g: string) => g.replace(/_/g, " ").trim();

// Relative freshness of an answer, with a tier used to colour the dot.
function freshness(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  let label: string;
  if (days < 7) label = "this week";
  else if (days < 31) label = "this month";
  else if (days < 365) label = `${Math.max(1, Math.round(days / 30))} mo ago`;
  else {
    const y = Math.floor(days / 365);
    label = `${y} yr${y > 1 ? "s" : ""} ago`;
  }
  const tier = days <= 31 ? "fresh" : days <= 180 ? "recent" : "old";
  return { label, tier };
}

type Src = { sender: string; ts: string; message: string };
type Variant = { question: string; group: string };

export default function ResultCard({
  pair,
  onCategory,
}: {
  pair: QAPair;
  onCategory: (c: CategoryKey) => void;
}) {
  const [open, setOpen] = useState<"none" | "sources" | "related" | "ask">(
    "none"
  );
  const [sources, setSources] = useState<Src[] | null>(null);
  const [variants, setVariants] = useState<Variant[] | null>(null);
  const [chat, setChat] = useState<{ role: "user" | "assistant"; content: string }[]>(
    []
  );
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const cat = categoryMeta(pair.category);

  async function sendFollowup() {
    const q = input.trim();
    if (!q || sending) return;
    const history = chat;
    setChat([...history, { role: "user", content: q }]);
    setInput("");
    setSending(true);
    try {
      const r = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: pair.id, question: q, history }),
      }).then((r) => r.json());
      setChat((c) => [
        ...c,
        { role: "assistant", content: r.answer ?? r.error ?? "Something went wrong." },
      ]);
    } finally {
      setSending(false);
    }
  }

  async function toggleSources() {
    if (open === "sources") return setOpen("none");
    if (sources === null) {
      const r = await fetch(
        `/api/sources?id=${pair.id}&group=${encodeURIComponent(pair.group)}`
      ).then((r) => r.json());
      setSources(r.messages);
    }
    setOpen("sources");
  }

  async function toggleRelated() {
    if (open === "related") return setOpen("none");
    if (variants === null) {
      const r = await fetch(`/api/related?id=${pair.id}`).then((r) => r.json());
      setVariants(r.variants);
    }
    setOpen("related");
  }

  return (
    <div className="card">
      <h3>{pair.question}</h3>
      <p className="answer">{pair.answer}</p>
      <div className="meta">
        <button className="cat-chip" onClick={() => onCategory(pair.category)}>
          <span>{cat.icon}</span>
          {cat.label}
        </button>
        <button
          className="ask-btn"
          onClick={() => setOpen(open === "ask" ? "none" : "ask")}
        >
          💬 Ask a follow-up
        </button>
        <span className="spacer" />
        {pair.similarity !== undefined && (
          <span className="sim">{Math.round(pair.similarity * 100)}% match</span>
        )}
        {pair.date &&
          (() => {
            const f = freshness(pair.date);
            return (
              <span
                className={`freshness ${f.tier}`}
                title={new Date(pair.date).toLocaleDateString()}
              >
                <span className="fdot" />
                {f.label}
              </span>
            );
          })()}
        <span className="badge">{pretty(pair.group)}</span>
        {pair.relatedCount > 0 && (
          <>
            <span className="dot">·</span>
            <button className="link" onClick={toggleRelated}>
              {open === "related" ? "hide" : `${pair.relatedCount} related`}
            </button>
          </>
        )}
        {pair.sourceCount > 0 && (
          <>
            <span className="dot">·</span>
            <button className="link" onClick={toggleSources}>
              {open === "sources"
                ? "hide"
                : `${pair.sourceCount} source${pair.sourceCount > 1 ? "s" : ""}`}
            </button>
          </>
        )}
      </div>

      {open === "sources" && sources && (
        <div className="drawer">
          {sources.map((s, i) => (
            <div key={i} className="src">
              <span className="who">{s.sender}</span>
              <span className="when">{new Date(s.ts).toLocaleDateString()}</span>
              <div>{s.message}</div>
            </div>
          ))}
        </div>
      )}
      {open === "related" && variants && (
        <div className="drawer">
          {variants.map((v, i) => (
            <div key={i} className="variant">
              {v.question}
            </div>
          ))}
        </div>
      )}
      {open === "ask" && (
        <div className="drawer chat">
          {chat.length === 0 && (
            <div className="chat-hint">
              Ask anything about this answer — grounded in the original chat.
            </div>
          )}
          {chat.map((m, i) => (
            <div key={i} className={`chat-turn ${m.role}`}>
              {m.content}
            </div>
          ))}
          {sending && <div className="chat-turn assistant typing">Thinking…</div>}
          <div className="chat-input">
            <input
              autoFocus
              placeholder="e.g. Does that apply to 2-bedrooms too?"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendFollowup()}
            />
            <button onClick={sendFollowup} disabled={sending || !input.trim()}>
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

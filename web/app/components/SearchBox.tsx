"use client";

import { useEffect, useRef, useState } from "react";
import { categoryMeta, CategoryKey } from "@/lib/taxonomy";

type Suggestion = { question: string; category: CategoryKey };

export default function SearchBox({
  value,
  onChange,
  onSubmit,
  variant = "compact",
  inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (term: string) => void;
  variant?: "hero" | "compact";
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const localRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? localRef;
  const seq = useRef(0);

  // debounced suggestion fetch
  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) {
      setItems([]);
      return;
    }
    const id = ++seq.current;
    const t = setTimeout(async () => {
      const r = await fetch(`/api/suggest?q=${encodeURIComponent(q)}`).then((r) =>
        r.json()
      );
      if (id === seq.current) {
        setItems(r.suggestions);
        setActive(-1);
      }
    }, 130);
    return () => clearTimeout(t);
  }, [value]);

  function choose(term: string) {
    setOpen(false);
    setItems([]);
    onSubmit(term);
    ref.current?.blur();
  }

  function onKey(e: React.KeyboardEvent) {
    if (!open || !items.length) {
      if (e.key === "Enter") choose(value);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a <= 0 ? items.length - 1 : a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(active >= 0 ? items[active].question : value);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const showList = open && items.length > 0;

  return (
    <div className={`suggest-wrap ${variant}`}>
      <div className={`searchbox ${variant}`}>
        <Magnifier />
        <input
          ref={ref}
          placeholder={
            variant === "hero"
              ? "Ask anything — housing, visas, orientation, courses…"
              : "Search…   ( / )"
          }
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKey}
        />
        {value && (
          <button className="clear" onMouseDown={(e) => e.preventDefault()} onClick={() => onChange("")}>
            ×
          </button>
        )}
      </div>

      {showList && (
        <ul className="suggestions">
          {items.map((s, i) => {
            const cat = categoryMeta(s.category);
            return (
              <li
                key={i}
                className={`suggestion ${i === active ? "active" : ""}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(s.question);
                }}
              >
                <span className="s-icon">{cat.icon}</span>
                <span className="s-q">{s.question}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Magnifier() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

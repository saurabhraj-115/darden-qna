"use client";

import type { CategoryCard } from "@/lib/types";
import { CategoryKey } from "@/lib/taxonomy";

export default function CategoryGrid({
  categories,
  onOpen,
}: {
  categories: CategoryCard[];
  onOpen: (key: CategoryKey) => void;
}) {
  return (
    <div className="grid">
      {categories.map((c) => (
        <button key={c.key} className="tile" onClick={() => onOpen(c.key)}>
          <div className="tile-top">
            <span className="tile-icon">{c.icon}</span>
            <span className="tile-title">{c.label}</span>
            <span className="tile-count">{c.count}</span>
          </div>
          <div className="tile-sample">{c.sample ?? c.blurb}</div>
        </button>
      ))}
    </div>
  );
}

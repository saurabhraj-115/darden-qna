"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import CategoryGrid from "./components/CategoryGrid";
import ResultCard from "./components/ResultCard";
import SearchBox from "./components/SearchBox";
import { CategoryKey, categoryMeta } from "@/lib/taxonomy";
import type { CategoryCard, QAPair, Stats } from "@/lib/types";

type View = "home" | "category" | "search";
type Sub = { name: string; count: number };
type Group = { group: string; messages: number; pairs: number };

const pretty = (g: string) => g.replace(/_/g, " ").trim();

const EXAMPLES = [
  "When do Ivy leases open?",
  "Do I sign a lease before my visa?",
  "How much is health insurance?",
  "Launch week and orientation dates",
  "Best bank for international students",
];

export default function Page() {
  const [view, setView] = useState<View>("home");
  const [categories, setCategories] = useState<CategoryCard[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [results, setResults] = useState<QAPair[]>([]);
  const [subtopics, setSubtopics] = useState<Sub[]>([]);
  const [activeCat, setActiveCat] = useState<CategoryKey | null>(null);
  const [activeSub, setActiveSub] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [searchSort, setSearchSort] = useState<"match" | "recent">("match");
  const [catSort, setCatSort] = useState<"top" | "recent">("top");
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadHome = useCallback(async () => {
    const r = await fetch("/api/categories").then((r) => r.json());
    setCategories(r.categories);
    setGroups(r.groups);
    setStats(r.stats);
  }, []);

  const goHome = useCallback(() => {
    setView("home");
    setActiveCat(null);
    setActiveSub(null);
    setQuery("");
    setSubmitted("");
  }, []);

  const openCategory = useCallback(
    async (
      key: CategoryKey,
      topic: string | null = null,
      sort: "top" | "recent" = "top"
    ) => {
      setLoading(true);
      setView("category");
      setActiveCat(key);
      setActiveSub(topic);
      setCatSort(sort);
      setQuery("");
      const url =
        `/api/qa?category=${key}&sort=${sort}` +
        (topic ? `&topic=${encodeURIComponent(topic)}` : "");
      const r = await fetch(url).then((r) => r.json());
      setResults(r.results);
      setSubtopics(r.subtopics);
      setLoading(false);
    },
    []
  );

  // Takes the term explicitly — no reliance on the query state closure.
  const runSearch = useCallback(
    async (term: string, sort: "match" | "recent" = "match") => {
      const q = term.trim();
      if (!q) return goHome();
      setQuery(q);
      setSubmitted(q);
      setSearchSort(sort);
      setLoading(true);
      setView("search");
      setActiveCat(null);
      const r = await fetch(
        `/api/search?q=${encodeURIComponent(q)}&sort=${sort}`
      ).then((r) => r.json());
      setResults(r.results);
      setLoading(false);
    },
    [goHome]
  );

  useEffect(() => {
    loadHome();
    // record a page view (best-effort)
    fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "home" }),
    }).catch(() => {});
  }, [loadHome]);

  useEffect(() => {
    const saved = (localStorage.getItem("theme") as "light" | "dark") || null;
    if (saved) {
      setTheme(saved);
      document.documentElement.setAttribute("data-theme", saved);
    }
  }, []);
  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "/" && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      } else if (e.key === "Escape" && !query) {
        goHome();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [query, goHome]);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: fd }).then(
      (r) => r.json()
    );
    e.target.value = "";
    if (res.error) return alert(res.error);
    alert(
      `Processing "${file.name}". Extraction runs in the background (a few ` +
        `minutes) — categories refresh automatically when it's done.`
    );
    const timer = setInterval(async () => {
      const s = await fetch(
        `/api/upload?stem=${encodeURIComponent(res.stem)}`
      ).then((r) => r.json());
      if (s.pairs > 0) {
        clearInterval(timer);
        loadHome();
      }
    }, 8000);
  }

  const catMeta = activeCat ? categoryMeta(activeCat) : null;

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <button className="brand" onClick={goHome}>
            Darden <span>Q&amp;A</span>
          </button>
          {view !== "home" && (
            <SearchBox
              value={query}
              onChange={setQuery}
              onSubmit={runSearch}
              variant="compact"
              inputRef={inputRef}
            />
          )}
          <div className="actions">
            {process.env.NEXT_PUBLIC_READONLY !== "1" && (
              <>
                <input id="up" type="file" accept=".txt" hidden onChange={onUpload} />
                <label className="iconbtn" htmlFor="up">
                  + Add export
                </label>
              </>
            )}
            <button className="iconbtn" onClick={toggleTheme} title="Toggle theme">
              {theme === "dark" ? "☀︎" : "☾"}
            </button>
          </div>
        </div>
      </header>

      <main className="page">
        {view === "home" && (
          <>
            <section className="hero">
              <h1 className="hero-h">What does the class already know?</h1>
              <p className="hero-sub">
                Answers pulled from the Darden WhatsApp groups — browse a category
                or ask a question.
              </p>
              <SearchBox
                value={query}
                onChange={setQuery}
                onSubmit={runSearch}
                variant="hero"
                inputRef={inputRef}
              />
              <div className="examples">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    className="example"
                    onClick={() => runSearch(ex)}
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </section>
            <CategoryGrid categories={categories} onOpen={openCategory} />

            {groups.length > 0 && (
              <section className="sources">
                <div className="sources-label">
                  Sourced from {groups.length} WhatsApp group
                  {groups.length > 1 ? "s" : ""}
                </div>
                <div className="source-chips">
                  {groups.map((g) => (
                    <span key={g.group} className="source-chip">
                      <span className="src-name">{pretty(g.group)}</span>
                      <span className="src-n">{g.pairs} answers</span>
                    </span>
                  ))}
                </div>
              </section>
            )}

            {stats && (
              <p className="stats" style={{ marginTop: 20, textAlign: "center" }}>
                <b>{stats.pairs}</b> answers · <b>{stats.messages}</b> messages ·{" "}
                <b>{stats.groups}</b> groups · <b>{stats.categories}</b> categories
              </p>
            )}
          </>
        )}

        {view === "category" && catMeta && (
          <>
            <button className="back" onClick={goHome}>
              ← All categories
            </button>
            <div className="section-head">
              <span className="big">{catMeta.icon}</span>
              <h2>{catMeta.label}</h2>
            </div>
            <div className="head-row">
              <p className="section-sub">{catMeta.blurb}</p>
              <SortToggle
                options={[
                  ["top", "Top"],
                  ["recent", "Most recent"],
                ]}
                value={catSort}
                onChange={(s) =>
                  openCategory(activeCat!, activeSub, s as "top" | "recent")
                }
              />
            </div>
            <div className="subchips">
              <button
                className={`subchip ${!activeSub ? "active" : ""}`}
                onClick={() => openCategory(activeCat!, null)}
              >
                All
              </button>
              {subtopics.map((s) => (
                <button
                  key={s.name}
                  className={`subchip ${activeSub === s.name ? "active" : ""}`}
                  onClick={() => openCategory(activeCat!, s.name)}
                >
                  {s.name}
                  <span className="n">{s.count}</span>
                </button>
              ))}
            </div>
            <Results loading={loading} results={results} onCategory={openCategory} />
          </>
        )}

        {view === "search" && (
          <>
            <button className="back" onClick={goHome}>
              ← Home
            </button>
            <div className="section-head">
              <h2>“{submitted}”</h2>
            </div>
            <div className="head-row">
              <p className="section-sub">
                {loading
                  ? "Searching…"
                  : `${results.length} answers · ${
                      searchSort === "recent" ? "most recent first" : "best match first"
                    }`}
              </p>
              <SortToggle
                options={[
                  ["match", "Best match"],
                  ["recent", "Most recent"],
                ]}
                value={searchSort}
                onChange={(s) => runSearch(submitted, s as "match" | "recent")}
              />
            </div>
            <Results loading={loading} results={results} onCategory={openCategory} />
          </>
        )}
      </main>
    </>
  );
}

function SortToggle({
  options,
  value,
  onChange,
}: {
  options: [string, string][];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="sort-toggle">
      {options.map(([key, label]) => (
        <button
          key={key}
          className={`sort-opt ${value === key ? "active" : ""}`}
          onClick={() => value !== key && onChange(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Results({
  loading,
  results,
  onCategory,
}: {
  loading: boolean;
  results: QAPair[];
  onCategory: (c: CategoryKey) => void;
}) {
  if (loading) {
    return (
      <div className="cards">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton" />
        ))}
      </div>
    );
  }
  if (!results.length) {
    return (
      <div className="empty">
        No answers here yet. Try a different search or category.
      </div>
    );
  }
  return (
    <div className="cards">
      {results.map((r) => (
        <ResultCard key={r.id} pair={r} onCategory={onCategory} />
      ))}
    </div>
  );
}

import json
import re
from pathlib import Path

import embed  # reuse connect() + OpenAI client

CATEGORY_JSON = Path("web/lib/topic-categories.json")

# key -> description used only to steer the one-time LLM classification.
CATEGORIES = {
    "housing": "housing, apartments, leases, subleases, roommates, parking, utilities, furniture",
    "visa": "visas, immigration, I-20, DS-160, SEVIS, SSN, sponsorship, work authorization (OPT/CPT), passports, IELTS/TOEFL for admission",
    "money": "tuition, fees, loans, scholarships, banking, credit cards, payments, financial aid, cost of living, currency",
    "health": "health insurance, immunizations, vaccines, TB tests, medical requirements, healthcare",
    "academics": "courses, classes, academic calendar, exams, faculty, laptops, software, IT, note-taking, study tools",
    "career": "recruiting, internships, jobs, networking, alumni, consulting, employment",
    "moving": "moving, flights, travel, transportation, shopping, groceries, logistics, luggage",
    "orientation": "orientation, launch week, Darden Before Darden, deadlines, dates, timeline, webinars, onboarding events",
    "community": "clubs, sports, gym, social life, meetups, food/dining, music, outdoors, hobbies, misc",
}
DEFAULT_CATEGORY = "community"

# Tie-break priority for a pair's single headline category — mirrors
# web/lib/taxonomy.ts. Specific domains beat the generic money/community buckets.
PRIORITY = [
    "visa", "housing", "health", "academics", "career",
    "orientation", "moving", "money", "community",
]

# Answers that are really non-answers — narration, deferrals, "no info".
NON_ANSWER = re.compile(
    r"has not received|have not received|no clear answer|no (specific )?answer|"
    r"does not (provide|specify|mention|answer|indicate)|do not (provide|specify)|"
    r"not (specified|mentioned|provided|clear|sure|available|answered)|"
    r"would try to|yet to (hear|receive|be)|couldn'?t find|could not find|"
    r"wasn'?t able|was not able|no response|did not (say|specify|respond)|"
    r"unclear|unanswered|no one (answered|responded)",
    re.IGNORECASE,
)


def classify_topics(names):
    prompt = (
        "Assign each WhatsApp topic tag (from incoming UVA Darden MBA students) to "
        "exactly one category key. Categories:\n"
        + "\n".join(f"- {k}: {v}" for k, v in CATEGORIES.items())
        + '\n\nReturn JSON {"map": {"<tag>": "<category key>", ...}} covering every '
        "tag. Use only the keys above.\n\nTags:\n" + "\n".join(names)
    )
    resp = embed.client.chat.completions.create(
        model="gpt-4o-mini",
        temperature=0,
        response_format={"type": "json_object"},
        messages=[{"role": "user", "content": prompt}],
    )
    raw = json.loads(resp.choices[0].message.content).get("map", {})
    return {
        n: (raw.get(n) if raw.get(n) in CATEGORIES else DEFAULT_CATEGORY)
        for n in names
    }


def categorize(conn):
    mapping = {}
    if CATEGORY_JSON.exists():
        mapping = json.loads(CATEGORY_JSON.read_text("utf-8"))

    names = [r[0] for r in conn.execute("select name from topics").fetchall()]
    missing = [n for n in names if n not in mapping]
    if missing:
        print(f"categorize: classifying {len(missing)} new topic(s)")
        mapping.update(classify_topics(missing))
        CATEGORY_JSON.parent.mkdir(parents=True, exist_ok=True)
        CATEGORY_JSON.write_text(
            json.dumps(dict(sorted(mapping.items())), indent=2, ensure_ascii=False),
            "utf-8",
        )

    with conn.cursor() as cur:
        for name in names:
            cur.execute(
                "update topics set category = %s where name = %s",
                (mapping.get(name, DEFAULT_CATEGORY), name),
            )
    counts = conn.execute(
        "select category, count(*) from topics group by category order by 2 desc"
    ).fetchall()
    print("categorize:", ", ".join(f"{c}={n}" for c, n in counts))


def set_primary_categories(conn):
    # Each pair gets ONE headline category (mode of its topics' categories,
    # tie-broken by PRIORITY) so counts and drilldowns are consistent.
    rows = conn.execute(
        """
        select p.id,
               coalesce(array_agg(t.category) filter (where t.category is not null), '{}')
        from qa_pairs p
        left join qa_topics qt on qt.qa_id = p.id
        left join topics t on t.id = qt.topic_id
        group by p.id
        """
    ).fetchall()

    def pick(cats):
        if not cats:
            return DEFAULT_CATEGORY
        counts = {}
        for c in cats:
            counts[c] = counts.get(c, 0) + 1
        best, best_n = DEFAULT_CATEGORY, -1
        for key in PRIORITY:
            n = counts.get(key, 0)
            if n > best_n:
                best_n, best = n, key
        return best

    with conn.cursor() as cur:
        for pid, cats in rows:
            cur.execute(
                "update qa_pairs set category = %s where id = %s", (pick(cats), pid)
            )


def flag_nonanswers(conn):
    rows = conn.execute("select id, answer from qa_pairs").fetchall()
    hide = [r[0] for r in rows if NON_ANSWER.search(r[1] or "")]
    with conn.cursor() as cur:
        cur.execute("update qa_pairs set hidden = false")
        if hide:
            cur.execute("update qa_pairs set hidden = true where id = any(%s)", (hide,))
    print(f"flag_nonanswers: hid {len(hide)} of {len(rows)} pairs")


def _find(parent, x):
    while parent[x] != x:
        parent[x] = parent[parent[x]]
        x = parent[x]
    return x


def dedup(conn):
    conn.execute("update qa_pairs set canonical_id = null")
    # candidate near-duplicate edges among visible pairs
    edges = conn.execute(
        """
        select a.id, b.id, (a."group" = b."group") as same_group,
               1 - (a.embedding <=> b.embedding) as sim
        from qa_pairs a
        join qa_pairs b on a.id < b.id
        where a.hidden = false and b.hidden = false
          and (1 - (a.embedding <=> b.embedding)) >= 0.90
        """
    ).fetchall()

    parent = {}

    def add(x):
        parent.setdefault(x, x)

    for aid, bid, same_group, sim in edges:
        if sim >= (0.90 if same_group else 0.93):
            add(aid)
            add(bid)
            parent[_find(parent, aid)] = _find(parent, bid)

    clusters = {}
    for node in parent:
        clusters.setdefault(_find(parent, node), []).append(node)

    dupes = 0
    with conn.cursor() as cur:
        for members in clusters.values():
            if len(members) < 2:
                continue
            meta = conn.execute(
                "select id, confidence, length(answer) from qa_pairs "
                "where id = any(%s)",
                (members,),
            ).fetchall()
            # canonical = highest confidence, then longest answer, then lowest id
            canon = max(meta, key=lambda m: (m[1], m[2], -m[0]))[0]
            others = [m[0] for m in meta if m[0] != canon]
            cur.execute(
                "update qa_pairs set canonical_id = %s where id = any(%s)",
                (canon, others),
            )
            dupes += len(others)
    print(f"dedup: merged {dupes} duplicate(s) into {sum(1 for m in clusters.values() if len(m) > 1)} cluster(s)")


def refine(conn):
    categorize(conn)
    set_primary_categories(conn)
    flag_nonanswers(conn)  # before dedup so hidden pairs never become canonical
    dedup(conn)
    conn.commit()


def main():
    with embed.connect() as conn:
        refine(conn)
        visible = conn.execute(
            "select count(*) from qa_pairs where hidden = false and canonical_id is null"
        ).fetchone()[0]
        total = conn.execute("select count(*) from qa_pairs").fetchone()[0]
        print(f"done. visible pairs: {visible} / {total}")


if __name__ == "__main__":
    main()

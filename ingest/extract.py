import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI, APIStatusError

load_dotenv()

MODEL = "gpt-4o-mini"
THREAD_GAP = timedelta(minutes=30)
MAX_MSGS = 40          # split long busy windows so prompts stay bounded
MIN_MSGS = 2           # a thread needs at least a question + a reply
WORKERS = 6

client = OpenAI()

SYSTEM_PROMPT = """You extract reusable Q&A pairs from a snippet of a WhatsApp \
group chat among incoming/current MBA students at UVA Darden.

The group re-asks the same logistical questions constantly (housing, leases, \
visas, orientation dates, courses, recruiting, clubs, moving, etc). Your job is \
to turn a chat snippet into a knowledge base.

Rules:
- Only output a pair when the snippet contains BOTH a genuine question AND at \
least a partial answer from someone in the snippet. Skip pure chit-chat, \
greetings, reactions, and unanswered questions.
- Rewrite the question so it is self-contained: resolve pronouns and context so \
it makes sense on its own, out of the chat.
- Synthesize the answer from what the responders actually said. Do not invent \
facts not present in the snippet. If responders disagree, capture both views.
- topics: 1-4 short lowercase tags (e.g. "housing", "leases", "visa", \
"orientation dates", "recruiting", "courses", "clubs", "moving").
- confidence: 0.0-1.0, how clearly the snippet contains a real, answered question.
- source_ids: the message id numbers (shown in brackets) that the pair is drawn \
from.

Return JSON: {"pairs": [{"question": str, "answer": str, "topics": [str], \
"confidence": float, "source_ids": [int]}]}. Return {"pairs": []} if none."""


def thread_messages(records):
    msgs = [r for r in records if r["type"] == "text" and r["message"].strip()]
    msgs.sort(key=lambda r: r["timestamp"])
    threads, cur, last = [], [], None
    for r in msgs:
        ts = datetime.fromisoformat(r["timestamp"])
        if cur and (ts - last > THREAD_GAP or len(cur) >= MAX_MSGS):
            threads.append(cur)
            cur = []
        cur.append(r)
        last = ts
    if cur:
        threads.append(cur)
    return [t for t in threads if len(t) >= MIN_MSGS]


def render(thread):
    return "\n".join(f"[{r['id']}] {r['sender']}: {r['message']}" for r in thread)


def extract_thread(thread, attempt=0):
    try:
        resp = client.chat.completions.create(
            model=MODEL,
            temperature=0,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": render(thread)},
            ],
        )
        data = json.loads(resp.choices[0].message.content)
        return data.get("pairs", [])
    except APIStatusError as e:
        # Quota/auth problems won't recover on retry — surface and stop.
        if e.code in ("insufficient_quota", "invalid_api_key") or e.status_code in (401, 403):
            raise SystemExit(f"OpenAI error ({e.code}): {e.message}")
        if attempt < 3:
            time.sleep(2 ** attempt)
            return extract_thread(thread, attempt + 1)
        print(f"  ! thread failed: {e}", file=sys.stderr)
        return []
    except Exception as e:
        if attempt < 3:
            time.sleep(2 ** attempt)
            return extract_thread(thread, attempt + 1)
        print(f"  ! thread failed: {e}", file=sys.stderr)
        return []


def extract_file(path):
    path = Path(path)
    records = json.loads(path.read_text(encoding="utf-8"))
    group = path.stem
    threads = thread_messages(records)
    by_id = {r["id"]: r for r in records}
    print(f"{group}: {len(threads)} threads -> extracting...")

    pairs = []
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {pool.submit(extract_thread, t): t for t in threads}
        for fut in as_completed(futures):
            thread = futures[fut]
            start = thread[0]["timestamp"]
            for p in fut.result():
                if not p.get("question") or not p.get("answer"):
                    continue
                sids = [i for i in p.get("source_ids", []) if i in by_id]
                pairs.append(
                    {
                        "group": group,
                        "question": p["question"].strip(),
                        "answer": p["answer"].strip(),
                        "topics": [t.lower().strip() for t in p.get("topics", [])],
                        "confidence": float(p.get("confidence", 0.0)),
                        "source_ids": sids,
                        "thread_start": start,
                    }
                )

    out = path.with_suffix(".qa.json")
    out.write_text(json.dumps(pairs, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  {len(pairs)} Q&A pairs -> {out}")
    return pairs


def main():
    args = sys.argv[1:]
    if args:
        files = [Path(a) for a in args]
    else:
        files = sorted(
            p for p in Path("data/processed").glob("*.json")
            if not p.name.endswith(".qa.json")
        )
    total = 0
    for f in files:
        total += len(extract_file(f))
    print(f"\nDone: {total} Q&A pairs across {len(files)} groups.")


if __name__ == "__main__":
    main()

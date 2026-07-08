import json
import re
import sys
import unicodedata
from datetime import datetime
from pathlib import Path

# WhatsApp iOS export line format:
#   [DD/MM/YY, H:MM:SS<U+202F>AM] Sender: body
# with invisible directional-formatting chars sprinkled throughout. We strip
# those up front so every downstream regex works on plain text.

# HEADER runs on an already-cleaned line, so all separators are plain ASCII.
HEADER = re.compile(
    r"^\[(?P<d>\d{1,2})/(?P<mo>\d{1,2})/(?P<y>\d{2}), "
    r"(?P<h>\d{1,2}):(?P<mi>\d{2}):(?P<s>\d{2}) (?P<ap>AM|PM)\] "
    r"(?P<sender>.+?): (?P<body>.*)$"
)

# Whitespace variants folded to a normal space: nbsp, narrow nbsp, word joiner.
_SPACES = {" ", " ", "⁠", "﻿"}
_ZWJ = "‍"  # keep: joins emoji sequences

ATTACHED = re.compile(r"<attached: (?P<file>[^>]+)>")
OMITTED = re.compile(r"^(image|video|audio|sticker|GIF|document|Contact card) omitted$")
EDITED = "<This message was edited>"

SYSTEM_PATTERNS = [
    re.compile(p)
    for p in (
        r" was added$",
        r" added$",
        r" joined using a group link$",
        r"^You joined using",
        r" left$",
        r" was removed$",
        r"^You were [Aa]dded to",
        r"^You added ",
        r" changed (their phone number|to |the group|this group|the subject)",
        r"changed the group's icon",
        r"^Messages and calls are end-to-end encrypted",
        r"^This message was deleted\.$",
        r" pinned a message$",
        r"only admins can (edit|send)",
        r"^This group has over",
        r"turned on admin approval",
        r"security code changed$",
    )
]


def _strip_fmt(s):
    # Drop invisible format chars (bidi marks, BOM, ...) but keep the ZWJ so
    # emoji sequences stay intact. Fold nbsp variants to a space and normalize
    # the non-breaking hyphen used in phone numbers.
    out = []
    for ch in s:
        if ch in _SPACES:
            out.append(" ")
        elif ch == "‑":
            out.append("-")
        elif ch == _ZWJ or unicodedata.category(ch) != "Cf":
            out.append(ch)
    return "".join(out)


def _classify(raw_body):
    edited = EDITED in raw_body
    body = raw_body.replace(EDITED, "").strip()

    m = ATTACHED.search(body)
    if m:
        return "media", body, m.group("file"), edited
    if OMITTED.match(body):
        return "media", body, None, edited
    for p in SYSTEM_PATTERNS:
        if p.search(body):
            return "system", body, None, edited
    return "text", body, None, edited


def parse_file(path):
    path = Path(path)
    text = path.read_text(encoding="utf-8")
    records = []
    cur = None

    def flush():
        if cur is None:
            return
        raw = "\n".join(cur["lines"])
        kind, body, media, edited = _classify(raw)
        records.append(
            {
                "id": len(records),
                "timestamp": cur["ts"],
                "sender": cur["sender"],
                "message": body,
                "type": kind,
                "media": media,
                "edited": edited,
            }
        )

    for raw_line in text.splitlines():
        line = _strip_fmt(raw_line)
        m = HEADER.match(line)
        if m:
            flush()
            g = m.groupdict()
            hour = int(g["h"]) % 12 + (12 if g["ap"] == "PM" else 0)
            ts = datetime(
                2000 + int(g["y"]), int(g["mo"]), int(g["d"]),
                hour, int(g["mi"]), int(g["s"]),
            )
            sender = g["sender"].lstrip("~").strip()
            cur = {"ts": ts.isoformat(), "sender": sender, "lines": [g["body"]]}
        elif cur is not None:
            cur["lines"].append(line)
    flush()
    return records


def main():
    if len(sys.argv) != 2:
        sys.exit("usage: python ingest/parser.py <export.txt>")
    src = Path(sys.argv[1])
    records = parse_file(src)
    out_dir = Path("data/processed")
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / (src.stem + ".json")
    out.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")

    counts = {}
    for r in records:
        counts[r["type"]] = counts.get(r["type"], 0) + 1
    print(f"{src.name}: {len(records)} messages -> {out}")
    print("  " + ", ".join(f"{k}={v}" for k, v in sorted(counts.items())))


if __name__ == "__main__":
    main()

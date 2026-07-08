import glob
import json
import os
from pathlib import Path
from urllib.parse import urlparse, urlunparse

import psycopg
from dotenv import load_dotenv
from openai import OpenAI
from pgvector.psycopg import register_vector

load_dotenv()

EMBED_MODEL = "text-embedding-3-small"
MIN_CONFIDENCE = 0.5
BATCH = 100

DB_URL = os.environ["DATABASE_URL"]
client = OpenAI()


def ensure_database():
    # CREATE DATABASE can't run against the target db, so bootstrap via 'postgres'.
    parts = urlparse(DB_URL)
    dbname = parts.path.lstrip("/")
    admin = urlunparse(parts._replace(path="/postgres"))
    with psycopg.connect(admin, autocommit=True) as conn:
        exists = conn.execute(
            "select 1 from pg_database where datname = %s", (dbname,)
        ).fetchone()
        if not exists:
            conn.execute(f'create database "{dbname}"')
            print(f"created database {dbname}")


def connect():
    ensure_database()
    conn = psycopg.connect(DB_URL, autocommit=False)
    conn.execute(Path("ingest/schema.sql").read_text())
    register_vector(conn)
    return conn


def embed_texts(texts):
    out = []
    for i in range(0, len(texts), BATCH):
        chunk = texts[i : i + BATCH]
        resp = client.embeddings.create(model=EMBED_MODEL, input=chunk)
        out.extend(d.embedding for d in resp.data)
        print(f"  embedded {min(i + BATCH, len(texts))}/{len(texts)}")
    return out


def load_messages(conn, records, group):
    rows = [
        (group, r["id"], r["timestamp"], r["sender"], r["message"],
         r["type"], r["media"], r["edited"])
        for r in records
    ]
    with conn.cursor() as cur:
        cur.executemany(
            'insert into messages ("group", msg_id, ts, sender, message, type, '
            "media, edited) values (%s,%s,%s,%s,%s,%s,%s,%s) on conflict do nothing",
            rows,
        )
    print(f"messages [{group}]: {len(rows)} rows")


def load_qa(conn, pairs, group):
    pairs = [p for p in pairs if p["confidence"] >= MIN_CONFIDENCE]
    print(f"qa_pairs [{group}]: {len(pairs)} (confidence >= {MIN_CONFIDENCE})")
    if not pairs:
        return
    vectors = embed_texts([f"Q: {p['question']}\nA: {p['answer']}" for p in pairs])

    with conn.cursor() as cur:
        for p, vec in zip(pairs, vectors):
            qa_id = cur.execute(
                'insert into qa_pairs ("group", question, answer, confidence, '
                "thread_start, source_ids, embedding) values "
                "(%s,%s,%s,%s,%s,%s,%s) returning id",
                (p["group"], p["question"], p["answer"], p["confidence"],
                 p["thread_start"], p["source_ids"], vec),
            ).fetchone()[0]
            for name in p["topics"]:
                topic_id = cur.execute(
                    "insert into topics (name) values (%s) on conflict (name) "
                    "do update set name = excluded.name returning id",
                    (name,),
                ).fetchone()[0]
                cur.execute(
                    "insert into qa_topics (qa_id, topic_id) values (%s,%s) "
                    "on conflict do nothing",
                    (qa_id, topic_id),
                )


def embed_group(conn, stem):
    # (Re)load a single group from its processed JSON files, replacing any rows
    # that group already has. Used by the incremental upload pipeline.
    records = json.loads(Path(f"data/processed/{stem}.json").read_text("utf-8"))
    qa_path = Path(f"data/processed/{stem}.qa.json")
    pairs = json.loads(qa_path.read_text("utf-8")) if qa_path.exists() else []
    with conn.cursor() as cur:
        cur.execute('delete from qa_pairs where "group" = %s', (stem,))
        cur.execute('delete from messages where "group" = %s', (stem,))
    load_messages(conn, records, stem)
    load_qa(conn, pairs, stem)
    _prune_topics(conn)
    conn.commit()
    import refine

    refine.refine(conn)


def _prune_topics(conn):
    conn.execute(
        "delete from topics where id not in (select distinct topic_id from qa_topics)"
    )


def main():
    stems = [
        Path(p).stem
        for p in glob.glob("data/processed/*.json")
        if not p.endswith(".qa.json")
    ]
    import refine

    with connect() as conn:
        conn.execute("truncate messages, qa_pairs, topics, qa_topics restart identity")
        for stem in stems:
            records = json.loads(Path(f"data/processed/{stem}.json").read_text("utf-8"))
            qa_path = Path(f"data/processed/{stem}.qa.json")
            pairs = json.loads(qa_path.read_text("utf-8")) if qa_path.exists() else []
            load_messages(conn, records, stem)
            load_qa(conn, pairs, stem)
        conn.commit()
        refine.refine(conn)
    print("done.")


if __name__ == "__main__":
    main()

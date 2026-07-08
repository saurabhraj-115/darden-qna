# Darden Q&A Dashboard

Search + browse a knowledge base built from WhatsApp group chat exports, so recurring questions get answered from the archive instead of re-asked.

## How it works

1. Export a WhatsApp group chat from your phone (three-dot menu → Export chat → Without media). You get a `.txt`.
2. Drop the `.txt` into `data/raw/`.
3. Run the ingest pipeline — parses messages, extracts Q&A pairs with an LLM, embeds them, stores in Postgres.
4. Open the dashboard, search or browse by topic.

## Project layout

```
darden_qna/
├── ingest/          # Python: parser, Q&A extractor, embedder
│   ├── parser.py
│   ├── extract.py
│   ├── embed.py
│   └── requirements.txt
├── data/
│   ├── raw/         # WhatsApp .txt exports (gitignored)
│   └── processed/   # normalized JSON (gitignored)
├── web/             # Next.js dashboard
└── .env.example     # copy to .env and fill in
```

## Setup

```bash
# Python side
cd ingest
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Postgres (via Docker)
docker run -d --name darden-pg -p 5433:5432 \
  -e POSTGRES_PASSWORD=darden \
  pgvector/pgvector:pg16

# Env
cp .env.example .env
# fill in OPENAI_API_KEY

# Run ingest
python ingest/run.py data/raw/your_export.txt

# Frontend
cd web && npm install && npm run dev
```

## Status

Scaffolding stage. Waiting on a real chat export to build the parser against.

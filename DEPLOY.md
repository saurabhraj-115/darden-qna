# Deploying Darden Q&A (free, public)

Stack: **Vercel** (Next.js app) + **Neon** (Postgres + pgvector). Both free.
The ingest/upload pipeline stays local — the hosted site is read-only search.

## 1. Database → Neon

1. Create a project at https://neon.tech (free tier).
2. Enable pgvector — it ships with Neon; the dump runs `CREATE EXTENSION vector`.
3. Copy the **Pooled** connection string (Dashboard → Connection Details →
   "Pooled connection"). It looks like
   `postgres://user:pass@ep-xxx-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require`.
4. Restore the local data (dump already generated at `data/darden_qna.sql`):

   ```bash
   # regenerate the dump if the data changed:
   docker exec darden-pg pg_dump -U postgres -d darden_qna \
     --no-owner --no-privileges > data/darden_qna.sql

   psql "<NEON_POOLED_CONNECTION_STRING>" < data/darden_qna.sql
   ```

## 2. Code → GitHub

```bash
cd ~/Desktop/darden_qna
git init && git add -A && git commit -m "Darden Q&A dashboard"
gh repo create darden-qna --public --source=. --push   # or push to a repo you made
```

`.env` and `data/*` are gitignored — no secrets or chat data get committed.

## 3. App → Vercel

1. https://vercel.com → **Add New → Project** → import the GitHub repo.
2. **Root Directory:** `web`  (the Next.js app lives there).
3. **Environment Variables:**
   | Key | Value |
   |---|---|
   | `DATABASE_URL` | the Neon **pooled** connection string |
   | `OPENAI_API_KEY` | your OpenAI key |
   | `NEXT_PUBLIC_READONLY` | `1` |
4. Deploy. You get a public `https://<project>.vercel.app` URL.

`NEXT_PUBLIC_READONLY=1` hides the upload button and 403s the upload API (it
can't run on serverless anyway).

## Costs & abuse

- Search and every follow-up call OpenAI on your key. `text-embedding-3-small`
  is ~$0.00002/search; follow-ups use `gpt-4o-mini` (fractions of a cent each).
- A public link can be hit by bots. If usage climbs, add rate-limiting
  (e.g. Vercel middleware / Upstash) and/or a spend cap in the OpenAI dashboard.

## Updating data later

Re-run the local pipeline (`python3 ingest/run.py <export.txt>` or
`ingest/embed.py`), regenerate the dump, and re-restore to Neon (step 1.4).

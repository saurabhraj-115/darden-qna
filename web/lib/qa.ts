import { pool } from "./db";
import { CATEGORIES, CategoryKey } from "./taxonomy";
import type { QAPair } from "./types";

// Only canonical, non-hidden pairs are ever surfaced.
const VISIBLE = `p.hidden = false and p.canonical_id is null`;

const SELECT = `
  select p.id, p."group", p.question, p.answer, p.confidence, p.category,
         coalesce(array_agg(t.name) filter (where t.name is not null), '{}') as topics,
         coalesce(array_length(p.source_ids, 1), 0) as source_count,
         (select count(*) from qa_pairs d where d.canonical_id = p.id)::int as related_count,
         coalesce(
           (select max(m.ts) from messages m
             where m."group" = p."group" and m.msg_id = any(p.source_ids)),
           p.thread_start
         ) as latest_ts
  from qa_pairs p
  left join qa_topics qt on qt.qa_id = p.id
  left join topics t on t.id = qt.topic_id
`;

function shape(r: any): QAPair {
  return {
    id: r.id,
    group: r.group,
    question: r.question,
    answer: r.answer,
    confidence: r.confidence,
    topics: r.topics,
    category: (r.category ?? "community") as CategoryKey,
    sourceCount: r.source_count,
    relatedCount: r.related_count,
    similarity: r.similarity ?? undefined,
    date: r.latest_ts ? new Date(r.latest_ts).toISOString() : null,
  };
}

export async function searchQA(
  vector: string,
  sort: "match" | "recent" = "match",
  limit = 24
): Promise<QAPair[]> {
  // Always retrieve the most relevant candidates, then optionally reorder them
  // by recency so "most recent" still stays on-topic.
  const { rows } = await pool.query(
    `${SELECT}
     where ${VISIBLE}
     group by p.id
     order by p.embedding <=> $1::vector
     limit $2`,
    [vector, limit]
  );
  const sim = await pool.query(
    `select id, 1 - (embedding <=> $1::vector) as similarity
       from qa_pairs where id = any($2::bigint[])`,
    [vector, rows.map((r) => r.id)]
  );
  const m = new Map(sim.rows.map((r) => [r.id, r.similarity]));
  const pairs = rows.map((r) => shape({ ...r, similarity: m.get(r.id) }));
  if (sort === "recent") {
    pairs.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  }
  return pairs;
}

export async function pairsByCategory(
  category: string,
  topic: string | null,
  sort: "top" | "recent" = "top",
  limit = 60
): Promise<QAPair[]> {
  const params: any[] = [category];
  let topicFilter = "";
  if (topic) {
    params.push(topic);
    topicFilter = `and p.id in (
      select qt2.qa_id from qa_topics qt2 join topics t2 on t2.id = qt2.topic_id
      where t2.name = $${params.length})`;
  }
  params.push(limit);
  const orderBy =
    sort === "recent"
      ? "latest_ts desc nulls last"
      : "p.confidence desc, latest_ts desc nulls last";
  const { rows } = await pool.query(
    `${SELECT}
     where ${VISIBLE} and p.category = $1 ${topicFilter}
     group by p.id
     order by ${orderBy}
     limit $${params.length}`,
    params
  );
  return rows.map(shape);
}

export async function listCategories() {
  const counts = await pool.query(
    `select category, count(*)::int as count
       from qa_pairs p where ${VISIBLE} group by category`
  );
  const samples = await pool.query(
    `select distinct on (category) category, question
       from qa_pairs p where ${VISIBLE}
      order by category, confidence desc`
  );
  const countMap = new Map(counts.rows.map((r) => [r.category, r.count]));
  const sampleMap = new Map(samples.rows.map((r) => [r.category, r.question]));
  return CATEGORIES.map((c) => ({
    ...c,
    count: countMap.get(c.key) ?? 0,
    sample: sampleMap.get(c.key) ?? null,
  }));
}

export async function subtopicsForCategory(category: string) {
  // sub-chips = topics that belong to this category, on this category's pairs
  const { rows } = await pool.query(
    `select t.name, count(distinct p.id)::int as count
       from qa_pairs p
       join qa_topics qt on qt.qa_id = p.id
       join topics t on t.id = qt.topic_id
      where ${VISIBLE} and p.category = $1 and t.category = $1
      group by t.name order by count desc, t.name`,
    [category]
  );
  return rows;
}

export async function suggest(q: string, limit = 7) {
  const { rows } = await pool.query(
    `select p.question, p.category
       from qa_pairs p where ${VISIBLE} and p.question ilike $1
      order by p.confidence desc, length(p.question)
      limit $2`,
    [`%${q}%`, limit]
  );
  return rows as { question: string; category: CategoryKey }[];
}

export async function relatedVariants(id: number) {
  const { rows } = await pool.query(
    `select question, "group" from qa_pairs where canonical_id = $1 order by confidence desc`,
    [id]
  );
  return rows;
}

export async function listGroups() {
  const { rows } = await pool.query(
    `select g."group", g.messages, coalesce(p.pairs, 0)::int as pairs
       from (select "group", count(*)::int as messages from messages group by "group") g
       left join (
         select "group", count(*)::int as pairs from qa_pairs
          where hidden = false and canonical_id is null group by "group"
       ) p on p."group" = g."group"
      order by pairs desc`
  );
  return rows as { group: string; messages: number; pairs: number }[];
}

export async function stats() {
  const { rows } = await pool.query(
    `select
       (select count(*) from qa_pairs where hidden = false and canonical_id is null)::int as pairs,
       (select count(*) from messages)::int as messages,
       (select count(distinct "group") from qa_pairs)::int as groups,
       (select count(distinct category) from topics where category is not null)::int as categories`
  );
  return rows[0];
}

export async function pairContext(id: number) {
  const { rows } = await pool.query(
    `select question, answer, "group" from qa_pairs where id = $1`,
    [id]
  );
  if (!rows.length) return null;
  const p = rows[0];
  const messages = await sourceMessages(p.group, id);
  return { question: p.question, answer: p.answer, group: p.group, messages };
}

export async function sourceMessages(group: string, id: number) {
  const { rows } = await pool.query(
    `select m.sender, m.ts, m.message
       from qa_pairs p
       join messages m on m."group" = p."group" and m.msg_id = any(p.source_ids)
      where p.id = $1 and p."group" = $2
      order by m.ts`,
    [id, group]
  );
  return rows;
}

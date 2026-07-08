create extension if not exists vector;

create table if not exists messages (
    id       bigserial primary key,
    "group"  text not null,
    msg_id   int  not null,
    ts       timestamp not null,
    sender   text not null,
    message  text not null,
    type     text not null,
    media    text,
    edited   boolean not null default false,
    unique ("group", msg_id)
);

create table if not exists qa_pairs (
    id           bigserial primary key,
    "group"      text not null,
    question     text not null,
    answer       text not null,
    confidence   real not null,
    thread_start timestamp,
    source_ids   int[] not null default '{}',
    embedding    vector(1536),
    canonical_id bigint references qa_pairs(id) on delete set null,
    hidden       boolean not null default false
);

-- refine layer signals (idempotent for existing databases)
alter table qa_pairs add column if not exists canonical_id bigint references qa_pairs(id) on delete set null;
alter table qa_pairs add column if not exists hidden boolean not null default false;
alter table qa_pairs add column if not exists category text;

create table if not exists topics (
    id       serial primary key,
    name     text unique not null,
    category text
);

alter table topics add column if not exists category text;

create table if not exists qa_topics (
    qa_id    bigint references qa_pairs(id) on delete cascade,
    topic_id int    references topics(id)   on delete cascade,
    primary key (qa_id, topic_id)
);

create index if not exists qa_embedding_idx on qa_pairs using hnsw (embedding vector_cosine_ops);
create index if not exists messages_group_msgid_idx on messages ("group", msg_id);

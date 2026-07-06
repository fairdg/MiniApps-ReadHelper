create table if not exists users (
  id bigserial primary key,
  telegram_id bigint unique not null,
  username text,
  timezone text, -- IANA-таймзона (напр. "Asia/Tomsk"), из Intl на фронте
  created_at timestamptz not null default now()
);

alter table users add column if not exists timezone text;

create table if not exists books (
  id bigserial primary key,
  user_id bigint not null references users(id) on delete cascade,
  title text not null,
  source_text text not null,
  status text not null default 'processing', -- processing | ready | failed
  created_at timestamptz not null default now()
);

create table if not exists chunks (
  id bigserial primary key,
  book_id bigint not null references books(id) on delete cascade,
  position int not null,
  content text not null,
  chapter text,
  unique (book_id, position)
);

alter table chunks add column if not exists chapter text;

create table if not exists deliveries (
  id bigserial primary key,
  book_id bigint not null references books(id) on delete cascade,
  next_chunk_position int not null default 0,
  interval_minutes int not null default 240,
  next_send_at timestamptz not null default now(),
  is_active boolean not null default true
);

create table if not exists feedback (
  id bigserial primary key,
  user_id bigint references users(id) on delete set null,
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_chunks_book on chunks(book_id);
create index if not exists idx_deliveries_due on deliveries(is_active, next_send_at);

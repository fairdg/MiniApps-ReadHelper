create table if not exists users (
  id bigserial primary key,
  telegram_id bigint unique not null,
  username text,
  timezone text, -- IANA-таймзона (напр. "Asia/Tomsk"), из Intl на фронте
  is_admin boolean not null default false, -- владелец (OWNER_TELEGRAM_ID) admin всегда, независимо от этого поля
  billing_plan text not null default 'free', -- free | pro
  billing_plan_activated_at timestamptz,
  created_at timestamptz not null default now()
);

alter table users add column if not exists timezone text;
alter table users add column if not exists is_admin boolean not null default false;
alter table users add column if not exists billing_plan text not null default 'free';
alter table users add column if not exists billing_plan_activated_at timestamptz;

create table if not exists books (
  id bigserial primary key,
  user_id bigint not null references users(id) on delete cascade,
  title text not null,
  source_text text not null,
  status text not null default 'processing', -- processing | ready | failed
  target_words int not null default 120, -- ориентир для дробления на порции
  created_at timestamptz not null default now()
);

alter table books add column if not exists target_words int not null default 120;

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
  notifications_per_day int,
  next_send_at timestamptz not null default now(),
  is_active boolean not null default true
);

alter table deliveries add column if not exists notifications_per_day int;

update deliveries
set notifications_per_day = greatest(1, least(14, round(1440.0 / nullif(interval_minutes, 0))))
where notifications_per_day is null;

update deliveries
set interval_minutes = greatest(1, round(900.0 / notifications_per_day))
where notifications_per_day is not null;

create table if not exists feedback (
  id bigserial primary key,
  user_id bigint references users(id) on delete set null,
  message text not null,
  created_at timestamptz not null default now()
);

create table if not exists payments (
  id bigserial primary key,
  user_id bigint references users(id) on delete set null,
  kind text not null, -- pro_upgrade
  status text not null default 'paid', -- paid
  currency text not null,
  total_amount int not null,
  invoice_payload text not null,
  telegram_payment_charge_id text unique not null,
  provider_payment_charge_id text,
  raw_payment jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_chunks_book on chunks(book_id);
create index if not exists idx_deliveries_due on deliveries(is_active, next_send_at);
create index if not exists idx_payments_user on payments(user_id, created_at desc);

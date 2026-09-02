-- Свежие продукты — схема БД (PostgreSQL + PostGIS)
-- Соответствует разделу 6 концепта. Переписка НЕ хранится тут (см. 5.1) —
-- по умолчанию она идёт в самом Telegram, поэтому таблицы messages нет.

create extension if not exists postgis;
create extension if not exists pgcrypto;

create table if not exists users (
  id                 uuid primary key default gen_random_uuid(),
  telegram_id        bigint not null unique,
  first_name         text not null,
  username            text,
  show_contact       boolean not null default false,
  rating             numeric(2,1) not null default 0,
  deals_count        integer not null default 0,
  broadcast_opt_in   boolean not null default false,
  created_at         timestamptz not null default now()
  );

create table if not exists categories (
  slug   text primary key,
  title  text not null
  );

insert into categories (slug, title) values
('vegetables', 'Овощи/фрукты'),
('greens',     'Зелень'),
('berries',    'Ягоды'),
('eggs',       'Яйца'),
('meat',       'Мясо'),
('honey',      'Мёд'),
('fish',       'Рыба/раки'),
('flowers',    'Цветы'),
('dairy',      'Молочное'),
('other',      'Другое')
on conflict (slug) do nothing;

create type listing_status as enum ('active', 'reserved', 'sold', 'archived');

create table if not exists listings (
  id                 uuid primary key default gen_random_uuid(),
  seller_id          uuid not null references users(id) on delete cascade,
  category_slug      text not null references categories(slug),
  title              text not null,
  description        text,
  photo_file_id      text,
  price              numeric(10,2) not null,
  unit               text not null,
  origin_point       geography(Point, 4326) not null,
  dest_point         geography(Point, 4326) not null,
  dest_radius_m      integer not null default 1500,
  window_start       timestamptz not null,
  window_end         timestamptz not null,
  status             listing_status not null default 'active',
  created_at         timestamptz not null default now(),
  archived_at        timestamptz
  );

create index if not exists listings_dest_point_gix on listings using gist (dest_point);
create index if not exists listings_status_idx on listings (status);
create index if not exists listings_category_idx on listings (category_slug);
create index if not exists listings_window_idx on listings (window_start, window_end);

create table if not exists reviews (
  id           uuid primary key default gen_random_uuid(),
  seller_id    uuid not null references users(id) on delete cascade,
  author_id    uuid not null references users(id) on delete cascade,
  listing_id   uuid references listings(id) on delete set null,
  rating       smallint not null check (rating between 1 and 5),
  comment      text,
  created_at   timestamptz not null default now(),
  unique (author_id, listing_id)
  );

create table if not exists contact_clicks (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references listings(id) on delete cascade,
  buyer_id     uuid references users(id) on delete set null,
  created_at   timestamptz not null default now()
  );

create table if not exists reports (
  id            uuid primary key default gen_random_uuid(),
  listing_id    uuid references listings(id) on delete cascade,
  reporter_id   uuid references users(id) on delete set null,
  reason        text not null,
  status        text not null default 'open',
  created_at    timestamptz not null default now()
  );

create or replace function archive_expired_listings() returns void as $$
begin
update listings
set status = 'archived', archived_at = now()
where status in ('active', 'reserved')
and created_at < now() - interval '30 days';
end;
$$ language plpgsql;

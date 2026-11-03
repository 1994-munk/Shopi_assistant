-- Production-ready Supabase schema for the Shopi storefront.
-- These tables support products, basket persistence, sessions, and conversational telemetry.

create extension if not exists pgcrypto;

create table if not exists public.products (
  id text primary key,
  name text not null,
  category text not null,
  price_cents integer not null check (price_cents >= 0),
  description text default '',
  tags text[] default '{}',
  in_stock boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_email text,
  metadata jsonb default '{}'::jsonb
);

create table if not exists public.basket_items (
  id uuid primary key default gen_random_uuid(),
  session_id text not null references public.sessions(id) on delete cascade,
  product_id text not null references public.products(id),
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, product_id)
);

create table if not exists public.turn_events (
  id uuid primary key default gen_random_uuid(),
  session_id text not null references public.sessions(id) on delete cascade,
  turn_index integer not null default 0,
  user_message text not null default '',
  intent text not null default 'unclear',
  response_text text not null default '',
  clarification_asked boolean not null default false,
  safety_flags text[] default '{}',
  latency_ms integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_basket_items_session_id on public.basket_items(session_id);
create index if not exists idx_turn_events_session_id on public.turn_events(session_id);
create index if not exists idx_products_category on public.products(category);
create index if not exists idx_products_name on public.products(name);

alter table public.products enable row level security;
alter table public.sessions enable row level security;
alter table public.basket_items enable row level security;
alter table public.turn_events enable row level security;

create policy if not exists "allow anonymous product reads" on public.products
for select using (true);

create policy if not exists "allow anonymous session writes" on public.sessions
for insert with check (true);

create policy if not exists "allow anonymous basket writes" on public.basket_items
for all using (true) with check (true);

create policy if not exists "allow anonymous turn event writes" on public.turn_events
for insert with check (true);

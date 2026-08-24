-- BarberHomeCloud · schema + storage
-- Ejecuta TODO este archivo en: Supabase → SQL Editor → New query → Run
-- Luego pega Project URL + anon key en js/supabase-config.js

create extension if not exists "pgcrypto";

-- —— Tablas ——
create table if not exists public.usuarios (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  name text not null default '',
  role text not null default 'admin',
  phone text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  doc_type text default 'CC',
  doc_number text default '',
  email text default '',
  phone text default '',
  email_verified boolean default false,
  points integer not null default 0,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clientes_phone_idx on public.clientes (phone);
create index if not exists clientes_email_idx on public.clientes (email);

create table if not exists public.citas (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Cliente',
  phone text default '',
  date date not null,
  time text not null,
  duration integer not null default 60,
  service_name text default 'Cita',
  service_id text default '',
  price numeric(12, 2) default 0,
  notes text default '',
  status text not null default 'pending_confirmation',
  source text default 'public',
  business text default 'BarberHome',
  calendar_id text default '',
  slug text default '',
  cliente_id uuid references public.clientes (id) on delete set null,
  client_fingerprint text default '',
  google_event_id text default '',
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists citas_date_idx on public.citas (date);
create index if not exists citas_phone_idx on public.citas (phone);
create index if not exists citas_status_idx on public.citas (status);

create table if not exists public.productos (
  id text primary key,
  name text not null,
  description text default '',
  kind text not null default 'sale' check (kind in ('sale', 'redeem')),
  price numeric(12, 2) default 0,
  points_cost integer default 0,
  stock integer not null default 0,
  images jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventario (
  id uuid primary key default gen_random_uuid(),
  producto_id text references public.productos (id) on delete cascade,
  delta integer not null,
  reason text default '',
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.puntos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references public.clientes (id) on delete cascade,
  name text default '',
  doc_type text default '',
  doc_number text default '',
  amount integer not null,
  note text default '',
  balance integer,
  created_at timestamptz not null default now()
);

create index if not exists puntos_cliente_idx on public.puntos (cliente_id);

create table if not exists public.canjes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references public.clientes (id) on delete set null,
  producto_id text references public.productos (id) on delete set null,
  product_name text default '',
  points_cost integer default 0,
  value_cop numeric(12, 2) default 0,
  customer jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- —— RLS (MVP: anon con acceso; endurecer con Auth después) ——
alter table public.usuarios enable row level security;
alter table public.clientes enable row level security;
alter table public.citas enable row level security;
alter table public.productos enable row level security;
alter table public.inventario enable row level security;
alter table public.puntos enable row level security;
alter table public.canjes enable row level security;

drop policy if exists "anon_all_usuarios" on public.usuarios;
drop policy if exists "anon_all_clientes" on public.clientes;
drop policy if exists "anon_all_citas" on public.citas;
drop policy if exists "anon_all_productos" on public.productos;
drop policy if exists "anon_all_inventario" on public.inventario;
drop policy if exists "anon_all_puntos" on public.puntos;
drop policy if exists "anon_all_canjes" on public.canjes;

create policy "anon_all_usuarios" on public.usuarios for all using (true) with check (true);
create policy "anon_all_clientes" on public.clientes for all using (true) with check (true);
create policy "anon_all_citas" on public.citas for all using (true) with check (true);
create policy "anon_all_productos" on public.productos for all using (true) with check (true);
create policy "anon_all_inventario" on public.inventario for all using (true) with check (true);
create policy "anon_all_puntos" on public.puntos for all using (true) with check (true);
create policy "anon_all_canjes" on public.canjes for all using (true) with check (true);

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all functions in schema public to anon, authenticated, service_role;

-- —— Storage buckets ——
insert into storage.buckets (id, name, public)
values
  ('productos', 'productos', true),
  ('cortes', 'cortes', true),
  ('perfiles', 'perfiles', true),
  ('documentos', 'documentos', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists "public_read_productos" on storage.objects;
drop policy if exists "public_write_productos" on storage.objects;
drop policy if exists "public_update_productos" on storage.objects;
drop policy if exists "public_delete_productos" on storage.objects;
drop policy if exists "public_read_cortes" on storage.objects;
drop policy if exists "public_write_cortes" on storage.objects;
drop policy if exists "public_update_cortes" on storage.objects;
drop policy if exists "public_delete_cortes" on storage.objects;
drop policy if exists "public_read_perfiles" on storage.objects;
drop policy if exists "public_write_perfiles" on storage.objects;
drop policy if exists "public_update_perfiles" on storage.objects;
drop policy if exists "public_delete_perfiles" on storage.objects;
drop policy if exists "public_read_documentos" on storage.objects;
drop policy if exists "public_write_documentos" on storage.objects;
drop policy if exists "public_update_documentos" on storage.objects;
drop policy if exists "public_delete_documentos" on storage.objects;

create policy "public_read_productos" on storage.objects
  for select using (bucket_id = 'productos');
create policy "public_write_productos" on storage.objects
  for insert with check (bucket_id = 'productos');
create policy "public_update_productos" on storage.objects
  for update using (bucket_id = 'productos');
create policy "public_delete_productos" on storage.objects
  for delete using (bucket_id = 'productos');

create policy "public_read_cortes" on storage.objects
  for select using (bucket_id = 'cortes');
create policy "public_write_cortes" on storage.objects
  for insert with check (bucket_id = 'cortes');
create policy "public_update_cortes" on storage.objects
  for update using (bucket_id = 'cortes');
create policy "public_delete_cortes" on storage.objects
  for delete using (bucket_id = 'cortes');

create policy "public_read_perfiles" on storage.objects
  for select using (bucket_id = 'perfiles');
create policy "public_write_perfiles" on storage.objects
  for insert with check (bucket_id = 'perfiles');
create policy "public_update_perfiles" on storage.objects
  for update using (bucket_id = 'perfiles');
create policy "public_delete_perfiles" on storage.objects
  for delete using (bucket_id = 'perfiles');

create policy "public_read_documentos" on storage.objects
  for select using (bucket_id = 'documentos');
create policy "public_write_documentos" on storage.objects
  for insert with check (bucket_id = 'documentos');
create policy "public_update_documentos" on storage.objects
  for update using (bucket_id = 'documentos');
create policy "public_delete_documentos" on storage.objects
  for delete using (bucket_id = 'documentos');

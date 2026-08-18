-- Multi-tenant: un negocio = un slug. Ejecutar en SQL Editor (después de schema.sql).
-- Después: supabase/rls.sql (Auth + aislamiento entre barberías).

create table if not exists public.negocios (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null default '',
  subscription_status text not null default 'active',
  plan_id text default '100',
  autoagenda jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint negocios_slug_format check (slug ~ '^[a-z0-9]([a-z0-9-]{1,48}[a-z0-9])$')
);

create unique index if not exists negocios_slug_unique on public.negocios (lower(slug));

alter table public.negocios enable row level security;
drop policy if exists "anon_all_negocios" on public.negocios;
create policy "anon_all_negocios" on public.negocios for all using (true) with check (true);
grant all on public.negocios to anon, authenticated;

alter table public.citas add column if not exists negocio_id uuid references public.negocios (id) on delete cascade;
alter table public.clientes add column if not exists negocio_id uuid references public.negocios (id) on delete cascade;
alter table public.productos add column if not exists negocio_id uuid references public.negocios (id) on delete cascade;
alter table public.puntos add column if not exists negocio_id uuid references public.negocios (id) on delete cascade;
alter table public.canjes add column if not exists negocio_id uuid references public.negocios (id) on delete cascade;

create index if not exists citas_negocio_idx on public.citas (negocio_id);
create index if not exists clientes_negocio_idx on public.clientes (negocio_id);
create index if not exists productos_negocio_idx on public.productos (negocio_id);

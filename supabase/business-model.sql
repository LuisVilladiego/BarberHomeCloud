-- Gestiónweb.app · modelo de negocio (Confirmafy-style)
-- Ejecutar DESPUÉS de schema.sql, tenant.sql y rls.sql

-- —— Campos del negocio (Business) ——
alter table public.negocios add column if not exists logo text default '';
alter table public.negocios add column if not exists description text default '';
alter table public.negocios add column if not exists phone text default '';
alter table public.negocios add column if not exists address text default '';
alter table public.negocios add column if not exists settings jsonb not null default '{}'::jsonb;

-- —— Barberos por tenant ——
create table if not exists public.barberos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios (id) on delete cascade,
  name text not null default '',
  photo text default '',
  phone text default '',
  bio text default '',
  active boolean not null default true,
  schedule jsonb not null default '{}'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists barberos_negocio_idx on public.barberos (negocio_id);

alter table public.barberos enable row level security;

drop policy if exists "staff_read_barberos" on public.barberos;
drop policy if exists "staff_write_barberos" on public.barberos;

create policy "staff_read_barberos" on public.barberos
  for select to authenticated
  using (public.is_staff_of(negocio_id));

create policy "staff_write_barberos" on public.barberos
  for all to authenticated
  using (public.is_staff_of(negocio_id) and public.negocio_suscripcion_activa(negocio_id))
  with check (public.is_staff_of(negocio_id) and public.negocio_suscripcion_activa(negocio_id));

grant select, insert, update, delete on public.barberos to authenticated;

-- —— Roles ampliados (OWNER, ADMIN, BARBER, STAFF, CLIENT) ——
alter table public.negocio_miembros drop constraint if exists negocio_miembros_role_check;
alter table public.negocio_miembros
  add constraint negocio_miembros_role_check
  check (role in ('owner', 'admin', 'barber', 'staff', 'client', 'barbero'));

-- Dueño del negocio = owner (antes admin)
create or replace function public.ensure_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_id is not null then
    insert into public.negocio_miembros (negocio_id, user_id, role)
    values (new.id, new.owner_id, 'owner')
    on conflict (negocio_id, user_id) do update set role = 'owner';
  end if;
  return new;
end;
$$;

-- Migrar miembros admin que son dueños → owner
update public.negocio_miembros m
set role = 'owner'
from public.negocios n
where n.id = m.negocio_id
  and n.owner_id = m.user_id
  and m.role = 'admin';

-- Migrar barbero → barber
update public.negocio_miembros set role = 'barber' where role = 'barbero';

-- —— Cancelación al final del período ——
alter table public.negocios add column if not exists cancel_at_period_end boolean not null default false;

-- —— Estados de suscripción normalizados ——
update public.negocios set subscription_status = 'trial' where subscription_status = 'trialing';
update public.negocios set subscription_status = 'expired' where subscription_status = 'incomplete';
update public.negocios set subscription_status = 'canceled' where subscription_status = 'cancelled';

-- —— Acceso con trial, active y past_due ——
create or replace function public.negocio_suscripcion_activa(p_negocio uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.negocios n
    where n.id = p_negocio
      and n.subscription_status in ('trial', 'active', 'past_due', 'trialing', 'canceled')
      and n.current_period_end is not null
      and n.current_period_end > now()
  );
$$;

create or replace function public.is_admin_of(p_negocio uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.negocio_miembros m
    where m.negocio_id = p_negocio
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin')
  );
$$;

create or replace function public.is_owner_of(p_negocio uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.negocio_miembros m
    where m.negocio_id = p_negocio
      and m.user_id = auth.uid()
      and m.role = 'owner'
  );
$$;

grant execute on function public.is_owner_of(uuid) to authenticated;

-- Citas públicas: aceptar estados nuevos y legacy
drop policy if exists "anon_insert_citas" on public.citas;
create policy "anon_insert_citas" on public.citas
  for insert to anon
  with check (
    negocio_id is not null
    and public.negocio_suscripcion_activa(negocio_id)
  );

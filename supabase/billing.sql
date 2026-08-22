-- BarberCloud · facturación con Wompi
-- Ejecutar DESPUÉS de schema.sql, tenant.sql y rls.sql
--
-- Qué hace:
--  1. Guarda el periodo pagado y el historial de pagos.
--  2. Impide que el barbero se marque como activo por su cuenta:
--     solo el backend de pagos (service_role) puede tocar el estado.
--  3. El link público de reservas se corta en el momento en que vence el periodo.

-- —— Columnas de facturación ——
alter table public.negocios add column if not exists current_period_end timestamptz;
alter table public.negocios add column if not exists current_period_start timestamptz;
alter table public.negocios add column if not exists last_payment_at timestamptz;
alter table public.negocios add column if not exists cancel_at_period_end boolean not null default false;

-- —— Historial de pagos ——
create table if not exists public.pagos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios (id) on delete cascade,
  reference text not null unique,
  plan_id text not null default 'pro',
  amount_in_cents bigint not null,
  currency text not null default 'COP',
  status text not null default 'PENDING',
  wompi_transaction_id text,
  payment_method text default '',
  period_start timestamptz,
  period_end timestamptz,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pagos_negocio_idx on public.pagos (negocio_id, created_at desc);
create index if not exists pagos_status_idx on public.pagos (status);

-- —— ¿Tiene acceso pagado ahora mismo? ——
-- Estricta a propósito: sin periodo vigente no hay acceso, aunque la columna
-- de estado diga "active". Así el corte por falta de pago es inmediato y no
-- depende de que un cron actualice nada.
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

-- —— Solo el backend de pagos puede mover el estado de la suscripción ——
create or replace function public.negocios_protege_facturacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.subscription_status := 'expired';
    new.current_period_start := null;
    new.current_period_end := null;
    new.last_payment_at := null;
    new.cancel_at_period_end := false;
    return new;
  end if;

  new.subscription_status := old.subscription_status;
  new.plan_id := old.plan_id;
  new.current_period_start := old.current_period_start;
  new.current_period_end := old.current_period_end;
  new.last_payment_at := old.last_payment_at;
  new.cancel_at_period_end := old.cancel_at_period_end;
  return new;
end;
$$;

drop trigger if exists trg_negocios_protege_facturacion on public.negocios;
create trigger trg_negocios_protege_facturacion
before insert or update on public.negocios
for each row execute function public.negocios_protege_facturacion();

grant execute on function public.negocio_suscripcion_activa(uuid) to anon, authenticated;

-- —— Pagos: el staff solo lee los suyos; escribe únicamente el backend ——
-- Ojo: si vuelves a correr schema.sql, su "grant all on all tables" devuelve
-- permisos de escritura sobre pagos. Corre este archivo después.
alter table public.pagos enable row level security;

revoke all on public.pagos from anon, authenticated;
grant select on public.pagos to authenticated;

drop policy if exists "staff_read_pagos" on public.pagos;
create policy "staff_read_pagos" on public.pagos
  for select to authenticated
  using (public.is_staff_of(negocio_id));

-- —— Cortar el link público en cuanto vence el periodo ——
drop policy if exists "anon_insert_citas" on public.citas;
create policy "anon_insert_citas" on public.citas
  for insert to anon
  with check (
    negocio_id is not null
    and public.negocio_suscripcion_activa(negocio_id)
  );

-- —— Modo lectura para el barbero cuando no hay pago vigente ——
-- Puede consultar y exportar todo lo suyo, pero no crear ni modificar.
-- Se aplica en la base de datos para que no dependa de la interfaz.

drop policy if exists "staff_all_citas" on public.citas;
drop policy if exists "staff_read_citas" on public.citas;
drop policy if exists "staff_write_citas" on public.citas;
drop policy if exists "staff_modify_citas" on public.citas;
drop policy if exists "staff_delete_citas" on public.citas;

create policy "staff_read_citas" on public.citas
  for select to authenticated
  using (public.is_staff_of(negocio_id));

create policy "staff_write_citas" on public.citas
  for insert to authenticated
  with check (public.is_staff_of(negocio_id) and public.negocio_suscripcion_activa(negocio_id));

create policy "staff_modify_citas" on public.citas
  for update to authenticated
  using (public.is_staff_of(negocio_id) and public.negocio_suscripcion_activa(negocio_id))
  with check (public.is_staff_of(negocio_id) and public.negocio_suscripcion_activa(negocio_id));

create policy "staff_delete_citas" on public.citas
  for delete to authenticated
  using (public.is_staff_of(negocio_id) and public.negocio_suscripcion_activa(negocio_id));

drop policy if exists "staff_all_clientes" on public.clientes;
drop policy if exists "staff_read_clientes" on public.clientes;
drop policy if exists "staff_write_clientes" on public.clientes;
drop policy if exists "staff_modify_clientes" on public.clientes;
drop policy if exists "staff_delete_clientes" on public.clientes;

create policy "staff_read_clientes" on public.clientes
  for select to authenticated
  using (public.is_staff_of(negocio_id));

create policy "staff_write_clientes" on public.clientes
  for insert to authenticated
  with check (public.is_staff_of(negocio_id) and public.negocio_suscripcion_activa(negocio_id));

create policy "staff_modify_clientes" on public.clientes
  for update to authenticated
  using (public.is_staff_of(negocio_id) and public.negocio_suscripcion_activa(negocio_id))
  with check (public.is_staff_of(negocio_id) and public.negocio_suscripcion_activa(negocio_id));

create policy "staff_delete_clientes" on public.clientes
  for delete to authenticated
  using (public.is_staff_of(negocio_id) and public.negocio_suscripcion_activa(negocio_id));

drop policy if exists "staff_all_productos" on public.productos;
drop policy if exists "staff_read_productos" on public.productos;
drop policy if exists "staff_write_productos" on public.productos;
drop policy if exists "staff_modify_productos" on public.productos;
drop policy if exists "staff_delete_productos" on public.productos;

create policy "staff_read_productos" on public.productos
  for select to authenticated
  using (public.is_staff_of(negocio_id));

create policy "staff_write_productos" on public.productos
  for insert to authenticated
  with check (public.is_staff_of(negocio_id) and public.negocio_suscripcion_activa(negocio_id));

create policy "staff_modify_productos" on public.productos
  for update to authenticated
  using (public.is_staff_of(negocio_id) and public.negocio_suscripcion_activa(negocio_id))
  with check (public.is_staff_of(negocio_id) and public.negocio_suscripcion_activa(negocio_id));

create policy "staff_delete_productos" on public.productos
  for delete to authenticated
  using (public.is_staff_of(negocio_id) and public.negocio_suscripcion_activa(negocio_id));

drop policy if exists "staff_all_puntos" on public.puntos;
drop policy if exists "staff_read_puntos" on public.puntos;
drop policy if exists "staff_write_puntos" on public.puntos;

create policy "staff_read_puntos" on public.puntos
  for select to authenticated
  using (public.is_staff_of(negocio_id));

create policy "staff_write_puntos" on public.puntos
  for all to authenticated
  using (public.is_staff_of(negocio_id) and public.negocio_suscripcion_activa(negocio_id))
  with check (public.is_staff_of(negocio_id) and public.negocio_suscripcion_activa(negocio_id));

drop policy if exists "staff_all_canjes" on public.canjes;
drop policy if exists "staff_read_canjes" on public.canjes;
drop policy if exists "staff_write_canjes" on public.canjes;

create policy "staff_read_canjes" on public.canjes
  for select to authenticated
  using (public.is_staff_of(negocio_id));

create policy "staff_write_canjes" on public.canjes
  for all to authenticated
  using (public.is_staff_of(negocio_id) and public.negocio_suscripcion_activa(negocio_id))
  with check (public.is_staff_of(negocio_id) and public.negocio_suscripcion_activa(negocio_id));

-- —— Backfill: no dejar fuera a los negocios que ya estaban activos ——
-- Les damos un periodo abierto de 30 días para que puedan pagar sin quedar
-- bloqueados por la migración.
update public.negocios
set current_period_start = coalesce(current_period_start, now()),
    current_period_end = coalesce(current_period_end, now() + interval '30 days')
where subscription_status in ('active', 'trial', 'trialing', 'past_due')
  and current_period_end is null;

-- BarberCloud · aislamiento multi-tenant + roles
-- Ejecutar DESPUÉS de schema.sql y tenant.sql
-- 1) Authentication → Users → Invite/Add (o regístrate en /login.html)
-- 2) SQL Editor → Run este archivo
-- 3) Entra al panel con ese correo. El negocio queda vinculado a tu usuario.

-- —— Columnas de dueño ——
alter table public.negocios add column if not exists owner_id uuid references auth.users (id) on delete set null;
alter table public.negocios add column if not exists whatsapp text default '';
alter table public.negocios add column if not exists onboarding_completed boolean not null default false;

create table if not exists public.negocio_miembros (
  negocio_id uuid not null references public.negocios (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'admin' check (role in ('admin', 'barbero')),
  created_at timestamptz not null default now(),
  primary key (negocio_id, user_id)
);

create index if not exists negocio_miembros_user_idx on public.negocio_miembros (user_id);

alter table public.negocio_miembros enable row level security;

-- —— Helpers (security definer: evitan recursión de RLS) ——
create or replace function public.my_negocio_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.negocio_id
  from public.negocio_miembros m
  where m.user_id = auth.uid();
$$;

create or replace function public.is_staff_of(p_negocio uuid)
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
      and m.role = 'admin'
  );
$$;

create or replace function public.ensure_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_id is not null then
    insert into public.negocio_miembros (negocio_id, user_id, role)
    values (new.id, new.owner_id, 'admin')
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_negocio_owner_member on public.negocios;
create trigger trg_negocio_owner_member
after insert or update of owner_id on public.negocios
for each row execute procedure public.ensure_owner_membership();

-- Puntos: el anónimo no puede inflar el saldo
create or replace function public.lock_anon_cliente_points()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null then
    if tg_op = 'INSERT' then
      new.points := 0;
    elsif tg_op = 'UPDATE' then
      new.points := old.points;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_lock_anon_cliente_points on public.clientes;
create trigger trg_lock_anon_cliente_points
before insert or update on public.clientes
for each row execute procedure public.lock_anon_cliente_points();

-- Stock no puede quedar negativo (dos canjes simultáneos)
create or replace function public.prevent_negative_stock()
returns trigger
language plpgsql
as $$
begin
  if new.stock < 0 then
    raise exception 'stock_negativo';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_negative_stock on public.productos;
create trigger trg_prevent_negative_stock
before insert or update on public.productos
for each row execute procedure public.prevent_negative_stock();

-- —— Quitar políticas abiertas del MVP ——
drop policy if exists "anon_all_negocios" on public.negocios;
drop policy if exists "anon_all_usuarios" on public.usuarios;
drop policy if exists "anon_all_clientes" on public.clientes;
drop policy if exists "anon_all_citas" on public.citas;
drop policy if exists "anon_all_productos" on public.productos;
drop policy if exists "anon_all_inventario" on public.inventario;
drop policy if exists "anon_all_puntos" on public.puntos;
drop policy if exists "anon_all_canjes" on public.canjes;

-- —— Negocios ——
drop policy if exists "public_read_negocios" on public.negocios;
create policy "public_read_negocios" on public.negocios
  for select to anon, authenticated
  using (true);

drop policy if exists "staff_insert_negocios" on public.negocios;
create policy "staff_insert_negocios" on public.negocios
  for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "staff_update_negocios" on public.negocios;
create policy "staff_update_negocios" on public.negocios
  for update to authenticated
  using (public.is_staff_of(id))
  with check (public.is_staff_of(id));

-- —— Miembros ——
drop policy if exists "staff_read_miembros" on public.negocio_miembros;
create policy "staff_read_miembros" on public.negocio_miembros
  for select to authenticated
  using (user_id = auth.uid() or public.is_staff_of(negocio_id));

drop policy if exists "admin_write_miembros" on public.negocio_miembros;
create policy "admin_write_miembros" on public.negocio_miembros
  for all to authenticated
  using (public.is_admin_of(negocio_id))
  with check (public.is_admin_of(negocio_id));

-- —— Citas: staff ve las suyas; el público solo crea (sin leer PII) ——
drop policy if exists "staff_all_citas" on public.citas;
create policy "staff_all_citas" on public.citas
  for all to authenticated
  using (public.is_staff_of(negocio_id))
  with check (public.is_staff_of(negocio_id));

drop policy if exists "anon_insert_citas" on public.citas;
create policy "anon_insert_citas" on public.citas
  for insert to anon
  with check (
    negocio_id is not null
    and exists (
      select 1 from public.negocios n
      where n.id = negocio_id
        and n.subscription_status in ('trial', 'active', 'past_due', 'trialing', 'canceled')
    )
  );

-- —— Clientes / puntos / canjes: solo el staff del negocio ——
drop policy if exists "staff_all_clientes" on public.clientes;
create policy "staff_all_clientes" on public.clientes
  for all to authenticated
  using (public.is_staff_of(negocio_id))
  with check (public.is_staff_of(negocio_id));

drop policy if exists "anon_insert_clientes" on public.clientes;
create policy "anon_insert_clientes" on public.clientes
  for insert to anon
  with check (negocio_id is not null);

drop policy if exists "staff_all_puntos" on public.puntos;
create policy "staff_all_puntos" on public.puntos
  for all to authenticated
  using (public.is_staff_of(negocio_id))
  with check (public.is_staff_of(negocio_id));

drop policy if exists "staff_all_canjes" on public.canjes;
create policy "staff_all_canjes" on public.canjes
  for all to authenticated
  using (public.is_staff_of(negocio_id))
  with check (public.is_staff_of(negocio_id));

-- —— Productos e inventario ——
drop policy if exists "staff_all_productos" on public.productos;
create policy "staff_all_productos" on public.productos
  for all to authenticated
  using (public.is_staff_of(negocio_id))
  with check (public.is_staff_of(negocio_id));

drop policy if exists "staff_all_inventario" on public.inventario;
create policy "staff_all_inventario" on public.inventario
  for all to authenticated
  using (
    exists (
      select 1 from public.productos p
      where p.id = inventario.producto_id
        and public.is_staff_of(p.negocio_id)
    )
  )
  with check (
    exists (
      select 1 from public.productos p
      where p.id = inventario.producto_id
        and public.is_staff_of(p.negocio_id)
    )
  );

drop policy if exists "staff_all_usuarios" on public.usuarios;
create policy "staff_all_usuarios" on public.usuarios
  for all to authenticated
  using (true)
  with check (true);

-- Storage: escritura solo autenticados
drop policy if exists "public_write_productos" on storage.objects;
drop policy if exists "public_update_productos" on storage.objects;
drop policy if exists "public_delete_productos" on storage.objects;
drop policy if exists "public_write_cortes" on storage.objects;
drop policy if exists "public_update_cortes" on storage.objects;
drop policy if exists "public_delete_cortes" on storage.objects;
drop policy if exists "public_write_perfiles" on storage.objects;
drop policy if exists "public_update_perfiles" on storage.objects;
drop policy if exists "public_delete_perfiles" on storage.objects;
drop policy if exists "public_write_documentos" on storage.objects;
drop policy if exists "public_update_documentos" on storage.objects;
drop policy if exists "public_delete_documentos" on storage.objects;

create policy "auth_write_productos" on storage.objects
  for insert to authenticated with check (bucket_id = 'productos');
create policy "auth_update_productos" on storage.objects
  for update to authenticated using (bucket_id = 'productos');
create policy "auth_delete_productos" on storage.objects
  for delete to authenticated using (bucket_id = 'productos');

create policy "auth_write_cortes" on storage.objects
  for insert to authenticated with check (bucket_id = 'cortes');
create policy "auth_update_cortes" on storage.objects
  for update to authenticated using (bucket_id = 'cortes');
create policy "auth_delete_cortes" on storage.objects
  for delete to authenticated using (bucket_id = 'cortes');

create policy "auth_write_perfiles" on storage.objects
  for insert to authenticated with check (bucket_id = 'perfiles');
create policy "auth_update_perfiles" on storage.objects
  for update to authenticated using (bucket_id = 'perfiles');
create policy "auth_delete_perfiles" on storage.objects
  for delete to authenticated using (bucket_id = 'perfiles');

grant select, insert, update, delete on public.negocio_miembros to authenticated;
grant execute on function public.my_negocio_ids() to anon, authenticated;
grant execute on function public.is_staff_of(uuid) to anon, authenticated;
grant execute on function public.is_admin_of(uuid) to authenticated;

-- Ocupación pública (sin nombre ni WhatsApp)
create or replace function public.ocupacion_por_slug(p_slug text)
returns table (fecha date, hora text, duration integer, status text)
language sql
stable
security definer
set search_path = public
as $$
  select c.date as fecha, c."time" as hora, c.duration, c.status
  from public.citas c
  join public.negocios n on n.id = c.negocio_id
  where lower(n.slug) = lower(trim(p_slug))
    and c.status not in ('cancelled', 'canceled', 'rejected');
$$;

create or replace function public.productos_por_slug(p_slug text, p_kind text default null)
returns setof public.productos
language sql
stable
security definer
set search_path = public
as $$
  select p.*
  from public.productos p
  join public.negocios n on n.id = p.negocio_id
  where lower(n.slug) = lower(trim(p_slug))
    and p.active = true
    and (p_kind is null or p.kind = p_kind);
$$;

grant execute on function public.ocupacion_por_slug(text) to anon, authenticated;
grant execute on function public.productos_por_slug(text, text) to anon, authenticated;

-- Filas antiguas sin negocio_id: las asigna al primer negocio (BarberHome).
do $$
declare nid uuid;
begin
  select id into nid from public.negocios order by created_at asc limit 1;
  if nid is not null then
    update public.citas set negocio_id = nid where negocio_id is null;
    update public.clientes set negocio_id = nid where negocio_id is null;
    update public.productos set negocio_id = nid where negocio_id is null;
    update public.puntos set negocio_id = nid where negocio_id is null;
    update public.canjes set negocio_id = nid where negocio_id is null;
  end if;
end $$;

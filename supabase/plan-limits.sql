-- BarberCloud · límites de plan por tenant (Confirmafy-style)
-- Ejecutar DESPUÉS de business-model.sql

create or replace function public.plan_max_citas(p_plan text)
returns integer
language sql
immutable
as $$
  select case lower(coalesce(p_plan, 'pro'))
    when 'free' then 30
    when 'basic' then 50
    when 'pro' then 100
    when 'business' then 300
    else 100
  end;
$$;

create or replace function public.plan_max_clientes(p_plan text)
returns integer
language sql
immutable
as $$
  select case lower(coalesce(p_plan, 'pro'))
    when 'free' then 50
    when 'basic' then 200
    when 'pro' then 500
    when 'business' then null
    else 500
  end;
$$;

create or replace function public.plan_max_barberos(p_plan text)
returns integer
language sql
immutable
as $$
  select case lower(coalesce(p_plan, 'pro'))
    when 'free' then 1
    when 'basic' then 2
    when 'pro' then 5
    when 'business' then 15
    else 5
  end;
$$;

create or replace function public.negocio_citas_mes(p_negocio uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.citas c
  where c.negocio_id = p_negocio
    and date_trunc('month', c.date::timestamp) = date_trunc('month', now())
    and lower(coalesce(c.status, '')) not like '%cancel%';
$$;

create or replace function public.negocio_clientes_total(p_negocio uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.clientes cl
  where cl.negocio_id = p_negocio;
$$;

create or replace function public.negocio_barberos_activos(p_negocio uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.barberos b
  where b.negocio_id = p_negocio
    and b.active = true;
$$;

create or replace function public.enforce_cita_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_max integer;
  v_count integer;
begin
  if new.negocio_id is null then
    return new;
  end if;

  if lower(coalesce(new.status, '')) like '%cancel%' then
    return new;
  end if;

  select n.plan_id into v_plan
  from public.negocios n
  where n.id = new.negocio_id;

  v_max := public.plan_max_citas(v_plan);
  if v_max is null then
    return new;
  end if;

  v_count := public.negocio_citas_mes(new.negocio_id);
  if v_count >= v_max then
    raise exception 'plan_limit_appointments: límite mensual de citas alcanzado (%)', v_max
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_barbero_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_max integer;
  v_count integer;
begin
  if new.negocio_id is null or new.active is not true then
    return new;
  end if;

  select n.plan_id into v_plan
  from public.negocios n
  where n.id = new.negocio_id;

  v_max := public.plan_max_barberos(v_plan);
  if v_max is null then
    return new;
  end if;

  v_count := public.negocio_barberos_activos(new.negocio_id);
  if tg_op = 'UPDATE' and old.active is true and old.negocio_id = new.negocio_id then
    v_count := greatest(v_count - 1, 0);
  end if;

  if v_count >= v_max then
    raise exception 'plan_limit_barbers: límite de barberos alcanzado (%)', v_max
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_cliente_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_max integer;
  v_count integer;
begin
  if new.negocio_id is null then
    return new;
  end if;

  select n.plan_id into v_plan
  from public.negocios n
  where n.id = new.negocio_id;

  v_max := public.plan_max_clientes(v_plan);
  if v_max is null then
    return new;
  end if;

  v_count := public.negocio_clientes_total(new.negocio_id);
  if tg_op = 'UPDATE' and old.negocio_id = new.negocio_id then
    v_count := greatest(v_count - 1, 0);
  end if;

  if v_count >= v_max then
    raise exception 'plan_limit_clients: límite de clientes alcanzado (%)', v_max
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists citas_plan_limit on public.citas;
create trigger citas_plan_limit
  before insert on public.citas
  for each row
  execute function public.enforce_cita_plan_limit();

drop trigger if exists barberos_plan_limit on public.barberos;
create trigger barberos_plan_limit
  before insert or update of active on public.barberos
  for each row
  execute function public.enforce_barbero_plan_limit();

drop trigger if exists clientes_plan_limit on public.clientes;
create trigger clientes_plan_limit
  before insert on public.clientes
  for each row
  execute function public.enforce_cliente_plan_limit();

grant execute on function public.plan_max_citas(text) to anon, authenticated, service_role;
grant execute on function public.plan_max_clientes(text) to anon, authenticated, service_role;
grant execute on function public.plan_max_barberos(text) to anon, authenticated, service_role;
grant execute on function public.negocio_citas_mes(uuid) to anon, authenticated, service_role;
grant execute on function public.negocio_clientes_total(uuid) to anon, authenticated, service_role;
grant execute on function public.negocio_barberos_activos(uuid) to anon, authenticated, service_role;

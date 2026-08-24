-- El API de Vercel usa SUPABASE_SERVICE_ROLE_KEY (rol Postgres: service_role).
-- RLS no aplica a ese rol, PERO sí hacen falta GRANT de tabla.
-- Sin esto PostgREST responde: permission denied for table negocios.

grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all functions in schema public to service_role;

alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on functions to service_role;

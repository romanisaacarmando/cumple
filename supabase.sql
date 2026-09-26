-- Tabla donde la web guarda las listas y las reservas.
-- Pegá este script en Supabase → SQL Editor → New query → Run.

create table if not exists public.kv (
  key text primary key,
  value text not null
);

-- Nadie puede leer ni escribir la tabla desde el navegador:
-- solo el servidor de la web, que usa la clave secreta.
alter table public.kv enable row level security;
revoke all on public.kv from anon, authenticated;

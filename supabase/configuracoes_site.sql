-- WebLab - Configurações editáveis do site da equipe
-- Rode depois de seguranca_multi_tenant.sql.

create extension if not exists pgcrypto;

create table if not exists public.conteudos_site_equipe (
  id uuid primary key default gen_random_uuid(),
  equipe_id uuid not null references public.equipes (id) on delete cascade,
  titulo_publico text,
  resumo_publico text,
  integrantes jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default timezone('utc', now()),
  unique (equipe_id)
);

alter table public.conteudos_site_equipe enable row level security;

grant select, insert, update on public.conteudos_site_equipe to authenticated;

drop policy if exists "conteudos_site_select_scope" on public.conteudos_site_equipe;
create policy "conteudos_site_select_scope"
on public.conteudos_site_equipe
for select
to authenticated
using (public.can_access_team(equipe_id));

drop policy if exists "conteudos_site_insert_admin" on public.conteudos_site_equipe;
create policy "conteudos_site_insert_admin"
on public.conteudos_site_equipe
for insert
to authenticated
with check (public.can_admin_team(equipe_id));

drop policy if exists "conteudos_site_update_admin" on public.conteudos_site_equipe;
create policy "conteudos_site_update_admin"
on public.conteudos_site_equipe
for update
to authenticated
using (public.can_admin_team(equipe_id))
with check (public.can_admin_team(equipe_id));

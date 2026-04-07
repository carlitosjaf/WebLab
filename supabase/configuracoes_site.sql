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

create table if not exists public.avisos_equipe (
  id uuid primary key default gen_random_uuid(),
  equipe_id uuid not null references public.equipes (id) on delete cascade,
  titulo text not null,
  texto text not null,
  categoria text not null default 'Aviso',
  data_evento date,
  link_url text,
  created_by uuid not null references public.perfis (id),
  publicado_em timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint avisos_equipe_categoria_check check (categoria in ('Aviso', 'Evento', 'Publicação', 'Prazo'))
);

create index if not exists avisos_equipe_equipe_publicado_idx
on public.avisos_equipe (equipe_id, publicado_em desc);

alter table public.avisos_equipe enable row level security;

grant select, insert, update, delete on public.avisos_equipe to authenticated;

drop policy if exists "avisos_equipe_select_scope" on public.avisos_equipe;
create policy "avisos_equipe_select_scope"
on public.avisos_equipe
for select
to authenticated
using (public.can_access_team(equipe_id));

drop policy if exists "avisos_equipe_insert_admin" on public.avisos_equipe;
create policy "avisos_equipe_insert_admin"
on public.avisos_equipe
for insert
to authenticated
with check (public.can_admin_team(equipe_id) and created_by = auth.uid());

drop policy if exists "avisos_equipe_update_admin" on public.avisos_equipe;
create policy "avisos_equipe_update_admin"
on public.avisos_equipe
for update
to authenticated
using (public.can_admin_team(equipe_id))
with check (public.can_admin_team(equipe_id));

drop policy if exists "avisos_equipe_delete_admin" on public.avisos_equipe;
create policy "avisos_equipe_delete_admin"
on public.avisos_equipe
for delete
to authenticated
using (public.can_admin_team(equipe_id));

-- WebLab - Fase de Consolidacao e Produto
-- Rode este script no SQL Editor do Supabase antes de usar as novas funcionalidades.

create extension if not exists pgcrypto;

alter table public.equipes
  add column if not exists codigo_convite text;

update public.equipes
set codigo_convite = upper(
  regexp_replace(nome, '[^a-zA-Z0-9]+', '-', 'g')
  || '-'
  || substring(md5(id::text) from 1 for 6)
)
where codigo_convite is null;

alter table public.equipes
  alter column codigo_convite set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'equipes_codigo_convite_key'
  ) then
    alter table public.equipes
      add constraint equipes_codigo_convite_key unique (codigo_convite);
  end if;
end $$;

alter table public.perfis
  drop constraint if exists perfis_role_check;

alter table public.perfis
  add constraint perfis_role_check
  check (role in ('pesquisador', 'coordenador', 'coordenador_geral'));

alter table public.artigos
  add column if not exists updated_at timestamptz default timezone('utc', now()),
  add column if not exists last_editor_id uuid references public.perfis (id);

update public.artigos
set
  updated_at = coalesce(updated_at, timezone('utc', now())),
  last_editor_id = coalesce(last_editor_id, autor_id)
where updated_at is null
   or last_editor_id is null;

alter table public.artigos
  alter column updated_at set default timezone('utc', now());

create table if not exists public.plataforma_brasil_checklists (
  id uuid primary key default gen_random_uuid(),
  equipe_id uuid not null references public.equipes (id) on delete cascade,
  tcle_gerado boolean not null default false,
  cronograma_pronto boolean not null default false,
  orcamento_detalhado boolean not null default false,
  updated_at timestamptz not null default timezone('utc', now()),
  unique (equipe_id)
);

alter table public.plataforma_brasil_checklists enable row level security;

grant select, insert, update on public.plataforma_brasil_checklists to authenticated;

drop policy if exists "team can read checklist" on public.plataforma_brasil_checklists;
create policy "team can read checklist"
on public.plataforma_brasil_checklists
for select
to authenticated
using (
  exists (
    select 1
    from public.perfis
    where perfis.id = auth.uid()
      and (
        perfis.role = 'coordenador_geral'
        or perfis.equipe_id = plataforma_brasil_checklists.equipe_id
      )
  )
);

drop policy if exists "team can write checklist" on public.plataforma_brasil_checklists;
create policy "team can write checklist"
on public.plataforma_brasil_checklists
for insert
to authenticated
with check (
  exists (
    select 1
    from public.perfis
    where perfis.id = auth.uid()
      and (
        perfis.role = 'coordenador_geral'
        or perfis.equipe_id = plataforma_brasil_checklists.equipe_id
      )
  )
);

drop policy if exists "team can update checklist" on public.plataforma_brasil_checklists;
create policy "team can update checklist"
on public.plataforma_brasil_checklists
for update
to authenticated
using (
  exists (
    select 1
    from public.perfis
    where perfis.id = auth.uid()
      and (
        perfis.role = 'coordenador_geral'
        or perfis.equipe_id = plataforma_brasil_checklists.equipe_id
      )
  )
)
with check (
  exists (
    select 1
    from public.perfis
    where perfis.id = auth.uid()
      and (
        perfis.role = 'coordenador_geral'
        or perfis.equipe_id = plataforma_brasil_checklists.equipe_id
      )
  )
);

-- Importante:
-- Revise tambem as policies existentes de artigos/equipes/perfis para refletir:
-- 1. pesquisador -> apenas propria equipe
-- 2. coordenador -> apenas propria equipe
-- 3. coordenador_geral -> acesso global

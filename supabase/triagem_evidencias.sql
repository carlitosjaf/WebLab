-- WebLab - Triagem de evidencias
-- Rode este script depois de seguranca_multi_tenant.sql.

create extension if not exists pgcrypto;

create table if not exists public.triagem_conjuntos (
  id uuid primary key default gen_random_uuid(),
  artigo_id uuid not null references public.artigos (id) on delete cascade,
  equipe_id uuid not null references public.equipes (id) on delete cascade,
  titulo text not null,
  pergunta text not null default '',
  criterios_inclusao text not null default '',
  criterios_exclusao text not null default '',
  created_by uuid not null references public.perfis (id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.triagem_estudos (
  id uuid primary key default gen_random_uuid(),
  conjunto_id uuid not null references public.triagem_conjuntos (id) on delete cascade,
  external_id text not null,
  source text not null default 'OpenAlex',
  titulo text not null,
  autores text[] not null default '{}',
  ano integer,
  doi text,
  periodico text,
  resumo text,
  url text,
  decisao text not null default 'pendente',
  motivo_exclusao text not null default '',
  notas text not null default '',
  added_by uuid not null references public.perfis (id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (conjunto_id, external_id),
  constraint triagem_estudos_decisao_check check (
    decisao in ('pendente', 'incluir', 'excluir', 'talvez')
  )
);

create table if not exists public.triagem_avaliacoes (
  id uuid primary key default gen_random_uuid(),
  estudo_id uuid not null references public.triagem_estudos (id) on delete cascade,
  reviewer_id uuid not null references public.perfis (id),
  decisao text not null default 'pendente',
  motivo_exclusao text not null default '',
  notas text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (estudo_id, reviewer_id),
  constraint triagem_avaliacoes_decisao_check check (
    decisao in ('pendente', 'incluir', 'excluir', 'talvez')
  )
);

create index if not exists triagem_conjuntos_artigo_id_idx
on public.triagem_conjuntos (artigo_id);

create index if not exists triagem_conjuntos_equipe_id_idx
on public.triagem_conjuntos (equipe_id);

create index if not exists triagem_estudos_conjunto_id_idx
on public.triagem_estudos (conjunto_id);

create index if not exists triagem_estudos_decisao_idx
on public.triagem_estudos (decisao);

create index if not exists triagem_avaliacoes_estudo_id_idx
on public.triagem_avaliacoes (estudo_id);

create index if not exists triagem_avaliacoes_reviewer_id_idx
on public.triagem_avaliacoes (reviewer_id);

alter table public.triagem_conjuntos enable row level security;
alter table public.triagem_estudos enable row level security;
alter table public.triagem_avaliacoes enable row level security;

grant select, insert, update, delete on public.triagem_conjuntos to authenticated;
grant select, insert, update, delete on public.triagem_estudos to authenticated;
grant select, insert, update, delete on public.triagem_avaliacoes to authenticated;

drop policy if exists "triagem_conjuntos_select_scope" on public.triagem_conjuntos;
create policy "triagem_conjuntos_select_scope"
on public.triagem_conjuntos
for select
to authenticated
using (public.can_access_team(equipe_id));

drop policy if exists "triagem_conjuntos_insert_scope" on public.triagem_conjuntos;
create policy "triagem_conjuntos_insert_scope"
on public.triagem_conjuntos
for insert
to authenticated
with check (
  created_by = auth.uid()
  and public.can_access_team(equipe_id)
  and exists (
    select 1
    from public.artigos
    where artigos.id = triagem_conjuntos.artigo_id
      and artigos.equipe_id = triagem_conjuntos.equipe_id
      and public.can_access_team(artigos.equipe_id)
  )
);

drop policy if exists "triagem_conjuntos_update_scope" on public.triagem_conjuntos;
create policy "triagem_conjuntos_update_scope"
on public.triagem_conjuntos
for update
to authenticated
using (public.can_access_team(equipe_id))
with check (public.can_access_team(equipe_id));

drop policy if exists "triagem_conjuntos_delete_scope" on public.triagem_conjuntos;
create policy "triagem_conjuntos_delete_scope"
on public.triagem_conjuntos
for delete
to authenticated
using (
  public.can_admin_team(equipe_id)
  or created_by = auth.uid()
);

drop policy if exists "triagem_estudos_select_scope" on public.triagem_estudos;
create policy "triagem_estudos_select_scope"
on public.triagem_estudos
for select
to authenticated
using (
  exists (
    select 1
    from public.triagem_conjuntos
    where triagem_conjuntos.id = triagem_estudos.conjunto_id
      and public.can_access_team(triagem_conjuntos.equipe_id)
  )
);

drop policy if exists "triagem_estudos_insert_scope" on public.triagem_estudos;
create policy "triagem_estudos_insert_scope"
on public.triagem_estudos
for insert
to authenticated
with check (
  added_by = auth.uid()
  and exists (
    select 1
    from public.triagem_conjuntos
    where triagem_conjuntos.id = triagem_estudos.conjunto_id
      and public.can_access_team(triagem_conjuntos.equipe_id)
  )
);

drop policy if exists "triagem_estudos_update_scope" on public.triagem_estudos;
create policy "triagem_estudos_update_scope"
on public.triagem_estudos
for update
to authenticated
using (
  exists (
    select 1
    from public.triagem_conjuntos
    where triagem_conjuntos.id = triagem_estudos.conjunto_id
      and public.can_access_team(triagem_conjuntos.equipe_id)
  )
)
with check (
  exists (
    select 1
    from public.triagem_conjuntos
    where triagem_conjuntos.id = triagem_estudos.conjunto_id
      and public.can_access_team(triagem_conjuntos.equipe_id)
  )
);

drop policy if exists "triagem_estudos_delete_scope" on public.triagem_estudos;
create policy "triagem_estudos_delete_scope"
on public.triagem_estudos
for delete
to authenticated
using (
  exists (
    select 1
    from public.triagem_conjuntos
    where triagem_conjuntos.id = triagem_estudos.conjunto_id
      and (
        public.can_admin_team(triagem_conjuntos.equipe_id)
        or triagem_estudos.added_by = auth.uid()
      )
  )
);

drop policy if exists "triagem_avaliacoes_select_scope" on public.triagem_avaliacoes;
create policy "triagem_avaliacoes_select_scope"
on public.triagem_avaliacoes
for select
to authenticated
using (
  exists (
    select 1
    from public.triagem_estudos
    join public.triagem_conjuntos on triagem_conjuntos.id = triagem_estudos.conjunto_id
    where triagem_estudos.id = triagem_avaliacoes.estudo_id
      and public.can_access_team(triagem_conjuntos.equipe_id)
  )
);

drop policy if exists "triagem_avaliacoes_insert_scope" on public.triagem_avaliacoes;
create policy "triagem_avaliacoes_insert_scope"
on public.triagem_avaliacoes
for insert
to authenticated
with check (
  reviewer_id = auth.uid()
  and exists (
    select 1
    from public.triagem_estudos
    join public.triagem_conjuntos on triagem_conjuntos.id = triagem_estudos.conjunto_id
    where triagem_estudos.id = triagem_avaliacoes.estudo_id
      and public.can_access_team(triagem_conjuntos.equipe_id)
  )
);

drop policy if exists "triagem_avaliacoes_update_scope" on public.triagem_avaliacoes;
create policy "triagem_avaliacoes_update_scope"
on public.triagem_avaliacoes
for update
to authenticated
using (
  reviewer_id = auth.uid()
  and exists (
    select 1
    from public.triagem_estudos
    join public.triagem_conjuntos on triagem_conjuntos.id = triagem_estudos.conjunto_id
    where triagem_estudos.id = triagem_avaliacoes.estudo_id
      and public.can_access_team(triagem_conjuntos.equipe_id)
  )
)
with check (
  reviewer_id = auth.uid()
  and exists (
    select 1
    from public.triagem_estudos
    join public.triagem_conjuntos on triagem_conjuntos.id = triagem_estudos.conjunto_id
    where triagem_estudos.id = triagem_avaliacoes.estudo_id
      and public.can_access_team(triagem_conjuntos.equipe_id)
  )
);

drop policy if exists "triagem_avaliacoes_delete_scope" on public.triagem_avaliacoes;
create policy "triagem_avaliacoes_delete_scope"
on public.triagem_avaliacoes
for delete
to authenticated
using (
  reviewer_id = auth.uid()
  or exists (
    select 1
    from public.triagem_estudos
    join public.triagem_conjuntos on triagem_conjuntos.id = triagem_estudos.conjunto_id
    where triagem_estudos.id = triagem_avaliacoes.estudo_id
      and public.can_admin_team(triagem_conjuntos.equipe_id)
  )
);

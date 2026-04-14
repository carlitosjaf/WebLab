create extension if not exists pgcrypto;

create table if not exists public.artigo_comentarios (
  id uuid primary key default gen_random_uuid(),
  artigo_id uuid not null references public.artigos (id) on delete cascade,
  trecho text not null default '',
  comentario text not null,
  created_by uuid not null default auth.uid() references public.perfis (id) on delete cascade,
  resolvido_por uuid references public.perfis (id) on delete set null,
  resolvido_em timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.artigo_versoes (
  id uuid primary key default gen_random_uuid(),
  artigo_id uuid not null references public.artigos (id) on delete cascade,
  titulo_snapshot text not null,
  conteudo_json jsonb,
  status_snapshot text not null default 'em_rascunho',
  observacao text not null default 'Snapshot manual do manuscrito.',
  created_by uuid not null default auth.uid() references public.perfis (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  constraint artigo_versoes_status_check check (status_snapshot in ('em_rascunho', 'submetido', 'aprovado'))
);

create index if not exists artigo_comentarios_artigo_idx on public.artigo_comentarios (artigo_id, created_at desc);
create index if not exists artigo_versoes_artigo_idx on public.artigo_versoes (artigo_id, created_at desc);

alter table public.artigo_comentarios enable row level security;
alter table public.artigo_versoes enable row level security;

grant select, insert, update, delete on public.artigo_comentarios to authenticated;
grant select, insert, update, delete on public.artigo_versoes to authenticated;

drop policy if exists "artigo_comentarios_select_scope" on public.artigo_comentarios;
create policy "artigo_comentarios_select_scope"
on public.artigo_comentarios
for select
to authenticated
using (
  exists (
    select 1
    from public.artigos
    where artigos.id = artigo_comentarios.artigo_id
      and public.can_view_article(artigos.equipe_id, artigos.status::text)
  )
);

drop policy if exists "artigo_comentarios_insert_scope" on public.artigo_comentarios;
create policy "artigo_comentarios_insert_scope"
on public.artigo_comentarios
for insert
to authenticated
with check (
  created_by = auth.uid()
  and exists (
    select 1
    from public.artigos
    where artigos.id = artigo_comentarios.artigo_id
      and public.can_view_article(artigos.equipe_id, artigos.status::text)
  )
);

drop policy if exists "artigo_comentarios_update_scope" on public.artigo_comentarios;
create policy "artigo_comentarios_update_scope"
on public.artigo_comentarios
for update
to authenticated
using (
  created_by = auth.uid()
  or exists (
    select 1
    from public.artigos
    where artigos.id = artigo_comentarios.artigo_id
      and public.can_edit_article(artigos.equipe_id)
  )
)
with check (
  created_by = auth.uid()
  or exists (
    select 1
    from public.artigos
    where artigos.id = artigo_comentarios.artigo_id
      and public.can_edit_article(artigos.equipe_id)
  )
);

drop policy if exists "artigo_comentarios_delete_scope" on public.artigo_comentarios;
create policy "artigo_comentarios_delete_scope"
on public.artigo_comentarios
for delete
to authenticated
using (
  created_by = auth.uid()
  or exists (
    select 1
    from public.artigos
    where artigos.id = artigo_comentarios.artigo_id
      and public.can_edit_article(artigos.equipe_id)
  )
);

drop policy if exists "artigo_versoes_select_scope" on public.artigo_versoes;
create policy "artigo_versoes_select_scope"
on public.artigo_versoes
for select
to authenticated
using (
  exists (
    select 1
    from public.artigos
    where artigos.id = artigo_versoes.artigo_id
      and public.can_edit_article(artigos.equipe_id)
  )
);

drop policy if exists "artigo_versoes_insert_scope" on public.artigo_versoes;
create policy "artigo_versoes_insert_scope"
on public.artigo_versoes
for insert
to authenticated
with check (
  created_by = auth.uid()
  and exists (
    select 1
    from public.artigos
    where artigos.id = artigo_versoes.artigo_id
      and public.can_edit_article(artigos.equipe_id)
  )
);

drop policy if exists "artigo_versoes_update_scope" on public.artigo_versoes;
create policy "artigo_versoes_update_scope"
on public.artigo_versoes
for update
to authenticated
using (
  created_by = auth.uid()
  and exists (
    select 1
    from public.artigos
    where artigos.id = artigo_versoes.artigo_id
      and public.can_edit_article(artigos.equipe_id)
  )
)
with check (
  created_by = auth.uid()
  and exists (
    select 1
    from public.artigos
    where artigos.id = artigo_versoes.artigo_id
      and public.can_edit_article(artigos.equipe_id)
  )
);

drop policy if exists "artigo_versoes_delete_scope" on public.artigo_versoes;
create policy "artigo_versoes_delete_scope"
on public.artigo_versoes
for delete
to authenticated
using (
  created_by = auth.uid()
  or exists (
    select 1
    from public.artigos
    where artigos.id = artigo_versoes.artigo_id
      and public.can_edit_article(artigos.equipe_id)
  )
);

-- WebLab - Endurecimento de RLS e seguranca multi-tenant
-- Rode este script depois da consolidacao_weblab.sql
-- Ele reseta as policies atuais e recria um modelo explicito:
-- pesquisador -> propria equipe
-- coordenador -> propria equipe
-- coordenador_geral -> acesso global

create extension if not exists pgcrypto;

create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role::text
  from public.perfis
  where id = auth.uid()
$$;

create or replace function public.current_profile_team_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select equipe_id
  from public.perfis
  where id = auth.uid()
$$;

create or replace function public.can_access_team(target_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not null
    and (
      public.current_profile_role() = 'coordenador_geral'
      or public.current_profile_team_id() = target_team_id
    )
$$;

create or replace function public.can_admin_team(target_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not null
    and (
      public.current_profile_role() = 'coordenador_geral'
      or (
        public.current_profile_role() = 'coordenador'
        and public.current_profile_team_id() = target_team_id
      )
    )
$$;

create or replace function public.claim_team_invite(invite_code_input text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_code text;
  target_team_id uuid;
  current_role text;
  current_team_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  normalized_code := upper(trim(invite_code_input));

  if normalized_code is null or normalized_code = '' then
    raise exception 'Codigo de convite invalido.';
  end if;

  select role::text, equipe_id
  into current_role, current_team_id
  from public.perfis
  where id = auth.uid();

  if current_role is null then
    raise exception 'Perfil nao encontrado para o usuario autenticado.';
  end if;

  select id
  into target_team_id
  from public.equipes
  where codigo_convite = normalized_code;

  if target_team_id is null then
    raise exception 'Codigo de convite invalido.';
  end if;

  if current_team_id is not null and current_team_id <> target_team_id and current_role <> 'coordenador_geral' then
    raise exception 'Seu perfil ja esta vinculado a outra equipe.';
  end if;

  update public.perfis
  set
    equipe_id = target_team_id,
    role = case
      when current_role = 'coordenador_geral' then 'coordenador_geral'
      when current_role = 'coordenador' and current_team_id = target_team_id then 'coordenador'
      else 'pesquisador'
    end
  where id = auth.uid();

  return target_team_id;
end;
$$;

grant execute on function public.current_profile_role() to authenticated;
grant execute on function public.current_profile_team_id() to authenticated;
grant execute on function public.can_access_team(uuid) to authenticated;
grant execute on function public.can_admin_team(uuid) to authenticated;
grant execute on function public.claim_team_invite(text) to authenticated;

grant usage on schema public to authenticated;
grant select, insert, update on public.equipes to authenticated;
grant select, update on public.perfis to authenticated;
grant select, insert, update, delete on public.artigos to authenticated;
grant select, insert, update on public.plataforma_brasil_checklists to authenticated;

alter table public.equipes enable row level security;
alter table public.perfis enable row level security;
alter table public.artigos enable row level security;
alter table public.plataforma_brasil_checklists enable row level security;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('equipes', 'perfis', 'artigos', 'plataforma_brasil_checklists')
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end $$;

create policy "equipes_select_scope"
on public.equipes
for select
to authenticated
using (public.can_access_team(id));

create policy "equipes_insert_authenticated"
on public.equipes
for insert
to authenticated
with check (auth.uid() is not null);

create policy "equipes_update_admin"
on public.equipes
for update
to authenticated
using (public.can_admin_team(id))
with check (public.can_admin_team(id));

create policy "perfis_select_scope"
on public.perfis
for select
to authenticated
using (
  id = auth.uid()
  or public.current_profile_role() = 'coordenador_geral'
  or (
    equipe_id is not null
    and equipe_id = public.current_profile_team_id()
  )
);

create policy "perfis_update_self_safe"
on public.perfis
for update
to authenticated
using (
  id = auth.uid()
  or public.current_profile_role() = 'coordenador_geral'
)
with check (
  public.current_profile_role() = 'coordenador_geral'
  or (
    id = auth.uid()
    and (
      (
        public.current_profile_team_id() is null
        and equipe_id is not null
        and role = 'coordenador'
      )
      or (
        equipe_id is not distinct from public.current_profile_team_id()
        and role = public.current_profile_role()
      )
    )
  )
);

create policy "artigos_select_scope"
on public.artigos
for select
to authenticated
using (public.can_access_team(equipe_id));

create policy "artigos_insert_team_member"
on public.artigos
for insert
to authenticated
with check (
  auth.uid() is not null
  and autor_id = auth.uid()
  and coalesce(last_editor_id, auth.uid()) = auth.uid()
  and equipe_id = public.current_profile_team_id()
);

create policy "artigos_update_scope"
on public.artigos
for update
to authenticated
using (public.can_access_team(equipe_id))
with check (
  public.can_access_team(equipe_id)
  and (
    public.current_profile_role() = 'coordenador_geral'
    or last_editor_id = auth.uid()
  )
);

create policy "artigos_delete_admin"
on public.artigos
for delete
to authenticated
using (public.can_admin_team(equipe_id));

create policy "checklist_select_scope"
on public.plataforma_brasil_checklists
for select
to authenticated
using (public.can_access_team(equipe_id));

create policy "checklist_insert_scope"
on public.plataforma_brasil_checklists
for insert
to authenticated
with check (public.can_access_team(equipe_id));

create policy "checklist_update_scope"
on public.plataforma_brasil_checklists
for update
to authenticated
using (public.can_access_team(equipe_id))
with check (public.can_access_team(equipe_id));

-- Consultas de verificacao sugeridas:
-- select tablename, policyname, cmd from pg_policies where schemaname = 'public' order by tablename, policyname;
-- select public.current_profile_role(), public.current_profile_team_id();

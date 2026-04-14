create or replace function public.generate_weblab_invite_code(team_name_input text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_base text;
  suffix text;
begin
  normalized_base := upper(regexp_replace(coalesce(team_name_input, ''), '[^A-Za-z0-9]+', '-', 'g'));
  normalized_base := trim(both '-' from normalized_base);
  normalized_base := left(coalesce(nullif(normalized_base, ''), 'WEBLAB'), 12);
  suffix := upper(substring(md5(clock_timestamp()::text || random()::text || coalesce(team_name_input, '')), 1, 6));

  return normalized_base || '-' || suffix;
end;
$$;

create or replace function public.list_weblab_teams()
returns table (
  id uuid,
  nome text,
  codigo_convite text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  if public.current_profile_role() not in ('coordenador', 'coordenador_geral') then
    raise exception 'Apenas coordenadores podem listar as equipes do laboratorio.';
  end if;

  return query
  select equipes.id, equipes.nome, equipes.codigo_convite
  from public.equipes
  order by equipes.nome;
end;
$$;

create or replace function public.create_weblab_team(team_name_input text)
returns table (
  id uuid,
  nome text,
  codigo_convite text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  trimmed_name text;
  created_team public.equipes%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  if public.current_profile_role() not in ('coordenador', 'coordenador_geral') then
    raise exception 'Apenas coordenadores podem criar equipes.';
  end if;

  trimmed_name := trim(coalesce(team_name_input, ''));

  if trimmed_name = '' then
    raise exception 'O nome da equipe nao pode ficar vazio.';
  end if;

  if exists (
    select 1
    from public.equipes
    where lower(trim(public.equipes.nome)) = lower(trim(trimmed_name))
  ) then
    raise exception 'Ja existe uma equipe com esse nome.';
  end if;

  insert into public.equipes (nome, codigo_convite)
  values (trimmed_name, public.generate_weblab_invite_code(trimmed_name))
  returning * into created_team;

  return query
  select created_team.id, created_team.nome, created_team.codigo_convite;
end;
$$;

create or replace function public.rename_weblab_team(target_team_id uuid, team_name_input text)
returns table (
  id uuid,
  nome text,
  codigo_convite text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  trimmed_name text;
  renamed_team public.equipes%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  if public.current_profile_role() not in ('coordenador', 'coordenador_geral') then
    raise exception 'Apenas coordenadores podem editar equipes.';
  end if;

  trimmed_name := trim(coalesce(team_name_input, ''));

  if trimmed_name = '' then
    raise exception 'O nome da equipe nao pode ficar vazio.';
  end if;

  if exists (
    select 1
    from public.equipes
    where lower(trim(public.equipes.nome)) = lower(trim(trimmed_name))
      and public.equipes.id <> target_team_id
  ) then
    raise exception 'Ja existe uma equipe com esse nome.';
  end if;

  update public.equipes
  set nome = trimmed_name
  where equipes.id = target_team_id
  returning * into renamed_team;

  if renamed_team.id is null then
    raise exception 'Equipe nao encontrada.';
  end if;

  return query
  select renamed_team.id, renamed_team.nome, renamed_team.codigo_convite;
end;
$$;

grant execute on function public.generate_weblab_invite_code(text) to authenticated;
grant execute on function public.list_weblab_teams() to authenticated;
grant execute on function public.create_weblab_team(text) to authenticated;
grant execute on function public.rename_weblab_team(uuid, text) to authenticated;

insert into public.equipes (nome, codigo_convite)
select seeded.nome, public.generate_weblab_invite_code(seeded.nome)
from (
  values
    ('Equipe de Terapias'),
    ('Equipe de Ensino em Saude'),
    ('Equipe de Bioprodutos'),
    ('Equipe de Virologia')
) as seeded(nome)
where not exists (
  select 1
  from public.equipes
  where lower(trim(public.equipes.nome)) = lower(trim(seeded.nome))
);

# Seguranca Multi-tenant do WebLab

## Objetivo
Garantir que:

- `pesquisador` veja apenas a propria equipe
- `coordenador` veja apenas a propria equipe
- `coordenador_geral` tenha visao global
- o codigo de convite nao dependa de leitura ampla da tabela `equipes`

## Ordem recomendada no Supabase

1. Rode [`supabase/consolidacao_weblab.sql`](/C:/Users/juuni/OneDrive/Área%20de%20Trabalho/WebLab%20-%20fiocruz/supabase/consolidacao_weblab.sql)
2. Depois rode [`supabase/seguranca_multi_tenant.sql`](/C:/Users/juuni/OneDrive/Área%20de%20Trabalho/WebLab%20-%20fiocruz/supabase/seguranca_multi_tenant.sql)

## O que o endurecimento faz

- cria funcoes auxiliares de escopo por papel e por equipe
- cria a RPC `claim_team_invite`
- apaga policies antigas das tabelas principais
- recria as policies com um modelo explicito de isolamento

## Fluxos que passam a depender disso

- cadastro com codigo de convite
- dashboard global apenas para `coordenador_geral`
- leitura de artigos por equipe
- exclusao de artigos pelo autor ou por coordenadores
- checklist da Plataforma Brasil por equipe

## Verificacao rapida no SQL Editor

```sql
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

```sql
select proname
from pg_proc
join pg_namespace on pg_proc.pronamespace = pg_namespace.oid
where pg_namespace.nspname = 'public'
  and proname in (
    'current_profile_role',
    'current_profile_team_id',
    'can_access_team',
    'can_admin_team',
    'claim_team_invite'
  );
```

## Testes manuais recomendados

1. entrar com um `pesquisador` de uma equipe
2. confirmar que ele nao ve artigos de outra equipe
3. entrar com um `coordenador`
4. confirmar que ele ainda continua preso a propria equipe
5. entrar com um `coordenador_geral`
6. confirmar que ele ve todas as equipes no dashboard
7. cadastrar um usuario novo com codigo de convite valido
8. confirmar que o perfil cai na equipe correta
9. repetir com codigo invalido e confirmar que o vinculo nao acontece

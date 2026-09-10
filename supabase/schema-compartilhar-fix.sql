-- ══════════════════════════════════════════════════════
-- orçamento. — correção de usar_codigo()
--
-- Cole no SQL Editor do Supabase e clique em Run.
--
-- ── O ERRO ────────────────────────────────────────────
--   column reference "owner_id" is ambiguous
--
-- A função declara `returns table (owner_id uuid, ...)`, e
-- esse nome de saída vira uma variável dentro do corpo. No
-- `on conflict (owner_id, viewer_id)` o Postgres não sabe se
-- `owner_id` é a variável ou a coluna da tabela, e recusa.
--
-- Qualificar não resolve: a lista do ON CONFLICT não aceita
-- prefixo de tabela. A saída é apontar a CONSTRAINT pelo
-- nome — que já existe e é exatamente esse par.
--
-- Só esta função muda; o resto do schema fica como está.
-- ══════════════════════════════════════════════════════

create or replace function public.usar_codigo(p_code text)
returns table (owner_id uuid, owner_email text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
  v_livre text;
begin
  if auth.uid() is null then
    raise exception 'precisa estar autenticado';
  end if;

  select s.user_id into v_owner
  from public.settings s
  where s.share_code = upper(trim(p_code));

  if v_owner is null then
    raise exception 'código não encontrado';
  end if;
  if v_owner = auth.uid() then
    raise exception 'esse código é o seu';
  end if;

  -- primeira cor ainda não usada por este dono
  select c into v_livre
  from unnest(array['rosa','azul','laranja','roxo','amarelo','verde']) as c
  where not exists (
    select 1 from public.economy_shares e
    where e.owner_id = v_owner and e.color = c
  )
  limit 1;

  insert into public.economy_shares (owner_id, viewer_id, color)
  values (v_owner, auth.uid(), coalesce(v_livre, 'rosa'))
  -- pelo NOME da constraint: a lista de colunas seria ambígua
  on conflict on constraint economy_shares_par_unico do nothing;

  return query
    select v_owner, (select u.email::text from auth.users u where u.id = v_owner);
end;
$$;

revoke all on function public.usar_codigo(text) from public;
grant execute on function public.usar_codigo(text) to authenticated;

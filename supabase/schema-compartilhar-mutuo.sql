-- ══════════════════════════════════════════════════════
-- orçamento. — a conexão passa a valer nos dois sentidos
--
-- Cole no SQL Editor do Supabase e clique em Run.
-- Seguro rodar de novo.
--
-- ── O QUE ESTAVA ERRADO ───────────────────────────────
-- `usar_codigo` criava UMA linha: quem digitou passava a ver
-- a economia de quem gerou, e só. Para o contrário, a outra
-- pessoa teria que digitar um segundo código.
--
-- Mas o combinado é "e vice-versa": um código digitado liga
-- os dois. Agora nascem DUAS linhas, uma em cada direção.
--
-- Duas linhas, e não uma valendo nos dois sentidos, porque
-- cada lado tem a sua própria cor — a cor é de quem olha.
-- ══════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════
-- cor_livre() — primeira cor que este espectador ainda não usa
--
-- A busca é por viewer_id porque a cor é de quem olha: duas
-- pessoas que eu vejo nunca saem da mesma cor.
--
-- Vem antes das outras: elas chamam esta.
-- ══════════════════════════════════════════════════════
create or replace function public.cor_livre(p_viewer uuid)
returns text
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select coalesce(
    (select c from unnest(array['rosa','azul','laranja','roxo','amarelo','verde']) as c
      where not exists (
        select 1 from public.economy_shares e
        where e.viewer_id = p_viewer and e.color = c
      )
      limit 1),
    'rosa');
$$;

revoke all on function public.cor_livre(uuid) from public;
-- o Supabase concede a anon por padrão; revoke de PUBLIC não desfaz
revoke execute on function public.cor_livre(uuid) from anon;
grant execute on function public.cor_livre(uuid) to authenticated;

-- ══════════════════════════════════════════════════════
-- AS CONEXÕES QUE JÁ EXISTEM
-- Completa o par que estiver pela metade. Ninguém ganha
-- acesso sem ter havido um código antes: só se fecha o outro
-- lado de um vínculo já aceito.
-- ══════════════════════════════════════════════════════
insert into public.economy_shares (owner_id, viewer_id, color)
select e.viewer_id, e.owner_id, public.cor_livre(e.owner_id)
from public.economy_shares e
where not exists (
  select 1 from public.economy_shares v
  where v.owner_id = e.viewer_id and v.viewer_id = e.owner_id
)
on conflict on constraint economy_shares_par_unico do nothing;

-- ══════════════════════════════════════════════════════
-- usar_codigo() — um código digitado liga os dois lados
-- ══════════════════════════════════════════════════════
create or replace function public.usar_codigo(p_code text)
returns table (owner_id uuid, owner_email text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
  v_eu    uuid := auth.uid();
begin
  if v_eu is null then
    raise exception 'precisa estar autenticado';
  end if;

  select s.user_id into v_owner
  from public.settings s
  where s.share_code = upper(trim(p_code));

  if v_owner is null then
    raise exception 'código não encontrado';
  end if;
  if v_owner = v_eu then
    raise exception 'esse código é o seu';
  end if;

  -- eu vejo a economia dele
  insert into public.economy_shares (owner_id, viewer_id, color)
  values (v_owner, v_eu, public.cor_livre(v_eu))
  on conflict on constraint economy_shares_par_unico do nothing;

  -- e ele vê a minha
  insert into public.economy_shares (owner_id, viewer_id, color)
  values (v_eu, v_owner, public.cor_livre(v_owner))
  on conflict on constraint economy_shares_par_unico do nothing;

  return query
    select v_owner, (select u.email::text from auth.users u where u.id = v_owner);
end;
$$;

revoke all on function public.usar_codigo(text) from public;
-- o Supabase concede a anon por padrão; revoke de PUBLIC não desfaz
revoke execute on function public.usar_codigo(text) from anon;
grant execute on function public.usar_codigo(text) to authenticated;

-- ══════════════════════════════════════════════════════
-- desconectar() — desfaz os DOIS lados
--
-- Sem isto, remover deixaria meia conexão de pé: um continua
-- vendo o outro, sem nada na tela explicando por quê.
--
-- Qualquer um dos dois pode desfazer.
-- ══════════════════════════════════════════════════════
create or replace function public.desconectar(p_share uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_a uuid;
  v_b uuid;
begin
  select e.owner_id, e.viewer_id into v_a, v_b
  from public.economy_shares e
  where e.id = p_share
    and (e.owner_id = auth.uid() or e.viewer_id = auth.uid());

  if v_a is null then
    return;                     -- não é minha; nada a fazer
  end if;

  delete from public.economy_shares e
  where (e.owner_id = v_a and e.viewer_id = v_b)
     or (e.owner_id = v_b and e.viewer_id = v_a);
end;
$$;

revoke all on function public.desconectar(uuid) from public;
-- o Supabase concede a anon por padrão; revoke de PUBLIC não desfaz
revoke execute on function public.desconectar(uuid) from anon;
grant execute on function public.desconectar(uuid) to authenticated;

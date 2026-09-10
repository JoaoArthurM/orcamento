-- ══════════════════════════════════════════════════════
-- orçamento. — apagar a própria conta
--
-- Cole no SQL Editor do Supabase e clique em Run.
-- Roda uma vez só, mas é seguro repetir.
--
-- ── PARA QUE SERVE ────────────────────────────────────
-- O botão "Apagar conta" dos Ajustes precisa remover a linha
-- do usuário em auth.users. A chave que o site carrega é a
-- publishable — ela não apaga usuário, e a service_role não
-- pode viver num site estático, onde qualquer um leria.
--
-- A saída é esta função: ela roda com os poderes de quem a
-- criou (security definer), mas só apaga `auth.uid()` — quem
-- chamou. Não há parâmetro, então não há como pedir a conta
-- de outra pessoa.
--
-- ── O RESTO SAI SOZINHO ───────────────────────────────
-- Todas as tabelas do app referenciam auth.users(id) com
-- `on delete cascade`: entries, settings, loans, accounts,
-- favors e favor_payments. Apagar o usuário leva junto cada
-- linha dele. Por isso o app NÃO apaga tabela por tabela
-- antes — apagar antes de confirmar seria o pior dos mundos:
-- dados perdidos e conta de pé.
--
-- ── SEARCH_PATH VAZIO, DE PROPÓSITO ───────────────────
-- `set search_path = ''` obriga a qualificar `auth.users` por
-- inteiro. Sem isso, uma função definer aceita o schema que
-- vier de fora e passa a ser um caminho de escalada.
-- ══════════════════════════════════════════════════════

create or replace function public.delete_user()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'sem sessão' using errcode = '42501';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

comment on function public.delete_user() is
  'Apaga a conta de quem chama. O cascade de auth.users leva os dados junto.';

-- visitante não autenticado não tem o que apagar; fechar mesmo assim
revoke execute on function public.delete_user() from public;
revoke execute on function public.delete_user() from anon;
grant  execute on function public.delete_user() to authenticated;

-- ── CONFERIR DEPOIS DE RODAR ──────────────────────────
-- O dono precisa ser um papel com permissão em auth.users
-- (postgres, normalmente) — é dele que vem o poder do
-- security definer. Se o app disser "permissão negada ao
-- apagar", é aqui que aparece:
--
--   select p.proname,
--          pg_get_userbyid(p.proowner) as dono,
--          p.prosecdef                 as definer
--     from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname = 'delete_user';

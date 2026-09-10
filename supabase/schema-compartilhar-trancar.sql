-- ══════════════════════════════════════════════════════
-- orçamento. — trancar as funções para quem não tem sessão
--
-- Cole no SQL Editor do Supabase e clique em Run.
-- Seguro rodar de novo.
--
-- ── O QUE FALTOU ──────────────────────────────────────
-- Os arquivos anteriores fizeram:
--
--   revoke all on function ... from public;
--   grant execute on function ... to authenticated;
--
-- Mas o Supabase concede EXECUTE ao papel `anon` por padrão,
-- e um grant explícito a `anon` não some com um revoke de
-- PUBLIC. Resultado: as cinco funções respondiam a qualquer
-- um com a chave pública.
--
-- Nenhuma vazava dado — todas filtram por auth.uid(), que é
-- nulo sem sessão. Mas isso é defesa por acidente. São
-- funções SECURITY DEFINER: rodam com os poderes do dono, e
-- não devem estar ao alcance de quem não entrou.
-- ══════════════════════════════════════════════════════

revoke execute on function public.pode_ver_economia(uuid) from anon;
revoke execute on function public.cor_livre(uuid)         from anon;
revoke execute on function public.minhas_conexoes()       from anon;
revoke execute on function public.desconectar(uuid)       from anon;
revoke execute on function public.trocar_cor(uuid, text)  from anon;
revoke execute on function public.gerar_codigo()          from anon;
revoke execute on function public.usar_codigo(text)       from anon;

-- `authenticated` continua com tudo: é quem o app usa depois do login.
grant execute on function public.pode_ver_economia(uuid) to authenticated;
grant execute on function public.cor_livre(uuid)         to authenticated;
grant execute on function public.minhas_conexoes()       to authenticated;
grant execute on function public.desconectar(uuid)       to authenticated;
grant execute on function public.trocar_cor(uuid, text)  to authenticated;
grant execute on function public.gerar_codigo()          to authenticated;
grant execute on function public.usar_codigo(text)       to authenticated;

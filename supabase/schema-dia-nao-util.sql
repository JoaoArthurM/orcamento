-- ══════════════════════════════════════════════════════
-- orçamento. — para que lado a data anda  [OBSOLETO]
--
-- ESTA COLUNA NÃO É MAIS USADA. A direção deixou de ser uma escolha:
-- a data vai para o dia de pagamento MAIS PRÓXIMO, e a distância
-- decide sozinha (sábado vem para a sexta, domingo vai para a
-- segunda). Ver supabase/schema-dias-pagamento.sql.
--
-- O arquivo fica para quem já o rodou: a coluna é inofensiva e
-- derrubá-la exigiria uma migração de risco por nada.
--
-- Cole no SQL Editor do Supabase e clique em Run.
-- Roda uma vez só, mas é seguro repetir.
--
-- Depende de supabase/schema-dias-uteis.sql.
--
-- ── POR QUE ISTO TAMBÉM É CONFIGURÁVEL ────────────────
-- Saber quais dias a empresa conta como úteis não basta. Quando o
-- pagamento cai num dia que não é útil, umas empresas adiantam e
-- outras adiam — e as duas existem:
--
--   • adiantar: caiu no sábado ou domingo, paga na sexta;
--   • adiar:    caiu no sábado ou domingo, paga na segunda.
--
-- O app só sabia adiantar. Para quem recebe na segunda, o razão
-- mostrava o dinheiro entrando dois dias antes do que entra — e,
-- num fim de semana virando o mês, no mês errado.
-- ══════════════════════════════════════════════════════

alter table public.settings
  add column if not exists dia_nao_util text not null default 'antes'
    check (dia_nao_util in ('antes', 'depois'));

comment on column public.settings.dia_nao_util is
  'Para onde a data anda quando cai em dia não útil: "antes" volta ao '
  'último dia útil (paga na sexta), "depois" avança para o próximo '
  '(paga na segunda).';

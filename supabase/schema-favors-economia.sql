-- ══════════════════════════════════════════════════════
-- orçamento. — favor que entra na projeção
--
-- Cole no SQL Editor do Supabase e clique em Run.
-- Roda uma vez só, mas é seguro repetir.
--
-- Depende de supabase/schema-favors-vencimento.sql (due_on).
--
-- Igual ao `to_savings` de `loans`: marcado, o que falta
-- receber aparece no simulador no mês do vencimento.
--
-- ── SEM CHECK DE due_on AQUI ──────────────────────────
-- Marcar exige data de pagamento, e quem cobra isso é a
-- tela: lá dá para dizer o porquê e pôr o foco no campo.
-- Uma constraint recusaria a linha com um erro que o
-- usuário não entenderia, depois de ele já ter digitado
-- tudo. E a tela precisaria da mesma validação de qualquer
-- jeito, para não deixar salvar.
-- ══════════════════════════════════════════════════════

alter table public.favors
  add column if not exists to_savings boolean not null default false;

comment on column public.favors.to_savings is
  'Marcado: o que falta receber entra na projeção, no mês do due_on. Exige due_on — cobrado na tela.';

create index if not exists favors_to_savings_idx
  on public.favors (user_id, to_savings) where to_savings;

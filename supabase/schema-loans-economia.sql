-- ══════════════════════════════════════════════════════
-- orçamento. — empréstimo que entra na projeção
--
-- Cole no SQL Editor do Supabase e clique em Run.
-- Roda uma vez só, mas é seguro repetir.
--
-- Depende de supabase/schema-loans.sql.
--
-- ── PARA QUE SERVE ────────────────────────────────────
-- Nem todo empréstimo é dinheiro que se planeja gastar. Uns
-- voltam e viram poupança; outros só voltam.
--
-- Marcado aqui, o que está para receber aparece no simulador
-- como renda do tipo "empréstimo", no mês em que deve entrar.
--
-- ── FALSO POR PADRÃO ──────────────────────────────────
-- Ligar isso em tudo que já existe mudaria a projeção de quem
-- nunca pediu. Quem quiser marca empréstimo por empréstimo.
-- ══════════════════════════════════════════════════════

alter table public.loans
  add column if not exists to_savings boolean not null default false;

comment on column public.loans.to_savings is
  'Marcado: o que falta receber entra na projeção do simulador. A linha é derivada na tela, nunca vira registro em entries.';

create index if not exists loans_to_savings_idx
  on public.loans (user_id, to_savings) where to_savings;

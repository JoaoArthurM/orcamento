-- ══════════════════════════════════════════════════════
-- orçamento. — o dia da conta fixa vira opcional
--
-- Cole no SQL Editor do Supabase e clique em Run.
-- Roda uma vez só, mas é seguro repetir.
--
-- Depende de supabase/schema-accounts.sql.
--
-- ── O QUE ESTAVA ACONTECENDO ──────────────────────────
-- A restrição `accounts_kind_fields` exigia `due_day` na conta fixa.
-- Com o dia em branco passando a significar "5º dia útil", salvar uma
-- conta fixa sem dia devolvia 400 do PostgREST e a tela dizia só
-- "erro ao sincronizar" — o dado ficava no aparelho e não subia.
--
-- A coluna `due_day` em si nunca restringiu o tipo: ela já aceitava
-- qualquer kind, e era só o CHECK de coerência que amarrava.
-- ══════════════════════════════════════════════════════

alter table public.accounts
  drop constraint if exists accounts_kind_fields;

alter table public.accounts
  add constraint accounts_kind_fields check (
    -- A renda continua precisando da frequência: sem ela não há como
    -- converter semanal e quinzenal em mês, e a conta viraria zero.
        (kind = 'renda' and frequency is not null)
     or (kind in ('fixa', 'variavel', 'assinatura', 'economia'))
  );

comment on column public.accounts.due_day is
  'Dia do mês em que a conta acontece. Nulo = 5º dia útil, pelos dias '
  'úteis configurados em settings.dias_uteis.';

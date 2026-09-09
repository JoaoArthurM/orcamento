-- ══════════════════════════════════════════════════════
-- orçamento. — acrescenta o tipo "economia" às contas
--
-- Rode ISTO se você já criou a tabela accounts com
-- supabase/schema-accounts.sql antes desta versão.
-- (Numa instalação nova, schema-accounts.sql já vem com o tipo.)
--
-- Cole no SQL Editor e clique em Run. Seguro rodar de novo.
-- ══════════════════════════════════════════════════════

-- ── 1. o tipo passa a ser aceito ───────────────────────
alter table public.accounts drop constraint if exists accounts_kind_check;
alter table public.accounts add constraint accounts_kind_check
  check (kind in ('renda','fixa','variavel','assinatura','economia'));

-- ── 2. economia não exige campo extra, como as assinaturas ──
alter table public.accounts drop constraint if exists accounts_kind_fields;
alter table public.accounts add constraint accounts_kind_fields check (
      (kind = 'renda'      and frequency is not null)
   or (kind = 'fixa'       and due_day   is not null)
   or (kind = 'variavel')
   or (kind = 'assinatura')
   or (kind = 'economia')
);

-- ── 3. o resumo passa a separar o que é guardado ───────
-- CREATE OR REPLACE só acrescenta coluna no fim; como a ordem mudou,
-- a view é recriada. Nada depende dela além do SQL Editor.
drop view if exists public.contas_resumo;
create view public.contas_resumo as
select
  user_id,
  coalesce(sum(case when kind = 'renda' then amount * case frequency
        when 'semanal'   then 4.345
        when 'quinzenal' then 2
        when 'anual'     then 1.0 / 12
        when 'pontual'   then 0
        else 1 end end), 0)                                  as renda_mensal,
  coalesce(sum(amount) filter (where kind = 'fixa'), 0)       as contas_fixas,
  coalesce(sum(amount) filter (where kind = 'variavel'), 0)   as contas_variaveis,
  coalesce(sum(amount) filter (where kind = 'assinatura'), 0) as assinaturas,
  coalesce(sum(amount) filter (where kind = 'assinatura'), 0) * 12 as assinaturas_ano,
  coalesce(sum(amount) filter (where kind = 'economia'), 0)   as economia,
  coalesce(sum(amount) filter (where kind = 'economia'), 0) * 12 as economia_ano,
  count(*) filter (where kind = 'renda')                      as fontes_renda,
  count(*) filter (where kind = 'fixa' and not paid)          as fixas_em_aberto
from public.accounts
group by user_id;

alter view public.contas_resumo set (security_invoker = on);

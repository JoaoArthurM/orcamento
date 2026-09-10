-- ══════════════════════════════════════════════════════
-- orçamento. — favores: data de vencimento
--
-- Cole no SQL Editor do Supabase e clique em Run.
-- Roda uma vez só, mas é seguro repetir.
--
-- Depende de supabase/schema-favors.sql.
--
-- ── O QUE FALTAVA ─────────────────────────────────────
-- O favor guardava só `lent_on`: o dia em que o dinheiro
-- saiu. Não havia onde dizer QUANDO ela combinou de pagar,
-- então não dava para saber o que está atrasado.
--
-- É a mesma ideia do `due_on` de `loans`.
--
-- ── NULO DE PROPÓSITO ─────────────────────────────────
-- Sem default: favor sem prazo é normal ("me deve, paga
-- quando puder"), e um default poria a data da migração em
-- todo favor que já existe — inventando um atraso que
-- ninguém combinou.
-- ══════════════════════════════════════════════════════

alter table public.favors add column if not exists due_on date;

comment on column public.favors.due_on is
  'Quando ela combinou de pagar. Nulo = sem prazo. O atraso é derivado na tela.';

create index if not exists favors_due_on_idx on public.favors (user_id, due_on);

-- ══════════════════════════════════════════════════════
-- CONSULTA DE APOIO
-- Ganha o vencimento mais próximo em aberto e a contagem de
-- atrasados, para conferir os mesmos números da tela.
--
-- O atraso olha o que a pessoa ainda deve: se ela já quitou
-- tudo, favor vencido não é atraso nenhum.
--
-- CREATE OR REPLACE só acrescenta coluna no fim; para mudar
-- o miolo é drop + create.
-- ══════════════════════════════════════════════════════
drop view if exists public.favores_por_pessoa;
create view public.favores_por_pessoa as
with devido as (
  select user_id, lower(trim(person)) as chave,
         min(person) as person, count(*) as favores,
         coalesce(sum(amount), 0) as total, min(lent_on) as desde,
         min(due_on) filter (where due_on is not null)      as proximo_vencimento,
         count(*) filter (where due_on is not null
                            and due_on < current_date)      as vencidos
  from public.favors group by user_id, lower(trim(person))
),
recebido as (
  -- só o que entrou de verdade: parcela combinada ainda não abate nada
  select user_id, lower(trim(person)) as chave,
         coalesce(sum(amount), 0) as pago, max(paid_on) as ultimo_pagamento
  from public.favor_payments where status = 'pago'
  group by user_id, lower(trim(person))
),
previsto as (
  select user_id, lower(trim(person)) as chave,
         coalesce(sum(amount), 0) as a_receber, min(paid_on) as proxima
  from public.favor_payments where status = 'previsto'
  group by user_id, lower(trim(person))
)
select
  d.user_id, d.person, d.favores, d.total,
  coalesce(r.pago, 0)                                as pago,
  greatest(d.total - coalesce(r.pago, 0), 0)         as falta,
  greatest(coalesce(r.pago, 0) - d.total, 0)         as credito,
  case when d.total > 0
       then round(least(coalesce(r.pago, 0), d.total) * 100 / d.total, 1)
       else 0 end                                    as pct_pago,
  d.desde, r.ultimo_pagamento,
  coalesce(v.a_receber, 0)                           as combinado_a_receber,
  v.proxima                                          as proxima_parcela,
  d.proximo_vencimento,
  -- vencido só conta enquanto sobrar dívida
  case when d.total - coalesce(r.pago, 0) > 0
       then d.vencidos else 0 end                    as vencidos
from devido d
left join recebido r on r.user_id = d.user_id and r.chave = d.chave
left join previsto v on v.user_id = d.user_id and v.chave = d.chave;

alter view public.favores_por_pessoa set (security_invoker = on);

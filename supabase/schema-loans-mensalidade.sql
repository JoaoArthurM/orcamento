-- ══════════════════════════════════════════════════════
-- orçamento. — empréstimo por mensalidade: o juro não quita
--
-- Cole no SQL Editor do Supabase e clique em Run.
-- Roda uma vez só, mas é seguro repetir.
--
-- Depende de supabase/schema-loans.sql.
--
-- ── O QUE ESTAVA ERRADO ───────────────────────────────
-- A mensalidade era somada ao total a receber: 2.500 de
-- principal + 300 de mensalidade = 2.800. E cada 300 que
-- entrava abatia esse 2.800.
--
-- Só que na mensalidade o combinado é outro. Os 300 por mês
-- são JURO: entram todo mês, indefinidamente, e não diminuem
-- em nada a dívida. A dívida continua sendo os 2.500, e só
-- morre quando os 2.500 voltarem.
--
-- Pelo modelo antigo, quem pagasse 300 por nove meses teria
-- "quitado" 2.700 de 2.800 — quando na verdade ainda deve os
-- 2.500 inteiros.
--
-- ── O QUE MUDA ────────────────────────────────────────
-- `received` passa a ser SÓ principal devolvido — é ele que
-- fecha o empréstimo. As mensalidades vão para uma coluna
-- própria, `received_interest`, que só acumula.
--
-- Para method='mensal', total_due passa a ser o principal.
-- Para 'avista' e 'parcelado' nada muda.
-- ══════════════════════════════════════════════════════

-- ── coluna nova ────────────────────────────────────────
alter table public.loans
  add column if not exists received_interest numeric(14,2) not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'loans_received_interest_nao_negativo'
  ) then
    alter table public.loans
      add constraint loans_received_interest_nao_negativo check (received_interest >= 0);
  end if;
end
$$;

comment on column public.loans.received_interest is
  'Mensalidades já recebidas. É juro: acumula sem limite e nunca abate o principal.';

-- ══════════════════════════════════════════════════════
-- MIGRAÇÃO
-- Num empréstimo de mensalidade, o que está hoje em
-- `received` é mensalidade que já entrou — era o único campo
-- que existia para isso. Então ele muda de coluna.
--
-- A trava do "roda de novo": só migra enquanto total_due
-- ainda estiver inflado pela mensalidade.
-- ══════════════════════════════════════════════════════
update public.loans
   set received_interest = received_interest + received,
       received          = 0,
       total_due         = principal
 where method = 'mensal'
   and total_due > principal;

-- ══════════════════════════════════════════════════════
-- CONSULTA DE APOIO
-- Precisa ser refeita: `recebido` somava só `received`, que
-- agora deixou metade do dinheiro de fora.
--
-- CREATE OR REPLACE só acrescenta coluna no fim; para mudar
-- o miolo é drop + create.
-- ══════════════════════════════════════════════════════
drop view if exists public.loans_resumo;
create view public.loans_resumo as
select
  user_id,
  count(*)                                              as total,
  count(*) filter (where received < total_due)          as ativos,
  -- empréstimo de mensalidade não atrasa: é aberto por natureza,
  -- e a data ali é só a previsão do acerto final
  count(*) filter (where received < total_due
                     and method <> 'mensal'
                     and due_on is not null
                     and due_on < current_date)         as atrasados,
  coalesce(sum(total_due), 0)                           as a_receber,
  -- juro de mensalidade é o que já entrou; nos outros, a diferença
  coalesce(sum(case when method = 'mensal'
                    then received_interest
                    else total_due - principal end), 0) as juros,
  coalesce(sum(received + received_interest), 0)        as recebido,
  coalesce(sum(total_due - received), 0)                as em_aberto,
  coalesce(sum(received_interest), 0)                   as mensalidades_recebidas
from public.loans
group by user_id;

alter view public.loans_resumo set (security_invoker = on);

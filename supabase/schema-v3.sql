-- ══════════════════════════════════════════════════════
-- orçamento. — v3: pagamento por mês + ordem do hub por usuário
--
-- Um booleano não sabe de que mês ele é: uma conta marcada em
-- setembro continuaria "paga" em outubro. Trocamos por uma DATA,
-- e a tela deriva o estado comparando com o mês corrente — assim
-- toda conta fixa reabre sozinha na virada do mês, sem rotina
-- agendada nem nada rodando por trás.
--
-- Também guarda a ordem dos módulos do hub na conta, para ela
-- acompanhar o usuário entre aparelhos.
--
-- Cole no SQL Editor e clique em Run. Seguro rodar de novo.
-- ══════════════════════════════════════════════════════

-- ── 1. a nova coluna ───────────────────────────────────
alter table public.accounts add column if not exists paid_on date;

-- ── 2. quem estava marcado como pago vira pago hoje ────
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'accounts' and column_name = 'paid'
  ) then
    update public.accounts
       set paid_on = current_date
     where kind = 'fixa' and paid is true and paid_on is null;
  end if;
end
$$;

-- ── 3. a view precisa sair antes da coluna que ela usa ──
drop view if exists public.contas_resumo;

-- ── 4. o booleano some ─────────────────────────────────
alter table public.accounts drop column if exists paid;

-- ── 5. resumo refeito sobre a data ─────────────────────
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
  -- em aberto = sem data de pagamento OU pago num mês anterior
  count(*) filter (
    where kind = 'fixa'
      and (paid_on is null or date_trunc('month', paid_on) <> date_trunc('month', current_date))
  )                                                           as fixas_em_aberto
from public.accounts
group by user_id;

alter view public.contas_resumo set (security_invoker = on);

-- ══════════════════════════════════════════════════════
-- ORDEM DOS MÓDULOS NO HUB
-- Fica na conta, não no aparelho: reordenar no celular
-- vale também no computador.
-- ══════════════════════════════════════════════════════
alter table public.settings add column if not exists hub_order text[];

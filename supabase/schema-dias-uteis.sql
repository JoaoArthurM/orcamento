-- ══════════════════════════════════════════════════════
-- orçamento. — quais dias a empresa conta como úteis
--
-- Cole no SQL Editor do Supabase e clique em Run.
-- Roda uma vez só, mas é seguro repetir.
--
-- Depende de supabase/schema.sql.
--
-- ── POR QUE ISTO É CONFIGURÁVEL ───────────────────────
-- O "5º dia útil" não é uma data: é uma contagem, e quem conta é a
-- empresa. Comércio que abre sábado paga num dia; escritório de
-- segunda a sexta paga noutro. O app chutava "todo dia menos domingo"
-- e errava a data de salário de quem trabalha em escritório.
--
-- A mesma lista resolve o outro caso: um pagamento marcado para um
-- dia que não é útil não cai naquele dia — ele volta para o último
-- dia útil antes dele, porque é quando o dinheiro entra de verdade.
-- ══════════════════════════════════════════════════════

alter table public.settings
  -- 0 = domingo … 6 = sábado. Padrão: segunda a sexta.
  add column if not exists dias_uteis smallint[] not null default '{1,2,3,4,5}';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'settings_dias_uteis_validos'
  ) then
    alter table public.settings
      add constraint settings_dias_uteis_validos
      check (
        -- pelo menos um dia útil: uma lista vazia faria a contagem
        -- do 5º dia útil nunca terminar
        cardinality(dias_uteis) between 1 and 7
        and dias_uteis <@ array[0,1,2,3,4,5,6]::smallint[]
      );
  end if;
end
$$;

comment on column public.settings.dias_uteis is
  'Dias da semana que contam como úteis (0=domingo … 6=sábado). Padrão seg-sex.';

-- ══════════════════════════════════════════════════════
-- orçamento. — contar e receber são coisas diferentes
--
-- Cole no SQL Editor do Supabase e clique em Run.
-- Roda uma vez só, mas é seguro repetir.
--
-- Depende de supabase/schema-dias-uteis.sql.
--
-- ── O QUE ESTAVA ERRADO ───────────────────────────────
-- `dias_uteis` fazia dois trabalhos que não são o mesmo:
--
--   1. QUAIS DIAS CONTAM para chegar ao 5º dia útil;
--   2. EM QUAIS DIAS o dinheiro efetivamente cai.
--
-- Quem trabalha de segunda a sábado conta o sábado (1), mas não
-- recebe no sábado (2) — recebe na sexta ou na segunda. Com uma
-- lista só, marcar o sábado acertava a contagem e fazia o app achar
-- que o pagamento podia cair ali; desmarcar acertava o pagamento e
-- errava a contagem, jogando o 5º útil para outro dia.
--
-- São duas listas porque são duas perguntas.
-- ══════════════════════════════════════════════════════

alter table public.settings
  -- 0 = domingo … 6 = sábado. Em quais dias o dinheiro cai.
  add column if not exists dias_pagamento smallint[] not null default '{1,2,3,4,5}';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'settings_dias_pagamento_validos'
  ) then
    alter table public.settings
      add constraint settings_dias_pagamento_validos
      check (
        -- pelo menos um: sem nenhum dia de pagamento, o deslocamento
        -- de data giraria para sempre procurando um que não existe
        cardinality(dias_pagamento) between 1 and 7
        and dias_pagamento <@ array[0,1,2,3,4,5,6]::smallint[]
      );
  end if;
end
$$;

comment on column public.settings.dias_uteis is
  'Dias que CONTAM para chegar ao 5º dia útil (0=domingo … 6=sábado).';
comment on column public.settings.dias_pagamento is
  'Dias em que o dinheiro CAI. Quando a data calculada não está aqui, '
  'ela anda para o lado escolhido em dia_nao_util.';

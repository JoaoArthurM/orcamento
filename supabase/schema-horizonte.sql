-- ══════════════════════════════════════════════════════
-- orçamento. — horizonte da projeção
--
-- Cole no SQL Editor do Supabase e clique em Run.
-- Roda uma vez só, mas é seguro repetir.
--
-- Depende de supabase/schema.sql.
--
-- A projeção era fixa em 12 meses. Agora o usuário escolhe
-- (12, 24, 48…) e a escolha o segue entre aparelhos.
-- ══════════════════════════════════════════════════════

alter table public.settings
  add column if not exists horizon_months integer not null default 12;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'settings_horizonte_valido'
  ) then
    alter table public.settings
      add constraint settings_horizonte_valido
      check (horizon_months between 1 and 120);
  end if;
end
$$;

comment on column public.settings.horizon_months is
  'Quantos meses a projeção do simulador cobre. Padrão 12.';

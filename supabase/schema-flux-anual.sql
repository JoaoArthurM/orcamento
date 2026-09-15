-- ══════════════════════════════════════════════════════
-- orçamento. — repetição anual no FLUX
--
-- Cole no SQL Editor do Supabase e clique em Run.
-- Roda uma vez só, mas é seguro repetir.
--
-- Depende de supabase/schema-flux.sql.
--
-- O razão nasceu com mensal, semanal e diária. Falta o que se paga
-- uma vez por ano — IPVA, seguro, anuidade — e que hoje só entraria
-- como doze lançamentos soltos ou como um mensal errado.
-- ══════════════════════════════════════════════════════

alter table public.flux_entries
  drop constraint if exists flux_entries_repeat_freq_check;

alter table public.flux_entries
  add constraint flux_entries_repeat_freq_check
  check (repeat_freq is null or repeat_freq in ('mensal','semanal','diaria','anual'));

comment on column public.flux_entries.repeat_freq is
  'Como o movimento se repete. Nulo = acontece uma vez só, em on_date.';

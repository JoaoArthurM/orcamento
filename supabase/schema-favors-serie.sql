-- ══════════════════════════════════════════════════════
-- orçamento. — favores: identificar a série de repetição
--
-- Cole no SQL Editor do Supabase e clique em Run.
-- Roda uma vez só, mas é seguro repetir.
--
-- Depende de supabase/schema-favors.sql.
--
-- ── PARA QUE SERVE ────────────────────────────────────
-- "Me paga 500 por 9 meses" cria nove favores independentes,
-- cada um com o seu vencimento. Sem nada que os ligue, só dá
-- para excluir um de cada vez.
--
-- Com `series_id` iguais, a tela pode oferecer as três saídas
-- que se espera de algo que se repete:
--
--   • excluir só este
--   • excluir este e os próximos
--   • excluir todos
--
-- ── SEM BACKFILL, DE PROPÓSITO ────────────────────────
-- Dava para tentar adivinhar as séries que já existem —
-- mesma pessoa, mesmo motivo, mesmo valor, vencimentos em
-- meses seguidos. Não vamos.
--
-- Os favores criados antes da correção do `lent_on` estão com
-- a data de saída errada, então qualquer assinatura estaria
-- apoiada em dado que já se sabe corrompido. Um palpite errado
-- juntaria favores que nada têm a ver, e o "excluir todos"
-- apagaria linha que o usuário nunca associou.
--
-- Favor antigo fica como avulso — que é exatamente o que é um
-- favor sem série conhecida. A partir daqui, quem nasce
-- repetido nasce com a série marcada.
-- ══════════════════════════════════════════════════════

alter table public.favors add column if not exists series_id uuid;

comment on column public.favors.series_id is
  'Liga os favores criados de uma vez por "repete por N meses". Nulo = avulso.';

create index if not exists favors_series_idx on public.favors (user_id, series_id, due_on);

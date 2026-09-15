-- ══════════════════════════════════════════════════════
-- orçamento. — cartões do FLUX
--
-- Cole este arquivo no SQL Editor do Supabase e clique em Run.
-- É seguro rodar de novo: tudo é "if not exists".
--
-- Depende de supabase/schema-flux.sql.
--
-- ── POR QUE UMA TABELA SÓ PARA ISTO ───────────────────
-- Um gasto no cartão não sai do bolso no dia da compra: ele sai no
-- dia em que a fatura vence, e qual fatura ele pegou depende do dia
-- de fechamento. Sem guardar fechamento e vencimento, o razão
-- mostraria o dinheiro saindo no dia errado — às vezes um mês antes.
-- ══════════════════════════════════════════════════════

create table if not exists public.flux_cards (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users(id) on delete cascade,

  name          text        not null check (length(trim(name)) > 0 and length(name) <= 60),

  -- Dias do mês. 1-31: quando o mês for mais curto, quem encolhe para
  -- o último dia é o app — guardar 31 e mostrar 28 é honesto, guardar
  -- 28 perderia a informação de que o combinado é "todo dia 31".
  closing_day   integer     not null check (closing_day between 1 and 31),
  due_day       integer     not null check (due_day between 1 and 31),

  position      integer     not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists flux_cards_user_idx on public.flux_cards (user_id, position);

drop trigger if exists flux_cards_touch_updated_at on public.flux_cards;
create trigger flux_cards_touch_updated_at
  before update on public.flux_cards
  for each row execute function public.touch_updated_at();

-- ── o movimento aponta para o cartão ───────────────────
-- ON DELETE SET NULL, não CASCADE: apagar um cartão não pode apagar
-- os gastos que passaram por ele. O movimento continua no razão, só
-- deixa de estar amarrado a uma fatura.
alter table public.flux_entries
  add column if not exists card_id uuid references public.flux_cards(id) on delete set null;

create index if not exists flux_entries_card_idx on public.flux_entries (card_id);

-- ══════════════════════════════════════════════════════
-- SEGURANÇA (RLS)
-- ══════════════════════════════════════════════════════
alter table public.flux_cards enable row level security;

drop policy if exists "flux_cards: ler os próprios"     on public.flux_cards;
drop policy if exists "flux_cards: criar os próprios"   on public.flux_cards;
drop policy if exists "flux_cards: alterar os próprios" on public.flux_cards;
drop policy if exists "flux_cards: apagar os próprios"  on public.flux_cards;

create policy "flux_cards: ler os próprios"
  on public.flux_cards for select
  using (auth.uid() = user_id);

create policy "flux_cards: criar os próprios"
  on public.flux_cards for insert
  with check (auth.uid() = user_id);

create policy "flux_cards: alterar os próprios"
  on public.flux_cards for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "flux_cards: apagar os próprios"
  on public.flux_cards for delete
  using (auth.uid() = user_id);

-- ── Realtime ───────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'flux_cards'
  ) then
    alter publication supabase_realtime add table public.flux_cards;
  end if;
end
$$;

-- Como o resto do FLUX, os cartões ficam fora da economia
-- compartilhada por ausência de política — e a ausência é a proteção.

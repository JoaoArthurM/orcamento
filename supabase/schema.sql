-- ══════════════════════════════════════════════════════
-- orçamento. — schema do Supabase
--
-- Cole este arquivo inteiro no SQL Editor do painel do Supabase
-- e clique em Run. É seguro rodar de novo: tudo é "if not exists".
-- ══════════════════════════════════════════════════════

-- ── TABELA: entries ─────────────────────────────────────
-- Uma linha por lançamento. `position` preserva a ordem em que
-- as entradas aparecem na lista (o app renderiza na ordem do array).
create table if not exists public.entries (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users(id) on delete cascade,

  name          text        not null check (length(trim(name)) > 0 and length(name) <= 120),
  type          text        not null check (type in ('fs','os','ci','ui','em','co')),
  hidden        boolean     not null default false,
  position      integer     not null default 0,

  -- tipos de valor fixo (fs, os, ci, em, co)
  amount        numeric(14,2),

  -- renda incerta (ui): faixa mínimo–máximo
  min_amount    numeric(14,2),
  max_amount    numeric(14,2),
  may_not_occur boolean     not null default false,

  -- meses de ocorrência, 1 = Janeiro … 12 = Dezembro
  months        smallint[]  not null default '{}',

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- os meses precisam ser válidos
  constraint entries_months_valid check (
    months <@ array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]
  )
);

create index if not exists entries_user_id_idx on public.entries (user_id, position);

-- ── TABELA: settings ────────────────────────────────────
-- Uma linha por usuário. Hoje guarda só o saldo inicial.
create table if not exists public.settings (
  user_id       uuid        primary key references auth.users(id) on delete cascade,
  saldo_inicial numeric(14,2) not null default 0,
  updated_at    timestamptz not null default now()
);

-- ── updated_at automático ───────────────────────────────
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists entries_touch_updated_at on public.entries;
create trigger entries_touch_updated_at
  before update on public.entries
  for each row execute function public.touch_updated_at();

drop trigger if exists settings_touch_updated_at on public.settings;
create trigger settings_touch_updated_at
  before update on public.settings
  for each row execute function public.touch_updated_at();

-- ══════════════════════════════════════════════════════
-- SEGURANÇA (RLS)
--
-- Sem isto, a chave anon — que fica visível no código do
-- navegador — daria acesso aos dados de todo mundo.
-- Com isto, cada usuário só enxerga as próprias linhas.
-- ══════════════════════════════════════════════════════
alter table public.entries  enable row level security;
alter table public.settings enable row level security;

-- entries
drop policy if exists "entries: ler as próprias"      on public.entries;
drop policy if exists "entries: criar as próprias"    on public.entries;
drop policy if exists "entries: alterar as próprias"  on public.entries;
drop policy if exists "entries: apagar as próprias"   on public.entries;

create policy "entries: ler as próprias"
  on public.entries for select
  using (auth.uid() = user_id);

create policy "entries: criar as próprias"
  on public.entries for insert
  with check (auth.uid() = user_id);

create policy "entries: alterar as próprias"
  on public.entries for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "entries: apagar as próprias"
  on public.entries for delete
  using (auth.uid() = user_id);

-- settings
drop policy if exists "settings: ler as próprias"     on public.settings;
drop policy if exists "settings: criar as próprias"   on public.settings;
drop policy if exists "settings: alterar as próprias" on public.settings;

create policy "settings: ler as próprias"
  on public.settings for select
  using (auth.uid() = user_id);

create policy "settings: criar as próprias"
  on public.settings for insert
  with check (auth.uid() = user_id);

create policy "settings: alterar as próprias"
  on public.settings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Realtime (sincronização entre aparelhos) ────────────
-- Publica a tabela para que o celular veja na hora o que o PC gravou.
-- O Realtime respeita o RLS acima: cada sessão só recebe as próprias linhas.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'entries'
  ) then
    alter publication supabase_realtime add table public.entries;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'settings'
  ) then
    alter publication supabase_realtime add table public.settings;
  end if;
end
$$;

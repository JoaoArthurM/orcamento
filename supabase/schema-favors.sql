-- ══════════════════════════════════════════════════════
-- orçamento. — módulo de favores
--
-- Cole este arquivo no SQL Editor do Supabase e clique em Run.
-- É seguro rodar de novo: tudo é "if not exists".
--
-- Depende de supabase/schema.sql (que cria public.touch_updated_at()).
-- ══════════════════════════════════════════════════════

-- ── TABELA: favors ─────────────────────────────────────
-- Um favor por linha. Diferente de `loans`, aqui NÃO há juros:
-- é dinheiro emprestado a quem se confia, só para não esquecer.
--
-- A tela agrupa por pessoa, mas o registro é por favor: assim a
-- mesma pessoa pode dever por vários motivos, cada um com o seu
-- próprio quanto-já-foi-pago.
--
-- Quanto falta e a porcentagem paga NÃO são guardados: saem de
-- (amount - paid) e (paid / amount), para nunca ficarem fora de
-- sincronia com os dois valores.
create table if not exists public.favors (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users(id) on delete cascade,

  -- quem deve
  person        text        not null check (length(trim(person)) > 0 and length(person) <= 120),

  -- por que deve
  reason        text        not null check (length(trim(reason)) > 0 and length(reason) <= 200),

  -- quanto deve e quanto já pagou
  amount        numeric(14,2) not null check (amount >= 0),
  paid          numeric(14,2) not null default 0 check (paid >= 0),

  -- quando pegou
  lent_on       date        not null default current_date,

  notes         text        check (notes is null or length(notes) <= 500),
  position      integer     not null default 0,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- não dá para ter pago mais do que deve
  constraint favors_paid_lte_amount check (paid <= amount)
);

create index if not exists favors_user_person_idx on public.favors (user_id, person, position);

-- ── updated_at automático ──────────────────────────────
drop trigger if exists favors_touch_updated_at on public.favors;
create trigger favors_touch_updated_at
  before update on public.favors
  for each row execute function public.touch_updated_at();

-- ══════════════════════════════════════════════════════
-- SEGURANÇA (RLS)
-- Sem isto, a chave anon — visível no navegador — daria
-- acesso aos favores de todo mundo.
-- ══════════════════════════════════════════════════════
alter table public.favors enable row level security;

drop policy if exists "favors: ler os próprios"     on public.favors;
drop policy if exists "favors: criar os próprios"   on public.favors;
drop policy if exists "favors: alterar os próprios" on public.favors;
drop policy if exists "favors: apagar os próprios"  on public.favors;

create policy "favors: ler os próprios"
  on public.favors for select
  using (auth.uid() = user_id);

create policy "favors: criar os próprios"
  on public.favors for insert
  with check (auth.uid() = user_id);

create policy "favors: alterar os próprios"
  on public.favors for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "favors: apagar os próprios"
  on public.favors for delete
  using (auth.uid() = user_id);

-- ── Realtime ───────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'favors'
  ) then
    alter publication supabase_realtime add table public.favors;
  end if;
end
$$;

-- ══════════════════════════════════════════════════════
-- CONSULTA DE APOIO (opcional)
-- O que a tela mostra no topo e em cada pessoa.
-- ══════════════════════════════════════════════════════
drop view if exists public.favores_por_pessoa;
create view public.favores_por_pessoa as
select
  user_id,
  person,
  count(*)                            as favores,
  coalesce(sum(amount), 0)            as total,
  coalesce(sum(paid), 0)              as pago,
  coalesce(sum(amount - paid), 0)     as falta,
  case when coalesce(sum(amount), 0) > 0
       then round(coalesce(sum(paid), 0) * 100 / sum(amount), 1)
       else 0 end                     as pct_pago,
  min(lent_on)                        as desde
from public.favors
group by user_id, person;

alter view public.favores_por_pessoa set (security_invoker = on);

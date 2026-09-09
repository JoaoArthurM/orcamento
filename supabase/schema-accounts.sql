-- ══════════════════════════════════════════════════════
-- orçamento. — módulo de contas
--
-- Cole este arquivo no SQL Editor do Supabase e clique em Run.
-- É seguro rodar de novo: tudo é "if not exists".
--
-- Depende de supabase/schema.sql (que cria public.touch_updated_at()).
-- ══════════════════════════════════════════════════════

-- ── TABELA: accounts ───────────────────────────────────
-- Uma linha por renda, conta ou assinatura. O `kind` separa os
-- quatro blocos da tela; cada um usa um subconjunto das colunas.
--
--   renda      → amount + frequency          (o que entra)
--   fixa       → amount + due_day + paid     (valor previsível, dia certo)
--   variavel   → amount + avg_amount         (oscila mês a mês)
--   assinatura → amount                      (mensal; o anual é derivado)
--
-- Nada de total anual guardado: sai sempre de amount * 12, para não
-- haver como ficar fora de sincronia.
create table if not exists public.accounts (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users(id) on delete cascade,

  kind          text        not null
                            check (kind in ('renda','fixa','variavel','assinatura')),
  name          text        not null check (length(trim(name)) > 0 and length(name) <= 120),

  -- valor mensal corrente (para renda: o quanto entra por ocorrência)
  amount        numeric(14,2) not null default 0 check (amount >= 0),

  -- com que frequência a renda cai (só para kind = 'renda')
  frequency     text        check (frequency is null or
                            frequency in ('mensal','quinzenal','semanal','anual','pontual')),

  -- dia do vencimento e se já foi paga neste mês (só para kind = 'fixa')
  due_day       smallint    check (due_day is null or due_day between 1 and 31),
  paid          boolean     not null default false,

  -- média histórica, para medir a variação (só para kind = 'variavel')
  avg_amount    numeric(14,2) check (avg_amount is null or avg_amount >= 0),

  notes         text        check (notes is null or length(notes) <= 500),
  position      integer     not null default 0,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- cada tipo exige o que lhe é próprio
  constraint accounts_kind_fields check (
        (kind = 'renda'      and frequency is not null)
     or (kind = 'fixa'       and due_day   is not null)
     or (kind = 'variavel')
     or (kind = 'assinatura')
  )
);

create index if not exists accounts_user_kind_idx on public.accounts (user_id, kind, position);

-- ── updated_at automático ──────────────────────────────
drop trigger if exists accounts_touch_updated_at on public.accounts;
create trigger accounts_touch_updated_at
  before update on public.accounts
  for each row execute function public.touch_updated_at();

-- ══════════════════════════════════════════════════════
-- SEGURANÇA (RLS)
-- Sem isto, a chave anon — visível no navegador — daria
-- acesso às contas de todo mundo.
-- ══════════════════════════════════════════════════════
alter table public.accounts enable row level security;

drop policy if exists "accounts: ler as próprias"     on public.accounts;
drop policy if exists "accounts: criar as próprias"   on public.accounts;
drop policy if exists "accounts: alterar as próprias" on public.accounts;
drop policy if exists "accounts: apagar as próprias"  on public.accounts;

create policy "accounts: ler as próprias"
  on public.accounts for select
  using (auth.uid() = user_id);

create policy "accounts: criar as próprias"
  on public.accounts for insert
  with check (auth.uid() = user_id);

create policy "accounts: alterar as próprias"
  on public.accounts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "accounts: apagar as próprias"
  on public.accounts for delete
  using (auth.uid() = user_id);

-- ── Realtime ───────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'accounts'
  ) then
    alter publication supabase_realtime add table public.accounts;
  end if;
end
$$;

-- ══════════════════════════════════════════════════════
-- CONSULTA DE APOIO (opcional)
-- Os mesmos números do topo da tela. As rendas são
-- normalizadas para o equivalente mensal:
--   semanal ×4.345 · quinzenal ×2 · anual ÷12 · pontual não entra
-- ══════════════════════════════════════════════════════
create or replace view public.contas_resumo as
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
  count(*) filter (where kind = 'renda')                      as fontes_renda,
  count(*) filter (where kind = 'fixa' and not paid)           as fixas_em_aberto
from public.accounts
group by user_id;

alter view public.contas_resumo set (security_invoker = on);

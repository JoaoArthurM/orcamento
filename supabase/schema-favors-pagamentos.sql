-- ══════════════════════════════════════════════════════
-- orçamento. — favores: pagamentos como lançamentos
--
-- Cole no SQL Editor do Supabase e clique em Run.
-- Roda uma vez só, mas é seguro repetir.
--
-- Depende de supabase/schema-favors.sql.
--
-- ── POR QUE MUDAR ─────────────────────────────────────
-- Antes, o quanto-já-foi-pago era uma coluna do próprio
-- favor. Isso só dá conta de "pagou X neste item".
--
-- Na vida real o pagamento vem por cima: "saímos dia 10,
-- ela gastou Uber, comida e roupa; hoje ela me passou 200".
-- Esses 200 não são de um item — são do dia, ou do total.
--
-- Então o pagamento vira lançamento próprio, com um alcance
-- (item, dia ou total), e o quanto cada favor recebeu passa
-- a ser CALCULADO na hora de mostrar.
--
-- O ganho não é pureza: é que editar o valor de um favor,
-- ou apagá-lo, recalcula tudo sozinho. Com o valor gravado
-- em cada linha, a divisão feita ontem ficaria errada e sem
-- nada de onde recomputar.
-- ══════════════════════════════════════════════════════

-- ── TABELA: favor_payments ─────────────────────────────
create table if not exists public.favor_payments (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,

  -- de quem veio o dinheiro. É o que liga o pagamento aos favores:
  -- guardamos o nome, e não um id de pessoa, porque `favors` também
  -- identifica pessoa por nome — não existe cadastro de pessoas.
  person     text        not null check (length(trim(person)) > 0 and length(person) <= 120),

  amount     numeric(14,2) not null check (amount > 0),
  paid_on    date        not null default current_date,

  -- até onde este pagamento alcança:
  --   'item'  → um favor específico (favor_id)
  --   'dia'   → os favores daquela pessoa naquele dia (scope_day)
  --   'total' → o que a pessoa dever, do mais antigo para o mais novo
  scope      text        not null default 'total'
             check (scope in ('item', 'dia', 'total')),

  favor_id   uuid        references public.favors(id) on delete cascade,
  scope_day  date,

  -- 'pago'     → o dinheiro entrou; é o que abate a dívida
  -- 'previsto' → parcela combinada que ainda não caiu. Fica guardada para
  --              aparecer como "2 de 5", mas NÃO abate nada até ser recebida.
  status     text        not null default 'pago'
             check (status in ('pago', 'previsto')),

  -- combinado de parcelas: "me paga 250 por 5 meses" são 5 linhas
  -- com o mesmo plan_id, numeradas de 1 a 5.
  plan_id    uuid,
  plan_index integer     check (plan_index is null or plan_index >= 1),
  plan_total integer     check (plan_total is null or plan_total >= 1),

  notes      text        check (notes is null or length(notes) <= 500),
  position   integer     not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- cada alcance exige o seu alvo, e só o seu
  constraint favor_payments_alvo_coerente check (
    (scope = 'item'  and favor_id is not null and scope_day is null)
    or (scope = 'dia'   and scope_day is not null and favor_id is null)
    or (scope = 'total' and favor_id is null and scope_day is null)
  ),

  -- ou faz parte de um combinado inteiro, ou de nenhum
  constraint favor_payments_plano_coerente check (
    (plan_id is null and plan_index is null and plan_total is null)
    or (plan_id is not null and plan_index is not null and plan_total is not null
        and plan_index <= plan_total)
  )
);

create index if not exists favor_payments_plan_idx
  on public.favor_payments (user_id, plan_id, plan_index);

-- se a tabela veio de uma execução anterior, ganha as colunas do combinado
alter table public.favor_payments add column if not exists status text not null default 'pago';
alter table public.favor_payments add column if not exists plan_id uuid;
alter table public.favor_payments add column if not exists plan_index integer;
alter table public.favor_payments add column if not exists plan_total integer;

create index if not exists favor_payments_user_person_idx
  on public.favor_payments (user_id, person, paid_on);

drop trigger if exists favor_payments_touch_updated_at on public.favor_payments;
create trigger favor_payments_touch_updated_at
  before update on public.favor_payments
  for each row execute function public.touch_updated_at();

-- ══════════════════════════════════════════════════════
-- MIGRAÇÃO — o que já foi pago vira lançamento
-- Antes de derrubar a coluna, cada favors.paid > 0 vira um
-- pagamento de alcance 'item'. Nada se perde.
-- O "not exists" evita duplicar se este arquivo rodar de novo.
-- ══════════════════════════════════════════════════════
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'favors' and column_name = 'paid'
  ) then
    execute $mig$
      insert into public.favor_payments
        (user_id, person, amount, paid_on, scope, favor_id, notes)
      select f.user_id, f.person, f.paid, f.lent_on, 'item', f.id,
             'migrado do valor já pago'
      from public.favors f
      where f.paid > 0
        and not exists (
          select 1 from public.favor_payments p
          where p.favor_id = f.id and p.notes = 'migrado do valor já pago'
        )
    $mig$;
  end if;
end
$$;

-- ── a coluna sai ───────────────────────────────────────
-- E o CHECK sai junto de propósito: pagar mais do que se deve
-- passa a ser representável (200 sobre 150 em aberto = 50 de
-- crédito), e a constraint recusaria exatamente esse caso.
-- A view antiga soma favors.paid, então o Postgres recusa derrubar a
-- coluna enquanto ela existir. Ela é recriada no fim deste arquivo,
-- já lendo os pagamentos.
drop view if exists public.favores_por_pessoa;

alter table public.favors drop constraint if exists favors_paid_lte_amount;
alter table public.favors drop column if exists paid;

-- ── Realtime ───────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'favor_payments'
  ) then
    alter publication supabase_realtime add table public.favor_payments;
  end if;
end
$$;

-- ══════════════════════════════════════════════════════
-- SEGURANÇA (RLS)
-- ══════════════════════════════════════════════════════
alter table public.favor_payments enable row level security;

drop policy if exists "favor_payments: ler os próprios"     on public.favor_payments;
drop policy if exists "favor_payments: criar os próprios"   on public.favor_payments;
drop policy if exists "favor_payments: alterar os próprios" on public.favor_payments;
drop policy if exists "favor_payments: apagar os próprios"  on public.favor_payments;

create policy "favor_payments: ler os próprios"
  on public.favor_payments for select
  using (auth.uid() = user_id);

create policy "favor_payments: criar os próprios"
  on public.favor_payments for insert
  with check (auth.uid() = user_id);

create policy "favor_payments: alterar os próprios"
  on public.favor_payments for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "favor_payments: apagar os próprios"
  on public.favor_payments for delete
  using (auth.uid() = user_id);

-- ══════════════════════════════════════════════════════
-- CONSULTA DE APOIO
-- A view some com `paid`, que não existe mais. O quanto foi
-- pago agora vem da soma dos lançamentos daquela pessoa.
--
-- Ela não reparte por item — isso é conta da tela, que sabe a
-- ordem. Aqui interessa o fecho por pessoa, que é o mesmo
-- número independente de como a divisão caiu.
--
-- CREATE OR REPLACE só acrescenta coluna no fim; para trocar
-- o miolo é drop + create.
-- ══════════════════════════════════════════════════════
drop view if exists public.favores_por_pessoa;
create view public.favores_por_pessoa as
with devido as (
  select user_id, lower(trim(person)) as chave,
         min(person) as person, count(*) as favores,
         coalesce(sum(amount), 0) as total, min(lent_on) as desde
  from public.favors group by user_id, lower(trim(person))
),
recebido as (
  -- só o que entrou de verdade: parcela combinada ainda não abate nada
  select user_id, lower(trim(person)) as chave,
         coalesce(sum(amount), 0) as pago, max(paid_on) as ultimo_pagamento
  from public.favor_payments where status = 'pago'
  group by user_id, lower(trim(person))
),
previsto as (
  select user_id, lower(trim(person)) as chave,
         coalesce(sum(amount), 0) as a_receber, min(paid_on) as proxima
  from public.favor_payments where status = 'previsto'
  group by user_id, lower(trim(person))
)
select
  d.user_id, d.person, d.favores, d.total,
  coalesce(r.pago, 0)                                as pago,
  greatest(d.total - coalesce(r.pago, 0), 0)         as falta,
  greatest(coalesce(r.pago, 0) - d.total, 0)         as credito,
  case when d.total > 0
       then round(least(coalesce(r.pago, 0), d.total) * 100 / d.total, 1)
       else 0 end                                    as pct_pago,
  d.desde, r.ultimo_pagamento,
  coalesce(v.a_receber, 0)                           as combinado_a_receber,
  v.proxima                                          as proxima_parcela
from devido d
left join recebido r on r.user_id = d.user_id and r.chave = d.chave
left join previsto v on v.user_id = d.user_id and v.chave = d.chave;

alter view public.favores_por_pessoa set (security_invoker = on);

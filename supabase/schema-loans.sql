-- ══════════════════════════════════════════════════════
-- orçamento. — módulo de empréstimos
--
-- Cole este arquivo no SQL Editor do Supabase e clique em Run.
-- É seguro rodar de novo: tudo é "if not exists".
--
-- Depende de supabase/schema.sql (que já cria as funções e o
-- padrão de RLS usado aqui).
-- ══════════════════════════════════════════════════════

-- ── TABELA: loans ──────────────────────────────────────
-- Um empréstimo por linha: quem deve, quanto saiu, quanto volta.
--
-- Os juros NÃO são guardados: são derivados de (total_due - principal),
-- para nunca ficarem fora de sincronia com os dois valores.
create table if not exists public.loans (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users(id) on delete cascade,

  -- quem está devendo
  person        text        not null check (length(trim(person)) > 0 and length(person) <= 120),

  -- quanto foi emprestado e quanto deve voltar (juros = total_due - principal)
  principal     numeric(14,2) not null check (principal >= 0),
  total_due     numeric(14,2) not null check (total_due  >= 0),

  -- quanto já entrou (0 = nada recebido; >= total_due = quitado)
  received      numeric(14,2) not null default 0 check (received >= 0),

  -- datas
  lent_on       date        not null default current_date,
  due_on        date,

  -- como a pessoa vai pagar
  --   avista    = tudo de uma vez
  --   parcelado = em N parcelas
  --   mensal    = mensalidade fixa até juntar o total
  method        text        not null default 'avista'
                            check (method in ('avista','parcelado','mensal')),
  installments  integer     check (installments is null or installments between 1 and 360),
  installment_amount numeric(14,2) check (installment_amount is null or installment_amount >= 0),

  notes         text        check (notes is null or length(notes) <= 500),
  position      integer     not null default 0,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- o total a receber nunca é menor que o emprestado (juros >= 0)
  constraint loans_total_gte_principal check (total_due >= principal),

  -- parcelado precisa do número de parcelas; mensal precisa do valor da mensalidade
  constraint loans_method_fields check (
    (method = 'parcelado' and installments is not null)
    or (method = 'mensal' and installment_amount is not null)
    or (method = 'avista')
  )
);

create index if not exists loans_user_id_idx  on public.loans (user_id, position);
create index if not exists loans_due_on_idx   on public.loans (user_id, due_on);

-- ── updated_at automático ──────────────────────────────
-- (a função public.touch_updated_at() vem de schema.sql)
drop trigger if exists loans_touch_updated_at on public.loans;
create trigger loans_touch_updated_at
  before update on public.loans
  for each row execute function public.touch_updated_at();

-- ══════════════════════════════════════════════════════
-- SEGURANÇA (RLS)
-- Sem isto, a chave anon — visível no navegador — daria
-- acesso aos empréstimos de todo mundo.
-- ══════════════════════════════════════════════════════
alter table public.loans enable row level security;

drop policy if exists "loans: ler os próprios"     on public.loans;
drop policy if exists "loans: criar os próprios"   on public.loans;
drop policy if exists "loans: alterar os próprios" on public.loans;
drop policy if exists "loans: apagar os próprios"  on public.loans;

create policy "loans: ler os próprios"
  on public.loans for select
  using (auth.uid() = user_id);

create policy "loans: criar os próprios"
  on public.loans for insert
  with check (auth.uid() = user_id);

create policy "loans: alterar os próprios"
  on public.loans for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "loans: apagar os próprios"
  on public.loans for delete
  using (auth.uid() = user_id);

-- ── Realtime ───────────────────────────────────────────
-- O celular vê na hora o que o PC gravou. Respeita o RLS acima.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'loans'
  ) then
    alter publication supabase_realtime add table public.loans;
  end if;
end
$$;

-- ══════════════════════════════════════════════════════
-- CONSULTA DE APOIO (opcional)
-- Os mesmos números que a tela inicial mostra, caso você
-- queira conferir direto no SQL Editor.
-- ══════════════════════════════════════════════════════
create or replace view public.loans_resumo as
select
  user_id,
  count(*)                                              as total,
  count(*) filter (where received < total_due)          as ativos,
  count(*) filter (where received < total_due
                     and due_on is not null
                     and due_on < current_date)         as atrasados,
  coalesce(sum(total_due), 0)                           as a_receber,
  coalesce(sum(total_due - principal), 0)               as juros,
  coalesce(sum(received), 0)                            as recebido,
  coalesce(sum(total_due - received), 0)                as em_aberto
from public.loans
group by user_id;

-- a view herda o RLS da tabela (security_invoker)
alter view public.loans_resumo set (security_invoker = on);

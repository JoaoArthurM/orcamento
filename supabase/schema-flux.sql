-- ══════════════════════════════════════════════════════
-- orçamento. — módulo FLUX (razão diário)
--
-- Cole este arquivo no SQL Editor do Supabase e clique em Run.
-- É seguro rodar de novo: tudo é "if not exists".
--
-- Depende de supabase/schema.sql (que cria public.settings e
-- public.touch_updated_at()).
--
-- ── O QUE É O FLUX ────────────────────────────────────
-- Os outros quatro módulos respondem "quanto eu vou ter guardado".
-- O FLUX responde outra pergunta: "quanto eu tenho NO DIA X".
--
-- Ele é um razão diário. Cada linha de flux_entries é um movimento
-- com data; a tela soma tudo desde uma âncora e mostra o saldo dia
-- a dia. Nada disto entra no simulador: ver a última seção.
-- ══════════════════════════════════════════════════════

-- ── TABELA: flux_entries ───────────────────────────────
-- Um movimento por linha.
--
-- `kind` não repete os tipos de `entries` (fs/os/ci/ui/em/co) de
-- propósito: aquele vocabulário é do motor da projeção, este é do
-- razão. `economia` existe nos dois e significa coisas diferentes —
-- lá é poupança que entra no acumulado, aqui é um movimento do dia.
--
-- Só `entrada` soma; os outros quatro subtraem. O tipo diz de onde
-- veio o dinheiro, não o sinal — por isso `amount` é sempre >= 0 e
-- o sinal sai do kind, nunca do valor guardado.
create table if not exists public.flux_entries (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users(id) on delete cascade,

  kind          text        not null default 'saida'
                            check (kind in ('entrada','saida','diario','economia','cartao')),

  description   text        not null check (length(trim(description)) > 0 and length(description) <= 120),

  -- sempre positivo: quem decide o sinal é o kind
  amount        numeric(14,2) not null check (amount >= 0),

  -- o dia do movimento, ou a 1ª ocorrência quando repete
  on_date       date        not null default current_date,

  -- ── repetição ───────────────────────────────────────
  -- Nula = acontece uma vez só, em on_date.
  --
  -- `repeat_rule` só muda algo em 'mensal': 'quinto_util' joga a
  -- ocorrência para o 5º dia útil do mês em vez de repetir o dia de
  -- on_date. Em 'semanal' e 'diaria' a regra é ignorada.
  --
  -- `repeat_times` conta a 1ª ocorrência. 1 seria o mesmo que não
  -- repetir, então o mínimo útil é 2; null = sem fim.
  repeat_freq   text        check (repeat_freq is null or repeat_freq in ('mensal','semanal','diaria')),
  repeat_times  integer     check (repeat_times is null or repeat_times between 2 and 600),
  repeat_rule   text        not null default 'data'
                            check (repeat_rule in ('data','quinto_util')),

  -- Ocorrências puladas de uma repetição: apagar UMA sem desfazer a
  -- série. Guardar as datas é o que permite "excluir só esta" sem
  -- quebrar a regra que gera as outras.
  skipped       date[]      not null default '{}',

  notes         text        check (notes is null or length(notes) <= 500),
  position      integer     not null default 0,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- contagem e datas puladas só fazem sentido com repetição ligada
  constraint flux_repeticao_coerente check (
    repeat_freq is not null
    or (repeat_times is null and cardinality(skipped) = 0)
  )
);

-- a tela varre um mês por vez, sempre do mesmo dono
create index if not exists flux_entries_user_date_idx
  on public.flux_entries (user_id, on_date, position);

-- ── updated_at automático ──────────────────────────────
drop trigger if exists flux_entries_touch_updated_at on public.flux_entries;
create trigger flux_entries_touch_updated_at
  before update on public.flux_entries
  for each row execute function public.touch_updated_at();

-- ══════════════════════════════════════════════════════
-- SEGURANÇA (RLS)
-- Sem isto, a chave anon — visível no navegador — daria
-- acesso ao razão de todo mundo.
-- ══════════════════════════════════════════════════════
alter table public.flux_entries enable row level security;

drop policy if exists "flux: ler os próprios"     on public.flux_entries;
drop policy if exists "flux: criar os próprios"   on public.flux_entries;
drop policy if exists "flux: alterar os próprios" on public.flux_entries;
drop policy if exists "flux: apagar os próprios"  on public.flux_entries;

create policy "flux: ler os próprios"
  on public.flux_entries for select
  using (auth.uid() = user_id);

create policy "flux: criar os próprios"
  on public.flux_entries for insert
  with check (auth.uid() = user_id);

create policy "flux: alterar os próprios"
  on public.flux_entries for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "flux: apagar os próprios"
  on public.flux_entries for delete
  using (auth.uid() = user_id);

-- ══════════════════════════════════════════════════════
-- O FLUX NÃO ENTRA NA ECONOMIA COMPARTILHADA
--
-- Quem entra com um código ganha SELECT nas tabelas da economia do
-- dono. flux_entries fica DE FORA por ausência: não há política que
-- a inclua, e a ausência é a proteção.
--
-- Isto é deliberado. O razão diário tem o gasto do dia a dia de
-- quem o escreve; a economia compartilhada existe para somar
-- projeções, não para abrir o extrato de ninguém.
-- ══════════════════════════════════════════════════════

-- ── Realtime ───────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'flux_entries'
  ) then
    alter publication supabase_realtime add table public.flux_entries;
  end if;
end
$$;

-- ══════════════════════════════════════════════════════
-- ESCALARES DO FLUX — vão em settings, não numa coleção
--
-- Estes quatro são um valor só por usuário, não uma lista. Numa
-- tabela de coleção eles entrariam no diff por linha, e o dia em
-- que a lista chegasse vazia o diff APAGARIA a configuração junto.
-- ══════════════════════════════════════════════════════

alter table public.settings
  -- A abertura do razão. Pode ser negativa: quem começa no vermelho
  -- precisa dizer isso, e forçar >= 0 mentiria no primeiro dia.
  add column if not exists flux_saldo_inicial numeric(14,2) not null default 0,

  -- O dia em que aquele saldo valia. O cálculo anda para frente OU
  -- para trás a partir daqui, então ela é o zero da régua.
  add column if not exists flux_saldo_inicial_data date,

  -- Gasto médio previsto por dia. Só desconta no FUTURO: o passado
  -- usa o que foi lançado de verdade.
  add column if not exists flux_diario numeric(14,2) not null default 0
    check (flux_diario >= 0),

  -- Os 6 limiares que separam as 7 faixas de cor do saldo, do mais
  -- negativo ao mais saudável. Precisam vir em ordem crescente.
  add column if not exists flux_limites numeric(14,2)[] not null
    default '{-100,0,100,300,1000,2000}';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'settings_flux_limites_validos'
  ) then
    alter table public.settings
      add constraint settings_flux_limites_validos
      check (cardinality(flux_limites) = 6);
  end if;
end
$$;

comment on column public.settings.flux_saldo_inicial is
  'Abertura do razão do FLUX. Independente de saldo_inicial, que é do simulador.';
comment on column public.settings.flux_saldo_inicial_data is
  'Dia em que flux_saldo_inicial valia. Nulo = a primeira data lançada.';
comment on column public.settings.flux_diario is
  'Gasto previsto por dia. Desconta só nos dias futuros.';
comment on column public.settings.flux_limites is
  'Os 6 limiares das 7 faixas de cor do saldo, em ordem crescente.';

-- ══════════════════════════════════════════════════════
-- O QUE ESTE ARQUIVO NÃO FAZ
--
-- Nada aqui toca `entries`, `settings.saldo_inicial` ou qualquer
-- coisa que o simulador leia. O FLUX é um razão paralelo:
--
--   • o simulador projeta meses e trata renda incerta como zero no
--     cenário pessimista;
--   • o FLUX desconta um gasto diário previsto que ainda não
--     aconteceu.
--
-- Somar os dois faria o número do simulador cair por causa de uma
-- previsão de gasto — e o número do simulador é o produto.
-- ══════════════════════════════════════════════════════

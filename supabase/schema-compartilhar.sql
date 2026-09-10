-- ══════════════════════════════════════════════════════
-- orçamento. — compartilhar a economia
--
-- Cole no SQL Editor do Supabase e clique em Run.
-- Roda uma vez só, mas é seguro repetir.
--
-- Depende de todos os schemas anteriores.
--
-- ── O QUE FAZ ─────────────────────────────────────────
-- Cada usuário tem um CÓDIGO. Quem digita o código de
-- outra pessoa passa a VER a economia dela: os lançamentos,
-- as economias cadastradas em contas, e os empréstimos e
-- favores marcados como "vai para a economia".
--
-- Ver, e só. Não há política de INSERT, UPDATE nem DELETE
-- para dados de terceiro — a ausência é a proteção, não uma
-- checagem que alguém possa esquecer de fazer.
--
-- ── DIREÇÃO ÚNICA ─────────────────────────────────────
-- Uma linha por (dono, espectador). "Um vê o outro" são
-- duas linhas, criadas quando cada um digita o código do
-- outro. Uma linha só, valendo nos dois sentidos, tornaria
-- incoerentes tanto a remoção quanto a cor por pessoa.
-- ══════════════════════════════════════════════════════

-- ── O código de cada um ────────────────────────────────
alter table public.settings
  add column if not exists share_code text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'settings_share_code_unico') then
    alter table public.settings add constraint settings_share_code_unico unique (share_code);
  end if;
end
$$;

comment on column public.settings.share_code is
  'Código que outra pessoa digita para ver esta economia. Nulo = ninguém pode entrar.';

-- ── Quem vê quem ───────────────────────────────────────
create table if not exists public.economy_shares (
  id         uuid        primary key default gen_random_uuid(),

  -- de quem é a economia
  owner_id   uuid        not null references auth.users(id) on delete cascade,
  -- quem ganhou permissão de ver
  viewer_id  uuid        not null references auth.users(id) on delete cascade,

  -- cor pastel dos lançamentos dessa pessoa na tela do dono
  color      text        not null default 'rosa'
             check (color in ('rosa','azul','laranja','roxo','amarelo','verde')),

  created_at timestamptz not null default now(),

  -- ninguém vê a própria economia "de fora"
  constraint economy_shares_nao_e_si check (owner_id <> viewer_id),
  constraint economy_shares_par_unico unique (owner_id, viewer_id)
);

create index if not exists economy_shares_viewer_idx on public.economy_shares (viewer_id);
create index if not exists economy_shares_owner_idx  on public.economy_shares (owner_id);

alter table public.economy_shares enable row level security;

-- Dono e espectador enxergam o vínculo; só o dono desfaz.
drop policy if exists "shares: ver os meus"    on public.economy_shares;
drop policy if exists "shares: remover"        on public.economy_shares;

create policy "shares: ver os meus"
  on public.economy_shares for select
  using (auth.uid() = owner_id or auth.uid() = viewer_id);

-- quem entrou também pode sair
create policy "shares: remover"
  on public.economy_shares for delete
  using (auth.uid() = owner_id or auth.uid() = viewer_id);

-- Não há INSERT por política: só a função usar_codigo() cria vínculo.

-- ══════════════════════════════════════════════════════
-- pode_ver_economia() — o coração da permissão
--
-- Precisa ser SECURITY DEFINER. Se a política de `entries`
-- consultasse `economy_shares` diretamente, essa consulta
-- rodaria sob o RLS do próprio espectador, e o resultado
-- seria vazio — sem erro nenhum, só nada aparecendo.
--
-- search_path fixo: sem isso, um schema no caminho do
-- chamador poderia sequestrar o nome da tabela dentro de
-- uma função que roda com os poderes do dono.
-- ══════════════════════════════════════════════════════
create or replace function public.pode_ver_economia(p_owner uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.economy_shares
    where owner_id = p_owner and viewer_id = auth.uid()
  );
$$;

revoke all on function public.pode_ver_economia(uuid) from public;
grant execute on function public.pode_ver_economia(uuid) to authenticated;

-- ══════════════════════════════════════════════════════
-- LEITURA COMPARTILHADA
-- Uma política de SELECT a mais em cada tabela da economia.
-- As de escrita continuam exatamente como estavam.
-- ══════════════════════════════════════════════════════
drop policy if exists "entries: ler as compartilhadas"  on public.entries;
create policy "entries: ler as compartilhadas"
  on public.entries for select
  using (public.pode_ver_economia(user_id));

drop policy if exists "settings: ler as compartilhadas" on public.settings;
create policy "settings: ler as compartilhadas"
  on public.settings for select
  using (public.pode_ver_economia(user_id));

drop policy if exists "accounts: ler as compartilhadas" on public.accounts;
create policy "accounts: ler as compartilhadas"
  on public.accounts for select
  using (public.pode_ver_economia(user_id));

-- Empréstimos e favores: SÓ os marcados como "vai para a economia".
-- Os outros continuam invisíveis, com nome e valor de quem deve.
drop policy if exists "loans: ler os compartilhados" on public.loans;
create policy "loans: ler os compartilhados"
  on public.loans for select
  using (to_savings and public.pode_ver_economia(user_id));

drop policy if exists "favors: ler os compartilhados" on public.favors;
create policy "favors: ler os compartilhados"
  on public.favors for select
  using (to_savings and public.pode_ver_economia(user_id));

-- Pagamentos: precisos para saber quanto ainda falta receber
-- de um favor compartilhado.
drop policy if exists "favor_payments: ler os compartilhados" on public.favor_payments;
create policy "favor_payments: ler os compartilhados"
  on public.favor_payments for select
  using (public.pode_ver_economia(user_id));

-- ══════════════════════════════════════════════════════
-- gerar_codigo() — cria ou troca o próprio código
--
-- Trocar o código é a única forma de invalidar um código
-- que vazou: apagar o vínculo não impede que o mesmo código
-- seja usado de novo.
-- ══════════════════════════════════════════════════════
create or replace function public.gerar_codigo()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- sem 0/O e 1/I/L: o código é lido em voz alta e digitado à mão
  alfabeto constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  novo text;
  tentativa int := 0;
begin
  if auth.uid() is null then
    raise exception 'precisa estar autenticado';
  end if;

  loop
    novo := '';
    -- 9 caracteres do alfabeto de 31: ~44 bits.
    -- É o único freio contra adivinhação, já que a função
    -- consulta qualquer código sem limite de tentativas.
    for i in 1..9 loop
      novo := novo || substr(alfabeto,
        1 + floor(random() * length(alfabeto))::int, 1);
    end loop;

    begin
      insert into public.settings (user_id, share_code)
      values (auth.uid(), novo)
      on conflict (user_id) do update set share_code = excluded.share_code;
      return novo;
    exception when unique_violation then
      tentativa := tentativa + 1;
      if tentativa > 8 then
        raise exception 'não consegui gerar um código livre';
      end if;
    end;
  end loop;
end;
$$;

revoke all on function public.gerar_codigo() from public;
grant execute on function public.gerar_codigo() to authenticated;

-- ══════════════════════════════════════════════════════
-- usar_codigo() — entrar na economia de alguém
--
-- Definer porque o espectador não pode ler `settings` de
-- terceiros para descobrir de quem é o código. A função
-- devolve só o e-mail do dono — nada dos dados dele.
-- ══════════════════════════════════════════════════════
create or replace function public.usar_codigo(p_code text)
returns table (owner_id uuid, owner_email text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
  v_livre text;
begin
  if auth.uid() is null then
    raise exception 'precisa estar autenticado';
  end if;

  select s.user_id into v_owner
  from public.settings s
  where s.share_code = upper(trim(p_code));

  if v_owner is null then
    raise exception 'código não encontrado';
  end if;
  if v_owner = auth.uid() then
    raise exception 'esse código é o seu';
  end if;

  -- primeira cor ainda não usada por este dono, para a cor de
  -- cada pessoa não mudar a cada nova conexão
  select c into v_livre
  from unnest(array['rosa','azul','laranja','roxo','amarelo','verde']) as c
  where not exists (
    select 1 from public.economy_shares e
    where e.owner_id = v_owner and e.color = c
  )
  limit 1;

  insert into public.economy_shares (owner_id, viewer_id, color)
  values (v_owner, auth.uid(), coalesce(v_livre, 'rosa'))
  -- pelo NOME da constraint: `owner_id` também é parâmetro de saída
  -- desta função, e a lista de colunas do ON CONFLICT seria ambígua
  on conflict on constraint economy_shares_par_unico do nothing;

  return query
    select v_owner, (select u.email::text from auth.users u where u.id = v_owner);
end;
$$;

revoke all on function public.usar_codigo(text) from public;
grant execute on function public.usar_codigo(text) to authenticated;

-- ══════════════════════════════════════════════════════
-- minhas_conexoes() — com quem estou ligado
--
-- Definer só para resolver o e-mail: `auth.users` não é
-- legível pelo cliente. Devolve apenas as linhas em que o
-- chamador já é uma das pontas.
-- ══════════════════════════════════════════════════════
create or replace function public.minhas_conexoes()
returns table (
  id         uuid,
  papel      text,      -- 'espectador' = alguém vê a minha; 'dono' = eu vejo a de alguém
  pessoa_id  uuid,
  email      text,
  color      text,
  created_at timestamptz
)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select e.id, 'espectador'::text, e.viewer_id,
         (select u.email::text from auth.users u where u.id = e.viewer_id),
         e.color, e.created_at
  from public.economy_shares e
  where e.owner_id = auth.uid()
  union all
  select e.id, 'dono'::text, e.owner_id,
         (select u.email::text from auth.users u where u.id = e.owner_id),
         e.color, e.created_at
  from public.economy_shares e
  where e.viewer_id = auth.uid()
  order by created_at;
$$;

revoke all on function public.minhas_conexoes() from public;
grant execute on function public.minhas_conexoes() to authenticated;

-- ══════════════════════════════════════════════════════
-- trocar_cor() — a cor é escolha de quem recebe
-- ══════════════════════════════════════════════════════
create or replace function public.trocar_cor(p_share uuid, p_color text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.economy_shares
     set color = p_color
   where id = p_share
     and owner_id = auth.uid()
     and p_color in ('rosa','azul','laranja','roxo','amarelo','verde');
$$;

revoke all on function public.trocar_cor(uuid, text) from public;
grant execute on function public.trocar_cor(uuid, text) to authenticated;

# orçamento.

Simulador econômico pessoal como **app web instalável (PWA)** — projeta aportes,
rendas e o saldo acumulado dos próximos 12 meses em cenário pessimista ou otimista,
com login e sincronização entre aparelhos via Supabase.

Conversão do `simulator.html` original para um app mobile-first, com a lógica de
cálculo portada sem alterações (validada campo a campo contra o arquivo original).

## Telas suportadas

| Alvo | Largura | Layout |
|---|---|---|
| iPhone 15 | 393 px | app mobile: uma rolagem + nav flutuante |
| Galaxy S24 Ultra | 412 px | app mobile: uma rolagem + nav flutuante |
| Tablet / dobrável | 768–1023 px | app mobile centralizado |
| Desktop Full HD | ≥ 1024 px | sidebar + grade de 12 meses (layout original) |

No mobile tudo vive numa tela só — saldo inicial, acumulado, KPIs, faixa de meses,
curva, entradas do mês escolhido e a tabela mês a mês — com uma barra flutuante de
dois itens (**simulador** / **menu**) e um botão **+** central para nova entrada.
A partir de 1024 px volta a grade completa de 12 colunas com coluna fixa.

## Os dois módulos

Ao abrir, uma tela de escolha (**hub**) com dois cartões e um atalho para os
ajustes. Entrando num módulo, o topo ganha um botão de voltar e a barra de baixo
aparece com o rótulo daquele módulo. No hub não há barra de baixo.

```
hub ──► economia    ──► [simulador]   [+] [tabelas]
    ├─► empréstimos ──► [empréstimos] [+] [tabelas]
    ├─► contas      ──► [contas]      [+] [tabelas]
    ├─► favores     ──► [favores]     [+] [tabelas]
    └─► ajustes (conta, senha, instalar, apagar)
```

**Tabelas** mostra os lançamentos do módulo aberto, com busca e ações de editar
e excluir — a mesma tela serve aos três, trocando só a fonte de dados
(`TABELAS` em `app.js`). Os **ajustes** ficam só no hub, fora dos módulos.

Os cartões do hub são reordenáveis: segure meio segundo e arraste. A ordem fica
em `localStorage` (`orcamento:hub-ordem`), por aparelho.

### Empréstimos

Um registro por pessoa que te deve. **Os juros nunca são digitados nem
guardados**: saem sempre de `a receber − emprestado`, para não haver como ficar
inconsistente.

| Campo | Observação |
|---|---|
| Quem está devendo | vira as iniciais do avatar |
| Emprestado | o que saiu do seu bolso |
| A receber | total com juros; nunca menor que o emprestado |
| Já recebido | alimenta a barra de progresso e o status |
| Emprestado em | data de saída |
| Previsão de pagamento | vencida e não quitada ⇒ **Atrasado** |
| Como vai pagar | à vista · parcelado (Nx) · mensalidade até juntar |

**Na mensalidade o "a receber" é calculado, não digitado:** a mensalidade é o
próprio juro, então `a receber = emprestado + mensalidade`. Emprestar 2.500 com
mensalidade de 300 dá 2.800 a receber, 12% de juros. O campo fica somente-leitura
e a barra de progresso segue o quanto já foi recebido.

Status derivado: **Quitado** (recebido ≥ a receber), **Atrasado** (venceu e não
quitou), **Parcial** (recebeu algo), **Em aberto**. Os filtros no topo da lista
usam os mesmos critérios.

O cartão do topo soma tudo: a receber, juros embutidos, recebido e em aberto.

#### Mensalidade: o juro corre por fora

Nos métodos **à vista** e **parcelado**, o juro está embutido no total a
receber e cada real que entra abate esse total.

Na **mensalidade** o combinado é outro. A pessoa paga uma quantia fixa todo
mês — por tempo indeterminado — e isso **não diminui a dívida em nada**. A
dívida é o principal, e ela só morre quando o principal voltar inteiro.

| Campo | Papel |
|---|---|
| `principal` | a dívida. Só ela fecha o empréstimo |
| `installment_amount` | o juro de cada mês |
| `received` | principal devolvido |
| `received_interest` | mensalidades já recebidas — acumula sem limite |

Emprestou 2.500 a 300/mês. Ela paga duas mensalidades e depois devolve os
2.500: entraram **3.100**, e só nesse momento o empréstimo quita. Antes disso,
"falta voltar" continua marcando 2.500 — mesmo depois de nove mensalidades.

Empréstimo de mensalidade **nunca aparece como atrasado**: o acerto final não
tem prazo, e a data ali é só previsão.

#### Favor pode entrar na projeção

Mesma caixinha do empréstimo, no formulário do favor. Marcado, o que falta
receber entra no simulador **no mês do vencimento** — cada parcela de uma
repetição no seu próprio mês.

**Exige a data de pagamento.** Sem ela não há mês onde lançar, e o app recusa
salvar em vez de inventar um.

Ligar ou desligar numa linha de repetição pergunta o alcance — somente esta,
esta e as próximas, ou todas — do mesmo jeito que excluir.

#### Horizonte e recorte

O cartão **"12 meses"** abre a faixa e mostra o total da janela inteira.
Escolhido um mês, o número grande e os KPIs passam a falar **do período até
ele** — clicar em novembro mostra o acumulado até novembro.

Tocar no selo do horizonte (`12 meses`, sob o valor) troca a projeção para
**24, 36 ou 48 meses**. A escolha fica em `settings.horizon_months` e segue o
usuário entre aparelhos.

#### Empréstimo pode entrar na projeção

No formulário do empréstimo, **"Essa receita vai para a economia?"** faz o que
falta receber aparecer no simulador como renda do tipo empréstimo:

| Método | Como entra |
|---|---|
| À vista / parcelado | uma vez, no mês do vencimento |
| Mensalidade | uma mensalidade por vez, no mês corrente |

A mensalidade não tem prazo, então projetar os 12 meses inventaria um fim que
ninguém combinou. Entra uma só, e ela **anda sozinha** a cada virada de mês.

Entra o que falta (`a receber − já recebido`), não o total: o que já voltou não
é dinheiro futuro. Empréstimo quitado para de projetar.

#### A economia atravessa para o simulador

Toda conta de tipo **Economia** aparece no simulador como **poupança
frequente**, repetindo todo mês. É o mesmo dinheiro visto dos dois lados: em
contas ele sai da sobra, no simulador ele entra no acumulado.

A linha é derivada a cada desenho — não existe registro duplicado. Por isso ela
aparece marcada como "de contas" na lista do mês e não é editável ali: quem
manda é o cadastro em contas.

### Compartilhar a economia

A chave no topo da economia abre o seu **código**. Quem digitar esse código
passa a ver a sua economia — e só ela.

| Vê | Não vê |
|---|---|
| seus lançamentos | contas, empréstimos e favores em geral |
| suas economias de contas | qualquer outra aba |
| empréstimos e favores **marcados** | qualquer coisa editável |

**Só leitura.** Não existe política de escrita no banco para dado de terceiro,
então não há o que burlar pela interface.

Os lançamentos de cada pessoa aparecem numa **cor pastel**, escolhida por quem
olha — a cor existe na tela de quem vê, então é essa pessoa que decide. As
iniciais de quem está conectado ficam empilhadas ao lado do seu avatar. O botão **Juntos / Separados** decide se eles entram na sua projeção ou
só aparecem na lista.

Gerar um código novo desliga o anterior. Qualquer um dos dois lados desfaz a
conexão.

A atualização acontece ao abrir a aba de economia — não é tempo real.

### Favores

Dinheiro emprestado **sem juros**, só para não esquecer. São três níveis:

```
pessoa ──► dia (uma saída) ──► item (um gasto)
```

Uma linha por gasto em `favors` (quem, por quê, quanto, que dia). O dia não é
um cadastro: favores da mesma pessoa na mesma data formam a saída.

#### O pagamento é um lançamento à parte

O quanto já voltou **não** fica no favor. Cada pagamento é uma linha em
`favor_payments` com um **alcance**:

| Alcance | Entra em |
|---|---|
| `item` | um gasto específico |
| `dia` | as contas daquela pessoa naquele dia |
| `total` | tudo que ela deve |

O sistema reparte sozinho: **do mais antigo para o mais novo**, enchendo um
gasto de cada vez. O mais específico entra primeiro (item, depois dia, depois
total), para um pagamento avulso não engolir o item que se quis quitar de
propósito. Sobra vira **crédito** da pessoa; nada é perdido.

Exemplo — saída de 10/set com Uber 40, comida 160 e roupa 300, mais farmácia
100 no dia 15. Ela passa 200 sem dizer de quê: quita o Uber e a comida, e a
roupa fica intacta.

#### A dívida é que se repete, não o pagamento

"Marina me deve 250 até dezembro, 3 vezes" se anota no próprio favor: o
formulário tem **repete por quantos meses**, e salvar cria **um favor por
mês**, mesma pessoa e mesmo motivo.

Só o **vencimento** avança (dia 31 em mês curto cai no último dia do mês). A
data em que o dinheiro saiu é a mesma nas N linhas — a saída aconteceu uma vez,
num dia só. Por isso repetir exige a data de pagamento preenchida.

Cada mês é uma dívida com data própria — é o que faz a lista por dia, a
repartição do pagamento e o "quitar só este item" continuarem valendo sem
nenhum caso especial. Pagamento não se repete: cada um é um lançamento
avulso, do valor que de fato entrou.

#### A lista é por vencimento

Os favores de cada pessoa se agrupam pela data em que ela **combinou de pagar**,
do que vence antes para o que vence depois. A data em que o dinheiro saiu fica
em cada item ("pego em 05/out"), mas não ordena nada. Sem prazo combinado, o
favor cai num grupo "sem prazo" no fim.

A repartição do pagamento segue a **mesma** ordem — se divergisse, o dinheiro
cairia num favor diferente do que está na tela.

Quando a lista atravessa a virada do ano, a data mostra o ano: `07/jan/27`.

#### Excluir o que se repete

As linhas de uma repetição compartilham `series_id`. Ao excluir uma delas o app
pergunta o alcance, como qualquer agenda:

| Opção | O que sai |
|---|---|
| Somente este | só a linha aberta |
| Este e os próximos | ela e as de vencimento posterior |
| Todos da série | a repetição inteira |

Favor avulso some direto, sem perguntar. Todo caso tem **Desfazer**, que repõe
também os pagamentos — sem isso a divisão voltaria errada.

Favores criados antes desta mudança não têm série e contam como avulsos.

#### Prazo e atraso

`due_on` guarda quando ela combinou de pagar — **nulo é normal** ("paga quando
puder"), e sem prazo não existe atraso.

Passou do prazo com dinheiro faltando, o favor fica **atrasado** e a cobrança
escorrega para o mês seguinte: `venceu 05/jun — foi para 05/out`. O dia e a
pessoa herdam o atraso dos seus itens, e quem tem favor atrasado sobe na lista.
Favor quitado nunca atrasa, e o prazo dele deixa de contar.

Na repetição, as duas datas andam juntas: cada mês ganha o seu vencimento.

**Quanto falta e a % paga são derivados**, nunca guardados: editar o valor de
um gasto ou apagá-lo recalcula tudo sozinho. Favores quitados aparecem
riscados a lápis.

### Contas

Uma linha por registro em `accounts`, separadas pelo campo `kind`:

| Tipo | Campos próprios | Para quê |
|---|---|---|
| `renda` | frequência | o que entra |
| `fixa` | dia do vencimento, pago | valor previsível, data certa |
| `variavel` | média dos últimos meses | oscila mês a mês |
| `assinatura` | — | mensal recorrente |
| `economia` | — | quanto se guarda por mês |

**O total anual nunca é guardado**: sai de `valor × 12`. As rendas são
normalizadas para o equivalente mensal antes de somar:

| Frequência | Fator |
|---|---|
| todo mês | ×1 |
| a cada 15 dias | ×2 |
| toda semana | ×4,345 |
| uma vez por ano | ÷12 |
| pontual | não entra no fluxo mensal |

`sobra = renda − fixas − variáveis − assinaturas − economia` — guardar é um
destino do dinheiro como outro qualquer, então sai da sobra. A barra do topo mostra a
fatia de cada grupo sobre a renda, e as metas de economia são 10 / 20 / 30%
dela.

## Como funciona o cálculo

Janela rolante de 12 meses a partir do mês atual. Seis tipos de entrada:

| Tipo | Sigla | Comportamento |
|---|---|---|
| Poupança frequente | `fs` | todo mês, **começa no 2º mês** da janela; ignora a lista de meses |
| Poupança pontual | `os` | só nos meses marcados |
| Renda extra certa | `ci` | só nos meses marcados |
| Renda extra incerta | `ui` | faixa mín.–máx.; **só o cenário otimista a considera** (pelo teto) |
| Empréstimo | `em` | só nos meses marcados |
| Consórcio | `co` | só nos meses marcados |

- `saldo do mês (pessimista) = poupança + renda certa`
- `saldo do mês (otimista)   = poupança + renda certa + teto da renda incerta`
- O **saldo inicial** entra apenas no primeiro mês; o acumulado corre a partir dele.
- Na sidebar do desktop o destaque é o acumulado em **dezembro do ano corrente**;
  no cartão do mobile é o total no fim da janela de 12 meses.

## Dados e sincronização

O app é **local-first**: o `localStorage` é a verdade imediata (abre e funciona
offline) e o **Supabase** é a cópia compartilhada entre os aparelhos. Toda
alteração grava aqui na hora e sobe para a nuvem em seguida; sem rede, fica
pendente e sobe sozinha quando a conexão volta.

- Uma linha por registro em `entries`, `loans` e `accounts` — editar um
  registro grava só ele.
- Alteração feita no PC aparece no celular na hora (Realtime).
- **Sem credenciais em `assets/js/config.js`, o app roda em modo local**, sem
  login, exatamente como antes — útil para testar ou usar num aparelho só.
- **Apagar dados salvos** apaga também na nuvem, em todos os aparelhos.

O banco é a única fonte dos dados. Não há semente nem exportação em JSON: uma
conta nova começa vazia, e o backup é o próprio Supabase.

### Configurar o Supabase

**1. Crie as tabelas.** No painel do Supabase → **SQL Editor** → cole e rode,
nesta ordem:

1. [`supabase/schema.sql`](supabase/schema.sql) — `entries` e `settings` (economia)
2. [`supabase/schema-loans.sql`](supabase/schema-loans.sql) — `loans` (empréstimos)
3. [`supabase/schema-accounts.sql`](supabase/schema-accounts.sql) — `accounts` (contas)
4. [`supabase/schema-favors.sql`](supabase/schema-favors.sql) — `favors` (favores)
5. [`supabase/schema-favors-pagamentos.sql`](supabase/schema-favors-pagamentos.sql) — `favor_payments` e a migração do `paid`
6. [`supabase/schema-favors-vencimento.sql`](supabase/schema-favors-vencimento.sql) — `favors.due_on`
7. [`supabase/schema-favors-serie.sql`](supabase/schema-favors-serie.sql) — `favors.series_id`
8. [`supabase/schema-loans-economia.sql`](supabase/schema-loans-economia.sql) — `loans.to_savings`
9. [`supabase/schema-horizonte.sql`](supabase/schema-horizonte.sql) — `settings.horizon_months`
10. [`supabase/schema-favors-economia.sql`](supabase/schema-favors-economia.sql) — `favors.to_savings`
11. [`supabase/schema-compartilhar.sql`](supabase/schema-compartilhar.sql) — códigos, `economy_shares` e as políticas de leitura
6. [`supabase/schema-loans-mensalidade.sql`](supabase/schema-loans-mensalidade.sql) — `received_interest` e a mensalidade que não quita

Quem criou `accounts` antes do tipo `economia` precisa rodar também
[`supabase/schema-accounts-economia.sql`](supabase/schema-accounts-economia.sql).

Os dois ligam o RLS e publicam no Realtime. É seguro rodar de novo.

Se uma dessas tabelas ainda não existir, o app não quebra: aquele módulo fica
vazio e o resto sincroniza normalmente.

**2. Aponte as credenciais.** Em `assets/js/config.js`, preencha `SUPABASE_URL`
e `SUPABASE_ANON_KEY` com os valores de **Project Settings → Data API**.

> A chave **anon/publishable** é feita para ficar visível no código do
> navegador — sozinha ela não abre nada. Quem protege os dados é o RLS do
> schema, que amarra cada linha ao seu dono. **Nunca** use aqui a chave
> `service_role`/`secret`: ela ignora o RLS.

**3. Ajuste as URLs de retorno.** Em **Authentication → URL Configuration**,
coloque em *Site URL* e em *Redirect URLs* o endereço onde o app roda
(`https://<usuário>.github.io/orcamento/`, e `http://localhost:4173` para
testes). Sem isso, os links de confirmação de e-mail e de redefinição de senha
não voltam para o app.

**4. Confirmação de e-mail** (Authentication → Providers → Email): se estiver
ligada, criar a conta exige clicar no link do e-mail antes do primeiro login —
o app avisa isso na tela. Para um app pessoal, desligar é aceitável e evita o
limite de envio do plano gratuito.

### O primeiro login

Faça o **primeiro login no aparelho que já tem os dados** (o PC onde você vinha
usando o simulador). A regra de reconciliação é:

| Situação | O que acontece |
|---|---|
| Nuvem tem dados | A nuvem vence e substitui o que está no aparelho |
| Nuvem vazia, aparelho tem dados | Os dados do aparelho sobem para a nuvem |
| Tudo vazio | Começa com as entradas originais e as envia |

Entrando primeiro num aparelho vazio, a nuvem é semeada com as entradas
originais — e aí o PC passaria a receber essa versão em vez de enviar a dele.

### Trocar a senha

**Menu → Trocar senha**, com a sessão ativa. Usa `auth.updateUser` — não pede a
senha atual. Se você ligar *Secure password change* no painel do Supabase, passa
a exigir login recente; o app avisa e pede para sair e entrar de novo.

Esqueceu a senha e não consegue entrar? Aí é pelo **"Esqueci a senha"** da tela
de login, que depende das *Redirect URLs* configuradas.

### "Lembrar"

Marcado, a sessão fica no `localStorage` e sobrevive a fechar o app. Desmarcado,
vai para o `sessionStorage` e some ao fechar a aba — útil em computador
compartilhado.

## Rodar localmente

Precisa de um servidor HTTP — o service worker não funciona em `file://`.

```bash
npx serve -l 4173 .
# abre http://localhost:4173
```

## Campos de dinheiro

Máscara de centavos, como nos apps de banco: cada dígito entra pela direita.
`1` → 0,01 · `1243` → 12,43 · `124300` → 1.243,00

A [literatura de UX](https://uxpatterns.dev/patterns/forms/currency-input)
desaconselha formatar durante a digitação porque o cursor pula ao inserir o
separador de milhar. Essa máscara escapa disso: o cursor fica fixo no fim.

Campos novos de valor entram na lista `CAMPOS_DINHEIRO` em `app.js`.

## Testes

A camada de dados (diff por linha, normalização, reconciliação) tem 72
asserções, com um cliente Supabase falso — não tocam a rede nem o seu projeto.

```bash
node tests/run-all.js
```

## Publicar

Arquivos estáticos, sem build. Em **GitHub Pages** (Settings → Pages → branch `main`,
pasta `/`), o app fica em `https://<usuário>.github.io/orcamento/`. Todos os
caminhos são relativos, então subpasta funciona.

Instalar no celular: Android/Chrome mostra o botão em *Menu → Instalar app*;
no iOS, Compartilhar → *Adicionar à Tela de Início*.

## Ícones

[Iconoir](https://iconoir.com) (MIT). Como o service worker só cacheia
same-origin, o CSS via CDN deixaria os ícones sumirem offline — então os
ícones usados são **vendorizados** num sprite SVG embutido no `index.html`.

```bash
node scripts/gen-icons.js /caminho/sprite.svg   # baixa e regenera o sprite
```

Para usar um ícone novo: acrescente o nome à lista em `scripts/gen-icons.js`,
rode o script e substitua o bloco `<svg class="ico-sprite">` no `index.html`.
No markup: `<svg class="ico"><use href="#i-nome"/></svg>`. O ícone herda a cor
do contexto (`currentColor`) e o tamanho vem do CSS.

Cada tipo de entrada tem seu ícone (`TYPE_ICON` em `app.js`) — poupança
frequente/pontual, renda certa/incerta, empréstimo e consórcio — usados na
lista, na grade do desktop e na legenda.

## Ao publicar uma atualização

Navegação é network-first, mas o CSS e os JS são cache-first no service worker.
**Suba o `VERSION` em `sw.js` sempre que mexer em `app.css`, `app.js`,
`store.js` ou `config.js`** — senão quem já tem o app instalado pega o HTML novo
com o JS velho por um carregamento.

## Estrutura

```
index.html                 markup (login + shell mobile + shell desktop + componentes)
assets/css/app.css         tokens, layout mobile-first, breakpoint 1024 para desktop
assets/js/config.js        URL e chave do Supabase (vazio = modo local)
assets/js/store.js         camada de dados: cache local, sync, realtime, auth
assets/js/app.js           cálculo, render, formulário, tela de login
assets/vendor/supabase.js  supabase-js 2.58 (vendorizado p/ funcionar offline)
scripts/gen-icons.js       baixa os ícones da Iconoir e gera o sprite
supabase/schema.sql        entries + settings, RLS e realtime
supabase/schema-loans.sql  loans, RLS e realtime
supabase/schema-accounts.sql accounts, RLS e realtime
supabase/schema-favors.sql   favors, RLS e realtime
supabase/schema-favors-pagamentos.sql
                             favor_payments, parcelas e a saída do paid
manifest.webmanifest       metadados do PWA
sw.js                      service worker (app shell offline)
assets/icons/              ícones 192/512/maskable/apple-touch
tests/                     asserções da camada de dados (node tests/run-all.js)
CLAUDE.md                  contexto e armadilhas para quem for mexer no código
```

Os componentes compartilhados (`#c-list`, `#c-legend`, `#c-settings`) são movidos
por JS entre os slots mobile e desktop quando o breakpoint muda; a tela do
simulador tem markup próprio no mobile (`#m-*`) e a sidebar no desktop (`#c-hero`,
`#c-kpis`).

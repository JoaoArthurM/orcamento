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
    └─► ajustes (conta, senha, exportar/importar, apagar)
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

Status derivado: **Quitado** (recebido ≥ a receber), **Atrasado** (venceu e não
quitou), **Parcial** (recebeu algo), **Em aberto**. Os filtros no topo da lista
usam os mesmos critérios.

O cartão do topo soma tudo: a receber, juros embutidos, recebido e em aberto.

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
- **Menu → Exportar/Importar JSON** continua funcionando como backup manual.
- **Apagar dados salvos** apaga também na nuvem, em todos os aparelhos.

### Configurar o Supabase

**1. Crie as tabelas.** No painel do Supabase → **SQL Editor** → cole e rode,
nesta ordem:

1. [`supabase/schema.sql`](supabase/schema.sql) — `entries` e `settings` (economia)
2. [`supabase/schema-loans.sql`](supabase/schema-loans.sql) — `loans` (empréstimos)
3. [`supabase/schema-accounts.sql`](supabase/schema-accounts.sql) — `accounts` (contas)

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
manifest.webmanifest       metadados do PWA
sw.js                      service worker (app shell offline)
assets/icons/              ícones 192/512/maskable/apple-touch
```

Os componentes compartilhados (`#c-list`, `#c-legend`, `#c-settings`) são movidos
por JS entre os slots mobile e desktop quando o breakpoint muda; a tela do
simulador tem markup próprio no mobile (`#m-*`) e a sidebar no desktop (`#c-hero`,
`#c-kpis`).

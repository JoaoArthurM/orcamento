# orçamento. — PWA de finanças pessoais

Site estático, **sem build**. Não há `package.json`; não rode `npm install`.

Três módulos (economia, empréstimos, contas) sobre um hub, com login e
sincronização via Supabase. Detalhes de produto e de schema no `README.md`.

## Rodar e testar

```bash
npx serve -l 4173 .            # o service worker não roda em file://
node tests/run-all.js          # asserções da camada de dados
```

Para testar sem login, **copie o projeto** para um diretório temporário e
esvazie o `config.js` da cópia. Esvaziar o do repositório já fez as
credenciais subirem em branco num commit, e os dados do usuário sumirem.

## Ao editar CSS/JS: suba o VERSION do sw.js

CSS e JS são cache-first no service worker. Sem bumpar, o navegador serve o
HTML novo com o JS velho — a falha mais comum desta base, e ela se disfarça de
bug de código. Em teste, desregistre o SW e limpe os caches (ele guarda
`config.js` também).

## Editar arquivos por script

Use **função** como replacement: `s.replace(velho, () => novo)`.
Com string, `$'` `$&` `` $` `` são padrões especiais do `String.replace` e
injetam pedaços do próprio arquivo — já corrompeu `app.js` inteiro aqui.

Nunca `git checkout -- .`: quase tudo é untracked, então isso não recupera
nada e ainda reverte o que está rastreado (já apagou o README).

## Cálculo — não "corrigir"

`mv()` e `calc()` em `app.js` são porte fiel do `simulator.html` original.
Três pontos parecem bug e são intencionais:

- `fs` (poupança frequente) pula o 1º mês da janela e **ignora** `months`
- poupança **soma** no saldo, não subtrai
- `inLP` é somado e nunca usado (o cenário pessimista trata renda incerta como 0)

`node tests/calc.test.js` protege os três, mais a regressão de conjunto
(`cumP` 34691.21 / `cumO` 44895.11). Ele extrai o bloco de cálculo do app.js
por marcadores de texto e roda numa VM com a janela de 12 meses fixada — se
você mexer nos comentários-banner em volta de `get12M`/`calc`, o teste avisa
que não achou o bloco.

## Ids no index.html

`getElementById` devolve o **primeiro** que casar. Um id repetido não dá erro:
o código passa a ler e escrever no elemento errado, em silêncio. Já aconteceu
com `lo-total`/`lo-received`, que existiam no resumo e no formulário — o
formulário de empréstimo gravava `a receber` no lugar errado e todo empréstimo
saía com juros zero.

`node tests/markup.test.js` verifica duplicatas, se todo id lido com `.value`
é mesmo um campo, e se todo ícone referenciado existe no sprite.

## Store.save recebe um objeto — e coleção faltando APAGA

`Store.save({ entries, saldoInicial, loans, accounts, favors, payments, hubOrder })`.

O diff de `COLECOES` compara com o último estado confirmado: coleção que chega
`[]` vira DELETE de todas as linhas. Por isso a assinatura é um objeto e não
uma lista de argumentos — com nomes, o campo esquecido aparece na chamada.
`completar()` preenche o que faltar, mas não adivinha intenção: quem monta o
estado é `estadoAtual()` no app.js, e é ele que deve ganhar a coleção nova.

Ao acrescentar uma tabela, mexa **só** em `COLECOES` — `estadoVazio()`, o
`wipe()` e o realtime saem dali. Se você precisou editar uma lista de tabelas
escrita à mão, é sinal de que ela devia derivar de `COLECOES`.

## Mensalidade não é parcela

Em `method === 'mensal'`, `total_due === principal` e o juro vive em
`received_interest`, que só acumula. `received` é **principal devolvido** — e é
só ele que quita.

Já esteve errado: `total_due = principal + installment_amount` fazia nove
mensalidades de 300 parecerem 2.700 de 2.800 quitados, com a pessoa ainda
devendo os 2.500 inteiros.

Consequências que não são óbvias: mensalidade **nunca é "Atrasado"** (o acerto
não tem prazo), a porcentagem de juro é **ao mês**, e o "recebido" da tela soma
`received + received_interest`.

## O Realtime devolve as suas próprias gravações

Salvar dispara um evento que volta para este mesmo aparelho. O eco chega
**depois** do push terminar, com `dirty` e `pushing` já em false — as travas de
"tem coisa pendente" não pegam.

Por isso `scheduleRemote` compara `assinatura(remote)` com `assinatura(synced)`
e só chama `onRemote` quando mudou de verdade. Sem isso, cada edição do usuário
virava um "Atualizado de outro aparelho".

`node tests/realtime.test.js` cobre os dois lados: eco não avisa, mudança de
fora avisa.

## Sem semente, sem export

Não há dados de exemplo no código nem exportação em JSON — o banco é a única
fonte. Conta nova começa em `Store.estadoVazio()` e **não** grava nada até a
primeira entrada: gravar vazio é o mesmo caminho de "apaguei tudo".

A semente antiga tinha nomes e valores reais, e o repositório é público. Não
reponha dados de pessoa nenhuma em teste, fixture ou placeholder.

## Valor derivado não se guarda

`favors` não tem `paid`: quanto cada gasto recebeu sai de
`Store.alocarFavores(favors, payments)`, recalculado a cada desenho. Foi assim
justamente porque a divisão gravada envelhece — baixar o valor de um gasto, ou
apagá-lo, deixaria a repartição de ontem errada e sem nada de onde refazê-la.

Mesma razão para o deslize do favor vencido: `favorInfo` compara `due_on` com
hoje e empurra mês a mês até cair no futuro. A data guardada não muda, então o
app não reescreve o banco só porque o tempo passou.

O deslize **não pode** vazar para `alocarFavores`: lá a ordem é a do vencimento
combinado (`due_on`), não a da data já empurrada. Com a data deslizada, o
pagamento cairia num favor diferente do que está na tela.

## Favor: quem manda é o vencimento

Na repetição por N meses, **só o `due_on` avança**. O `lent_on` é o mesmo nas N
linhas: o dinheiro saiu uma vez, num dia só — o que se repete é a promessa de
pagar. Fazer as duas datas andarem punha o dinheiro saindo em meses em que
ninguém pegou nada, e foi um bug real aqui.

Repetir **exige** data de pagamento: sem ela só o vencimento andaria, e as N
linhas sairiam idênticas.

Essa lógica mora em `saveFavor` (app.js), que precisa de DOM — os testes de VM
não a alcançam. Verifique no navegador ao mexer nela.

As N linhas compartilham `series_id`, e é só isso que liga uma repetição. Nada
de deduzir série por (pessoa, motivo, valor): o usuário edita essas linhas, e
uma assinatura que se desfaz ao corrigir um typo é pior que não agrupar.

`Store.favoresDaExclusao(favors, id, alcance)` decide quem sai numa exclusão —
`este` · `proximos` · `todos`. "Próximos" é por **vencimento**, não por ordem de
criação. Está em store.js de propósito, para ter teste; o seletor em si vive no
app.js.

Ao excluir vários, o desfazer tem de repor favores **e** pagamentos: os de dia e
de total se redistribuem sozinhos no que sobra, então repor só os favores traz a
divisão de volta errada.

`due_on` ordena e agrupa; `lent_on` fica registrado e não ordena nada.
`Store.ordemFavor()` é a regra única — sem prazo vai para o fim da fila
(`9999-12-31`), e `porDia` no app.js usa o mesmo critério.

Tela e repartição **têm** de concordar: o botão diz "divide pelo que vence
antes", então é isso que `alocarFavores` faz. Se divergirem, o dinheiro cai
num favor que o usuário não viu.

Pagamento de alcance `dia` casa por `due_on` **ou** por `lent_on` — os
registrados antes desta mudança guardaram a data de saída, e sem a segunda
opção perderiam o alvo e virariam crédito do nada.

Contas de dinheiro na repartição são em **centavos inteiros**: um resto de
ponto flutuante faz um favor quitado aparecer como aberto.

## requestAnimationFrame não serve para tudo

O rAF **para quando a janela perde o foco** — e não volta a rodar sozinho. Um
callback agendado ali (ou uma flag de "já agendei") fica preso, e o efeito só
reaparece depois de outra interação. Para trabalho leve disparado por scroll,
prefira execução direta com limite de tempo. Foi o caso do contraste do topo.

## Testar no navegador

Redimensione para ~400px antes: acima de 1024px o app troca para o layout
desktop e `#view-hub` / `#view-loans` / `#view-contas` ficam `display:none`.
Medições retornam 0 sem erro nenhum, e o teste passa falsamente.

Gestos de toque precisam de `Touch`/`TouchEvent` reais — `PointerEvent`
sintético pula a arbitragem de rolagem do navegador e aprova código que falha
no dedo.

Para ver o app sem logar, esvazie `assets/js/config.js`, teste, e **restaure**.

## Layout: um DOM, dois shells

`applyLayout()` move `#c-list`, `#c-legend` e `#c-settings` entre a sidebar
(≥1024px) e as views mobile; o que é só de desktop vai para `#parked`.

**Consequência:** estilo de componente compartilhado definido dentro do
`@media (min-width:1024px)` desaparece no mobile.

A tela do simulador tem markup próprio no mobile (`#m-*`); a sidebar do
desktop usa `#c-hero`/`#c-kpis`. `renderHero()` e `renderKPIs()` escrevem nos
dois.

## Supabase

A chave em `assets/js/config.js` é a publishable — pública por design,
protegida pelo RLS. Não mova para variável de ambiente (site estático não tem).
Config vazia = modo local sem login.

`CREATE OR REPLACE VIEW` só acrescenta coluna no fim; para inserir no meio ou
reordenar, use `drop view` + `create view`.

E a view **depende** das colunas que lê: derrubar uma coluna com a view de pé
dá `2BP01: cannot drop column ... because other objects depend on it`. Numa
migração que recria a view no fim, o `drop view` vai no **começo** do arquivo.

`node tests/sql.test.js` confere parênteses, vírgula solta antes de SELECT e
essa ordem — mas não substitui rodar o SQL de verdade.

O RLS barra antes do CHECK, então constraints não são testáveis pela API sem
sessão — `42501` ali é o comportamento certo.

## Ícones

```bash
node scripts/gen-icons.js index.html   # regenera o sprite no lugar
```

Acrescente o nome à lista em `scripts/gen-icons.js` antes de rodar. No markup:
`<svg class="ico"><use href="#i-nome"/></svg>` — herda a cor via `currentColor`
e o tamanho vem do CSS.

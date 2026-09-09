# orçamento. — PWA de finanças pessoais

Site estático, **sem build**. Não há `package.json`; não rode `npm install`.

Três módulos (economia, empréstimos, contas) sobre um hub, com login e
sincronização via Supabase. Detalhes de produto e de schema no `README.md`.

## Rodar e testar

```bash
npx serve -l 4173 .            # o service worker não roda em file://
node tests/run-all.js          # 72 asserções da camada de dados
```

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

Regressão rápida (semente + saldo 1933.71): `cumP` = **34691.21**,
`cumO` = **44895.11**.

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

O RLS barra antes do CHECK, então constraints não são testáveis pela API sem
sessão — `42501` ali é o comportamento certo.

## Ícones

```bash
node scripts/gen-icons.js index.html   # regenera o sprite no lugar
```

Acrescente o nome à lista em `scripts/gen-icons.js` antes de rodar. No markup:
`<svg class="ico"><use href="#i-nome"/></svg>` — herda a cor via `currentColor`
e o tamanho vem do CSS.

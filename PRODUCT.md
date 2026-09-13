# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Usuário primário: **o autor e um círculo pequeno de pessoas próximas** —
parceiro(a), família, amigos que pegam dinheiro emprestado. Não é um produto
aberto ao público: quem usa já teve o app apresentado por alguém.

A situação real de uso é **no celular, em pé, com uma mão** (393–412px). Desktop
existe e é o layout mais antigo, mas é o secundário.

O trabalho é sempre o mesmo: **saber quanto vou ter guardado daqui a alguns
meses**, e manter atualizado o que sustenta esse número — o que entra, o que
sai todo mês, e o dinheiro que está com outras pessoas.

O compartilhamento de economia por código e o módulo de favores existem porque
essas pessoas próximas usam junto: planejamento a dois sem conta conjunta, e um
registro de quem deve o quê sem cobrar juros.

## Product Purpose

Projetar o saldo acumulado dos próximos 12, 24, 36 ou 48 meses em **dois
cenários** — pessimista e otimista — e manter esse número honesto conforme a
vida muda.

Sucesso é o usuário abrir o app, olhar um número, e confiar nele. Não é
completude de registro nem disciplina de categorização.

## Positioning

**Projeta o futuro; não cataloga o passado.**

O simulador é o coração do produto, e é a linha que uma reescrita não pode
cruzar. Todo módulo existe porque alimenta a projeção ou porque a defende de
ficar desatualizada:

- **contas** define a sobra e a economia mensal → vira poupança frequente na projeção;
- **empréstimos** e **favores** marcados injetam o que falta receber no mês do vencimento;
- **compartilhar** soma a economia de outra pessoa ao mesmo acumulado.

Um app de finanças comum categoriza despesa que já aconteceu. Este responde
"quanto eu tenho em dezembro" antes de dezembro chegar, e trata renda incerta
com honestidade: ela só existe no cenário otimista.

Capacidades que reforçam a posição sem serem a posição: dinheiro entre pessoas
como cidadão de primeira classe (repartição automática de pagamento,
mensalidade que não quita o principal), economia compartilhada só-leitura por
código, e operação local-first instalável.

## Operating Context

- **Hub** com cartões reordenáveis abre quatro módulos — economia, empréstimos,
  contas, favores — mais ajustes. A ordem dos cartões é por aparelho
  (`localStorage`).
- Cada módulo tem a mesma forma: uma tela principal, um **+** central para
  lançar, e **tabelas** para buscar/editar/excluir.
- Uso offline é normal, não exceção: o `localStorage` é a verdade imediata e o
  Supabase é a cópia entre aparelhos. Edição no PC aparece no celular na hora
  (Realtime); a economia compartilhada de terceiros atualiza só ao abrir a aba.
- Instalação como PWA (Android via menu do app; iOS via Compartilhar → Adicionar
  à Tela de Início). Publicado em GitHub Pages, caminhos relativos.

### Terminologia que o produto usa e não deve trocar

`a receber` (total com juros) · `emprestado` (principal) · `já recebido`
(principal devolvido) · `mensalidade` (juro por fora, nunca quita) · `favor`
(empréstimo sem juros) · `alcance` (item · dia · total, e este · próximos ·
todos) · `poupança frequente` / `pontual` · `renda extra certa` / `incerta` ·
`sobra` · `horizonte` · `Juntos / Separados`.

## Capabilities and Constraints

**Confirmado e em produção**

- Simulador com horizonte variável (12/24/36/48 meses), cenário pessimista e
  otimista, recorte por mês.
- Quatro módulos (economia, empréstimos, contas, favores) sobre um hub, com
  login, sincronização e Realtime via Supabase.
- Compartilhamento de economia por código, mútuo e **somente leitura**, com cor
  pastel escolhida por quem olha.
- Sem semente e sem exportação em JSON: o banco é a única fonte.

**Restrições duráveis**

- **Site estático, sem build.** Não há `package.json`; nenhum framework, nenhum
  `npm install`. O service worker só cacheia same-origin, então recurso externo
  some offline — por isso supabase-js e o sprite de ícones Iconoir são
  vendorizados. A **única** dependência externa em runtime é a fonte Poppins,
  carregada do Google Fonts; offline o app cai na pilha de fontes do sistema.
- **Mobile-first.** Breakpoint em 1024px; abaixo dele é a experiência
  principal, uma rolagem e nav flutuante.
- **CSS e JS são cache-first no SW:** qualquer edição neles exige subir o
  `VERSION` em `sw.js`.
- **Um DOM, dois shells.** `applyLayout()` move `#c-list`, `#c-legend` e
  `#c-settings` entre sidebar e views mobile. Estilo compartilhado definido
  dentro de `@media (min-width:1024px)` desaparece no mobile.
- A chave do Supabase em `assets/js/config.js` é publishable, pública por
  design, protegida por RLS. Não vai para variável de ambiente — site estático
  não tem uma.
- Toda a lógica de cálculo em `app.js` é porte fiel do `simulator.html`
  original, com três comportamentos contraintuitivos que são intencionais e
  protegidos por teste. Ver `CLAUDE.md`.

**Deliberadamente em aberto**

- Não há decisão sobre abrir o produto para desconhecidos. Primeiro uso,
  onboarding e nomenclatura para quem nunca viu o app **não** são requisitos
  hoje.
- Não há decisão sobre monetização, licenciamento comercial ou multiusuário
  além do compartilhamento por código já existente.

## Brand Commitments

- **Nome:** `orçamento.` — minúsculo, com o ponto final. O ponto faz parte do
  nome.
- **Voz:** português brasileiro, direto, em caixa baixa. Rótulos falam como
  gente fala (`quem está devendo`, `a receber`, `como vai pagar`), não como
  software corporativo. Nada de inglês na interface.
- **Ícones:** Iconoir (MIT), vendorizados num sprite SVG embutido no
  `index.html`, herdando `currentColor`.
- Nenhuma outra restrição de identidade foi fixada pelo usuário.

## Evidence on Hand

- `README.md` — comportamento de produto e schema, escrito e mantido pelo autor.
  Fonte factual mais completa que existe.
- `CLAUDE.md` — armadilhas reais desta base, cada uma escrita depois de um bug
  que aconteceu de verdade.
- Código de produção completo: `index.html`, `assets/css/*`, `assets/js/app.js`,
  `assets/js/store.js`, os `supabase/schema*.sql`.
- Testes: `node tests/run-all.js` (camada de dados, ~72 asserções, cliente
  Supabase falso), `tests/calc.test.js`, `tests/markup.test.js`,
  `tests/realtime.test.js`, `tests/sql.test.js`.

**Ausências que não devem ser inventadas:** não existem depoimentos, métricas de
uso, número de usuários, benchmark, preço, nem dados de exemplo. **Nenhum dado
real de pessoa alguma** pode entrar em teste, fixture, screenshot ou
placeholder — o repositório é público, e a semente antiga com nomes e valores
reais já foi removida por isso.

## Product Principles

1. **O número é o produto.** Tudo na tela existe para tornar o acumulado
   projetado confiável ou para consertá-lo rápido. O que não serve à projeção
   compete com ela.
2. **Honestidade sobre otimismo.** Renda incerta não vira saldo; ela vive só no
   cenário otimista. O app nunca melhora o número por conveniência.
3. **Valor derivado não se guarda.** Juros, quanto falta, quanto cada favor
   recebeu, total anual — tudo recalculado a cada desenho, porque número gravado
   envelhece e mente.
4. **Uma mão, em pé, no celular.** Se a ação não é confortável com o polegar em
   400px de largura, ela está no lugar errado.
5. **Perder dado é o pior desfecho possível.** Local-first, escrita imediata,
   diff por linha, e `Desfazer` em toda exclusão. Nunca gravar vazio.

## Accessibility & Inclusion

Nenhum requisito específico de acessibilidade foi estabelecido pelo usuário além
do contexto de uso (uma mão, telefone, em pé), que fixa alvos de toque
confortáveis e alcance do polegar como restrição de produto, não de estilo.

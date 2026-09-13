---
name: orçamento.
description: Simulador econômico pessoal instalável, impresso em verde-cofre e lima sobre papel claro.
colors:
  verde-custodia: "#123A2C"
  verde-custodia-fundo: "#0D2B20"
  verde-custodia-claro: "#1B4B39"
  lima-de-aval: "#C9E88E"
  papel: "#F8FAF6"
  superficie: "#FFFFFF"
  tinta-media: "#6F8C7C"
  tinta-fraca: "#9CB2A4"
  traco: "#EAF1E5"
  traco-cartao: "#E1E9DD"
  lima-selo: "#D5EDB3"
  lima-sobre-escuro: "#CEF29B"
  verde-sobre-escuro: "#BED6CA"
  ambar-contas: "#EFE0BC"
  ambar-contas-tinta: "#7A5F22"
  azul-favores: "#DCEBF6"
  azul-favores-tinta: "#14405C"
  alerta: "#C84B4B"
  confirmado: "#4A8A5F"
  pilula-fs-fundo: "#F1F6EE"
  pilula-os-tinta: "#51705E"
  pilula-ci-fundo: "#E9F6D6"
  pilula-ci-tinta: "#2F6142"
  pilula-ui-fundo: "#FAF2DF"
  pilula-ui-tinta: "#8A6A24"
  pilula-em-fundo: "#FEF0EE"
  pilula-em-tinta: "#8C3A2F"
  pilula-co-fundo: "#EEF3FD"
  pilula-co-tinta: "#2E5A8C"
typography:
  display:
    fontFamily: "Poppins, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "38px"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.05em"
  headline:
    fontFamily: "Poppins, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "32px"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.05em"
  numero:
    fontFamily: "Poppins, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "26px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.045em"
  title:
    fontFamily: "Poppins, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.015em"
  body:
    fontFamily: "Poppins, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  meta:
    fontFamily: "Poppins, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Poppins, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "10px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.08em"
  campo:
    fontFamily: "Poppins, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
rounded:
  sm: "12px"
  md: "16px"
  lg: "22px"
  xl: "26px"
  cartao: "18px"
  hub: "19px"
  pilula: "99px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "10px"
  lg: "14px"
  xl: "18px"
  page-x: "16px"
  modulo-x: "18px"
  tap: "44px"
components:
  botao-solido:
    backgroundColor: "{colors.verde-custodia}"
    textColor: "#FFFFFF"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0 16px"
    height: "44px"
    width: "100%"
  botao-solido-hover:
    backgroundColor: "{colors.verde-custodia-fundo}"
    textColor: "#FFFFFF"
  botao-fantasma:
    backgroundColor: "#F9FCF7"
    textColor: "{colors.verde-custodia}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0 16px"
    height: "44px"
    width: "100%"
  botao-perigo:
    backgroundColor: "{colors.alerta}"
    textColor: "#FFFFFF"
    rounded: "{rounded.lg}"
    padding: "0 16px"
    height: "44px"
    width: "100%"
  campo:
    backgroundColor: "#F9FCF7"
    textColor: "{colors.verde-custodia}"
    typography: "{typography.campo}"
    rounded: "{rounded.sm}"
    padding: "10px 13px"
    height: "44px"
    width: "100%"
  campo-derivado:
    backgroundColor: "#EEF4EA"
    textColor: "{colors.tinta-media}"
    rounded: "{rounded.sm}"
    padding: "10px 13px"
  cartao:
    backgroundColor: "{colors.superficie}"
    textColor: "{colors.verde-custodia}"
    rounded: "18px"
    padding: "11px 11px"
  cartao-heroi:
    backgroundColor: "{colors.verde-custodia}"
    textColor: "#FFFFFF"
    rounded: "24px"
    padding: "15px"
  chip-mes:
    backgroundColor: "{colors.superficie}"
    textColor: "{colors.tinta-media}"
    rounded: "14px"
    padding: "6px 7px"
    height: "46px"
  chip-mes-on:
    backgroundColor: "{colors.lima-selo}"
    textColor: "#063C30"
  nav-pilula:
    backgroundColor: "{colors.verde-custodia}"
    textColor: "#7E9E8C"
    rounded: "23px"
    height: "62px"
    width: "100%"
  nav-item-on:
    textColor: "{colors.lima-de-aval}"
  fab:
    backgroundColor: "{colors.lima-de-aval}"
    textColor: "{colors.verde-custodia}"
    rounded: "50%"
    size: "56px"
  aviso:
    backgroundColor: "{colors.verde-custodia}"
    textColor: "#FFFFFF"
    rounded: "{rounded.pilula}"
    padding: "10px 18px"
---

# Design System: orçamento.

## Overview

**Creative North Star: "A Cédula"**

Este é um sistema de **impressão de valor**. O verde-cofre (`#123A2C`) não é uma
cor de marca escolhida numa paleta: é tinta, e ela se comporta como tinta — o
texto principal, o fundo dos cartões-herói, as barras flutuantes e a sombra
(sempre `rgba(18,58,44,…)`, nunca cinza neutro) são todos o mesmo pigmento em
concentrações diferentes. Sobre ele, o **Lima de Aval** (`#C9E88E`) é a marca de
conferência: aparece no FAB, na aba ativa, no selo do mês escolhido e no número
que o usuário veio ver. Em nenhum outro lugar.

O que fecha a metáfora é a **trama**. Cada módulo imprime a sua sobre o papel
claro, num só pseudo-elemento com máscara diagonal, sempre abaixo de 10% de
opacidade: pauta horizontal de 47px na economia, grade de 36px nos empréstimos,
pontilhado de 22px nas contas, hachura diagonal de 48px nos favores. Os
cartões-herói escuros levam a gravação de segurança por cima — anéis guilloché
concêntricos feitos em `box-shadow: 0 0 0 15px …, 0 0 0 30px …`, hachura
rotacionada, halos radiais nos cantos. Nada disso é ornamento importado: é a
mesma linguagem que faz um documento de valor parecer difícil de falsificar, e é
o que dá a este app a autoridade que um simulador de saldo precisa ter.

Por baixo dessa formalidade, o corpo do app é o oposto: papel branco, raios
grandes, alvos de 44 a 48px e `transform: scale(.94)` em tudo que se toca. O
sistema é **generoso e à prova de polegar**, porque o uso real é de pé, no
celular, com uma mão. O contraste entre o registro gravado dos heróis e a maciez
de tudo abaixo deles é o efeito — não é inconsistência.

**Key Characteristics:**

- Tinta única: verde-cofre para texto, fundo escuro e sombra; nenhum cinza neutro
- Lima de Aval é escasso por regra, não por acaso
- Uma trama de fundo por módulo, mascarada na diagonal, sempre sub-10% de alfa
- Cartões-herói escuros com gravação de segurança; tudo abaixo deles é branco e macio
- Plano por padrão: borda de 1px separa, sombra é só para o que realmente flutua
- Números apertam, rótulos abrem — o `letter-spacing` carrega a hierarquia
- Alvo de 44px (`--tap`) em tudo que se toca — a marca visível pode ser menor que ele

## Colors

Uma tinta verde profunda e um lima de conferência, sobre papel esverdeado claro;
cada módulo ganha um acento próprio que vive **só** no seu cartão do hub e no
brilho radial do seu herói.

### Primary

- **Verde Custódia** (`#123A2C`): a tinta. Texto principal, fundo dos cartões-herói, da pastilha de navegação, da appbar, do toast e do avatar. Todas as sombras do sistema são esta cor em alfa baixo. Também é o `theme-color` do PWA.
- **Verde Custódia Fundo** (`#0D2B20`): estado pressionado dos botões sólidos. Só isso.
- **Verde Custódia Claro** (`#1B4B39`): fundo de ícone dentro de superfície escura, e hover do botão de voltar.

### Secondary

- **Lima de Aval** (`#C9E88E`): a marca de que algo foi conferido. FAB, item ativo da navegação, valor final da curva, cartão de economia no hub. Sobre fundo escuro vira **Lima sobre Escuro** (`#CEF29B`) para segurar o contraste; como selo de seleção em superfície clara vira **Lima Selo** (`#D5EDB3`).

### Tertiary

Acentos de módulo. Cada um identifica um território e não sai dele.

- **Âmbar Contas** (`#EFE0BC`, tinta `#7A5F22`): cartão de contas no hub, brilho radial do herói de contas.
- **Azul Favores** (`#DCEBF6`, tinta `#14405C`): cartão de favores no hub, brilho radial e bloco de ícone do herói de favores.
- Economia e empréstimos não têm acento próprio: usam o Lima de Aval e um dourado quente (`#F1C56B` no brilho do herói), respectivamente.

### Neutral

- **Papel** (`#F8FAF6`): fundo de toda view de módulo, sob os gradientes radiais e a trama.
- **Superfície** (`#FFFFFF`): cartão, folha inferior, rodapé de formulário.
- **Tinta Média** (`#6F8C7C`, e o par de módulo `#617E72`): metadados, rótulos secundários, prefixo `R$`.
- **Tinta Fraca** (`#9CB2A4`): texto desabilitado, ícone inerte, rodapé "sobre".
- **Traço** (`#EAF1E5`) e **Traço Cartão** (`#E1E9DD`): a borda de 1px que faz o trabalho que a sombra não faz.
- **Verde sobre Escuro** (`#BED6CA`): rótulo e legenda dentro dos cartões-herói. É o único claro-neutro do sistema, e ele é verde.

### Semantic

- **Alerta** (`#C84B4B`): excluir, sair, erro de formulário. O cartão de perigo é `#FFFBFA` com borda `#F6DAD5` — o vermelho chega antes da leitura.
- **Confirmado** (`#4A8A5F`): retorno positivo de formulário.

### Pílulas por tipo de entrada

Seis pares fundo/tinta, um por tipo do simulador, todos de baixa saturação por
projeto: são etiquetas, não estados. `fs` poupança frequente
(`#F1F6EE` / `#123A2C`) · `os` pontual (`#F1F6EE` / `#51705E`) · `ci` renda
certa (`#E9F6D6` / `#2F6142`) · `ui` renda incerta (`#FAF2DF` / `#8A6A24`) ·
`em` empréstimo (`#FEF0EE` / `#8C3A2F`) · `co` consórcio (`#EEF3FD` / `#2E5A8C`).

### Named Rules

**A Regra da Tinta Única.** Não existe cinza neutro neste sistema. Todo cinza é
verde dessaturado, e toda sombra é `rgba(18,58,44,…)`. Um `#888` ou um
`rgba(0,0,0,.1)` denuncia código vindo de fora.

**A Regra do Aval.** O Lima de Aval marca **uma** coisa por tela: o que foi
confirmado, ou o que o usuário veio ver. Dois limas competindo na mesma viewport
significa que um deles não conquistou o lugar.

**A Regra do Território.** Âmbar é de contas, azul é de favores. Um acento de
módulo aparecendo fora do seu módulo — ou dois deles na mesma tela, fora do hub
— quebra a identificação que o usuário usa para saber onde está.

## Typography

**Fonte única:** Poppins (400 / 500 / 600 / 700), com queda para
`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`.
**Mono:** `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`, usada só na
área de texto técnica dos ajustes.

**Character:** uma geométrica humanista, sem serifa e sem nostalgia, apertada nos
números e aberta nos rótulos. A Poppins carrega o peso 600–700 em tamanho grande
sem virar publicidade, e é isso que sustenta o número-herói.

> **Nota de implementação:** a Poppins é carregada do Google Fonts por `<link>` no
> `index.html`. O service worker só cacheia same-origin, então **offline o app
> renderiza na pilha de fallback**. Essa pilha não é decorativa: é o que o usuário
> vê num voo. Qualquer ajuste de tipografia precisa continuar legível em San
> Francisco e em Roboto.

### Hierarchy

- **Display** (600, 38px, 1.05, `-.05em`): título da tela de login. Uma ocorrência no app inteiro.
- **Headline** (600, 32px, 1.05, `-.05em`): saudação do hub. Uma por tela.
- **Número** (700, 26px, 1.2, `-.045em`): o acumulado dentro do cartão-herói. É o produto, e continua sendo o maior elemento de qualquer tela. No desktop sobe para 34px.
- **Título** (600, 14px, `-.015em`): nome de pessoa, cabeçalho de lista, rótulo de seção.
- **Corpo** (400, 14px, 1.5): rótulos de linha, nomes de lançamento.
- **Meta** (400, 12px, 1.5): datas, "de contas", notas sob o valor, legenda de eixo.
- **Rótulo** (600, 10px, `+.08em`, CAIXA ALTA): rótulo de campo de formulário e título de bloco de ajustes.
- **Botão** (600, 12.5–13px, `+.04em`, CAIXA ALTA): botão sólido, fantasma e o de salvar da folha.
- **Campo** (400, **16px**): valor digitado em qualquer `input` ou `select`.

### Named Rules

**A Regra do Aperto.** Número aperta, rótulo abre. Valores monetários e títulos
grandes levam `letter-spacing` negativo (`-.03em` a `-.05em`, mais negativo
quanto maior); rótulos em caixa alta levam positivo (`+.04em` a `+.08em`). Um
número com espaçamento neutro parece texto, e um rótulo de 10px em caixa alta
apertado fica ilegível.

**A Regra dos 16px.** Todo campo editável tem `font-size: 16px`, sem exceção.
Abaixo disso o iOS dá zoom ao focar e reposiciona a tela inteira — o usuário
perde o formulário de vista no meio de digitar um valor.

**A Regra da Caixa Baixa.** A interface fala em caixa baixa. O wordmark é
`orçamento.` com o ponto, e os únicos lugares onde caixa alta é permitida são
rótulo de campo e texto de botão, onde ela é hierarquia e não ênfase.

## Layout

**Mobile-first com um único corte em 1024px.** Abaixo dele, o app é uma pilha de
rolagem por módulo dentro de `#app` (`height: 100dvh; overflow: hidden`), com
appbar e navbar **flutuando por cima** em `position: absolute` — elas não
empurram o conteúdo. Acima de 1024px, `applyLayout()` no JS **move** os
componentes compartilhados (`#c-list`, `#c-legend`, `#c-settings`) da view mobile
para a sidebar, e a economia vira a grade de 12 colunas com coluna fixa.

**Consequência estrutural:** estilo de componente compartilhado escrito dentro de
`@media (min-width: 1024px)` desaparece no mobile, porque é o mesmo nó de DOM
sob outro pai. Estilo de componente vive fora do media query; só o que é
exclusivo do shell desktop entra nele.

**Respiro.** `--page-x: 16px` no shell; as views de módulo usam
`max(18px, var(--sal))` de cada lado, para que o notch em paisagem nunca corte
conteúdo. O topo de cada slot é `calc(var(--sat) + 68px)` — área segura mais a
appbar flutuante — e o fundo é `calc(var(--navbar-h) + var(--sab) + 32px)`: a
navbar flutua, então o conteúdo reserva o próprio espaço embaixo dela.

**Ritmo.** Não existe token `--space-*`; a escala é convenção observada:
`4 · 7 · 9 · 12 · 15` para gaps internos, `9px` entre cartões de lista, `14px`
entre cartões do hub. Esse último é **acoplado ao JS** — `ligarArrasto` soma
altura do cartão mais o literal `14` para calcular o passo do arraste, e é o
único valor de espaçamento do sistema que não pode mudar sozinho no CSS.

**Orçamento vertical.** Em 393 × 852 o cromo (appbar 64 + navbar 72) consome
16% da tela, deixando 716px úteis. Nenhum cartão-herói passa de **45% desse
restante**, para que a primeira linha de conteúdo real — KPI, pessoa ou
lançamento — apareça sempre acima da dobra.

**Breakpoints reais:** 359px (compactação para telas estreitas), 480px, 600px (as
views de módulo passam a `max-width: 650px` centralizado), 640px, 768–1023px
(tablet, ainda no shell mobile), 1024px (troca de shell), 1600px.

**Áreas seguras** entram por token (`--sat --sab --sal --sar`) e são somadas,
nunca substituídas, em todo padding de borda de tela.

### Named Rules

**A Regra do Componente Fora do Media Query.** Se um seletor que estiliza
`#c-list`, `#c-legend` ou `#c-settings` está dentro de
`@media (min-width: 1024px)`, ele é um bug no mobile. Estilo de componente mora
fora; só o shell entra no media query.

**A Regra da Área Segura Somada.** Todo padding que encosta na borda da tela é
`calc(<valor> + var(--sa*))` ou `max(<valor>, var(--sa*))`. Um padding literal na
borda quebra em qualquer aparelho com notch ou barra de gestos.

## Elevation & Depth

**Plano por padrão; a sombra é reservada para o que flutua de verdade.**
Superfícies em repouso se separam por **borda de 1px** (`#E1E9DD` no cartão,
`#EAF1E5` no formulário), não por elevação. As sombras minúsculas dos cartões de
lista (`0 4px 16px #18452e05` — 2% de alfa) são **assentamento**, não elevação:
dizem que o cartão descansa sobre o papel, não que ele levanta.

A elevação real fica com os quatro elementos que de fato pairam sobre o conteúdo:
a pastilha de navegação, o FAB, os botões da appbar e o toast — todos em
`rgba(18,58,44,.24–.30)`, uma luz só, vinda de cima.

Profundidade também é **tonal**: papel `#F8FAF6` → cartão `#FFFFFF` → herói verde
escuro. E é **atmosférica** na navbar, que aplica `backdrop-filter: blur(7px)` só
na faixa abaixo da pastilha, com máscara de gradiente, para que o conteúdo saia
de foco ao passar por baixo em vez de aparecer nítido pelas beiradas. Há fallback
em `@supports not` com um véu do tom da página.

### Shadow Vocabulary

- **`--shadow-s`** (`0 2px 12px rgba(18,58,44,.06)`): assentamento de pílula e alternador.
- **`--shadow-m`** (`0 4px 20px rgba(18,58,44,.08)`): cartão sobre superfície clara.
- **`--shadow-l`** (`0 -6px 28px rgba(18,58,44,.10)`): sombra **para cima**, de elemento ancorado no rodapé.
- **Flutuante** (`0 8px 26px rgba(18,58,44,.28)`): navbar, appbar, avatar, toast.
- **FAB** (`0 6px 20px rgba(18,58,44,.24)`), com anel de 5px `#F1F8EC` que o recorta do fundo.
- **Herói** (`0 14px 30px #123a2c1c, inset 0 1px <acento a 17%>`): o `inset` superior é a luz raspando a borda gravada. Não é opcional — sem ele o herói fica chapado.
- **Guilloché** (`0 0 0 15px <acento a 5%>, 0 0 0 30px <acento a 3%>`): os anéis concêntricos gravados nos heróis. É `box-shadow` usado como ornamento, não como profundidade.

### Named Rules

**A Regra do Repouso Plano.** Superfície em repouso não tem sombra que se
enxergue: tem borda de 1px. Sombra visível é a afirmação de que o elemento está
sobre o conteúdo e captura toque em qualquer lugar da tela.

**A Regra da Luz Única.** Uma fonte de luz, de cima, verde. Sem sombra colorida
de outra família, sem sombra para baixo e para cima no mesmo elemento, sem
`rgba(0,0,0,…)`.

## Shapes

**Cantos generosos, escalonados por tamanho de superfície.** Os tokens são
`--r-sm: 12px` (campo, botão, bloco de ícone) · `--r-md: 16px` · `--r-lg: 22px` ·
`--r-xl: 26px`, e a escala de telefone os aplica um degrau abaixo: `11px` no
bloco de ícone, `18px` no cartão de lista, `19px` no cartão do hub, `23px` na
pastilha de navegação e `24px` no cartão-herói. A regra implícita é
proporcional: quanto maior a superfície, maior o raio, para que a curvatura
pareça constante.

Duas exceções deliberadas: `99px` para qualquer coisa que seja **pílula** (chip,
toast, alternador, contador) e `50%` para avatar e FAB. Não existe canto vivo
(`border-radius: 0`) em componente nenhum do shell mobile.

**Borda antes de sombra.** A silhueta se define por um traço de 1px em
`--traco-cartao`; dentro dos cartões-herói, por `rgba(255,255,255,.12–.20)`.

**O bloco de ícone** é a assinatura de forma mais repetida do sistema: um
retângulo **levemente mais alto que largo** — `32 × 34px`, raio `11px` — com o
ícone centrado. Aparece no cabeçalho de todo herói, em cada linha de lançamento e
como avatar de empréstimo, sempre nessa medida; só o cartão do hub usa a versão
grande, `42 × 44px` com raio `14px`. A desproporção de 2px é intencional e
consistente; deixá-lo quadrado o faz parecer um botão.

**Ícones:** Iconoir, sprite SVG embutido, `fill: none`, `stroke: currentColor`,
`stroke-width: 1.6`, pontas e junções arredondadas, dimensionados em `em`
(`1.15em`) para acompanharem o texto.

### Named Rules

**A Regra do Raio Proporcional.** O raio acompanha a área: 12px em campo, 20–22px
em cartão, 26px em herói e barra. Um cartão de 26px com um botão de 26px dentro
achata a hierarquia — o botão precisa ser o menor dos dois.

## Components

### Botões

- **Sólido** (`.btn-solid`, `.bsv`): fundo Verde Custódia, texto branco, 44–48px de altura, raio 12px, largura total, **caixa alta com `+.04em`**, 12.5–13px/600. Hover e `:active` escurecem para `#0D2B20` em 120ms.
- **Fantasma** (`.btn-ghost`, `.bcn`): fundo `#F9FCF7`, borda 1px `--traco`, mesma tipografia. É o cancelar, e ele nunca compete em peso com o salvar ao lado.
- **Perigo** (`.btn-danger`): fundo `#C84B4B`, raio 22px, `13px/600` **em caixa mista** — a única exceção à caixa alta dos botões, porque destruir merece uma frase, não um comando.
- **Sair** (`.btn-sair`): inverso do perigo — fundo `#FEF0EE`, texto e borda vermelhos, preenchendo-se só no hover.
- **Toque:** todo botão tem `min-height: var(--tap)` (44px). Os que pairam (FAB, voltar) respondem com `transform: scale(.94)` em 140ms.

### Chips

- **Segmentado** (`.m-seg`): trilha de pílula `#E8F0E3` com 2px de respiro, botões de `min-height: 40px` que dividem a largura. Ativo: fundo `#084936`, texto branco. É a **exceção documentada ao piso de 44px** — cada metade mede ~117 × 40px, e a folga horizontal cobre de sobra o que os 4px de altura tiram. Ela vale só aqui: um controle de duas opções que ocupa a largura da tela, nunca um botão solto.
- **Etiqueta de estado** (`.ct-pill`): 26px de altura, 11.5px, padding `3px 8px`. É rótulo antes de ser controle — quem carrega o alvo confortável é a linha de 62px em volta.

- **Mês** (`.m-chip`): 46px de altura, raio 14px, padding `6px 7px`, fundo branco com borda `#E0E9D9`, mês em 12.5px sobre ano em 10.5px a 85% de opacidade. Selecionado: fundo **Lima Selo** `#D5EDB3`, borda `#C6DDA5`, tinta `#063C30`, `min-width: 48px`. A largura é ditada pelo ano de quatro dígitos; em 393px cabem 6,3 chips no trilho.
- **Filtro** (`.lo-chip`): 44px, raio de pílula, 12px, tinta `#567161`. Ativo usa o mesmo Lima Selo. Sem sombra nos dois estados.
- **Contador** (`.pill-count`): Lima sobre Escuro `#CEF29B` com tinta `#063C30`, dentro de cabeçalho escuro.

### Cartões

- **Cartão-herói** (`.eco-summary`, `.lo-hero`, `.ct-hero`, `.fv-topo`): raio 24px, padding 15px, fundo em três camadas — dois `radial-gradient` de canto no acento do módulo, sobre um `linear-gradient` diagonal de verdes escuros. Borda de 1px no acento a ~33%, `isolation: isolate`, e um `::after` com a gravação de segurança em `z-index: 0`; todo filho vai para `z-index: 1`. Divisórias internas são `1px solid rgba(255,255,255,.12)`.
- **Cartão de lista** (`.m-card`, `.lo-card`, `.eitem`, `.fv-pessoa`): branco, raio 18–20px, borda `#E1E9DD`, sombra de assentamento a 2%, padding `11–12px`.
- **Cartão do hub** (`.hub-card`): raio 19px, `min-height: 82px`, linha horizontal — bloco de ícone de 42 × 44px, corpo, seta. **As alturas têm de ser idênticas entre si:** `ligarArrasto` calcula o passo do arraste a partir da altura de um cartão mais o gap de 14px.

### Campos

- **Estilo** (`.fi`, `.fsel`): fundo `#F9FCF7` — papel levemente mais quente que o branco —, borda 1px `--traco`, raio 12px, `min-height: 44px`, padding `10px 13px`, **16px de fonte**.
- **Foco:** a borda vira Verde Custódia em 140ms. Sem glow, sem deslocamento de layout.
- **Derivado** (`.fi-derivado`): fundo `#EEF4EA`, texto em Tinta Média, **borda tracejada**. O tracejado é semântico: este valor o app calcula, e não se digita nele.
- **Rótulo** (`.fl`): 10px/600, caixa alta, `+.08em`, Tinta Média, acima do campo com 6px de gap.
- **Select:** seta em `data:` URI SVG na cor `#6F8C7C`; `appearance: none` para que Android e iOS não desenhem a sua.
- **Foco global:** `:focus-visible { outline: 2px solid var(--dark); outline-offset: 2px }`. Dentro dos módulos vira `2px solid #68A978` com `offset: 3px`, para contrastar com o fundo do módulo.

### Navegação

- **Pastilha** (`.navbar-pill`): 62px de altura, raio 23px, fundo Verde Custódia, grade `1fr 74px 1fr` com o FAB no vão do meio. Flutua com `0 8px 26px`.
- **Item:** ícone de 19px sobre rótulo de 10px, em coluna, gap 5px, `min-height: 44px`. Inativo `#7E9E8C`; ativo **Lima de Aval** com peso 600 — cor e peso mudam juntos, e a transição de 140ms é só na cor.
- **FAB** (`.navfab`): 56px, círculo Lima de Aval, `margin-top: -24px` para transbordar a pastilha, anel de 4px `#F1F8EC` recortando-o do fundo, ícone de 23px com `stroke-width: 2` — mais grosso que o padrão 1.6, porque ele precisa segurar sozinho.
- **Appbar** (`.appbar`): 64px no telefone, flutua no topo com `pointer-events: none`, reativado nos filhos. Ao rolar ganha `.flutuando`, e o wordmark sai em `opacity` mais `translateY(-6px)`, sobrando dois botões-pastilha circulares de 36px com anel de 2.5px na cor da página. A marca é de 36px, mas um `::after` de `var(--tap)` centrado leva a área de toque a 44px.

### Botão de ação circular

- **`.fv-mini`**: disco Verde Custódia de 28px com ícone de 14px, um por vencimento e um por item na lista de favores. A marca é pequena de propósito: empilhada, ela apareceria duas vezes por grupo e roubaria a leitura do valor. O alvo de 44px vem do `::after`, e há 55px entre centros — folga de 11px, verificada.

### Folha inferior

- Ancorada embaixo, `max-height: 92dvh`, fundo branco, entra por `translateY` em **260ms `cubic-bezier(.22, 1, .36, 1)`** — a única curva de saída do sistema, e a que dá o assentamento físico da folha.
- Backdrop `rgba(18,58,44,.42)` com `blur(2px)`, 200ms.
- Rodapé de ações fixo, com borda superior e fundo branco: salvar (sólido, `flex: 1`) e cancelar (fantasma, largura do conteúdo).

### Aviso

- Pílula Verde Custódia centralizada acima da navbar, em `calc(var(--navbar-h) + var(--sab) + 28px)`. Sem navbar (hub e ajustes), `#app.sem-navbar` a desce para `calc(var(--sab) + 18px)`.
- Entra em `opacity` mais `translateY(14px → 0)` em 200ms.
- Variante `.status` é a **mesma pílula com `pointer-events: none`**, trocando só a cor do texto: salvando `#8FAE9C` · ok Lima · leitura `#E5C173` · erro `#F1948A`.
- **Atenção:** o aviso com "Desfazer" precisa de `pointer-events: auto`. Já ficou inerte por um `pointer-events: none` que a classe `.on` não desfazia, e o teste passou porque `el.click()` ignora isso.

### Trama de módulo (componente-assinatura)

Um `::before` em `position: absolute; inset: 0; pointer-events: none`, com a
textura em `background-image` repetido e uma `mask-image` de gradiente diagonal
que a faz nascer e morrer dentro da tela. Sempre em **cor do módulo a 4–10% de
alfa**, sempre pareada com `-webkit-mask-image`. É o que diferencia os quatro
módulos sem trocar a paleta.

| Módulo | Trama | Passo |
|---|---|---|
| economia | pauta horizontal (`repeating-linear-gradient`) | 48px |
| empréstimos | grade cruzada | 36px |
| contas | pontilhado (`radial-gradient`, .8px) | 22px |
| favores | hachura diagonal a 45° | 48px |

### Named Rules

**A Regra da Trama Discreta.** Uma trama por módulo, abaixo de 10% de alfa,
sempre mascarada na diagonal para não cobrir a tela inteira, e **nunca** sob um
bloco de texto de corpo. Ela deve ser notada na segunda olhada, não na primeira.

**A Regra do Bloco de Ícone.** `32 × 34px`, raio 11px, fundo em acento claro,
ícone centrado — `42 × 44px` com raio 14px apenas no cartão do hub. Não o faça
quadrado e não o faça circular: o círculo já é do avatar de pessoa.

**A Regra da Marca Menor que o Alvo.** Quando um controle precisa ser
discreto, encolha a **marca**, nunca o alvo: `position: relative` mais um
`::after` de `var(--tap)` centrado. Vale para o botão de voltar da appbar (36) e
para o disco de pagar dos favores (28). Antes de usar, confirme que o alvo
ampliado não invade o vizinho — meça a distância entre centros e teste com
`document.elementFromPoint()`. Um segmentado de duas opções é o caso em que
**não** dá para usar o truque: as metades são adjacentes e não há folga para
expandir, e é por isso que ele é a única exceção ao piso.

**A Regra do Trilho.** Item de rolagem horizontal nunca tem largura em px fixo.
Ele deriva do trilho — `width: calc((100% - <gap>) / <n>)` — para que o item
parcial na borda seja sempre a mesma fração, em qualquer aparelho. Um px fixo
dá um corte diferente em cada largura, e um corte arbitrário parece defeito em
vez de aviso de que rola. Os KPIs da economia mostram 2,7 cartões de 320 a
440px por causa disso.

## Do's and Don'ts

### Do:

- **Do** usar `var(--dark)` / `#123A2C` para toda tinta e toda sombra. Sombra é `rgba(18,58,44, α)`.
- **Do** manter `font-size: 16px` em todo campo editável — abaixo disso o iOS dá zoom ao focar.
- **Do** somar as áreas seguras (`--sat --sab --sal --sar`) em qualquer padding que encoste na borda da tela.
- **Do** garantir `min-height: var(--tap)` (44px) em tudo que se toca. Quando a marca visível precisa ser menor, expanda a área com um `::after` de `var(--tap)` e confirme com `document.elementFromPoint()` nas quatro bordas.
- **Do** derivar a largura de item de trilho horizontal do próprio trilho, nunca em px fixo.
- **Do** medir herói novo contra a tela útil (altura menos appbar e navbar) e mantê-lo abaixo de 45% dela.
- **Do** dar a um módulo novo a sua própria trama e o seu próprio brilho radial, seguindo a tabela acima.
- **Do** parear toda `mask-image` com `-webkit-mask-image`.
- **Do** verificar clicabilidade com `document.elementFromPoint()`, nunca com `el.click()` — este último ignora `pointer-events` e `z-index`.
- **Do** subir o `VERSION` do `sw.js` a cada edição de CSS ou JS. Sem isso, quem tem o app instalado recebe o HTML novo com o estilo velho.
- **Do** testar a ~400px de largura: acima de 1024px o shell troca e as views mobile viram `display: none`, medindo 0 sem erro nenhum.

### Don't:

- **Don't** usar cinza neutro (`#888`, `rgba(0,0,0,…)`) em lugar nenhum — nem em texto, nem em borda, nem em sombra.
- **Don't** gastar o Lima de Aval em mais de um elemento por viewport. A raridade é o mecanismo.
- **Don't** levar o âmbar de contas ou o azul de favores para fora do seu módulo.
- **Don't** definir estilo de `#c-list`, `#c-legend` ou `#c-settings` dentro de `@media (min-width: 1024px)` — o JS move esses nós, e a regra some no mobile.
- **Don't** dar sombra a superfície em repouso. Borda de 1px `#E1E9DD` é a separação; sombra significa "isto paira".
- **Don't** encostar em fintech neon sobre preto: nada de roxo ou ciano saturado, fundo `#000`, glassmorphism ou gradiente de arco-íris. O `backdrop-filter` da navbar é desfoque de leitura, não vidro decorativo.
- **Don't** gamificar. Sem mascote, sem confete, sem medalha por meta batida — o app trata de dinheiro entre pessoas próximas, e a celebração seria constrangedora.
- **Don't** confiar na Poppins estar presente. Ela vem do Google Fonts e não é cacheada pelo service worker: offline o app cai na pilha do sistema, e o layout tem de aguentar.
- **Don't** deixar canto vivo (`border-radius: 0`) num componente do shell mobile.
- **Don't** mudar a altura do cartão do hub nem o gap de 14px entre eles sem ajustar o `passo` em `ligarArrasto`.

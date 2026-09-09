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

- Uma linha por entrada na tabela `entries` — editar uma entrada grava só ela.
- Alteração feita no PC aparece no celular na hora (Realtime).
- **Sem credenciais em `assets/js/config.js`, o app roda em modo local**, sem
  login, exatamente como antes — útil para testar ou usar num aparelho só.
- **Menu → Exportar/Importar JSON** continua funcionando como backup manual.
- **Apagar dados salvos** apaga também na nuvem, em todos os aparelhos.

### Configurar o Supabase

**1. Crie as tabelas.** No painel do Supabase → **SQL Editor** → cole o conteúdo
de [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**. Isso cria
`entries` e `settings`, liga o RLS e publica as tabelas no Realtime. É seguro
rodar de novo.

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
supabase/schema.sql        tabelas, RLS e realtime — rode no SQL Editor
manifest.webmanifest       metadados do PWA
sw.js                      service worker (app shell offline)
assets/icons/              ícones 192/512/maskable/apple-touch
```

Os componentes compartilhados (`#c-list`, `#c-legend`, `#c-settings`) são movidos
por JS entre os slots mobile e desktop quando o breakpoint muda; a tela do
simulador tem markup próprio no mobile (`#m-*`) e a sidebar no desktop (`#c-hero`,
`#c-kpis`).

# Revisão de proporções — 14/09/2026

Revisão com Impeccable, preservando Poppins, cores e superfícies aprovadas. A escala está em `assets/css/app.css`; os ajustes de estrutura e controles compartilhados estão em `assets/css/sizing.css`, carregado depois das folhas de cada módulo.

## Escala aplicada — ajustada para maior densidade

- Corpo mobile: .875rem (14 px); campos de digitação: 1rem (16 px).
- Informações secundárias e rótulos mobile: .8125rem (13 px).
- Legendas curtas de gráficos, anos e navegação: .75rem (12 px).
- Seções mobile: 1.125rem; títulos: 1.5rem; saldos principais: 1.75rem.
- Topo mobile: voltar e compartilhar com 40 × 40 px e ícone de 20 px; avatar de 40 px.
- Ações de formulário: mínimo de 48 px. Na Economia, seletores de cenário e modo com 36 px; meses com 44 px. Texto de ação mobile de 14 px, com quebra permitida.
- Cards: espaços internos de 12–16 px e altura conforme conteúdo; grupos separados por 16 px. Cards do hub com mínimo de 92 px.
- Fonte ampliada: campos, cabeçalho e navegação adaptam sua distribuição. Não é necessário comprimir o conteúdo para caber na primeira tela.

## Cobertura

| Tela ou estado | Verificação |
| --- | --- |
| Entrar, criar conta, recuperar acesso e definir nova senha | Tipografia, campos, retorno e ações |
| Hub | Quatro cards, perfil, ajustes, leitura e arrasto |
| Contas | Resumo, legenda, rendas, fixas, variáveis, assinaturas, economia, vazio |
| Favores | Resumo, pessoa aberta/fechada, itens, histórico e pagamento |
| Empréstimos | Resumo, filtros, pessoa, valores, estado vazio |
| Economia | Saldo inicial, cenários, horizonte, meses, gráfico, KPIs, registros e tabela |
| Tabelas dos quatro módulos | Busca, sem resultados, edição, ações |
| Configurações | Perfil, conta, senha, instalação, dados locais, exclusão e sair |
| Formulário econômico | Poupança frequente/pontual, renda certa/incerta, empréstimo e consórcio |
| Formulário de contas | Renda, fixa, variável, assinatura e economia |
| Formulário de empréstimos | À vista, parcelado e mensalidade |
| Formulários de favores/pagamentos | Novo, editar, repetição, pagamento por item/total e edição de pagamento |
| Janelas complementares | Horizonte, compartilhamento, confirmação, exclusão de série e ajustes desktop |

## Ajuste final dos botões mobile

Após novo pedido de redução, os controles da Economia passaram a 36 px, os meses a 44 px, as ações do topo a 40 px e o botão de adicionar a 48 px; a navegação inferior passou a 54 px. Inspeção visual em 393 e 412 px e cliques nos cenários e horizonte confirmaram o resultado. A regressão de navegação passou em 320, 393 e 412 px. As medições de mínimo de 48 px abaixo pertencem à etapa anterior a esse ajuste.

## Evidências

Após o usuário solicitar mais conteúdo por tela, a densidade foi ajustada: legenda de Contas em uma linha por categoria, indicadores de Favores lado a lado, controles de Economia compartilhando linhas e menor espaço entre campos. As telas principais, os quatro formulários e o login foram novamente capturados em 320/393/412 px, sem fugas horizontais ou controles menores que 48 px. O teste de regressão de navegação e formulários passou nas três larguras. As verificações de fonte em 200% abaixo registram a revisão anterior.

A compactação foi então estendida às tabelas dos quatro módulos (valor e ações na mesma linha), configurações, histórico de favores, pagamentos, compartilhamento, horizonte, confirmação e exclusão. Todas as telas de autenticação e os formulários de criação/edição foram reconferidos nas três larguras. Também foram verificadas todas as opções de tipo de conta, entrada e empréstimo, a fonte em 200% e o formulário com altura reduzida. As verificações finais de dimensões não encontraram fugas horizontais, textos abaixo de 12 px ou botões abaixo de 48 px; os testes de navegação passaram.

- Capturas e inspeção de elementos em 393 × 852, 412 × 915 e 320 × 740, com dados fictícios e contexto isolado.
- Verificação adicional de nomes longos, estados vazios, fonte em 200%, altura reduzida a 460 px e shell desktop de 1366 px.
- Nas verificações finais dos estados mobile: nenhum botão medido abaixo de 48 px, nenhum texto medido abaixo de 12 px e nenhuma fuga horizontal de conteúdo. Faixas de meses/filtros e a tabela de projeção mantêm sua rolagem própria.
- Corrigida compressão dos filhos dos formulários; botões e notas não se sobrepõem ao faltar altura. Salvar permaneceu visível na simulação de teclado.
- Corrigido deslocamento lateral do shell após fechar formulários. Janelas fechadas não ficam disponíveis para foco.
- Cliques reais verificaram voltar e abrir tabelas. Gesto de toque via protocolo do navegador verificou reordenação do hub com o novo espaço; cadastro fictício de conta foi salvo apenas no contexto local de teste.
- `node tests/run-all.js`: oito suítes passaram. O teste de cálculo foi ajustado para aceitar as quebras de linha CRLF do Windows, sem mudança no motor financeiro.
- `tests/ui-sizing.browser.cjs`: regressões de toque, campos e alinhamento em três larguras. Requer Playwright disponível no ambiente e servidor ativo.

## Limites e apontamentos do Impeccable

Validação em navegador com viewport mobile, não em aparelhos físicos. As operações de autenticação, troca de senha, exclusão de conta, instalação e compartilhamento remoto não foram executadas em uma conta real: seus estados de interface foram inspecionados isoladamente.

O detector não apontou erros de severidade `error`. Os avisos restantes incluem cores/raios fora da documentação auxiliar, elementos decorativos já aprovados, animações existentes de barras e a imagem de perfil cujo endereço é preenchido em runtime. Não equivalem a certificação completa de acessibilidade. Esta revisão trata de proporções, leitura, toque e distribuição.

O carregador reportou `.impeccable/design.json` desatualizado em relação a `DESIGN.md`. A documentação auxiliar pode ser atualizada com `impeccable document`; essa regeneração não foi incluída na revisão de interface.

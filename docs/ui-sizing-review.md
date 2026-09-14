# Revisão de proporções — 14/09/2026

Revisão com Impeccable, preservando Poppins, cores e superfícies aprovadas. A escala está em `assets/css/app.css`; os ajustes de estrutura e controles compartilhados estão em `assets/css/sizing.css`, carregado depois das folhas de cada módulo.

## Escala aplicada

- Corpo e campos: 1rem (16 px na configuração padrão).
- Informações secundárias e rótulos: .875rem (14 px).
- Legendas curtas de gráficos, anos e navegação: .75rem (12 px).
- Seções: 1.25rem; títulos: 1.75rem; saldos principais: 2rem.
- Voltar e ações com ícone: área real de 48 × 48 px; seta de 24 px.
- Botões: mínimo de 48 px; texto de ação de 16 px, com quebra permitida.
- Cards: espaços internos de 16–20 px e altura conforme conteúdo; grupos separados por 24 px.
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

## Evidências

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

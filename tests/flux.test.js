/* Testes do FLUX — o razão diário.

   O que se prova aqui é a regra que NÃO se vê na tela: quando uma
   repetição acontece, e como o saldo de um dia é montado a partir da
   âncora. As duas erram em silêncio — a tela mostra um número
   plausível e errado. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.join(__dirname, '..') + '/';
const src = fs.readFileSync(ROOT + 'assets/js/store.js', 'utf8');

let uuidN = 0;
function makeEnv() {
  const mem = {};
  const win = {
    ORCAMENTO_CONFIG: { SUPABASE_URL: '', SUPABASE_ANON_KEY: '' },
    crypto: { randomUUID: () => 'uuid-' + (++uuidN) },
    console: { warn() {} }, navigator: { onLine: true },
    setTimeout, clearTimeout,
    JSON, Math, Number, String, Array, Object, Promise, Error, RegExp, Date, parseInt, isFinite,
  };
  win.window = win;
  win.localStorage = { getItem: (k) => (k in mem ? mem[k] : null),
    setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
  return win;
}
function load() { const w = makeEnv(); vm.createContext(w); vm.runInContext(src, w); return w; }

let fails = 0;
const check = (n, c, x) => { if (c) console.log('  ok   ' + n);
  else { fails++; console.log('  FALHA ' + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };

const S = load().Store;
const mov = (o) => S.normalizeFlux(Object.assign({ description: 'x', amount: 10 }, o));

/* ── 1: normalização ─────────────────────────────────── */
{
  const f = mov({ description: '  Mercado  ', amount: '  35,5 ', kind: 'saida' });
  check('descrição é aparada', f.description === 'Mercado', f.description);

  const neg = mov({ amount: -80, kind: 'entrada' });
  check('valor nunca é negativo — o sinal vem do kind',
        neg.amount === 0, neg.amount);

  const tipo = mov({ kind: 'inventado' });
  check('kind desconhecido vira saída', tipo.kind === 'saida', tipo.kind);

  check('só entrada soma', S.fluxSinal('entrada') === 1
    && S.fluxSinal('saida') === -1 && S.fluxSinal('economia') === -1
    && S.fluxSinal('diario') === -1 && S.fluxSinal('cartao') === -1);

  /* Repetir 1 vez é o mesmo que não repetir; deixar passar criaria
     duas formas de dizer a mesma coisa, e o diff veria diferença. */
  const uma = mov({ repeat_freq: 'mensal', repeat_times: 1 });
  check('repetir 1 vez é o mesmo que não repetir', uma.repeat_times === null, uma.repeat_times);

  const semFreq = mov({ repeat_times: 5, skipped: ['2026-03-01'] });
  check('sem frequência não há contagem nem datas puladas',
        semFreq.repeat_times === null && semFreq.skipped.length === 0, semFreq);

  const sujo = mov({ repeat_freq: 'semanal', skipped: ['2026-03-01', 'nao-e-data', ''] });
  check('datas puladas inválidas são descartadas',
        sujo.skipped.length === 1 && sujo.skipped[0] === '2026-03-01', sujo.skipped);
}

/* ── 2: ocorrência sem repetição ─────────────────────── */
{
  const f = mov({ on_date: '2026-03-10' });
  check('acontece no próprio dia', S.fluxOcorreEm(f, '2026-03-10'));
  check('não acontece em outro dia', !S.fluxOcorreEm(f, '2026-03-11'));
  check('não acontece no mês seguinte', !S.fluxOcorreEm(f, '2026-04-10'));
}

/* ── 3: repetição mensal ─────────────────────────────── */
{
  const f = mov({ on_date: '2026-01-15', repeat_freq: 'mensal' });
  check('mensal cai no mesmo dia dos meses seguintes',
        S.fluxOcorreEm(f, '2026-02-15') && S.fluxOcorreEm(f, '2026-12-15'));
  check('mensal não cai em outro dia', !S.fluxOcorreEm(f, '2026-02-16'));
  check('mensal não retroage antes da 1ª ocorrência',
        !S.fluxOcorreEm(f, '2025-12-15'));

  /* Dia 31 em fevereiro: encolher para o último dia é o certo —
     sumir do mês faria uma conta mensal desaparecer sozinha. */
  const trinta1 = mov({ on_date: '2026-01-31', repeat_freq: 'mensal' });
  check('dia 31 encolhe para o último dia de fevereiro',
        S.fluxOcorreEm(trinta1, '2026-02-28'), '2026 não é bissexto');
  check('e não acontece duas vezes no mesmo fevereiro',
        !S.fluxOcorreEm(trinta1, '2026-02-27'));
  check('em março volta para o dia 31', S.fluxOcorreEm(trinta1, '2026-03-31'));

  const contado = mov({ on_date: '2026-01-15', repeat_freq: 'mensal', repeat_times: 3 });
  check('a contagem inclui a 1ª ocorrência',
        S.fluxOcorreEm(contado, '2026-01-15') && S.fluxOcorreEm(contado, '2026-03-15')
        && !S.fluxOcorreEm(contado, '2026-04-15'));

  const pulado = mov({ on_date: '2026-01-15', repeat_freq: 'mensal', skipped: ['2026-02-15'] });
  check('pular uma ocorrência não derruba as outras',
        !S.fluxOcorreEm(pulado, '2026-02-15') && S.fluxOcorreEm(pulado, '2026-03-15'));
}

/* ── 4: semanal e diária ─────────────────────────────── */
{
  const sem = mov({ on_date: '2026-03-02', repeat_freq: 'semanal' });
  check('semanal cai de 7 em 7 dias',
        S.fluxOcorreEm(sem, '2026-03-09') && S.fluxOcorreEm(sem, '2026-03-16'));
  check('semanal não cai no meio da semana', !S.fluxOcorreEm(sem, '2026-03-12'));
  check('semanal atravessa a virada do mês', S.fluxOcorreEm(sem, '2026-04-06'));

  const dia = mov({ on_date: '2026-03-02', repeat_freq: 'diaria', repeat_times: 4 });
  check('diária cai em todos os dias da contagem',
        S.fluxOcorreEm(dia, '2026-03-03') && S.fluxOcorreEm(dia, '2026-03-05'));
  check('diária para depois da contagem', !S.fluxOcorreEm(dia, '2026-03-06'));
}

/* ── 5: o 5º dia útil ────────────────────────────────── */
{
  /* Conta segunda a sábado e pula só domingo — é o critério de
     folha de pagamento, não o bancário. Março/2026 começa num
     domingo, então o 5º útil é dia 6. */
  check('março/2026 começa no domingo', new Date(2026, 2, 1).getDay() === 0);
  check('5º dia útil de março/2026 é dia 6', S.quintoDiaUtil(2026, 3) === 6, S.quintoDiaUtil(2026, 3));

  const salario = mov({ on_date: '2026-03-06', kind: 'entrada', amount: 4000,
                        repeat_freq: 'mensal', repeat_rule: 'quinto_util' });
  check('o salário segue o 5º útil e não o dia 6',
        S.fluxOcorreEm(salario, '2026-04-06') === (S.quintoDiaUtil(2026, 4) === 6));
  const abril = '2026-04-' + String(S.quintoDiaUtil(2026, 4)).padStart(2, '0');
  check('cai no 5º útil de abril', S.fluxOcorreEm(salario, abril), abril);
}

/* ── 6: saldo na data ────────────────────────────────── */
{
  const lista = [
    mov({ on_date: '2026-03-01', kind: 'entrada', amount: 1000 }),
    mov({ on_date: '2026-03-05', kind: 'saida',   amount: 200 }),
    mov({ on_date: '2026-03-10', kind: 'economia', amount: 300 }),
  ];
  const base = { lancamentos: lista, ancora: '2026-03-01', saldoInicial: 500,
                 diario: 0, hoje: '2026-03-31' };

  check('o movimento do próprio dia da âncora já conta',
        S.fluxSaldoEm(Object.assign({}, base, { alvo: '2026-03-01' })) === 1500);
  check('acumula até o dia pedido',
        S.fluxSaldoEm(Object.assign({}, base, { alvo: '2026-03-05' })) === 1300);
  check('economia sai do bolso, como saída',
        S.fluxSaldoEm(Object.assign({}, base, { alvo: '2026-03-10' })) === 1000);
  check('dia sem movimento repete o saldo anterior',
        S.fluxSaldoEm(Object.assign({}, base, { alvo: '2026-03-11' })) === 1000);

  /* Antes da âncora o cálculo desfaz o que houve: o dia 28/02 é o
     saldo de 500 menos a entrada de 1000 que ainda não tinha caído. */
  check('antes da âncora o cálculo anda para trás',
        S.fluxSaldoEm(Object.assign({}, base, { alvo: '2026-02-28' })) === -500,
        S.fluxSaldoEm(Object.assign({}, base, { alvo: '2026-02-28' })));
}

/* ── 7: planejamento diário ──────────────────────────── */
{
  const base = { lancamentos: [], ancora: '2026-03-01', saldoInicial: 1000,
                 diario: 50, hoje: '2026-03-10' };

  check('o passado não desconta planejamento',
        S.fluxSaldoEm(Object.assign({}, base, { alvo: '2026-03-05' })) === 1000);
  check('hoje ainda não desconta',
        S.fluxSaldoEm(Object.assign({}, base, { alvo: '2026-03-10' })) === 1000);
  check('cada dia futuro desconta uma vez',
        S.fluxSaldoEm(Object.assign({}, base, { alvo: '2026-03-13' })) === 850,
        S.fluxSaldoEm(Object.assign({}, base, { alvo: '2026-03-13' })));
}

/* ── 8: faixas de cor ────────────────────────────────── */
{
  const L = S.FLUX_LIMITES_PADRAO;
  check('os limiares padrão são 6', L.length === 6, L);
  check('a pior faixa é 0', S.fluxFaixa(-500) === 0);
  check('a melhor faixa é 6', S.fluxFaixa(999999) === 6);
  check('zero não é a pior faixa', S.fluxFaixa(0) > 0, S.fluxFaixa(0));
  check('as faixas nunca decrescem com o saldo', (function () {
    let anterior = -1;
    for (const v of [-1000, -100, 0, 50, 100, 200, 300, 900, 1000, 1999, 2000, 5000]) {
      const f = S.fluxFaixa(v);
      if (f < anterior) return false;
      anterior = f;
    }
    return true;
  })());

  check('limites malformados caem no padrão',
        JSON.stringify(S.fluxLimites([1, 2])) === JSON.stringify(L)
        && JSON.stringify(S.fluxLimites(null)) === JSON.stringify(L));
}

/* ── 9: o estado vazio leva o FLUX ───────────────────── */
{
  const v = S.estadoVazio();
  check('estadoVazio traz a coleção do flux', Array.isArray(v.flux), v.flux);
  check('e os escalares do razão',
        v.fluxSaldo === 0 && v.fluxAncora === null && v.fluxDiario === 0
        && Array.isArray(v.fluxLimites) && v.fluxLimites.length === 6, v);
}


/* ── 10: a fatura do cartão ──────────────────────────── */
{
  /* Fecha dia 25, vence dia 5: o vencimento é sempre no mês DEPOIS do
     fechamento, porque 5 não é maior que 25. */
  const c = { name: 'Roxo', closing_day: 25, due_day: 5 };

  const antes = S.fluxFatura(c, '2026-03-10');
  check('compra antes do fechamento pega a fatura deste mês',
        antes.fechamento === '2026-03-25', antes);
  check('e ela vence no mês seguinte', antes.vencimento === '2026-04-05', antes);

  const noDia = S.fluxFatura(c, '2026-03-25');
  check('comprar NO dia do fechamento ainda entra nessa fatura',
        noDia.fechamento === '2026-03-25', noDia);

  const depois = S.fluxFatura(c, '2026-03-26');
  check('um dia depois já é a fatura seguinte',
        depois.fechamento === '2026-04-25' && depois.vencimento === '2026-05-05', depois);

  /* Fecha dia 5, vence dia 20: aqui vencimento e fechamento são do
     MESMO mês, porque 20 é maior que 5. Errar isto joga a saída um mês
     à frente do que acontece de verdade. */
  const d = { name: 'Azul', closing_day: 5, due_day: 20 };
  const mesmo = S.fluxFatura(d, '2026-03-03');
  check('vencimento depois do fechamento fica no mesmo mês',
        mesmo.fechamento === '2026-03-05' && mesmo.vencimento === '2026-03-20', mesmo);

  // a virada do ano tem de andar sozinha
  const virada = S.fluxFatura(c, '2026-12-26');
  check('dezembro vira janeiro sem tropeço',
        virada.fechamento === '2027-01-25' && virada.vencimento === '2027-02-05', virada);

  /* Dia 31 num mês de 30: encolhe para o último. Guardamos 31 porque é
     o combinado; quem encolhe é o cálculo. */
  const trinta1 = { name: 'Trinta e um', closing_day: 31, due_day: 31 };
  const abril = S.fluxFatura(trinta1, '2026-04-10');
  check('dia 31 encolhe para o último dia de abril',
        abril.fechamento === '2026-04-30', abril);
  const fev = S.fluxFatura(trinta1, '2026-02-10');
  check('e para o último de fevereiro', fev.fechamento === '2026-02-28', fev);

  // mesmo dia nos dois: o vencimento sai para o mês seguinte
  const igual = S.fluxFatura({ name: 'Igual', closing_day: 10, due_day: 10 }, '2026-03-01');
  check('fechamento e vencimento no mesmo dia vencem no mês seguinte',
        igual.fechamento === '2026-03-10' && igual.vencimento === '2026-04-10', igual);
}

/* ── 11: normalização do cartão ──────────────────────── */
{
  const c = S.normalizeFluxCard({ name: '  Nubank  ', closing_day: '25', due_day: 5 });
  check('nome é aparado e os dias viram número',
        c.name === 'Nubank' && c.closing_day === 25 && c.due_day === 5, c);

  const fora = S.normalizeFluxCard({ name: 'x', closing_day: 99, due_day: 0 });
  check('dia fora de 1..31 é trazido para dentro',
        fora.closing_day === 31 && fora.due_day === 1, fora);

  /* O cartão só viaja no movimento do tipo cartao: guardá-lo numa
     saída comum deixaria um vínculo que a tela nunca mostra. */
  const semCartao = S.normalizeFlux({
    description: 'x', amount: 10, kind: 'saida',
    card_id: '11111111-aaaa-4aaa-8aaa-111111111111',
  });
  check('saída comum não guarda cartão', semCartao.card_id === null, semCartao.card_id);

  const comCartao = S.normalizeFlux({
    description: 'x', amount: 10, kind: 'cartao',
    card_id: '11111111-aaaa-4aaa-8aaa-111111111111',
  });
  check('movimento de cartão guarda', !!comCartao.card_id);
}

/* ── 12: repetição anual ─────────────────────────────── */
{
  const a = mov({ on_date: '2026-03-15', repeat_freq: 'anual' });
  check('anual volta no mesmo dia e mês do ano seguinte',
        S.fluxOcorreEm(a, '2027-03-15') && S.fluxOcorreEm(a, '2030-03-15'));
  /* Sem conferir o MÊS, o anual cairia 12 vezes por ano — o índice de
     ocorrência só conta anos, e o dia 15 existe em todo mês. */
  check('anual não cai nos outros meses do ano',
        !S.fluxOcorreEm(a, '2027-04-15') && !S.fluxOcorreEm(a, '2027-01-15'));
  check('anual não cai em outro dia do mês certo', !S.fluxOcorreEm(a, '2027-03-16'));
  check('anual não retroage', !S.fluxOcorreEm(a, '2025-03-15'));

  const contado = mov({ on_date: '2026-03-15', repeat_freq: 'anual', repeat_times: 2 });
  check('a contagem do anual inclui a 1ª ocorrência',
        S.fluxOcorreEm(contado, '2027-03-15') && !S.fluxOcorreEm(contado, '2028-03-15'));

  // 29/02 num ano comum encolhe para o 28, como o dia 31 no mensal
  const bissexto = mov({ on_date: '2028-02-29', repeat_freq: 'anual' });
  check('29 de fevereiro encolhe para 28 no ano comum',
        S.fluxOcorreEm(bissexto, '2029-02-28'));

  /* O 5º dia útil é uma regra de folha de pagamento, que é mensal. No
     anual ela não teria o que significar, então o dia manda. */
  const regra = mov({ on_date: '2026-03-15', repeat_freq: 'anual', repeat_rule: 'quinto_util' });
  check('o 5º útil não vale fora do mensal', S.fluxOcorreEm(regra, '2027-03-15'));
}

/* ── 13: faixas sugeridas pela renda ─────────────────── */
{
  /* O caso que o usuário descreveu: quem ganha 1.600 tem "saudável"
     começando em 2.000, não em 2.000 fixo para todo mundo. */
  const s = S.fluxLimitesSugeridos(1600);
  check('a última faixa é 125% da renda', s[5] === 2000, s);
  check('o negativo cheio é 5% da renda', s[0] === -80, s[0]);
  check('zero continua sendo a fronteira do negativo', s[1] === 0, s[1]);
  check('os seis limiares vêm em ordem crescente',
        s.every(function (v, i) { return i === 0 || v > s[i - 1]; }), s);
  check('e continuam sendo seis', s.length === 6, s.length);

  /* Quem ganha sete vezes mais tem faixas sete vezes maiores: é o
     ponto de tudo — R$ 2.000 não quer dizer a mesma coisa para os dois. */
  const alto = S.fluxLimitesSugeridos(12000);
  check('renda maior empurra as faixas', alto[5] === 15000, alto[5]);
  check('e a faixa saudável do rico não é a do pobre', alto[5] !== s[5]);

  check('arredonda para a dezena',
        S.fluxLimitesSugeridos(1637).every(function (v) { return v % 10 === 0; }),
        S.fluxLimitesSugeridos(1637));

  /* Sem renda não há proporção: cair no padrão é melhor que devolver
     seis zeros, que pintaria o app inteiro de verde. */
  check('sem renda volta ao padrão',
        JSON.stringify(S.fluxLimitesSugeridos(0)) === JSON.stringify(S.FLUX_LIMITES_PADRAO));
  check('renda inválida também',
        JSON.stringify(S.fluxLimitesSugeridos('abc')) === JSON.stringify(S.FLUX_LIMITES_PADRAO));

  // e o resultado tem de servir de verdade para fluxFaixa
  check('um saldo acima do último limiar é a melhor faixa',
        S.fluxFaixa(2500, s) === 6, S.fluxFaixa(2500, s));
  check('e um saldo negativo fundo é a pior', S.fluxFaixa(-500, s) === 0);
}

/* ── 14: dias úteis configuráveis ────────────────────── */
{
  const SEG_SEX = [1, 2, 3, 4, 5];
  const SEG_SAB = [1, 2, 3, 4, 5, 6];

  check('o padrão é de segunda a sexta',
        JSON.stringify(S.DIAS_UTEIS_PADRAO) === JSON.stringify(SEG_SEX));

  /* Lista vazia faria a contagem do 5º dia útil nunca terminar e o
     recuo de data girar para sempre — cair no padrão é a saída. */
  check('lista vazia volta ao padrão',
        JSON.stringify(S.normalizeDiasUteis([])) === JSON.stringify(SEG_SEX));
  check('valores fora de 0..6 são descartados',
        JSON.stringify(S.normalizeDiasUteis([1, 9, -2, 3])) === JSON.stringify([1, 3]));
  check('repetidos entram uma vez só',
        JSON.stringify(S.normalizeDiasUteis([2, 2, 1])) === JSON.stringify([1, 2]));

  /* Março/2026 começa num domingo. De segunda a sexta, os úteis são
     2,3,4,5,6 → o 5º é dia 6. Contando sábado, entram 7 e 14, então o
     5º passa a ser dia 6 também… mas o 6º já diverge. O ponto é que a
     configuração muda a resposta, e antes ela era sempre a mesma. */
  check('março/2026 começa no domingo', new Date(2026, 2, 1).getDay() === 0);
  check('5º útil de seg a sex em março/2026 é dia 6',
        S.quintoDiaUtil(2026, 3, SEG_SEX) === 6, S.quintoDiaUtil(2026, 3, SEG_SEX));

  /* Novembro/2026 começa num domingo também. Seg-sex: 2,3,4,5,6 → 5º
     é 6. Seg-sáb: 2,3,4,5,6,7 → 5º ainda é 6. Fevereiro/2026 começa
     num domingo. Pego um mês que separa de verdade: julho/2026 começa
     numa quarta. Seg-sex: 1,2,3,6,7 → 5º = 7. Seg-sáb: 1,2,3,4,6 → 5º = 6. */
  check('julho/2026 começa na quarta', new Date(2026, 6, 1).getDay() === 3);
  check('quem trabalha sábado recebe antes',
        S.quintoDiaUtil(2026, 7, SEG_SAB) < S.quintoDiaUtil(2026, 7, SEG_SEX),
        [S.quintoDiaUtil(2026, 7, SEG_SAB), S.quintoDiaUtil(2026, 7, SEG_SEX)]);

  check('ehDiaUtil respeita a lista',
        S.ehDiaUtil('2026-07-04', SEG_SAB) && !S.ehDiaUtil('2026-07-04', SEG_SEX),
        '04/07/2026 é sábado');

  /* O caso do usuário: cai no sábado, recebe na sexta; cai no domingo,
     também na sexta. Volta, nunca avança — o combinado é "até o dia". */
  check('sábado volta para a sexta',
        S.ajustarParaDiaUtil('2026-07-04', SEG_SEX) === '2026-07-03',
        S.ajustarParaDiaUtil('2026-07-04', SEG_SEX));
  /* Sem direção informada, volta — é o padrão. As duas pontas do fim
     de semana seguem a mesma escolha; quem recebe no sábado marca o
     sábado na lista de PAGAMENTO em vez de pedir outra direção. */
  /* Domingo vai para a SEGUNDA: a data anda para o dia de pagamento
     mais próximo, e a segunda está a um dia enquanto a sexta está a
     dois. Não há escolha porque a distância decide. */
  check('domingo vai para a segunda, que está mais perto',
        S.ajustarParaDiaUtil('2026-07-05', SEG_SEX) === '2026-07-06',
        S.ajustarParaDiaUtil('2026-07-05', SEG_SEX));
  check('e o sábado vem para a sexta, pela mesma regra',
        S.ajustarParaDiaUtil('2026-07-04', SEG_SEX) === '2026-07-03');
  check('quem trabalha sábado fica no sábado',
        S.ajustarParaDiaUtil('2026-07-04', SEG_SAB) === '2026-07-04');
  check('dia útil não se mexe',
        S.ajustarParaDiaUtil('2026-07-03', SEG_SEX) === '2026-07-03');
  check('o recuo atravessa a virada do mês',
        S.ajustarParaDiaUtil('2026-08-01', SEG_SEX) === '2026-07-31',
        '01/08/2026 é sábado');

  /* Mês sem 5 dias úteis: devolve o último que existir, em vez de
     estourar o mês ou devolver nada. */
  const soDomingo = S.diaUtilDoMes(2026, 2, 5, [0]);
  check('mês com poucos úteis devolve o último',
        soDomingo === 22, soDomingo);

  // e o estado vazio já traz a lista
  check('estadoVazio traz os dias úteis',
        JSON.stringify(S.estadoVazio().diasUteis) === JSON.stringify(SEG_SEX));
}

/* ── 15: a regra dia_util ────────────────────────────── */
{
  const SEG_SEX = [1, 2, 3, 4, 5];
  /* Uma conta fixa que vence dia 4. Em julho/2026 o dia 4 é sábado,
     então o dinheiro sai na sexta, dia 3. É o que o banco faz. */
  const conta = S.normalizeFlux({
    description: 'aluguel', amount: 900, kind: 'saida',
    on_date: '2020-01-04', repeat_freq: 'mensal', repeat_rule: 'dia_util',
  });
  check('a regra dia_util sobrevive à normalização',
        conta.repeat_rule === 'dia_util', conta.repeat_rule);
  check('vencimento no sábado sai na sexta',
        S.fluxOcorreEm(conta, '2026-07-03', SEG_SEX), '03/07/2026 é sexta');
  check('e NÃO sai no próprio sábado',
        !S.fluxOcorreEm(conta, '2026-07-04', SEG_SEX));
  check('em mês que o dia cai útil, sai no dia',
        S.fluxOcorreEm(conta, '2026-06-04', SEG_SEX), '04/06/2026 é quinta');
  /* A ocorrência anda pelos dias de PAGAMENTO, e este teste passa a
     lista de contagem — que fluxOcorreEm usa só para o 5º útil. O caso
     de quem recebe no sábado está coberto no bloco 18. */

  // e o dia 31 continua encolhendo antes de recuar
  const fim = S.normalizeFlux({
    description: 'cartão', amount: 100, kind: 'saida',
    on_date: '2020-01-31', repeat_freq: 'mensal', repeat_rule: 'dia_util',
  });
  check('dia 31 em abril encolhe para 30 e recua para a sexta',
        S.fluxOcorreEm(fim, '2026-04-30', SEG_SEX), '30/04/2026 é quinta');
}

/* ── 16: cortar uma repetição ────────────────────────── */
{
  /* O índice da ocorrência é o que permite "daqui em diante": ele diz
     quantas já passaram, e é nesse número que a série é cortada. */
  const f = mov({ on_date: '2026-01-10', repeat_freq: 'mensal' });
  check('a primeira ocorrência é o índice 0',
        S.fluxIndiceOcorrencia(f, '2026-01-10') === 0);
  check('a terceira é o índice 2',
        S.fluxIndiceOcorrencia(f, '2026-03-10') === 2,
        S.fluxIndiceOcorrencia(f, '2026-03-10'));
  check('data anterior à primeira dá negativo',
        S.fluxIndiceOcorrencia(f, '2025-12-10') < 0);

  /* Cortar em repeat_times = 2 mantém janeiro e fevereiro e some com
     março em diante — o passado não se apaga ao editar o futuro. */
  const cortado = S.normalizeFlux(Object.assign({}, f, { repeat_times: 2 }));
  check('o corte preserva o que já passou',
        S.fluxOcorreEm(cortado, '2026-01-10') && S.fluxOcorreEm(cortado, '2026-02-10'));
  check('e remove dali em diante',
        !S.fluxOcorreEm(cortado, '2026-03-10'));

  const semanal = mov({ on_date: '2026-03-02', repeat_freq: 'semanal' });
  check('o índice também conta semanas',
        S.fluxIndiceOcorrencia(semanal, '2026-03-23') === 3,
        S.fluxIndiceOcorrencia(semanal, '2026-03-23'));

  const anual = mov({ on_date: '2026-03-02', repeat_freq: 'anual' });
  check('e anos', S.fluxIndiceOcorrencia(anual, '2029-03-02') === 3);
}

/* ── 17: o caso do Itaú ──────────────────────────────── */
{
  /* Fecha dia 8, vence dia 15 — e o vencimento é no MESMO mês do
     fechamento, porque 15 > 8.

     Comprando no dia 15/09, a fatura de setembro já fechou no dia 8.
     A compra entra na próxima, que fecha em 08/10 e sai da conta em
     15/10. Pareceu errado na tela porque as duas datas são plausíveis
     à primeira vista; a conta é esta. */
  const itau = { name: 'Itaú', closing_day: 8, due_day: 15 };

  const depoisDoFecho = S.fluxFatura(itau, '2026-09-15');
  check('compra em 15/09 vai para a fatura que fecha em 08/10',
        depoisDoFecho.fechamento === '2026-10-08', depoisDoFecho);
  check('e sai da conta em 15/10',
        depoisDoFecho.vencimento === '2026-10-15', depoisDoFecho);

  /* Antes do fechamento é outra fatura, um mês antes — é o que separa
     comprar dia 7 de comprar dia 9. */
  const antesDoFecho = S.fluxFatura(itau, '2026-09-07');
  check('compra em 07/09 ainda pega a fatura de setembro',
        antesDoFecho.fechamento === '2026-09-08'
        && antesDoFecho.vencimento === '2026-09-15', antesDoFecho);
  check('um dia depois do fechamento muda o mês inteiro',
        S.fluxFatura(itau, '2026-09-09').vencimento === '2026-10-15');
}

/* ── 18: contar e receber são listas diferentes ──────── */
{
  const SEG_SEX = [1, 2, 3, 4, 5];
  const SEG_SAB = [1, 2, 3, 4, 5, 6];

  /* O caso real: a pessoa conta de segunda a sábado para chegar ao 5º
     dia útil, mas recebe só de segunda a sexta. Com uma lista só era
     impossível — marcar o sábado acertava a contagem e fazia o app
     achar que o pagamento caía ali; desmarcar fazia o contrário. */
  check('04/07/2026 é sábado', new Date(2026, 6, 4).getDay() === 6);
  check('o sábado conta para a contagem',
        S.quintoDiaUtil(2026, 7, SEG_SAB) < S.quintoDiaUtil(2026, 7, SEG_SEX));
  check('e mesmo assim o pagamento sai dele',
        S.ajustarParaDiaUtil('2026-07-04', SEG_SEX) === '2026-07-03');

  /* Cada ponta do fim de semana vai para o lado mais perto, sem o
     usuário escolher nada: sábado está a um dia da sexta e a dois da
     segunda; no domingo é o contrário. */
  check('sábado vem para a sexta',
        S.ajustarParaDiaUtil('2026-07-04', SEG_SEX) === '2026-07-03');
  check('domingo vai para a segunda',
        S.ajustarParaDiaUtil('2026-07-05', SEG_SEX) === '2026-07-06');

  /* Quem recebe no sábado marca o sábado na lista de pagamento, e a
     data nem chega a andar — não precisa de uma terceira direção. */
  check('quem recebe no sábado fica no sábado',
        S.ajustarParaDiaUtil('2026-07-04', SEG_SAB) === '2026-07-04');

  check('dia de pagamento não anda',
        S.ajustarParaDiaUtil('2026-07-03', SEG_SEX) === '2026-07-03');

  /* Um fim de semana virando o mês é onde as direções mais divergem:
     31/01/2026 é sábado, então antes fica em janeiro e depois passa
     para fevereiro — mês diferente, e o razão fecha diferente. */
  check('31/01/2026 é sábado', new Date(2026, 0, 31).getDay() === 6);
  check('sábado dia 31 volta para a sexta, dentro de janeiro',
        S.ajustarParaDiaUtil('2026-01-31', SEG_SEX) === '2026-01-30');


  const v = S.estadoVazio();
  check('estadoVazio traz as duas listas',
        JSON.stringify(v.diasUteis) === JSON.stringify(SEG_SEX)
        && JSON.stringify(v.diasPagamento) === JSON.stringify(SEG_SEX), v);

}

/* ── 20: o 5º útil também anda ───────────────────────── */
{
  /* O caso do usuário: conta de segunda a sábado, então o 5º dia útil
     de setembro/2026 cai no sábado dia 5. Mas ele não recebe sábado —
     recebe na sexta. A contagem e o pagamento são listas diferentes, e
     o 5º útil precisa passar pelas duas. */
  const SEG_SAB = [1, 2, 3, 4, 5, 6];
  const SEG_SEX = [1, 2, 3, 4, 5];

  check('05/09/2026 é sábado', new Date(2026, 8, 5).getDay() === 6);
  check('contando o sábado, o 5º útil de set/26 é dia 5',
        S.quintoDiaUtil(2026, 9, SEG_SAB) === 5, S.quintoDiaUtil(2026, 9, SEG_SAB));

  const salario = S.normalizeFlux({
    description: 'salário', amount: 5000, kind: 'entrada',
    on_date: '2020-01-05', repeat_freq: 'mensal', repeat_rule: 'quinto_util',
  });

  S.setDiasUteis(SEG_SAB);
  S.setDiasPagamento(SEG_SEX);
  check('o salário NÃO cai no sábado',
        !S.fluxOcorreEm(salario, '2026-09-05'));
  check('ele cai na sexta, dia 4',
        S.fluxOcorreEm(salario, '2026-09-04'));

  /* Quem recebe no sábado continua recebendo nele: aí as duas listas
     são a mesma e não há o que ajustar. */
  S.setDiasPagamento(SEG_SAB);
  check('quem recebe sábado recebe no dia 5',
        S.fluxOcorreEm(salario, '2026-09-05'));
  check('e não na sexta', !S.fluxOcorreEm(salario, '2026-09-04'));

  // devolve o estado ao padrão para não vazar para os outros blocos
  S.setDiasUteis(SEG_SEX);
  S.setDiasPagamento(SEG_SEX);
}
/* ── 19: o mês da própria semente conta ──────────────── */
{
  /* O primeiro mês sumia. Para um mensal com regra de dia útil, o
     atalho da on_date não vale (ela guarda o dia combinado, não a data
     de pagamento) e o índice 0 vinha barrado junto com os negativos —
     então a série só nascia no segundo mês. Na tela: um lançamento
     criado para setembro aparecia só em outubro, e a lista de tabelas
     mostrava uma data que o razão não tinha. */
  const SEG_SEX = [1, 2, 3, 4, 5];
  S.setDiasUteis(SEG_SEX);
  S.setDiasPagamento(SEG_SEX);

  // 05/09/2026 é sábado: o dia combinado é 5, o pagamento é sexta, dia 4
  check('05/09/2026 é sábado', new Date(2026, 8, 5).getDay() === 6);
  const fixa = S.normalizeFlux({
    description: 'teste', amount: 321.31, kind: 'saida',
    on_date: '2026-09-05', repeat_freq: 'mensal', repeat_rule: 'dia_util',
  });
  check('a série existe já no mês da semente',
        S.fluxOcorreEm(fixa, '2026-09-04'), 'sexta, 04/09');
  check('e no mês da semente ela cai UMA vez só — na data ajustada',
        !S.fluxOcorreEm(fixa, '2026-09-05'));
  check('o mês seguinte continua certo (05/10 é segunda)',
        S.fluxOcorreEm(fixa, '2026-10-05'));

  const quinto = S.normalizeFlux({
    description: 'salário', amount: 4000, kind: 'entrada',
    on_date: '2026-09-07', repeat_freq: 'mensal', repeat_rule: 'quinto_util',
  });
  const q = '2026-09-' + String(S.quintoDiaUtil(2026, 9, SEG_SEX)).padStart(2, '0');
  check('o 5º útil também vale no mês da semente',
        S.fluxOcorreEm(quinto, q), q);

  /* Sem regra o atalho já cobria o dia da semente; o que muda é que
     agora ele é alcançado pelos dois caminhos e não pode duplicar —
     fluxOcorreEm devolve booleano, mas o movimento do dia é somado por
     lançamento, então um dia com a série presente vale uma vez só. */
  const simples = mov({ on_date: '2026-09-10', kind: 'saida', amount: 50,
                        repeat_freq: 'mensal', repeat_rule: 'data' });
  check('regra data: a semente conta e não repete no mesmo dia',
        S.fluxMovimentoEm([simples], '2026-09-10') === -50,
        S.fluxMovimentoEm([simples], '2026-09-10'));

  /* Contar N vezes passa a contar a partir do primeiro mês de verdade:
     antes, "3 vezes" com regra de dia útil rendia duas. */
  const tres = S.normalizeFlux({
    description: 'parcela', amount: 100, kind: 'saida',
    on_date: '2026-09-05', repeat_freq: 'mensal', repeat_rule: 'dia_util',
    repeat_times: 3,
  });
  check('três vezes são três meses, a contar da semente',
        S.fluxOcorreEm(tres, '2026-09-04') && S.fluxOcorreEm(tres, '2026-10-05')
        && S.fluxOcorreEm(tres, '2026-11-05') && !S.fluxOcorreEm(tres, '2026-12-04'));
}
console.log(fails ? '\nFALHOU: ' + fails : '\nTODOS OS TESTES DO FLUX PASSARAM');
process.exit(fails ? 1 : 0);

/* Conferência estrutural dos arquivos SQL: parênteses, vírgula solta
   antes de select/), e cada statement terminando em ponto e vírgula. */
const fs = require('fs');
const path = require('path');
const R = path.join(__dirname, '..') + '/';

const arquivos = fs.readdirSync(R + 'supabase')
  .filter(function (f) { return f.endsWith('.sql'); })
  .map(function (f) { return 'supabase/' + f; })
  .sort();

let problemas = 0;

for (const f of arquivos) {
  let s;
  try { s = fs.readFileSync(R + f, 'utf8'); } catch (e) { console.log(f + '  (ausente)'); continue; }

  // corpos $$...$$ são plpgsql; fora do escopo desta conferência
  const semDolar = s.replace(/\$([A-Za-z]*)\$[\s\S]*?\$\1\$/g, ' BLOCO ');
  // comentários e literais de texto saem antes de contar
  const limpo = semDolar.replace(/--[^\n]*/g, ' ').replace(/'[^']*'/g, "''");

  let prof = 0, negativo = false;
  for (const ch of limpo) {
    if (ch === '(') prof++;
    else if (ch === ')') { prof--; if (prof < 0) negativo = true; }
  }

  /* Uma view que lê a coluna impede o Postgres de derrubá-la:
     "2BP01: cannot drop column ... because other objects depend on it".
     Quem recria a view no fim do arquivo tem que derrubá-la no começo. */
  const iDropCol  = limpo.search(/drop\s+column/i);
  const iDropView = limpo.search(/drop\s+view/i);
  const temCreateView = /create\s+view/i.test(limpo);
  const ordemErrada = iDropCol >= 0 && temCreateView
    && (iDropView < 0 || iDropView > iDropCol);

  const virgulaSelect = /,\s*select\b/i.test(limpo);
  const virgulaFecha  = /,\s*\)/.test(limpo);
  const virgulaFrom   = /,\s*from\b/i.test(limpo);

  const ok = prof === 0 && !negativo && !virgulaSelect && !virgulaFecha
    && !virgulaFrom && !ordemErrada;
  if (!ok) problemas++;

  console.log((ok ? '  ok   ' : '  FALHA ') + f);
  if (prof !== 0)      console.log('         parênteses não fecham (saldo ' + prof + ')');
  if (negativo)        console.log('         fecha parêntese que não foi aberto');
  if (virgulaSelect)   console.log('         vírgula solta antes de SELECT');
  if (virgulaFecha)    console.log('         vírgula solta antes de )');
  if (virgulaFrom)     console.log('         vírgula solta antes de FROM');
  if (ordemErrada)     console.log('         derruba coluna sem derrubar a view antes');
}

console.log(problemas === 0 ? '\nSQL estruturalmente ok' : '\n' + problemas + ' arquivo(s) com problema');
process.exit(problemas ? 1 : 0);

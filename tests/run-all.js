/* Roda os três conjuntos de teste da camada de dados.
   Cada arquivo sai com código 1 se alguma asserção falhar.

   node tests/run-all.js
*/
const { execFileSync } = require('child_process');
const path = require('path');

const SUITES = ['store.test.js', 'loans.test.js', 'accounts.test.js'];

let falhou = false;

SUITES.forEach(function (arquivo) {
  console.log('\n── ' + arquivo + ' ' + '─'.repeat(Math.max(0, 44 - arquivo.length)));
  try {
    const saida = execFileSync(process.execPath, [path.join(__dirname, arquivo)], {
      encoding: 'utf8',
    });
    // só a última linha interessa quando tudo passa
    const linhas = saida.trim().split('\n');
    console.log(linhas[linhas.length - 1]);
  } catch (err) {
    falhou = true;
    process.stdout.write(err.stdout || '');
    process.stderr.write(err.stderr || '');
  }
});

console.log(falhou ? '\n✗ há falhas' : '\n✓ tudo passou');
process.exit(falhou ? 1 : 0);

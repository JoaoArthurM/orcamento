/* Regressões de layout mobile. Requer Playwright e Edge (ou UI_BROWSER).
   Com o servidor ativo: node tests/ui-sizing.browser.cjs
   UI_BASE_URL permite apontar uma cópia local; nenhuma conta real é usada. */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.UI_BROWSER || 'msedge' });
  try {
    for (const width of [320, 393, 412]) {
      const context = await browser.newContext({ viewport: { width, height: 852 }, hasTouch: true, serviceWorkers: 'block' });
      const page = await context.newPage();
      await page.route('**/assets/js/config.js', r => r.fulfill({ contentType: 'text/javascript', body: '' }));
      await page.goto(process.env.UI_BASE_URL || 'http://127.0.0.1:5175/', { waitUntil: 'domcontentloaded' });
      for (const module of ['contas', 'favores', 'loans', 'eco']) {
        await page.locator(`[data-go="${module}"]`).click();
        const back = page.locator('#btn-back');
        const target = await back.evaluate(el => {
          const r = el.getBoundingClientRect();
          const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return { width: r.width, height: r.height, clickable: el.contains(hit) };
        });
        assert(target.width >= 48 && target.height >= 48 && target.clickable, `${width}/${module}: voltar`);
        await page.locator('#fab-add').click();
        await page.locator('.sheet.open').waitFor({ state: 'visible' });
        await page.waitForTimeout(350); // termina a abertura e o foco programado
        const fields = await page.locator('.sheet.open input:visible').evaluateAll(els => els
          .filter(el => !['checkbox', 'radio', 'hidden'].includes(el.type))
          .map(el => parseFloat(getComputedStyle(el).fontSize)));
        assert(fields.every(size => size >= 16), `${width}/${module}: campos legíveis`);
        await page.locator('.sheet.open .bbk').first().click();
        await page.locator('[data-tab="tabelas"]').click();
        const aligned = await page.locator('#app').evaluate(el => ({ x: el.scrollLeft,
          viewX: document.querySelector('.view.on').getBoundingClientRect().x }));
        assert.equal(aligned.x, 0, `${width}/${module}: shell sem rolagem lateral`);
        assert.equal(aligned.viewX, 0, `${width}/${module}: tela alinhada após fechar formulário`);
        assert(await page.locator('.sheet:not(.open)').first().isHidden(), 'formulário fechado não recebe foco');
        await back.click();
        // Tabelas volta ao módulo; o próximo retorno abre o hub.
        if (!(await page.locator('#view-hub').isVisible())) await back.click();
      }
      await context.close();
      console.log(`ok — ${width}px: quatro módulos, voltar, formulários, tabelas e alinhamento`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

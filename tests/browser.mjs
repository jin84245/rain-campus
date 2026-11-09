import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const browserPaths = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
].filter(Boolean);
const executablePath = browserPaths.find((path) => existsSync(path));
if (!executablePath) throw new Error('找不到已安装的 Chrome 或 Edge；可设置 CHROME_PATH 后重试。');

const server = await createServer({
  configFile: resolve('vite/config.dev.mjs'),
  plugins: [{
    name: 'campus-scene-test-access',
    enforce: 'pre',
    transform(code, id) {
      if (id.replaceAll('\\', '/').endsWith('/src/scenes/CampusScene.ts')) {
        return code.replace('this.created=true;', 'this.created=true; globalThis.__campusTestScene=this;');
      }
    }
  }],
  server: { host: '127.0.0.1', port: 0, strictPort: false },
  clearScreen: false
});
let browser;
const errors = [];

try {
  await server.listen();
  const address = server.httpServer.address();
  if (!address || typeof address === 'string') throw new Error('Vite 未提供本地端口。');
  browser = await chromium.launch({ headless: true, executablePath });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  await page.goto(`http://127.0.0.1:${address.port}/?mapSeed=123&eventSeed=456`, { waitUntil: 'domcontentloaded' });
  await page.locator('#game-container canvas').waitFor({ timeout: 15000 });
  await page.waitForFunction(() => document.querySelector('#map-seed')?.textContent === '123');
  assert.equal(await page.locator('#building-list .building-row').count(), 5);
  assert.equal(await page.locator('#slot-list .slot-button').count(), 8);
  assert.equal(await page.locator('#budget-remaining').textContent(), '30');

  // Access is injected only by this test server; production has no test global.
  const screenSlots = () => page.evaluate(() => {
    const scene = globalThis.__campusTestScene;
    const camera = scene.cameras.main;
    const canvas = scene.game.canvas;
    const rect = canvas.getBoundingClientRect();
    return scene.state.board.buildSlots.map(({ id, candidateCells }) => {
      const cell = candidateCells[0];
      const point = camera.matrixCombined.transformPoint((cell.x + .5) * 32, (cell.y + .5) * 32);
      return { id, count: candidateCells.length,
        x: rect.x + point.x * rect.width / canvas.width,
        y: rect.y + point.y * rect.height / canvas.height };
    });
  });
  await page.waitForFunction(() => globalThis.__campusTestScene?.state);
  const map = (await screenSlots())[0];
  assert.ok(map);
  const canvas = page.locator('#game-container canvas');
  const bounds = await canvas.boundingBox();
  assert.ok(bounds);
  const { x, y } = map;
  await page.locator('.tool-button[data-tool="broadleaf"]').click();
  assert.equal(await page.locator('.tool-button[data-tool="broadleaf"] .tool-cost').textContent(), '2 / 棵');
  await page.mouse.move(x, y);
  await page.waitForFunction(() => (document.querySelector('#preview-message')?.textContent ?? '').includes('本次新增'));
  await page.mouse.click(x, y);
  assert.equal(Number(await page.locator('#budget-remaining').textContent()), 30 - map.count * 2);
  await page.locator('#undo-button').click();
  assert.equal(await page.locator('#budget-remaining').textContent(), '30');

  // Click ALL EIGHT candidate groups on the actual zoomed Phaser canvas,
  // verify physical placement costs, then undo. Not just the first DOM button.
  const allSlots = await screenSlots();
  assert.equal(allSlots.length,8);
  await page.locator('.tool-button[data-tool="broadleaf"]').click();
  for (const slot of allSlots) {
    await page.mouse.click(slot.x, slot.y);
    assert.equal(Number(await page.locator('#budget-remaining').textContent()),30-slot.count*2,`canvas click failed for ${slot.id}`);
    await page.locator('#undo-button').click();
    assert.equal(await page.locator('#budget-remaining').textContent(),'30',`undo failed after ${slot.id}`);
  }
  // Conflicting facility types are rejected at the SAME physical candidate:
  // the UI must show an error and the scene's pure preview mapping must be red.
  await page.mouse.click(x,y);
  const afterTree = Number(await page.locator('#budget-remaining').textContent());
  await page.locator('.tool-button[data-tool="lawn"]').click();
  await page.mouse.move(x,y);
  await page.waitForFunction(() => document.querySelector('#preview-message')?.classList.contains('is-error'));
  assert.match((await page.locator('#preview-message').textContent())??'',/其他设施/);
  await page.mouse.click(x,y);
  assert.equal(Number(await page.locator('#budget-remaining').textContent()),afterTree,'conflict must not charge budget');
  await page.locator('#undo-button').click();
  assert.equal(await page.locator('#budget-remaining').textContent(),'30');

  for (const variant of ['pine', 'autumn']) {
    const tool = page.locator(`.tool-button[data-tool="${variant}"]`);
    await tool.click();
    assert.equal(await tool.getAttribute('aria-pressed'), 'true');
    assert.equal(await tool.locator('.tool-cost').textContent(), '2 / 棵');
    await page.locator('#slot-list .slot-button').first().click();
    assert.equal(Number(await page.locator('#budget-remaining').textContent()), 30 - map.count * 2);
    await page.locator('#undo-button').click();
    assert.equal(await page.locator('#budget-remaining').textContent(), '30');
  }

  for (const variant of ['grass-tuft', 'shrub']) {
    const tool = page.locator(`.tool-button[data-tool="${variant}"]`);
    await tool.click();
    assert.equal(await tool.getAttribute('aria-pressed'), 'true');
    assert.equal(await tool.locator('.tool-cost').textContent(), '1 / 块');
    await page.locator('#slot-list .slot-button').first().click();
    assert.equal(Number(await page.locator('#budget-remaining').textContent()), 30 - map.count);
    await page.locator('#undo-button').click();
    assert.equal(await page.locator('#budget-remaining').textContent(), '30');
  }

  const appearance = page.locator('#building-list .building-row .building-appearance').first();
  await appearance.selectOption('brick');
  assert.equal(await appearance.inputValue(), 'brick');
  assert.equal(await page.locator('#budget-remaining').textContent(), '30');

  await page.locator('#building-list .building-row button').first().click();
  assert.equal(await page.locator('#budget-remaining').textContent(), '26');
  await page.locator('#start-button').click();
  assert.equal(await page.locator('#start-button').isDisabled(), true);
  assert.equal(await page.locator('body').getAttribute('data-phase'), 'running');
  assert.equal(await page.locator('#run-summary').isVisible(), true);
  assert.equal(await page.locator('.tool-section').isVisible(), false);
  assert.equal(await page.locator('.slot-section').isVisible(), false);
  assert.equal(await page.locator('.building-section').isVisible(), false);
  assert.equal(await page.locator('#skip-button').isVisible(), true);
  assert.equal(await page.locator('.tool-button[data-tool="broadleaf"]').isDisabled(), true);
  assert.equal(await page.locator('.building-appearance').first().isDisabled(), true);
  await page.waitForFunction(() => document.querySelector('#phase-chip')?.textContent === '挑战结算', { timeout: 30000 });
  assert.equal(await page.locator('#round-results tr').count(), 5);
  assert.equal(await page.locator('body').getAttribute('data-phase'),'result');
  const firstScore = await page.locator('#total-score').textContent();
  assert.ok(Number(firstScore) >= 0 && Number(firstScore) <= 100);

  await page.locator('#optimize-button').click();
  assert.equal(await page.locator('#map-seed').textContent(), '123');
  assert.equal(await page.locator('#event-seed').textContent(), '456');
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.waitForTimeout(250);
  for (const slot of await screenSlots()) {
    await page.mouse.click(slot.x, slot.y);
    assert.equal(Number(await page.locator('#budget-remaining').textContent()), 26 - slot.count);
    await page.locator('#undo-button').click();
  }
  await page.locator('#start-button').click();
  await page.locator('#skip-button').click();
  assert.equal(await page.locator('#phase-chip').textContent(), '挑战结算');
  assert.equal(await page.locator('#total-score').textContent(), firstScore);
  assert.deepEqual(errors, [], `browser errors: ${errors.join(' | ')}`);
  process.stdout.write('浏览器验收通过：地图渲染、树木/绿化外观工具、建筑外观选择、同效建设、预览、撤销、遮雨棚、五轮动画、锁定、重放与跳过结算。\n');
} finally {
  await browser?.close();
  await server.close();
}


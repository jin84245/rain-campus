import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { _electron as electron } from 'playwright';

const packaged = process.argv.includes('--packaged');
const app = await electron.launch({
  args: packaged ? [] : [resolve('.')],
  ...(packaged ? { executablePath: resolve('release/雨落校园-V4.3-win-x64/雨落校园.exe') } : {}),
  timeout: 30000
});

try {
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    assert.ok(!/^https?:/.test(request.url()) || request.url().startsWith('http://127.0.0.1:'), `外部请求：${request.url()}`);
  });
  await page.locator('#game-container canvas').waitFor({ timeout: 15000 });
  await page.waitForLoadState('networkidle');
  if (packaged) await page.context().setOffline(true);
  await page.locator('.tool-button[data-tool="pine"]').click();
  assert.equal(await page.locator('.tool-button[data-tool="pine"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#building-list .building-row').count(), 5);
  const names = await page.locator('#building-list').textContent();
  for (const name of ['骋望楼', '东区主教', '食堂', '地下超市', '西四']) assert.ok(names.includes(name));
  await page.locator('#slot-list .slot-button').first().click();
  assert.ok(Number(await page.locator('#budget-remaining').textContent()) < 30);
  await page.locator('#start-button').click();
  await page.locator('#skip-button').click();
  assert.equal(await page.locator('#round-results tr').count(), 5);
  if (packaged) await page.screenshot({ path: resolve('artifacts/screenshots/v4/windows-packaged-result.png') });
  assert.deepEqual(errors, []);
  process.stdout.write('桌面版验收通过：Electron 窗口已启动，地图、工具选择与五栋建筑均正常显示。\n');
} finally {
  await app.close();
}

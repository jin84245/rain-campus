/** V4 actual-render verification: run after `npm install` on the Windows machine.
 * The result screenshots are evidence from the current code, not mockups.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const candidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/chromium', '/usr/bin/chromium-browser'
].filter(Boolean);
const executablePath = candidates.find((name) => existsSync(name));
if (!executablePath) throw new Error('Chrome/Edge not found; pass CHROME_PATH');
const out = resolve('artifacts/screenshots/v4');
mkdirSync(out, { recursive: true });
const server = await createServer({
  configFile: resolve('vite/config.dev.mjs'),
  server: { host: '127.0.0.1', port: 0, strictPort: false },
  clearScreen: false
});
let browser;
const errors = [];
try {
  await server.listen();
  const address = server.httpServer.address();
  if (!address || typeof address === 'string') throw new Error('No vite server port');
  browser = await chromium.launch({ headless: true, executablePath });
  const baseUrl = `http://127.0.0.1:${address.port}/`;
  for (const [w, h] of [[1366,768],[1380,900],[1920,1080]]) {
    const page = await browser.newPage({ viewport: { width:w,height:h } });
    page.on('pageerror', (error)=>errors.push(`${w}x${h}: ${error.message}`));
    page.on('response',(response)=>{
      if (response.status()>=400)errors.push(`${w}x${h}: ${response.status()} ${response.url()}`);
    });
    await page.goto(`${baseUrl}?mapSeed=7&eventSeed=0`,{waitUntil:'networkidle'});
    await page.locator('#game-container canvas').waitFor({timeout:15000});
    await page.waitForTimeout(600);
    assert.equal(await page.locator('#building-list .building-row').count(),5);
    assert.equal(await page.locator('#slot-list .slot-button').count(),8);
    const layout=await page.evaluate(()=>{
      const ws=document.querySelector('.workspace').getBoundingClientRect();
      const map=document.querySelector('.map-card').getBoundingClientRect();
      const sidebar=document.querySelector('.control-card').getBoundingClientRect();
      const start=document.querySelector('#start-button').getBoundingClientRect();
      return {mapRatio:map.width/ws.width,sidebarWidth:sidebar.width,startVisible:start.y>=0&&start.bottom<=innerHeight,
        pageScroll:document.documentElement.scrollHeight-innerHeight};
    });
    assert.ok(layout.mapRatio>=.68,`map occupies <68%: ${JSON.stringify(layout)}`);
    assert.ok(layout.sidebarWidth>=280&&layout.sidebarWidth<=330,`sidebar width wrong: ${layout.sidebarWidth}`);
    assert.ok(layout.startVisible,`primary action clipped: ${JSON.stringify(layout)}`);
    assert.ok(layout.pageScroll<5,`whole page scrolls: ${JSON.stringify(layout)}`);
    // V4.3: the Phaser canvas MUST occupy the complete game container.
    // A 16:9 FIT canvas inside a taller flex slot created bright green bands.
    const viewportFit=await page.evaluate(()=>{
      const container=document.querySelector('#game-container').getBoundingClientRect();
      const canvas=document.querySelector('#game-container canvas').getBoundingClientRect();
      return {container:{width:container.width,height:container.height},canvas:{width:canvas.width,height:canvas.height}};
    });
    assert.ok(Math.abs(viewportFit.container.width-viewportFit.canvas.width)<=3,
      `letterboxed Phaser canvas width: ${JSON.stringify(viewportFit)}`);
    assert.ok(Math.abs(viewportFit.container.height-viewportFit.canvas.height)<=3,
      `letterboxed Phaser canvas height: ${JSON.stringify(viewportFit)}`);
    const buildingText=await page.locator('#building-list').innerText();
    for(const name of ['骋望楼','东区主教','食堂','地下超市','西四']){
      assert.ok(buildingText.includes(name),`building name missing from visible UI: ${name}`);
    }
    await page.screenshot({path:resolve(out,`building-${w}x${h}.png`),fullPage:true});
    await page.close();
  }
  // One actual rendered screenshot for each required bend class.
  // Verified by the pure generator: seed 7 = straight, 0 = one bend,
  // seed 4 = three bends. Fail immediately if the generator drifts.
  for(const [seed,expectedTurns] of [[7,0],[0,1],[4,3]]){
    const page=await browser.newPage({viewport:{width:1380,height:900}});
    page.on('pageerror',(error)=>errors.push(`turn-${expectedTurns}: ${error.message}`));
    page.on('response',(response)=>{
      if(response.status()>=400)errors.push(`turn-${expectedTurns}: ${response.status()} ${response.url()}`);
    });
    await page.goto(`${baseUrl}?mapSeed=${seed}&eventSeed=0`,{waitUntil:'networkidle'});
    await page.locator('#game-container canvas').waitFor({timeout:15000});
    const actualTurns=await page.evaluate(async (value)=>{
      const {generateBoard}=await import('/src/core/mapGenerator.ts');
      return generateBoard(value).turns;
    },seed);
    assert.equal(actualTurns,expectedTurns,`bend count changed for seed ${seed}`);
    await page.screenshot({path:resolve(out,`turns-${expectedTurns}-seed-${seed}.png`),fullPage:true});
    await page.close();
  }
  // V4.2: local screenshot inspection for 1x1 buildings with FULL labels.
  // This is a real-render acceptance artifact; do not replace with a static mockup.
  for (const seed of [1, 25, 123]) {
    const page=await browser.newPage({viewport:{width:1380,height:900}});
    page.on('pageerror',(error)=>errors.push(`building-label-${seed}: ${error.message}`));
    page.on('response',(response)=>{
      if(response.status()>=400)errors.push(`building-label-${seed}: ${response.status()} ${response.url()}`);
    });
    await page.goto(`${baseUrl}?mapSeed=${seed}&eventSeed=456`,{waitUntil:'networkidle'});
    await page.locator('#game-container canvas').waitFor({timeout:15000});
    const labels=await page.evaluate(async (value)=>{
      const {generateBoard}=await import('/src/core/mapGenerator.ts');
      const {layoutBuildingFootprints,buildingSignText}=await import('/src/visual/buildingLayout.ts');
      const board=generateBoard(value);
      return layoutBuildingFootprints(board).map((area)=>{
        const building=board.buildings.find((item)=>item.id===area.buildingId);
        return {small:area.width===1,fullName:building.name,
          display:buildingSignText(building.name,area.compactLabel).replace(/\n/g,'')};
      });
    },seed);
    assert.ok(labels.some((item)=>item.small),`seed ${seed} has no 1x1 building`);
    assert.ok(labels.every((item)=>item.fullName===item.display),`truncated building name seed ${seed}`);
    await page.screenshot({path:resolve(out,`full-building-names-seed-${seed}.png`),fullPage:true});
    await page.close();
  }
  for (const [seed,weather,filename] of [
    [0,'小雨','day-light-rain.png'],
    [2,'暴雨','night-heavy-rain.png']
  ]){
    const page=await browser.newPage({viewport:{width:1380,height:900}});
    page.on('pageerror',(error)=>errors.push(`${filename}: ${error.message}`));
    page.on('response',(response)=>{
      if(response.status()>=400)errors.push(`${filename}: ${response.status()} ${response.url()}`);
    });
    await page.goto(`${baseUrl}?mapSeed=123&eventSeed=${seed}`,{waitUntil:'networkidle'});
    await page.locator('#game-container canvas').waitFor({timeout:15000});
    await page.locator('#start-button').click();
    assert.equal(await page.locator('body').getAttribute('data-phase'),'running');
    assert.equal(await page.locator('#run-summary').isVisible(),true);
    assert.equal(await page.locator('.tool-section').isVisible(),false);
    assert.equal(await page.locator('.slot-section').isVisible(),false);
    assert.equal(await page.locator('#skip-button').isVisible(),true);
    await page.waitForTimeout(1250);
    const label=await page.locator('#weather-badge').textContent();
    assert.ok((label??'').includes(weather),`${filename}: expected ${weather}, got ${label}`);
    await page.screenshot({path:resolve(out,filename),fullPage:true});
    await page.locator('#skip-button').click();
    assert.equal(await page.locator('#round-results tr').count(),5);
    await page.screenshot({path:resolve(out,`result-${seed}.png`),fullPage:true});
    await page.close();
  }
  assert.deepEqual(errors,[],errors.join('\n'));
  console.log(`PASS: responsive build/rain/result screenshots in ${out}`);
} finally {
  await browser?.close();
  await server.close();
}

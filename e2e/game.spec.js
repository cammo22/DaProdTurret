import { test, expect } from '@playwright/test';

async function openGame(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  await expect(page).toHaveTitle(/DaProdTurret/i);
  await page.waitForFunction(() => window.__DAPROD__?.game?.version === 2, null, { timeout: 20_000 });
  await expect(page.locator('#viewport canvas')).toBeVisible();
  return errors;
}
async function start(page) {
  const button = page.getByTestId('start-button');
  if (await button.isVisible()) await button.click();
  else await page.getByTestId('wave-button').click();
  await expect.poll(() => page.evaluate(() => window.__DAPROD__.game.phase)).toBe('combat');
}

// These scenarios deliberately inject controlled state to exercise UI boundaries.
// Natural progression and weapon physics are separately covered by engine tests.
test('full-screen game: literal manual shots, ammo, default audio and in-game upgrades', async ({ page }, info) => {
  const errors = await openGame(page);
  await start(page);
  await page.evaluate(() => {
    const g = window.__DAPROD__.game;
    g.enemies = []; g.projectiles = []; g.effects = [];
    g.spawnRemaining = 1; g.spawnTimer = 999; g.cooldown = 0;
    g.ammo = 36; g.reloadTimer = 0; g.energy = 100; g.lastShot = null;
    g.scrap = 1000;
  });
  const point = await page.evaluate(() => window.__DAPROD__.project(10, -10));
  await page.mouse.click(point.x, point.y);
  await expect.poll(() => page.evaluate(() => window.__DAPROD__.game.lastShot?.manual)).toBe(true);
  const shot = await page.evaluate(() => ({ ...window.__DAPROD__.game.lastShot, ammo: window.__DAPROD__.game.ammo, energy: window.__DAPROD__.game.energy }));
  expect(shot.x).toBeCloseTo(10, 0); expect(shot.z).toBeCloseTo(-10, 0);
  expect(shot.ammo).toBeLessThan(36); expect(shot.energy).toBe(100);
  expect(await page.evaluate(() => window.__DAPROD__.muted)).toBe(false);
  await expect(page.locator('#tower-hud')).toBeVisible();
  await page.getByTestId('upgrades-button').click();
  const stopped = await page.evaluate(() => window.__DAPROD__.game.time);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__DAPROD__.game.time)).toBe(stopped);
  await page.getByTestId('upgrade-cannon-damage').click();
  expect(await page.evaluate(() => window.__DAPROD__.game.weaponUpgrades.cannon.damage)).toBe(1);
  await page.getByTestId('close-upgrades').click();
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await expect(page.getByText(/Settore nord|Mare aperto|Avamposto 07|La linea tiene|Ricerca estratta/i)).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('arcade-game.png') });
  expect(errors).toEqual([]);
});

test('wave gates, EMP stun, boss HP and missile projectiles are playable in-game', async ({ page }) => {
  const errors = await openGame(page);
  await start(page);
  expect(await page.evaluate(() => window.__DAPROD__.game.autoWave)).toBe(true);
  await expect(page.getByTestId('weapon-tesla')).toBeDisabled();
  await expect(page.getByTestId('weapon-rail')).toBeDisabled();
  await page.evaluate(() => {
    const g = window.__DAPROD__.game;
    g.wave = 5; g.spawnRemaining = 1; g.spawnTimer = 999; g.cooldown = 99;
    g.enemies = [{ id: 9901, type: 'boss', x: 8, z: 2, hp: 10000, maxHp: 10000, speed: .2, reward: 50, attackCooldown: 99, attackRange: 12, stunnedFor: 0, submerged: false, diveTimer: 0 }];
    g.energy = 100; g.pulseCooldown = 0; g.missileCooldown = 0;
  });
  await expect(page.locator('#boss-health')).toBeVisible();
  await page.getByTestId('pulse-button').click();
  expect(await page.evaluate(() => window.__DAPROD__.game.enemies[0].stunnedFor)).toBeGreaterThan(0);
  await page.evaluate(() => { window.__DAPROD__.game.energy = 100; });
  await page.getByTestId('missile-button').click();
  await expect.poll(() => page.evaluate(() => window.__DAPROD__.game.projectiles.some(p => p.kind === 'missile'))).toBe(true);
  // Eligibility is current-run wave, not a permanent record or purchase.
  await page.evaluate(() => { window.__DAPROD__.game.wave = 25; });
  await expect(page.getByTestId('weapon-tesla')).toBeEnabled();
  await page.getByTestId('weapon-tesla').click();
  expect(await page.evaluate(() => window.__DAPROD__.game.weapon)).toBe('tesla');
  await expect(page.getByTestId('weapon-rail')).toBeDisabled();
  await page.evaluate(() => { window.__DAPROD__.game.wave = 50; });
  await expect(page.getByTestId('weapon-rail')).toBeEnabled();
  await page.getByTestId('weapon-rail').click();
  expect(await page.evaluate(() => window.__DAPROD__.game.weapon)).toBe('rail');
  expect(errors).toEqual([]);
});

test('checkpoint stops ten-wave advancement and defeat preserves only the record', async ({ page }) => {
  const errors = await openGame(page);
  await start(page);
  await page.evaluate(() => {
    const g = window.__DAPROD__.game;
    g.wave = 10; g.phase = 'combat'; g.enemies = []; g.projectiles = [];
    g.spawnRemaining = 0; g.score = 1234;
  });
  await expect.poll(() => page.evaluate(() => window.__DAPROD__.game.phase)).toBe('upgrade');
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__DAPROD__.game.wave)).toBe(10);
  await page.getByTestId('wave-button').click();
  await expect.poll(() => page.evaluate(() => window.__DAPROD__.game.wave)).toBe(11);
  await page.evaluate(() => { window.__DAPROD__.game.hp = 0; });
  await expect.poll(() => page.evaluate(() => window.__DAPROD__.game.phase)).toBe('defeat');
  await page.locator('#restart').click();
  const g = await page.evaluate(() => window.__DAPROD__.game);
  expect(g.highScore).toBeGreaterThanOrEqual(1234);
  expect(g.score).toBe(0);
  expect(g.weaponUpgrades.cannon.damage).toBe(0);
  expect(g.unlocked).toEqual(['cannon']);
  expect('research' in g).toBe(false);
  expect(errors).toEqual([]);
});

test('sea events are visible world objects and grant a one-time collectible reward',async({page})=>{
  const errors=await openGame(page);await start(page);
  await page.evaluate(()=>{
    const g=window.__DAPROD__.game;g.enemies=[];g.spawnRemaining=1;g.spawnTimer=999;
    g.events=[{id:8801,type:'salvage',x:8,z:5,ttl:30,value:80}];g.scrap=60;
  });
  await expect.poll(()=>page.evaluate(()=>!!window.__DAPROD__.scene.getObjectByName('sea-event-8801'))).toBe(true);
  await page.getByTestId('event-8801').click();
  await expect.poll(()=>page.evaluate(()=>window.__DAPROD__.game.scrap)).toBe(140);
  await expect(page.getByTestId('event-8801')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('static PWA reopens the full game offline under its deployment scope', async ({ page, context }) => {
  const errors = await openGame(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => window.__DAPROD__?.game?.version === 2, null, { timeout: 20_000 });
  await expect(page.locator('#viewport canvas')).toBeVisible();
  await start(page);
  expect(errors).toEqual([]);
});

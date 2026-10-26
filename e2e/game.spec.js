import { test, expect } from '@playwright/test';

async function openGame(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  await expect(page).toHaveTitle(/DaProdTurret/i);
  await page.waitForFunction(() => window.__DAPROD__?.game);
  await expect(page.locator('canvas').first()).toBeVisible();
  return errors;
}

test('first expedition is playable: upgrade, pause, combat completion and save', async ({ page }, testInfo) => {
  const errors = await openGame(page);
  await page.getByTestId('start-button').click();
  await expect.poll(() => page.evaluate(() => window.__DAPROD__.game.phase)).toBe('combat');
  await page.getByTestId('upgrade-damage').click();
  await expect.poll(() => page.evaluate(() => window.__DAPROD__.game.upgrades.damage)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__DAPROD__.game.enemies.length)).toBeGreaterThan(0);
  await page.getByTestId('pause-button').click();
  const pausedTime = await page.evaluate(() => window.__DAPROD__.game.time);
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.__DAPROD__.game.time)).toBe(pausedTime);
  await page.screenshot({ path: testInfo.outputPath('combat.png'), fullPage: true });
  await page.getByTestId('pause-button').click();
  await expect.poll(() => page.evaluate(() => window.__DAPROD__.game.phase), { timeout: 70_000 }).toBe('intermission');
  expect(await page.evaluate(() => window.__DAPROD__.game.bestWave)).toBeGreaterThanOrEqual(1);
  expect(await page.evaluate(() => window.__DAPROD__.game.kills)).toBeGreaterThan(0);
  await page.waitForTimeout(3500);
  await page.reload();
  await page.waitForFunction(() => window.__DAPROD__?.game);
  expect(await page.evaluate(() => window.__DAPROD__.game.upgrades.damage)).toBe(1);
  expect(await page.evaluate(() => window.__DAPROD__.game.bestWave)).toBeGreaterThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('responsive controls equip weapons without double payment or overflow', async ({ page }, testInfo) => {
  const errors = await openGame(page);
  await page.getByTestId('start-button').click();
  // Explicit UI test fixture, not a claim of naturally earned currency.
  await page.evaluate(() => { window.__DAPROD__.game.scrap = 1000; });
  await page.getByTestId('weapon-tesla').click();
  await expect.poll(() => page.evaluate(() => window.__DAPROD__.game.weapon)).toBe('tesla');
  await page.getByTestId('weapon-rail').click();
  await expect.poll(() => page.evaluate(() => window.__DAPROD__.game.weapon)).toBe('rail');
  const scrap = await page.evaluate(() => window.__DAPROD__.game.scrap);
  await page.getByTestId('weapon-tesla').click();
  expect(await page.evaluate(() => window.__DAPROD__.game.scrap)).toBeGreaterThanOrEqual(scrap);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('responsive.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('production build starts offline after initial cache installation', async ({ page, context }) => {
  const errors = await openGame(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => window.__DAPROD__?.game);
  await expect(page.locator('canvas').first()).toBeVisible();
  const begin = page.getByTestId('start-button');
  if (await begin.isVisible()) await begin.click();
  else await page.getByTestId('wave-button').click();
  await expect.poll(() => page.evaluate(() => window.__DAPROD__.game.phase)).toBe('combat');
  expect(errors).toEqual([]);
});

import { test, expect } from '@playwright/test';

test('staggered two-finger pinch cancels a queued touch shot without cancelling single taps', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => window.__DAPROD__?.game?.version === 3);
  await page.getByTestId('start-button').click();
  await page.waitForFunction(() => __DAPROD__.game.phase === 'combat');
  await page.evaluate(() => {
    const g = __DAPROD__.game;
    g.enemies = [];
    g.projectiles = [];
    g.spawnRemaining = 1;
    g.spawnTimer = 999;
    g.cooldown = 10;
    g.lastShot = null;
  });
  const client = await page.context().newCDPSession(page);
  // Exercise real touch/pointer events, including on desktop hybrid devices.
  await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  const first = { x: 110, y: 250, id: 1 };
  const second = { x: 210, y: 250, id: 2 };
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first] });
  // Let the first finger's 110ms intent timer queue a shot behind cooldown.
  await page.waitForFunction(() => __DAPROD__.game.pendingManual !== null);
  expect(await page.evaluate(() => __DAPROD__.game.lastShot)).toBeNull();
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first, second] });
  expect(await page.evaluate(() => __DAPROD__.game.pendingManual)).toBeNull();
  const before = await page.evaluate(() => {
    __DAPROD__.game.cooldown = 0;
    return __DAPROD__.game.time;
  });
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ ...first, x: 80 }, { ...second, x: 240 }],
  });
  await page.waitForFunction((time) => __DAPROD__.game.time > time + 0.15, before);
  expect(await page.evaluate(() => ({ shot: __DAPROD__.game.lastShot, heat: __DAPROD__.game.heat })))
    .toEqual({ shot: null, heat: 0 });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ ...first, x: 80 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => ({
    pending: __DAPROD__.game.pendingManual,
    shot: __DAPROD__.game.lastShot,
    heat: __DAPROD__.game.heat,
    projectiles: __DAPROD__.game.projectiles.length,
  }))).toEqual({ pending: null, shot: null, heat: 0, projectiles: 0 });

  // Ordinary touch release must still preserve a single queued tap.
  await page.evaluate(() => { __DAPROD__.game.cooldown = 10; });
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect(await page.evaluate(() => __DAPROD__.game.pendingManual)).not.toBeNull();
  await page.evaluate(() => { __DAPROD__.game.cooldown = 0; });
  await page.waitForFunction(() => __DAPROD__.game.lastShot?.manual === true);
  expect(await page.evaluate(() => __DAPROD__.game.pendingManual)).toBeNull();
});

test('held manual input repeats shots and release stops without purchasing autofire', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => window.__DAPROD__?.game?.version === 3);
  await page.getByTestId('start-button').click();
  await page.waitForFunction(() => __DAPROD__.game.phase === 'combat');
  await page.evaluate(() => { const g=__DAPROD__.game;g.enemies=[];g.projectiles=[];g.spawnRemaining=1;g.spawnTimer=999;g.cooldown=0;g.lastShot=null; });
  const point=await page.evaluate(()=>({...__DAPROD__.project(10,-10)}));
  await page.mouse.move(point.x,point.y);await page.mouse.down();
  const first=await page.evaluate(()=>__DAPROD__.game.lastShot?.time);
  await expect.poll(()=>page.evaluate(()=>__DAPROD__.game.lastShot?.time),{timeout:12000}).toBeGreaterThan(first+.1);
  await page.mouse.up();const last=await page.evaluate(()=>__DAPROD__.game.lastShot.time);
  await page.waitForTimeout(700);expect(await page.evaluate(()=>__DAPROD__.game.lastShot.time)).toBe(last);
});

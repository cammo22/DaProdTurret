import { test, expect } from '@playwright/test';

async function openGame(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./');
  await expect(page).toHaveTitle(/DaProdTurret/i);
  await page.waitForFunction(
    () => window.__DAPROD__?.game?.version === 3,
    null,
    { timeout: 20_000 },
  );
  await expect(page.locator('#viewport canvas')).toBeVisible();
  return errors;
}
async function start(page) {
  if (await page.getByTestId('start-button').isVisible())
    await page.getByTestId('start-button').click();
  else if (await page.getByTestId('continue-button').isVisible())
    await page.getByTestId('continue-button').click();
  else await page.getByTestId('wave-button').click();
  await expect
    .poll(() => page.evaluate(() => __DAPROD__.game.phase))
    .toBe('combat');
}
async function quiet(page) {
  await page.evaluate(() => {
    const g = __DAPROD__.game;
    g.enemies = [];
    g.projectiles = [];
    g.effects = [];
    g.spawnRemaining = 1;
    g.spawnTimer = 999;
    g.cooldown = 0;
    g.heat = 0;
    g.overheated = false;
    g.overheatTimer = 0;
    g.energy = 100;
    g.lastShot = null;
  });
}
async function workshop(page) {
  await page.evaluate(() => {
    const g = __DAPROD__.game;
    g.spawnRemaining = 0;
    g.enemies = [];
    g.projectiles = [];
    g.cash = 50000;
  });
  await expect(page.locator('#upgrade-dock')).toBeVisible();
}
async function buy(page, id, branch) {
  if (branch) await page.getByTestId(`upgrade-tab-${branch}`).click();
  await page.getByTestId(`skill-${id}`).click();
  await expect(page.getByTestId('buy-skill')).toBeEnabled();
  await page.getByTestId('buy-skill').click();
}

test('manual sea aiming, heat without ammo, default audio and no passive shooting', async ({
  page,
}, info) => {
  const errors = await openGame(page);
  await start(page);
  await quiet(page);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => __DAPROD__.game.lastShot)).toBeNull();
  const point = await page.evaluate(() => ({ ...__DAPROD__.project(10, -10) }));
  await page.mouse.click(point.x, point.y);
  await expect
    .poll(() => page.evaluate(() => __DAPROD__.game.lastShot?.manual))
    .toBe(true);
  const result = await page.evaluate(() => ({
    ...__DAPROD__.game.lastShot,
    heat: __DAPROD__.game.heat,
    energy: __DAPROD__.game.energy,
    ammo: 'ammo' in __DAPROD__.game,
  }));
  expect(result.x).toBeCloseTo(10, 0);
  expect(result.z).toBeCloseTo(-10, 0);
  expect(result.heat).toBeGreaterThan(0);
  expect(result.energy).toBe(100);
  expect(result.ammo).toBe(false);
  expect(await page.evaluate(() => __DAPROD__.muted)).toBe(false);
  await expect(page.getByTestId('upgrades-button')).toBeDisabled();
  await expect(page.locator('#tower-hud')).toBeVisible();
  await expect(page.getByTestId('ability-emp')).toBeHidden();
  await expect(page.getByText(/PUNTI|AMMO|RELOAD|Rifornimento/i)).toHaveCount(
    0,
  );
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= innerWidth + 1 &&
        document.documentElement.scrollHeight <= innerHeight + 1,
    ),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath('manual-combat.png') });
  expect(errors).toEqual([]);
});

test('every wave stops for a real cash skill tree and cannon multishot', async ({
  page,
}, info) => {
  const errors = await openGame(page);
  await start(page);
  await quiet(page);
  await workshop(page);
  const wave = await page.evaluate(() => __DAPROD__.game.wave);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => __DAPROD__.game.wave)).toBe(wave);
  await expect(page.locator('.skill-connector')).not.toHaveCount(0);
  await buy(page, 'cannonDamage', 'cannon');
  await buy(page, 'cannonMultishot');
  expect(
    await page.evaluate(() => __DAPROD__.game.skills.cannonMultishot),
  ).toBe(1);
  await page.screenshot({ path: info.outputPath('skill-tree.png') });
  await start(page);
  await quiet(page);
  const p = await page.evaluate(() => ({ ...__DAPROD__.project(10, -10) }));
  await page.mouse.click(p.x, p.y);
  expect(
    await page.evaluate(
      () =>
        __DAPROD__.game.projectiles.filter(
          (p) =>
            p.kind === 'shell' ||
            p.kind === 'cannon' ||
            p.kind === 'cannon-shell',
        ).length,
    ),
  ).toBeGreaterThanOrEqual(2);
  expect(errors).toEqual([]);
});

test('cash unlocks weapons and abilities; only equipped purchased support can fire', async ({
  page,
}) => {
  const errors = await openGame(page);
  await start(page);
  await quiet(page);
  await workshop(page);
  // Buy prerequisites in their published order, through engine hooks; selection/equip is real UI.
  await page.evaluate(() => {
    const api = __DAPROD__,
      g = api.game;
    function acquire(id) {
      for (const p of api.skillDefinitions[id].parents || [])
        if (!g.skills[p]) acquire(p);
      if (!g.skills[id]) {
        g.cash = 100000;
        api.buy(id);
      }
    }
    for (const id of [
      'unlockTesla',
      'unlockRail',
      'unlockEmp',
      'unlockMissiles',
      'unlockAirstrike',
    ])
      acquire(id);
    for (const id of [...g.loadout]) api.equip(id);
  });
  await page.getByTestId('upgrade-tab-abilities').click();
  await page.getByTestId('skill-unlockEmp').click();
  await page.locator('#equip-skill').click();
  expect(await page.evaluate(() => __DAPROD__.game.loadout)).toEqual(['emp']);
  await page.getByTestId('skill-unlockMissiles').click();
  await expect(page.locator('#equip-skill')).toBeDisabled();
  await page
    .locator('#loadout')
    .getByRole('button', { name: 'Rimuovi EMP', exact: true })
    .click();
  await page.locator('#equip-skill').click();
  expect(await page.evaluate(() => __DAPROD__.game.loadout)).toEqual([
    'missiles',
  ]);
  await start(page);
  await quiet(page);
  await expect(page.getByTestId('weapon-tesla')).toBeVisible();
  await page.getByTestId('weapon-tesla').click();
  expect(await page.evaluate(() => __DAPROD__.game.weapon)).toBe('tesla');
  await page.getByTestId('weapon-rail').click();
  expect(await page.evaluate(() => __DAPROD__.game.weapon)).toBe('rail');
  await page.evaluate(() => {
    const g = __DAPROD__.game;
    g.enemies = [
      {
        id: 9901,
        type: 'boss',
        x: 8,
        z: 2,
        hp: 10000,
        maxHp: 10000,
        speed: 0.2,
        reward: 50,
        attackCooldown: 99,
        attackRange: 12,
        stunnedFor: 0,
        submerged: false,
        diveTimer: 0,
      },
    ];
  });
  await expect(page.locator('#boss-health')).toBeVisible();
  await page.getByTestId('ability-missiles').click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        __DAPROD__.game.projectiles.some(
          (p) => p.kind === 'missile' && p.y > 2,
        ),
      ),
    )
    .toBe(true);
  expect(errors).toEqual([]);
});

test('wheel and pinch change the camera without firing; aim round-trips after zoom', async ({
  page,
}, info) => {
  const errors = await openGame(page);
  await start(page);
  await quiet(page);
  expect(await page.evaluate(() => __DAPROD__.camera.isPerspectiveCamera)).toBe(
    true,
  );
  const before = await page.evaluate(() => __DAPROD__.zoom);
  await page.mouse.move(120, 200);
  await page.mouse.wheel(0, -300);
  await expect
    .poll(() => page.evaluate(() => __DAPROD__.zoom))
    .not.toBe(before);
  const geometry = await page.evaluate(() => {
    const a = { ...__DAPROD__.project(12, -9) };
    return { a, b: { ...__DAPROD__.unproject(a.x, a.y) } };
  });
  expect(geometry.b.x).toBeCloseTo(12, 3);
  expect(geometry.b.z).toBeCloseTo(-9, 3);
  if (info.project.name !== 'desktop') {
    const client = await page.context().newCDPSession(page);
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { x: 110, y: 250, id: 1 },
        { x: 210, y: 250, id: 2 },
      ],
    });
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: 80, y: 250, id: 1 },
        { x: 240, y: 250, id: 2 },
      ],
    });
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await client.detach();
    expect(await page.evaluate(() => __DAPROD__.game.lastShot)).toBeNull();
  }
  await page.locator('#reset-camera').click();
  await expect.poll(() => page.evaluate(() => __DAPROD__.zoom)).toBe(1);
  expect(errors).toEqual([]);
});

test('environment is visible and loss clears purchases but preserves wave record', async ({
  page,
}) => {
  const errors = await openGame(page);
  await start(page);
  await quiet(page);
  await page.evaluate(() => {
    const g = __DAPROD__.game;
    g.environment = {
      type: 'current',
      timeLeft: 30,
      duration: 30,
      dx: 0.7,
      dz: 0.3,
    };
    g.highWave = 9;
    g.hp = 0;
  });
  await expect(page.locator('#defeat')).toBeVisible();
  await expect(page.locator('#high-wave')).toContainText('9');
  await page.getByTestId('restart-button').click();
  const g = await page.evaluate(() => __DAPROD__.game);
  expect(g.highWave).toBeGreaterThanOrEqual(9);
  expect(g.skills.cannonMultishot || 0).toBe(0);
  expect(g.loadout).toEqual([]);
  expect(g.wave).toBe(1);
  for (const old of ['score', 'ammo', 'research']) expect(old in g).toBe(false);
  expect(errors).toEqual([]);
});

test('static production PWA reopens all v3 models offline under the deployment scope', async ({
  page,
  context,
}) => {
  const errors = await openGame(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(
    () => window.__DAPROD__?.game?.version === 3,
    null,
    { timeout: 20000 },
  );
  const assets = await page.evaluate(
    async () =>
      (await __DAPROD__.assetsReady).filter((x) => x.status === 'fulfilled')
        .length,
  );
  expect(assets).toBe(9);
  await start(page);
  expect(errors).toEqual([]);
});

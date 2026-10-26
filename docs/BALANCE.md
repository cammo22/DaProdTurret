# Combat/economy balance — alpha

## Approved slice and design intent

Command an autonomous naval defense platform, buy expedition upgrades, then extract research into the next run. The core verb is choosing a build and focusing dangerous contacts, not repeatedly clicking to fire. Cannon reliability, Tesla crowd control, Railgun alignment and an energy-sharing pulse provide the tactical distinction.

This slice excludes new biomes, consumables, multiplayer, cloud saves and a native Android package. It implements the approved API in `IMPLEMENTATION.md`; rendering and pause/visibility handling belong to the frontend. Permanent progression is deliberately the approved modest damage bonus, not an additional invented prestige system.

## Progression layers

| Resource | Source | Use / reset policy |
| --- | --- | --- |
| Energy | 11/s base; reactor increases regeneration | Tesla, Railgun, pulse; bounded by capacity; resets on extraction |
| Scrap | Start 45; individual ship kills; capped offline salvage | Upgrades and one-time weapon unlocks; reset to 45 on extraction |
| Pending research | Cleared waves only | Extract to bank; failed/incomplete waves award none; recovery extraction banks prior earned research |
| Research | Extraction | Permanent damage factor `1 + sqrt(research) * 0.035`; survives extraction |
| Best wave | Highest fully cleared wave | Permanent record and offline eligibility; never marks an interrupted wave complete |

Targeting is automatic, priority-selectable (`nearest`, `strongest`, `weakest`). Pointer/touch aim overrides priority by selecting the ship closest to the focus point. Ties use stable IDs. There is no manual-fire advantage or repetitive clicking requirement. Auto-wave waits three seconds after completion; manual next-wave can start immediately.

## Initial pacing hypotheses

- Buy the first damage upgrade immediately (35 of the starting 45 scrap), or save for another build. First wave must also fund an upgrade without requiring that initial purchase.
- First wave around 10–20 combat seconds; first boss around two minutes of combat, excluding shopping/reading.
- Mixed fleets should make offense investment matter around waves 3–5, with extraction viable after the first boss.
- Automation is available from the start; focus targeting and pulse trade tactical control against hands-off play.

These were hypotheses, not claims of measured player enjoyment. The deterministic results below establish feasibility; human playtesting remains necessary.

## Current rules

### Station and upgrades

Base damage 15, fire rate 1.4/s, hull 100, energy capacity 100, energy regeneration 11/s, range 26 (covers all spawn positions). All engine delta times are seconds.

| Upgrade | Base scrap cost | Per-level change |
| --- | ---: | --- |
| Damage | 35 | +24% base damage |
| Rate | 40 | +14% base fire rate |
| Hull | 45 | +28 max HP and +28 immediate HP |
| Reactor | 45 | +16 capacity/current energy, +2.2 regeneration/s |
| Salvage | 40 | +15% kill scrap before per-kill rounding |

Cost is `ceil(baseCost * 1.42 ** level)`, with a 50-level safety ceiling. Damage/rate are scalar offense choices; hull is survivability and immediate repair; reactor enables energy-heavy builds; salvage exchanges early combat power for future economy. Weapon purchases are the early behavioral upgrades.

### Weapons and pulse

| System | Unlock | Damage | Interval | Energy | Role |
| --- | ---: | --- | --- | ---: | --- |
| Cannon | Free | 1x | `1 / fireRate` | 0 | Reliable single-target fire even with an empty reactor |
| Tesla | 100 | 1.05x, multiplied by 0.8 each hop | `1.2 / fireRate` | 13 | Up to four ships; each hop within 6 world units |
| Railgun | 180 | 3.2x to every ship on firing line | `2 / fireRate` | 22 | Heavy hit and piercing; line half-width 1.25 |
| Pulse | Available immediately | 2.2x throughout station range | 12-second cooldown | 60 | Save for crowds or a boss, competing with energy weapons |

Unlock payments happen only once per expedition. Switching unlocked weapons is free and does not reset shot cooldown. Energy weapons wait if they cannot afford a shot; they never borrow energy or silently fall back to Cannon. Upgrading the reactor or switching to Cannon are explicit player choices.

### Fleets and rewards

- Wave population: `min(40, 5 + wave * 2)`. Spawn interval: `max(0.7, 2 - wave * 0.035)` seconds. Deterministic golden-angle approach directions, radius 19–21; stop at radius 3.5.
- Skiffs from wave 1; frigates from wave 3; armored ships from wave 4. Exactly one boss, spawning first, on every fifth wave.
- Enemy HP scale: `(1 + (wave - 1) * 0.11) * 1.035 ** max(0, wave - 8)`.

| Type | Base HP | Speed | Scrap | Contact damage every 2.2s |
| --- | ---: | ---: | ---: | ---: |
| Skiff | 24 | 1.05 | 7 | 5 |
| Frigate | 55 | 0.78 | 13 | 8 |
| Armored | 85 | 0.62 | 20 | 11 |
| Boss | 280 | 0.48 | `90 + wave * 4` | 18 |

Kills are removed and paid immediately exactly once. Only an empty fleet with no remaining spawns completes the wave. Completion restores 18% max HP and 35 energy, capped at station maxima, and grants `ceil(wave / 2)` pending research plus 3 for a boss wave. Defeat never grants completion research.

## Measured deterministic simulations

All runs start with zero research, use the same deterministic fleet sequence, default nearest targeting and `dt = 0.05`. No fabricated saves or free resources are used. Intermission shopping time is excluded.

- **Cannon offense:** initial damage purchase, then repeatedly buy the cheaper damage/rate upgrade before each wave; pulse when three ships or a boss are present.
- **Tesla/reactor:** initial damage purchase; attempt Tesla unlock starting at wave 3 (first affordable at wave 4 with this policy); repeatedly buy the cheapest reactor/damage/rate upgrade; same pulse policy.
- **No upgrades:** default Cannon, no purchases or pulses.

| Strategy | W1 seconds | W3 seconds | W5 seconds/outcome | Combat time through first boss | W10 outcome | W20 outcome |
| --- | ---: | ---: | --- | --- | --- | --- |
| Cannon offense | 12.55 | 20.90 | 26.85, cleared | 99.30s | cleared, 100 HP after heal | cleared, 100 HP after heal |
| Tesla/reactor | 12.55 | 20.90 | 47.35, cleared | 128.15s | cleared, 100 HP after heal | cleared, 100 HP after heal |
| No upgrades | 12.55 | 24.15 | defeat after 36.70s | did not clear boss | — | — |

At wave 5 both investing builds bank 12 pending research and retain positive scrap (336 Cannon / 279 Tesla). Peak concurrent ships on that wave: 4 Cannon / 9 Tesla. With no upgrades, the station fails on wave 5 with 6 pending research from the first four waves and no phantom boss reward.

Interpretation: the opening is forgiving, buying offense materially changes the boss outcome, and both compared builds progress. Cannon offense remains very safe through wave 20; late-game difficulty, Tesla's early efficiency and the subjective pace still need human playtest feedback. These simulations do not establish that every strategy is equally strong or that the game is already fun.

### Reproduce simulations

Run from the project root (Node ESM, no packages/browser/network required):

```sh
node --input-type=module <<'JS'
import * as E from './src/engine.js';
for (const strategy of ['cannon-offense','tesla-reactor','no-upgrades']) {
  const g = E.createGame(0);
  if (strategy !== 'no-upgrades') E.buyUpgrade(g,'damage');
  const rows = [];
  for (let wave=1; wave<=20; wave++) {
    if (strategy==='tesla-reactor' && wave>=3 && !g.unlocked.includes('tesla')) E.setWeapon(g,'tesla');
    const ids = strategy==='cannon-offense' ? ['damage','rate']
      : strategy==='tesla-reactor' ? ['reactor','damage','rate'] : [];
    for (let n=0; ids.length && n<20; n++) {
      const id = [...ids].sort((a,b)=>E.upgradeCost(g,a)-E.upgradeCost(g,b))[0];
      if (!E.buyUpgrade(g,id)) break;
    }
    E.startWave(g);
    const begin = g.time;
    let peak = 0;
    while (g.phase==='combat' && g.time-begin<180) {
      if (strategy!=='no-upgrades' && (g.enemies.length>=3 || g.enemies.some(e=>e.type==='boss'))) E.pulse(g);
      E.tick(g,0.05);
      peak = Math.max(peak,g.enemies.length);
    }
    rows.push({wave,seconds:+(g.time-begin).toFixed(2),hp:g.hp,scrap:g.scrap,phase:g.phase,peak,research:g.pendingResearch});
    if (g.phase!=='intermission') break;
  }
  console.log(JSON.stringify({strategy,rows,upgrades:g.upgrades}));
}
JS
```

## Persistence and simulation safety

- `tick` ignores non-number/nonfinite/negative/zero deltas, subdivides accepted deltas into at most 1/60s steps and processes at most one second per call. Frontend pause/visibility must omit ticks entirely; long browser gaps are not accelerated combat.
- Effects expire by simulated time, are bounded to 160 and have monotonically increasing IDs within the live session, including extraction. Fleet size is bounded to 40.
- Serialization writes only a durable field whitelist. Loading never merges arbitrary keys or restores enemies/effects/aim/spawn counters. Invalid JSON, versions, shapes, cyclic objects, hostile getters and overlarge payloads safely return a new game.
- Numeric values must be finite numbers, not coercible strings. Scrap capped at 1e9, research/pending research 1e6, loaded wave/best wave 1000, loaded upgrades 50. HP and energy are bounded by validated upgrade-derived maxima. These are safety limits, not progression targets.
- An interrupted combat wave rolls back to the preceding cleared wave; the next start retries the interrupted number. Prior acquired scrap/kills persist, but no completion or research reward is invented. Reloading is not anti-cheat protection; local saves are deliberately user-controlled.
- Defeat/zero-HP saves recover via extraction semantics: bank prior pending research, reset expedition, preserve best wave, return `ready`. This avoids a zero-HP soft lock after reload.
- Auto-wave is disabled on load so restoration never unexpectedly starts combat.
- Offline salvage only if `bestWave > 0`: `floor(min(8h, elapsed) / minute * min(bestWave,20))`, hard-capped at 2400 scrap. Negative clock movement/nonfinite timestamps grant zero. Offline awards no kills, waves, HP repair or research. The new timestamp prevents double credit when the returned game is saved normally.
- Offline is intentionally less powerful than live combat: it provides spending money but cannot clear a wave or bank research.

## Verification

`node --test tests/engine.test.js` exercises real simulation, complete first-five-wave progression, exact-once rewards, purchases/unlocks, targeting, chain/piercing/energy/pulse rules, station defeat, extraction, safe save recovery, offline caps, hostile/nonfinite saves and time guards. No frontend or external dependency is involved. RED → GREEN was run vertically for the major gameplay slices, with the complete suite re-run after each implementation.

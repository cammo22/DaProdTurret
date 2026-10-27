# DaProdTurret v0.3 — money, heat and paid skill trees

Player feedback replaces the v0.2 ammunition/scrap/score economy. This document describes the pure engine; browser interaction and visual QA are separate. Deterministic simulation proves feasibility, not human enjoyment or finalized late-game balance.

## Run and money rules

- Start: **120 HP, 100 energy, $60, zero heat**, Cannon only, no abilities equipped, one available ability slot. Manual firing is mandatory until the paid Autofire node is bought.
- `cash` is spendable money. `earnedMoney` is gross money earned this run: purchases never reduce it, and the starting $60 is not earnings. `bestEarnings` is the highest gross run earnings; `highWave` is the highest **completed** wave. Records provide no combat bonus.
- No ammunition, reload, score, scrap, research, ascension, collectible crates or offline income. `events` remains an empty compatibility array, never an economy source.
- Surface/underwater enemy kills pay their listed money reward once. A skiff that rams the station pays **nothing**, increments neither kills nor waveKills, and cannot fire a ranged shot. A wave with no actual kills grants no completion money or repair, preventing suicide-only farming.
- Every wave clear enters `phase='upgrade'`. Completion money is $12 + $3 × wave if at least one enemy was killed; it also repairs 12% max HP and restores 20 energy. Completion waits for remaining enemies, hostile projectiles, aircraft and bombs. A simultaneous final kill and lethal incoming hit is defeat, never a victory.
- `autoWave` is always false: no elapsed timer starts another wave. `startWave()` is the only progression action. Shopping and ability equip/toggle are allowed in ready/intermission/upgrade, never combat or defeat.
- Defeat ends the run, empties cash, skills, loadout and active combat objects. `restartGame()` preserves only record wave, record earnings and the save timestamp, then starts a fresh run.

## Weapons and heat

| Weapon | Cash unlock | Base damage | Fire rate | Behavior | Heat per trigger |
|---|---:|---:|---:|---|---:|
| Cannon | Free | 20 | 2.4/s | Traveling shells with swept segment collision | 20 |
| Tesla | $180 | 30 | 1.7/s | Initial directed orb, sequential ricochets, damage ×0.82 per hop | 23 |
| Railgun | $280 | 110 | 0.85/s after charge | 0.85 s locked-direction charge; initially 3 pierced ships | 38 |

There are **no wave gates**. Records, cached `unlocked` arrays and current wave cannot authorize a weapon; paid skill ownership does. Changing weapon preserves cooldown and thermal state, and is blocked during an active Rail charge.

`manualFire(game,x,z)` fires at literal sea coordinates, including empty water and distant visible water (numeric safety radius 150). Calls behind cooldown/charge replace one queued manual aim, rather than accumulating a burst. `game.aim` alone is not a trigger before Autofire. After buying Autofire, the engine fires at valid held aim or automatically acquires according to nearest/strongest/weakest priority. Normal acquisition range is 26. Recent manual orientation is retained through `lastShot` for the renderer.

- Base heat capacity 100; passive idle dissipation 24 heat/s. Cannon Capacity adds 20 capacity/level; Cannon Cooling adds 4 heat/s/level. The shared thermal upgrades apply to all weapons.
- A trigger adds heat immediately. Cooling is continuous between shots; Rail charge does not passively cool. Normal fire cooldown and thermal recovery are separate clocks.
- Reaching capacity allows that triggering shot, then forces a **4 s cooling lockout**. Heat falls toward zero during the lock, but shooting stays blocked until its timer expires, even if weapon switching or capacity purchases occur. Inputs during overheat return false and do not leave a deferred surprise shot.
- Releasing fire avoids lockout and lets passive cooling work; firing through capacity is intentionally slower than disciplined bursts. Intermission can cool through `tick()` if the host chooses to simulate it; there is no instant heat reset on clear.
- Cannon Multishot adds one **independent real projectile** per level, capped at 5 total. Each has its own ID, spread trajectory, collision and full damage. Heat is charged once per trigger, not per pellet. It is not a cosmetic tracer count or a single damage multiplier.

## Skill tree and abilities

`SKILLS` is the sole authoritative flat tree: each entry supplies `name`, `description`, starting `cost`, `max`, explicit `parents`, `branch` and `kind`. `skillCost()` scales cost by `ceil(base × 1.35^level)` and returns Infinity at cap/for unknown IDs; `buySkill()` checks phase, HP, every parent and cash before debiting. Purchases do not automatically equip an ability.

Required IDs remain stable: `unlockTesla`, `unlockRail`, `unlockEmp`, `unlockMissiles`, `unlockAirstrike`, `autofire`, `slot2`, `slot3`, `cannonDamage`, `cannonRate`, `cannonCooling`, `cannonCapacity`, `cannonMultishot`, `towerHull`, `towerReactor`.

- Cannon roots: Damage $30 (+30% base damage, max20), Rate $40 (+18% base cadence, max12), Cooling $40 (max12), Capacity $45 (max12). Multishot starts at $150, max4, parent Cannon Damage.
- Tower Hull $45, max20: +30 max HP and 30 repair. Tower Reactor $45, max20: +20 capacity/energy on purchase and +2 energy regeneration/s. Base regeneration is 10/s.
- Autofire is an expensive $1500 unlock with **all three** explicit parents Cannon Rate, Cooling and Capacity. It never removes heat restrictions.
- Tesla has paid damage/bounce/range nodes behind `unlockTesla`; Rail has damage/charge/pierce behind `unlockRail`. Tesla maximum ricochets12, Rail maximum pierced targets20. Separate EMP duration, missile damage and bomb damage nodes require the relevant ability unlock.
- Ability unlocks: EMP $90, Missiles $140, Airstrike $240. `loadout` starts empty. `equipAbility()` toggles only owned ability IDs within available slots, and is blocked during combat.
- Slot2 costs $220 and requires EMP ownership. Slot3 costs $420 and requires Slot2, Missiles and Airstrike. Capacity is exactly 1 → 2 → 3, never silently equipping all owned abilities.

| Ability | Energy | Cooldown | Actual engine action |
|---|---:|---:|---|
| EMP | 60 | 12 s | 12 damage and 2.8 s stun in acquisition range, including submerged ships; per-ship stun effects freeze movement, attack and dive clocks |
| Missiles | 45 | 9 s | One assigned 3D missile per live surfaced ship not already reserved by another in-flight missile; no range or wave gate |
| Airstrike | 80 | 18 s | A real 3.6 s plane pass dropping timed gravity bombs along the locked target lane |

Both legacy wrappers (`pulse`, `launchMissiles`) and `useAbility(game,id)` require ownership **and** an equipped slot. Empty missile/airstrike casts do not spend energy. Pool exhaustion refuses a partial missile salvo without spending energy/cooldown.

### Flight/render contract

- Missiles live in `game.projectiles`, `kind='missile'`, with real `x,y,z`, `vx,vy,vz`, `targetId` and `phase`. Initial state is `ascent`, y1.2, vertical speed20, horizontal velocity0; after 0.7 s the engine switches to `dive` and homes in full 3D at speed26. Damage occurs at low-altitude impact, never during ascent. Base damage65, splash radius2.8 plus ship collision radius.
- Reservations cover **all in-flight salvos**, not just one cast. Dead or submerged targets produce `phase='divert'`, `targetId=null`, and harmless expiry after at most0.5 s. No reassignment can steal another missile's target or double-hit a substituted ship.
- The plane is an engine `kind='aircraft'` projectile with `phase='pass'`, y14 and speed20. It flies from targetX−36 to targetX+36 at the locked targetZ. The matching `aircraft` effect carries the same endpoints and duration for renderer model animation; render that effect as the plane rather than adding a second generic shell visual for the carrier projectile.
- Within ±12 units of the strike center, it drops `kind='bomb'`, `phase='fall'` projectiles every0.25 s. They expose real y/vy, fall under gravity18 and deal base95 area damage only on sea impact (radius4 plus ship collision radius). Each bomb damages all eligible ships in that area, not a fake beam at ability activation.
- Effects retain old `id,kind,x,z,tx,tz,ttl,maxTtl` fields. Additional kinds include `ram`, `aircraft`, `bomb`, `lightning` and `overheat`.

## Fleet and deterministic environmental hazards

Fleet size is min(40,6+wave), spawn gap max(0.45,1.05−0.009×wave). First spawn is on the first simulation step, at radius19–23: it is visible but not already in contact. Skiffs accelerate from speed1.3 toward cap3.6 (+0.28/s), ram for10 contact damage once, and explode. Frigates stand off at12, armored ships10, bosses14 and submarines11; their incoming shells/torpedoes damage only on tower contact. Bosses remain every fifth wave; submarines/armored ships enter from wave4. Submarines cycle2.5 s submerged/4 s surfaced and evade ordinary weapons underwater. EMP also suspends the dive timer.

Wave1 is calm. From wave2, **fog → current → storm** rotates deterministically, each lasting18 combat seconds, then returning to calm. No random rolls or reward objects exist.

- Fog: acquisition and EMP range26 →17; literal manual Cannon/Tesla shots still fly where aimed, rewarding attention rather than silently snapping aim. Rail range follows current acquisition range.
- Current: exposed `dx=0.7`, `dz=0.35` advects non-submerged, non-stunned ships each step before their own propulsion, changing their trajectories and arrival times.
- Storm: passive cooling is multiplied by0.65. Every6 s lightning drains8 reactor energy with a visible effect; it grants no enemy damage, money or free kills.

`game.environment` always has `type,timeLeft,duration,dx,dz`. Timers freeze outside combat. `events` remains empty.

## Save v3 and validation

Version3 whitelists durable run fields and exact skill IDs; transient arrays, cached unlocks, environment, pending inputs and arbitrary object properties are never trusted/restored. JSON parsing is bounded to200000 characters and catches invalid JSON, cycles and throwing getters. Numbers must be finite, in range and correctly typed; integer fields/levels reject fractions. Out-of-range levels reset to0 rather than becoming a free capped upgrade. Missing-parent nodes are pruned repeatedly, loadout is owned-only/deduplicated/slot-bounded, selected weapon must be paid, and prototype keys cannot alter state.

- A shopping save resumes **intermission**, without automatic wave start, offline resources, invented elapsed cooling, or resurrection. Heat and validated cooldown timers persist.
- `startWave()` snapshots durable pre-wave state. Saving during combat uses that checkpoint: reload restores the previous completed wave, purchased build, HP, money and earnings at wave start. It discards partial-wave kills and spending opportunities, preventing reload-farmed kill money. Record counters can still retain genuine record progress. This intentionally restarts an interrupted wave, rather than skipping it or restoring unsafe combat arrays.
- A saved defeat (or zero HP) remains defeat with no surviving purchases/cash.
- v1/v2 import **records only**: old `bestWave` maps to `highWave`, historical `highScore` maps to the record counter `bestEarnings` if no newer record exists. This is preservation of the old numeric record, not a claim that old score was earned currency; it never grants spendable money. Old current wave, ammo, scrap, research and trees are discarded.

Invalid/nonfinite/negative dt is ignored; a long delta is capped to1 s and subdivided into at most1/60 s simulation steps. Bounded pools:40 enemies,256 projectiles,200 effects. Costly casts check capacity before spending. Defeat state does not tick.

## Measured opening feasibility

The engine test `earned-money-only manual opening` runs at dt0.05, buys affordable Cannon Damage, Cannon Cooling, Tower Hull in that order before each wave, manually aims at the nearest surfaced ship, and withholds fire unless the next shot leaves at least1 heat below capacity. It uses only the initial $60 and genuine earnings, never Autofire or injected resources. Shopping time is excluded. All enemies are killed, with zero overheat lockouts.

| Wave | Combat seconds | HP after clear | Cash after purchases + clear | Gross earnings |
|---|---:|---:|---:|---:|
| 1 | 6.85 | 120 | $108 | $78 |
| 2 | 7.85 | 120 | $131 | $182 |
| 3 | 8.85 | 120 | $138 | $298 |
| 4 | 20.50 | 144 | $197 | $476 |
| 5 | 14.50 | 150 | $330 | $782 |

A separate no-purchase wave1 simulation also killed all7 ships: disciplined manual fire10.45 s, zero lockouts; indiscriminate manual fire11.10 s, one lockout. Both ended with120 HP and$138. These scripts have perfect aim and no input latency; they do **not** establish human difficulty or equally viable late-game weapon builds. The longer wave4 exposes underwater-target downtime and deserves player feedback.

## Verification

Implemented through observed failing tests before production slices, then rerun to green. `node --test tests/engine.test.js`: **30 passed**. At integration verification, `npm test`: **50 passed**, including engine, fleet/camera/flight poses, local assets, UI and PWA contracts. Tests retain coverage for literal shots, swept collision, queued aim, Tesla hops, Rail charge/pierce, EMP clocks, ranged contact damage, submarine dive cycles, defeat ordering and hostile saves while replacing superseded ammo/wave-lock/pickup expectations with the v3 rules. No browser end-to-end claim is made by these engine tests.

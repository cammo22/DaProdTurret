# DaProdTurret v0.2 — combat, resources and verification

This replaces the v0.1 research/prestige economy. Player feedback is authoritative: fullscreen game, automatic support fire with literal manual aim, ammunition, visible ability effects and run loss. Fun and late-game balance still require player feedback; passing tests is not evidence of satisfaction.

## Resource and reset rules

- Start:120 HP,100 energy,36 ammunition,60 scrap. Only highscore/best completed wave persist between runs. They grant no combat bonus.
- Weapon fire costs ammunition, never energy. Cannon1 round, Tesla2, Rail4. Magazines automatically reload from unlimited reserve, with visible reload time. Changing weapon cannot reset cooldown/charge/reload.
- Energy regenerates10/s, increased2/s per reactor level; capacity100+20/level. EMP60 energy,12s cooldown; missiles45 energy,9s cooldown.
- EMP deals12 damage and stuns movement and attack clocks for2.8s, increased by reactor up to4.8s. Renderer shows per-ship electric arcs as well as the expanding pulse.
- Missiles launch3 homing projectiles, increasing to6 with reactor levels; each has65+5×reactor damage and splash radius2.8 plus the target's collision radius. Missiles require a live surfaced target.
- Scrap from destroyed ships and completed waves funds run-local upgrades. Losing clears scrap and upgrades. No research, extraction, resurrection or offline income exists.

## Weapons

| Weapon | Unlock in current run | Base damage | Base fire rate | Additional behavior |
|---|---:|---:|---:|---|
| Cannon |1|20|2.4/s|Traveling shell, segment collision, literal empty-water endpoint|
| Tesla |25|30|1.7/s|Traveling initial orb then sequential ricochets, damage×0.82 per hop|
| Railgun |50|110|0.85/s|0.85s charge followed by a heavy beam, initially3 pierced targets|

Manual clicks queue one exact coordinate behind existing cooldown or reload. Holding aims continuously; release resumes automatic targeting. Recent manual shots retain visual gun orientation briefly so a quick tap does not fire a correct projectile from a wrongly oriented barrel. Manual sea coordinates are bounded for numeric safety, not snapped to the nearest enemy. Automatic acquisition range26; spawns radius19–23.

Weapon trees: Cannon damage/rate/magazine; Tesla damage/bounces/range; Rail damage/charge/pierce. Costs scale1.25^level, bounded to50 levels. General hull/reactor/salvage costs scale1.28^level. Hull repairs30 and adds30 maxHP; salvage adds18% kill scrap per level. Tesla/Rail eligibility derives from current-run wave, not record or a paid early unlock.

## Waves, enemies and sea events

- Fleet size min(40,6+wave); spawn gap max(0.45,1.05−wave×0.009). Waves advance automatically after2s unless disabled in-game.
- Every completed tenth wave enters mandatory `upgrade` and will not advance without Continue, even with auto-wave enabled.
- Boss every5th wave. Ranged frigates stand off at12 units; armor10, boss14, submarines11. Incoming projectiles damage the station on contact, not at launch.
- Submarines alternate2.5s submerged /4s surfaced after their initial timer, are untargetable underwater, and launch visible torpedoes. EMP suspends movement, firing and dive clocks.
- Supply event starts at wave2; further events every3 waves rotate repair/ammo/salvage/supply. They are actual buoy/crate world objects with touch targets and one-time rewards, expiring after28s. They are not decorative counters.
- Completion waits for both the fleet and remaining hostile projectiles. Simultaneous final kill and lethal incoming hit is defeat, not a phantom wave victory.

## Persistence and safety

Save version2 whitelists durable state. No enemies, projectile arrays, effects or events are restored from user-controlled JSON. Invalid JSON, oversized payloads, hostile getters/cycles, prototype keys and nonfinite numeric values cannot inject shape or power. Data is clamped against validated stats and level caps. Interrupted combat rolls back to the previous completed wave; no victory is invented. A saved defeat remains defeat. Legacy v1 data preserves record only, never research or upgrades. Reload does not produce elapsed-time income.

Simulation dt is seconds, invalid/negative/nonfinite dt is ignored, and long deltas are bounded and subdivided. The frontend omits simulation while hidden/paused/in upgrades. Bounded pools:40 enemies,256 engine projectiles,200 effects,8 sea events. Browser visual pools are separately bounded and reused.

## Measured feasibility, not player enjoyment

A deterministic `dt=0.05` run bought the cheapest available current-weapon or tower upgrade before each wave, collected sea events, used missiles on bosses/crowds and EMP on crowds. It used only earned resources, no injected free money. Shopping time is excluded.

| Strategy | Wave1 | Wave5 | Wave10 | Wave25 | Wave50 |
|---|---|---|---|---|---|
| Remain on Cannon |8.45s,120HP|14.05s,150HP|15.15s, mandatory stop|25.35s,480HP|25.00s, mandatory stop,660HP|
| Switch immediately at25/50, after spending money on previous weapon |8.45s|14.05s|mandatory stop|34.40s, Tesla,470HP|defeat after45.82s with newly unlocked, unupgraded Rail|

The latter exposes a real balance caveat: a newly unlocked weapon is not automatically stronger than a heavily upgraded previous one. Do not describe all builds as equally strong or the late game as finalized. Accuracy, target selection, projectile dodging/stun timing and saving funds for a new tree still need human playtests.

## Automated verification

`npm test` checks real engine behavior plus structural UI/asset contracts. `npm run test:e2e` exercises direct manual pointer shots, no-energy ammunition consumption, default audio, in-game upgrade pause/purchases, boss HP, stun, real missile objects,25/50 eligibility, ten-wave stops, defeat reset/highscore, collectible world events and full offline reload. Projects cover desktop, Android-emulated portrait and mobile landscape. Fixtures for specific wave/UI boundaries are explicitly marked as fixtures, not natural playthroughs or measured player performance.

See `docs/REFERENCE.md` for verified original Aqua Turret content and remaining non-parity. See `docs/ASSETS.md` for actual Meshy task receipts, geometry and texture preparation.

# Implementation

The active player contract is [REVISION-V03.md](REVISION-V03.md). Older contracts are historical and must not reintroduce ammo, scores, random pickups, wave25/50 locks or initially free autofire.

- Runtime: pure deterministic engine in `src/engine.js`; frontend commands, rendering and gesture handling do not own damage, rewards, heat, skill eligibility or target assignment.
- Manual fire preserves literal sea-plane coordinates through perspective projection and zoom. Pinch/wheel must never generate combat shots.
- Every completed wave stops for preparation. Buying and loadout changes are illegal during combat/defeat, even if a caller bypasses the UI.
- Cash is the one spendable currency. Weapon/ability purchases, prerequisites and slot count are explicit skills. All parent links in the UI represent real engine requirements.
- Heat replaces ammunition. Normal cooling rewards burst timing; reaching capacity imposes longer recovery rather than a disguised magazine refill.
- Small boats ram, never fire ranged shots or grant a kill reward for suicide. Incoming projectiles retain collision and stun rules.
- Missiles must rise then dive and never share a live target ID. Bombardment uses an aircraft pass and timed area-impact bombs, not an instant fake beam.
- Environmental events have both a visual path and an applied engine modifier. No random collectible fallback.
- Persistent records grant no permanent combat bonus. Legacy saves keep only compatible record data, never stale mechanics.
- Secrets stay in private tooling only, never under public assets, Vite env, save files or GitHub workflow.
- Build remains static and subpath-compatible; verify actual offline reload and models, not just service-worker registration.
- Apply Hallmark as an app/game surface, not marketing anatomy: role tokens, readable states, real controls, visible focus, reduced motion and no fabricated passes. Reference version recorded in `.hallmark/preflight.json`.
- Verification includes engine behavior, actual input, tree purchasing/equipping, every-wave stops, heat lockout, camera round-trips, environmental modifiers, defeat reset, mobile layout and production offline reopening.

# Implementation

The active contract is [REVISION-V02.md](REVISION-V02.md).

The v0.1 contract is preserved in git at commit `2db599d9051f4761fe8f60df8a062625146047ac`. Its dashboard, nearest-enemy-only focus, research/prestige, early weapon purchases and energy-funded weapon shots were explicitly rejected by the player. Do not restore them when modifying v0.2.

- Runtime: pure deterministic engine in `src/engine.js`, browser/Three.js rendering in the frontend.
- Rendering is never authoritative for rewards or damage.
- Player input must preserve literal world coordinates for manual fire.
- Persistent records grant no permanent combat bonus.
- Secrets belong only in the private tooling environment, never under public assets or Vite client env variables.
- Build is static and relative-path compatible with GitHub Pages and offline PWA.
- Verification must include direct input, meaningful ability effects,10/25/50 wave boundaries, defeat reset and mobile viewport fit.

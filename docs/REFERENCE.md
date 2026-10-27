# Aqua Turret — verified reference and v0.2 boundaries

This is research for an Aqua Turret-inspired revision, **not evidence of a complete 1:1 recreation**. Different archived builds exist: Flash Museum identifies v1.02; the independently archived SWF text at SWFchan says v1.03; the SWF currently linked by Y8 contains `AquaTurret-V1.09`. Details below identify their source rather than merging all versions into an invented specification.

## Sources actually retrieved

1. **Y8 original game listing:** https://www.y8.com/games/aqua_turret
   - Actual page text: “Destroy entire waves of war boats with your turret. How long can you survive?”
   - Added “01 Dec 2008”; tags include `Upgrade`, `Mouse Skill`, `Shoot 'Em Up`.
   - HTML controls explicitly map **Space → Primary Weapon**, **1/2/3/4 → Specials**, **left mouse → Aim/Shoot**. The HTML icon class names were inspected, not only flattened text.
   - Its currently linked original SWF: https://img.y8.com/cloud/y8-flash-game/contents/item_versions/flash_games/8784/original/aqua_turret.swf?1521318285
   - Downloaded for private inspection only; compressed-file SHA-256: `6d9c60fd4494f28554c6f69854f9f03c71f902ed18a6cc9210de02d76f2a76e4`. No original game binary or art was copied into this project.
2. **Flash Museum:** https://flashmuseum.net/game/aqua-turret-8cx/
   - Actual text: “Released: 2008”, “Publishers: Agame.com”, “Play Mode: Single Player”, version `1.02`, release `2008-12-01`; source points to Y8.
   - Actual archived gameplay screenshot inspected: https://flashmuseum.net/wp-content/uploads/images/game-screenshot/a/aqua-turret-screenshot-8cx.webp
   - Screenshot visibly shows a central turret, two approaching boats with individual red health bars, turret status bars, `SCORE`, `MONEY`, `LEVEL`, numbered special buttons 1–4, sound icon and `PAUSE`. It is an overhead 2D sea battlefield, not a dashboard or idle-management screen.
3. **SWFchan archived game text and decompiled ActionScript:** https://swfchan.com/10/48385/info.shtml?Aqua+Turret.swf=
   - Public text and code were retrieved directly. This is an independently archived **v1.03** build, not a claim about every build. Relevant class/function identifiers below make the findings reproducible.
4. **GirlGames instructions:** https://www.girlgames.com/aqua-turret.html
   - Actual text: “Destroy entire waves of war boats and subs with your turret.”
   - “use the mouse to move your turret”; “click to fire the primary weapon”; “hold the spacebar down to charge the secondary weapon”; “upgrade your turret between waves”.
   - **Important discrepancy:** its primary/secondary naming is opposite to Y8 and the actual ActionScript class names. The input behavior is corroborated, but this wording must not be used to assert that the original charged Space weapon is named “secondary”.

## Verified gameplay, with evidence level

| Feature | Finding | Evidence |
|---|---|---|
| Core loop | Defend one stationary sea turret against successive waves; survive and accumulate score/money. | Y8 description; Museum screenshot; archived tutorial text “SURVIVE AS MANY WAVES AS POSSIBLE BY DESTROYING ALL ENEMIES.” |
| Manual aim | Mouse aim; left-button fire and a separate Space weapon. | Y8 control icons; archived tutorial “USE THE MOUSE TO AIM”; `TurretPrimaryWeapon` and `TurretSecondaryWeapon`. |
| Charged attack | In archived code, **Space holds charge/range and release fires the primary weapon**, then cooldown. The mouse-controlled secondary armament is separate. | `TurretPrimaryWeapon.startShot`: Space starts `weaponRange.modify(3)`; `stopShot`: Space release calls `addNewMissile()` and sets `ifCooling`; Y8 Space → Primary. |
| Boats | Small, medium and big ships are distinct enemy classes. Small ships can collide with/damage the turret; this is not proof all ships only ram. | `SmallShip`, `MediumShip`, `BigShip`; `SmallShip.enterFrame` proximity damage. |
| Enemy ranged fire | Ship cannons launch damaging projectiles toward the turret when within range. | `ShipCannon.getNewBomb` creates `ShipCannonMissile`; missile hit code damages `Player.turrets`. |
| Submarines | Dive/surface behavior, untargetable when fully hidden, surfaced torpedo attacks. | `Submarine.hideOrShow/whenAllHide`, `canBeAttacked`; `SubmarineCannon.getNewBomb` requires `outHideState` and creates `SubmarineTorpedo`. Also GirlGames explicitly mentions subs. |
| Other enemy content | Archived build also contains aircraft carriers/aircraft. | `AircraftCarrier` in wave data, `AirCraft`, `PlaneWeapon`. These are **not** among the eight requested v0.2 actors. |
| Between-wave upgrades | Reinforce/repair turret, independently upgrade primary and secondary weapons, select next-wave weapons, buy specials. | Tutorial text “UPGRADE YOUR WEAPONS TO DO MORE DAMAGE”, “CREATE A STRONGER DEFENSE BY UPGRADING YOUR TURRET”; `Reinforce`, `ChooseWeapon`; labels `REPAIR`, `NEXT WAVE`, `SELECT WEAPON FOR NEXT WAVE`. |
| Weapon progression | Archived data contains five primary and five secondary choices, progressively unlocked. | `Data.primaryWeaponData`, `secondaryWeaponData`, `unlocks`; `ChooseWeapon`. Primary identifiers include Bomb, Rocket, Pulsar, ClusterBomb, MiniNuke; secondary identifiers include MachineGun, HeavyMachineGun, HeatSeeker, Blaze and laser-class code. Exact player-facing localization/each unlock wave not exhaustively verified. |
| Four specials | Air assault; shield described as 20 seconds; EMP disabling enemies; one-use restoration (“Life-Saver”). Number keys 1–4 or buttons trigger these. | Archived tutorial: “REQUEST AN AIR ASSAULT”, “ACTIVATE PROTECTIVE SHIELD(20 SECONDS)”, “DISABLE ALL ENEMIES”, “RESTORE YOUR TURRET ONCE”; `Player.keyboardFun` and `Specials`; corroborating Y8 1–4 controls. |
| Wave rewards | Accuracy is rewarded; end-of-wave screen tracks primary/secondary shots and hits, accuracy, money earned, level/total score. | Archived text “ACCURACY IS REWARDED!” and end-of-wave labels. |
| Modes | **Single-player wave-survival-style gameplay is verified.** No separate campaign, endless toggle, challenge mode or selectable combat difficulty was verified. | Museum `Play Mode: Single Player`; game text and menu classes. `BEST/NORMAL/LOW` belong to **graphics quality**, not proof of difficulty modes (`QualitySound`, pause settings). |

## Gameplay videos located, but not used as fabricated watch evidence

- https://www.youtube.com/watch?v=mLZ1GUaBxlU — search metadata title “Aqua Turret Flash Game”; description identifies a central cannon with side secondary armament.
- https://www.youtube.com/watch?v=VQUHfk-YJoI — “Flash Games #1 - Aqua Turret Longplay Max Level”.
- https://www.youtube.com/watch?v=BKsjMV8jGlY — “aqua turret- unlocking the third weapon”; search description discusses locking missiles and a disabling weapon, but its primary/secondary naming may be inconsistent too.

These videos were located via public search metadata, **not watched end-to-end or frame-verified**. No timestamped gameplay claims are attributed to them. Direct retrieved game text/code and the Museum screenshot are the stronger evidence used here.

## Deliberate v0.2 reinterpretations, not original-content claims

The binding `REVISION-V02.md` takes priority for the new game: automatic fire plus exact-coordinate manual override, magazines/reload from unlimited reserve, Cannon/Tesla/Railgun, Tesla at wave25 and Rail at wave50, periodic ten-wave upgrade stops, energy-funded EMP/missiles, clickable sea events, five-wave boss cadence, mobile support and modern 3D Meshy actors. These rules are user-requested design, **not established original Aqua Turret mechanics**. The eight meshes are newly generated interpretations, not ripped original sprites.

Unknown/unverified: exact original tuning, complete unlock schedule, maximum/final wave and victory conditions across versions, full weapon upgrade caps, any persistence rules, every carrier/plane attack pattern, and any alternate game modes. Do not advertise “same complete content” or “1:1” on the basis of this evidence.

## Retrieval limitations

`web_extract` is unavailable with the configured search-only backend, so source HTML was retrieved with Python stdlib HTTPS and parsed locally. Newgrounds and Play-Games returned HTTP403; no inaccessible page contents were invented. Y8, Museum, GirlGames, SWFchan and the original linked SWF were successfully retrieved.

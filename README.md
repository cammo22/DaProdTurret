# DaProdTurret · v0.2

Naval turret survival di DaProdProduzioni. Gioco 3D browser-first per PC e Android, pubblicabile senza backend su GitHub Pages.

**Gioca:** https://cammo22.github.io/DaProdTurret/

## Combattimento

- La torretta spara automaticamente; **click/touch forza il tiro sulla coordinata indicata**, anche nel mare vuoto. Tieni premuto e trascina per mirare manualmente; rilascia per tornare all'acquisizione automatica.
- Le armi consumano **munizioni**, con caricatore e ricarica automatica. L'energia alimenta EMP e lanciamissili, non i colpi dell'arma principale.
- **EMP:** colpisce e stordisce le navi, bloccando movimento e attacchi per la durata dello stun.
- **Missili:** proiettili guidati con traiettorie, scie e impatto, separati dall'arma principale.
- **Cannone:** proiettili fisici. **Tesla:** rimbalzi elettrici, sblocco all'ondata25. **Railgun:** carica prima del tiro perforante, sblocco all'ondata50.
- Ogni arma ha potenziamenti propri. Le ondate avanzano automaticamente, ma **ogni10 ondate completate il gioco si ferma** per la preparazione.
- Navi leggere, unità corazzate, navi che sparano a distanza, sottomarini/siluri, boss con barra vita ed eventi raccoglibili in mare.

Il campo di gioco occupa lo schermo. Integrità, energia e munizioni sono ancorate sotto la torretta; i potenziamenti si aprono come overlay in-game e fermano il combattimento. Non ci sono sidebar, bussola, ricerca, prestigio o ricompense offline.

**Alla sconfitta la partita finisce.** Si conserva il record, non i potenziamenti della partita precedente. Audio abilitato di default; il browser richiede comunque il primo click/touch per avviare l'audio.

## Piattaforme e salvataggi

Browser moderno con WebGL2. Installazione PWA disponibile nei browser compatibili su HTTPS. Dopo la prima apertura online e il completamento della cache, è possibile riaprire il gioco offline.

Non è un APK nativo, non è sul Play Store e non sostituisce una verifica su un telefono Android fisico. I test browser emulano dimensioni, input touch e interfaccia mobile, non la GPU di ogni telefono.

Salvataggi locali al browser e all'origine. Il salvataggio dell'anteprima `localhost` non passa automaticamente a GitHub Pages. I dati v0.1 vengono migrati solo per conservare il record; ricerca e bonus precedenti non vengono trasferiti. Tempo trascorso offline non produce risorse.

## Sviluppo

Node.js >=22.12 e npm:

```sh
npm ci
npm run dev
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

La cartella `dist/` è il sito statico. Per provarla:

```sh
npm run preview -- --port 4173
```

Non aprire il gioco con `file://`: servilo via HTTP/HTTPS. Per accesso dal telefono sulla stessa rete usa l'indirizzo LAN mostrato da Vite; installazione e cache PWA richiedono HTTPS o localhost.

## Asset e riferimenti

- `public/assets/fleet/manifest.json`: modelli Meshy delle armi e delle classi navali; prompt, task e costo reale documentati dalla pipeline.
- `docs/ASSETS.md`: provenienza, generazione e preparazione degli asset.
- `docs/REFERENCE.md`: ricerca su Aqua Turret e distinzione tra fatti verificati e aspetti non accertati.
- `docs/BALANCE.md`: regole del motore e risultati delle simulazioni, non una dichiarazione di divertimento o bilanciamento perfetto.
- `REVISION-V02.md`: requisiti del playtest che ha guidato la riscrittura.

Nessun asset originale del gioco Flash copiato. La key Meshy resta nell'ambiente privato di generazione: non entra nel gioco, nella build, nei salvataggi o nel workflow GitHub. Le condizioni applicabili agli output Meshy restano quelle dell'account che li ha generati.

## Pubblicazione

Il workflow `.github/workflows/pages.yml` esegue test, build, prove browser e deploy. In Settings → Pages la sorgente è GitHub Actions. Tutti i percorsi e la cache offline supportano il sottopercorso `/DaProdTurret/`.

Dipendenze: Three.js e Vite (MIT), Playwright (Apache-2.0). Copyright DaProdProduzioni. Alpha in sviluppo: il prossimo criterio è il feedback del giocatore, non aggiungere contenuti senza provarli.

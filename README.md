# DaProdTurret v0.3

Difesa navale 3D di DaProdProduzioni per PC e Android, browser-first e senza backend.

**Gioca:** https://cammo22.github.io/DaProdTurret/

## Combattimento

- **Tiro manuale:** click/touch sulla coordinata del mare, tieni premuto per sparare e trascina per mirare. Nessuna acquisizione automatica iniziale: l’autofire è un acquisto avanzato nell’albero.
- **Calore al posto delle munizioni.** Le pause tra le raffiche raffreddano l’arma. Raggiungere il limite causa un blocco più lungo: conviene dosare il fuoco, non tenere sempre premuto.
- **Soldi:** abbatti le navi e completa l’ondata per acquistare potenziamenti, armi e supporti. Nessun punteggio o seconda valuta di rottami.
- **Cannone:** proiettili reali, con multishot acquistabile. **Tesla:** catena di fulmini. **Railgun:** carica e perforazione. Gli sblocchi dipendono da soldi e prerequisiti, non dalle ondate25/50.
- **EMP, missili e bombardamento aereo:** prima acquistali, poi equipaggiali. Inizialmente puoi portare una sola abilità, con secondo e terzo slot acquistabili. L’energia alimenta le abilità, non i colpi principali.
- I missili salgono, poi piombano sulle navi; un solo missile può essere assegnato alla stessa nave in contemporanea.
- Le barche leggere puntano la torre ed esplodono all’impatto. Fregate/corazzate attaccano a distanza, i sottomarini si immergono e lanciano siluri, i boss hanno una barra salute.
- **Eventi ambientali:** nebbia, tempesta e correnti con modificatori effettivi. Nessuna cassa o ricompensa casuale da raccogliere.
- Dopo **ogni ondata** la partita si ferma: scegli cosa comprare e quali abilità portare, poi avvia la successiva.

La camera prospettica è meno verticale e adatta l’inquadratura all’affollamento. Regola lo zoom con rotella o pinch a due dita; il pulsante camera ripristina la distanza automatica. Il pinch non attiva il tiro.

Integrità, energia e calore restano sotto la torretta. L’albero è un overlay sul mare con rami collegati, prerequisiti, prezzi e selezione del carico; nessuna sidebar o schermata marketing. Audio attivo dal primo gesto richiesto dal browser.

**Alla sconfitta la partita finisce:** conservi il record, non acquisti o bonus di combattimento. Niente ricerca, prestigio o risorse offline.

## Comandi

| PC | Azione |
|---|---|
| Click / trascina tenendo premuto | Spara / mira |
| Rotella | Regola camera |
| 1, 2, 3 | Cannone, Tesla, Railgun acquistate |
| Spazio, X, C | Prima, seconda, terza abilità equipaggiata |
| U | Arsenale tra le ondate |
| P / M | Pausa / audio |

Su touch: tocco o trascinamento con un dito per il fuoco, due dita per la camera. I pulsanti in-game attivano le abilità equipaggiate.

## Piattaforme e salvataggi

Browser moderno con WebGL2. Installazione PWA nei browser compatibili su HTTPS. Dopo prima apertura online e completamento cache, la build statica può riaprire offline. L’app non è un APK nativo né una pubblicazione Play Store; Android emulato non verifica la GPU di un telefono fisico.

Salvataggi v3 locali al browser e all’origine; localhost e Pages non condividono i dati. Le vecchie versioni v1/v2 conservano solo i record compatibili, non riportano nel gioco munizioni, ricerca, vecchi punti o sblocchi per ondata. Nessuna ricompensa dal tempo offline.

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

`dist/` è il sito statico, da servire via HTTP/HTTPS, non con `file://`:

```sh
npm run preview -- --port 4173
```

Per accesso dal telefono sulla stessa rete usa l’indirizzo LAN mostrato da Vite. Installazione e cache PWA richiedono HTTPS o localhost.

## Asset e qualità

- `public/assets/fleet/manifest.json` e `docs/ASSETS.md`: Meshy, prompt, task, costi reali e hash. Nessun asset Flash originale copiato.
- `docs/REFERENCE.md`: fonti Aqua Turret e distinzione tra contenuto verificato e parità non ancora raggiunta.
- `docs/BALANCE.md`: regole e simulazioni; nessuna promessa di divertimento o equilibrio perfetto.
- `REVISION-V03.md`: contratto attivo, che sostituisce le decisioni incompatibili della v0.2.
- `.hallmark/preflight.json`: applicazione di [Hallmark](https://github.com/Nutlope/hallmark) alla UI. Token, focus, leggibilità, riduzione movimento e controlli verificabili, non un template di landing page.

La key Meshy resta nell’ambiente privato di generazione e non entra nel gioco, build, salvataggi o workflow. Le condizioni degli output restano quelle dell’account che li ha generati.

## Pubblicazione

`.github/workflows/pages.yml` verifica motore/build/browser e pubblica su GitHub Pages. Percorsi relativi e cache supportano `/DaProdTurret/`. Testare il commit esatto e leggere il risultato del deploy prima di dichiarare aggiornata la versione online.

Dipendenze: Three.js e Vite (MIT), Playwright (Apache-2.0). Copyright DaProdProduzioni.

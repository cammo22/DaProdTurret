# DaProdTurret

Un oceano ostile, una piattaforma modulare e una torretta che cresce con te. Prima alpha giocabile di DaProdProduzioni, ispirata al genere dei naval turret shooter: codice e geometrie originali, senza asset del gioco Flash.

## Piattaforme

- **PC:** browser desktop WebGL2; installazione PWA nei browser compatibili.
- **Android:** browser moderno con WebGL2; Chrome permette l'installazione dalla pagina HTTPS (menu **Installa app / Aggiungi a schermata Home**).
- **GitHub Pages:** build statica senza backend, con percorsi relativi per funzionare anche sotto `/DaProdTurret/`.
- Questa versione **non è un APK nativo**, non è pubblicata sul Play Store e non è ancora validata su dispositivi Android fisici.

## Avvio locale

Richiede Node.js >=22.12 e npm.

```sh
npm ci
npm run dev
```

Apri l'indirizzo mostrato da Vite. Da Android sulla stessa rete usa l'indirizzo LAN del computer con la porta mostrata da Vite. Su HTTP LAN il gioco funziona, ma service worker e installazione PWA richiedono HTTPS (o localhost sul PC).

```sh
npm test
npm run build
npm run preview -- --port 4173
npx playwright install chromium
npm run test:e2e
```

La cartella `dist/` contiene il sito pubblicabile; non aprire `index.html` con `file://`, servilo via HTTP/HTTPS.

## Come giocare

- Avvia la spedizione: la torretta acquisisce e spara automaticamente.
- Tieni premuto sul mare per dare priorità a una zona; rilascia per tornare al puntamento automatico.
- Acquista moduli con i rottami. Sblocca Tesla e Railgun, poi alternali liberamente.
- Scegli la priorità dei bersagli e attiva/disattiva le ondate automatiche.
- Usa l'impulso per alleggerire la pressione; consuma energia e ha un tempo di recupero.
- Estrai i dati per avviare una nuova spedizione con ricerca permanente.
- Tastiera: `1/2/3` armi, `Spazio` impulso, `P` pausa. I controlli a schermo sono disponibili anche su touch.

Il salvataggio è locale al browser e all'origine del sito. Cambiare browser, cancellare i dati o passare da localhost a Pages non trasferisce automaticamente il salvataggio. La progressione offline è limitata ai settori già completati: non avanza ondate o boss. Il bilanciamento è iniziale, da rifinire con playtest.

## PWA e offline

Il service worker viene generato dalla build con la lista reale dei file e una revisione basata sui contenuti. Dopo la prima apertura online e il completamento della cache, il gioco si può riaprire offline. Le cache sono isolate per percorso di pubblicazione. In sviluppo il service worker non viene registrato.

## GitHub Pages

Il workflow `.github/workflows/pages.yml` esegue test, build e deploy. In **Settings → Pages** seleziona **GitHub Actions** come sorgente. Il workflow richiede permessi Pages e identity token; nessun segreto Meshy o altro servizio è necessario per giocare o compilare.

## Asset e credenziali

La base della piattaforma include una mesh generata su Meshy; task, prompt, geometria e consumo sono documentati in `public/assets/provenance.json`. Le parti mobili della torretta e le navi sono procedurali. La key Meshy non è mai distribuita al browser, inclusa nella build o richiesta da GitHub Actions. Gli output Meshy sono soggetti alle condizioni applicabili dell'account che li ha generati.

- Three.js: licenza MIT.
- Vite: licenza MIT.
- Playwright: licenza Apache-2.0.

## Struttura

- `src/engine.js`: simulazione pura e salvataggi, separati dalla grafica.
- `src/main.js`, `src/style.css`: scena 3D e interfaccia responsive.
- `src/meshy-base.js`: caricamento della base generata con fallback procedurale.
- `src/pwa.js`, `scripts/make-sw.js`: installazione e cache offline.
- `tests/`: test automatici; `e2e/`: prove nel browser.
- `docs/BALANCE.md`: note sull'economia e sui primi playtest automatici.

Copyright DaProdProduzioni. Stato: alpha, in sviluppo.

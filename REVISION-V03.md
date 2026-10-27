# Revisione v0.3: tiro manuale, calore e acquisti

La richiesta di Cammo del 2026-10-27 sostituisce le regole incompatibili della v0.2.

## Criteri di consegna
- [x] Niente raccolte casuali; eventi ambientali riconoscibili con effetti sul combattimento.
- [x] Skiff kamikaze: puntano la torre, accelerano e causano una sola esplosione da contatto.
- [x] Solo soldi, niente punteggio/rottami e niente sblocchi Tesla25/Railgun50.
- [x] Albero reale: rami, prerequisiti, prezzi, livelli e stato leggibili.
- [x] Cannone manuale di base; automazione acquistabile solo nel ramo avanzato.
- [x] Calore: si raffredda senza sparare; saturazione causa blocco prolungato, nessun caricatore.
- [x] Multishot Cannone: ogni acquisto aggiunge un proiettile reale.
- [x] Tesla Meshy rigenerata e provata nel gioco, non solo nella miniatura.
- [x] Missili con salita e picchiata; massimo un missile assegnato alla stessa nave in volo.
- [x] Camera più bassa, auto-inquadratura con affollamento, rotella/pinch, coordinate di tiro corrette.
- [x] Preparazione dopo ogni ondata; abilità acquistate e carico iniziale da un solo slot.
- [x] Secondo/terzo slot acquistabili; EMP, missili e bombardamento aereo effettivi.
- [x] Migrazione salvataggi v1/v2 sicura e persistenza v3; audio/PWA/offline conservati.
- [x] Test Node, browser desktop/Android emulato/landscape e review indipendente verificati.

**Gate di pubblicazione:** il deploy non è considerato concluso finché il workflow `pages.yml` sul commit esatto e lo smoke online non riescono. Il risultato verificabile è nella pagina Actions del repository; non anticipare la dichiarazione di release da una sola build locale.

## Hallmark
Fonte: https://github.com/Nutlope/hallmark/tree/6033bab2a8051b5454552d2e8e6cb8f27c483a42 .
Il catalogo ha restituito skipped, quindi non è dichiarata un’installazione globale. SKILL.md, Floor, redesign, flow/app-scope e gates letti dalla fonte ufficiale; tooling isolato nella cache scratch. La UI usa il sistema navale esistente, token di ruolo, focus immediato, target tattili, niente tracked capitals, niente punteggi o claim inventati. Nessuna nuova pagina marketing né temi casuali sul gameplay.

## File e proprietà
Nessuna cancellazione di file o route. Modifiche a motore, renderer, main, HTML/CSS; nuovi token, asset Tesla/bomber e test di comportamento. La grafica dei collegamenti nell’albero rappresenta prerequisiti realmente applicati, non una decorazione.

## Crediti
Limite di produzione di questa iterazione:40 nuovi crediti. Spesa effettiva verificata sui quattro task esatti: **30 crediti** (due preview da5, due refine PBR da10), per nuova Tesla e bombardiere. Hash e caricamento dei due GLB verificati anche dal parent; attori Meshy effettivi `tesla` e `bomber` nella scena di gioco. Task e provenienza in docs/ASSETS.md e manifesto.

## Verifiche di integrazione
- 52 test Node superati.
- 21 test browser superati su build di produzione (desktop, Android emulato portrait e landscape); dopo la correzione aggiuntiva dei rami dell’albero, ripetuti e superati i tre scenari acquisti/multishot sulle tre viste.
- Test tiro tenuto premuto osservato RED prima della correzione d’integrazione, poi GREEN.
- Test albero osservati RED per falsi collegamenti attraverso altri nodi, poi GREEN con livelli topologici e percorsi esterni.
- Prima review negativa per gesto a due dita durante cooldown; correzione minimale in main.js che annulla solo il tiro in attesa all’ingresso nel pinch. Regressione reale CDP osservata RED prima e GREEN dopo, con normali tap singoli preservati.52 Node nuovamente superati; re-review indipendente **approvata**, nessun problema di logica/sicurezza residuo. Ripetuti **6/6 controlli input produzione** su desktop, Android emulato e landscape. Pubblicazione vincolata al workflow sul commit esatto e allo smoke online.
- Hallmark statico + render + confronto: **0 FAIL,0 REFLEX,0 WARN**, una dismiss25 motivata, cinque capture reali. Bookkeeping dei target v02/v03 normalizzato senza cambiare fatti o hook osservati.

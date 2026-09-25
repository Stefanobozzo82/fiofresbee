# Fio Fresbee 🐕🥏

Il cane più veloce della spiaggia: prendi i frisbee al volo, evita la ciabatta, sfida gli amici.
Si gioca nel browser e si può installare sul telefono come app (anche offline).

## Struttura

| File | Contenuto |
|---|---|
| `index.html` | pagina e pannelli (HTML) |
| `css/style.css` | stile |
| `js/config.js` | indirizzo e chiave pubblica di Supabase |
| `js/core.js` | canvas, stato, trofei, impostazioni, livelli, razze, sfida del giorno, cosmetici |
| `js/missions.js` | missioni a più passi |
| `js/leaderboard.js` | classifica di sempre e della settimana |
| `js/save.js` | codice per trasferire i progressi tra telefoni |
| `js/pwa.js` | schermo intero, installazione, service worker |
| `js/audio.js` | effetti e musica |
| `js/ui.js` | comandi e pannelli |
| `js/game.js` | partita in singolo (fisica, lanci, prese) |
| `js/render.js` | disegno della scena |
| `js/multiplayer.js` | sfida online a due |
| `js/bot.js` | sfida contro il computer |
| `js/main.js` | ciclo principale a passo fisso (60 passi al secondo su ogni schermo) |
| `sw.js` | service worker (installazione e gioco offline) |
| `supabase/setup.sql` | regole del database |

Quando modifichi i file del gioco, aumenta `VERSION` in `sw.js` così i telefoni scaricano la versione nuova.
Se aggiungi un file JS, aggiungilo anche all'elenco `CORE` in `sw.js`.

## Supabase (da fare una volta)

Apri il progetto Supabase del gioco → **SQL Editor** → incolla il contenuto di `supabase/setup.sql` → **Run**.
Serve per la classifica della settimana, per la protezione della classifica e per i codici di salvataggio.
Senza questo passaggio il gioco funziona lo stesso: si vede solo la classifica di sempre e il codice di salvataggio dà errore.

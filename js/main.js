// Ciclo principale
// ---------- LOOP A PASSO FISSO ----------
// Tutta la logica del gioco (velocità, gravità, timer, durata del turbo...) è pensata "per fotogramma
// a 60fps". Se chiamassimo update() una volta per ogni requestAnimationFrame, su uno schermo a 120Hz
// (iPhone Pro, iPad Pro, molti Android) il gioco andrebbe al doppio della velocità, e a metà su uno a
// 30Hz. Qui invece misuriamo il tempo reale trascorso e facciamo avanzare la logica sempre a passi
// fissi di 1/60 di secondo: lo schermo può ridisegnare quanto vuole, il gioco va sempre alla stessa
// velocità su ogni dispositivo (e i due giocatori della sfida online restano sincronizzati).
const STEP_MS = 1000 / 60;
const MAX_STEPS_PER_FRAME = 5;   // dopo un blocco lungo (scheda in background) non "recuperiamo" secondi interi di gioco
let loopLast = performance.now();
let loopAcc = 0;

// ---- grafica leggera automatica: se il dispositivo fatica davvero (media sotto ~35fps per qualche
// secondo di partita), disattiviamo da soli il filtro pixel-art, a meno che il giocatore non abbia
// già scelto esplicitamente nelle impostazioni ----
let perfSamples = 0, perfTotal = 0;
function watchPerformance(frameMs){
  if (SET.lightGfx !== undefined || state !== 'play' || paused || document.hidden) return;
  if (frameMs > 250) return;   // un singolo intoppo (es. cambio scheda) non conta
  perfSamples++; perfTotal += frameMs;
  if (perfSamples < 240) return;
  const avg = perfTotal / perfSamples;
  perfSamples = 0; perfTotal = 0;
  if (avg > 28){
    SET.lightGfx = true; saveSettings();
    showTrophyMsg('⚡ Grafica leggera attivata per fluidità', 150);
  }
}

function loop(now){
  if (now === undefined) now = performance.now();
  const frameMs = now - loopLast;
  loopLast = now;
  loopAcc = Math.min(loopAcc + frameMs, STEP_MS * MAX_STEPS_PER_FRAME);
  watchPerformance(frameMs);
  while (loopAcc >= STEP_MS){
    if (state === 'mp') mpUpdate(); else update();
    loopAcc -= STEP_MS;
  }
  // almeno un ridisegno per ogni frame dello schermo, anche quando in questo frame non è scattato
  // nessun passo di logica (schermi a 120Hz: un passo ogni due frame)
  if (state === 'mp') mpDraw(); else draw();
  if (!SET.lightGfx) applyPixelFilter();
  requestAnimationFrame(loop);
}
fetchBoard();
requestAnimationFrame(loop);

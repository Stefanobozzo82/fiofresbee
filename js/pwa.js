// Schermo intero, installazione come app, service worker
// ---------- SCHERMO INTERO ----------
const wrap = document.getElementById('wrap');
const isTouch = matchMedia('(pointer:coarse)').matches;
function lockLandscape(){
  try { screen.orientation.lock('landscape').catch(()=>{}); } catch(e){}
}
// fullscreen automatico su mobile (parte dal primo tocco, come richiedono i browser)
function enterFS(){
  if (isFS()) return;
  if (wrap.requestFullscreen){
    const p = wrap.requestFullscreen();
    if (p && p.then) p.then(lockLandscape).catch(simFS); else lockLandscape();
  }
  else if (wrap.webkitRequestFullscreen){ wrap.webkitRequestFullscreen(); lockLandscape(); }
  else simFS();   // iPhone: fullscreen simulato
  syncFSClass();
}
function isFS(){
  return !!(document.fullscreenElement || document.webkitFullscreenElement) || document.body.classList.contains('fs-sim');
}
function toggleFS(){
  if (!isFS()){
    if (wrap.requestFullscreen) wrap.requestFullscreen().catch(()=>simFS());
    else if (wrap.webkitRequestFullscreen) wrap.webkitRequestFullscreen();
    else simFS(); // iPhone: niente API fullscreen → modalità simulata
  } else {
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen();
    else if (document.webkitFullscreenElement && document.webkitExitFullscreen) document.webkitExitFullscreen();
    document.body.classList.remove('fs','fs-sim');
  }
}
function simFS(){
  document.body.classList.add('fs','fs-sim');
  window.scrollTo(0,1);
}
function syncFSClass(){
  const real = !!(document.fullscreenElement || document.webkitFullscreenElement);
  if (real) document.body.classList.add('fs');
  else if (!document.body.classList.contains('fs-sim')) document.body.classList.remove('fs');
  document.getElementById('fsBtn').textContent = isFS() ? '✕' : '⛶';
}
document.addEventListener('fullscreenchange', syncFSClass);
document.addEventListener('webkitfullscreenchange', syncFSClass);
document.getElementById('fsBtn').addEventListener('click', e => { e.stopPropagation(); uiClick(); toggleFS(); syncFSClass(); });

// ---- app installata sulla schermata Home: già a schermo intero, nessun avviso del browser ----
// (l'avviso "trascina dall'alto per uscire" appare solo quando è la pagina a chiedere il fullscreen
// col tasto/tocco; l'app installata invece è già a schermo intero fin dall'avvio, senza quell'avviso)
function isStandalone(){
  return matchMedia('(display-mode: standalone)').matches ||
         matchMedia('(display-mode: fullscreen)').matches ||
         navigator.standalone === true;   // iOS: aperta da "Aggiungi a Home"
}
if (isStandalone()){
  simFS();                                    // applica subito il layout a schermo intero
  document.getElementById('fsBtn').style.display = 'none';   // non serve nessun pulsante
  lockLandscape();
}

// ---- pulsante "installa l'app" (📲 accanto agli altri, appare solo se ha senso mostrarlo) ----
// Su Android/Chrome/Edge il browser stesso ci avvisa quando l'installazione è possibile
// (evento "beforeinstallprompt"): teniamo da parte quell'evento e lo "sparo" al click del pulsante.
// Su iPhone/iPad Safari non esiste questo evento (Apple non lo supporta): mostriamo comunque il
// pulsante se rileviamo iOS/iPadOS, e al click spieghiamo i due tocchi manuali necessari.
let deferredInstallPrompt = null;
function isIOSDevice(){
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
         (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);   // iPadOS 13+ si finge un Mac
}
const installBtn = document.getElementById('installBtn');
let installHelpOpen = false;
function updateInstallBtn(){
  const duringGameplay = (state === 'play' || state === 'mp');
  const installable = !isStandalone() && (!!deferredInstallPrompt || isIOSDevice());
  installBtn.style.display = (!duringGameplay && installable) ? 'block' : 'none';
}
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();          // evitiamo il mini-banner automatico del browser, mostriamo il nostro pulsante
  deferredInstallPrompt = e;
  updateInstallBtn();
});
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  updateInstallBtn();
});
const installHelpBox = document.getElementById('installHelpBox');
const installHelpText = document.getElementById('installHelpText');
function openInstallHelp(){
  installHelpText.innerHTML = isIOSDevice()
    ? 'Su iPhone/iPad tocca <b>📤 Condividi</b> nella barra di Safari, poi <b>“Aggiungi a Home”</b>. L\'icona di Fio Fresbee comparirà tra le tue app, senza barre del browser.'
    : 'Cerca l\'icona di installazione nella barra degli indirizzi, oppure apri il menu del browser (⋮ in alto a destra) e scegli <b>“Installa app”</b> o <b>“Aggiungi a schermata Home”</b>.';
  installHelpBox.style.display = 'block';
  installHelpOpen = true;
}
function closeInstallHelp(){
  installHelpBox.style.display = 'none';
  installHelpOpen = false;
}
document.getElementById('installHelpOk').addEventListener('click', e => { e.stopPropagation(); uiClick(); closeInstallHelp(); });
installBtn.addEventListener('click', async e => {
  e.stopPropagation(); uiClick();
  if (deferredInstallPrompt){
    const promptEvent = deferredInstallPrompt;
    deferredInstallPrompt = null;   // l'evento si può usare una sola volta
    updateInstallBtn();
    try { await promptEvent.prompt(); } catch(err){ openInstallHelp(); }
  } else {
    openInstallHelp();
  }
});
updateInstallBtn();

// service worker: richiesto dai browser (Chrome/Edge/Android) come requisito tecnico per
// considerare il sito "installabile" e far comparire l'evento beforeinstallprompt qui sopra
if ('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  });
}

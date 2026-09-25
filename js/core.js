// Canvas, stato di gioco, trofei, impostazioni, livelli, razze, potenziamenti, sfida del giorno, cosmetici
const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
const W = cv.width, H = cv.height;
const GROUND = H - 90;

// ---------- FILTRO "PIXEL ART" (grafica a 16 bit) ----------
// Tutto il gioco continua a disegnarsi esattamente come prima, alla risoluzione piena (960x540):
// non serve riscrivere ogni forma pixel per pixel. Ad ogni fotogramma, appena disegnato, lo
// rimpiccioliamo alla risoluzione tipica delle vecchie console (320x180, 1/3 dell'originale — con
// interpolazione, così ogni "pixellone" prende un colore medio naturale, non un pixel a caso) e lo
// ridisegniamo subito dopo alla dimensione piena SENZA sfumare: è lì che nascono i blocchetti netti
// tipici della grafica retrò. Un solo filtro applicato all'intero fotogramma invece di ridisegnare
// cane, ostacoli e sfondo uno per uno: stesso identico effetto visivo, molto meno codice e nessun
// rischio di "rompere" le animazioni esistenti.
const PIXEL_SCALE = 2;
const pxSmall = document.createElement('canvas');
pxSmall.width = Math.round(W / PIXEL_SCALE);
pxSmall.height = Math.round(H / PIXEL_SCALE);
const pxSmallCtx = pxSmall.getContext('2d');
function applyPixelFilter(){
  pxSmallCtx.imageSmoothingEnabled = true;
  pxSmallCtx.clearRect(0, 0, pxSmall.width, pxSmall.height);
  pxSmallCtx.drawImage(cv, 0, 0, pxSmall.width, pxSmall.height);
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(pxSmall, 0, 0, W, H);
  ctx.imageSmoothingEnabled = true;
}

// ---------- STATE ----------
let state = 'title'; // title, play, over
let score = 0, best = +(localStorage.getItem('dd_best')||0);
let catches = 0, round = 0, misses = 0, thrown = 0;
let maxMiss = 3;                      // può crescere con le vite extra
let nextLife = 2000;                  // ogni 2000 punti: recuperi un MISS
let streak = 0;                       // prese consecutive → moltiplicatore combo
let gull = null, gullTimer = 500;     // gabbiano dispettoso
let crab = null, crabTimer = 700;     // granchio sulla sabbia
let bone = null, boneTimer = 1000;    // osso turbo
let turbo = 0;                        // frames di turbo rimasti
let turboMax = 480;                   // durata piena dell'ultimo turbo raccolto (per la barra), cresce con lo stat Turbo
const TURBO_TIME = 480;
let lastJumpHeld = false, airJumps = 0;
let newRecord = false, bestAtStart = 0;  // festa del record!
let fwTimer = 0, overT = 0;
let paused = false;
let throwAnim = 0;   // qualche frame di animazione del braccio quando il lanciatore lancia

// ---- effetti camera (scossa sul record e sui colpi) ----
let camShake = 0, camShakeMag = 0;
function triggerShake(mag, dur){ camShake = dur; camShakeMag = mag; }
// ---- dissolvenza tra le schermate (menu / gioco / game over) ----
let transitionAlpha = 1;

// ---- scenografia: delfini e stelle cadenti ----
let dolphins = [], dolphinTimer = 400;
let shooters = [], shooterTimer = 300;

// ---- scenografia extra: temporale vero (nuvole, pioggia, tuoni, fulmini) seguito da un arcobaleno ----
// evento raro, solo di giorno; dura a lungo con un'entrata e un'uscita graduali, non un semplice on/off
const STORM_FADE = 150;                          // frame di dissolvenza in entrata/uscita (~2.5s)
const STORM_HOLD = 1500;                         // frame di temporale pieno (~25s)
const STORM_TOTAL = STORM_FADE*2 + STORM_HOLD;   // durata totale del temporale (~30s)
const RAINBOW_FADE = 90, RAINBOW_HOLD = 360, RAINBOW_TOTAL = RAINBOW_FADE*2 + RAINBOW_HOLD;
function stormIntensity(t){
  if (t < STORM_FADE) return t/STORM_FADE;
  if (t > STORM_TOTAL-STORM_FADE) return Math.max(0, (STORM_TOTAL-t)/STORM_FADE);
  return 1;
}
let weather = null;                 // null oppure {phase:'storm'|'rainbow', t}
let weatherTimer = 1800 + Math.random()*1400;
let stormClouds = [], raindrops = [];
let lightning = 0;                  // frame di flash lampo attivo
let thunderTimer = 0;               // countdown al prossimo tuono/fulmine

// ---- trofei ----
const ACH = [
  { id:'first',  name:'PRIMA PRESA',       desc:'Prendi il tuo primo frisbee' },
  { id:'combo5', name:'COMBO MASSIMA',     desc:'Raggiungi la combo x5' },
  { id:'ten',    name:'10 DI FILA',        desc:'10 prese consecutive senza errori' },
  { id:'gold3',  name:"CACCIATORE D'ORO",  desc:'3 frisbee dorati in una partita' },
  { id:'acro10', name:'ACROBATA',          desc:'10 prese al volo in una partita' },
  { id:'night',  name:'NOTTAMBULO',        desc:'Resisti fino alla notte fonda' },
  { id:'bone3',  name:'TURBO CANE',        desc:'3 ossi presi in una partita' },
  { id:'legend', name:'LEGGENDA',          desc:'10000 punti in una partita' },
  // ---- traguardi a lungo termine (si accumulano partita dopo partita) ----
  { id:'catches_b', name:'APPRENDISTA DEL FRISBEE', desc:'100 prese in totale' },
  { id:'catches_s', name:'ESPERTO DEL FRISBEE',      desc:'500 prese in totale' },
  { id:'catches_g', name:'MAESTRO DEL FRISBEE',      desc:'2000 prese in totale' },
  { id:'games_b',   name:'ABITUDINE',                desc:'10 partite giocate' },
  { id:'games_s',   name:'FEDELISSIMO',               desc:'50 partite giocate' },
  { id:'games_g',   name:'LEGGENDA DI SPIAGGIA',      desc:'200 partite giocate' },
  { id:'gold_b',    name:"COLLEZIONISTA D'ORO",       desc:'20 frisbee dorati in totale' },
  { id:'gold_s',    name:'RE MIDA',                   desc:'100 frisbee dorati in totale' },
  { id:'air_b',     name:'ACROBATA IN ERBA',          desc:'30 prese al volo in totale' },
  { id:'air_s',     name:"FENOMENO DELL'ARIA",        desc:'150 prese al volo in totale' },
  { id:'bones_b',   name:'RACCATTA-OSSA',             desc:'20 ossi turbo in totale' },
  { id:'bones_s',   name:"SCORTA D'EMERGENZA",        desc:'100 ossi turbo in totale' },
  { id:'streak_b',  name:'COSTANTE',                  desc:'Gioca 3 giorni di fila' },
  { id:'streak_s',  name:'SETTIMANA PERFETTA',        desc:'Gioca 7 giorni di fila' },
  { id:'streak_g',  name:'UN MESE DI SPIAGGIA',       desc:'Gioca 30 giorni di fila' },
  { id:'daily_b',   name:'SFIDANTE',                  desc:'Completa 5 sfide del giorno' }
];
let unlocked = [];
try { unlocked = JSON.parse(localStorage.getItem('dd_troph')||'[]'); } catch(e){ unlocked=[]; }
// banner in alto: mostra un messaggio alla volta, mettendo in coda quelli che arrivano mentre uno è già visibile
// (es. salita di livello + sblocco di un nuovo cane nello stesso istante)
let trophyMsg = '', trophyTimer = 0, trophyQueue = [];
function showTrophyMsg(msg, dur){
  if (trophyTimer > 0){ trophyQueue.push({ msg, dur }); return; }
  trophyMsg = msg; trophyTimer = dur;
}

// ---- impostazioni (volume, vibrazione, skin, difficoltà) — persistite in locale ----
let SET = { musicVol:70, sfxVol:80, vibration:true, training:false };
try { SET = Object.assign(SET, JSON.parse(localStorage.getItem('dd_settings')||'{}')); } catch(e){}
function saveSettings(){ localStorage.setItem('dd_settings', JSON.stringify(SET)); }

// ---- livello giocatore: cresce con l'esperienza (punteggio) accumulata in tutte le partite ----
const RANKS = [
  { name:'Cucciolo da Spiaggia',   min:0 },
  { name:'Corridore di Sabbia',    min:2000 },
  { name:'Cacciatore di Frisbee',  min:6000 },
  { name:'Surfista delle Onde',    min:15000 },
  { name:'Campione della Baia',    min:30000 },
  { name:'Eroe della Spiaggia',    min:60000 },
  { name:'Leggenda di Fio',        min:120000 }
];
let totalXP = +(localStorage.getItem('dd_xp')||0);
function rankIndex(xp){
  let idx = 0;
  for (let i=0;i<RANKS.length;i++) if (xp >= RANKS[i].min) idx = i;
  return idx;
}

// ---- razze di cane sbloccabili salendo di livello: ognuna è un piccolo compromesso (mai solo un
// vantaggio, come in Mario Kart), tranne l'ultima che ha un tratto unico invece di semplici numeri
// (alla Brawl Stars) — ispirato ai roster dei giochi più famosi, vedi discussione con l'utente ----
const DOGS = [
  { id:'fio',        name:'Fio',        icon:'🐕', unlockRank:0, tag:'⚖️ EQUILIBRATO',
    colors:{ body:'#b5763a', dark:'#8a5a2a', collar:'#d1342c' },
    speedMul:1, jumpMul:1, luckBonus:0, vitalityBonus:0, turboMul:1, trait:null,
    desc:'Il cane di sempre: equilibrato in tutto.' },
  { id:'saetta',     name:'Saetta',     icon:'🐕', unlockRank:1, tag:'⚡ VELOCISSIMO',
    colors:{ body:'#dcdcdc', dark:'#a9a9a9', collar:'#3fa7ff' },
    speedMul:1.12, jumpMul:1, luckBonus:0, vitalityBonus:-1, turboMul:1, trait:null,
    desc:'Whippet scattante: +12% velocità, ma -1 vita di partenza.' },
  { id:'molla',      name:'Molla',      icon:'🐕', unlockRank:2, tag:'🦘 SALTO ALTO',
    colors:{ body:'#e0a94a', dark:'#b5822e', collar:'#7eff9e' },
    speedMul:0.93, jumpMul:1.18, luckBonus:0, vitalityBonus:0, turboMul:1, trait:null,
    desc:'Corgi con la molla: +18% salto, ma -7% velocità.' },
  { id:'fortunella', name:'Fortunella', icon:'🐕', unlockRank:3, tag:'🍀 FORTUNATA',
    colors:{ body:'#f2d98a', dark:'#c9ac5a', collar:'#ffd23f' },
    speedMul:1, jumpMul:1, luckBonus:0.03, vitalityBonus:0, turboMul:0.8, trait:null,
    desc:'Golden fortunata: +3% frisbee dorati, ma -20% durata turbo.' },
  { id:'roccia',     name:'Roccia',     icon:'🐕', unlockRank:4, tag:'🛡️ RESISTENTE',
    colors:{ body:'#8a8a8a', dark:'#5c5c5c', collar:'#ff5a5a' },
    speedMul:0.9, jumpMul:1, luckBonus:0, vitalityBonus:1, turboMul:1, trait:null,
    desc:'Bulldog corazzato: +1 vita di partenza, ma -10% velocità.' },
  { id:'sprint',     name:'Sprint',     icon:'🐕', unlockRank:5, tag:'🔥 COMBO',
    colors:{ body:'#2b2b2b', dark:'#151515', collar:'#ffffff' },
    speedMul:1, jumpMul:1, luckBonus:0, vitalityBonus:0, turboMul:1, trait:'turboChain',
    desc:'Border Collie instancabile: ogni presa consecutiva ricarica un po\' di turbo.' }
];
let selectedDogId = localStorage.getItem('dd_dog') || 'fio';
if (!DOGS.some(d => d.id === selectedDogId)) selectedDogId = 'fio';
function selectedDog(){ return DOGS.find(d => d.id === selectedDogId) || DOGS[0]; }
function isDogUnlocked(d){ return rankIndex(totalXP) >= d.unlockRank; }
function selectDog(id){
  const d = DOGS.find(x => x.id === id);
  if (!d || !isDogUnlocked(d)) return false;
  selectedDogId = id;
  localStorage.setItem('dd_dog', id);
  return true;
}

// ---- livelli del cane: parametri potenziabili con le ossa raccolte in partita (stile "meta-progressione"
// permanente da roguelike: Rogue Legacy/Dead Cells/Hades — una valuta guadagnata giocando, spesa fra una
// partita e l'altra su bonus permanenti e modesti, che non sostituiscono l'abilità ma la aiutano un po') ----
const DOG_STATS = [
  { id:'speed',    name:'Velocità',   icon:'💨', max:5, effect:'+4% velocità di corsa per livello' },
  { id:'jump',     name:'Salto',      icon:'🦘', max:5, effect:'+3% altezza del salto; al massimo, doppio salto sempre disponibile' },
  { id:'luck',     name:'Fortuna',    icon:'🍀', max:5, effect:'+1% probabilità di frisbee dorato per livello' },
  { id:'vitality', name:'Resistenza', icon:'❤️', max:4, effect:'+1 vita di partenza ogni 2 livelli' },
  { id:'turbo',    name:'Turbo',      icon:'🔥', max:5, effect:'+8% durata del turbo per livello' }
];
function dogStatCost(lvl){ return 3 + lvl*3; }   // ossa richieste per salire dal livello lvl al successivo
// i potenziamenti a ossa ora sono PER RAZZA: ogni cane ha il suo tesoretto di livelli separato,
// quindi potenziare Fio non fa più salire anche gli altri cani — vanno fatti crescere uno per uno.
// Le ossa restano invece un portafoglio unico: si guadagnano giocando con qualsiasi cane e si
// possono spendere su qualsiasi cane (basta averlo selezionato quando si apre "Potenzia").
const DOG_LEVELS_DEFAULT = { speed:0, jump:0, luck:0, vitality:0, turbo:0 };
let dogLevelsByDog = {};
{
  const dogLvlRaw = localStorage.getItem('dd_doglvl_bydog');
  if (dogLvlRaw){
    try { dogLevelsByDog = JSON.parse(dogLvlRaw) || {}; } catch(e){ dogLevelsByDog = {}; }
  } else {
    // migrazione una tantum dal vecchio sistema (un solo set di livelli valido per ogni razza):
    // quei livelli già guadagnati diventano quelli del cane selezionato l'ultima volta, così non
    // si perdono, ma smettono di valere automaticamente per gli altri cani
    try {
      const old = JSON.parse(localStorage.getItem('dd_doglvl')||'{}');
      if (old && Object.keys(old).length) dogLevelsByDog[selectedDogId] = Object.assign({}, DOG_LEVELS_DEFAULT, old);
    } catch(e){}
  }
}
function dogLevelsOf(id){ return dogLevelsByDog[id] || DOG_LEVELS_DEFAULT; }
function curLevels(){
  if (!dogLevelsByDog[selectedDogId]) dogLevelsByDog[selectedDogId] = Object.assign({}, DOG_LEVELS_DEFAULT);
  return dogLevelsByDog[selectedDogId];
}
let dogBones = +(localStorage.getItem('dd_bones')||0);
let roundBonesEarned = 0;
function saveDogProgress(){
  localStorage.setItem('dd_doglvl_bydog', JSON.stringify(dogLevelsByDog));
  localStorage.setItem('dd_bones', dogBones);
}
function dogStatMax(id){ return DOG_STATS.find(s => s.id===id).max; }
function dogUpgradeCost(id){ return dogStatCost(curLevels()[id]); }
function dogCanUpgrade(id){ return curLevels()[id] < dogStatMax(id) && dogBones >= dogUpgradeCost(id); }
function dogUpgrade(id){
  if (!dogCanUpgrade(id)) return false;
  dogBones -= dogUpgradeCost(id);
  curLevels()[id]++;
  saveDogProgress();
  return true;
}
// moltiplicatori/bonus derivati dai livelli del cane ATTIVO (per-razza, vedi dogLevelsByDog sopra)
// più il bonus/malus di base della razza scelta, usati nella fisica di gioco
function dogSpeedMul(){ return selectedDog().speedMul + curLevels().speed*0.04; }
function dogJumpMul(){ return selectedDog().jumpMul + curLevels().jump*0.03; }
function dogLuckBonus(){ return selectedDog().luckBonus + curLevels().luck*0.01; }
function dogVitalityBonus(){ return selectedDog().vitalityBonus + Math.floor(curLevels().vitality/2); }
function dogTurboMul(){ return selectedDog().turboMul + curLevels().turbo*0.08; }

// ---- barre comparative delle razze nel menù di selezione: usano solo il bonus/malus di base
// della razza (senza i potenziamenti a ossa, ora specifici di ciascun cane), così restano un
// confronto stabile tra gli archetipi, come nella scelta del kart in Mario Kart ----
const DOG_STAT_RANGE = (() => {
  const propOf = { speed:'speedMul', jump:'jumpMul', luck:'luckBonus', vitality:'vitalityBonus', turbo:'turboMul' };
  const ranges = {};
  DOG_STATS.forEach(s => {
    const prop = propOf[s.id];
    const vals = DOGS.map(d => d[prop]);
    ranges[s.id] = { prop, min: Math.min(...vals), max: Math.max(...vals) };
  });
  return ranges;
})();
function dogStatBarPct(d, statId){
  const r = DOG_STAT_RANGE[statId];
  const span = r.max - r.min;
  const raw = span > 0 ? (d[r.prop] - r.min) / span * 100 : 50;
  return Math.max(8, Math.min(100, raw));   // minimo visibile: anche il valore più basso resta leggibile
}
// quanto i potenziamenti a ossa DI QUEL CANE (ognuno ha i suoi, vedi dogLevelsByDog sopra)
// allungano la barra oltre al valore "puro" di razza — stessa unità di misura del bonus/malus
// di base usato sopra per il confronto, così il segmento extra si legge sulla stessa scala.
// dogId di default è il cane selezionato; nelle schede del menù si passa quello della scheda.
const DOG_STAT_LEVEL_STEP = { speed:0.04, jump:0.03, luck:0.01, turbo:0.08 };
function dogStatBonusPct(statId, dogId){
  const r = DOG_STAT_RANGE[statId];
  const span = r.max - r.min;
  if (span <= 0) return 0;
  const lv = dogLevelsOf(dogId || selectedDogId);
  const bonusValue = statId === 'vitality' ? Math.floor(lv.vitality/2) : lv[statId] * DOG_STAT_LEVEL_STEP[statId];
  return Math.max(0, bonusValue / span * 100);
}
// un colore diverso per ogni tipo di barra, così il confronto tra le razze si legge a colpo d'occhio
const DOG_STAT_COLOR = { speed:'#3fa7ff', jump:'#7eff9e', luck:'#ffd23f', vitality:'#ff5a5a', turbo:'#ff9d4d' };
function hexToRgba(hex, a){
  const h = hex.replace('#','');
  const n = h.length === 3 ? h.split('').map(c => c+c).join('') : h;
  const r = parseInt(n.slice(0,2),16), g = parseInt(n.slice(2,4),16), b = parseInt(n.slice(4,6),16);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
}

// ---- ritrattino del cane disegnato su un mini-canvas, con i colori della razza — usato nelle
// schede del menù "scegli il tuo cane" al posto di un'emoji generica ----
function drawDogPortrait(canvas, colors, locked, skipCosmetics){
  colors = skipCosmetics ? colors : cosmeticColors(colors);
  const ctx = canvas.getContext('2d');
  const s = canvas.width;   // canvas quadrato
  ctx.clearRect(0,0,s,s);
  ctx.save();
  ctx.translate(s*0.5, s*0.62);
  const k = s/96;   // scala di riferimento su un disegno pensato per 96x96
  ctx.scale(k, k);
  if (locked){ ctx.filter = 'grayscale(1) brightness(0.6)'; ctx.globalAlpha = 0.85; }
  // ombra a terra
  ctx.fillStyle = 'rgba(0,0,0,.22)';
  ctx.beginPath(); ctx.ellipse(0, 26, 25, 5.5, 0, 0, Math.PI*2); ctx.fill();
  // coda
  ctx.strokeStyle = colors.dark; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-20,-8); ctx.quadraticCurveTo(-33,-22,-34,-10); ctx.stroke();
  // zampe
  ctx.fillStyle = colors.dark;
  ctx.fillRect(-17,4,6,17); ctx.fillRect(-6,4,6,17); ctx.fillRect(5,4,6,17); ctx.fillRect(13,4,6,17);
  // corpo
  ctx.fillStyle = colors.body;
  ctx.fillRect(-20,-14,40,20);
  // collarino con medaglietta
  ctx.fillStyle = colors.collar; ctx.fillRect(6,-15,5,19);
  ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(8.5,7,2.6,0,Math.PI*2); ctx.fill();
  // testa
  ctx.fillStyle = colors.body; ctx.fillRect(11,-28,21,18);
  // muso
  ctx.fillStyle = colors.dark; ctx.fillRect(28,-23,10,9);
  ctx.fillStyle = '#222'; ctx.fillRect(35,-23,4,4);
  // orecchio
  ctx.fillStyle = colors.dark; ctx.fillRect(13,-36,8,11);
  // occhio
  ctx.fillStyle = '#222'; ctx.fillRect(22,-24,4,4);
  // accessorio cosmetico equipaggiato (puramente estetico)
  if (!skipCosmetics) drawAccessory(ctx, 'mini');
  ctx.restore();
}
// disegna bandana/cappellino sopra al cane appena disegnato: due set di coordinate distinti,
// uno per il cane grande in campo ('full', drawDog) e uno per il ritratto piccolo ('mini',
// drawDogPortrait) — le due sagome hanno proporzioni diverse, non basta scalare le stesse coordinate
function drawAccessory(ctx, profile){
  if (equip.accessory === 'acc_bandana'){
    ctx.fillStyle = '#ff5a5a';
    if (profile === 'mini'){
      ctx.beginPath(); ctx.moveTo(3,-15); ctx.lineTo(13,-15); ctx.lineTo(7,-8); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(7,-13,1.1,0,Math.PI*2); ctx.fill();
    } else {
      ctx.beginPath(); ctx.moveTo(6,-32); ctx.lineTo(22,-32); ctx.lineTo(11,-20); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(11,-29,1.8,0,Math.PI*2); ctx.fill();
    }
  } else if (equip.accessory === 'acc_cap'){
    ctx.fillStyle = '#8a6bff';
    if (profile === 'mini'){
      ctx.beginPath(); ctx.moveTo(11,-36); ctx.lineTo(21,-36); ctx.lineTo(16,-46); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(16,-46,1.8,0,Math.PI*2); ctx.fill();
    } else {
      ctx.beginPath(); ctx.moveTo(14,-60); ctx.lineTo(30,-60); ctx.lineTo(22,-78); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(22,-78,3,0,Math.PI*2); ctx.fill();
    }
  }
}

// ---- livelli di difficoltà ----
const DIFF = {
  easy:   { spawnMul:1.35, speedMul:0.85, hazardMul:1.45, startLives:4, label:'FACILE' },
  normal: { spawnMul:1,    speedMul:1,    hazardMul:1,    startLives:3, label:'NORMALE' },
  hard:   { spawnMul:0.72, speedMul:1.18, hazardMul:0.68, startLives:3, label:'DIFFICILE' }
};
let difficulty = localStorage.getItem('dd_diff') || 'normal';
if (!DIFF[difficulty]) difficulty = 'normal';
let gameGold = 0, gameAir = 0, gameBones = 0;
function award(id){
  if (unlocked.includes(id)) return;
  unlocked.push(id);
  localStorage.setItem('dd_troph', JSON.stringify(unlocked));
  const a = ACH.find(a => a.id === id);
  showTrophyMsg('🏆 ' + a.name + '!', 150);
  SFX.trophy();
}

// ---- statistiche a vita: si accumulano partita dopo partita (indipendentemente dal cane usato),
// alimentano i trofei "a lungo termine" qui sopra ----
let lifeStats = { catches:0, gold:0, air:0, bones:0, games:0 };
try { lifeStats = Object.assign(lifeStats, JSON.parse(localStorage.getItem('dd_stats')||'{}')); } catch(e){}
function saveLifeStats(){ localStorage.setItem('dd_stats', JSON.stringify(lifeStats)); }
function checkLifeTiers(){
  if (lifeStats.catches >= 100) award('catches_b');
  if (lifeStats.catches >= 500) award('catches_s');
  if (lifeStats.catches >= 2000) award('catches_g');
  if (lifeStats.games >= 10) award('games_b');
  if (lifeStats.games >= 50) award('games_s');
  if (lifeStats.games >= 200) award('games_g');
  if (lifeStats.gold >= 20) award('gold_b');
  if (lifeStats.gold >= 100) award('gold_s');
  if (lifeStats.air >= 30) award('air_b');
  if (lifeStats.air >= 150) award('air_s');
  if (lifeStats.bones >= 20) award('bones_b');
  if (lifeStats.bones >= 100) award('bones_s');
}

// ---- serie di giorni giocati (streak) e sfida del giorno: entrambe ruotano sulla data di
// calendario del dispositivo, non hanno bisogno di internet ----
function todayStr(){
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
// hash semplicissimo e deterministico: stessa data → sempre la stessa sfida su questo dispositivo
function dateHash(s){ let h=0; for (let i=0;i<s.length;i++) h = (h*31 + s.charCodeAt(i)) >>> 0; return h; }

const DAILY_POOL = [
  { id:'gold3',     desc:'Prendi 3 frisbee dorati in una partita', reward:15, check:c => c.gold >= 3 },
  { id:'combo5',    desc:'Raggiungi la combo x5',                  reward:12, check:c => c.mult >= 5 },
  { id:'bone2',     desc:'Prendi 2 ossi turbo in una partita',     reward:12, check:c => c.bones >= 2 },
  { id:'score3000', desc:'Fai almeno 3000 punti in una partita',   reward:15, check:c => c.score >= 3000 },
  { id:'streak8',   desc:'8 prese di fila senza sbagliare',        reward:15, check:c => c.streak >= 8 },
  { id:'air6',      desc:'6 prese al volo in una partita',         reward:12, check:c => c.air >= 6 },
  { id:'night',     desc:'Resisti fino a notte fonda',             reward:18, check:c => c.round >= 9 },
  { id:'catches20', desc:'20 prese in una partita',                reward:14, check:c => c.catches >= 20 }
];
let daily = null;
try { daily = JSON.parse(localStorage.getItem('dd_daily')||'null'); } catch(e){ daily = null; }
function ensureDaily(){
  const t = todayStr();
  if (!daily || daily.date !== t){
    const pick = DAILY_POOL[dateHash(t) % DAILY_POOL.length];
    daily = { date:t, id:pick.id, done:false };
    localStorage.setItem('dd_daily', JSON.stringify(daily));
  }
}
ensureDaily();
function currentDailyChallenge(){ return DAILY_POOL.find(c => c.id === daily.id) || DAILY_POOL[0]; }
let dailyDoneCount = +(localStorage.getItem('dd_dailycount')||0);
// controllata ad ogni frame di gioco: appena i valori correnti della partita in corso soddisfano
// la sfida del giorno, la segna fatta e regala le ossa (una volta sola al giorno)
function checkDaily(c){
  if (SET.training || !daily || daily.done) return;
  const ch = currentDailyChallenge();
  if (!ch.check(c)) return;
  daily.done = true;
  localStorage.setItem('dd_daily', JSON.stringify(daily));
  dogBones += ch.reward; saveDogProgress();
  dailyDoneCount++; localStorage.setItem('dd_dailycount', dailyDoneCount);
  if (dailyDoneCount >= 5) award('daily_b');
  showTrophyMsg(`🎯 Sfida del giorno completata! +${ch.reward} 🦴`, 170);
  SFX.trophy();
}

let playStreak = { count:0, lastDate:'' };
try { playStreak = Object.assign(playStreak, JSON.parse(localStorage.getItem('dd_streak')||'{}')); } catch(e){}
// da chiamare una volta quando si comincia davvero a giocare (non in allenamento): se non avevi
// ancora giocato oggi, la serie sale di uno; se è passato più di un giorno dall'ultima volta,
// la serie ricomincia da uno invece di azzerarsi silenziosamente a metà partita
function bumpPlayStreak(){
  const t = todayStr();
  if (playStreak.lastDate === t) return;
  const prev = new Date(playStreak.lastDate || t);
  const cur = new Date(t);
  const gapDays = playStreak.lastDate ? Math.round((cur - prev) / 86400000) : 1;
  playStreak.count = (gapDays === 1) ? playStreak.count + 1 : 1;
  playStreak.lastDate = t;
  localStorage.setItem('dd_streak', JSON.stringify(playStreak));
  if (playStreak.count >= 3) award('streak_b');
  if (playStreak.count >= 7) award('streak_s');
  if (playStreak.count >= 30) award('streak_g');
}

// ---- cosmetici: puramente visivi (nessun effetto sulle statistiche), sbloccati completando
// trofei specifici, equipaggiabili indipendentemente dalla razza di cane scelta ----
const COSMETICS = [
  { id:'collar_default', type:'collar',    name:'Classico',         unlock:{type:'always'} },
  { id:'collar_red',     type:'collar',    name:'Rosso Fuoco',      color:'#ff5a5a', unlock:{type:'ach', id:'first'} },
  { id:'collar_blue',    type:'collar',    name:'Blu Oceano',       color:'#5a8fd6', unlock:{type:'ach', id:'catches_b'} },
  { id:'collar_green',   type:'collar',    name:'Verde Palma',      color:'#3ddc84', unlock:{type:'ach', id:'games_b'} },
  { id:'collar_gold',    type:'collar',    name:'Oro Zecchino',     color:'#ffd23f', unlock:{type:'ach', id:'gold_b'} },
  { id:'collar_purple',  type:'collar',    name:'Viola Tramonto',   color:'#a06bff', unlock:{type:'ach', id:'bones_s'} },
  { id:'acc_none',       type:'accessory', name:'Nessuno',          unlock:{type:'always'} },
  { id:'acc_bandana',    type:'accessory', name:'Bandana',          unlock:{type:'ach', id:'streak_b'} },
  { id:'acc_cap',        type:'accessory', name:'Cappellino Party', unlock:{type:'ach', id:'legend'} }
];
let equip = { collar:'collar_default', accessory:'acc_none' };
try { equip = Object.assign(equip, JSON.parse(localStorage.getItem('dd_equip')||'{}')); } catch(e){}
function saveEquip(){ localStorage.setItem('dd_equip', JSON.stringify(equip)); }
function isCosmeticUnlocked(item){
  return item.unlock.type === 'always' || unlocked.includes(item.unlock.id);
}
function equipCosmetic(id){
  const item = COSMETICS.find(c => c.id === id);
  if (!item || !isCosmeticUnlocked(item)) return false;
  equip[item.type] = id;
  saveEquip();
  return true;
}
// applica il collare cosmetico equipaggiato ai colori di base della razza (solo per il MIO cane,
// mai per l'avversario nella sfida online)
function cosmeticColors(baseColors){
  const c = COSMETICS.find(x => x.id === equip.collar);
  return (c && c.color) ? Object.assign({}, baseColors, { collar:c.color }) : baseColors;
}

const FW_COLORS = ['#ffd23f','#ff5a5a','#7ec8e3','#7eff9e','#ff9de3'];
function burst(x, y, color){
  for (let i=0;i<26;i++){
    const a = Math.random()*Math.PI*2, sp = 1.5 + Math.random()*3.2;
    particles.push({ x, y, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp-1,
      life: 30+Math.random()*25, color });
  }
}
// stelle per la notte
const stars = [];
for (let i=0;i<45;i++) stars.push({x:Math.random()*W, y:Math.random()*(H-220), tw:Math.random()*6});
let message = '', msgTimer = 0;
let particles = [];
let clouds = [];
for (let i=0;i<4;i++) clouds.push({x:Math.random()*W, y:30+Math.random()*90, s:.5+Math.random()});

// barchette a vela
let boats = [], boatTimer = 0;
function spawnBoat(){
  const dir = Math.random() < 0.5 ? 1 : -1;
  boats.push({
    x: dir > 0 ? -70 : W+70,
    y: GROUND - 34 + Math.random()*24,
    vx: dir * (0.4 + Math.random()*0.7),
    s: 0.6 + Math.random()*0.6,
    hue: Math.floor(Math.random()*360),
    bob: Math.random()*Math.PI*2
  });
}

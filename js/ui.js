// Comandi (tastiera/touch) e pannelli dell'interfaccia
let settingsOpen = false, tutOpen = false, upgradeOpen = false, dogSelectOpen = false;
let mpSearchOpen = false, mpResultOpen = false, trophyOpen = false;
function inputBlocked(){ return nameOpen || settingsOpen || tutOpen || upgradeOpen || dogSelectOpen || mpSearchOpen || mpResultOpen || installHelpOpen || trophyOpen; }

const keys = {};
addEventListener('keydown', e => {
  if (inputBlocked()) return;
  keys[e.code] = true;
  if (e.code === 'Enter') {
    if (state === 'title' || state === 'over') startGame();
  }
  if (e.code === 'KeyP' && state === 'play') paused = !paused;
  if (e.code === 'Escape' && paused && state === 'play') quitToMenu();
  if (e.code === 'Escape' && state === 'mp') mpQuit();
  if (e.code === 'KeyT'){
    if (state === 'title' || state === 'over') openTrophy();
  }
  if (e.code === 'KeyM') musicOn = !musicOn;
  if (e.code === 'KeyF') { toggleFS(); syncFSClass(); }
  if (e.code === 'KeyS' && state === 'over') shareScore();
  if (['Digit1','Numpad1'].includes(e.code) && state === 'title') setDifficulty('easy');
  if (['Digit2','Numpad2'].includes(e.code) && state === 'title') setDifficulty('normal');
  if (['Digit3','Numpad3'].includes(e.code) && state === 'title') setDifficulty('hard');
  if (['Space','ArrowUp','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', e => keys[e.code] = false);

// touch controls
function buzz(){ if (!SET.vibration) return; try { if (navigator.vibrate) navigator.vibrate(15); } catch(e){} }   // solo Android
const bind = (id, code) => {
  const el = document.getElementById(id);
  el.addEventListener('touchstart', e => { e.preventDefault(); keys[code]=true;
    el.classList.add('pressed'); buzz();
    enterFS(); startAmbient();
    if (state!=='play' && state!=='mp' && !inputBlocked()) startGame(); }, {passive:false});
  el.addEventListener('touchend', e => { e.preventDefault(); keys[code]=false; el.classList.remove('pressed'); }, {passive:false});
  el.addEventListener('touchcancel', e => { keys[code]=false; el.classList.remove('pressed'); });
};

// pulsante di salto "flottante": stesso trattamento del joystick qui sotto — tocchi in un
// punto qualsiasi della zona a destra e il pulsante compare lì (non è più fisso in un punto
// preciso). Il salto è on/off, quindi non serve seguire il dito durante il trascinamento:
// il pulsante resta dov'è comparso finché non sollevi il dito.
(function(){
  const zone = document.getElementById('padR');
  const btn = document.getElementById('btnJ');
  const SIZE = 84; // deve combaciare con la larghezza/altezza CSS di .pad button
  let touchId = null;
  function spawnAt(clientX, clientY){
    const zr = zone.getBoundingClientRect();
    const half = SIZE/2;
    const x = Math.max(zr.left+half, Math.min(zr.right-half, clientX));
    const y = Math.max(zr.top+half, Math.min(zr.bottom-half, clientY));
    btn.style.left = (x - zr.left - half) + 'px';
    btn.style.top = (y - zr.top - half) + 'px';
  }
  function findTouch(e){
    for (const t of e.changedTouches) if (t.identifier === touchId) return t;
    return null;
  }
  zone.addEventListener('touchstart', e => {
    e.preventDefault();
    const t = e.changedTouches[0];
    touchId = t.identifier;
    spawnAt(t.clientX, t.clientY);
    keys['Space'] = true;
    btn.classList.add('active', 'pressed');
    buzz(); enterFS(); startAmbient();
    if (state!=='play' && state!=='mp' && !inputBlocked()) startGame();
  }, {passive:false});
  zone.addEventListener('touchmove', e => { if (touchId !== null) e.preventDefault(); }, {passive:false});
  const release = e => {
    if (touchId === null) return;
    if (!findTouch(e)) return;
    touchId = null; keys['Space'] = false;
    btn.classList.remove('active', 'pressed');
  };
  zone.addEventListener('touchend', release, {passive:false});
  zone.addEventListener('touchcancel', release, {passive:false});
})();

// joystick virtuale "flottante": tocchi in un punto qualsiasi della zona a sinistra e il
// joystick compare lì (non è più fisso in un punto preciso). Direzione e distanza dal punto
// di tocco iniziale determinano direzione E velocità (come uno stick analogico).
let joyDir = 0; // -1..1
(function(){
  const zone = document.getElementById('padL');
  const base = document.getElementById('joyBase');
  const knob = document.getElementById('joyKnob');
  const BASE_SIZE = 84; // deve combaciare con la larghezza/altezza CSS di #joyBase
  let touchId = null, cx = 0, radius = BASE_SIZE/2;
  function spawnAt(clientX, clientY){
    const zr = zone.getBoundingClientRect();
    const half = BASE_SIZE/2;
    // il joystick compare centrato sul tocco, ma resta sempre interamente dentro la zona
    const x = Math.max(zr.left+half, Math.min(zr.right-half, clientX));
    const y = Math.max(zr.top+half, Math.min(zr.bottom-half, clientY));
    cx = x; radius = half;
    base.style.left = (x - zr.left - half) + 'px';
    base.style.top = (y - zr.top - half) + 'px';
    knob.style.transform = 'translate(0,0)';
  }
  function applyTouch(t){
    let dx = t.clientX - cx;
    dx = Math.max(-radius, Math.min(radius, dx));
    joyDir = radius > 0 ? dx / radius : 0;
    knob.style.transform = `translate(${dx}px, 0)`;
  }
  function findTouch(e){
    for (const t of e.changedTouches) if (t.identifier === touchId) return t;
    return null;
  }
  zone.addEventListener('touchstart', e => {
    e.preventDefault();
    const t = e.changedTouches[0];
    touchId = t.identifier;
    spawnAt(t.clientX, t.clientY);
    knob.classList.add('dragging');
    base.classList.add('active');
    buzz(); enterFS(); startAmbient();
    if (state!=='play' && state!=='mp' && !inputBlocked()) startGame();
    applyTouch(t);
  }, {passive:false});
  zone.addEventListener('touchmove', e => {
    if (touchId === null) return;
    e.preventDefault();
    const t = findTouch(e);
    if (t) applyTouch(t);
  }, {passive:false});
  const release = e => {
    if (touchId === null) return;
    if (!findTouch(e)) return;
    touchId = null; joyDir = 0;
    knob.classList.remove('dragging');
    knob.style.transform = 'translate(0,0)';
    base.classList.remove('active');
  };
  zone.addEventListener('touchend', release, {passive:false});
  zone.addEventListener('touchcancel', release, {passive:false});
})();

cv.addEventListener('touchstart', e => {
  if (inputBlocked()) return;
  enterFS(); startAmbient();   // su mobile il gioco va a schermo intero da solo
  if (state !== 'play' && state !== 'mp') startGame();
}, {passive:true});
cv.addEventListener('click', () => { audio(); startAmbient(); });

// telefono in verticale: pausa automatica, riprende quando lo ruoti
let autoPaused = false;
function checkOrient(){
  const portrait = matchMedia('(orientation:portrait)').matches;
  if (isTouch && portrait && state === 'play' && !paused){
    paused = true; autoPaused = true;
  } else if (!portrait && autoPaused){
    paused = false; autoPaused = false;
  }
}
addEventListener('resize', checkOrient);
try { matchMedia('(orientation:portrait)').addEventListener('change', checkOrient); } catch(e){}
document.getElementById('trBtn').addEventListener('click', e => {
  e.stopPropagation();
  audio(); startAmbient(); uiClick();
  trophyOpen ? closeTrophy() : openTrophy();
});
// ---------- IMPOSTAZIONI: pannello (volume, vibrazione, difficoltà) ----------
const settingsBox = document.getElementById('settingsBox');
const volMusic = document.getElementById('volMusic');
const volSfx = document.getElementById('volSfx');
const vibToggle = document.getElementById('vibToggle');
const trainToggle = document.getElementById('trainToggle');
const diffBtnRow = document.getElementById('diffBtnRow');

function syncDiffButtons(){
  diffBtnRow.querySelectorAll('.diffBtn').forEach(b => b.classList.toggle('sel', b.dataset.d === difficulty));
}
function setDifficulty(d){
  if (!DIFF[d]) return;
  difficulty = d;
  localStorage.setItem('dd_diff', difficulty);
  syncDiffButtons();
  beep(500,0.06,'square',0.12);
}
diffBtnRow.querySelectorAll('.diffBtn').forEach(b => b.addEventListener('click', () => setDifficulty(b.dataset.d)));

function openSettings(){
  closeDogSelect();
  volMusic.value = SET.musicVol; volSfx.value = SET.sfxVol; vibToggle.checked = SET.vibration;
  trainToggle.checked = SET.training;
  syncDiffButtons();
  settingsBox.style.display = 'block';
  settingsOpen = true;
}
function closeSettings(){ settingsBox.style.display = 'none'; settingsOpen = false; }
document.getElementById('setBtn').addEventListener('click', e => {
  e.stopPropagation();
  audio(); startAmbient(); uiClick();
  settingsOpen ? closeSettings() : openSettings();
});
document.getElementById('settingsOk').addEventListener('click', () => { uiClick(); closeSettings(); });
volMusic.addEventListener('input', () => { SET.musicVol = +volMusic.value; saveSettings(); });
volSfx.addEventListener('input', () => { SET.sfxVol = +volSfx.value; saveSettings(); });
volSfx.addEventListener('change', () => beep(660,0.08,'square',0.15));
vibToggle.addEventListener('change', () => { SET.vibration = vibToggle.checked; saveSettings(); if (SET.vibration) buzz(); });
trainToggle.addEventListener('change', () => { SET.training = trainToggle.checked; saveSettings(); beep(500,0.06,'square',0.12); });

// ---------- MENÙ INIZIALE "SCEGLI IL TUO CANE": scelta della razza (sbloccate salendo di livello),
// con le barre delle abilità di ognuna — si apre da solo appena si torna al titolo, niente osso da premere ----------
const dogSelectBox = document.getElementById('dogSelectBox');
const dogRowEl = document.getElementById('dogSelectRow');
function renderDogRow(){
  dogRowEl.innerHTML = '';
  DOGS.forEach(d => {
    const unlockedDog = isDogUnlocked(d);
    const sel = d.id === selectedDogId;
    const card = document.createElement('div');
    card.className = 'dogCard' + (sel ? ' selected' : '') + (unlockedDog ? '' : ' locked');
    // sfondo sfumato con una leggera tinta del colore della razza, per dare identità a ogni scheda
    card.style.background = 'linear-gradient(160deg, ' + hexToRgba(d.colors.body, unlockedDog ? 0.16 : 0.05) +
      ', rgba(10,10,26,.6))';

    if (sel){
      const check = document.createElement('div');
      check.className = 'dogCheck';
      check.textContent = '✓';
      card.appendChild(check);
    }

    // ritratto in miniatura disegnato coi veri colori della razza, non un'emoji generica
    const medallion = document.createElement('div');
    medallion.className = 'dogMedallion';
    const portrait = document.createElement('canvas');
    portrait.className = 'dogPortrait';
    portrait.width = 112; portrait.height = 112;
    drawDogPortrait(portrait, d.colors, !unlockedDog);
    medallion.appendChild(portrait);
    if (!unlockedDog){
      const lock = document.createElement('div');
      lock.className = 'dogLock';
      lock.textContent = '🔒';
      medallion.appendChild(lock);
    }
    card.appendChild(medallion);

    const bars = DOG_STATS.map(s => {
      const basePct = dogStatBarPct(d, s.id);
      // il tratteggio bianco è il bonus dei potenziamenti a ossa DI QUESTO CANE: ogni razza ha
      // i suoi livelli separati, quindi il segmento cambia scheda per scheda — la parte colorata
      // resta il confronto "puro" tra le razze, invariato
      const dLv = dogLevelsOf(d.id);
      const bonusPct = Math.min(dogStatBonusPct(s.id, d.id), 100 - basePct);
      const bonusHtml = bonusPct > 0.5
        ? '<div class="dogBarBonus" style="left:' + basePct + '%;width:' + bonusPct + '%" title="Bonus dai potenziamenti a ossa di ' + d.name + ' (Lv ' + dLv[s.id] + '/' + s.max + ')"></div>'
        : '';
      return '<div class="dogBarRow"><span class="dogBarIcon">' + s.icon + '</span>' +
        '<div class="dogBarTrack"><div class="dogBarFill" style="width:' + basePct +
          '%;background:' + DOG_STAT_COLOR[s.id] + '"></div>' + bonusHtml + '</div>' +
      '</div>';
    }).join('');
    const body = document.createElement('div');
    body.innerHTML =
      '<div class="dogName">' + d.name + '</div>' +
      '<div class="dogTag" style="background:' + hexToRgba(d.colors.collar, 0.2) + ';color:' + d.colors.collar + '">' +
        d.tag +
      '</div>' +
      '<div class="dogDesc">' + (unlockedDog ? d.desc : ('Livello: ' + RANKS[d.unlockRank].name)) + '</div>' +
      '<div class="dogBars">' + bars + '</div>';
    while (body.firstChild) card.appendChild(body.firstChild);

    if (unlockedDog && !sel){
      card.addEventListener('click', () => {
        selectDog(d.id);
        beep(700,0.08,'square',0.13);
        renderDogRow();
      });
    }
    dogRowEl.appendChild(card);
  });
}
function openDogSelect(){ renderDogRow(); dogSelectBox.style.display = 'block'; dogSelectOpen = true; }
function closeDogSelect(){ dogSelectBox.style.display = 'none'; dogSelectOpen = false; }
document.getElementById('dogSelectPlay').addEventListener('click', e => {
  e.stopPropagation();
  audio(); startAmbient();
  beep(700,0.07,'square',0.14); beep(950,0.09,'square',0.13,0,0.05);   // conferma "si parte!"
  closeDogSelect();
  startGame();
});

// ---------- POTENZIA IL CANE: livelli per-razza (valuta = ossa raccolte in partita, un
// portafoglio unico ma spendibile solo sui livelli del cane attualmente selezionato) ----------
const upgradeBox = document.getElementById('upgradeBox');
const upgradeTitleEl = document.getElementById('upgradeTitle');
const boneCountEl = document.getElementById('boneCount');
const statListEl = document.getElementById('statList');
function renderUpgradePanel(){
  upgradeTitleEl.textContent = '🦴 POTENZIA ' + selectedDog().name.toUpperCase();
  boneCountEl.textContent = dogBones;
  statListEl.innerHTML = '';
  DOG_STATS.forEach(s => {
    const lvl = curLevels()[s.id];
    const maxed = lvl >= s.max;
    const cost = dogUpgradeCost(s.id);
    const afford = dogBones >= cost;
    const row = document.createElement('div');
    row.className = 'statRow';
    row.innerHTML =
      '<div class="statInfo">' +
        '<span class="statIcon">' + s.icon + '</span>' +
        '<div>' +
          '<div class="statName">' + s.name + ' <span class="statLvl">Lv ' + lvl + '/' + s.max + '</span></div>' +
          '<div class="statDesc">' + s.effect + '</div>' +
        '</div>' +
      '</div>' +
      '<button class="statBuy" data-id="' + s.id + '" ' + (maxed || !afford ? 'disabled' : '') + '>' +
        (maxed ? 'MASSIMO' : ('POTENZIA<br>' + cost + '🦴')) +
      '</button>';
    statListEl.appendChild(row);
  });
  statListEl.querySelectorAll('.statBuy').forEach(b => {
    b.addEventListener('click', () => {
      if (dogUpgrade(b.dataset.id)){
        beep(880,0.1,'square',0.15); beep(1108,0.12,'square',0.13,0,0.08);
        renderUpgradePanel();
      }
    });
  });
}
function openUpgrade(){ closeDogSelect(); renderUpgradePanel(); upgradeBox.style.display = 'block'; upgradeOpen = true; }
function closeUpgrade(){
  upgradeBox.style.display = 'none'; upgradeOpen = false;
  // il pulsante 🦴 resta raggiungibile anche a partita in corso (come impostazioni/trofei), quindi
  // riapriamo "scegli il tuo cane" solo se eravamo davvero partiti da lì (schermata del titolo):
  // così le barre aggiornate coi potenziamenti appena comprati si rivedono subito, senza però
  // far comparire quel menù nel bel mezzo di una partita o di una sfida online
  if (state === 'title') openDogSelect();
}
document.getElementById('upgBtn').addEventListener('click', e => {
  e.stopPropagation();
  audio(); startAmbient(); uiClick();
  upgradeOpen ? closeUpgrade() : openUpgrade();
});
document.getElementById('upgradeOk').addEventListener('click', () => { uiClick(); closeUpgrade(); });

// ---------- TROFEI & ASPETTO: pannello con due schede (trofei sbloccabili / cosmetici equipaggiabili) ----------
const trophyBox = document.getElementById('trophyBox');
const dailyCardEl = document.getElementById('dailyCard');
const trSubEl = document.getElementById('trSub');
const achListEl = document.getElementById('achList');
const trTabAch = document.getElementById('trTabAch');
const trTabCos = document.getElementById('trTabCos');
const trAchPane = document.getElementById('trAchPane');
const trCosPane = document.getElementById('trCosPane');
const cosPreviewEl = document.getElementById('cosPreview');
const cosCollarGridEl = document.getElementById('cosCollarGrid');
const cosAccGridEl = document.getElementById('cosAccGrid');

function renderTrophyPanel(){
  ensureDaily();
  const ch = currentDailyChallenge();
  dailyCardEl.className = 'dailyCard' + (daily.done ? ' done' : '');
  dailyCardEl.innerHTML =
    '<div class="dt">🎯 SFIDA DEL GIORNO' + (playStreak.count > 0 ? '  ·  🔥 ' + playStreak.count + ' giorni di fila' : '') + '</div>' +
    '<div class="dd2">' + (daily.done ? '✓ Completata! +' + ch.reward + ' 🦴' : ch.desc + ' <span style="color:#ffd23f">(+' + ch.reward + ' 🦴)</span>') + '</div>' +
    '<div class="dr">Cambia ogni giorno · gioca ogni giorno per far crescere la serie 🔥</div>';
  trSubEl.textContent = `${unlocked.length} su ${ACH.length} trofei sbloccati`;
  achListEl.innerHTML = '';
  ACH.forEach(a => {
    const has = unlocked.includes(a.id);
    const row = document.createElement('div');
    row.className = 'achRow';
    row.innerHTML =
      '<div class="achStar" style="color:' + (has ? '#ffd23f' : '#555a77') + '">' + (has ? '★' : '☆') + '</div>' +
      '<div>' +
        '<div class="achName" style="color:' + (has ? '#ffd23f' : '#555a77') + '">' + a.name + '</div>' +
        '<div class="achDesc" style="color:' + (has ? '#cfd6ea' : '#555a77') + '">' + a.desc + '</div>' +
      '</div>';
    achListEl.appendChild(row);
  });
}

function renderCosmeticsPanel(){
  drawDogPortrait(cosPreviewEl, selectedDog().colors, false);
  const buildGrid = (grid, type) => {
    grid.innerHTML = '';
    COSMETICS.filter(c => c.type === type).forEach(item => {
      const has = isCosmeticUnlocked(item);
      const eq = equip[type] === item.id;
      const cell = document.createElement('div');
      cell.className = 'cosItem' + (eq ? ' eq' : '') + (has ? '' : ' lockedCos');
      const visual = item.color
        ? '<div class="cosSwatch" style="background:' + item.color + '"></div>'
        : '<div class="cosIcon">' + (item.id === 'acc_bandana' ? '🔺' : item.id === 'acc_cap' ? '🎉' : '🚫') + '</div>';
      cell.innerHTML =
        (eq ? '<div class="cosCheck">✓</div>' : '') +
        visual +
        '<div class="cosLabel">' + (has ? item.name : '🔒') + '</div>' +
        (!has ? '<div class="cosLock">' + lockHint(item) + '</div>' : '');
      if (has){
        cell.addEventListener('click', () => {
          if (equipCosmetic(item.id)){ beep(700,0.08,'square',0.13); renderCosmeticsPanel(); }
        });
      }
      grid.appendChild(cell);
    });
  };
  buildGrid(cosCollarGridEl, 'collar');
  buildGrid(cosAccGridEl, 'accessory');
}
function lockHint(item){
  const a = ACH.find(x => x.id === item.unlock.id);
  return a ? a.name : '';
}
function showTrTab(tab){
  trTabAch.classList.toggle('sel', tab === 'ach');
  trTabCos.classList.toggle('sel', tab === 'cos');
  trAchPane.style.display = tab === 'ach' ? 'block' : 'none';
  trCosPane.style.display = tab === 'cos' ? 'block' : 'none';
  if (tab === 'cos') renderCosmeticsPanel();
}
trTabAch.addEventListener('click', () => { uiClick(); showTrTab('ach'); });
trTabCos.addEventListener('click', () => { uiClick(); showTrTab('cos'); });

function openTrophy(){
  closeDogSelect();
  renderTrophyPanel();
  showTrTab('ach');
  trophyBox.style.display = 'block';
  trophyOpen = true;
}
function closeTrophy(){
  trophyBox.style.display = 'none';
  trophyOpen = false;
  if (state === 'title') openDogSelect();
}
document.getElementById('trophyOk').addEventListener('click', () => { uiClick(); closeTrophy(); });

// ---------- TUTORIAL AL PRIMO AVVIO ----------
const tutBox = document.getElementById('tutBox');
const tutText = document.getElementById('tutText');
let pendingAfterTutorial = null;
function maybeShowTutorial(cb){
  if (localStorage.getItem('dd_tut_seen')){ cb && cb(); return; }
  tutText.innerHTML = isTouch
    ? 'Tocca e trascina in un punto qualsiasi <b>a sinistra</b> per muovere Fio: il joystick compare lì dove tocchi, più lo spingi lontano dal centro più corre veloce. Tocca in un punto qualsiasi <b>a destra</b> per saltare: anche il pulsante compare lì dove tocchi.<br>Prendi i frisbee al volo! Quello <b>dorato</b> vale di più, quello <b>viola</b> torna indietro se non lo prendi.'
    : '<b>← →</b> muovi Fio · <b>SPAZIO / ↑</b> salto acrobatico (doppio salto con l\'osso turbo!).<br>Prendi i frisbee al volo! Quello <b>dorato</b> vale di più, quello <b>viola</b> torna indietro se non lo prendi. <b>P</b> pausa.';
  tutOpen = true;
  tutBox.style.display = 'block';
  pendingAfterTutorial = cb;
}
document.getElementById('tutOk').addEventListener('click', () => {
  uiClick();
  localStorage.setItem('dd_tut_seen','1');
  tutBox.style.display = 'none';
  tutOpen = false;
  const cb = pendingAfterTutorial; pendingAfterTutorial = null;
  if (cb) cb();
});

// ---------- TORNA AL MENU (solo in pausa): serve per uscire dall'allenamento, che non ha game over ----------
function quitToMenu(){
  paused = false;
  state = 'title';
  transitionAlpha = 1;
  stopMusic();
}
const quitBtn = document.getElementById('quitBtn');
quitBtn.addEventListener('click', e => { e.stopPropagation(); uiClick(); if (state === 'mp') mpQuit(); else quitToMenu(); });

// ---------- PULSANTE PAUSA TOUCH (da tastiera c'è già il tasto P) ----------
const pauseBtn = document.getElementById('pauseBtn');
pauseBtn.addEventListener('click', e => {
  e.stopPropagation();
  if (state === 'play'){ uiClick(); paused = !paused; }
});

// ---------- CONDIVIDI PUNTEGGIO ----------
const shareBtn = document.getElementById('shareBtn');
shareBtn.addEventListener('click', e => { e.stopPropagation(); uiClick(); shareScore(); });
function shareScore(){
  const c = document.createElement('canvas');
  c.width = 800; c.height = 450;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0,0,0,450);
  grad.addColorStop(0,'#1a2a55'); grad.addColorStop(1,'#0d0d1a');
  g.fillStyle = grad; g.fillRect(0,0,800,450);
  g.textAlign = 'center';
  g.fillStyle = '#ffd23f'; g.font = 'bold 40px "Courier New"';
  g.fillText('🐕 FIO FRESBEE 🥏', 400, 88);
  g.fillStyle = '#fff'; g.font = 'bold 70px "Courier New"';
  g.fillText('SCORE ' + score, 400, 220);
  g.fillStyle = '#7ec8e3'; g.font = '22px "Courier New"';
  g.fillText('Miglior punteggio: ' + best + '  ·  ' + catches + ' frisbee presi al volo', 400, 268);
  if (newRecord){
    g.fillStyle = '#ffd23f'; g.font = 'bold 24px "Courier New"';
    g.fillText('★ NUOVO RECORD! ★', 400, 320);
  }
  g.fillStyle = '#aaa'; g.font = '15px "Courier New"';
  g.fillText('Gioca anche tu — stefanobozzo82.github.io/fiofresbee', 400, 410);
  c.toBlob(blob => {
    if (!blob) return;
    const file = new File([blob], 'fiofresbee-score.png', { type:'image/png' });
    if (navigator.canShare && navigator.canShare({ files:[file] })){
      navigator.share({ files:[file], title:'Fio Fresbee', text:'Il mio punteggio: ' + score }).catch(()=>{});
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'fiofresbee-score.png';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(url), 4000);
    }
  });
}

// mostra/nasconde gli elementi DOM in base allo stato di gioco corrente (chiamata ogni frame, economica)
let lastUIState = null, lastPausedUI = null;
function syncUI(){
  if (state !== lastUIState){
    lastUIState = state;
    shareBtn.style.display = (state === 'over') ? 'block' : 'none';
    if (isTouch) pauseBtn.style.display = (state === 'play') ? 'block' : 'none';
    updateInstallBtn();
    // il menù "scegli il tuo cane" si apre da solo ogni volta che si torna al titolo:
    // è il menù iniziale vero e proprio, non serve più aprirlo dal pulsante osso
    if (state === 'title') openDogSelect();
  }
  // NB: syncUI() non gira mai mentre state === 'mp' (il loop chiama mpDraw() invece di draw()),
  // quindi mostrare/nascondere quitBtn durante l'arena condivisa è gestito direttamente
  // dalle funzioni mp* (mpApplyStart la mostra, mpQuit/mpShowResult la nascondono).
  const showQuit = (paused && state === 'play');
  if (showQuit !== lastPausedUI){
    lastPausedUI = showQuit;
    quitBtn.style.display = showQuit ? 'block' : 'none';
    pauseBtn.textContent = paused ? '▶' : '⏸';
    pauseBtn.title = paused ? 'Riprendi' : 'Pausa';
  }
}

// ---------- SPLASH SCREEN INIZIALE ----------
const splashEl = document.getElementById('splash');
function dismissSplash(){
  if (!splashEl.parentNode) return;
  splashEl.classList.add('hide');
  audio(); startAmbient();
  setTimeout(() => splashEl.remove(), 550);
}
splashEl.addEventListener('click', dismissSplash);
setTimeout(dismissSplash, 1500);

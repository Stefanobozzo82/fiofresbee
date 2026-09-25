// Sfida online a due (Supabase Realtime)
// ============================================================
// ---------- MODALITÀ ONLINE: SFIDA A DUE (arena condivisa) ----------
// ============================================================
// Due cani sullo stesso campo, stesso lanciatore, frisbee condivisi: chi ne prende di più
// in 90 secondi vince. Usa i canali "Realtime" di Supabase (broadcast + presence), che vanno
// abilitati sul progetto Supabase separatamente dalla classifica (che usa solo REST).
// Modello: uno dei due giocatori (quello con l'id più piccolo in ordine alfabetico) fa da
// "host" ed è l'unico arbitro dei frisbee condivisi e del punteggio; ognuno dei due però
// muove e disegna il PROPRIO cane in locale (risposta immediata ai comandi) e manda la sua
// posizione all'altro ~20 volte al secondo. Match fissi a 90s, niente meteo/giorno-notte/delfini
// nell'arena condivisa (vedi mpHostHazards per gabbiano/granchio/osso, presenti come nel singolo).
const MP_DURATION_FR = 90 * 60;       // durata del match in "frame" (~90s, il loop gira a ~60fps)
const MP_SEND_MS = 50;                // ~20 volte al secondo: quanto spesso mandiamo il nostro cane
const MP_HOST_SEND_MS = 50;           // quanto spesso l'host manda lo stato dei frisbee/punteggi
const MP_SEARCH_TIMEOUT_MS = 22000;   // se in 22s non troviamo nessuno, rinunciamo
const MP_LOBBY_CHANNEL = 'fiofresbee-lobby-v1';
const MP_PEER_COLORS = { body:'#5a8fd6', dark:'#3a5f96', collar:'#ff8fa3' };  // colori fissi per l'avversario

function mpUid(){ return 'p' + Math.random().toString(36).slice(2,9) + Date.now().toString(36); }

let mpSupaClient = null;
function mpGetClient(){
  if (!ONLINE) return null;
  if (typeof window.supabase === 'undefined' || !window.supabase.createClient) return null;
  if (!mpSupaClient){
    try { mpSupaClient = window.supabase.createClient(SUPA_URL, SUPA_KEY); } catch(e){ mpSupaClient = null; }
  }
  return mpSupaClient;
}

const MP = {
  myId: null, myName: '',
  lobbyCh: null, matchCh: null,
  matchId: null, isHost: false, peerId: null, peerName: '',
  searchTimer: null, searching: false,
  started: false, startAt: 0, timeLeft: 0,
  myScore: 0, peerScore: 0,
  myDog: null, peerDog: null, peerTarget: null, peerLast: 0,
  lastSendT: 0, lastHostSendT: 0,
  discs: [], nextDiscId: 1, discTimer: 0,
  pendingPeerStun: false, pendingPeerTurbo: false, pendingEvt: null,
  ended: false, resultShown: false,
  rematchMine: false, rematchPeer: false, peerGone: false, rematchWatchdog: null,
  popups: []
};

function mpFreshDog(){
  return { x: W*0.5, y: GROUND, vx: 0, vy: 0, dir: 1, onGround: true, jumpSpin: 0, anim: 0, stun: 0, grace: 0 };
}

// ---------- ricerca avversario ----------
const mpSearchBox = document.getElementById('mpSearchBox');
const mpSearchText = document.getElementById('mpSearchText');

function mpStartSearch(){
  closeDogSelect();
  const client = mpGetClient();
  if (!client){
    showTrophyMsg('⚠ Sfida online non disponibile al momento', 140);
    openDogSelect();
    return;
  }
  MP.myId = mpUid();
  MP.myName = ((localStorage.getItem('dd_name')||'').trim() || 'CANE SENZA NOME').slice(0,14);
  MP.searching = true; MP.matchId = null; MP.isHost = false; MP.peerId = null;
  mpSearchText.textContent = 'Cerco un avversario connesso in questo momento…';
  mpSearchBox.style.display = 'block'; mpSearchOpen = true;
  audio(); startAmbient();
  const lobby = client.channel(MP_LOBBY_CHANNEL, { config: { presence: { key: MP.myId } } });
  MP.lobbyCh = lobby;
  lobby.on('presence', { event: 'sync' }, () => mpEvaluateLobby());
  lobby.on('broadcast', { event: 'invite' }, ({ payload }) => mpMaybeAcceptMatch(payload));
  lobby.subscribe(status => {
    if (status === 'SUBSCRIBED'){
      lobby.track({ id: MP.myId, name: MP.myName, t: Date.now() }).catch(()=>{});
      mpEvaluateLobby();
    }
  });
  MP.searchTimer = setTimeout(mpSearchFail, MP_SEARCH_TIMEOUT_MS);
}

function mpSearchFail(){
  if (!MP.searching) return;
  mpCleanupLobby();
  MP.searching = false;
  mpSearchText.textContent = 'Nessun avversario trovato, riprova tra poco…';
  setTimeout(() => { if (!MP.started) mpCloseSearch(); }, 1600);
}

function mpCleanupLobby(){
  if (MP.searchTimer){ clearTimeout(MP.searchTimer); MP.searchTimer = null; }
  if (MP.lobbyCh){ try { MP.lobbyCh.unsubscribe(); } catch(e){} MP.lobbyCh = null; }
}

function mpCloseSearch(){
  mpCleanupLobby();
  MP.searching = false;
  mpSearchBox.style.display = 'none'; mpSearchOpen = false;
  openDogSelect();
}
document.getElementById('mpCancel').addEventListener('click', e => {
  e.stopPropagation(); uiClick();
  mpCloseSearch();
});
document.getElementById('dogSelectMp').addEventListener('click', e => {
  e.stopPropagation(); uiClick();
  // il nome scelto qui è quello che l'avversario vedrà: se non ne abbiamo ancora uno salvato,
  // lo chiediamo al volo prima di entrare in cerca di una sfida (poi resta ricordato per sempre)
  if ((localStorage.getItem('dd_name')||'').trim()){
    mpStartSearch();
  } else {
    closeDogSelect();
    askName(() => mpStartSearch(), '🐕 COME SI CHIAMA IL TUO CANE?');
  }
});

// ogni client, quando la lista di chi è presente nella lobby cambia, calcola SEMPRE la STESSA
// tabella di abbinamento (ordinando gli id di tutti i presenti): così i due membri di ogni
// coppia si riconoscono a vicenda senza doversi accordare prima. Solo chi ha l'id "minore"
// nella coppia manda l'invito ed è host, l'altro resta in ascolto.
function mpEvaluateLobby(){
  if (!MP.searching || !MP.lobbyCh || MP.matchId) return;
  let stateMap;
  try { stateMap = MP.lobbyCh.presenceState(); } catch(e){ return; }
  const ids = Object.keys(stateMap).sort();
  const myIdx = ids.indexOf(MP.myId);
  if (myIdx === -1) return;
  const pairIdx = myIdx % 2 === 0 ? myIdx + 1 : myIdx - 1;
  if (pairIdx < 0 || pairIdx >= ids.length) return;   // nessun compagno di coppia per ora
  const peerId = ids[pairIdx];
  if (MP.myId >= peerId) return;   // solo l'id più piccolo della coppia propone l'abbinamento
  const peerEntry = (stateMap[peerId] && stateMap[peerId][0]) || {};
  const matchId = MP.myId + '_' + peerId + '_' + Date.now();
  MP.lobbyCh.send({
    type: 'broadcast', event: 'invite',
    payload: { matchId, host: MP.myId, hostName: MP.myName, guest: peerId }
  }).catch(()=>{});
  mpBeginMatch(matchId, true, peerId, peerEntry.name || 'Avversario');
}

function mpMaybeAcceptMatch(payload){
  if (!MP.searching || MP.matchId) return;
  if (payload.guest !== MP.myId) return;
  mpBeginMatch(payload.matchId, false, payload.host, payload.hostName || 'Avversario');
}

// ---------- partita: join, avvio sincronizzato, disconnessioni ----------
function mpBeginMatch(matchId, isHost, peerId, peerName){
  if (MP.searchTimer){ clearTimeout(MP.searchTimer); MP.searchTimer = null; }
  if (MP.lobbyCh){ try { MP.lobbyCh.unsubscribe(); } catch(e){} MP.lobbyCh = null; }
  MP.matchId = matchId; MP.isHost = isHost; MP.peerId = peerId; MP.peerName = peerName;
  MP.searching = false;
  mpSearchText.textContent = 'Avversario trovato! Preparati…';
  const client = mpGetClient();
  if (!client){ mpCloseSearch(); return; }
  const ch = client.channel('ff-match-' + matchId, { config: { presence: { key: MP.myId } } });
  MP.matchCh = ch;
  ch.on('presence', { event: 'sync' }, () => mpHostMaybeStart());
  ch.on('presence', { event: 'leave' }, ({ key }) => {
    if (key !== MP.peerId) return;
    // se l'avversario sparisce mentre siamo fermi sulla schermata del risultato (in attesa
    // di un'eventuale rivincita), non è una partita da chiudere: è solo la rivincita che salta
    if (MP.resultShown) mpRematchPeerLeft();
    else mpOpponentLeft();
  });
  ch.on('broadcast', { event: 'start' }, ({ payload }) => mpApplyStart(payload));
  ch.on('broadcast', { event: 'dog' }, ({ payload }) => mpApplyPeerDog(payload));
  ch.on('broadcast', { event: 'world' }, ({ payload }) => mpApplyWorld(payload));
  ch.on('broadcast', { event: 'score' }, ({ payload }) => mpApplyScore(payload));
  ch.on('broadcast', { event: 'catch' }, ({ payload }) => mpApplyCatchClaim(payload));
  ch.on('broadcast', { event: 'over' }, ({ payload }) => mpApplyOver(payload));
  ch.on('broadcast', { event: 'rematch' }, () => mpOnRematchSignal());
  ch.subscribe(status => {
    if (status === 'SUBSCRIBED') ch.track({ id: MP.myId, name: MP.myName }).catch(()=>{});
  });
}

// solo l'host decide QUANDO si parte (appena vede entrambi presenti nel canale della partita)
// e lo comunica a entrambi con un timestamp preciso, così il conto alla rovescia parte
// sincronizzato sui due schermi anche se la rete ha un po' di ritardo
function mpHostMaybeStart(){
  // guardia fondamentale: questa funzione deve far partire SOLO la primissima partita del match.
  // Il canale resta aperto anche dopo, per l'eventuale rivincita (vedi mpShowResult) — se non
  // escludessimo esplicitamente "resultShown", un semplice resync di presence (capita spesso con
  // Supabase Realtime, es. dopo una riconnessione) rilancerebbe una partita da soli senza che
  // nessuno dei due abbia davvero premuto RIVINCITA. La rivincita vera passa solo da
  // mpHostStartRematch(), mai da qui.
  if (!MP.isHost || !MP.matchCh || MP.started || MP.resultShown) return;
  let stateMap;
  try { stateMap = MP.matchCh.presenceState(); } catch(e){ return; }
  if (Object.keys(stateMap).length < 2) return;
  const startAt = Date.now() + 2600;
  mpBroadcastStart(startAt);
  mpApplyStart({ startAt });
}

// manda l'evento "start" (che fa scattare il conto alla rovescia sull'altro schermo) più volte
// nel giro di ~1.5s invece che una volta sola: un broadcast realtime può perdersi (rete mobile
// instabile, schermo bloccato, riconnessione in corso) e senza un rinvio l'altro giocatore
// resterebbe bloccato per sempre su "avversario trovato, preparati…". mpApplyStart lato
// ricevente ignora i doppioni (if (MP.started) return;), quindi rimandare non fa danni.
function mpBroadcastStart(startAt){
  const send = () => { if (MP.matchCh) MP.matchCh.send({ type: 'broadcast', event: 'start', payload: { startAt } }).catch(()=>{}); };
  send();
  setTimeout(send, 500);
  setTimeout(send, 1300);
}

function mpApplyStart(payload){
  if (MP.started) return;
  MP.started = true;
  MP.startAt = payload.startAt;
  MP.timeLeft = MP_DURATION_FR;
  MP.myScore = 0; MP.peerScore = 0;
  MP.myDog = mpFreshDog(); MP.peerDog = mpFreshDog();
  MP.peerTarget = null; MP.peerLast = 0;
  MP.discs = []; MP.nextDiscId = 1; MP.discTimer = 90;
  MP.lastSendT = 0; MP.lastHostSendT = 0;
  MP.pendingPeerStun = false; MP.pendingPeerTurbo = false; MP.pendingEvt = null;
  MP.ended = false; MP.resultShown = false;
  MP.rematchMine = false; MP.rematchPeer = false; MP.peerGone = false;
  clearTimeout(MP.rematchWatchdog); MP.rematchWatchdog = null;
  MP.popups = [];
  clearSimTimers();
  // se stiamo arrivando qui da una rivincita, il pannello del risultato precedente è ancora aperto
  mpResultBoxEl.style.display = 'none'; mpResultOpen = false;
  // riusiamo esattamente lo stesso stato di gabbiano/granchio/osso/turbo del singolo giocatore
  // (le due modalità non girano mai insieme, quindi non c'è conflitto), così i disegni e i
  // suoni restano identici senza duplicare tutta quella logica
  gull = null; gullTimer = 500;
  crab = null; crabTimer = 700;
  bone = null; boneTimer = 1000;
  turbo = 0; turboMax = TURBO_TIME; airJumps = 0; lastJumpHeld = false;
  message = ''; msgTimer = 0;
  mpSearchBox.style.display = 'none'; mpSearchOpen = false;
  closeDogSelect();
  state = 'mp';
  updateInstallBtn();
  quitBtn.style.display = 'block';
  // in arena condivisa non c'è pausa/oscuramento dietro il pulsante: lo spostiamo in un
  // angolo così non copre il campo da gioco (di default è pensato per stare al centro,
  // sopra la schermata di pausa disegnata solo in modalità singolo giocatore)
  quitBtn.style.top = '14%';
  quitBtn.style.fontSize = '12px';
  quitBtn.style.padding = '6px 14px';
  if (isTouch) pauseBtn.style.display = 'none';
  shareBtn.style.display = 'none';
  audio(); startAmbient(); SFX.round(); startMusic();
}

function mpOpponentLeft(){
  if (!MP.started || MP.ended) return;
  if (MP.isHost) mpHostEndMatch('opponent_left');
  else {
    // l'ospite non è l'arbitro: se l'host sparisce, chiude comunque la partita mostrando
    // il punteggio corrente come vittoria (non c'è più nessuno che possa contestarla)
    mpApplyOver({ myScore: MP.peerScore, peerScore: MP.myScore, reason: 'opponent_left' });
  }
}

function mpQuit(){
  mpTeardownChannels();
  MP.started = false; MP.ended = true; MP.resultShown = false;
  MP.rematchMine = false; MP.rematchPeer = false; MP.peerGone = false;
  clearTimeout(MP.rematchWatchdog); MP.rematchWatchdog = null;
  document.getElementById('mpResultBox').style.display = 'none'; mpResultOpen = false;
  mpSearchBox.style.display = 'none'; mpSearchOpen = false;
  quitBtn.style.display = 'none';
  quitBtn.style.top = ''; quitBtn.style.fontSize = ''; quitBtn.style.padding = '';
  gull = null; crab = null; bone = null;   // niente resti dell'arena condivisa dietro al menù
  stopMusic();
  state = 'title';
  lastUIState = null;   // forza syncUI a riaprire subito il menù scelta cane
  transitionAlpha = 1;
}

function mpTeardownChannels(){
  if (MP.searchTimer){ clearTimeout(MP.searchTimer); MP.searchTimer = null; }
  if (MP.lobbyCh){ try { MP.lobbyCh.unsubscribe(); } catch(e){} MP.lobbyCh = null; }
  if (MP.matchCh){ try { MP.matchCh.unsubscribe(); } catch(e){} MP.matchCh = null; }
}

// ---------- il MIO cane: fisica locale, risposta immediata (niente attesa di rete) ----------
// riusa "turbo"/"turboMax"/"airJumps"/"lastJumpHeld" del singolo giocatore per il MIO cane:
// stessa logica di corsa/salto/doppio salto turbo, senza duplicarla
function mpStepMyDog(){
  const d = MP.myDog;
  if (turbo > 0) turbo--;
  const SPEED = (turbo > 0 ? 7.6 : 5.2) * dogSpeedMul();
  d.vx = 0;
  const jumpHeld = !!(keys['Space']||keys['ArrowUp']);
  const doubleJumpAvailable = turbo > 0 || curLevels().jump >= dogStatMax('jump');
  if (d.stun > 0){
    d.stun--;
  } else {
    const keyDir = (keys['ArrowLeft']?-1:0) + (keys['ArrowRight']?1:0);
    const moveInput = keyDir !== 0 ? keyDir : joyDir;
    if (Math.abs(moveInput) > 0.08){ d.vx = SPEED * moveInput; d.dir = moveInput < 0 ? -1 : 1; }
    if (jumpHeld && d.onGround){
      d.vy = -12.5 * dogJumpMul(); d.onGround = false; d.jumpSpin = 0; airJumps = 0;
      SFX.jump();
    } else if (jumpHeld && !lastJumpHeld && !d.onGround && doubleJumpAvailable && airJumps < 1){
      d.vy = -11 * dogJumpMul(); airJumps++;
      SFX.jump();
      puff(d.x, d.y, '#ffd23f', 8);
    }
  }
  lastJumpHeld = jumpHeld;
  // scia turbo / sabbia sollevata dalla corsa: identiche al singolo giocatore
  if (turbo > 0 && Math.abs(d.vx) > 0 && Math.random() < 0.5){
    particles.push({ x: d.x - d.dir*26, y: d.y - 8 - Math.random()*14,
      vx: -d.dir*(1+Math.random()), vy: -Math.random(),
      life: 12+Math.random()*10, color: Math.random()<0.5 ? '#ffd23f' : '#fff' });
  }
  if (turbo <= 0 && d.onGround && Math.abs(d.vx) > 0 && Math.random() < 0.6){
    particles.push({ x: d.x - d.dir*22, y: d.y + 2,
      vx: -d.dir*(0.4+Math.random()*0.6) + d.vx*0.15, vy: -0.6-Math.random()*0.6,
      life: 10+Math.random()*8, color: '#d9c088' });
  }
  if (d.grace > 0) d.grace--;
  d.x += d.vx;
  d.vy += 0.55;
  d.y += d.vy;
  if (d.y >= GROUND){ d.y = GROUND; d.vy = 0; d.onGround = true; d.jumpSpin = 0; airJumps = 0; }
  if (!d.onGround) d.jumpSpin += 0.25;
  d.x = Math.max(20, Math.min(W-20, d.x));
  d.anim += Math.abs(d.vx)*0.08 + 0.02;
}

function mpApplyPeerDog(payload){
  MP.peerLast = Date.now();
  if (!MP.peerDog) MP.peerDog = mpFreshDog();
  MP.peerTarget = payload;
}
function mpLerpPeerDog(){
  if (!MP.peerTarget || !MP.peerDog) return;
  const t = MP.peerTarget, p = MP.peerDog;
  p.x += (t.x - p.x) * 0.35;
  p.y += (t.y - p.y) * 0.35;
  p.dir = t.dir; p.onGround = t.onGround; p.jumpSpin = t.jumpSpin; p.anim = t.anim; p.stun = t.stun;
  p.vx = t.vx;
}

// feedback immediato per l'ospite quando prende un frisbee (vedi mpUpdate): punteggio aggiornato
// subito in locale (l'host lo confermerà a breve con l'evento "score", stesso identico calcolo,
// quindi il numero non farà scatti) invece di aspettare la conferma per vedere qualsiasi reazione
function mpLocalCatchFx(d){
  const air = !MP.myDog.onGround;
  const pts = (d.gold ? 400 : 150) + (air ? 120 : 0);
  MP.myScore += pts;
  mpLocalScoreFx(pts, true);
  puff(d.x, d.y, d.gold ? '#ffd23f' : '#7ec8e3', d.gold ? 20 : 14);
  SFX.bark();
  d.gold ? SFX.golden() : SFX.catch_();
}

// ---------- l'HOST è l'unico arbitro di frisbee/gabbiano/granchio/osso condivisi e dei punti ----------
function mpHostSpawnDisc(){
  const gold = Math.random() < (0.08 + dogLuckBonus());
  const boomerang = Math.random() < 0.12;
  const d = {
    id: MP.nextDiscId++,
    x: thrower.x+30, y: thrower.y-60,
    vx: 6 + Math.random()*3, vy: -(8+Math.random()*3),
    curve: (Math.random()*2-1)*1.6,
    gold, boomerang, bt: 0, bounces: 0, dead: null, rot: 0, trail: []
  };
  if (boomerang){
    // stesso volo dedicato del singolo giocatore: va dritto quasi al bordo, poi torna, sempre in aria
    d.vx0 = 9 + Math.random()*3;
    d.y0 = d.y; d.x0 = d.x;
    const apexDist = W * 0.60;
    d.bT = apexDist * Math.PI / d.vx0;
    d.vx = d.vx0;
  }
  MP.discs.push(d);
  MP.discTimer = 130 + Math.random()*40;
  SFX.throw_();
  if (gold) SFX.goldSpawn();
  if (boomerang) SFX.boomSpawn();
  // ogni tanto arriva un secondo frisbee poco dopo, come il "DOPPIO!" del singolo giocatore
  if (Math.random() < 0.22){
    setMessage('DOPPIO!', 55);
    MP.pendingEvt = { text:'DOPPIO!', dur:55 };
    later(27, () => {   // ~0.45s, contati in passi di gioco
      if (state === 'mp' && MP.isHost && !MP.ended) mpHostSpawnDisc();
    });
  }
}

// ---- gabbiano, granchio e osso turbo: stessa logica del singolo giocatore, ma controllata
// contro ENTRAMBI i cani (il mio e quello dell'avversario, di cui l'host tiene una copia) ----
function mpHostHazards(){
  // gabbiano dispettoso
  gullTimer--;
  if (gullTimer <= 0 && !gull){
    const dir = Math.random() < 0.5 ? 1 : -1;
    gull = { x: dir > 0 ? -50 : W+50, y: 60+Math.random()*130, vx: dir*(2.2+Math.random()*1.6), flap:0, hit:false, carry:false, dropX:0 };
    if (boneTimer <= 0 && !bone && turbo <= 0){
      gull.carry = true;
      gull.dropX = 120 + Math.random()*(W-240);
    }
  }
  if (gull){
    gull.x += gull.vx;
    gull.y += Math.sin(gull.flap*0.5)*0.6;
    gull.flap += 0.35;
    for (const d of MP.discs){
      if (d.dead) continue;
      if (!gull.hit && Math.abs(d.x-gull.x) < 24 && Math.abs(d.y-gull.y) < 18){
        gull.hit = true;
        d.vy = (Math.random()<0.5 ? -1 : 1) * (2 + Math.random()*3);
        d.vx *= 0.6 + Math.random()*0.7;
        d.curve = -(d.curve||0) * 1.6;
        setMessage('GABBIANO!', 50);
        MP.pendingEvt = { text:'GABBIANO!', dur:50 };
        SFX.squawk();
        puff(gull.x, gull.y, '#ffffff', 12);
      }
    }
    if (gull.carry && Math.abs(gull.x - gull.dropX) < 8){
      gull.carry = false;
      bone = { x: gull.x, y: gull.y + 16, vy: 0.5, falling: true, t: 0, life: 650 };
      SFX.squawk();
    }
    if (gull.x < -70 || gull.x > W+70){ gull = null; gullTimer = 350 + Math.random()*550; }
  }

  // granchio sulla sabbia
  crabTimer--;
  if (crabTimer <= 0 && !crab){
    const dir = Math.random() < 0.5 ? 1 : -1;
    crab = { x: dir > 0 ? -40 : W+40, vx: dir*(1.1+Math.random()*0.9), walk: 0 };
  }
  if (crab){
    crab.x += crab.vx;
    crab.walk += 0.25;
    [{ dog: MP.myDog, isMe: true }, { dog: MP.peerDog, isMe: false }].forEach(entry => {
      if (!entry.dog) return;
      if (entry.dog.stun <= 0 && !entry.dog.grace && entry.dog.onGround && Math.abs(entry.dog.x-crab.x) < 32){
        entry.dog.stun = 55; entry.dog.grace = 130;
        if (entry.isMe){
          setMessage('OUCH! GRANCHIO!', 55);
          SFX.ouch();
          puff(entry.dog.x, entry.dog.y-16, '#ff5a5a', 10);
          triggerShake(4, 12);
        } else {
          MP.pendingPeerStun = true;
        }
      }
    });
    if (crab.x < -60 || crab.x > W+60){ crab = null; crabTimer = 500 + Math.random()*800; }
  }

  // osso turbo (consegnato dal gabbiano)
  boneTimer--;
  if (boneTimer <= 0 && !bone && turbo <= 0 && !gull && gullTimer > 90) gullTimer = 90;
  if (bone){
    if (bone.falling){
      bone.vy += 0.35; bone.y += bone.vy;
      if (bone.y >= GROUND + 18){ bone.y = GROUND + 18; bone.falling = false; puff(bone.x, GROUND+14, '#e8d8a0', 8); }
    } else {
      bone.t += 0.08; bone.life--;
    }
    let bonePreso = false;
    [{ dog: MP.myDog, isMe: true }, { dog: MP.peerDog, isMe: false }].forEach(entry => {
      if (bonePreso || !entry.dog || !bone) return;
      const preso = bone.falling
        ? Math.hypot(entry.dog.x + entry.dog.dir*22 - bone.x, (entry.dog.y - 26) - bone.y) < 36
        : (entry.dog.y >= GROUND-6 && Math.abs(entry.dog.x - bone.x) < 32);
      if (preso){
        bonePreso = true;
        if (entry.isMe){
          turboMax = Math.round(TURBO_TIME * dogTurboMul());
          turbo = turboMax;
          setMessage(bone.falling ? 'OSSO AL VOLO! TURBO!' : 'TURBO!', 60);
          SFX.turbo();
          puff(bone.x, bone.y, '#ffd23f', 16);
        } else {
          MP.pendingPeerTurbo = true;
        }
        bone = null; boneTimer = 800 + Math.random()*900;
      }
    });
    if (!bonePreso && bone && !bone.falling && bone.life <= 0){ bone = null; boneTimer = 700 + Math.random()*800; }
  }
}

function mpHostSendWorld(){
  if (!MP.matchCh) return;
  MP.matchCh.send({ type:'broadcast', event:'world', payload: {
    discs: MP.discs.map(d => ({ id:d.id, x:d.x, y:d.y, gold:d.gold, boomerang:d.boomerang||false, dead:d.dead||null })),
    gull, crab, bone,
    stunGuest: MP.pendingPeerStun, turboGuest: MP.pendingPeerTurbo, evt: MP.pendingEvt
  }}).catch(()=>{});
  MP.pendingPeerStun = false; MP.pendingPeerTurbo = false; MP.pendingEvt = null;
}

function mpHostAwardPoint(who, air, d){
  const pts = (d.gold ? 400 : 150) + (air ? 120 : 0);
  if (who === 'host'){ MP.myScore += pts; mpLocalScoreFx(pts, true); }
  else { MP.peerScore += pts; mpLocalScoreFx(pts, false); }
  MP.matchCh && MP.matchCh.send({ type:'broadcast', event:'score', payload: {
    myScore: MP.myScore, peerScore: MP.peerScore
  }}).catch(()=>{});
  SFX.catch_();
}

function mpLocalScoreFx(pts, mine){
  const src = mine ? MP.myDog : MP.peerDog;
  if (!src) return;
  MP.popups.push({ x: src.x, y: src.y-70, t: 50, txt: '+'+pts, mine });
  puff(src.x, src.y, '#ffd23f', 14);
}

// l'host riceve la presa segnalata dall'ospite (vedi il commento in mpHostStep) e si fida: nella
// sfida online il punteggio non incide su classifica/livello/ossa (si azzera ad ogni match), quindi
// non vale la pena complicare il gioco con una vera validazione anti-cheat — basta controllare che
// quel frisbee esista ancora e non sia già stato assegnato a qualcun altro nello stesso istante
function mpApplyCatchClaim(payload){
  if (!MP.isHost) return;
  const d = MP.discs.find(x => x.id === payload.discId && !x.dead);
  if (!d) return;
  d.dead = 'caught';
  mpHostAwardPoint('guest', payload.air, d);
  mpHostSendWorld();
}

function mpHostStep(now){
  MP.discTimer--;
  if (MP.discTimer <= 0 && MP.discs.length === 0) mpHostSpawnDisc();

  let changed = false;
  MP.discs.forEach(d => {
    if (d.dead) return;
    d.rot += 0.35;
    d.trail.push({x:d.x, y:d.y});
    if (d.trail.length > 18) d.trail.shift();
    if (d.boomerang){
      // stesso volo dedicato del singolo giocatore: dritto verso il bordo, poi torna, sempre in aria
      d.bt++;
      const p = Math.min(d.bt / d.bT, 1);
      d.vx = d.vx0 * Math.cos(p * Math.PI);
      d.x += d.vx;
      d.y = d.y0 - Math.sin(p * Math.PI) * 80;
      if (d.bt === Math.round(d.bT/2)) SFX.boomTurn();
    } else {
      d.vy += 0.32;
      d.vx += (d.curve||0) * 0.02;
      d.vx *= 0.999;
      d.x += d.vx;
      d.y += d.vy;
      if (d.y > GROUND+8 && d.vy > 0){ d.y = GROUND+8; d.vy *= -0.55; d.vx *= 0.75; d.bounces = (d.bounces||0)+1; }
    }
    // la MIA presa (host) la giudico qui, in diretta, coi dati locali. Quella dell'ospite invece
    // NON la controllo più qui: lo farei guardando una copia della sua posizione vecchia di uno o
    // due giri di rete, che è esattamente il motivo per cui a volte il frisbee sembrava sfuggirgli
    // di mano pur avendolo preso — ora è l'ospite stesso a segnalarla (vedi mpApplyCatchClaim),
    // guardando la propria posizione vera, senza alcun ritardo
    if (!d.dead && MP.myDog){
      const mouthX = MP.myDog.x + MP.myDog.dir*22, mouthY = MP.myDog.y - 26;
      if (Math.hypot(d.x-mouthX, d.y-mouthY) < 34){
        mpHostAwardPoint('host', !MP.myDog.onGround, d);
        d.dead = 'caught';
        changed = true;
      }
    }
    if (!d.dead){
      if (d.boomerang){
        if (d.bt >= d.bT && d.x <= d.x0){ d.dead = 'miss'; changed = true; }
      } else if (d.x > W+40 || d.x < -40 || ((d.bounces||0) >= 2 && d.vy > -1 && d.y >= GROUND+7)){
        d.dead = 'miss';
        changed = true;
      }
    }
  });

  mpHostHazards();

  if (changed || MP.pendingEvt || MP.pendingPeerStun || MP.pendingPeerTurbo || now - MP.lastHostSendT >= MP_HOST_SEND_MS){
    MP.lastHostSendT = now;
    mpHostSendWorld();
  }
  MP.discs = MP.discs.filter(d => !d.dead);
}

// unisce l'ultimo stato ricevuto per un ostacolo condiviso (gabbiano/granchio/osso) a quello che
// l'ospite sta già mostrando: la posizione (x/y) resta quella locale e diventa il bersaglio di
// uno scivolamento morbido frame per frame (vedi mpUpdate), mentre i campi "di animazione pura"
// indicati in animFields continuano ad avanzare in locale invece di saltare col resto
function mpSyncHazard(cur, incoming, animFields){
  if (!incoming) return null;
  if (!cur){
    const obj = Object.assign({}, incoming);
    obj.tx = obj.x; obj.ty = obj.y;
    return obj;
  }
  const keepAnim = {};
  animFields.forEach(f => { if (cur[f] !== undefined) keepAnim[f] = cur[f]; });
  const merged = Object.assign({}, cur, incoming, keepAnim);
  merged.x = cur.x; merged.y = cur.y;
  merged.tx = incoming.x; merged.ty = incoming.y;
  return merged;
}

// ---------- l'OSPITE riceve dall'host lo stato del mondo condiviso come verità assoluta:
// frisbee, gabbiano, granchio, osso, ed eventuali eventi "one-shot" (stordimento, turbo, messaggi) ----------
function mpApplyWorld(payload){
  if (MP.isHost) return;
  const incoming = payload.discs || [];
  incoming.forEach(inc => {
    if (inc.dead){
      const d = MP.discs.find(x => x.id === inc.id);
      if (d) puff(d.x, d.y, inc.gold ? '#ffd23f' : '#7ec8e3', 14);
      MP.discs = MP.discs.filter(x => x.id !== inc.id);
      return;
    }
    let d = MP.discs.find(x => x.id === inc.id);
    if (!d){ d = { id: inc.id, x: inc.x, y: inc.y, gold: inc.gold, boomerang: inc.boomerang, rot: 0, trail: [] }; MP.discs.push(d); }
    d.tx = inc.x; d.ty = inc.y;
  });
  // il gabbiano/granchio/osso condivisi: l'host li simula a 60fps, ma ce li manda solo ogni
  // ~50ms (MP_HOST_SEND_MS). Se li sostituissimo di colpo ad ogni messaggio (come si faceva
  // prima), da noi si vedrebbero "scattare" in avanti a scatti invece di scorrere morbidi —
  // è esattamente il motivo per cui la modalità online va a scatti SOLO per chi non è host, mai
  // per l'host stesso (che vede sempre la propria simulazione locale, fluida per definizione).
  // Soluzione: come già per i frisbee, teniamo l'oggetto locale e lo facciamo scivolare (lerp)
  // verso l'ultima posizione nota, mentre le animazioni (ali, zampe, dondolio) avanzano qui
  // ogni frame invece di aggiornarsi a scatti col resto.
  gull = mpSyncHazard(gull, payload.gull, ['flap']);
  crab = mpSyncHazard(crab, payload.crab, ['walk']);
  bone = mpSyncHazard(bone, payload.bone, ['t']);
  if (payload.stunGuest && MP.myDog){
    MP.myDog.stun = 55; MP.myDog.grace = 130;
    setMessage('OUCH! GRANCHIO!', 55);
    SFX.ouch();
    puff(MP.myDog.x, MP.myDog.y-16, '#ff5a5a', 10);
    triggerShake(4, 12);
  }
  if (payload.turboGuest && MP.myDog){
    turboMax = Math.round(TURBO_TIME * dogTurboMul());
    turbo = turboMax;
    setMessage('TURBO!', 60);
    SFX.turbo();
    puff(MP.myDog.x, MP.myDog.y, '#ffd23f', 16);
  }
  if (payload.evt) setMessage(payload.evt.text, payload.evt.dur);
}
function mpApplyScore(payload){
  if (MP.isHost) return;   // l'host è già la fonte di verità dei punti, ignora eventuali echi
  MP.myScore = payload.peerScore;   // dal punto di vista dell'host, "peer" siamo noi
  MP.peerScore = payload.myScore;
}

// ---------- fine partita ----------
function mpHostEndMatch(reason){
  if (MP.ended) return;
  MP.ended = true;
  const payload = { myScore: MP.myScore, peerScore: MP.peerScore, reason };
  MP.matchCh && MP.matchCh.send({ type:'broadcast', event:'over', payload }).catch(()=>{});
  mpApplyOver(payload);
}
function mpApplyOver(payload){
  if (MP.resultShown) return;
  MP.ended = true;
  let mine, theirs;
  if (MP.isHost){ mine = payload.myScore; theirs = payload.peerScore; }
  else { mine = payload.peerScore; theirs = payload.myScore; }
  mpShowResult(mine, theirs, payload.reason);
}

const mpResultBoxEl = document.getElementById('mpResultBox');
const mpResultTitleEl = document.getElementById('mpResultTitle');
const mpMyNameEl = document.getElementById('mpMyName');
const mpMyScoreEl = document.getElementById('mpMyScore');
const mpPeerNameEl = document.getElementById('mpPeerName');
const mpPeerScoreEl = document.getElementById('mpPeerScore');
const mpRematchBtnEl = document.getElementById('mpRematchBtn');
const mpRematchStatusEl = document.getElementById('mpRematchStatus');
const mpDanceRowEl = document.getElementById('mpDanceRow');
const mpMyScoreColEl = document.getElementById('mpMyScoreCol');
const mpPeerScoreColEl = document.getElementById('mpPeerScoreCol');

function mpShowResult(mine, theirs, reason){
  MP.resultShown = true;
  // NB: il canale della partita resta aperto qui (non lo smontiamo più come prima): serve
  // ancora per l'eventuale rivincita. Viene chiuso solo tornando davvero al menù (mpResultOk)
  // o abbandonando la partita (mpQuit). Senza questo, "started" restava true per sempre dopo
  // ogni partita finita normalmente, e la sfida online successiva restava bloccata sul
  // caricamento perché mpHostMaybeStart si rifiutava di far partire un match già "iniziato".
  MP.started = false;
  MP.rematchMine = false; MP.rematchPeer = false; MP.peerGone = false;
  stopMusic();
  quitBtn.style.display = 'none';
  quitBtn.style.top = ''; quitBtn.style.fontSize = ''; quitBtn.style.padding = '';
  gull = null; crab = null; bone = null;   // niente resti dell'arena condivisa dietro al menù
  mpMyNameEl.textContent = (MP.myName || 'TU').toUpperCase();
  mpMyScoreEl.textContent = mine;
  mpPeerNameEl.textContent = (MP.peerName || 'AVVERSARIO').toUpperCase();
  mpPeerScoreEl.textContent = theirs;
  mpRematchStatusEl.textContent = '';
  // balletto di vittoria: solo se ho vinto io (qualunque motivo), il mio punteggio pulsa e
  // sopra compare una fila di emoji che ballano — un premio visivo in più oltre al testo
  const won = mine > theirs;
  mpDanceRowEl.classList.toggle('show', won);
  mpMyScoreColEl.classList.toggle('mpWinner', won);
  mpPeerScoreColEl.classList.toggle('mpWinner', false);
  if (reason === 'opponent_left'){
    mpResultTitleEl.textContent = '🏆 AVVERSARIO USCITO — HAI VINTO';
    SFX.trophy();
    // chi è appena uscito non può ricevere una richiesta di rivincita: non ha senso proporla
    MP.peerGone = true;
    mpRematchBtnEl.disabled = true;
    mpRematchBtnEl.textContent = '🔁 RIVINCITA';
    mpRematchStatusEl.textContent = 'Avversario disconnesso: niente rivincita.';
  } else {
    mpRematchBtnEl.disabled = false;
    mpRematchBtnEl.textContent = '🔁 RIVINCITA';
    if (mine > theirs){
      mpResultTitleEl.textContent = '🏆 HAI VINTO!';
      SFX.trophy();
    } else if (mine < theirs){
      mpResultTitleEl.textContent = '😿 HAI PERSO';
      SFX.over();
    } else {
      mpResultTitleEl.textContent = '🤝 PAREGGIO';
    }
  }
  mpResultBoxEl.style.display = 'block';
  mpResultOpen = true;
  state = 'title';
  lastUIState = 'title';   // evita che il menù scelta cane si apra da solo dietro al risultato
  transitionAlpha = 1;
}
document.getElementById('mpResultOk').addEventListener('click', e => {
  e.stopPropagation(); uiClick();
  mpTeardownChannels();   // usciamo davvero: qui sì che il canale della partita va chiuso
  MP.resultShown = false;   // fondamentale: senza questo, la PROSSIMA sfida (un nuovo abbinamento
  // casuale) resta bloccata sul caricamento, perché mpHostMaybeStart si rifiuta di far partire
  // qualunque match finché "resultShown" è ancora true dalla partita precedente
  clearTimeout(MP.rematchWatchdog); MP.rematchWatchdog = null;
  mpResultBoxEl.style.display = 'none'; mpResultOpen = false;
  openDogSelect();
  updateInstallBtn();
});

// ---------- rivincita: stesso avversario, senza ripassare dalla ricerca casuale ----------
// chi vuole la rivincita lo segnala sul canale della partita (che resta aperto apposta dopo
// mpShowResult): quando ENTRAMBI hanno segnalato, l'host (che resta lo stesso della partita
// appena finita) manda un nuovo "start", esattamente come al primo abbinamento.
function mpRequestRematch(){
  if (!MP.matchCh || MP.peerGone || MP.rematchMine) return;
  MP.rematchMine = true;
  mpRematchBtnEl.disabled = true;
  mpRematchBtnEl.textContent = MP.rematchPeer ? '🔁 SI PARTE…' : '🔁 IN ATTESA…';
  mpRematchStatusEl.textContent = MP.rematchPeer
    ? 'Anche l\'avversario vuole la rivincita: si riparte!'
    : 'Richiesta inviata: aspettiamo che anche l\'avversario voglia la rivincita…';
  mpBroadcastRematchSignal();
  if (MP.isHost && MP.rematchPeer) mpHostStartRematch();
  // "cane da guardia": se dopo qualche secondo la partita non è ancora ripartita (per nessuno
  // dei due), probabilmente un messaggio si è perso per strada — avvisiamo invece di lasciare
  // chi aspetta bloccato per sempre su un testo che non cambia mai
  clearTimeout(MP.rematchWatchdog);
  MP.rematchWatchdog = setTimeout(() => {
    if (MP.started || MP.peerGone || !mpResultOpen) return;
    mpRematchStatusEl.textContent = 'Non riesco a confermare con l\'avversario. Torna al menù e riprova.';
  }, 9000);
}
document.getElementById('mpRematchBtn').addEventListener('click', e => {
  e.stopPropagation(); uiClick();
  mpRequestRematch();
});
// come per "start" (vedi mpBroadcastStart): un solo broadcast può perdersi, quindi rimandiamo
// il segnale "voglio la rivincita" un paio di volte extra finché non si sa già che l'avversario
// l'ha ricevuto (o finché la partita non è comunque ripartita per un altro motivo)
function mpBroadcastRematchSignal(){
  const send = () => { if (MP.matchCh && !MP.started) MP.matchCh.send({ type: 'broadcast', event: 'rematch', payload: {} }).catch(()=>{}); };
  send();
  setTimeout(send, 600);
  setTimeout(send, 1500);
}
function mpOnRematchSignal(){
  if (!MP.resultShown) return;
  if (!MP.rematchPeer){
    MP.rematchPeer = true;
    mpRematchStatusEl.textContent = MP.rematchMine
      ? 'Anche l\'avversario vuole la rivincita: si riparte!'
      : 'L\'avversario vuole la rivincita! Premi RIVINCITA per accettare.';
  }
  if (MP.isHost && MP.rematchMine) mpHostStartRematch();
}
function mpHostStartRematch(){
  if (!MP.isHost || !MP.matchCh || MP.started) return;
  const startAt = Date.now() + 2600;
  mpBroadcastStart(startAt);
  mpApplyStart({ startAt });
}
function mpRematchPeerLeft(){
  if (MP.peerGone) return;
  MP.peerGone = true;
  clearTimeout(MP.rematchWatchdog); MP.rematchWatchdog = null;
  mpRematchBtnEl.disabled = true;
  mpRematchBtnEl.textContent = '🔁 RIVINCITA';
  mpRematchStatusEl.textContent = 'Avversario disconnesso: niente rivincita.';
}

// ---------- update + draw della modalità online (chiamati da loop() al posto di update()/draw()) ----------
function mpUpdate(){
  const now = Date.now();
  particles = particles.filter(p => p.life > 0);
  particles.forEach(p => { p.x+=p.vx; p.y+=p.vy; p.vy+=0.15; p.life--; });
  MP.popups = MP.popups.filter(p => { p.t--; p.y -= 0.6; return p.t > 0; });
  if (msgTimer > 0) msgTimer--;
  // scenografia leggera (nuvole e barchette), sempre in movimento anche durante il conto alla rovescia
  clouds.forEach(c => { c.x += 0.15*c.s; if (c.x > W+80) c.x = -80; });
  boatTimer--;
  if (boatTimer <= 0 && boats.length < 3){ spawnBoat(); boatTimer = 300 + Math.random()*500; }
  boats.forEach(b => { b.x += b.vx; b.bob += 0.03; });
  boats = boats.filter(b => b.x > -90 && b.x < W+90);

  if (MP.ended) return;
  if (MP.startAt > now) return;   // conto alla rovescia sincronizzato: nessuno si muove ancora
  tickSimTimers();

  mpStepMyDog();
  mpLerpPeerDog();
  // scia turbo cosmetica sul cane avversario, se sta usando l'osso in questo momento
  if (MP.peerTarget && MP.peerTarget.turbo && MP.peerDog && Math.random() < 0.5){
    particles.push({ x: MP.peerDog.x - MP.peerDog.dir*26, y: MP.peerDog.y - 8 - Math.random()*14,
      vx: -MP.peerDog.dir*(1+Math.random()), vy: -Math.random(),
      life: 12+Math.random()*10, color: Math.random()<0.5 ? '#ffd23f' : '#fff' });
  }
  if (!MP.isHost){
    const stillFlying = [];
    MP.discs.forEach(d => {
      d.rot += 0.35;
      if (d.tx!==undefined){ d.x += (d.tx-d.x)*0.35; d.y += (d.ty-d.y)*0.35; }
      d.trail.push({x:d.x, y:d.y});
      if (d.trail.length > 18) d.trail.shift();
      // la presa la giudico io stesso, guardando il MIO cane vero (nessun ritardo di rete): prima
      // se ne accorgeva solo l'host guardando una copia della mia posizione vecchia di uno o due
      // giri di rete, e il frisbee sembrava passarmi in mezzo alle zampe senza essere preso
      const mouthX = MP.myDog.x + MP.myDog.dir*22, mouthY = MP.myDog.y - 26;
      if (Math.hypot(d.x-mouthX, d.y-mouthY) < 34){
        mpLocalCatchFx(d);
        MP.matchCh && MP.matchCh.send({ type:'broadcast', event:'catch', payload:{
          discId: d.id, air: !MP.myDog.onGround
        }}).catch(()=>{});
        return;   // sparisce subito dal mio schermo, non aspetto la conferma dell'host
      }
      stillFlying.push(d);
    });
    MP.discs = stillFlying;
    // stesso trattamento per gabbiano/granchio/osso condivisi: scivolano verso l'ultima posizione
    // nota invece di saltarci sopra ogni ~50ms, e le loro animazioni avanzano ad ogni frame qui
    // (non nell'update dell'host, che per noi arriva solo a scatti)
    if (gull){ gull.x += ((gull.tx??gull.x)-gull.x)*0.3; gull.y += ((gull.ty??gull.y)-gull.y)*0.3; gull.flap += 0.35; }
    if (crab){ crab.x += ((crab.tx??crab.x)-crab.x)*0.3; crab.walk += 0.25; }
    if (bone){
      bone.x += ((bone.tx??bone.x)-bone.x)*0.3;
      bone.y += ((bone.ty??bone.y)-bone.y)*0.3;
      if (!bone.falling) bone.t += 0.08;
    }
  }

  if (MP.matchCh && now - MP.lastSendT >= MP_SEND_MS){
    MP.lastSendT = now;
    MP.matchCh.send({ type: 'broadcast', event: 'dog', payload: {
      x: MP.myDog.x, y: MP.myDog.y, vx: MP.myDog.vx, dir: MP.myDog.dir,
      onGround: MP.myDog.onGround, jumpSpin: MP.myDog.jumpSpin, anim: MP.myDog.anim, stun: MP.myDog.stun,
      turbo: turbo > 0
    }}).catch(()=>{});
  }

  // avversario "sparito" senza un vero evento di uscita (rete caduta): dopo 6s di silenzio, chiudiamo
  if (MP.peerLast && now - MP.peerLast > 6000) mpOpponentLeft();

  if (MP.isHost) mpHostStep(now);

  MP.timeLeft--;
  if (MP.timeLeft <= 0 && MP.isHost) mpHostEndMatch('time');
}

function mpDraw(){
  ctx.save();
  const sky = ctx.createLinearGradient(0,0,0,H);
  sky.addColorStop(0,'#6fb8e6'); sky.addColorStop(0.62,'#bfe6f5'); sky.addColorStop(1,'#e8f6e0');
  ctx.fillStyle = sky; ctx.fillRect(0,0,W,H);

  // nuvole
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  clouds.forEach(c => {
    ctx.beginPath();
    ctx.arc(c.x, c.y, 22*c.s, 0, Math.PI*2);
    ctx.arc(c.x+24*c.s, c.y+4, 17*c.s, 0, Math.PI*2);
    ctx.arc(c.x-24*c.s, c.y+6, 15*c.s, 0, Math.PI*2);
    ctx.fill();
  });

  // mare, con le sue onde
  ctx.fillStyle = '#3f8fc9'; ctx.fillRect(0, GROUND-46, W, 46);
  ctx.fillStyle = 'rgba(255,255,255,.5)';
  for (let i=0;i<10;i++){
    const wx = (i*110 + (performance.now()/40 % 110));
    ctx.fillRect(wx, GROUND-40+(i%3)*14, 40, 3);
  }

  // barchette a vela
  boats.forEach(drawBoat);

  // gabbiano (davanti al mare, dietro alla sabbia)
  if (gull) drawGull();

  // sabbia
  ctx.fillStyle = '#f0dfa8'; ctx.fillRect(0, GROUND, W, H-GROUND);
  ctx.fillStyle = '#e2cd8a';
  for (let i=0;i<25;i++) ctx.fillRect((i*97)%W, GROUND+15+(i*37)%(H-GROUND-20), 8, 3);

  drawThrower();
  if (bone) drawBone();
  if (crab) drawCrab();

  const now = Date.now();
  if (MP.myDog) drawDog(MP.myDog, selectedDog().colors);
  if (MP.peerDog) drawDog(MP.peerDog, MP_PEER_COLORS);

  if (MP.startAt > now){
    const secs = Math.ceil((MP.startAt-now)/1000);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff'; ctx.font = 'bold 90px "Courier New"';
    ctx.fillText(secs > 0 ? String(secs) : 'VIA!', W/2, H/2);
  } else if (!MP.ended){
    MP.discs.forEach(d => drawDisc(d));
  }

  particles.forEach(p => {
    ctx.globalAlpha = p.life/30;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x-2, p.y-2, 5, 5);
  });
  ctx.globalAlpha = 1;

  MP.popups.forEach(p => {
    ctx.globalAlpha = Math.min(1, p.t/20);
    ctx.fillStyle = p.mine ? '#ffd23f' : '#ff8fa3';
    ctx.font = 'bold 20px "Courier New"'; ctx.textAlign = 'center';
    ctx.fillText(p.txt, p.x, p.y);
  });
  ctx.globalAlpha = 1;

  // messaggio centrale (GABBIANO! / TURBO! / OUCH! GRANCHIO! / DOPPIO! ecc., stesso stile del singolo giocatore)
  if (msgTimer > 0){
    ctx.textAlign = 'center';
    ctx.font = 'bold 44px "Courier New"';
    ctx.fillStyle = '#000';
    ctx.fillText(message, W/2+3, 163);
    ctx.fillStyle = '#ffd23f';
    ctx.fillText(message, W/2, 160);
  }

  // HUD (il punteggio dell'avversario va su una riga sua sotto al resto, non allineato a destra
  // sulla stessa riga del mio: lì i pulsanti osso/impostazioni/trofei/schermo intero, sempre
  // raggiungibili anche a partita in corso, lo coprivano su molti schermi)
  ctx.textAlign = 'left';
  ctx.font = 'bold 22px "Courier New"';
  ctx.fillStyle = '#ffd23f'; ctx.fillText('🐕 ' + (MP.myName||'TU').toUpperCase() + '  ' + MP.myScore, 16, 34);
  ctx.textAlign = 'right';
  ctx.font = 'bold 18px "Courier New"';
  ctx.fillStyle = '#ff8fa3'; ctx.fillText((MP.peerName||'AVVERSARIO').toUpperCase() + '  🐕  ' + MP.peerScore, W-16, 78);
  ctx.textAlign = 'center';
  const secsLeft = Math.max(0, Math.ceil(MP.timeLeft/60));
  ctx.fillStyle = '#fff'; ctx.font = 'bold 20px "Courier New"';
  ctx.fillText('⏱ ' + secsLeft + 's', W/2, 34);

  ctx.restore();
}

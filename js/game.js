// Partita in singolo: avvio, fine, lanci, fisica
// thrower (the player character) on the left
const thrower = { x: 175, y: GROUND };   // un po' più staccato dal bordo, così i comandi touch non lo coprono

// dog
const dog = {
  x: W*0.55, y: GROUND, vx: 0, vy: 0,
  w: 54, h: 34, onGround: true, dir: 1, jumpSpin: 0, anim: 0, stun: 0
};

// frisbee (può essercene più di uno in volo!)
let discs = [];
let pendingThrows = 0;

function startGame(){
  // primo avvio in assoluto: prima spiega i comandi, poi gioca davvero
  maybeShowTutorial(startGameReal);
}
function startGameReal(){
  const d = DIFF[difficulty];
  state='play'; score=0; catches=0; round=0; misses=0; thrown=0; streak=0;
  maxMiss=Math.max(1, d.startLives+dogVitalityBonus()); nextLife=2000;
  dog.x=W*0.55; dog.y=GROUND; dog.vx=0; dog.vy=0; dog.stun=0; dog.grace=0;
  gull=null; gullTimer=500*d.hazardMul; crab=null; crabTimer=700*d.hazardMul;
  bone=null; boneTimer=1000*d.hazardMul; turbo=0; turboMax=TURBO_TIME; airJumps=0; lastJumpHeld=false;
  newRecord=false; bestAtStart=best; fwTimer=0; overT=0;
  paused=false; gameGold=0; gameAir=0; gameBones=0; resetGameCounters();
  discs=[]; pendingThrows=0;
  camShake=0; transitionAlpha=1;
  setMessage('ROUND 1', 90);
  audio(); startAmbient(); SFX.round(); startMusic();
  ensureDaily();
  if (!SET.training) bumpPlayStreak();
  clearSimTimers();
  later(Math.round(54*d.spawnMul), launchDisc);   // ~0.9s
}

// fine partita: aggiorna il record e apre la classifica/il nome se il punteggio ci entra
function endRound(){
  state = 'over';
  transitionAlpha = 1; triggerShake(5, 16);
  stopMusic();
  if (score > bestAtStart && score > 0) newRecord = true;
  newRecord ? SFX.record() : SFX.over();
  // sicurezza in più: in modalità allenamento il punteggio non deve MAI contare per record,
  // ossa, livello del cane o classifica (oltre al fatto che qui non si arriva mai in allenamento,
  // perché i blocchi miss sopra evitano proprio la chiamata a endRound in quel caso)
  if (SET.training) return;
  lifeStats.games++; saveLifeStats(); checkLifeTiers();
  if (score > best){ best = score; localStorage.setItem('dd_best', best); }
  // ossa raccolte in questa partita: si sommano al gruzzolo permanente per potenziare Fio
  roundBonesEarned = gameBones;
  if (roundBonesEarned > 0){ dogBones += roundBonesEarned; saveDogProgress(); }
  // livello giocatore: il punteggio si somma all'esperienza totale accumulata in tutte le partite
  if (score > 0){
    const prevRank = rankIndex(totalXP);
    totalXP += score;
    localStorage.setItem('dd_xp', totalXP);
    const newRank = rankIndex(totalXP);
    if (newRank > prevRank){
      showTrophyMsg('🎖️ Nuovo livello: ' + RANKS[newRank].name + '!', 170);
      SFX.trophy();
      // un nuovo salto di livello può sbloccare anche una nuova razza di cane
      DOGS.filter(d => d.unlockRank > prevRank && d.unlockRank <= newRank).forEach(d => {
        showTrophyMsg('🐕 Nuovo cane sbloccato: ' + d.name + '!', 170);
        SFX.trophy();
      });
    }
  }
  if (qualifies(score)) askName();
}

function setMessage(t, frames){ message=t; msgTimer=frames; }

// ---------- FRISBEE LAUNCH ----------
function spawnDisc(){
  const power = Math.min(1, 0.55 + round*0.06);           // gets harder
  // i lanci molto alti (che servono il doppio salto per essere presi) escono
  // solo mentre il turbo dell'osso è attivo; altrimenti restano alla portata di un salto normale
  const highOk = turbo > 0;
  const vy0 = highOk ? -(9 + Math.random()*4) : -(7 + Math.random()*2);
  const d = {
    x: thrower.x + 30, y: thrower.y - 60,
    vx: (5 + Math.random()*4*power + round*0.25) * DIFF[difficulty].speedMul,
    vy: vy0,
    curve: (Math.random()*2-1) * (1.5 + round*0.2),       // curva!
    rot: 0, trail: [], bounces: 0, dead: null,
    gold: Math.random() < (0.08 + dogLuckBonus()),        // raro: ~1 lancio su 12 (di più con la Fortuna)
    boomerang: Math.random() < 0.12, bt: 0                // ogni tanto torna indietro!
  };
  // la CIABATTA: dal 3° round, ogni tanto il lanciatore tira per sbaglio una ciabatta invece del
  // frisbee. Va lasciata cadere (piccolo bonus "SCHIVATA!"): se la prendi in bocca, Fio si ferma
  // un attimo disgustato e la combo si azzera. Non costa mai una vita.
  d.trap = !d.gold && !d.boomerang && round >= 3 && Math.random() < 0.12;
  if (d.boomerang){
    // volo dedicato: vola dritto fino quasi al bordo dello schermo, poi torna,
    // sempre in aria (niente rimbalzi che lo farebbero fermare a metà corsa)
    d.vx0 = 9 + Math.random()*3;                // velocità costante, non legata al round
    d.y0 = d.y; d.x0 = d.x;                     // punto di partenza: qui deve tornare
    const apexDist = W * 0.60;                  // quanto va lontano prima di girare
    d.bT = apexDist * Math.PI / d.vx0;          // durata dell'andata, calcolata per arrivarci sempre
    d.vx = d.vx0;
  }
  discs.push(d);
  if (!d.trap) thrown++;   // la ciabatta non conta nelle statistiche delle prese
  throwAnim = 16;
  SFX.throw_();
  if (d.gold) SFX.goldSpawn();
  if (d.boomerang) SFX.boomSpawn();
  if (d.trap){ SFX.trapSpawn(); setMessage('OCCHIO: CIABATTA!', 50); }
}
function launchDisc(){
  if (state!=='play') return;
  round++;
  if (round >= 9) award('night');
  spawnDisc();
  // doppio frisbee dai round avanzati!
  if (round >= 6 && Math.random() < 0.25){
    pendingThrows++;
    setMessage('DOPPIO!', 55);
    later(27, () => {   // ~0.45s
      pendingThrows--;
      if (state==='play') spawnDisc();
    });
  }
}

// ---------- PHYSICS ----------
function update(){
  if (paused && state === 'play') return;   // pausa: tutto fermo

  const dnU = dayNight();
  // delfini di giorno
  dolphinTimer--;
  if (dolphinTimer <= 0 && dnU.night < 0.4 && dolphins.length < 2){
    const dir = Math.random() < 0.5 ? 1 : -1;
    const n = Math.random() < 0.3 ? 2 : 1;   // a volte in coppia!
    for (let i=0;i<n;i++) dolphins.push({
      x: (dir > 0 ? -30 : W+30) - dir*i*55,
      y0: GROUND - 30, dir, t: -i*0.18
    });
    dolphinTimer = 500 + Math.random()*700;
  }
  dolphins.forEach(d => {
    d.t += 0.018;
    d.x += d.dir * 2.2;
    if (d.t > -0.01 && d.t < 0.03) puff(d.x, d.y0+6, 'rgba(255,255,255,.9)', 5);
    if (d.t > 0.97 && d.t < 1.0) puff(d.x, d.y0+6, 'rgba(255,255,255,.9)', 5);
  });
  dolphins = dolphins.filter(d => d.t < 1.05 && d.x > -60 && d.x < W+60);

  // stelle cadenti di notte
  shooterTimer--;
  if (shooterTimer <= 0 && dnU.night > 0.6){
    shooters.push({
      x: W*0.3 + Math.random()*W*0.7, y: 30 + Math.random()*100,
      vx: -(5 + Math.random()*4), vy: 2 + Math.random()*1.5,
      life: 45, trail: []
    });
    shooterTimer = 250 + Math.random()*500;
  }
  shooters.forEach(s => {
    s.trail.push({x:s.x, y:s.y});
    if (s.trail.length > 14) s.trail.shift();
    s.x += s.vx; s.y += s.vy; s.life--;
  });
  shooters = shooters.filter(s => s.life > 0);

  // scenografia extra: temporale vero (nuvole, pioggia, tuoni, fulmini), poi arcobaleno
  if (!weather){
    weatherTimer--;
    if (weatherTimer <= 0 && dnU.night < 0.2){
      weather = { phase:'storm', t:0 };
      // sparse subito su tutto il cielo (non solo fuori schermo a sinistra), così la copertura
      // nuvolosa è già presente quando l'intensità del temporale arriva al culmine
      stormClouds = Array.from({length:8}, () => ({ x: Math.random()*(W+200)-100, y:10+Math.random()*80, s:.9+Math.random()*.6 }));
      raindrops = [];
      thunderTimer = 120 + Math.random()*150;
    }
  } else if (weather.phase === 'storm'){
    weather.t++;
    const inten = stormIntensity(weather.t);
    // nuvole scure che scorrono, rimpiazzate finché il temporale non sta finendo
    stormClouds.forEach(c => c.x += 0.7);
    stormClouds = stormClouds.filter(c => c.x < W+170);
    if (stormClouds.length < 8 && weather.t < STORM_TOTAL-STORM_FADE && Math.random() < 0.04){
      stormClouds.push({ x:-140, y:10+Math.random()*80, s:.9+Math.random()*.6 });
    }
    // pioggia: intensità (numero di gocce generate) proporzionale alla fase del temporale
    if (inten > 0.05){
      const drops = Math.round(inten*3.5);
      for (let i=0;i<drops;i++) raindrops.push({ x: Math.random()*(W+200)-100, y:-10, vy:11+Math.random()*4, len:10+Math.random()*9 });
      if (Math.random() < inten*0.2) puff(Math.random()*W, GROUND+2, 'rgba(210,225,245,.55)', 2);
    }
    raindrops.forEach(r => { r.y += r.vy; r.x -= 2.2; });
    raindrops = raindrops.filter(r => r.y < GROUND+10);
    // tuoni e fulmini, solo quando il temporale è al culmine
    if (lightning > 0) lightning--;
    thunderTimer--;
    if (thunderTimer <= 0 && inten > 0.5){
      lightning = 6;
      SFX.thunder();
      thunderTimer = 220 + Math.random()*280;
    }
    if (weather.t >= STORM_TOTAL){
      weather = { phase:'rainbow', t:0 };
      raindrops = []; stormClouds = [];
    }
  } else if (weather.phase === 'rainbow'){
    weather.t++;
    if (weather.t > RAINBOW_TOTAL){ weather = null; weatherTimer = 1800 + Math.random()*1400; }
  }

  // barchette (anche nei menu, fanno scena)
  boatTimer--;
  if (boatTimer <= 0 && boats.length < 3){ spawnBoat(); boatTimer = 300 + Math.random()*500; }
  boats.forEach(b => { b.x += b.vx; b.bob += 0.03; });
  boats = boats.filter(b => b.x > -90 && b.x < W+90);

  // particelle, nuvole e messaggi si muovono anche nei menu
  particles = particles.filter(p => p.life > 0);
  particles.forEach(p => { p.x+=p.vx; p.y+=p.vy; p.vy+=0.15; p.life--; });
  clouds.forEach(c => { c.x += 0.15*c.s; if (c.x > W+80) c.x = -80; });
  if (msgTimer > 0) msgTimer--;
  if (trophyTimer > 0){
    trophyTimer--;
    if (trophyTimer <= 0 && trophyQueue.length){
      const nxt = trophyQueue.shift();
      trophyMsg = nxt.msg; trophyTimer = nxt.dur;
    }
  }

  // effetti camera: la scossa si esaurisce
  if (camShake > 0) camShake--;
  if (throwAnim > 0) throwAnim--;
  // dissolvenza tra le schermate
  if (transitionAlpha > 0) transitionAlpha = Math.max(0, transitionAlpha - 0.06);

  // spruzzo di schiuma occasionale sulla battigia, solo per atmosfera
  if (Math.random() < 0.012){
    const wx = Math.random()*W;
    particles.push({ x:wx, y:GROUND-44, vx:(Math.random()*2-1)*0.4, vy:-0.3-Math.random()*0.4,
      life: 18+Math.random()*14, color:'rgba(255,255,255,.8)' });
  }

  // festa del record al game over: fuochi d'artificio e Fio che corre avanti e indietro abbaiando
  if (state === 'over' && newRecord){
    fwTimer--;
    if (fwTimer <= 0){
      burst(80 + Math.random()*(W-160), 60 + Math.random()*160,
            FW_COLORS[Math.floor(Math.random()*FW_COLORS.length)]);
      SFX.pop();
      fwTimer = 22 + Math.random()*30;
    }
    overT += 0.11;
    const RUN_SPEED = 5.5;
    dog.x += RUN_SPEED * dog.dir;
    dog.y = GROUND - Math.abs(Math.sin(overT))*10;   // piccolo saltello mentre corre
    dog.anim += 0.28;
    if (dog.x > W-50){ dog.x = W-50; dog.dir = -1; SFX.bark(); }
    if (dog.x < 50){ dog.x = 50; dog.dir = 1; SFX.bark(); }
  }

  if (state !== 'play') return;
  tickSimTimers();

  // dog movement
  if (turbo > 0) turbo--;
  const SPEED = (turbo > 0 ? 7.6 : 5.2) * dogSpeedMul();
  dog.vx = 0;
  const jumpHeld = !!(keys['Space']||keys['ArrowUp']);
  // al livello massimo di Salto, il doppio salto in aria resta disponibile anche senza turbo
  const doubleJumpAvailable = turbo > 0 || curLevels().jump >= dogStatMax('jump');
  if (dog.stun > 0){
    dog.stun--;
  } else {
    const keyDir = (keys['ArrowLeft']?-1:0) + (keys['ArrowRight']?1:0);
    const moveInput = keyDir !== 0 ? keyDir : joyDir; // tastiera prioritaria, altrimenti joystick analogico
    if (Math.abs(moveInput) > 0.08){ dog.vx = SPEED * moveInput; dog.dir = moveInput < 0 ? -1 : 1; }
    if (jumpHeld && dog.onGround){
      dog.vy = -12.5 * dogJumpMul(); dog.onGround = false; dog.jumpSpin = 0; airJumps = 0;
      SFX.jump();
    } else if (jumpHeld && !lastJumpHeld && !dog.onGround && doubleJumpAvailable && airJumps < 1){
      // doppio salto turbo!
      dog.vy = -11 * dogJumpMul(); airJumps++;
      SFX.jump();
      puff(dog.x, dog.y, '#ffd23f', 8);
    }
  }
  lastJumpHeld = jumpHeld;
  // scia turbo
  if (turbo > 0 && Math.abs(dog.vx) > 0 && Math.random() < 0.5){
    particles.push({ x: dog.x - dog.dir*26, y: dog.y - 8 - Math.random()*14,
      vx: -dog.dir*(1+Math.random()), vy: -Math.random(),
      life: 12+Math.random()*10, color: Math.random()<0.5 ? '#ffd23f' : '#fff' });
  }
  // sabbia sollevata dalla corsa (solo a terra, niente turbo attivo)
  if (turbo <= 0 && dog.onGround && Math.abs(dog.vx) > 0 && Math.random() < 0.6){
    particles.push({ x: dog.x - dog.dir*22, y: dog.y + 2,
      vx: -dog.dir*(0.4+Math.random()*0.6) + dog.vx*0.15, vy: -0.6-Math.random()*0.6,
      life: 10+Math.random()*8, color: '#d9c088' });
  }
  dog.x += dog.vx;
  dog.vy += 0.55;
  dog.y += dog.vy;
  if (dog.y >= GROUND){ dog.y = GROUND; dog.vy = 0; dog.onGround = true; dog.jumpSpin = 0; airJumps = 0; }
  if (!dog.onGround) dog.jumpSpin += 0.25;
  dog.x = Math.max(20, Math.min(W-20, dog.x));
  dog.anim += Math.abs(dog.vx)*0.08 + 0.02;

  // ---- gabbiano dispettoso ----
  gullTimer--;
  if (gullTimer <= 0 && !gull){
    const dir = Math.random() < 0.5 ? 1 : -1;
    gull = {
      x: dir > 0 ? -50 : W+50, y: 60 + Math.random()*130,
      vx: dir * (2.2 + Math.random()*1.6), flap: 0, hit: false,
      carry: false, dropX: 0
    };
    // se è ora dell'osso, lo porta il gabbiano!
    if (boneTimer <= 0 && !bone && turbo <= 0){
      gull.carry = true;
      gull.dropX = 120 + Math.random()*(W-240);
    }
  }
  if (gull){
    gull.x += gull.vx;
    gull.y += Math.sin(gull.flap*0.5)*0.6;
    gull.flap += 0.35;
    // se tocca un frisbee, lo devia!
    for (const d of discs){
      if (!gull.hit && Math.abs(d.x-gull.x) < 24 && Math.abs(d.y-gull.y) < 18){
        gull.hit = true;
        d.vy = (Math.random()<0.5 ? -1 : 1) * (2 + Math.random()*3);
        d.vx *= 0.6 + Math.random()*0.7;
        d.curve = -d.curve * 1.6;
        setMessage('GABBIANO!', 50);
        SFX.squawk();
        puff(gull.x, gull.y, '#ffffff', 12);
      }
    }
    // sgancia l'osso sul punto scelto
    if (gull.carry && Math.abs(gull.x - gull.dropX) < 8){
      gull.carry = false;
      bone = { x: gull.x, y: gull.y + 16, vy: 0.5, falling: true, t: 0, life: 650 };
      SFX.squawk();
    }
    if (gull.x < -70 || gull.x > W+70){ gull = null; gullTimer = (350 + Math.random()*550) * DIFF[difficulty].hazardMul; }
  }

  // ---- granchio sulla sabbia ----
  crabTimer--;
  if (crabTimer <= 0 && !crab){
    const dir = Math.random() < 0.5 ? 1 : -1;
    crab = {
      x: dir > 0 ? -40 : W+40, vx: dir * (1.1 + Math.random()*0.9), walk: 0
    };
  }
  if (crab){
    crab.x += crab.vx;
    crab.walk += 0.25;
    // pizzica Fio se lo tocca a terra (con breve tregua dopo un pizzico)
    if (dog.grace > 0) dog.grace--;
    if (dog.stun <= 0 && !dog.grace && dog.onGround && Math.abs(dog.x-crab.x) < 32){
      dog.stun = 55; dog.grace = 130;
      streak = 0;                       // il granchio azzera anche la combo!
      setMessage('OUCH! GRANCHIO!', 55);
      SFX.ouch();
      puff(dog.x, dog.y-16, '#ff5a5a', 10);
      triggerShake(4, 12);
    }
    if (crab.x < -60 || crab.x > W+60){ crab = null; crabTimer = (500 + Math.random()*800) * DIFF[difficulty].hazardMul; }
  }

  // ---- osso turbo (consegnato dal gabbiano) ----
  boneTimer--;
  // se l'osso è in ritardo e non c'è un gabbiano in giro, chiamalo prima
  if (boneTimer <= 0 && !bone && turbo <= 0 && !gull && gullTimer > 90) gullTimer = 90;
  if (bone){
    if (bone.falling){
      bone.vy += 0.35;
      bone.y += bone.vy;
      if (bone.y >= GROUND + 18){
        bone.y = GROUND + 18; bone.falling = false;
        puff(bone.x, GROUND + 14, '#e8d8a0', 8);
      }
    } else {
      bone.t += 0.08;
      bone.life--;
    }
    const preso = bone.falling
      ? Math.hypot(dog.x + dog.dir*22 - bone.x, (dog.y - 26) - bone.y) < 36   // al volo!
      : (dog.y >= GROUND-6 && Math.abs(dog.x - bone.x) < 32);                 // da terra
    if (preso){
      turboMax = Math.round(TURBO_TIME * dogTurboMul());
      turbo = turboMax;
      gameBones++; if (gameBones >= 3) award('bone3');
      gc.bones++; if (bone.falling) gc.boneAir++;
      lifeStats.bones++; saveLifeStats(); checkLifeTiers();
      setMessage(bone.falling ? 'OSSO AL VOLO! TURBO!' : 'TURBO!', 60);
      SFX.turbo();
      puff(bone.x, bone.y, '#ffd23f', 16);
      bone = null; boneTimer = (800 + Math.random()*900) * DIFF[difficulty].hazardMul;
    } else if (!bone.falling && bone.life <= 0){
      bone = null; boneTimer = (700 + Math.random()*800) * DIFF[difficulty].hazardMul;
    }
  }

  // discs (anche più di uno in volo)
  const hadDiscs = discs.length > 0;
  for (const d of discs){
    d.trail.push({x:d.x, y:d.y});
    if (d.trail.length > 18) d.trail.shift();

    if (d.boomerang){
      // volo dedicato: fila dritto verso il bordo dello schermo, poi torna indietro morbidamente,
      // restando sempre in aria (nessun rimbalzo che lo interrompa a metà corsa)
      d.bt++;
      const p = Math.min(d.bt / d.bT, 1);
      d.vx = d.vx0 * Math.cos(p * Math.PI);           // da +vx0 a 0 a -vx0, con dolcezza
      d.x += d.vx;
      d.y = d.y0 - Math.sin(p * Math.PI) * 80;        // leggero arco in salita e ridiscesa
      d.rot += 0.35;
      if (d.bt === Math.round(d.bT/2)) SFX.boomTurn();  // il momento in cui inverte rotta
      // scia viola per tutto il volo
      if (Math.random() < 0.3){
        particles.push({
          x: d.x + (Math.random()*2-1)*8, y: d.y + (Math.random()*2-1)*6,
          vx:(Math.random()*2-1)*0.6, vy:-Math.random()*0.6,
          life: 14+Math.random()*14, color: Math.random()<0.5 ? '#8a6bff' : '#d8ccff'
        });
      }
    } else {
      d.vy += 0.32;
      d.vx += d.curve * 0.02;                 // curva in volo
      d.vx *= 0.999;
      d.x += d.vx;
      d.y += d.vy;
      d.rot += 0.35;

      // scia scintillante del frisbee dorato
      if (d.gold && Math.random() < 0.35){
        particles.push({
          x: d.x + (Math.random()*2-1)*10, y: d.y + (Math.random()*2-1)*6,
          vx:(Math.random()*2-1)*0.8, vy:-Math.random()*0.8,
          life: 15+Math.random()*15, color: Math.random()<0.5 ? '#ffd23f' : '#fff7d0'
        });
      }

      // ground bounce (max 2, then it's a miss when it stops/offscreen)
      if (d.y > GROUND + 8 && d.vy > 0){
        d.y = GROUND + 8;
        d.vy *= -0.55;
        d.vx *= 0.75;
        d.bounces++;
        SFX.bounce();
        puff(d.x, GROUND+10, '#e8d8a0', 6);
      }
    }

    // catch check: dog mouth zone
    const mouthX = dog.x + dog.dir*22, mouthY = dog.y - 26;
    if (d.trap && Math.hypot(d.x-mouthX, d.y-mouthY) < 30){
      // ciabatta presa in bocca: niente punti, Fio si blocca un attimo e la combo si azzera
      d.dead = 'trap';
      streak = 0; gc.boomChain = 0; gc.trapCaught++;
      dog.stun = Math.max(dog.stun, 45);
      setMessage('BLEAH! CIABATTA!', 60);
      SFX.ouch();
      puff(d.x, d.y, '#3fa7ff', 14);
      triggerShake(3, 10);
      continue;
    }
    if (!d.trap && Math.hypot(d.x-mouthX, d.y-mouthY) < 34){
      const air = !dog.onGround;
      const spinBonus = Math.floor(dog.jumpSpin / (Math.PI*2));
      streak++;
      const mult = Math.min(streak, 5);   // combo: x1, x2 ... fino a x5
      let pts = 100;
      if (air) pts = 250 + spinBonus*150;
      if (d.gold) pts = 500 + (air ? spinBonus*150 : 0);
      if (d.boomerang) pts += 50;             // bonus per la ripresa al rientro
      pts *= mult;
      const tag = mult > 1 ? ` x${mult}` : '';
      const boomTag = d.boomerang ? ' 🪃' : '';
      if (d.gold){
        setMessage(`GOLDEN! +${pts}${tag}${boomTag}`, 80);
        SFX.golden();
        puff(d.x, d.y, '#ffd23f', 30);
        puff(d.x, d.y, '#fff7d0', 15);
      } else if (d.boomerang){
        setMessage(`BOOMERANG! +${pts}${tag}`, 65);
        SFX.acro();
        puff(d.x, d.y, '#8a6bff', 22);
        puff(d.x, d.y, '#d8ccff', 12);
      } else {
        setMessage((air ? `ACROBATIC! +${pts}` : `+${pts}`) + tag, 60);
        air ? SFX.acro() : SFX.catch_();
        puff(d.x, d.y, air ? '#ffd23f' : '#7ec8e3', air?20:10);
      }
      score += pts; catches++;
      d.dead = 'caught';
      SFX.bark();   // woof woof!
      // tratto unico di Sprint: le prese consecutive senza errori ricaricano un po' di turbo
      if (selectedDog().trait === 'turboChain' && streak >= 2){
        turbo = Math.min(turboMax, turbo + 14);
      }
      // trofei
      award('first');
      if (mult >= 5) award('combo5');
      if (streak >= 10) award('ten');
      if (d.gold){ gameGold++; if (gameGold >= 3) award('gold3'); }
      if (air){ gameAir++; if (gameAir >= 10) award('acro10'); }
      if (score >= 10000) award('legend');
      lifeStats.catches++;
      if (d.gold) lifeStats.gold++;
      if (air) lifeStats.air++;
      saveLifeStats(); checkLifeTiers();
      checkDaily({ gold:gameGold, mult, bones:gameBones, score, streak, air:gameAir, round, catches });
      gc.catches++;
      if (air) gc.air++;
      if (d.gold){ gc.gold++; if (air) gc.goldAir++; }
      if (d.boomerang){ gc.boom++; gc.boomChain++; }
      if (turbo > 0) gc.turboCatches++;
      checkMission(missionCounters());
      // record battuto in diretta!
      if (!newRecord && bestAtStart > 0 && score > bestAtStart){
        newRecord = true;
        setMessage('NUOVO RECORD!', 90);
        SFX.record();
        burst(W/2, 150, '#ffd23f');
        burst(W/2-120, 190, '#7ec8e3');
        burst(W/2+120, 190, '#ff5a5a');
        triggerShake(7, 26);
      }
      // vita extra ogni 2000 punti!
      while (score >= nextLife){
        nextLife += 2000;
        if (misses > 0){
          misses--;
          setMessage('MISS RECUPERATO! ♥', 75);
          SFX.life();
        } else if (maxMiss < 5){
          maxMiss++;
          setMessage('VITA EXTRA! ♥', 75);
          SFX.life();
        }
      }
      continue;
    }

    // il boomerang non preso torna dal lanciatore e finisce lì (non esce dallo schermo)
    if (d.boomerang && d.bt >= d.bT && d.x <= d.x0){
      d.dead = 'miss';
      misses++;
      streak = 0; gc.boomChain = 0;
      setMessage('TORNATO AL LANCIATORE', 55);
      puff(d.x0, d.y0, '#8a6bff', 12);
      if (misses >= maxMiss){
        if (SET.training){ misses = 0; setMessage('ALLENAMENTO: si continua!', 60); SFX.whine(); }
        else endRound();
      } else {
        SFX.whine();
      }
      continue;
    }

    // miss: offscreen or stopped bouncing
    if (d.trap && (d.x > W+40 || d.x < -40 || d.bounces >= 1)){
      // ciabatta lasciata cadere: bravo! piccolo bonus, e la combo resta intatta
      d.dead = 'dodged';
      gc.trapDodged++;
      score += 50;
      setMessage('SCHIVATA! +50', 45);
      SFX.dodge();
      checkMission(missionCounters());
      continue;
    }
    if (d.x > W+40 || d.x < -40 || (d.bounces >= 2 && d.vy > -1 && d.y >= GROUND+7)){
      d.dead = 'miss';
      gc.boomChain = 0;
      misses++;
      streak = 0;   // la combo si azzera
      setMessage('MISS!', 60);
      if (misses >= maxMiss){
        if (SET.training){ misses = 0; setMessage('ALLENAMENTO: si continua!', 60); SFX.miss(); SFX.whine(); }
        else endRound();
      } else {
        SFX.miss();
        SFX.whine();   // guaito dispiaciuto
      }
    }
  }
  discs = discs.filter(d => !d.dead);
  // quando non c'è più niente in volo (e niente in arrivo), nuovo lancio
  if (state === 'play' && hadDiscs && discs.length === 0 && pendingThrows === 0){
    later(Math.round(51*DIFF[difficulty].spawnMul), launchDisc);   // ~0.85s
  }

  // controllo di sicurezza: copre anche le sfide del giorno che dipendono da eventi non legati
  // a una presa (es. "resisti fino a notte fonda", "prendi 2 ossi") — quella sulla presa qui sopra
  // basta per la maggior parte dei casi, ma qui non si rischia di perdere il momento giusto
  if (state === 'play'){
    checkDaily({ gold:gameGold, mult:Math.min(streak,5), bones:gameBones, score, streak, air:gameAir, round, catches });
    checkMission(missionCounters());
  }
}

// dove il frisbee passerà all'altezza della bocca di Fio (ricalcolato ogni frame, quindi segue
// anche le deviazioni del gabbiano): stessa fisica di update(), simulata in avanti. null se esce
// dallo schermo prima. Usato dall'ombra di aiuto (impostazione "Mostra dove atterra il frisbee")
// e dal cane-bot della sfida contro il computer.
function predictCatchX(d){
  if (d.boomerang) return null;
  let x = d.x, y = d.y, vx = d.vx, vy = d.vy;
  const curve = d.curve || 0, catchY = GROUND - 26;
  for (let i = 0; i < 300; i++){
    vy += 0.32; vx += curve * 0.02; vx *= 0.999;
    x += vx; y += vy;
    if (x > W + 40 || x < -40) return null;
    if (vy > 0 && y >= catchY) return x;
  }
  return null;
}

function puff(x,y,color,n){
  for (let i=0;i<n;i++) particles.push({
    x, y, vx:(Math.random()*2-1)*3, vy:-Math.random()*3,
    life: 20+Math.random()*20, color
  });
}

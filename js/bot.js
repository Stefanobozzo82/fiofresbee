// Sfida contro il computer: quando nessuno è online (o non c'è connessione) si gioca la stessa
// arena della sfida online contro un cane guidato dal gioco. Riusa tutta la logica di multiplayer.js
// con noi nel ruolo di "host" (arbitro di frisbee, ostacoli e punti) e il bot come "ospite":
// nessun canale di rete, il cane avversario lo muove botStep() qui sotto, un passo di gioco alla volta.
const BOT_NAMES = ['FIDO-BOT', 'ROBO-REX', 'BRICIOLA-BOT', 'CIP-BOT', 'MICROCHIP'];
// il bot si adatta alla difficoltà scelta: più lento a reagire, meno preciso e un po' più lento a correre in FACILE
// err = imprecisione normale (px); miss = probabilità di "leggere male" un lancio e mancarlo del tutto
const BOT_LEVEL = {
  easy:   { err: 30, miss: 0.60, speed: 0.80, react: 16, jumpProb: 0.08 },
  normal: { err: 20, miss: 0.40, speed: 0.90, react: 11, jumpProb: 0.14 },
  hard:   { err: 10, miss: 0.20, speed: 1.00, react: 7,  jumpProb: 0.22 }
};
const BOT = { targetX: 0, disc: null, thinkT: 0, turbo: 0, airJumps: 0, aim: {} };

function botLevel(){ return BOT_LEVEL[difficulty] || BOT_LEVEL.normal; }

function mpStartBotMatch(){
  mpCleanupLobby();
  if (MP.matchCh){ try { MP.matchCh.unsubscribe(); } catch(e){} MP.matchCh = null; }
  MP.searching = false;
  MP.isBot = true; MP.isHost = true;
  MP.matchId = 'bot'; MP.peerId = 'bot';
  MP.peerName = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
  if (!MP.myId) MP.myId = mpUid();
  MP.myName = ((localStorage.getItem('dd_name')||'').trim() || 'TU').slice(0,14);
  MP.started = false; MP.resultShown = false; MP.peerLast = 0; MP.peerTarget = null;
  BOT.targetX = W * 0.5; BOT.disc = null; BOT.thinkT = 0; BOT.turbo = 0; BOT.airJumps = 0; BOT.aim = {};
  mpApplyStart({ startAt: Date.now() + 2600 });
}

document.getElementById('mpBot').addEventListener('click', e => {
  e.stopPropagation(); uiClick();
  mpStartBotMatch();
});

function botGotTurbo(){ BOT.turbo = TURBO_TIME; }

// errore di mira deciso UNA volta per ogni frisbee (non a ogni ripensamento, altrimenti gli errori
// si compenserebbero e il bot sarebbe infallibile): di solito piccolo, a volte un lancio letto male
function botAimError(d){
  if (BOT.aim[d.id] === undefined){
    const lv = botLevel();
    const bad = Math.random() < lv.miss;
    const side = Math.random() < 0.5 ? -1 : 1;
    BOT.aim[d.id] = { off: bad ? side * (60 + Math.random() * 70) : (Math.random() * 2 - 1) * lv.err, bad };
  }
  return BOT.aim[d.id];
}

// sceglie ogni tanto (non ad ogni frame: così ha un "tempo di reazione" umano) il frisbee più
// comodo da raggiungere e il punto in cui aspettarlo, con il suo errore di mira
function botThink(b){
  const lv = botLevel();
  BOT.thinkT = lv.react + Math.floor(Math.random() * lv.react);
  let best = null;
  for (const d of MP.discs){
    if (d.dead) continue;
    // i frisbee già scesi sotto l'altezza della presa (che rimbalzano a terra) il bot li lascia
    // perdere: è il suo piccolo svantaggio rispetto a un giocatore vero, che può ancora rincorrerli
    if (!d.boomerang && d.y > GROUND - 30) continue;
    const tx = d.boomerang ? d.x + (d.vx || 0) * 14 : predictCatchX(d);
    if (tx === null || tx < 20 || tx > W - 20) continue;
    const dist = Math.abs(tx - b.x);
    if (!best || dist < best.dist) best = { d, tx, dist };
  }
  if (best){
    BOT.disc = best.d;
    const side = best.tx >= b.x ? 1 : -1;   // la bocca sta 22px davanti al muso, nella direzione di corsa
    BOT.targetX = best.tx - side * 22 + botAimError(best.d).off;
  } else {
    // niente in volo: torna verso il centro del campo, pronto per il prossimo lancio
    BOT.disc = null;
    BOT.targetX = W * 0.58 + Math.sin(performance.now() / 900) * 60;
  }
}

function botStep(){
  const b = MP.peerDog;
  if (!b) return;
  const lv = botLevel();
  if (BOT.turbo > 0) BOT.turbo--;
  if (--BOT.thinkT <= 0) botThink(b);
  b.vx = 0;
  if (b.stun > 0){
    b.stun--;
  } else {
    const dx = BOT.targetX - b.x;
    const speed = (BOT.turbo > 0 ? 7.6 : 5.2) * lv.speed;
    if (Math.abs(dx) > 6){
      b.vx = Math.sign(dx) * Math.min(speed, Math.abs(dx));
      b.dir = dx < 0 ? -1 : 1;
    } else if (BOT.disc && !BOT.disc.dead){
      b.dir = BOT.disc.x < b.x ? -1 : 1;   // fermo ad aspettarlo: guarda verso il frisbee
    }
    // salto: se il frisbee sta passando sopra la testa, più in alto della bocca
    const d = BOT.disc;
    // (solo per i lanci che ha letto bene: su quelli letti male non si accorge in tempo di doverlo fare)
    if (d && !d.dead && !botAimError(d).bad){
      const mouthX = b.x + b.dir * 22, mouthY = b.y - 26;
      const above = mouthY - d.y;
      if (Math.abs(d.x - mouthX) < 80 && above > 40 && above < 190 && Math.random() < lv.jumpProb){
        if (b.onGround){
          b.vy = -12.5; b.onGround = false; b.jumpSpin = 0; BOT.airJumps = 0;
        } else if (BOT.turbo > 0 && BOT.airJumps < 1 && b.vy > -2){
          b.vy = -11; BOT.airJumps++;
          puff(b.x, b.y, '#ffd23f', 8);
        }
      }
    }
  }
  if (BOT.turbo > 0 && Math.abs(b.vx) > 0 && Math.random() < 0.5){
    particles.push({ x: b.x - b.dir*26, y: b.y - 8 - Math.random()*14,
      vx: -b.dir*(1+Math.random()), vy: -Math.random(),
      life: 12+Math.random()*10, color: Math.random()<0.5 ? '#ffd23f' : '#fff' });
  }
  if (b.grace > 0) b.grace--;
  b.x += b.vx;
  b.vy += 0.55;
  b.y += b.vy;
  if (b.y >= GROUND){ b.y = GROUND; b.vy = 0; b.onGround = true; b.jumpSpin = 0; BOT.airJumps = 0; }
  if (!b.onGround) b.jumpSpin += 0.25;
  b.x = Math.max(20, Math.min(W-20, b.x));
  b.anim += Math.abs(b.vx)*0.08 + 0.02;
}

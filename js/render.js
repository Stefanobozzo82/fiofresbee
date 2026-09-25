// Disegno della scena (giorno/notte, HUD, personaggi)
// ---------- CICLO GIORNO / TRAMONTO / NOTTE ----------
const PAL_DAY = [[74,163,223],[135,206,235],[201,236,255]];
const PAL_SUN = [[90,60,140],[255,140,90],[255,215,160]];
const PAL_NGT = [[8,8,40],[24,34,84],[45,60,110]];
function mixC(a,b,t){ return [0,1,2].map(i => Math.round(a[i]+(b[i]-a[i])*t)); }
function css(c){ return `rgb(${c[0]},${c[1]},${c[2]})`; }
function dayNight(){
  // ogni round avanza l'orologio; il ciclo ricomincia ogni 12 round
  const f = round > 0 ? ((round-1) % 12) / 12 : 0;
  let pal, night = 0, sunset = 0;
  if (f < 0.30){ pal = PAL_DAY; }
  else if (f < 0.45){ const t=(f-0.30)/0.15; sunset=t; pal = PAL_DAY.map((c,i)=>mixC(c,PAL_SUN[i],t)); }
  else if (f < 0.60){ const t=(f-0.45)/0.15; sunset=1-t; night=t; pal = PAL_SUN.map((c,i)=>mixC(c,PAL_NGT[i],t)); }
  else if (f < 0.90){ night=1; pal = PAL_NGT; }
  else { const t=(f-0.90)/0.10; night=1-t; pal = PAL_NGT.map((c,i)=>mixC(c,PAL_DAY[i],t)); }
  return { pal, night, sunset };
}

// ---------- DECORAZIONI STAGIONALI (in base alla data reale) ----------
function seasonalTheme(){
  const now = new Date();
  const mo = now.getMonth(), da = now.getDate();          // 0=gennaio
  if (mo === 11) return 'natale';                          // dicembre
  if (mo === 9 && da >= 24) return 'halloween';             // fine ottobre
  return null;
}
function drawSeasonal(theme){
  if (theme === 'natale'){
    // festoncini luminosi in cima allo schermo
    const t = performance.now()/300;
    for (let i=0; i<12; i++){
      const x = 20 + i*(W-40)/11;
      const y = 8 + Math.sin(i*0.9)*6;
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.quadraticCurveTo(x, y+14, x, y+18); ctx.stroke();
      const colors = ['#ff5a5a','#7eff9e','#ffd23f','#7ec8e3'];
      ctx.fillStyle = colors[i%4];
      ctx.globalAlpha = 0.55 + 0.45*Math.abs(Math.sin(t + i));
      ctx.beginPath(); ctx.arc(x, y+18, 4, 0, Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else if (theme === 'halloween'){
    // zucca sulla sabbia
    ctx.save(); ctx.translate(W-70, GROUND-14);
    ctx.fillStyle = '#e8790f';
    ctx.beginPath(); ctx.ellipse(0,0,20,15,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = '#3a7a2a'; ctx.fillRect(-3,-20,6,8);
    ctx.fillStyle = '#2a1a0a';
    ctx.beginPath(); ctx.moveTo(-9,-4); ctx.lineTo(-4,-8); ctx.lineTo(0,-4); ctx.lineTo(4,-8); ctx.lineTo(9,-4);
    ctx.lineTo(6,4); ctx.lineTo(-6,4); ctx.closePath(); ctx.fillStyle='rgba(255,180,60,.9)'; ctx.fill();
    ctx.restore();
  }
}

// ---------- DRAWING ----------
function draw(){
  syncUI();
  ctx.save();
  if (camShake > 0){
    const m = camShakeMag * (camShake/16);
    ctx.translate((Math.random()*2-1)*m, (Math.random()*2-1)*m);
  }
  const dn = dayNight();
  // sky
  const sky = ctx.createLinearGradient(0,0,0,H);
  sky.addColorStop(0, css(dn.pal[0])); sky.addColorStop(0.6, css(dn.pal[1])); sky.addColorStop(1, css(dn.pal[2]));
  ctx.fillStyle = sky; ctx.fillRect(0,0,W,H);

  // cielo che si scurisce col temporale in arrivo
  const stormInten = (weather && weather.phase === 'storm') ? stormIntensity(weather.t) : 0;
  if (stormInten > 0){
    ctx.fillStyle = `rgba(40,46,72,${0.4*stormInten})`;
    ctx.fillRect(0,0,W,H);
  }

  // stelle di notte
  if (dn.night > 0.05){
    stars.forEach(s => {
      ctx.globalAlpha = dn.night * (0.4 + 0.6*Math.abs(Math.sin(performance.now()/700 + s.tw)));
      ctx.fillStyle = '#fff';
      ctx.fillRect(s.x, s.y, 2, 2);
    });
    ctx.globalAlpha = 1;
  }

  // stelle cadenti
  shooters.forEach(s => {
    s.trail.forEach((t,i) => {
      ctx.globalAlpha = (i/s.trail.length) * Math.min(1, s.life/15) * 0.9;
      ctx.fillStyle = '#fff';
      const sz = 1 + (i/s.trail.length)*2.5;
      ctx.fillRect(t.x, t.y, sz, sz);
    });
  });
  ctx.globalAlpha = 1;

  // sole (tramonta) / luna (di notte)
  if (dn.night < 1){
    ctx.globalAlpha = 1 - dn.night;
    const sunC = mixC([255,233,138],[255,140,60], dn.sunset);
    const sy = 80 + dn.sunset*70 + dn.night*120;
    ctx.fillStyle = css(sunC);
    ctx.beginPath(); ctx.arc(W-110, sy, 42, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = (1 - dn.night)*0.35;
    ctx.beginPath(); ctx.arc(W-110, sy, 60, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
  }
  if (dn.night > 0.2){
    ctx.globalAlpha = Math.min(1, dn.night);
    ctx.fillStyle = '#f4f1de';
    ctx.beginPath(); ctx.arc(W-140, 90, 30, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = css(dn.pal[0]);
    ctx.beginPath(); ctx.arc(W-152, 82, 26, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // arcobaleno (compare dopo il temporale, verso il mare)
  if (weather && weather.phase === 'rainbow'){
    let a = 1;
    if (weather.t < RAINBOW_FADE) a = weather.t/RAINBOW_FADE;
    else if (weather.t > RAINBOW_TOTAL-RAINBOW_FADE) a = Math.max(0, (RAINBOW_TOTAL-weather.t)/RAINBOW_FADE);
    const rcx = W*0.32, rcy = GROUND-46;
    const rColors = ['#ff5a5a','#ffb347','#ffd23f','#7eff9e','#7ec8e3','#8a6bff'];
    ctx.save();
    ctx.globalAlpha = a*0.75;
    rColors.forEach((c,i) => {
      ctx.strokeStyle = c; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.arc(rcx, rcy, 132 - i*9, Math.PI, 2*Math.PI); ctx.stroke();
    });
    ctx.restore();
  }

  // clouds
  ctx.fillStyle = `rgba(255,255,255,${0.85 - dn.night*0.55})`;
  clouds.forEach(c => {
    ctx.beginPath();
    ctx.arc(c.x, c.y, 22*c.s, 0, Math.PI*2);
    ctx.arc(c.x+24*c.s, c.y+4, 17*c.s, 0, Math.PI*2);
    ctx.arc(c.x-24*c.s, c.y+6, 15*c.s, 0, Math.PI*2);
    ctx.fill();
  });

  // nuvoloni scuri del temporale (in entrata/uscita si dissolvono insieme al resto della scena)
  if (stormInten > 0){
    ctx.fillStyle = `rgba(55,60,86,${0.82*stormInten})`;
    stormClouds.forEach(c => {
      ctx.beginPath();
      ctx.arc(c.x, c.y, 34*c.s, 0, Math.PI*2);
      ctx.arc(c.x+38*c.s, c.y+6, 26*c.s, 0, Math.PI*2);
      ctx.arc(c.x-38*c.s, c.y+8, 24*c.s, 0, Math.PI*2);
      ctx.arc(c.x+10*c.s, c.y-14, 22*c.s, 0, Math.PI*2);
      ctx.fill();
    });
  }

  // sea strip
  ctx.fillStyle = '#3f8fc9'; ctx.fillRect(0, GROUND-46, W, 46);
  ctx.fillStyle = 'rgba(255,255,255,.5)';
  for (let i=0;i<10;i++){
    const wx = (i*110 + (performance.now()/40 % 110));
    ctx.fillRect(wx, GROUND-40+(i%3)*14, 40, 3);
  }

  // delfini che saltano
  dolphins.forEach(drawDolphin);

  // barchette a vela
  boats.forEach(drawBoat);

  // gabbiano
  if (gull) drawGull();

  // sand
  ctx.fillStyle = '#f0dfa8'; ctx.fillRect(0, GROUND, W, H-GROUND);
  ctx.fillStyle = '#e2cd8a';
  for (let i=0;i<25;i++) ctx.fillRect((i*97)%W, GROUND+15+(i*37)%(H-GROUND-20), 8, 3);

  drawThrower();
  if (bone) drawBone();
  if (crab) drawCrab();
  discs.forEach(drawDisc);
  drawDog();
  const seasonTheme = seasonalTheme();
  if (seasonTheme) drawSeasonal(seasonTheme);

  // pioggia: righe diagonali che cadono davanti a tutta la scena
  if (stormInten > 0 && raindrops.length){
    ctx.strokeStyle = `rgba(210,225,245,${0.6*stormInten})`;
    ctx.lineWidth = 1.4;
    raindrops.forEach(r => {
      ctx.beginPath();
      ctx.moveTo(r.x, r.y);
      ctx.lineTo(r.x-4, r.y+r.len);
      ctx.stroke();
    });
  }

  // lampo del temporale: illumina bruscamente tutta la scena
  if (lightning > 0){
    ctx.fillStyle = `rgba(255,255,255,${(lightning/6)*0.55})`;
    ctx.fillRect(0,0,W,H);
  }

  // oscurità notturna sulla scena (HUD e particelle restano vivi)
  if (dn.night > 0){
    ctx.fillStyle = `rgba(8,8,35,${dn.night*0.28})`;
    ctx.fillRect(0,0,W,H);
  }

  // particles
  particles.forEach(p => {
    ctx.globalAlpha = p.life/30;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x-2, p.y-2, 5, 5);
  });
  ctx.globalAlpha = 1;

  // HUD
  ctx.textAlign = 'left';
  ctx.font = 'bold 22px "Courier New"';
  ctx.fillStyle = '#000'; ctx.fillText('SCORE ' + score, 18, 35);
  ctx.fillStyle = '#ffd23f'; ctx.fillText('SCORE ' + score, 16, 33);
  ctx.fillStyle = '#000'; ctx.fillText('BEST ' + best, 18, 62);
  ctx.fillStyle = '#7ec8e3'; ctx.fillText('BEST ' + best, 16, 60);

  // miss rimasti: impilato a sinistra sotto SCORE/BEST (e sotto barra turbo/etichetta allenamento,
  // quando ci sono) invece che a destra, dove i pulsanti osso/impostazioni/trofei/schermo intero
  // (sempre visibili anche a partita in corso) lo coprivano su molti schermi
  ctx.textAlign = 'left';
  ctx.font = 'bold 20px "Courier New"';
  ctx.fillStyle = '#000'; ctx.fillText('MISS ' + misses + '/' + maxMiss, 18, 133);
  ctx.fillStyle = '#ff5a5a'; ctx.fillText('MISS ' + misses + '/' + maxMiss, 16, 131);

  // etichetta modalità allenamento (niente game over, niente record/XP)
  if (SET.training && state === 'play'){
    ctx.textAlign = 'left';
    ctx.font = 'bold 14px "Courier New"';
    ctx.fillStyle = '#7eff9e';
    ctx.fillText('🏋️ ALLENAMENTO', 16, 108);
  }

  // barra turbo
  if (turbo > 0){
    ctx.textAlign = 'left';
    ctx.font = 'bold 16px "Courier New"';
    ctx.fillStyle = '#ffd23f';
    ctx.fillText('TURBO', 16, 84);
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect(80, 72, 104, 12);
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(82, 74, 100 * (turbo/turboMax), 8);
  }

  // combo
  if (state === 'play' && streak > 1){
    const mult = Math.min(streak, 5);
    ctx.textAlign = 'center';
    ctx.font = 'bold 26px "Courier New"';
    ctx.fillStyle = '#000'; ctx.fillText('COMBO x' + mult, W/2+2, 37);
    ctx.fillStyle = mult >= 5 ? '#ffd23f' : '#7eff9e';
    ctx.fillText('COMBO x' + mult, W/2, 35);
  }

  // banner trofeo sbloccato
  if (trophyTimer > 0){
    ctx.textAlign = 'center';
    ctx.font = 'bold 24px "Courier New"';
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    const tw = ctx.measureText(trophyMsg).width;
    ctx.fillRect(W/2 - tw/2 - 16, 196, tw + 32, 36);
    ctx.fillStyle = '#ffd23f';
    ctx.fillText(trophyMsg, W/2, 222);
  }

  // center message
  if (msgTimer > 0){
    ctx.textAlign = 'center';
    ctx.font = 'bold 44px "Courier New"';
    ctx.fillStyle = '#000';
    ctx.fillText(message, W/2+3, 163);
    ctx.fillStyle = '#ffd23f';
    ctx.fillText(message, W/2, 160);
  }

  if (paused && state === 'play'){
    ctx.fillStyle = 'rgba(10,10,30,.6)'; ctx.fillRect(0,0,W,H);
    ctx.textAlign = 'center';
    ctx.font = 'bold 52px "Courier New"';
    ctx.fillStyle = '#000'; ctx.fillText('PAUSA', W/2+2, H/2+2);
    ctx.fillStyle = '#ffd23f'; ctx.fillText('PAUSA', W/2, H/2);
    ctx.font = 'bold 18px "Courier New"';
    ctx.fillStyle = '#7ec8e3'; ctx.fillText(isTouch ? 'tocca ▶ per riprendere' : 'premi P per riprendere', W/2, H/2+40);
    if (!isTouch){
      ctx.font = 'bold 15px "Courier New"';
      ctx.fillStyle = '#c5cbe0'; ctx.fillText('ESC per uscire', W/2, H/2+62);
    }
  }

  if (state === 'title'){
    overlay('FIO FRESBEE', 'Premi INVIO o tocca per giocare', 'Guida Fio e prendi il fresbee al volo!');
    drawBoard(W/2, H/2+85);
    const rk = RANKS[rankIndex(totalXP)];
    ctx.textAlign = 'center';
    ensureDaily();
    const ch = currentDailyChallenge();
    // testo un po' più grande e in grassetto qui: con il filtro "pixel art" (vedi PIXEL_SCALE)
    // i caratteri sottili e piccoli diventano poco leggibili, quelli grassi e più grandi reggono bene
    ctx.font = 'bold 16px "Courier New"';
    ctx.fillStyle = daily.done ? '#3ddc84' : '#7ec8e3';
    ctx.fillText(`🎯 ${daily.done ? 'Sfida completata! ✓' : ch.desc}${playStreak.count>0 ? '  ·  🔥 ' + playStreak.count + ' giorni di fila' : ''}`, W/2, H-36);
    ctx.font = 'bold 17px "Courier New"';
    ctx.fillStyle = '#ccc';
    ctx.fillText(`🐕 ${selectedDog().name} · 🎖️ ${rk.name}  ·  🦴 ${dogBones} · TROFEI ${unlocked.length}/${ACH.length} · ${DIFF[difficulty].label} · ⚙ per cambiare`, W/2, H-16);
  }

  if (state === 'over'){
    const bonesLine = roundBonesEarned > 0 ? ` · 🦴 +${roundBonesEarned}` : '';
    overlay('GAME OVER', `Punteggio: ${score} · Prese: ${catches}/${thrown}${bonesLine}`, 'INVIO o tocca per ricominciare');
    drawBoard(W/2, H/2+85);
    if (newRecord){
      // scritta lampeggiante + Fio che salta felice sopra l'overlay
      const blink = Math.floor(performance.now()/220) % 2 === 0;
      ctx.textAlign = 'center';
      ctx.font = 'bold 36px "Courier New"';
      ctx.fillStyle = '#000';
      ctx.fillText('★ NUOVO RECORD! ★', W/2+3, H/2-93);
      ctx.fillStyle = blink ? '#ffd23f' : '#fff';
      ctx.fillText('★ NUOVO RECORD! ★', W/2, H/2-96);
      drawDog();
      particles.forEach(p => {
        ctx.globalAlpha = p.life/30;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x-2, p.y-2, 5, 5);
      });
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();   // fine trasformazione camera (scossa)

  // dissolvenza tra le schermate, sempre sopra tutto e senza scossa
  if (transitionAlpha > 0.01){
    ctx.fillStyle = `rgba(13,13,26,${transitionAlpha})`;
    ctx.fillRect(0,0,W,H);
  }
}

function overlay(t1, t2, t3){
  ctx.fillStyle = 'rgba(10,10,30,.72)'; ctx.fillRect(0,0,W,H);
  ctx.textAlign = 'center';
  ctx.font = 'bold 56px "Courier New"';
  ctx.fillStyle = '#000'; ctx.fillText(t1, W/2+2, H/2-36);
  ctx.fillStyle = '#ffd23f'; ctx.fillText(t1, W/2, H/2-38);
  ctx.font = 'bold 24px "Courier New"';
  ctx.fillStyle = '#fff'; ctx.fillText(t2, W/2, H/2+12);
  ctx.font = 'bold 18px "Courier New"';
  ctx.fillStyle = '#7ec8e3'; ctx.fillText(t3, W/2, H/2+50);
}

function drawBoat(b){
  ctx.save();
  ctx.translate(b.x, b.y + Math.sin(b.bob)*2.5);
  ctx.scale(b.s * (b.vx>0?1:-1), b.s);
  ctx.rotate(Math.sin(b.bob)*0.04);
  // scafo
  ctx.fillStyle = '#7a4a22';
  ctx.beginPath();
  ctx.moveTo(-26,0); ctx.lineTo(26,0); ctx.lineTo(16,12); ctx.lineTo(-16,12);
  ctx.closePath(); ctx.fill();
  // albero
  ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0,-34); ctx.stroke();
  // vela principale colorata
  ctx.fillStyle = `hsl(${b.hue},70%,65%)`;
  ctx.beginPath(); ctx.moveTo(2,-32); ctx.lineTo(2,-2); ctx.lineTo(22,-2);
  ctx.closePath(); ctx.fill();
  // veletta bianca
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.moveTo(-2,-30); ctx.lineTo(-2,-2); ctx.lineTo(-16,-2);
  ctx.closePath(); ctx.fill();
  // bandierina
  ctx.fillStyle = '#ff5a5a';
  ctx.beginPath(); ctx.moveTo(0,-34); ctx.lineTo(10,-31); ctx.lineTo(0,-28);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawBoard(cx, top){
  ctx.textAlign = 'center';
  ctx.font = 'bold 22px "Courier New"';
  ctx.fillStyle = '#ffd23f';
  ctx.fillText(ONLINE ? '— CLASSIFICA ONLINE —' : '— CLASSIFICA —', cx, top);
  ctx.font = 'bold 18px "Courier New"';
  if (boardLoading && !board.length){
    ctx.fillStyle = '#7ec8e3';
    ctx.fillText('Caricamento...', cx, top+30);
    return;
  }
  if (!board.length){
    ctx.fillStyle = '#7ec8e3';
    ctx.fillText('Nessun record... ancora!', cx, top+30);
    return;
  }
  board.forEach((e,i) => {
    ctx.fillStyle = i===0 ? '#ffd23f' : '#fff';
    const y = top+30+i*24;
    ctx.textAlign = 'left';
    ctx.fillText(`${i+1}. ${e.name}`, cx-150, y);
    ctx.textAlign = 'right';
    ctx.fillText(String(e.score), cx+150, y);
  });
  ctx.textAlign = 'center';
}

function drawDolphin(d){
  if (d.t < 0 || d.t > 1) return;
  const y = d.y0 - Math.sin(Math.PI * d.t) * 52;
  ctx.save();
  ctx.translate(d.x, y);
  ctx.rotate(-d.dir * Math.cos(Math.PI * d.t) * 0.7);
  ctx.scale(d.dir, 1);
  // corpo
  ctx.fillStyle = '#6b8fa8';
  ctx.beginPath(); ctx.ellipse(0, 0, 20, 8, 0, 0, Math.PI*2); ctx.fill();
  // pancia chiara
  ctx.fillStyle = '#b8d2e0';
  ctx.beginPath(); ctx.ellipse(1, 3, 15, 4, 0, 0, Math.PI*2); ctx.fill();
  // rostro
  ctx.fillStyle = '#6b8fa8';
  ctx.beginPath(); ctx.moveTo(17,-2); ctx.lineTo(27,1); ctx.lineTo(17,4); ctx.closePath(); ctx.fill();
  // pinna dorsale
  ctx.beginPath(); ctx.moveTo(-3,-7); ctx.lineTo(2,-15); ctx.lineTo(6,-7); ctx.closePath(); ctx.fill();
  // coda
  ctx.beginPath(); ctx.moveTo(-18,-1); ctx.lineTo(-27,-7); ctx.lineTo(-24,1); ctx.lineTo(-27,8); ctx.closePath(); ctx.fill();
  // occhio
  ctx.fillStyle = '#222'; ctx.fillRect(11,-3,3,3);
  ctx.restore();
}

function drawGull(){
  ctx.save();
  ctx.translate(gull.x, gull.y);
  ctx.scale(gull.vx > 0 ? 1 : -1, 1);
  const w = Math.sin(gull.flap);
  // ali
  ctx.strokeStyle = '#f5f5f5'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-2,0); ctx.quadraticCurveTo(-14,-6-w*8, -24,-2-w*12);
  ctx.moveTo(2,0);  ctx.quadraticCurveTo(10,-6-w*8, 18,-2-w*12);
  ctx.stroke();
  // corpo
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.ellipse(0,0,12,6,0,0,Math.PI*2); ctx.fill();
  // testa
  ctx.beginPath(); ctx.arc(12,-3,5,0,Math.PI*2); ctx.fill();
  // becco
  ctx.fillStyle = '#ff9d2e';
  ctx.beginPath(); ctx.moveTo(16,-3); ctx.lineTo(23,-1); ctx.lineTo(16,0);
  ctx.closePath(); ctx.fill();
  // occhio
  ctx.fillStyle = '#222'; ctx.fillRect(12,-5,2,2);
  // osso tra le zampe
  if (gull.carry){
    ctx.strokeStyle = '#ff9d2e'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-2,5); ctx.lineTo(-2,11); ctx.moveTo(3,5); ctx.lineTo(3,11); ctx.stroke();
    ctx.fillStyle = '#fffbe8';
    ctx.fillRect(-8,12,16,4);
    [[-8,11],[-8,15],[8,11],[8,15]].forEach(p => {
      ctx.beginPath(); ctx.arc(p[0],p[1],3.2,0,Math.PI*2); ctx.fill();
    });
  }
  ctx.restore();
}

function drawBone(){
  ctx.save();
  ctx.translate(bone.x, bone.y + (bone.falling ? 0 : Math.sin(bone.t)*2));
  if (bone.falling) ctx.rotate(bone.vy * 0.15);
  // lampeggia quando sta per sparire
  if (bone.life < 120 && Math.floor(bone.life/6) % 2 === 0) ctx.globalAlpha = 0.35;
  // bagliore
  ctx.fillStyle = 'rgba(255,210,63,.25)';
  ctx.beginPath(); ctx.ellipse(0,0,26,14,0,0,Math.PI*2); ctx.fill();
  // osso
  ctx.fillStyle = '#fffbe8';
  ctx.fillRect(-12,-3,24,6);
  [[-12,-4],[-12,4],[12,-4],[12,4]].forEach(p => {
    ctx.beginPath(); ctx.arc(p[0],p[1],5,0,Math.PI*2); ctx.fill();
  });
  ctx.restore();
}

function drawCrab(){
  ctx.save();
  ctx.translate(crab.x, GROUND + 26);
  const w = Math.sin(crab.walk*4)*3;
  // zampe
  ctx.strokeStyle = '#c62815'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-10,2); ctx.lineTo(-18,8+w);
  ctx.moveTo(-4,4);  ctx.lineTo(-10,10-w);
  ctx.moveTo(4,4);   ctx.lineTo(10,10+w);
  ctx.moveTo(10,2);  ctx.lineTo(18,8-w);
  ctx.stroke();
  // corpo
  ctx.fillStyle = '#e8402a';
  ctx.beginPath(); ctx.ellipse(0,0,16,10,0,0,Math.PI*2); ctx.fill();
  // chele
  ctx.fillStyle = '#c62815';
  ctx.beginPath(); ctx.arc(-19,-6+w*0.5,5,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(19,-6-w*0.5,5,0,Math.PI*2); ctx.fill();
  // occhi su steli
  ctx.strokeStyle = '#c62815'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-5,-8); ctx.lineTo(-6,-15); ctx.moveTo(5,-8); ctx.lineTo(6,-15); ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(-6,-16,3,0,Math.PI*2); ctx.arc(6,-16,3,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = '#222';
  ctx.fillRect(-7,-17,2,2); ctx.fillRect(5,-17,2,2);
  ctx.restore();
}

function drawThrower(){
  const x = thrower.x, y = thrower.y;
  // leggero respiro quando è fermo, per non sembrare statico
  const idle = Math.sin(performance.now()/450) * (state==='play' ? 0.6 : 1.4);
  ctx.save(); ctx.translate(x, y + idle);
  // legs
  ctx.fillStyle = '#22337a'; ctx.fillRect(-10,-30,9,30); ctx.fillRect(4,-30,9,30);
  // body (red jersey like Windjammers)
  ctx.fillStyle = '#d1342c'; ctx.fillRect(-13,-62,28,34);
  // head
  ctx.fillStyle = '#f0c08a'; ctx.fillRect(-9,-80,18,18);
  // occhi + sorriso
  ctx.fillStyle = '#2a2a2a'; ctx.fillRect(-5,-73,3,3); ctx.fillRect(3,-73,3,3);
  ctx.strokeStyle = '#a87850'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.arc(-1,-68,4,0.15*Math.PI,0.85*Math.PI); ctx.stroke();
  // bandana
  ctx.fillStyle = '#ffd23f'; ctx.fillRect(-10,-82,20,7);
  if (throwAnim > 0){
    // braccio che scatta in avanti nell'istante del lancio
    const p = 1 - throwAnim/16;
    const swing = Math.sin(p*Math.PI);
    ctx.save();
    ctx.translate(10,-64);
    ctx.rotate(-0.9 + swing*1.3);
    ctx.fillStyle = '#f0c08a'; ctx.fillRect(0,-3,20,7);
    ctx.restore();
  } else if (discs.length===0 && pendingThrows===0 && state==='play'){
    // braccio pronto, col prossimo frisbee in mano
    ctx.fillStyle = '#f0c08a'; ctx.fillRect(12,-70,18,7);
    ctx.fillStyle = '#ff5a5a';
    ctx.beginPath(); ctx.ellipse(34,-67,12,4,0,0,Math.PI*2); ctx.fill();
  }
  ctx.restore();
}

function drawDisc(d){
  const boom = d.boomerang;
  const main = d.gold ? '#ffc400' : (boom ? '#8a6bff' : '#ff5a5a');
  const top  = d.gold ? '#fff2b0' : (boom ? '#d8ccff' : '#ffd0d0');
  // trail (stessa forma per tutti i frisbee, cambia solo il colore)
  d.trail.forEach((t,i) => {
    ctx.globalAlpha = i/d.trail.length * (d.gold || boom ? 0.5 : 0.35);
    ctx.fillStyle = main;
    ctx.beginPath(); ctx.ellipse(t.x, t.y, 12, 4, 0, 0, Math.PI*2); ctx.fill();
  });
  ctx.globalAlpha = 1;
  ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(Math.sin(d.rot)*0.3);
  // alone luminoso pulsante per quello dorato
  if (d.gold){
    ctx.fillStyle = 'rgba(255,215,80,' + (0.25 + Math.sin(d.rot*2)*0.12) + ')';
    ctx.beginPath(); ctx.ellipse(0,0,24,10,0,0,Math.PI*2); ctx.fill();
  }
  ctx.fillStyle = main;
  ctx.beginPath(); ctx.ellipse(0,0,15,5,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = top;
  ctx.beginPath(); ctx.ellipse(0,-1.5,9,2.5,0,0,Math.PI*2); ctx.fill();
  ctx.restore();
}

function drawDog(dogObj, colors){
  dogObj = dogObj || dog;
  colors = colors || selectedDog().colors;
  // i cosmetici equipaggiati (collare/accessorio) sono miei, mai dell'avversario nella sfida online
  const isMine = (dogObj === dog) || (typeof MP !== 'undefined' && dogObj === MP.myDog);
  if (isMine) colors = cosmeticColors(colors);
  const x = dogObj.x, y = dogObj.y;
  const dc = colors;
  ctx.save(); ctx.translate(x, y);
  // stordito: lampeggia e vede le stelline
  if (dogObj.stun > 0){
    if (Math.floor(dogObj.stun/4) % 2 === 0) ctx.globalAlpha = 0.45;
    ctx.fillStyle = '#ffd23f';
    ctx.font = 'bold 16px "Courier New"'; ctx.textAlign = 'center';
    const a = dogObj.stun * 0.25;
    ctx.fillText('★', Math.cos(a)*22, -66 + Math.sin(a)*6);
    ctx.fillText('★', Math.cos(a+2.1)*22, -66 + Math.sin(a+2.1)*6);
    ctx.fillText('★', Math.cos(a+4.2)*22, -66 + Math.sin(a+4.2)*6);
  }
  // shadow: resta sempre incollata al terreno (non sale con lui quando salta), si rimpicciolisce con l'altezza
  ctx.fillStyle = 'rgba(0,0,0,.2)';
  const sh = Math.max(0.3, 1 - (GROUND-y)/300);
  ctx.beginPath(); ctx.ellipse(0, GROUND-y+6, 30*sh, 6*sh, 0, 0, Math.PI*2); ctx.fill();
  if (!dogObj.onGround) ctx.rotate(Math.sin(dogObj.jumpSpin)*0.35 * dogObj.dir);
  ctx.scale(dogObj.dir, 1);
  const moving = Math.abs(dogObj.vx) > 0.1;
  const run = Math.sin(dogObj.anim*6)*6;
  // piccolo dondolio quando è fermo, così non sembra congelato
  const idleBob = (!moving && dogObj.onGround && dogObj.stun<=0) ? Math.sin(performance.now()/380)*1.1 : 0;
  ctx.translate(0, idleBob);
  // coda: scodinzola più vivace da fermo, segue la falcata quando corre
  const tailWag = moving ? run*0.5 : Math.sin(performance.now()/220)*6;
  ctx.strokeStyle = dc.dark; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(-24,-26);
  ctx.quadraticCurveTo(-36,-38-tailWag*0.5, -40,-30-tailWag); ctx.stroke();
  // body
  ctx.fillStyle = dc.body;
  ctx.fillRect(-24,-38,48,22);
  // collarino con medaglietta
  ctx.fillStyle = dc.collar; ctx.fillRect(9,-40,6,24);
  ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(12,-13,3,0,Math.PI*2); ctx.fill();
  // legs
  ctx.fillStyle = dc.dark;
  const lo = dogObj.onGround ? run : 4;
  ctx.fillRect(-20,-18,7,18+lo*0.4);
  ctx.fillRect(-8,-18,7,18-lo*0.4);
  ctx.fillRect(6,-18,7,18+lo*0.4);
  ctx.fillRect(16,-18,7,18-lo*0.4);
  // head
  ctx.fillStyle = dc.body; ctx.fillRect(14,-52,24,20);
  // snout
  ctx.fillStyle = dc.dark; ctx.fillRect(34,-46,12,10);
  ctx.fillStyle = '#222'; ctx.fillRect(42,-46,5,5); // nose
  // boccuccia con linguetta, aperta quando corre o è in aria (felice/ansimante)
  if (moving || !dogObj.onGround){
    ctx.fillStyle = '#7a3030'; ctx.fillRect(36,-40,7,6);
    ctx.fillStyle = '#ff8fa3'; ctx.fillRect(37,-38,5,5);
  }
  // ear (sventola con la corsa, altrimenti si muove piano)
  const earFlop = moving ? run*0.4 : Math.sin(performance.now()/300)*1.5;
  ctx.save();
  ctx.translate(16,-60);
  ctx.rotate(earFlop*0.05);
  ctx.fillStyle = dc.dark; ctx.fillRect(0,0,9,12);
  ctx.restore();
  // eye, con un rapido battito di ciglia ogni tanto
  const blinking = (performance.now() % 2600) < 110;
  ctx.fillStyle = '#222';
  if (blinking) ctx.fillRect(27,-47,6,1.6);
  else ctx.fillRect(28,-48,4,4);
  // accessorio cosmetico equipaggiato (puramente estetico, solo sul mio cane)
  if (isMine) drawAccessory(ctx, 'full');
  ctx.restore();
}

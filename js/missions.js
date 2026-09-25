// Missioni a più passi: una catena di obiettivi da completare in ordine, uno alla volta.
// Ogni passo si verifica sui contatori della partita in corso (vedi gc/missionCounters in core.js);
// il progresso fra un passo e l'altro resta salvato, quindi una missione può durare più partite.
// A missione finita si ricevono ossa 🦴 e si passa alla successiva.
const MISSIONS = [
  { id:'primi',  name:'PRIMI PASSI', reward:10, steps:[
    { desc:'Fai 5 prese in una partita',          check:c => c.catches >= 5 },
    { desc:'Prendi un frisbee al volo',           check:c => c.air >= 1 },
    { desc:'Fai 1500 punti in una partita',       check:c => c.score >= 1500 } ] },
  { id:'boom',   name:'RE DEL BOOMERANG', reward:15, steps:[
    { desc:'Prendi un boomerang 🪃',                              check:c => c.boom >= 1 },
    { desc:'Prendi 2 boomerang in una partita',                   check:c => c.boom >= 2 },
    { desc:'Prendi 3 boomerang in una partita senza MISS in mezzo', check:c => c.boomChain >= 3 } ] },
  { id:'oro',    name:"MANI D'ORO", reward:20, steps:[
    { desc:'Prendi un frisbee dorato',            check:c => c.gold >= 1 },
    { desc:'Prendi un frisbee dorato al volo',    check:c => c.goldAir >= 1 },
    { desc:'Prendi 3 frisbee dorati in una partita', check:c => c.gold >= 3 } ] },
  { id:'ciabatta', name:'OCCHIO ALLA CIABATTA', reward:20, steps:[
    { desc:'Schiva 3 ciabatte in una partita',    check:c => c.trapDodged >= 3 },
    { desc:'Arriva a 3000 punti senza prendere ciabatte', check:c => c.score >= 3000 && c.trapCaught === 0 },
    { desc:'Schiva 6 ciabatte in una partita',    check:c => c.trapDodged >= 6 } ] },
  { id:'turbo',  name:'CANE A REAZIONE', reward:20, steps:[
    { desc:'Prendi un osso al volo',              check:c => c.boneAir >= 1 },
    { desc:'Prendi 2 ossi in una partita',        check:c => c.bones >= 2 },
    { desc:'Fai 5 prese durante il turbo',        check:c => c.turboCatches >= 5 } ] },
  { id:'leggenda', name:'LEGGENDA DELLA BAIA', reward:40, steps:[
    { desc:'Fai 5000 punti in una partita',       check:c => c.score >= 5000 },
    { desc:'Resisti fino a notte fonda',          check:c => c.round >= 9 },
    { desc:'Fai 10000 punti in una partita',      check:c => c.score >= 10000 } ] }
];

let missionState = { idx:0, step:0 };
try { missionState = Object.assign(missionState, JSON.parse(localStorage.getItem('dd_missions')||'{}')); } catch(e){}
function saveMissions(){ localStorage.setItem('dd_missions', JSON.stringify(missionState)); }
function currentMission(){ return MISSIONS[missionState.idx] || null; }   // null = tutte completate

// chiamata durante la partita: avanza di uno o più passi se i contatori li soddisfano già
function checkMission(c){
  if (SET.training) return;
  let m = currentMission();
  while (m && m.steps[missionState.step].check(c)){
    missionState.step++;
    if (missionState.step >= m.steps.length){
      dogBones += m.reward; saveDogProgress();
      showTrophyMsg(`🧭 Missione "${m.name}" completata! +${m.reward} 🦴`, 190);
      SFX.trophy();
      missionState.idx++; missionState.step = 0;
      saveMissions();
      return;   // la missione successiva si inizia dalla prossima partita, non a metà di questa
    }
    showTrophyMsg(`🧭 Passo ${missionState.step}/${m.steps.length} fatto: ${m.name}`, 140);
    SFX.life();
    saveMissions();
  }
}

// scheda per il pannello 🏆 TROFEI
function missionCardHtml(){
  const m = currentMission();
  if (!m) return '<div class="dt">🧭 MISSIONI</div><div class="dd2">✓ Hai completato tutte le missioni. Sei una leggenda!</div>';
  const dots = m.steps.map((s,i) => i < missionState.step ? '●' : '○').join(' ');
  const list = m.steps.map((s,i) => {
    const col = i < missionState.step ? '#3ddc84' : (i === missionState.step ? '#fff' : '#555a77');
    return '<div style="color:' + col + '">' + (i < missionState.step ? '✓ ' : (i === missionState.step ? '▶ ' : '· ')) + s.desc + '</div>';
  }).join('');
  return '<div class="dt">🧭 MISSIONE ' + (missionState.idx+1) + '/' + MISSIONS.length + ': ' + m.name + '  ' + dots + '</div>' +
    '<div class="dd2">' + list + '</div>' +
    '<div class="dr">Premio: ' + m.reward + ' 🦴 · i passi vanno fatti in ordine, anche in partite diverse</div>';
}

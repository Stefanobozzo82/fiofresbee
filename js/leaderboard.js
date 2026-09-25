// Classifica online/locale e inserimento del nome
// ---------- CLASSIFICA (online via Supabase, altrimenti locale) ----------
let board = [];          // classifica di sempre (top 5)
let boardWeek = null;    // classifica della settimana (top 5); null = non disponibile (es. colonna mancante sul server)
let boardLoading = false;
let nameOpen = false;
try { board = JSON.parse(localStorage.getItem('dd_board')||'[]'); } catch(e){ board=[]; }
function saveLocalBoard(){ localStorage.setItem('dd_board', JSON.stringify(board.slice(0,5))); }

// inizio della settimana corrente (lunedì alle 00:00, ora del dispositivo): la classifica settimanale
// si azzera da sola ogni lunedì, così c'è sempre un primo posto alla portata di tutti
function weekStart(){
  const d = new Date();
  d.setHours(0,0,0,0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

// senza Supabase: tutti i punteggi locali (con la data) servono a ricavare entrambe le classifiche
let localScores = [];
try { localScores = JSON.parse(localStorage.getItem('dd_board_local')||'[]'); } catch(e){ localScores = []; }
function rebuildLocalBoards(){
  const byScore = (a,b) => b.score - a.score;
  const ws = weekStart().getTime();
  // i vecchi record locali (salvati prima che esistesse la data) contano solo per "di sempre"
  const all = localScores.concat(board.filter(e => !e.t && !localScores.some(x => x.name === e.name && x.score === e.score)));
  board = all.slice().sort(byScore).slice(0,5).map(e => ({ name:e.name, score:e.score }));
  boardWeek = localScores.filter(e => e.t >= ws).sort(byScore).slice(0,5);
}
if (!ONLINE) rebuildLocalBoards();

async function fetchBoard(){
  if (!ONLINE) return;
  boardLoading = true;
  try {
    const r = await fetch(SUPA_URL + '/rest/v1/scores?select=name,score&order=score.desc&limit=5', { headers: SUPA_HEADERS });
    if (r.ok) board = await r.json();
  } catch(e){}
  try {
    const since = encodeURIComponent(weekStart().toISOString());
    const r = await fetch(SUPA_URL + '/rest/v1/scores?select=name,score&created_at=gte.' + since + '&order=score.desc&limit=5', { headers: SUPA_HEADERS });
    boardWeek = r.ok ? await r.json() : null;
  } catch(e){ boardWeek = null; }
  boardLoading = false;
}

async function submitScore(name, s){
  if (!ONLINE){
    localScores.push({ name, score:s, t:Date.now() });
    localScores.sort((a,b)=>b.score-a.score);
    // teniamo i migliori di sempre più tutti quelli di questa settimana, niente di più
    const ws = weekStart().getTime();
    localScores = localScores.filter((e,i) => i < 5 || e.t >= ws).slice(0,60);
    localStorage.setItem('dd_board_local', JSON.stringify(localScores));
    rebuildLocalBoards();
    saveLocalBoard();
    return;
  }
  try {
    await fetch(SUPA_URL + '/rest/v1/scores', {
      method:'POST', headers: SUPA_HEADERS,
      body: JSON.stringify({ name, score: s })
    });
  } catch(e){}
  await fetchBoard();
}

// il nome si chiede se il punteggio entra in almeno una delle due classifiche
function entersTop5(list, s){ return list.length < 5 || s > list[list.length-1].score; }
function qualifies(s){ return s>0 && (entersTop5(board, s) || (boardWeek !== null && entersTop5(boardWeek, s))); }

const nameBox = document.getElementById('nameBox');
const nameBoxTitle = document.getElementById('nameBoxTitle');
const nameInput = document.getElementById('nameInput');
// "cb" opzionale: se passato, riceve il nome appena confermato invece del comportamento
// storico (invio del punteggio in classifica) — usato anche per chiedere il nome prima
// di una sfida online, quando non ne è ancora stato salvato uno
let pendingNameCallback = null;
function askName(cb, title){
  nameOpen = true;
  nameBoxTitle.textContent = title || 'NUOVO RECORD!';
  nameInput.value = localStorage.getItem('dd_name') || '';
  nameBox.style.display = 'block';
  pendingNameCallback = cb || null;
  setTimeout(()=>nameInput.focus(), 50);
}
function confirmName(){
  uiClick();
  let name = (nameInput.value||'PLAYER').toUpperCase().replace(/[^A-Z0-9 ]/g,'').slice(0,10).trim() || 'PLAYER';
  localStorage.setItem('dd_name', name);
  nameBox.style.display = 'none';
  nameOpen = false;
  const cb = pendingNameCallback; pendingNameCallback = null;
  if (cb) cb(name);
  else submitScore(name, score);
}
document.getElementById('nameOk').addEventListener('click', confirmName);
nameInput.addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.key === 'Enter') confirmName();
});

// Classifica online/locale e inserimento del nome
// ---------- CLASSIFICA (online via Supabase, altrimenti locale) ----------
let board = [];
let boardLoading = false;
let nameOpen = false;
try { board = JSON.parse(localStorage.getItem('dd_board')||'[]'); } catch(e){ board=[]; }
function saveLocalBoard(){ localStorage.setItem('dd_board', JSON.stringify(board.slice(0,5))); }

async function fetchBoard(){
  if (!ONLINE) return;
  boardLoading = true;
  try {
    const r = await fetch(SUPA_URL + '/rest/v1/scores?select=name,score&order=score.desc&limit=5', { headers: SUPA_HEADERS });
    if (r.ok) board = await r.json();
  } catch(e){}
  boardLoading = false;
}

async function submitScore(name, s){
  if (!ONLINE){
    board.push({name, score:s});
    board.sort((a,b)=>b.score-a.score);
    board = board.slice(0,5);
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

function qualifies(s){ return s>0 && (board.length<5 || s > board[board.length-1].score); }

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

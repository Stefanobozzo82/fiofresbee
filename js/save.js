// Trasferimento dei progressi tra dispositivi con un codice (Supabase, funzioni ff_save_progress /
// ff_load_progress: vedi supabase/setup.sql). Tutti i progressi vivono in localStorage con chiavi
// "dd_*": il codice ne salva una copia sul server, l'altro dispositivo la scarica e la ricopia.
const SAVE_SKIP_KEYS = ['dd_board', 'dd_board_local'];   // classifiche in cache: non sono progressi
const saveMakeBtn = document.getElementById('saveMake');
const saveLoadBtn = document.getElementById('saveLoad');
const saveCodeEl = document.getElementById('saveCode');
const saveInputEl = document.getElementById('saveInput');
const saveStatusEl = document.getElementById('saveStatus');

function resetSavePanel(){
  saveCodeEl.textContent = '';
  saveInputEl.value = '';
  saveStatusEl.textContent = ONLINE ? '' : 'Serve la connessione a internet.';
  saveMakeBtn.disabled = saveLoadBtn.disabled = false;
}

function collectProgress(){
  const data = {};
  for (let i = 0; i < localStorage.length; i++){
    const k = localStorage.key(i);
    if (k && k.startsWith('dd_') && !SAVE_SKIP_KEYS.includes(k)) data[k] = localStorage.getItem(k);
  }
  return data;
}

// il codice ha 8 caratteri senza lettere/numeri che si confondono (niente O/0, I/1): lo mostriamo
// diviso in due blocchi "ABCD-EFGH" per leggerlo meglio, e accettiamo il trattino o gli spazi in ingresso
function formatCode(c){ return c.length === 8 ? c.slice(0,4) + '-' + c.slice(4) : c; }
function cleanCode(c){ return (c || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

async function supaRpc(fn, body){
  const r = await fetch(SUPA_URL + '/rest/v1/rpc/' + fn, {
    method: 'POST', headers: SUPA_HEADERS, body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

saveMakeBtn.addEventListener('click', async e => {
  e.stopPropagation(); uiClick();
  if (!ONLINE) return;
  saveMakeBtn.disabled = true;
  saveStatusEl.textContent = 'Creo il codice…';
  try {
    const code = await supaRpc('ff_save_progress', { p_data: collectProgress() });
    saveCodeEl.textContent = formatCode(String(code));
    saveStatusEl.textContent = 'Scrivi questo codice e inseriscilo sull\'altro dispositivo (vale 90 giorni).';
  } catch(err){
    saveStatusEl.textContent = '⚠ Non riesco a creare il codice. Controlla la connessione e riprova.';
  }
  saveMakeBtn.disabled = false;
});

saveLoadBtn.addEventListener('click', async e => {
  e.stopPropagation(); uiClick();
  if (!ONLINE) return;
  const code = cleanCode(saveInputEl.value);
  if (code.length !== 8){ saveStatusEl.textContent = 'Il codice ha 8 caratteri (es. ABCD-EFGH).'; return; }
  saveLoadBtn.disabled = true;
  saveStatusEl.textContent = 'Cerco i progressi…';
  try {
    const data = await supaRpc('ff_load_progress', { p_code: code });
    if (!data || typeof data !== 'object'){
      saveStatusEl.textContent = 'Codice non trovato o scaduto.';
      saveLoadBtn.disabled = false;
      return;
    }
    if (!confirm('Sostituire i progressi di questo dispositivo con quelli del codice ' + formatCode(code) + '?')){
      saveStatusEl.textContent = '';
      saveLoadBtn.disabled = false;
      return;
    }
    Object.keys(collectProgress()).forEach(k => localStorage.removeItem(k));
    Object.keys(data).forEach(k => {
      if (k.startsWith('dd_') && !SAVE_SKIP_KEYS.includes(k) && typeof data[k] === 'string') localStorage.setItem(k, data[k]);
    });
    saveStatusEl.textContent = '✓ Progressi caricati! Riavvio…';
    setTimeout(() => location.reload(), 700);
  } catch(err){
    saveStatusEl.textContent = '⚠ Non riesco a caricare i progressi. Controlla la connessione e riprova.';
    saveLoadBtn.disabled = false;
  }
});
saveInputEl.addEventListener('keydown', e => e.stopPropagation());

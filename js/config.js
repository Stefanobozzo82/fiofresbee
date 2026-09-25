// Configurazione Supabase (classifica online, sfida online, salvataggi)
// ================= CONFIGURAZIONE CLASSIFICA ONLINE (SUPABASE) =================
// Incolla qui i due valori del tuo progetto Supabase (vedi GUIDA.md).
// Finché restano vuoti, la classifica funziona solo in locale sul dispositivo.
const SUPA_URL = 'https://gynxolpcxgkcuygsamgc.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd5bnhvbHBjeGdrY3V5Z3NhbWdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwMzU3NTIsImV4cCI6MjEwMjYxMTc1Mn0.K_Ecdzd_aJR8CJAYT5vUbyU6A9vpMIQj1G7aAy5Wrcg';
// ===============================================================================
const ONLINE = SUPA_URL.startsWith('https') && SUPA_KEY.length > 20;
const SUPA_HEADERS = {
  'apikey': SUPA_KEY,
  'Authorization': 'Bearer ' + SUPA_KEY,
  'Content-Type': 'application/json'
};

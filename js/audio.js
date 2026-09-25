// Audio chiptune (Web Audio): effetti, onde, musica
// ---------- AUDIO (chiptune via Web Audio) ----------
let AC = null, musicOn = true, musicTimer = null;
function audio(){
  if (!AC) AC = new (window.AudioContext||window.webkitAudioContext)();
  if (AC.state === 'suspended') AC.resume();
  return AC;
}
function beep(freq, dur, type='square', vol=0.15, slide=0, delay=0, channel='sfx'){
  const chVol = (channel==='music' ? SET.musicVol : SET.sfxVol) / 100;
  if (chVol <= 0) return;
  vol *= chVol;
  try {
    const ac = audio();
    const t = ac.currentTime + delay;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq+slide), t+dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t+dur);
    o.connect(g).connect(ac.destination);
    o.start(t); o.stop(t+dur+0.02);
  } catch(e){}
}
// click generico per i pulsanti dei menù (schermo intero, trofei, impostazioni, pausa, chiudi, ecc.)
function uiClick(){ beep(600, 0.05, 'square', 0.11); }
function noiseBurst(dur=0.15, vol=0.12, delay=0, channel='sfx'){
  const chVol = (channel==='music' ? SET.musicVol : SET.sfxVol) / 100;
  if (chVol <= 0) return;
  vol *= chVol;
  try {
    const ac = audio();
    const t = ac.currentTime + delay;
    const buf = ac.createBuffer(1, ac.sampleRate*dur, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i=0;i<d.length;i++) d[i] = (Math.random()*2-1) * (1-i/d.length);
    const s = ac.createBufferSource(); s.buffer = buf;
    const g = ac.createGain(); g.gain.value = vol;
    const f = ac.createBiquadFilter(); f.type='bandpass'; f.frequency.value=1200;
    s.connect(f).connect(g).connect(ac.destination);
    s.start(t);
  } catch(e){}
}
// rumore delle onde del mare, in loop leggero e continuo (ambiente, non legato al gameplay)
function waveNoise(){
  if (SET.sfxVol <= 0) return;
  try {
    const ac = audio();
    const dur = 2.4;
    const buf = ac.createBuffer(1, ac.sampleRate*dur, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i=0;i<d.length;i++){
      const env = Math.sin(Math.PI * i/d.length);        // dissolvenza in entrata/uscita
      d[i] = (Math.random()*2-1) * env;
    }
    const s = ac.createBufferSource(); s.buffer = buf;
    const f = ac.createBiquadFilter(); f.type='lowpass'; f.frequency.value=450;
    const g = ac.createGain(); g.gain.value = 0.045 * (SET.sfxVol/100);
    s.connect(f).connect(g).connect(ac.destination);
    s.start();
  } catch(e){}
}
let waveTimer = null;
function startAmbient(){ if (waveTimer) return; waveNoise(); waveTimer = setInterval(waveNoise, 2500); }
function stopAmbient(){ if (waveTimer){ clearInterval(waveTimer); waveTimer=null; } }
const SFX = {
  throw_(){ noiseBurst(0.25, 0.10); beep(300, 0.25, 'sawtooth', 0.06, 500); },
  jump(){ beep(250, 0.18, 'square', 0.10, 350); },
  catch_(){ beep(660, 0.10, 'square', 0.14); beep(880, 0.16, 'square', 0.14, 0, 0.09); },
  acro(){ [523,659,784,1046].forEach((f,i)=>beep(f, 0.12, 'square', 0.14, 0, i*0.07)); },
  bounce(){ beep(180, 0.08, 'triangle', 0.10, -60); },
  miss(){ beep(300, 0.5, 'sawtooth', 0.12, -220); },
  round(){ beep(440,0.1,'square',0.12); beep(660,0.15,'square',0.12,0,0.1); },
  goldSpawn(){ [880,1108,1318].forEach((f,i)=>beep(f, 0.10, 'triangle', 0.12, 0, i*0.06)); },
  boomSpawn(){ [420,520,620,520].forEach((f,i)=>beep(f, 0.08, 'triangle', 0.09, 0, i*0.05)); },
  boomTurn(){ beep(240, 0.28, 'sawtooth', 0.09, 180); },
  squawk(){ beep(950, 0.12, 'sawtooth', 0.10, -350); beep(800, 0.14, 'sawtooth', 0.10, -300, 0.12); },
  ouch(){ beep(140, 0.35, 'sawtooth', 0.13, -60); noiseBurst(0.12, 0.08); },
  turbo(){ beep(300, 0.3, 'sawtooth', 0.10, 700); [660,880].forEach((f,i)=>beep(f,0.1,'square',0.12,0,0.3+i*0.08)); },
  life(){ [523,659,784,1046,1318].forEach((f,i)=>beep(f, 0.11, 'triangle', 0.13, 0, i*0.06)); },
  record(){ [523,523,523,659,784,784,1046].forEach((f,i)=>beep(f, 0.13, 'square', 0.14, 0, i*0.09)); beep(1568, 0.5, 'triangle', 0.10, 0, 0.66); },
  bark(){ beep(480, 0.07, 'sawtooth', 0.14, -180); beep(430, 0.09, 'sawtooth', 0.13, -200, 0.09); },
  whine(){ beep(820, 0.5, 'triangle', 0.09, -450); },
  trophy(){ [784,988,1175,1568].forEach((f,i)=>beep(f, 0.12, 'triangle', 0.13, 0, i*0.09)); },
  pop(){ noiseBurst(0.2, 0.06); beep(700+Math.random()*500, 0.08, 'triangle', 0.05, -200); },
  golden(){ [523,659,784,1046,1318,1568].forEach((f,i)=>beep(f, 0.14, 'square', 0.14, 0, i*0.07)); beep(2093, 0.4, 'triangle', 0.10, 0, 0.45); },
  over(){ [392,330,262,196].forEach((f,i)=>beep(f, 0.25, 'square', 0.13, 0, i*0.18)); },
  thunder(){ noiseBurst(0.7, 0.15); beep(75, 0.6, 'sawtooth', 0.10, -35, 0.06); }
};
// musichetta loop (marimba-ish da spiaggia)
const MELODY = [523,0,659,784, 659,0,523,392, 440,0,523,659, 587,659,784,0];
const BASS   = [131,0,131,0, 165,0,165,0, 110,0,110,0, 147,0,196,0];
let mStep = 0;
function musicTick(){
  if (!musicOn || state!=='play') return;
  const m = MELODY[mStep%16], b = BASS[mStep%16];
  if (m) beep(m, 0.16, 'triangle', 0.05, 0, 0, 'music');
  if (b) beep(b, 0.20, 'sine', 0.06, 0, 0, 'music');
  mStep++;
}
function startMusic(){
  stopMusic();
  musicTimer = setInterval(musicTick, 190);
}
function stopMusic(){ if (musicTimer){ clearInterval(musicTimer); musicTimer=null; } }

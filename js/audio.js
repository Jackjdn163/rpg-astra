'use strict';

// Synthesized sound effects and a gentle music loop (no audio files).
// Browsers only allow audio after the player interacts, so sfx.unlock() runs on the first key or tap.
const sfx = (() => {
  let ac = null, fxGain = null, musicGain = null, noiseBuf = null;
  let musicTimer = null, nextNote = 0, step = 0;
  const last = {};

  function ensure() {
    if (ac) return ac;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ac = new AC();
      fxGain = ac.createGain();
      musicGain = ac.createGain();
      fxGain.connect(ac.destination);
      musicGain.connect(ac.destination);
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.4, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      applyVolume();
    } catch (e) { ac = null; }
    return ac;
  }

  function applyVolume() {
    if (!ac) return;
    fxGain.gain.value = 0.35 * state.settings.sfx;
    musicGain.gain.value = 0.18 * state.settings.music;
  }

  function unlock() {
    const a = ensure();
    if (!a) return;
    if (a.state === 'suspended') a.resume().catch(() => {});
    if (!musicTimer) startMusic();
  }

  function tone(freq, dur, type = 'sine', vol = 0.3, slide = 1, delay = 0, out = fxGain, at = null) {
    const t = (at ?? ac.currentTime) + delay;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide !== 1) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function noise(dur, vol, freq) {
    const t = ac.currentTime;
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(fxGain);
    src.start(t);
    src.stop(t + dur);
  }

  const chord = (notes, dur, type, vol, gap) => notes.forEach((f, i) => tone(f, dur, type, vol, 1, i * gap));
  const semis = (base, s) => base * Math.pow(2, s / 12);

  // [minimum seconds between plays, player]
  const defs = {
    hit:      [0.07, () => tone(260 + Math.random() * 90, 0.05, 'square', 0.03, 0.6)],
    break:    [0.05, () => { noise(0.12, 0.2, 1100); tone(320, 0.1, 'triangle', 0.12, 0.5); }],
    bigBreak: [0.25, () => { noise(0.4, 0.35, 500); tone(130, 0.35, 'triangle', 0.25, 0.5); chord([523, 659, 784, 1047], 0.25, 'triangle', 0.12, 0.06); }],
    coin:     [0.05, () => tone(1320 + Math.random() * 240, 0.07, 'sine', 0.09, 1.25)],
    gem:      [0.07, () => { tone(1760, 0.1, 'sine', 0.12); tone(2640, 0.14, 'sine', 0.08, 1, 0.05); }],
    buy:      [0.05, () => { tone(520, 0.08, 'triangle', 0.18, 1.5); tone(780, 0.1, 'triangle', 0.16, 1.3, 0.06); }],
    error:    [0.2,  () => tone(160, 0.18, 'sawtooth', 0.08, 0.8)],
    click:    [0.03, () => tone(720, 0.04, 'triangle', 0.08)],
    shake:    [0.1,  () => tone(300 + Math.random() * 80, 0.07, 'triangle', 0.08)],
    // Hatch reveal: bigger and brighter for rarer results (rank 0–5, +variant).
    reveal:   [0.05, rank => {
      const base = [392, 440, 494, 523, 587, 659][Math.min(rank, 5)];
      const steps = rank >= 4 ? [0, 4, 7, 12, 16, 19, 24] : rank >= 2 ? [0, 4, 7, 12] : [0, 7];
      chord(steps.map(s => semis(base, s)), 0.25 + rank * 0.05, 'triangle', 0.1 + rank * 0.015, 0.06);
      if (rank >= 4) noise(0.6, 0.12, 4000);
    }],
    levelUp:  [0.3, () => chord([523, 659, 784, 1047, 1319], 0.22, 'square', 0.07, 0.07)],
    unlock:   [0.3, () => chord([523, 659, 784, 1047], 0.3, 'triangle', 0.16, 0.09)],
    achieve:  [0.3, () => chord([784, 988, 1175, 1568], 0.22, 'sine', 0.15, 0.07)],
    geode:    [0.5, () => chord([1568, 2093, 1568, 2637], 0.16, 'sine', 0.1, 0.08)],
  };

  function play(name, arg) {
    if (!ac || ac.state !== 'running' || state.settings.sfx <= 0) return;
    const d = defs[name];
    if (!d) return;
    const now = performance.now() / 1000;
    if (last[name] && now - last[name] < d[0]) return;
    last[name] = now;
    try { d[1](arg); } catch (e) { /* ignore audio errors */ }
  }

  // ---------- Music: a soft I–V–vi–IV arpeggio loop ----------
  const BPM = 96;
  const PROG = [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]]; // C, G, Am, F
  const ARP = [0, 1, 2, 1, 2, 0, 1, 2];
  const ROOT = 262;

  function startMusic() {
    nextNote = ac.currentTime + 0.1;
    musicTimer = setInterval(scheduleMusic, 120);
  }

  function scheduleMusic() {
    if (!ac || ac.state !== 'running') return;
    const eighth = 60 / BPM / 2;
    while (nextNote < ac.currentTime + 0.4) {
      if (state.settings.music > 0) {
        const bar = Math.floor(step / 8) % PROG.length;
        const chordNotes = PROG[bar];
        const i = step % 8;
        tone(semis(ROOT, chordNotes[ARP[i]] + 12), eighth * 1.6, 'triangle', 0.12, 1, 0, musicGain, nextNote);
        if (i === 0) tone(semis(ROOT / 2, chordNotes[0]), eighth * 7.5, 'sine', 0.2, 1, 0, musicGain, nextNote);
        if (i === 4 && bar % 2 === 1) tone(semis(ROOT, chordNotes[2] + 24), eighth * 1.2, 'sine', 0.05, 1, 0, musicGain, nextNote);
      }
      nextNote += eighth;
      step++;
    }
  }

  return { play, unlock, applyVolume };
})();

// 音：BGM（その場で合成する曲）と効果音、音声読み上げ
// 音声ファイルを使わないので、オフラインでもそのまま鳴る
window.KG = window.KG || {};

(function () {
  let ctx = null, master, bgmBus, seBus, delayIn, noiseBuf;
  let duckLevel = 1;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      // iPadのマナーモードでも鳴るようにする（対応しているSafariのみ）
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* 未対応 */ }
      ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
      master = ctx.createGain(); master.gain.value = 0.95;
      master.connect(comp).connect(ctx.destination);
      bgmBus = ctx.createGain(); bgmBus.connect(master);
      seBus = ctx.createGain(); seBus.connect(master);
      // メロディ用のやまびこ（ディレイ）
      delayIn = ctx.createGain();
      const delay = ctx.createDelay(1); delay.delayTime.value = 0.3;
      const fb = ctx.createGain(); fb.gain.value = 0.3;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2800;
      const wet = ctx.createGain(); wet.gain.value = 0.28;
      delayIn.connect(delay); delay.connect(lp); lp.connect(fb); fb.connect(delay); lp.connect(wet); wet.connect(bgmBus);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      applyVolumes();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function applyVolumes() {
    if (!ctx) return;
    const s = KG.state.settings;
    const bgm = s.bgm == null ? 0.5 : s.bgm;
    bgmBus.gain.setTargetAtTime(bgm * 0.6 * duckLevel, ctx.currentTime, 0.12);
    seBus.gain.setTargetAtTime(s.se, ctx.currentTime, 0.05);
  }

  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function noteMidi(n) {
    const m = /^([A-G])(#?)(-?\d)$/.exec(n);
    return m ? 12 * (+m[3] + 1) + NOTE[m[1]] + (m[2] ? 1 : 0) : null;
  }

  // ---- 楽器 ----
  function env(g, t, a, peak, d, end = 0.0001) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(end, t + a + d);
  }
  function osc(type, freq, t, dur, dest, vol, a = 0.005, detune = 0) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); o.detune.value = detune;
    env(g, t, a, vol, dur);
    o.connect(g).connect(dest);
    o.start(t); o.stop(t + a + dur + 0.05);
    return o;
  }
  function noise(t, dur, dest, vol, type, freq, q = 1) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    env(g, t, 0.002, vol, dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
    return f;
  }
  const kick = (t, d) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
    env(g, t, 0.003, 0.9, 0.28);
    o.connect(g).connect(d); o.start(t); o.stop(t + 0.35);
  };
  const snare = (t, d) => { noise(t, 0.16, d, 0.35, 'highpass', 1400); osc('triangle', 190, t, 0.08, d, 0.25); };
  const clap = (t, d) => { for (let i = 0; i < 3; i++) noise(t + i * 0.012, 0.09, d, 0.22, 'bandpass', 1500, 1.2); };
  const hat = (t, d, v = 0.12, open = false) => noise(t, open ? 0.16 : 0.035, d, v, 'highpass', 7500);
  const shaker = (t, d, v = 0.06) => noise(t, 0.05, d, v, 'bandpass', 6000, 2);
  function bass(t, m, dur, d) {
    const f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'lowpass'; f.Q.value = 7;
    f.frequency.setValueAtTime(1600, t); f.frequency.exponentialRampToValueAtTime(380, t + dur);
    env(g, t, 0.005, 0.32, dur);
    for (const [type, mul] of [['sawtooth', 1], ['square', 0.5]]) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = mtof(m) * mul;
      o.connect(f); o.start(t); o.stop(t + dur + 0.05);
    }
    f.connect(g).connect(d);
  }
  function stab(t, notes, dur, d, vol = 0.05) {
    const f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'lowpass'; f.frequency.setValueAtTime(3200, t); f.frequency.exponentialRampToValueAtTime(900, t + dur);
    env(g, t, 0.006, vol, dur);
    for (const m of notes) for (const dt of [-8, 8]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = dt;
      o.connect(f); o.start(t); o.stop(t + dur + 0.05);
    }
    f.connect(g).connect(d);
  }
  function lead(t, m, dur, d, timbre, vol) {
    const g = ctx.createGain();
    g.connect(d); g.connect(delayIn);
    if (timbre === 'marimba') {
      env(g, t, 0.003, vol * 1.2, Math.min(dur, 0.35));
      osc('sine', mtof(m), t, 0.4, g, 1);
      osc('sine', mtof(m) * 4, t, 0.06, g, 0.25);
      return;
    }
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = timbre === 'brass' ? 2400 : 3600;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.setValueAtTime(vol, t + Math.max(0.02, dur - 0.06));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 5.5; lg.gain.value = 7;
    lfo.connect(lg);
    for (const [type, det] of timbre === 'brass' ? [['sawtooth', -6], ['sawtooth', 6]] : [['square', 0], ['sawtooth', 5]]) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = mtof(m); o.detune.value = det;
      lg.connect(o.detune);
      o.connect(f); o.start(t); o.stop(t + dur + 0.12);
    }
    lfo.start(t); lfo.stop(t + dur + 0.12);
    f.connect(g);
  }
  // やわらかく鳴り続ける和音（パッド）
  function pad(t, notes, dur, d, vol) {
    const f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'lowpass'; f.frequency.value = 1400;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.25);
    g.gain.setValueAtTime(vol, t + dur * 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const m of notes) for (const det of [-6, 6]) {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = mtof(m); o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + dur + 0.05);
    }
    f.connect(g).connect(d);
  }
  function bell(t, m, dur, d, vol) {
    osc('sine', mtof(m), t, dur, d, vol, 0.002);
    osc('sine', mtof(m) * 2.76, t, dur * 0.4, d, vol * 0.35, 0.002);
    osc('sine', mtof(m) * 5.4, t, dur * 0.15, d, vol * 0.15, 0.002);
  }

  // ---- 曲 ----
  // chords：1小節ごとのコード　melody：8分音符ごと（- はのばす、. は休み）
  // kick/snare/hat/bass/stab：16分音符ごとのリズム（bass は x=根音 o=オクターブ上 5=5度）
  const SONGS = {
    menu: {
      bpm: 108, lead: 'marimba', leadVol: 0.16, pad: 0.03,
      chords: ['C', 'Am', 'F', 'G', 'C', 'Am', 'F', 'G'],
      kick: 'x.......x.......', snare: '....x.......x...', hat: '..x...x...x...x.', shaker: true,
      bass: 'x.....x.o.....x.', stab: '....x.......x...',
      melody: 'E5 - G5 - C6 - G5 - | A5 - E5 - C5 - E5 - | F5 - A5 - C6 - A5 F5 | G5 - - - D5 - B4 - | C5 E5 G5 - E5 G5 C6 - | B5 - A5 - E5 - A5 - | A5 - G5 - F5 - A5 - | G5 - - - . . . .',
    },
    machi: {
      bpm: 136, lead: 'square', leadVol: 0.11,
      chords: ['F', 'G', 'Em', 'Am', 'F', 'G', 'Em', 'Am'],
      kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.',
      bass: 'x.x.o.x.x.x.o.x5', stab: '..x...x...x..x..',
      melody: 'C5 - A4 C5 F5 - E5 F5 | G5 - D5 B4 D5 - G5 F5 | E5 - B4 - G4 B4 E5 G5 | A5 - - - E5 - C5 - | A5 - G5 F5 G5 - A5 C6 | B5 - A5 G5 A5 - B5 - | G5 - E5 - B4 - E5 G5 | A5 - - - E5 G5 A5 B5',
    },
    umi: {
      bpm: 118, lead: 'marimba', leadVol: 0.2, pad: 0.025,
      chords: ['Em', 'C', 'G', 'D', 'Em', 'C', 'G', 'D'],
      kick: 'x.....x...x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', shaker: true,
      bass: 'x..x..o.x..x..5.', stab: '..x...x...x...x.',
      melody: 'B4 - G4 B4 E5 - D5 B4 | C5 - E5 - G5 - E5 C5 | D5 - B4 D5 G5 - F#5 G5 | A5 - F#5 - D5 - . . | E5 G5 B5 - A5 G5 E5 - | G5 - E5 - C5 E5 G5 - | B5 - A5 G5 D5 - G5 B5 | A5 - - - F#5 - D5 -',
    },
    yama: {
      bpm: 144, lead: 'brass', leadVol: 0.1, leadShift: -12,
      chords: ['Bm', 'G', 'D', 'A', 'Bm', 'G', 'D', 'A'],
      kick: 'x...x...x...x..x', snare: '....x.......x.x.', hat: '..x...x...x...x.',
      bass: 'xoxoxoxoxoxoxoxo', stab: 'x.....x.....x...',
      melody: 'F#5 - D5 - B4 D5 F#5 - | G5 - B5 - A5 G5 D5 - | A5 - F#5 A5 D6 - C#6 D6 | E6 - - - C#6 - A5 - | D6 - B5 - F#5 - B5 D6 | B5 - G5 - D5 - G5 B5 | A5 - F#5 - D5 F#5 A5 - | E5 - - - A5 - C#6 -',
    },
  };
  for (const s of Object.values(SONGS)) s.mel = s.melody.replace(/\|/g, ' ').trim().split(/\s+/);

  function chordNotes(name) {
    const m = /^([A-G])(#?)(m?)$/.exec(name);
    const root = noteMidi(m[1] + m[2] + '2');
    const third = m[3] ? 3 : 4;
    const tones = [root, root + third, root + 7].map(n => { let x = n + 24; while (x < 55) x += 12; while (x > 67) x -= 12; return x; });
    return { root, tones };
  }

  const music = {
    cur: null, song: null, step: 0, next: 0, timer: null, out: null, intensity: 0,
    play(id) {
      if (!ensure()) return;
      if (this.cur === id && this.timer) return;
      this.stop(0.3);
      this.cur = id;
      this.song = SONGS[id];
      this.out = ctx.createGain();
      this.out.gain.setValueAtTime(0.0001, ctx.currentTime);
      this.out.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 0.4);
      this.out.connect(bgmBus);
      this.step = 0;
      this.next = ctx.currentTime + 0.1;
      this.intensity = 0;
      this.timer = setInterval(() => this.tick(), 25);
    },
    stop(fade = 0.5) {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      this.cur = null;
      if (this.out && ctx) {
        const o = this.out;
        o.gain.setTargetAtTime(0.0001, ctx.currentTime, fade / 3);
        setTimeout(() => o.disconnect(), fade * 1000 + 600);
      }
      this.out = null;
    },
    setIntensity(n) { this.intensity = n; },
    // 読み上げ中や一時停止中は、BGMを小さくする
    duck(on) { duckLevel = on ? 0.3 : 1; applyVolumes(); },
    tick() {
      if (!ctx || !this.song) return;
      const sd = 60 / this.song.bpm / 4;
      if (this.next < ctx.currentTime - 0.1) this.next = ctx.currentTime + 0.05; // 画面が裏にいた後は、まとめて鳴らさない
      while (this.next < ctx.currentTime + 0.12) {
        this.schedule(this.step, this.next, sd);
        this.next += sd;
        this.step++;
      }
    },
    schedule(step, t, sd) {
      const s = this.song, d = this.out;
      const i = step % 16, bar = Math.floor(step / 16) % s.chords.length;
      const ch = chordNotes(s.chords[bar]);
      const hit = p => p && p[i] === 'x';
      if (hit(s.kick)) kick(t, d);
      if (hit(s.snare)) { snare(t, d); if (s.bpm > 125) clap(t, d); }
      // 問題が出ているあいだは、ハイハットを細かくして盛り上げる
      if (this.intensity >= 1) hat(t, d, i % 4 === 2 ? 0.12 : 0.05);
      else if (hit(s.hat)) hat(t, d, 0.1, i % 4 === 2);
      if (s.shaker && i % 2 === 1) shaker(t, d);
      const b = s.bass[i];
      if (b && b !== '.') bass(t, ch.root + (b === 'o' ? 12 : b === '5' ? 7 : 0), sd * 1.7, d);
      if (hit(s.stab)) stab(t, ch.tones, sd * 1.5, d);
      if (s.pad && i === 0) pad(t, ch.tones, sd * 16, d, s.pad);
      // メロディ（8分音符ごと）
      if (i % 2 === 0) {
        const k = (bar * 8 + i / 2) % s.mel.length;
        const tok = s.mel[k];
        if (tok !== '-' && tok !== '.') {
          let len = 1;
          while (s.mel[(k + len) % s.mel.length] === '-' && len < 8) len++;
          const vol = s.leadVol * (this.intensity === 1 ? 0.6 : 1);
          lead(t, noteMidi(tok) + (s.leadShift || 0), len * sd * 2 * 0.92, d, s.lead, vol);
        }
      }
      // れんぞく正解中は、キラキラのアルペジオを足す
      if (this.intensity >= 2) {
        const arp = [0, 1, 2, 1];
        bell(t, ch.tones[arp[i % 4]] + 24, 0.18, d, 0.05);
      }
      // 8小節ごとにシンバル
      if (step % (16 * 8) === 0 && step > 0) noise(t, 1.2, d, 0.12, 'highpass', 5000);
    },
  };

  // ---- 効果音 ----
  function whoosh(t, dur, vol, from = 400, to = 4000) {
    const f = noise(t, dur, seBus, vol, 'bandpass', from, 1.5);
    f.frequency.exponentialRampToValueAtTime(to, t + dur);
  }
  function brassChord(t, notes, dur, vol) {
    for (const m of notes) {
      const f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(700, t); f.frequency.exponentialRampToValueAtTime(3500, t + 0.06); f.frequency.exponentialRampToValueAtTime(1500, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
      g.gain.setValueAtTime(vol, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      for (const det of [-7, 0, 7]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = det;
        o.connect(f); o.start(t); o.stop(t + dur + 0.05);
      }
      f.connect(g).connect(seBus);
    }
  }

  KG.music = music;
  KG.audio = {
    unlock: ensure,
    applyVolumes,
    // 正解：キラキラの上がっていく音。れんぞく正解するほど高くなる
    correct(combo = 1) {
      if (!ensure()) return;
      const t = ctx.currentTime + 0.01;
      const base = 72 + Math.min(combo - 1, 7);
      [0, 4, 7, 12, 16].forEach((iv, i) => {
        bell(t + i * 0.05, base + iv, 0.5, seBus, 0.22);
        osc('square', mtof(base + iv), t + i * 0.05, 0.08, seBus, 0.04);
      });
      for (let i = 0; i < 8; i++) bell(t + 0.22 + i * 0.045 + Math.random() * 0.02, base + 24 + [0, 4, 7, 12][i % 4], 0.25, seBus, 0.06);
      whoosh(t, 0.45, 0.25);
    },
    // れんぞく正解のファンファーレ
    comboFanfare(n) {
      if (!ensure()) return;
      const t = ctx.currentTime + 0.01;
      const up = Math.min(n, 10) - 3;
      brassChord(t, [67, 71, 74].map(x => x + up), 0.12, 0.06);
      brassChord(t + 0.14, [72, 76, 79, 84].map(x => x + up), 0.7, 0.07);
      noise(t + 0.14, 1.0, seBus, 0.15, 'highpass', 5000);
    },
    // 不正解：やさしい「ぽよん」
    wrong() {
      if (!ensure()) return;
      const t = ctx.currentTime + 0.01;
      for (const [st, f0, f1, v] of [[0, 520, 260, 0.3], [0.17, 400, 200, 0.22]]) {
        const o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(f0, t + st); o.frequency.exponentialRampToValueAtTime(f1, t + st + 0.3);
        lfo.frequency.value = 14; lg.gain.value = 18; lfo.connect(lg).connect(o.frequency);
        env(g, t + st, 0.01, v, 0.32);
        o.connect(g).connect(seBus);
        o.start(t + st); o.stop(t + st + 0.4); lfo.start(t + st); lfo.stop(t + st + 0.4);
      }
    },
    select(side) {
      if (!ensure()) return;
      const t = ctx.currentTime + 0.005;
      osc('triangle', side === 'L' ? 988 : 1319, t, 0.06, seBus, 0.18);
      osc('sine', side === 'L' ? 1976 : 2637, t, 0.03, seBus, 0.06);
    },
    // コイン：チャリン
    coin() {
      if (!ensure()) return;
      const t = ctx.currentTime + 0.005;
      osc('square', mtof(95), t, 0.06, seBus, 0.05);
      osc('square', mtof(100), t + 0.06, 0.18, seBus, 0.05);
      bell(t + 0.06, 100, 0.2, seBus, 0.08);
    },
    // ブースト板：ぐーんと加速
    boost() {
      if (!ensure()) return;
      const t = ctx.currentTime + 0.005;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(200, t); o.frequency.exponentialRampToValueAtTime(900, t + 0.4);
      env(g, t, 0.01, 0.08, 0.45);
      o.connect(g).connect(seBus); o.start(t); o.stop(t + 0.5);
      whoosh(t, 0.6, 0.3, 300, 6000);
    },
    // ジャンプ：ぴょーん
    jump() {
      if (!ensure()) return;
      const t = ctx.currentTime + 0.005;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(300, t); o.frequency.exponentialRampToValueAtTime(1200, t + 0.25);
      env(g, t, 0.01, 0.07, 0.3);
      o.connect(g).connect(seBus); o.start(t); o.stop(t + 0.35);
    },
    // ファイナルゲート：ドラムロール（だんだん大きく）
    drumroll(dur) {
      if (!ensure()) return;
      const t0 = ctx.currentTime + 0.05;
      const n = Math.floor((dur * 0.9) / 0.06);
      for (let i = 0; i < n; i++) noise(t0 + i * 0.06, 0.05, seBus, 0.04 + (0.16 * i) / n, 'bandpass', 1800, 0.8);
    },
    // スタートのカウントダウン（n=0 で GO）
    count(n) {
      if (!ensure()) return;
      const t = ctx.currentTime + 0.01;
      if (n > 0) { osc('square', 880, t, 0.12, seBus, 0.1); osc('sine', 880, t, 0.15, seBus, 0.15); }
      else { osc('square', 1760, t, 0.4, seBus, 0.1); bell(t, 96, 0.6, seBus, 0.15); whoosh(t, 0.6, 0.3, 300, 5000); }
    },
    goal() {
      if (!ensure()) return;
      const t = ctx.currentTime + 0.05;
      [[0, 72], [0.13, 72], [0.26, 72]].forEach(([dt, m]) => brassChord(t + dt, [m, m + 4, m + 7], 0.1, 0.06));
      brassChord(t + 0.42, [68, 72, 75, 80], 0.35, 0.06);
      brassChord(t + 0.8, [70, 74, 77, 82], 0.35, 0.06);
      brassChord(t + 1.18, [72, 76, 79, 84], 1.4, 0.07);
      noise(t + 1.18, 1.6, seBus, 0.18, 'highpass', 5000);
      for (let i = 0; i < 10; i++) bell(t + 1.2 + i * 0.07, 96 + [0, 4, 7, 12, 7][i % 5], 0.4, seBus, 0.05);
    },
    stamp() {
      if (!ensure()) return;
      const t = ctx.currentTime + 0.01;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(900, t); o.frequency.exponentialRampToValueAtTime(150, t + 0.12);
      env(g, t, 0.003, 0.4, 0.14);
      o.connect(g).connect(seBus); o.start(t); o.stop(t + 0.2);
      bell(t + 0.1, 91, 0.8, seBus, 0.18);
      bell(t + 0.2, 96, 0.8, seBus, 0.14);
    },
    star(i) {
      if (!ensure()) return;
      bell(ctx.currentTime + 0.01, 84 + [0, 4, 7][i % 3], 0.7, seBus, 0.2);
      whoosh(ctx.currentTime, 0.25, 0.12, 2000, 8000);
    },
    speak(text) {
      if (!KG.state.settings.voice || !window.speechSynthesis) return;
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ja-JP';
      u.rate = 0.9;
      const ja = speechSynthesis.getVoices().find(v => v.lang && v.lang.startsWith('ja'));
      if (ja) u.voice = ja;
      const undo = () => { clearTimeout(this.duckTimer); music.duck(false); };
      u.onend = undo;
      u.onerror = undo;
      music.duck(true);
      clearTimeout(this.duckTimer);
      this.duckTimer = setTimeout(undo, 6000);
      speechSynthesis.speak(u);
    },
    stopSpeak() { if (window.speechSynthesis) speechSynthesis.cancel(); },
  };
})();

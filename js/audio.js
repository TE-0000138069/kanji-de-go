// 効果音（WebAudioで合成）と音声読み上げ
window.KG = window.KG || {};

KG.audio = (function () {
  let ctx = null;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ctx = new AC();
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, start, dur, type = 'sine', vol = 1) {
    const c = ensure();
    const v = KG.state.settings.se * vol;
    if (!c || v <= 0) return;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, c.currentTime + start);
    g.gain.setValueAtTime(0.0001, c.currentTime + start);
    g.gain.exponentialRampToValueAtTime(0.25 * v, c.currentTime + start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
    o.connect(g).connect(c.destination);
    o.start(c.currentTime + start);
    o.stop(c.currentTime + start + dur + 0.05);
  }

  return {
    unlock: ensure, // iPadでは、最初のタップで音を有効にする必要がある
    correct() { tone(784, 0, 0.12, 'triangle'); tone(1047, 0.1, 0.12, 'triangle'); tone(1319, 0.2, 0.25, 'triangle'); },
    wrong() { tone(392, 0, 0.18, 'sine', 0.8); tone(330, 0.16, 0.28, 'sine', 0.8); },
    select() { tone(660, 0, 0.06, 'square', 0.3); },
    goal() { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.3, 'triangle')); },
    stamp() { tone(220, 0, 0.12, 'square', 0.5); tone(880, 0.08, 0.2, 'triangle'); },
    speak(text) {
      if (!KG.state.settings.voice || !window.speechSynthesis) return;
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ja-JP';
      u.rate = 0.9;
      const ja = speechSynthesis.getVoices().find(v => v.lang && v.lang.startsWith('ja'));
      if (ja) u.voice = ja;
      speechSynthesis.speak(u);
    },
    stopSpeak() { if (window.speechSynthesis) speechSynthesis.cancel(); },
  };
})();

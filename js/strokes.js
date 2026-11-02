// 書き順：KanjiVG の線（data/kanjivg.js の KG.STROKES）を使って
// ・書き順のアニメを見せる
// ・子どもが書いた1画が、正しい画・正しい向きかを判定する
// 座標は 0〜1（KanjiVG の 109×109 を 109 で割ったもの）
window.KG = window.KG || {};

KG.Stroke = (function () {
  const NS = 'http://www.w3.org/2000/svg';
  let svg = null;
  const cache = new Map();

  // 線の上の点を n 個とる（ブラウザの SVG の機能で、曲線の上をたどる）
  function sample(d, n = 24) {
    const key = d + '|' + n;
    if (cache.has(key)) return cache.get(key);
    if (!svg) {
      svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('style', 'position:absolute;width:0;height:0;visibility:hidden');
    }
    if (!svg.isConnected) document.body.appendChild(svg);
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
    const pts = [];
    try {
      const len = p.getTotalLength();
      for (let i = 0; i < n; i++) {
        const q = p.getPointAtLength((len * i) / (n - 1));
        pts.push([q.x / 109, q.y / 109]);
      }
    } catch (e) {
      // 線が読めないとき（ふつうは起きない）は、書きはじめの点だけ
      const m = /M\s*([\d.]+)[ ,]([\d.]+)/.exec(d) || [0, 54.5, 54.5];
      while (pts.length < n) pts.push([+m[1] / 109, +m[2] / 109]);
    }
    svg.removeChild(p);
    cache.set(key, pts);
    return pts;
  }

  const has = ch => !!(KG.STROKES && KG.STROKES[ch]);
  const strokes = ch => (KG.STROKES && KG.STROKES[ch]) || [];

  // 書いた線を、長さにそって n 個の点にならしなおす
  function resample(pts, n = 24) {
    if (pts.length < 2) return Array.from({ length: n }, () => pts[0] || [0, 0]);
    const seg = [0];
    for (let i = 1; i < pts.length; i++) seg.push(seg[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const total = seg[seg.length - 1] || 1e-6;
    const out = [];
    let j = 0;
    for (let i = 0; i < n; i++) {
      const t = (total * i) / (n - 1);
      while (j < seg.length - 2 && seg[j + 1] < t) j++;
      const f = (t - seg[j]) / Math.max(1e-6, seg[j + 1] - seg[j]);
      out.push([pts[j][0] + (pts[j + 1][0] - pts[j][0]) * f, pts[j][1] + (pts[j + 1][1] - pts[j][1]) * f]);
    }
    return out;
  }
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const length = pts => pts.slice(1).reduce((s, p, i) => s + dist(p, pts[i]), 0);

  // 1画の判定。ok：正しい／reason：'start'（書きはじめがちがう）'reverse'（向きが反対）'shape'（形がちがう）
  function match(user, d) {
    const n = 24;
    const e = sample(d, n);
    const u = resample(user, n);
    const eLen = length(e), uLen = length(user);
    // 点（短い画）は、場所が合っていればよい
    if (eLen < 0.09) {
      const ce = e[Math.floor(n / 2)], cu = u[Math.floor(n / 2)];
      return dist(ce, cu) < 0.11 && uLen < 0.3 ? { ok: true } : { ok: false, reason: dist(ce, cu) >= 0.11 ? 'start' : 'shape' };
    }
    let avg = 0, rev = 0;
    for (let i = 0; i < n; i++) { avg += dist(u[i], e[i]); rev += dist(u[i], e[n - 1 - i]); }
    avg /= n; rev /= n;
    const startD = dist(u[0], e[0]);
    if (avg < 0.11 && startD < 0.17 && uLen > eLen * 0.4) return { ok: true };
    if (rev < 0.11 && rev < avg * 0.7) return { ok: false, reason: 'reverse' };
    if (startD >= 0.17) return { ok: false, reason: 'start' };
    return { ok: false, reason: 'shape' };
  }

  // KanjiVG の線を、そのまま描く（size：キャンバスの一辺）
  function drawPath(ctx, d, size, color, width) {
    ctx.save();
    ctx.scale(size / 109, size / 109);
    ctx.strokeStyle = color;
    ctx.lineWidth = width * (109 / size);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke(new Path2D(d));
    ctx.restore();
  }
  // 線の一部（0〜t）だけを描く（アニメ用）
  function drawPartial(ctx, d, size, t, color, width) {
    const pts = sample(d, 40);
    const m = Math.max(2, Math.ceil(pts.length * t));
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.slice(0, m).forEach(([x, y], i) => (i ? ctx.lineTo(x * size, y * size) : ctx.moveTo(x * size, y * size)));
    ctx.stroke();
  }
  // 書きはじめの場所に、番号つきの丸
  function startDot(ctx, d, size, num, color) {
    const [x, y] = sample(d, 24)[0];
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x * size, y * size, size * 0.035, 0, Math.PI * 2); ctx.fill();
    if (num != null) {
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${size * 0.04}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(num, x * size, y * size + 1);
    }
  }
  // 方眼の紙
  function paper(ctx, size) {
    ctx.fillStyle = '#fffdf6';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = '#f0b9a8';
    ctx.lineWidth = Math.max(1, size * 0.004);
    ctx.setLineDash([size * 0.02, size * 0.02]);
    ctx.beginPath(); ctx.moveTo(size / 2, 0); ctx.lineTo(size / 2, size); ctx.moveTo(0, size / 2); ctx.lineTo(size, size / 2); ctx.stroke();
    ctx.setLineDash([]);
  }

  // 書き順のアニメ。canvas に描く。止めるときは返り値の関数をよぶ
  function animate(canvas, ch, { perStroke = 550, onDone } = {}) {
    const ctx = canvas.getContext('2d');
    const list = strokes(ch);
    const size = canvas.width;
    const w = size * 0.05;
    let stop = false;
    const t0 = performance.now();
    function frame(now) {
      if (stop) return;
      const el = now - t0;
      const k = Math.min(list.length, Math.floor(el / perStroke));
      paper(ctx, size);
      list.forEach(d => drawPath(ctx, d, size, '#e3e7ee', w));
      for (let i = 0; i < k; i++) drawPath(ctx, list[i], size, '#2b2d42', w);
      if (k < list.length) {
        drawPartial(ctx, list[k], size, (el % perStroke) / perStroke, '#e53935', w);
        startDot(ctx, list[k], size, k + 1, '#e53935');
        requestAnimationFrame(frame);
      } else if (onDone) onDone();
    }
    requestAnimationFrame(frame);
    return () => { stop = true; };
  }

  return { has, strokes, sample, match, drawPath, drawPartial, startDot, paper, animate };
})();

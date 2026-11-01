// 地図の画面：ステージを道でつないだ「すごろく」のような地図
// ・クリアしたところまで、道が舗装されている（その先は、まだ土の道）
// ・クリアしたステージのまわりには、家や木が建っていく
// ・まだ行けないステージは、霧に包まれている
// ・新しいステージが開くと、車が走って移動する
window.KG = window.KG || {};

KG.MapView = (function () {
  const S = 3; // ドット1つ = 画面の3ピクセル
  const hash = (n, s) => { const v = Math.sin(n * 12.9898 + s * 78.233) * 43758.5453; return v - Math.floor(v); };

  // ステージの位置。ステージが多いときは、へびのように2段で折り返す
  function layout(n, W, H) {
    const rows = n > 6 ? 2 : 1;
    const per = Math.ceil(n / rows);
    const mx = Math.min(110, W * 0.1);
    const pts = [];
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / per);
      let k = i % per;
      if (r % 2) k = per - 1 - k;
      const x = mx + (k * (W - 2 * mx)) / Math.max(1, per - 1);
      let y = rows === 1 ? H * 0.55 : H * (0.3 + 0.46 * r);
      y += (k % 2 ? -1 : 1) * H * 0.05;
      pts.push({ x, y });
    }
    return pts;
  }

  // ---- 地面 ----
  function ground(g, course, w, h) {
    const block = 8;
    for (let y = 0; y < h; y += block) for (let x = 0; x < w; x += block) {
      const odd = ((x + y) / block) % 2;
      let c;
      if (course === 'umi') c = y < h * 0.28 ? (odd ? '#3f9fe6' : '#3a96dc') : (odd ? '#ecd59a' : '#e3ca8a');
      else if (course === 'yama') c = odd ? '#5fae4c' : '#56a345';
      else c = odd ? '#79c25a' : '#70b952';
      g.fillStyle = c;
      g.fillRect(x, y, block, block);
    }
    // 土や草のつぶつぶ
    for (let i = 0; i < (w * h) / 60; i++) {
      const x = Math.floor(hash(i, 1) * w), y = Math.floor(hash(i, 2) * h);
      if (course === 'umi' && y < h * 0.28) { g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(x, y, 3, 1); continue; }
      g.fillStyle = hash(i, 3) > 0.5 ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
      g.fillRect(x, y, 1, 1);
    }
    if (course === 'umi') { g.fillStyle = '#f6e6b8'; g.fillRect(0, Math.floor(h * 0.28), w, 2); }
    if (course === 'yama') {
      // 上のほうに山
      for (let x = -20; x < w + 20; x += 24) {
        const ph = 18 + Math.floor(hash(x, 4) * 22);
        for (let s = 0; s < ph; s += 3) {
          g.fillStyle = s < 6 ? '#ffffff' : s % 6 < 3 ? '#8e9298' : '#858a90';
          g.fillRect(x - s * 0.8 + 12, s, s * 1.6, 3);
        }
      }
    }
  }

  // ---- 道 ----
  function road(g, a, b, paved) {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(len / 2));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, x = Math.round(a.x + (b.x - a.x) * t), y = Math.round(a.y + (b.y - a.y) * t);
      if (paved) {
        g.fillStyle = '#3d4048'; g.fillRect(x - 6, y - 6, 12, 12);
        g.fillStyle = '#6b6f7a'; g.fillRect(x - 5, y - 5, 10, 10);
      } else if (i % 4 === 0) {
        g.fillStyle = '#b58a52'; g.fillRect(x - 3, y - 3, 6, 6);
        g.fillStyle = '#9c7442'; g.fillRect(x - 3, y + 1, 6, 2);
      }
    }
    if (paved) {
      g.fillStyle = '#fff3a0';
      for (let i = 2; i < steps - 1; i += 6) {
        const t = i / steps;
        g.fillRect(Math.round(a.x + (b.x - a.x) * t) - 1, Math.round(a.y + (b.y - a.y) * t) - 1, 3, 3);
      }
    }
  }

  // ---- クリアしたステージのまわりに建つもの ----
  function deco(g, course, p, i, level) {
    const spots = [[-20, -18], [20, -16], [-24, 16], [24, 18]];
    spots.slice(0, 1 + level).forEach(([dx, dy], j) => {
      const x = Math.round(p.x + dx), y = Math.round(p.y + dy), v = Math.floor(hash(i * 7 + j, 5) * 4);
      if (course === 'machi') {
        if (j % 2 === 0) { // 家
          const walls = ['#f3e2c7', '#d9e8f5', '#f7d9e3', '#e5f2d3'][v], roofs = ['#c0392b', '#2e5fa8', '#6b4fb8', '#2e8b57'][v];
          g.fillStyle = walls; g.fillRect(x - 6, y - 6, 12, 9);
          g.fillStyle = roofs; for (let k = 0; k < 4; k++) g.fillRect(x - 7 + k, y - 7 - k, 14 - 2 * k, 1);
          g.fillStyle = '#7a4a24'; g.fillRect(x - 1, y - 1, 3, 4);
          g.fillStyle = '#8fd3ff'; g.fillRect(x - 5, y - 4, 2, 2); g.fillRect(x + 3, y - 4, 2, 2);
        } else tree(g, x, y);
      } else if (course === 'umi') {
        if (j % 2 === 0) { // ヤシの木
          g.fillStyle = '#9a6b3c'; g.fillRect(x, y - 10, 2, 12);
          g.fillStyle = '#2fae5b'; g.fillRect(x - 5, y - 12, 12, 2); g.fillRect(x - 3, y - 14, 8, 2); g.fillRect(x - 6, y - 10, 2, 2); g.fillRect(x + 6, y - 10, 2, 2);
        } else { // パラソル
          g.fillStyle = '#dddddd'; g.fillRect(x, y - 8, 1, 10);
          g.fillStyle = ['#ff5a4f', '#3d8bff', '#ffb02e', '#ff7eb6'][v]; g.fillRect(x - 5, y - 10, 11, 2); g.fillRect(x - 3, y - 12, 7, 2);
        }
      } else {
        if (j === 2 && v === 0) { // 鳥居
          g.fillStyle = '#e0452c'; g.fillRect(x - 5, y - 9, 2, 10); g.fillRect(x + 4, y - 9, 2, 10); g.fillRect(x - 6, y - 7, 13, 1);
          g.fillStyle = '#2b2b2b'; g.fillRect(x - 7, y - 10, 15, 2);
        } else pine(g, x, y);
      }
    });
    // 花
    for (let k = 0; k < 2 + level * 2; k++) {
      g.fillStyle = ['#ff5a8a', '#ffd54a', '#ffffff', '#b07cff'][(i + k) % 4];
      g.fillRect(Math.round(p.x + (hash(i * 13 + k, 6) - 0.5) * 50), Math.round(p.y + 10 + hash(i * 17 + k, 7) * 12), 2, 2);
    }
  }
  function tree(g, x, y) {
    g.fillStyle = '#7a4a24'; g.fillRect(x - 1, y - 4, 3, 6);
    g.fillStyle = '#2f8f48'; g.fillRect(x - 5, y - 12, 11, 9);
    g.fillStyle = '#3ea85a'; g.fillRect(x - 3, y - 15, 7, 4);
  }
  function pine(g, x, y) {
    g.fillStyle = '#6b4423'; g.fillRect(x - 1, y - 3, 2, 5);
    g.fillStyle = '#2e7d4a';
    for (let k = 0; k < 4; k++) g.fillRect(x - 6 + k * 1.5, y - 5 - k * 3, 12 - k * 3, 3);
  }
  function flag(g, p, stars) {
    const x = Math.round(p.x + 12), y = Math.round(p.y - 14);
    g.fillStyle = '#ddd'; g.fillRect(x, y - 10, 1, 12);
    g.fillStyle = stars >= 3 ? '#ffd54a' : '#ff5a4f';
    g.fillRect(x + 1, y - 10, 7, 5);
  }
  function fog(g, p, i) {
    for (let k = 0; k < 9; k++) {
      const x = Math.round(p.x + (hash(i * 31 + k, 8) - 0.5) * 70), y = Math.round(p.y + (hash(i * 37 + k, 9) - 0.5) * 50);
      const w = 16 + Math.floor(hash(i + k, 10) * 22);
      g.fillStyle = 'rgba(245,248,252,0.7)';
      g.fillRect(x - w / 2, y - 5, w, 10);
      g.fillRect(x - w / 4, y - 9, w / 2, 4);
    }
  }
  function tunnel(g, p) {
    const x = Math.round(p.x), y = Math.round(p.y);
    g.fillStyle = '#6f7378';
    for (let k = 0; k < 6; k++) g.fillRect(x - 26 + k * 3, y - 24 - k * 3 + 18, 52 - k * 6, 3);
    g.fillStyle = '#7d8288'; g.fillRect(x - 24, y - 6, 48, 18);
    g.fillStyle = '#1d1b26'; g.fillRect(x - 9, y - 2, 18, 14);
  }

  // ---- 描く ----
  // opts: { world, canvas, course, nodes: [{ html, cls, onPick }], current, from, celebrate }
  function render(opts) {
    const { world, canvas, course, nodes, current } = opts;
    world.querySelectorAll('.map-node, .map-car, .map-burst').forEach(e => e.remove());
    const r = world.getBoundingClientRect();
    const W = Math.max(320, r.width), H = Math.max(300, r.height);
    const pts = layout(nodes.length, W, H);
    const lw = Math.ceil(W / S), lh = Math.ceil(H / S);
    canvas.width = lw;
    canvas.height = lh;
    const g = canvas.getContext('2d');
    const lp = pts.map(p => ({ x: p.x / S, y: p.y / S }));
    const drawAll = cur => {
      ground(g, course, lw, lh);
      tunnel(g, lp[lp.length - 1]);
      for (let i = 0; i < lp.length - 1; i++) road(g, lp[i], lp[i + 1], i + 1 <= cur);
      nodes.forEach((n, i) => {
        if (n.boss) return;
        if (i < cur) { deco(g, course, lp[i], i, Math.min(3, n.stars || 1)); flag(g, lp[i], n.stars || 0); }
      });
      nodes.forEach((n, i) => { if (!n.boss && i > cur) fog(g, lp[i], i); });
    };
    const from = opts.from != null && opts.from < current ? opts.from : current;
    drawAll(from);

    nodes.forEach((n, i) => {
      const b = document.createElement('button');
      b.className = 'map-node ' + n.cls;
      b.style.left = pts[i].x + 'px';
      b.style.top = pts[i].y + 'px';
      b.innerHTML = n.html;
      if (n.disabled) b.disabled = true;
      b.onclick = n.onPick;
      world.appendChild(b);
    });

    // 車：いまのステージの上で、ぴょこぴょこ
    const car = document.createElement('div');
    car.className = 'map-car';
    const at = i => { const p = pts[Math.min(i, pts.length - 1)]; car.style.left = p.x + 'px'; car.style.top = p.y - 58 + 'px'; };
    at(from);
    world.appendChild(car);

    // 新しく開いたとき：車が走って、道ができる
    if (from < current) {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        car.classList.add('moving');
        at(current);
      }));
      setTimeout(() => {
        car.classList.remove('moving');
        drawAll(current);
        const p = pts[Math.min(current, pts.length - 1)];
        const burst = document.createElement('div');
        burst.className = 'map-burst';
        burst.style.left = p.x + 'px';
        burst.style.top = p.y + 'px';
        burst.innerHTML = Array.from({ length: 14 }, (_, k) => `<i style="--a:${(k * 360) / 14}deg;--c:${['#ffd54a', '#ff5a8a', '#7ee0ff', '#9bff7e'][k % 4]}"></i>`).join('') + '<b>NEW!</b>';
        world.appendChild(burst);
        if (opts.celebrate) opts.celebrate();
      }, 1500);
    }
  }

  return { render };
})();

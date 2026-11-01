// メニュー画面の見た目（ブロック風）
// 1. ブロック模様の小さな画像（16×16のドット絵）を作って、CSSから使えるようにする
// 2. タイトルやホームのうしろに、ドット絵の景色を描く（雲が流れ、車が走る）
window.KG = window.KG || {};

(function () {
  const hash = (n, s) => { const v = Math.sin(n * 12.9898 + s * 78.233) * 43758.5453; return v - Math.floor(v); };
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const f = c => Math.max(0, Math.min(255, Math.round(c + amt * 255)));
    return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
  }
  function tex(draw) {
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    draw(c.getContext('2d'));
    return c.toDataURL();
  }
  function noisy(g, base, vary, seed, y0 = 0, y1 = 16) {
    for (let y = y0; y < y1; y++) for (let x = 0; x < 16; x++) {
      g.fillStyle = shade(base, (hash(x + y * 16, seed) - 0.5) * vary);
      g.fillRect(x, y, 1, 1);
    }
  }

  // ---- ブロック模様 ----
  const T = {
    stone: tex(g => { noisy(g, '#8e9298', 0.18, 1); g.fillStyle = 'rgba(0,0,0,0.15)'; for (let i = 0; i < 6; i++) g.fillRect(Math.floor(hash(i, 2) * 14), Math.floor(hash(i, 3) * 15), 2, 1); }),
    dirt: tex(g => noisy(g, '#8b5a2b', 0.16, 4)),
    grass: tex(g => noisy(g, '#62b443', 0.16, 5)),
    grassBlock: tex(g => {
      noisy(g, '#8b5a2b', 0.16, 6);
      noisy(g, '#62b443', 0.14, 7, 0, 4);
      for (let x = 0; x < 16; x++) if (hash(x, 8) > 0.45) { g.fillStyle = '#56a33a'; g.fillRect(x, 4, 1, 1 + Math.floor(hash(x, 9) * 2)); }
    }),
    planks: tex(g => {
      noisy(g, '#b8945f', 0.08, 10);
      g.fillStyle = 'rgba(80,50,20,0.45)';
      for (const y of [3, 7, 11, 15]) g.fillRect(0, y, 16, 1);
      g.fillRect(5, 0, 1, 3); g.fillRect(12, 4, 1, 3); g.fillRect(3, 8, 1, 3); g.fillRect(10, 12, 1, 3);
    }),
    cobble: tex(g => {
      noisy(g, '#7a7f86', 0.2, 11);
      g.fillStyle = 'rgba(0,0,0,0.3)';
      for (const [x, y, w, h] of [[0, 4, 6, 1], [6, 0, 1, 5], [9, 6, 7, 1], [3, 10, 8, 1], [11, 7, 1, 4], [2, 11, 1, 5], [12, 12, 4, 1]]) g.fillRect(x, y, w, h);
    }),
    obsidian: tex(g => { noisy(g, '#2a1f3d', 0.12, 12); g.fillStyle = 'rgba(160,120,255,0.35)'; for (let i = 0; i < 5; i++) g.fillRect(Math.floor(hash(i, 13) * 15), Math.floor(hash(i, 14) * 15), 2, 1); }),
    gold: tex(g => { noisy(g, '#f2c230', 0.12, 15); g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(2, 2, 4, 1); g.fillRect(2, 3, 1, 3); }),
  };
  const root = document.documentElement.style;
  for (const [k, v] of Object.entries(T)) root.setProperty(`--tex-${k}`, `url(${v})`);
  KG.TEX = T;

  // ---- ドット絵のアイコン（12×12。文字が色を表す）----
  const ICONS = {
    book: [{ B: '#8b3a2b', W: '#f4ead5', Y: '#9a8f7a', b: '#5a2318' }, ['............', '.BBBBBBBBB..', '.BWWWWWWWBb.', '.BWYYYYYWBb.', '.BWWWWWWWBb.', '.BWYYYYWWBb.', '.BWWWWWWWBb.', '.BWYYYYYWBb.', '.BWWWWWWWBb.', '.BBBBBBBBBb.', '..bbbbbbbbb.', '............']],
    car: [{ R: '#ff5a4f', C: '#a9dcff', K: '#1e1e1e', Y: '#fff3b0', r: '#c0392b' }, ['............', '............', '...RRRRR....', '..RCCRCCR...', '.RRRRRRRRRR.', '.RRRRRRRRRRY', '.rrrrrrrrrr.', '..KK....KK..', '..KK....KK..', '............', '............', '............']],
    fuel: [{ R: '#e53935', r: '#b71c1c', W: '#ffffff', K: '#555555' }, ['....KKK.....', '...K...K....', '..RRRRRRR...', '..RrrrrrR...', '..RrRRRrR...', '..RrRWRrR...', '..RrRRRrR...', '..RrrrrrR...', '..RRRRRRR...', '..RRRRRRR...', '............', '............']],
    gear: [{ G: '#9aa0a8', D: '#5b6470' }, ['....GGGG....', '..G.GGGG.G..', '.GGGGGGGGGG.', '..GGGDDGGG..', 'GGGGD..DGGGG', 'GGGD....DGGG', 'GGGD....DGGG', 'GGGGD..DGGGG', '..GGGDDGGG..', '.GGGGGGGGGG.', '..G.GGGG.G..', '....GGGG....']],
    house: [{ R: '#c0392b', W: '#f3e2c7', C: '#8fd3ff', D: '#7a4a24' }, ['.....RR.....', '....RRRR....', '...RRRRRR...', '..RRRRRRRR..', '.RRRRRRRRRR.', '..WWWWWWWW..', '..WCCWWCCW..', '..WCCWWCCW..', '..WWWDDWWW..', '..WWWDDWWW..', '..WWWDDWWW..', '............']],
    lock: [{ K: '#555555', Y: '#f2c230', y: '#c79100' }, ['............', '....KKKK....', '...K....K...', '...K....K...', '..YYYYYYYY..', '..YYYYYYYY..', '..YYYKKYYY..', '..YYYKKYYy..', '..YYYYYYYy..', '..yyyyyyyy..', '............', '............']],
    wheel: [{ K: '#2b2b2b', Y: '#e0a800', W: '#fff2a8' }, ['....KKKK....', '..KKKKKKKK..', '.KKKYYYYKKK.', '.KKYYWWYYKK.', 'KKYYWYYWYYKK', 'KKYWYYYYWYKK', 'KKYWYYYYWYKK', 'KKYYWYYWYYKK', '.KKYYWWYYKK.', '.KKKYYYYKKK.', '..KKKKKKKK..', '....KKKK....']],
    flag: [{ P: '#9aa0a8', R: '#ff5a4f', W: '#ffffff' }, ['..PRRRRR....', '..PRRRRRR...', '..PRRWWRRR..', '..PRRWWRRR..', '..PRRRRRR...', '..PRRRRR....', '..P.........', '..P.........', '..P.........', '..P.........', '.PPP........', '............']],
    crown: [{ Y: '#ffd54a', y: '#c79100', R: '#ff3b6b' }, ['............', '............', 'Y....YY....Y', 'YY..YYYY..YY', 'YYY.YYYY.YYY', 'YYYYYYYYYYYY', 'YYYYYRRYYYYY', 'YYYYYRRYYYYY', 'YYYYYYYYYYYY', 'yyyyyyyyyyyy', '............', '............']],
    siren: [{ R: '#ff3030', B: '#3d8bff', W: '#ffffff', K: '#444444' }, ['............', '............', '....RRBB....', '...RRRBBB...', '..RRRRBBBB..', '..RWRRBWBB..', '..RRRRBBBB..', '.KKKKKKKKKK.', '.KKKKKKKKKK.', '............', '............', '............']],
    truck: [{ G: '#5b6470', R: '#3d8bff', C: '#a9dcff', K: '#1e1e1e', Y: '#fff3b0' }, ['............', '............', '......RRRR..', '......RCCR..', 'GGGGGGRCCRR.', 'GGGGGGRRRRR.', 'RRRRRRRRRRRY', 'RRRRRRRRRRR.', '.KK....KK...', '.KK....KK...', '............', '............']],
    kart: [{ W: '#ffffff', K: '#1e1e1e', R: '#33c27a', V: '#2b2d42' }, ['............', '............', '............', '.....WW.....', '....WWWW....', '....WVVW....', '..RRRRRRRR..', 'KRRRRRRRRRRK', 'KK........KK', 'KK........KK', '............', '............']],
    bus: [{ Y: '#ffc928', C: '#a9dcff', K: '#1e1e1e' }, ['............', '.YYYYYYYYYY.', '.YCCYCCYCCY.', '.YCCYCCYCCY.', '.YYYYYYYYYY.', '.YYYYYYYYYY.', '.YYYYYYYYYY.', '..KK....KK..', '..KK....KK..', '............', '............', '............']],
    fire: [{ R: '#ff5a4f', O: '#ff9f43', Y: '#ffd54a' }, ['.....R......', '....RR...R..', '...RRR..RR..', '..RRORR.RR..', '..ROOORRRR..', '.RROOOORRR..', '.ROOYYOORR..', '.ROYYYYOOR..', '.ROYYYYYOR..', '.RROYYYORR..', '..RROOORR...', '...RRRRR....']],
    rainbow: [{ r: '#ff4d4d', o: '#ff9f43', y: '#ffe14d', g: '#4cd964', b: '#4da6ff' }, ['............', '....rrrr....', '..rroooorr..', '.rooyyyyoor.', '.royyggyyor.', 'roygbbbbgyor', 'roygb..bgyor', 'roygb..bgyor', 'roygb..bgyor', '............', '............', '............']],
    star: [{ Y: '#ffd54a', y: '#e0a800', W: '#fff6c9' }, ['.....YY.....', '.....YY.....', '....YYYY....', 'YYYYYWYYYYYY', '.YYYWYYYYYy.', '..YYYYYYYy..', '...YYYYYy...', '..YYYyyYYy..', '..YYy..yYy..', '.YYy....yYy.', '.Yy......yy.', '............']],
  };
  for (const [name, [pal, rows]] of Object.entries(ICONS)) {
    const url = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 12;
      const x = c.getContext('2d');
      rows.forEach((row, y) => [...row].forEach((ch, i) => { if (pal[ch]) { x.fillStyle = pal[ch]; x.fillRect(i, y, 1, 1); } }));
      return c.toDataURL();
    })();
    root.setProperty(`--ico-${name}`, `url(${url})`);
  }

  // ---- メニューのうしろの景色（ドット絵）----
  const cv = document.getElementById('menuBg');
  if (!cv) return;
  const g = cv.getContext('2d');
  let W = 256, H = 160, t = 0, last = 0;

  function resize() {
    const r = window.innerWidth / Math.max(1, window.innerHeight);
    W = 256;
    H = Math.max(120, Math.round(W / r));
    cv.width = W;
    cv.height = H;
    buildStatic();
  }

  // 動かない部分（空・山・地面・木・花）は、画面の大きさが変わったときだけ描く
  let skyLayer, landLayer, ground = 100;
  function layer() { const c = document.createElement('canvas'); c.width = W; c.height = H; return [c, c.getContext('2d')]; }
  function buildStatic() {
    ground = Math.round(H * 0.68);
    let s;
    [skyLayer, s] = layer();
    const bands = ['#5fb4f2', '#6cbcf4', '#7ac4f6', '#89ccf7', '#9ad4f8', '#acdcf9'];
    bands.forEach((c, i) => { s.fillStyle = c; s.fillRect(0, Math.floor((ground * i) / bands.length), W, Math.ceil(ground / bands.length) + 1); });
    s.fillStyle = 'rgba(255,250,200,0.35)'; s.fillRect(24, 10, 28, 28);
    s.fillStyle = '#fff6c9'; s.fillRect(30, 16, 16, 16);
    let l;
    [landLayer, l] = layer();
    const ridge = (step, color, seed, hmax) => {
      l.fillStyle = color;
      for (let x = 0; x < W; x += step) {
        const h = Math.floor((0.35 + 0.65 * Math.abs(Math.sin(x * 0.021 + seed))) * hmax / step) * step;
        l.fillRect(x, ground - h, step, h + 1);
      }
    };
    ridge(8, '#9cc9a0', 1.3, H * 0.28);
    ridge(8, '#7fbf6a', 2.1, H * 0.16);
    for (let x = 0; x < W; x += 16) for (let y = ground; y < H; y += 16) for (let py = 0; py < 16; py++) for (let px = 0; px < 16; px++) {
      const top = y === ground && py < 3 + (hash(x + px, 30) > 0.6 ? 1 : 0);
      l.fillStyle = shade(top ? '#62b443' : '#8b5a2b', (hash(x * 7 + px + (y + py) * 131, 31) - 0.5) * 0.16 - (y > ground ? 0.06 : 0));
      l.fillRect(x + px, y + py, 1, 1);
    }
    for (const tx of [18, 70, 150, 214]) {
      const h = 18 + (tx % 3) * 4;
      l.fillStyle = '#7a4a24'; l.fillRect(tx + 6, ground - h, 4, h);
      l.fillStyle = '#2f8f48'; l.fillRect(tx, ground - h - 10, 16, 14);
      l.fillStyle = '#3ea85a'; l.fillRect(tx + 3, ground - h - 15, 10, 6);
    }
    for (let i = 0; i < 14; i++) {
      const fx = Math.floor(hash(i, 40) * W), c = ['#ff5a8a', '#ffd54a', '#ffffff', '#b07cff'][i % 4];
      l.fillStyle = '#3a8f3e'; l.fillRect(fx, ground - 3, 1, 3);
      l.fillStyle = c; l.fillRect(fx - 1, ground - 5, 3, 2);
    }
  }

  function draw() {
    g.drawImage(skyLayer, 0, 0);
    // 雲
    g.fillStyle = '#ffffff';
    for (let i = 0; i < 6; i++) {
      const w = 24 + Math.floor(hash(i, 20) * 24);
      const x = Math.floor((((i * 61 + t * (2 + (i % 3))) % (W + 60)) + W + 60) % (W + 60)) - 50;
      const y = 8 + Math.floor(hash(i, 21) * ground * 0.35);
      g.fillRect(x, y, w, 6);
      g.fillRect(x + 6, y - 4, w - 14, 4);
    }
    g.drawImage(landLayer, 0, 0);
    // 走る車
    const cx = Math.floor(((t * 22) % (W + 60)) - 40), cy = ground - 9;
    g.fillStyle = '#ff5a4f'; g.fillRect(cx, cy + 2, 26, 6); g.fillRect(cx + 6, cy - 3, 13, 6);
    g.fillStyle = '#a9dcff'; g.fillRect(cx + 8, cy - 1, 4, 3); g.fillRect(cx + 13, cy - 1, 4, 3);
    g.fillStyle = '#1e1e1e'; g.fillRect(cx + 3, cy + 7, 5, 4); g.fillRect(cx + 18, cy + 7, 5, 4);
    g.fillStyle = '#fff3b0'; g.fillRect(cx + 24, cy + 3, 2, 2);
    g.fillStyle = 'rgba(220,220,220,0.8)'; g.fillRect(cx - 4 - (Math.floor(t * 8) % 3), cy + 5, 3, 2);
  }

  function loop(now) {
    requestAnimationFrame(loop);
    // ドライブ中は描かない。そのほかも、なめらかさより電池を優先して 1秒に15回だけ描く
    if (document.querySelector('#scr-drive.on') || now - last < 66) return;
    t += (now - (last || now)) / 1000;
    last = now;
    draw();
  }
  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(loop);
})();

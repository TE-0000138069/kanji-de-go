// ドライブモードの3D表示（ブロック風）
// ゲームの進み方（問題・判定・時間）は drive.js のまま。ここでは見た目だけを担当する。
// Three.js は js/three-loader.js が window.THREE に入れる。読みこめないときは2D表示のまま。
window.KG = window.KG || {};

(function () {
  // エリアごとの地面の種類と、まわりの地形
  const PROFILE = {
    'じゅうたくがい': ['grass', 'hills'], 'しょうてんがい': ['pave', 'city'], 'こうえん': ['grass', 'hills'],
    'ビルがい': ['pave', 'tall'], 'ゆうやけの かわ': ['grass', 'hills'],
    'すなはま': ['sand', 'flat'], 'みなと': ['pave', 'flat'], 'とうだいの みさき': ['grass', 'hills'], 'ゆうひの うみ': ['sand', 'flat'],
    'もりの みち': ['grass', 'mountains'], 'おはなばたけ': ['grass', 'hills'], 'かわの はし': ['grass', 'mountains'],
    'トンネル': ['stone', 'tunnel'], 'ゆきやま': ['snow', 'mountains'],
  };
  // 建物や木の、横はばの半分（道にはみ出さないように置くため）
  const HALF = { house: 1.2, shop: 1.1, building: 1.2, tree: 0.9, pine: 0.9, snowpine: 0.9, palm: 0.7, parasol: 0.9, flowers: 0.9,
    bush: 0.7, lamp: 0.2, signal: 0.5, mailbox: 0.3, vending: 0.4, fountain: 0.9, container: 1.2, lighthouse: 0.7, rock: 0.7,
    windmill: 0.8, torii: 1.1, snowman: 0.5 };
  const SHOP_SIGNS = ['肉', '魚', '茶', '米', '本', '花', '店', '絵', '楽', '麦'];
  const FAR = 70, BACK = 4;

  const rnd = (k, s) => KG.rnd(k, s);
  function noise2(x, y, seed) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const h = (a, b) => rnd(a * 57.13 + b * 131.7, seed);
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = h(ix, iy) + (h(ix + 1, iy) - h(ix, iy)) * sx;
    const b = h(ix, iy + 1) + (h(ix + 1, iy + 1) - h(ix, iy + 1)) * sx;
    return a + (b - a) * sy;
  }

  // ---- ドット絵のテクスチャ（16×16）----
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const f = c => Math.max(0, Math.min(255, Math.round(c + amt * 255)));
    return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
  }
  function pixTex(draw) {
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    draw(c.getContext('2d'));
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }
  function noisy(g, base, vary, seed, y0 = 0, y1 = 16) {
    for (let y = y0; y < y1; y++) for (let x = 0; x < 16; x++) {
      g.fillStyle = shade(base, (rnd(x + y * 16, seed) - 0.5) * vary);
      g.fillRect(x, y, 1, 1);
    }
  }
  function makeTextures() {
    const T = {};
    T.grassTop = pixTex(g => noisy(g, '#6cc04a', 0.18, 1));
    T.dirt = pixTex(g => noisy(g, '#8b5a2b', 0.16, 2));
    T.grassSide = pixTex(g => {
      noisy(g, '#8b5a2b', 0.16, 3);
      noisy(g, '#6cc04a', 0.15, 4, 0, 3);
      for (let x = 0; x < 16; x++) if (rnd(x, 5) > 0.45) { g.fillStyle = '#5aa83c'; g.fillRect(x, 3, 1, 1 + Math.floor(rnd(x, 6) * 2)); }
    });
    T.sand = pixTex(g => noisy(g, '#e9d39a', 0.1, 7));
    T.stone = pixTex(g => {
      noisy(g, '#8e9298', 0.16, 8);
      g.fillStyle = 'rgba(0,0,0,0.18)';
      for (let i = 0; i < 6; i++) g.fillRect(Math.floor(rnd(i, 9) * 14), Math.floor(rnd(i, 10) * 15), 2, 1);
    });
    T.pave = pixTex(g => {
      noisy(g, '#c9cdd2', 0.08, 11);
      g.fillStyle = 'rgba(0,0,0,0.15)';
      g.fillRect(0, 0, 16, 1); g.fillRect(0, 8, 16, 1); g.fillRect(0, 0, 1, 8); g.fillRect(8, 8, 1, 8);
    });
    T.snowTop = pixTex(g => noisy(g, '#f4f8fc', 0.06, 12));
    T.snowSide = pixTex(g => { noisy(g, '#8e9298', 0.14, 13); noisy(g, '#f4f8fc', 0.06, 14, 0, 4); });
    T.water = pixTex(g => {
      noisy(g, '#3a9be8', 0.08, 15);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      for (let i = 0; i < 5; i++) g.fillRect(Math.floor(rnd(i, 16) * 12), Math.floor(rnd(i, 17) * 16), 3, 1);
    });
    T.bldg = pixTex(g => {
      noisy(g, '#a9b8c9', 0.06, 18);
      for (let y = 2; y < 16; y += 5) for (let x = 2; x < 16; x += 5) {
        g.fillStyle = rnd(x + y * 3, 19) > 0.55 ? '#ffe58a' : '#5f7fa6';
        g.fillRect(x, y, 3, 3);
      }
    });
    T.roof = pixTex(g => noisy(g, '#7d8590', 0.08, 20));
    T.asphalt = pixTex(g => {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const v = 215 + Math.floor((rnd(x + y * 16, 21) - 0.5) * 50);
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.fillRect(x, y, 1, 1);
      }
    });
    return T;
  }

  // ---- ブロックで組み立てるモデル ----
  // box(x, y, z, はば, 高さ, おくゆき, 色, 光るか)。x・zは中心、yは下の面
  class ModelBuilder {
    constructor() { this.parts = { lit: { p: [], n: [], c: [] }, glow: { p: [], n: [], c: [] } }; }
    box(x, y, z, w, h, d, color, glow) {
      const t = this.parts[glow ? 'glow' : 'lit'];
      const col = new THREE.Color(color);
      const x0 = x - w / 2, x1 = x + w / 2, y0 = y, y1 = y + h, z0 = z - d / 2, z1 = z + d / 2;
      const faces = [
        [[1, 0, 0], 0.82, [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]]],
        [[-1, 0, 0], 0.82, [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]]],
        [[0, 1, 0], 1.0, [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]]],
        [[0, -1, 0], 0.55, [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]],
        [[0, 0, 1], 0.92, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]],
        [[0, 0, -1], 0.7, [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]]],
      ];
      for (const [n, s, v] of faces) {
        const k = glow ? 1 : s;
        for (const i of [0, 1, 2, 0, 2, 3]) {
          t.p.push(...v[i]); t.n.push(...n); t.c.push(col.r * k, col.g * k, col.b * k);
        }
      }
      return this;
    }
    build(mats) {
      const g = new THREE.Group();
      for (const key of ['lit', 'glow']) {
        const t = this.parts[key];
        if (!t.p.length) continue;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(t.p, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(t.n, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(t.c, 3));
        geo.computeBoundingSphere();
        g.add(new THREE.Mesh(geo, mats[key]));
      }
      return g;
    }
  }

  const GREENS = ['#3c9e4e', '#2f8f48', '#4bb35c', '#3a9a45'];
  const WALLS = ['#f3e2c7', '#d9e8f5', '#f7d9e3', '#e5f2d3'];
  const ROOFS = ['#c0392b', '#2e5fa8', '#6b4fb8', '#2e8b57'];

  // 種類ごとのモデル。v はバリエーション番号
  const MODELS = {
    house(m, v) {
      m.box(0, 0, 0, 2.2, 1.6, 2.0, WALLS[v]);
      for (let k = 0; k < 4; k++) m.box(0, 1.6 + k * 0.3, 0, 2.5 - k * 0.6, 0.3, 2.2, ROOFS[v]);
      m.box(0, 0, 1.0, 0.5, 0.95, 0.06, '#7a4a24');
      m.box(-0.65, 0.75, 1.0, 0.45, 0.45, 0.06, '#8fd3ff');
      m.box(0.65, 0.75, 1.0, 0.45, 0.45, 0.06, '#8fd3ff');
      if (v % 2) m.box(0.6, 1.9, -0.3, 0.3, 0.7, 0.3, '#8a6d5a');
    },
    shop(m, v) {
      const wall = WALLS[v % 4];
      m.box(0, 0, 0, 2.0, 1.8, 1.8, wall);
      m.box(0, 0.1, 0.9, 1.6, 0.9, 0.06, '#bfe6ff');
      const cols = [['#ff5a4f', '#ffffff'], ['#2fae5b', '#ffffff'], ['#3d8bff', '#ffffff'], ['#ffb02e', '#ffffff']][v % 4];
      for (let i = 0; i < 6; i++) m.box(-0.85 + i * 0.34, 1.05, 1.15, 0.34, 0.14, 0.55, cols[i % 2]);
      m.box(0, 1.85, 0.5, 1.4, 0.65, 0.16, '#fffaf0');
    },
    building(m, v) {
      const h = 4 + v * 1.5, cols = ['#9fb8d6', '#c9d3df', '#b3c7b8', '#d6c2a8'];
      m.box(0, 0, 0, 2.2, h, 2.2, cols[v]);
      for (let y = 0.5; y < h - 0.4; y += 0.8) for (let i = 0; i < 3; i++) {
        const lit = rnd(y * 7 + i, v * 9) > 0.55 ? '#ffe58a' : '#5f7fa6';
        m.box(-0.7 + i * 0.7, y, 1.1, 0.4, 0.45, 0.06, lit);
        m.box(1.1, y, -0.7 + i * 0.7, 0.06, 0.45, 0.4, lit);
        m.box(-1.1, y, -0.7 + i * 0.7, 0.06, 0.45, 0.4, lit);
      }
      m.box(0, h, 0, 1.2, 0.4, 1.2, '#7d8590');
      m.box(0.3, h + 0.4, 0, 0.08, 1.0, 0.08, '#777');
      m.box(0.3, h + 1.4, 0, 0.16, 0.16, 0.16, '#ff4040', true);
    },
    tree(m, v) {
      m.box(0, 0, 0, 0.35, 1.1, 0.35, '#7a4a24');
      m.box(0, 1.0, 0, 1.7, 1.2, 1.7, GREENS[v]);
      m.box(0, 2.2, 0, 1.0, 0.6, 1.0, GREENS[(v + 2) % 4]);
      if (v === 3) for (let i = 0; i < 5; i++) m.box(Math.cos(i * 1.3) * 0.86, 1.3 + (i % 2) * 0.5, Math.sin(i * 1.3) * 0.86, 0.18, 0.18, 0.18, '#ff4a3d');
    },
    pine(m, v, snow) {
      m.box(0, 0, 0, 0.3, 0.8, 0.3, '#6b4423');
      const s = 0.85 + v * 0.12;
      [1.9, 1.45, 1.0, 0.55].forEach((w, k) => {
        m.box(0, (0.6 + k * 0.55) * s, 0, w * s, 0.55 * s, w * s, k % 2 ? '#2e7d4a' : '#3a9058');
        if (snow) m.box(0, (0.6 + k * 0.55 + 0.5) * s, 0, w * s * 0.9, 0.12, w * s * 0.9, '#ffffff');
      });
      m.box(0, (0.6 + 4 * 0.55) * s, 0, 0.25, 0.3, 0.25, snow ? '#ffffff' : '#2e7d4a');
    },
    snowpine(m, v) { MODELS.pine(m, v, true); },
    palm(m, v) {
      const lean = (v - 1.5) * 0.08;
      for (let i = 0; i < 7; i++) m.box(lean * i, i * 0.4, 0, 0.28, 0.42, 0.28, i % 2 ? '#9a6b3c' : '#8a5e33');
      const tx = lean * 7, ty = 2.8;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        m.box(tx + dx * 0.7, ty, dz * 0.7, dx ? 1.3 : 0.35, 0.15, dz ? 1.3 : 0.35, '#2fae5b');
        m.box(tx + dx * 1.35, ty - 0.25, dz * 1.35, 0.35, 0.3, 0.35, '#27994f');
      }
      m.box(tx, ty - 0.2, 0, 0.3, 0.3, 0.3, '#7a4a22');
    },
    parasol(m, v) {
      const c = [['#ff5a4f', '#ffffff'], ['#3d8bff', '#ffffff'], ['#ffb02e', '#ffffff'], ['#ff7eb6', '#ffffff']][v];
      m.box(0, 0, 0, 0.08, 1.7, 0.08, '#dddddd');
      m.box(0, 1.5, 0, 1.9, 0.12, 1.9, c[0]);
      m.box(0, 1.62, 0, 1.3, 0.12, 1.3, c[1]);
      m.box(0, 1.74, 0, 0.7, 0.12, 0.7, c[0]);
      m.box(0.8, 0, 0.3, 0.8, 0.05, 1.4, ['#ff7eb6', '#3d8bff', '#ffd54a', '#33c27a'][v]);
    },
    flowers(m, v) {
      m.box(0, 0, 0, 1.8, 0.08, 1.3, '#4caf50');
      const cols = ['#ff5a8a', '#ffd54a', '#ffffff', '#b07cff', '#ff8a3d'];
      for (let i = 0; i < 10; i++) {
        const x = (rnd(i, v * 10) - 0.5) * 1.5, z = (rnd(i, v * 10 + 3) - 0.5) * 1.1, h = 0.15 + rnd(i, v + 7) * 0.25;
        m.box(x, 0.08, z, 0.05, h, 0.05, '#3a8f3e');
        m.box(x, 0.08 + h, z, 0.2, 0.2, 0.2, cols[(i + v) % 5]);
      }
    },
    bush(m, v) {
      m.box(0, 0, 0, 1.3, 0.7, 1.0, GREENS[v]);
      m.box(0.1, 0.7, 0, 0.8, 0.4, 0.7, GREENS[(v + 1) % 4]);
    },
    lamp(m, v, night) {
      m.box(0, 0, 0, 0.12, 2.4, 0.12, '#5b6470');
      m.box(0.25, 2.3, 0, 0.55, 0.08, 0.08, '#5b6470');
      m.box(0.48, 2.12, 0, 0.26, 0.16, 0.26, '#fff3b0', true);
    },
    signal(m, v) {
      m.box(0, 0, 0, 0.12, 2.2, 0.12, '#5b6470');
      m.box(0, 2.0, 0, 0.95, 0.36, 0.25, '#2c3138');
      ['#33c27a', '#ffc928', '#ff5a4f'].forEach((c, i) => m.box(-0.3 + i * 0.3, 2.06, 0.13, 0.22, 0.22, 0.04, i === v % 3 ? c : '#4a4f57', i === v % 3));
    },
    mailbox(m) {
      m.box(0, 0, 0, 0.45, 1.0, 0.45, '#e53935');
      m.box(0, 1.0, 0, 0.52, 0.1, 0.52, '#c62828');
      m.box(0, 0.7, 0.23, 0.26, 0.05, 0.03, '#222222');
    },
    vending(m, v) {
      m.box(0, 0, 0, 0.85, 1.7, 0.65, v < 2 ? '#e53935' : '#f5f5f5');
      m.box(0, 0.85, 0.33, 0.7, 0.65, 0.03, '#cfe8ff');
      const cs = ['#ff7043', '#42a5f5', '#66bb6a', '#ffca28'];
      for (let i = 0; i < 8; i++) m.box(-0.25 + (i % 4) * 0.17, 0.92 + Math.floor(i / 4) * 0.28, 0.35, 0.1, 0.2, 0.03, cs[i % 4]);
      m.box(0, 0.3, 0.33, 0.5, 0.12, 0.03, '#333333');
    },
    fountain(m) {
      m.box(0, 0, 0, 1.9, 0.3, 1.9, '#b8c4cf');
      m.box(0, 0.05, 0, 1.6, 0.3, 1.6, '#6ec6ff');
      m.box(0, 0, 0, 0.3, 1.1, 0.3, '#b8c4cf');
      m.box(0, 1.1, 0, 0.8, 0.15, 0.8, '#b8c4cf');
      for (let i = 0; i < 6; i++) m.box(Math.cos(i) * 0.5, 0.4 + (i % 3) * 0.3, Math.sin(i) * 0.5, 0.12, 0.12, 0.12, '#d6f0ff', true);
    },
    container(m, v) {
      const cols = ['#e2574c', '#3d8bff', '#33c27a', '#ffb02e', '#8e6bd8'];
      for (let k = 0; k < 2 + (v % 2); k++) {
        const c = cols[(v + k * 2) % 5];
        m.box(0, k * 0.85, 0, 2.4, 0.82, 1.0, c);
        for (let j = 0; j < 7; j++) m.box(-1.05 + j * 0.35, k * 0.85 + 0.08, 0.5, 0.06, 0.66, 0.03, '#00000055'.slice(0, 7));
      }
    },
    boat(m, v) {
      m.box(0, 0, 0, 2.0, 0.35, 0.8, v % 2 ? '#ffffff' : '#ff7043');
      m.box(0, 0.35, 0, 1.3, 0.15, 0.6, '#d7c6a5');
      m.box(0, 0.5, 0, 0.08, 1.7, 0.08, '#5b6470');
      m.box(0.35, 0.75, 0, 0.6, 1.2, 0.05, v % 2 ? '#3d8bff' : '#ffffff');
    },
    lighthouse(m) {
      for (let i = 0; i < 5; i++) m.box(0, i * 0.9, 0, 1.3 - i * 0.1, 0.9, 1.3 - i * 0.1, i % 2 ? '#e53935' : '#ffffff');
      m.box(0, 4.5, 0, 0.75, 0.55, 0.75, '#ffe58a', true);
      m.box(0, 5.05, 0, 0.95, 0.2, 0.95, '#e53935');
      m.box(0, 5.25, 0, 0.5, 0.3, 0.5, '#e53935');
    },
    rock(m, v) {
      m.box(0, 0, 0, 1.2, 0.6 + v * 0.1, 1.0, '#8d939b');
      m.box(0.2, 0.5, 0.1, 0.7, 0.4, 0.6, '#a4aab2');
      m.box(-0.5, 0, 0.3, 0.5, 0.35, 0.5, '#7d838b');
    },
    windmill(m) {
      m.box(0, 0, 0, 1.4, 1.2, 1.4, '#f2e6d0');
      m.box(0, 1.2, 0, 1.1, 1.2, 1.1, '#f2e6d0');
      m.box(0, 2.4, 0, 0.9, 0.6, 0.9, '#f2e6d0');
      m.box(0, 3.0, 0, 1.0, 0.25, 1.0, '#c0392b');
      m.box(0, 3.25, 0, 0.5, 0.25, 0.5, '#c0392b');
      m.box(0, 0, 0.7, 0.45, 0.8, 0.06, '#8a5a33');
    },
    torii(m) {
      m.box(-0.9, 0, 0, 0.2, 2.1, 0.2, '#e0452c');
      m.box(0.9, 0, 0, 0.2, 2.1, 0.2, '#e0452c');
      m.box(0, 1.65, 0, 2.2, 0.16, 0.2, '#e0452c');
      m.box(0, 2.1, 0, 2.8, 0.2, 0.3, '#2b2b2b');
    },
    snowman(m) {
      m.box(0, 0, 0, 0.85, 0.75, 0.85, '#ffffff');
      m.box(0, 0.75, 0, 0.6, 0.55, 0.6, '#ffffff');
      m.box(0, 0.78, 0, 0.66, 0.12, 0.66, '#e53935');
      m.box(-0.12, 1.1, 0.3, 0.08, 0.08, 0.04, '#222222');
      m.box(0.12, 1.1, 0.3, 0.08, 0.08, 0.04, '#222222');
      m.box(0, 0.98, 0.38, 0.1, 0.1, 0.2, '#ff8a3d');
      m.box(0, 1.3, 0, 0.5, 0.35, 0.5, '#333333');
    },
    tlight(m) { m.box(0, 0, 0, 0.12, 0.14, 0.7, '#ffcf7a', true); },
  };

  // ---- 車（形・タイヤ・やね・もよう・色の組み合わせ）----
  // look: { color: '#ff5a4f' か 'rainbow', body, wheel, roof, decal }
  const RAINBOW = ['#ff4d4d', '#ff9f43', '#ffe14d', '#4cd964', '#4da6ff', '#7d5fff'];
  function carModel(m, look) {
    const rainbow = look.color === 'rainbow';
    // 色をぬる箱。にじいろのときは、前から後ろへ6色のしま模様にする
    const paint = (x, y, z, w, h, d) => {
      if (!rainbow) return m.box(x, y, z, w, h, d, look.color);
      for (let i = 0; i < 6; i++) m.box(x, y, z - d / 2 + (d / 6) * (i + 0.5), w, h, d / 6, RAINBOW[i]);
    };
    const glass = '#a9dcff';
    let half = 0.55, len = 0.6, rear = 0.95, roofY = 1.04, roofZ = 0.1;
    if (look.body === 'truck') {
      half = 0.575; len = 0.75; rear = 1.16; roofY = 1.15; roofZ = -0.55;
      m.box(0, 0.1, 0, 1.17, 0.12, 2.32, '#333333');
      paint(0, 0.2, 0, 1.15, 0.38, 2.3);
      paint(0, 0.58, -0.55, 1.1, 0.57, 1.0);
      m.box(0, 0.72, -0.04, 0.85, 0.3, 0.03, glass);
      m.box(0.556, 0.72, -0.55, 0.03, 0.28, 0.7, glass);
      m.box(-0.556, 0.72, -0.55, 0.03, 0.28, 0.7, glass);
      for (const sx of [-1, 1]) m.box(sx * 0.545, 0.58, 0.55, 0.06, 0.25, 1.15, '#5b6470');
      m.box(0, 0.58, 1.12, 1.1, 0.25, 0.06, '#5b6470');
      m.box(-0.2, 0.58, 0.45, 0.5, 0.45, 0.5, '#c8a26a');
      m.box(0.25, 0.58, 0.75, 0.4, 0.35, 0.4, '#b98a4b');
    } else if (look.body === 'kart') {
      half = 0.6; len = 0.55; rear = 0.85; roofY = 1.08; roofZ = 0.25;
      paint(0, 0.1, 0, 1.0, 0.25, 1.7);
      m.box(0, 0.35, 0.25, 0.55, 0.35, 0.45, '#333333');
      m.box(0, 0.35, -0.3, 0.08, 0.45, 0.08, '#333333');
      m.box(0, 0.78, -0.27, 0.45, 0.08, 0.08, '#333333');
      m.box(0, 0.7, 0.25, 0.4, 0.38, 0.4, '#ffffff');
      m.box(0, 0.78, 0.04, 0.32, 0.14, 0.02, '#2b2d42');
      m.box(0, 0.12, -0.9, 1.1, 0.12, 0.12, '#333333');
    } else if (look.body === 'bus') {
      half = 0.6; len = 0.85; rear = 1.31; roofY = 1.3; roofZ = 0;
      m.box(0, 0.1, 0, 1.22, 0.12, 2.62, '#333333');
      paint(0, 0.15, 0, 1.2, 1.15, 2.6);
      for (let i = 0; i < 5; i++) for (const sx of [-1, 1]) m.box(sx * 0.605, 0.75, -1.0 + i * 0.5, 0.02, 0.32, 0.38, glass);
      m.box(0, 0.75, 1.305, 0.9, 0.36, 0.02, glass);
      m.box(0, 1.3, 0, 0.9, 0.08, 2.0, '#dddddd');
    } else {
      m.box(0, 0.1, 0, 1.12, 0.12, 1.92, '#333333');
      paint(0, 0.2, 0, 1.1, 0.42, 1.9);
      paint(0, 0.62, 0.1, 0.9, 0.42, 1.0);
      m.box(0, 0.66, 0.61, 0.74, 0.3, 0.03, glass);
      m.box(0.455, 0.66, 0.1, 0.03, 0.28, 0.8, glass);
      m.box(-0.455, 0.66, 0.1, 0.03, 0.28, 0.8, glass);
      m.box(0, 0.66, -0.41, 0.74, 0.3, 0.03, glass);
      m.box(0, 0.86, 0.82, 1.12, 0.07, 0.26, '#2b2d42');
      m.box(-0.36, 0.62, 0.82, 0.06, 0.24, 0.06, '#2b2d42');
      m.box(0.36, 0.62, 0.82, 0.06, 0.24, 0.06, '#2b2d42');
    }
    // タイヤ
    const gold = look.wheel === 'goldwheel';
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      m.box(sx * (half - 0.03), 0, sz * len, 0.22, 0.4, 0.42, gold ? '#c9a227' : '#1e1e1e');
      m.box(sx * (half + 0.085), 0.12, sz * len, 0.02, 0.16, 0.16, gold ? '#fff2a8' : '#9aa0a8', gold);
    }
    // テールランプとナンバー
    m.box(-0.38, 0.32, rear, 0.24, 0.12, 0.03, '#ff2a2a', true);
    m.box(0.38, 0.32, rear, 0.24, 0.12, 0.03, '#ff2a2a', true);
    if (look.body !== 'kart') m.box(0, 0.22, rear + 0.01, 0.34, 0.14, 0.02, '#ffffff');
    // やね
    if (look.roof === 'flag') {
      m.box(0.3, roofY, roofZ + 0.2, 0.06, 1.0, 0.06, '#dddddd');
      m.box(0.56, roofY + 0.62, roofZ + 0.2, 0.5, 0.34, 0.04, '#ff5a4f');
      m.box(0.56, roofY + 0.72, roofZ + 0.2, 0.14, 0.14, 0.05, '#ffffff', true);
    } else if (look.roof === 'crown') {
      m.box(0, roofY, roofZ, 0.62, 0.2, 0.62, '#ffd54a');
      for (const [x, z] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) m.box(x, roofY + 0.2, roofZ + z, 0.12, 0.2, 0.12, '#ffd54a');
      m.box(0, roofY + 0.05, roofZ + 0.31, 0.14, 0.12, 0.02, '#ff3b6b', true);
    } else if (look.roof === 'siren') {
      m.box(0, roofY, roofZ, 0.85, 0.1, 0.25, '#444444');
      m.box(-0.22, roofY + 0.1, roofZ, 0.32, 0.2, 0.22, '#ff3030', true);
      m.box(0.22, roofY + 0.1, roofZ, 0.32, 0.2, 0.22, '#3d8bff', true);
    }
    // もよう（車の横）
    if (look.decal === 'star') {
      for (const sx of [-1, 1]) {
        const x = sx * (half + 0.006);
        const y = look.body === 'bus' ? 0.45 : 0.3, z = look.body === 'truck' ? 0.5 : 0;
        m.box(x, y, z, 0.02, 0.14, 0.42, '#ffd54a', true);
        m.box(x, y - 0.12, z, 0.02, 0.38, 0.14, '#ffd54a', true);
      }
    } else if (look.decal === 'fire') {
      for (const sx of [-1, 1]) {
        const x = sx * (half + 0.006);
        const y = look.body === 'bus' ? 0.25 : 0.22;
        [['#ffd54a', 0.1], ['#ff9f43', 0.2], ['#ff5a4f', 0.3], ['#ff9f43', 0.18], ['#ffd54a', 0.1]].forEach(([c, h], i) => {
          m.box(x, y, -0.6 + i * 0.18, 0.02, h, 0.16, c, true);
        });
      }
    }
  }

  class Voxel3D {
    constructor(canvas) {
      this.canvas = canvas;
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(64, 1, 0.1, 400);
      this.scene.fog = new THREE.Fog('#cfefff', 32, 68);
      this.hemi = new THREE.HemisphereLight('#ffffff', '#6b7f5a', 1.6);
      this.sun = new THREE.DirectionalLight('#ffffff', 2.2);
      this.sun.position.set(-4, 10, 5);
      this.scene.add(this.hemi, this.sun);
      this.tex = makeTextures();
      this.mats = {
        lit: new THREE.MeshLambertMaterial({ vertexColors: true }),
        glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
      };
      this.makeBlocks();
      this.makeRoad();
      this.makeSky();
      this.makeSigns();
      this.pools = new Map();
      this.signTex = {};
      this.carColor = null;
    }

    // ---- 地面のブロック（インスタンス描画）----
    makeBlocks() {
      const T = this.tex, L = (map, extra) => new THREE.MeshLambertMaterial({ map, ...extra });
      const geo = new THREE.BoxGeometry(1, 1, 1);
      const defs = {
        grass: [L(T.grassSide), L(T.grassSide), L(T.grassTop), L(T.dirt), L(T.grassSide), L(T.grassSide)],
        dirt: L(T.dirt), sand: L(T.sand), stone: L(T.stone),
        pave: [L(T.stone), L(T.stone), L(T.pave), L(T.stone), L(T.stone), L(T.stone)],
        snow: [L(T.snowSide), L(T.snowSide), L(T.snowTop), L(T.stone), L(T.snowSide), L(T.snowSide)],
        bldg: [L(T.bldg), L(T.bldg), L(T.roof), L(T.roof), L(T.bldg), L(T.bldg)],
        water: L(T.water, { transparent: true, opacity: 0.88 }),
        rail: L(T.pave),
      };
      this.blocks = {};
      for (const [k, mat] of Object.entries(defs)) {
        const g = k === 'water' ? new THREE.BoxGeometry(1, 0.8, 1) : k === 'rail' ? new THREE.BoxGeometry(0.2, 0.5, 1) : geo;
        const max = k === 'grass' || k === 'dirt' || k === 'stone' || k === 'bldg' ? 12000 : 7000;
        const mesh = new THREE.InstancedMesh(g, mat, max);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.frustumCulled = false;
        this.scene.add(mesh);
        this.blocks[k] = { mesh, max, n: 0, arr: mesh.instanceMatrix.array };
      }
    }
    put(type, x, y, z) {
      const b = this.blocks[type];
      if (b.n >= b.max) return;
      const o = b.n * 16, a = b.arr;
      a[o] = 1; a[o + 1] = 0; a[o + 2] = 0; a[o + 3] = 0;
      a[o + 4] = 0; a[o + 5] = 1; a[o + 6] = 0; a[o + 7] = 0;
      a[o + 8] = 0; a[o + 9] = 0; a[o + 10] = 1; a[o + 11] = 0;
      a[o + 12] = x; a[o + 13] = y; a[o + 14] = z; a[o + 15] = 1;
      b.n++;
    }

    // ---- 道（毎フレーム作りなおす）----
    makeRoad() {
      const MAXV = 6 * 3000;
      this.roadPos = new Float32Array(MAXV * 3);
      this.roadCol = new Float32Array(MAXV * 3);
      this.roadUv = new Float32Array(MAXV * 2);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(this.roadPos, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('color', new THREE.BufferAttribute(this.roadCol, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('uv', new THREE.BufferAttribute(this.roadUv, 2).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(MAXV * 3).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
      this.roadGeo = g;
      this.roadMax = MAXV;
      this.road = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, map: this.tex.asphalt }));
      this.road.frustumCulled = false;
      this.scene.add(this.road);
    }
    quad(xa0, xa1, za, xb0, xb1, zb, y, c) {
      if (this.rv + 6 > this.roadMax) return;
      const P = this.roadPos, C = this.roadCol, U = this.roadUv, tr = this.d.track;
      const v = [[xa0, za], [xb0, zb], [xb1, zb], [xa0, za], [xb1, zb], [xa1, za]];
      for (const [x, z] of v) {
        const i = this.rv++;
        P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z;
        C[i * 3] = c.r; C[i * 3 + 1] = c.g; C[i * 3 + 2] = c.b;
        U[i * 2] = x * 0.5; U[i * 2 + 1] = (-z + tr) * 0.5;
      }
    }

    // ---- 空・太陽・雲 ----
    makeSky() {
      const g = new THREE.SphereGeometry(300, 16, 12);
      const n = g.attributes.position.count;
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      this.skyGeo = g;
      this.sky = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
      this.sky.renderOrder = -1;
      this.scene.add(this.sky);
      this.sunMesh = new THREE.Mesh(new THREE.BoxGeometry(14, 14, 1), new THREE.MeshBasicMaterial({ color: '#fff6c9', fog: false }));
      this.scene.add(this.sunMesh);
      this.clouds = [];
      for (let i = 0; i < 12; i++) {
        const m = new ModelBuilder();
        const w = 6 + rnd(i, 3) * 8;
        m.box(0, 0, 0, w, 1.2, 4 + rnd(i, 4) * 3, '#ffffff');
        m.box(rnd(i, 5) * 2 - 1, 1.2, 0, w * 0.55, 1.0, 3, '#ffffff');
        const c = m.build({ lit: new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, transparent: true, opacity: 0.92 }), glow: this.mats.glow });
        this.scene.add(c);
        this.clouds.push(c);
      }
      this.skyKey = '';
    }
    setSky(top, bottom, blend2) {
      const key = top + bottom + (blend2 || '');
      if (key === this.skyKey) return;
      this.skyKey = key;
      const t = new THREE.Color(top), b = new THREE.Color(bottom);
      const pos = this.skyGeo.attributes.position, col = this.skyGeo.attributes.color;
      for (let i = 0; i < pos.count; i++) {
        const k = Math.max(0, Math.min(1, pos.getY(i) / 150));
        const c = b.clone().lerp(t, k);
        col.setXYZ(i, c.r, c.g, c.b);
      }
      col.needsUpdate = true;
      this.scene.fog.color.copy(b);
    }

    // ---- 看板 ----
    makeSigns() {
      this.signs = {};
      for (const side of ['L', 'R']) {
        const c = document.createElement('canvas');
        c.width = 256; c.height = 128;
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        const board = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, fog: false }));
        board.position.y = 2.3;
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.8, 0.12), new THREE.MeshLambertMaterial({ color: '#7a7f8a', transparent: true }));
        post.position.y = 0.9;
        const g = new THREE.Group();
        g.add(board, post);
        this.scene.add(g);
        this.signs[side] = { g, c, tex, board, post, key: '' };
      }
    }
    drawSign(s, text, sel) {
      const key = text + sel;
      if (s.key === key) return;
      s.key = key;
      const g = s.c.getContext('2d');
      g.clearRect(0, 0, 256, 128);
      g.fillStyle = sel ? '#ffd54a' : '#ffffff';
      KG.rr(g, 0, 0, 256, 128, 18); g.fill();
      g.fillStyle = '#1f8a4c';
      KG.rr(g, sel ? 12 : 7, sel ? 12 : 7, sel ? 232 : 242, sel ? 104 : 114, 12); g.fill();
      g.fillStyle = '#ffffff';
      const size = Math.min(78, 220 / Math.max(1, text.length));
      g.font = `bold ${size}px ${KG.FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, 128, 68);
      s.tex.needsUpdate = true;
    }

    // ---- モデルの使い回し ----
    acquire(key, make) {
      let p = this.pools.get(key);
      if (!p) { p = { list: [], used: 0 }; this.pools.set(key, p); }
      if (p.used >= p.list.length) {
        const obj = p.list.length ? p.list[0].clone() : make();
        this.scene.add(obj);
        p.list.push(obj);
      }
      const o = p.list[p.used++];
      o.visible = true;
      return o;
    }
    model(kind, v) {
      const key = kind + ':' + v;
      return this.acquire(key, () => {
        const m = new ModelBuilder();
        MODELS[kind](m, v);
        const g = m.build(this.mats);
        if (kind === 'shop') g.add(this.shopSign(SHOP_SIGNS[v]));
        if (kind === 'windmill') {
          const b = new ModelBuilder();
          for (let i = 0; i < 4; i++) {
            const a = (i * Math.PI) / 2;
            b.box(Math.cos(a) * 0.9, Math.sin(a) * 0.9 - 0.13, 0, Math.abs(Math.cos(a)) * 1.6 + 0.26, Math.abs(Math.sin(a)) * 1.6 + 0.26, 0.06, '#ffffff');
          }
          const blades = b.build(this.mats);
          blades.position.set(0, 2.6, 0.78);
          blades.name = 'spin';
          g.add(blades);
        }
        return g;
      });
    }
    shopSign(ch) {
      if (!this.signTex[ch]) {
        const c = document.createElement('canvas');
        c.width = c.height = 64;
        const g = c.getContext('2d');
        g.fillStyle = '#fffaf0'; g.fillRect(0, 0, 64, 64);
        g.fillStyle = '#c0392b';
        g.font = `bold 48px ${KG.FONT}`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(ch, 32, 36);
        const t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace;
        this.signTex[ch] = t;
      }
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.55), new THREE.MeshBasicMaterial({ map: this.signTex[ch] }));
      p.position.set(0, 2.17, 0.59);
      return p;
    }

    // ---- 描画 ----
    attach(drive) {
      this.d = drive;
      this.pools.forEach(p => p.list.forEach(o => (o.visible = false)));
    }
    resize(w, h) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }

    render() {
      const d = this.d;
      this.pools.forEach(p => (p.used = 0));
      for (const b of Object.values(this.blocks)) b.n = 0;
      this.rv = 0;

      // カメラは車のうしろ、少し上から
      const bob = (d.bob || 0) * 12;
      const cam = this.camera;
      cam.position.set(d.camX, 2.9 + bob, 3.6);
      cam.lookAt(d.camX * 0.9, 0.4, -12);

      this.updateSky();
      this.updateTerrain();
      this.updateRoad();
      this.updateObjects();
      this.updateSigns();
      this.updateEvents();
      this.updateCar();

      for (const b of Object.values(this.blocks)) {
        b.mesh.count = b.n;
        b.mesh.instanceMatrix.needsUpdate = true;
      }
      this.roadGeo.setDrawRange(0, this.rv);
      for (const k of ['position', 'color', 'uv']) this.roadGeo.attributes[k].needsUpdate = true;
      this.blocks.water.mesh.material.map.offset.set(d.clock * 0.05, d.clock * 0.08);
      this.pools.forEach(p => { for (let i = p.used; i < p.list.length; i++) p.list[i].visible = false; });
      this.renderer.render(this.scene, cam);
    }

    updateSky() {
      const d = this.d;
      const a = d.skyPrev.sky, b = d.skyCur.sky, t = d.skyBlend;
      const mix = (x, y) => '#' + new THREE.Color(x).lerp(new THREE.Color(y), t).getHexString();
      const top = mix(a[0], b[0]), bottom = mix(a[1], b[1]);
      this.setSky(top, bottom);
      this.sky.position.copy(this.camera.position);
      const sunset = d.skyCur.sun;
      this.sunMesh.position.set(this.camera.position.x + (sunset ? 60 : -90), sunset ? 18 : 80, -240);
      this.sunMesh.material.color.set(sunset ? '#ffb347' : '#fff6c9');
      // トンネルの中は暗く、夕方はオレンジに
      const dark = d.camZone.tunnel ? 0.25 : 1;
      this.hemi.intensity += (1.6 * dark - this.hemi.intensity) * 0.08;
      this.sun.intensity += (2.2 * dark - this.sun.intensity) * 0.08;
      this.sun.color.set(sunset ? '#ffc58a' : '#ffffff');
      this.scene.fog.near = d.camZone.tunnel ? 10 : 32;
      // 雲
      const span = 220;
      this.clouds.forEach((c, i) => {
        const x = ((i * 47 + d.clock * 1.5) % span) - span / 2 + this.camera.position.x;
        c.position.set(x, 32 + (i % 3) * 6, -60 - ((i * 37) % 120));
        c.visible = !d.camZone.tunnel;
      });
    }

    groundTypes(prof, h) {
      const g = prof[0];
      if (prof[1] === 'mountains' && h >= 7) return [g === 'snow' ? 'snow' : 'stone', 'stone'];
      if (g === 'grass') return ['grass', 'dirt'];
      if (g === 'snow') return ['snow', 'stone'];
      if (g === 'pave') return ['pave', 'stone'];
      if (g === 'sand') return ['sand', 'sand'];
      return ['stone', 'stone'];
    }
    heightAt(prof, r, i, side) {
      const n = noise2(r * 0.13, i * 0.33 + (side > 0 ? 40 : 0), 3);
      switch (prof[1]) {
        case 'hills': return i < 4 ? 0 : Math.floor(n * Math.min(4, (i - 3) * 0.9));
        case 'mountains': return i < 4 ? 0 : Math.min(13, Math.floor((i - 4) * 0.7 + n * 4));
        case 'city': return i < 5 || i > 13 ? 0 : (n > 0.55 ? 2 + Math.floor((n - 0.55) * 12) : 0);
        case 'tall': return i < 5 || i > 13 ? 0 : (n > 0.5 ? 4 + Math.floor((n - 0.5) * 20) : 0);
        default: return 0;
      }
    }

    updateTerrain() {
      const d = this.d, W = d.W;
      const r0 = Math.floor(d.track - BACK), r1 = Math.floor(d.track + FAR);
      for (let r = r0; r <= r1; r++) {
        const dist = r + 0.5 - d.track, z = -dist;
        const zone = d.zoneAt(r + 0.5);
        const prof = PROFILE[zone.name] || ['grass', 'hills'];
        const e = d.edges(dist);
        const N = dist < 28 ? 18 : 12;
        const tunnel = prof[1] === 'tunnel';
        for (const side of [-1, 1]) {
          const water = zone[side < 0 ? 'left' : 'right'];
          const edge = side < 0 ? e.left : e.right;
          const wStart = zone.bridge ? 0 : water === 'sea' ? 2 : 3;
          const wEnd = water === 'sea' ? 999 : wStart + 5;
          let prevH = 0;
          for (let i = 0; i < N; i++) {
            const x = edge + side * (0.5 + i);
            if (water && i >= wStart && i < wEnd) { this.put('water', x, -0.55, z); prevH = -1; continue; }
            const h = tunnel ? 6 + Math.floor(noise2(r * 0.2, i * 0.4, 5) * 3) : this.heightAt(prof, r, i, side);
            const tall = prof[1] === 'city' || prof[1] === 'tall';
            const [top, sub] = this.groundTypes(prof, h);
            // 見えない内側のブロックは省く
            const from = tall && h > 0 ? 0 : Math.max(0, Math.min(prevH, h) - 1);
            for (let k = from; k <= h; k++) {
              const type = tall && h > 0 ? (k === 0 ? 'pave' : 'bldg') : k === h ? top : sub;
              this.put(type, x, k - 0.5, z);
            }
            prevH = h;
          }
          if (zone.bridge) this.put('rail', edge + side * 0.1, 0.25, z);
        }
        // 分かれた道のあいだ
        if (e.roads.length === 2) {
          const a = e.roads[0].cx + W, b = e.roads[1].cx - W;
          const [top] = this.groundTypes(prof, 0);
          for (let x = a + 0.5; x < b; x += 1) {
            if (tunnel) for (let k = 0; k < 7; k++) this.put('stone', x, k - 0.5, z);
            else this.put(top, x, -0.5, z);
          }
        }
        // トンネルの天井
        if (tunnel) for (let x = e.left - 0.5; x <= e.right + 0.5; x += 1) for (let k = 3; k < 7; k++) this.put('stone', x, k + 0.5, z);
      }
    }

    updateRoad() {
      const d = this.d, W = d.W;
      const col = (hex) => new THREE.Color(hex);
      const C = {
        a1: col('#6b6f7a'), a2: col('#646873'), t1: col('#4b4d55'), t2: col('#46484f'),
        red: col('#ff5a4f'), white: col('#ffffff'), gray: col('#9a9aa2'), line: col('#fff7c2'), black: col('#222222'),
      };
      const step = 0.5;
      for (let dF = FAR; dF > -BACK; dF -= step) {
        const dN = dF - step;
        const zone = d.zoneAt((dF + dN) / 2 + d.track);
        const dark = zone.tunnel;
        const stripe = Math.floor((dN + d.track) / 2.2) % 2 === 0;
        const rF = d.roadsAt(dF), rN = d.roadsAt(dN);
        for (const a of rF) {
          const b = rN.find(x => x.kind === a.kind) || (a.kind !== 'main' ? rN.find(x => x.kind === 'main') : rN[0]);
          if (!b) continue;
          const zF = -dF, zN = -dN;
          const rc = stripe ? (dark ? C.gray : C.white) : C.red;
          this.quad(a.cx - W * 1.14, a.cx - W, zF, b.cx - W * 1.14, b.cx - W, zN, 0.06, rc);
          this.quad(a.cx + W, a.cx + W * 1.14, zF, b.cx + W, b.cx + W * 1.14, zN, 0.06, rc);
          this.quad(a.cx - W, a.cx + W, zF, b.cx - W, b.cx + W, zN, 0.03, dark ? (stripe ? C.t1 : C.t2) : (stripe ? C.a1 : C.a2));
          if (a.kind === 'main' && stripe && rF.length === 1) this.quad(a.cx - 0.05, a.cx + 0.05, zF, b.cx - 0.05, b.cx + 0.05, zN, 0.04, C.line);
        }
      }
      // 決定ライン
      if (d.phase === 'question' && d.forkZ != null) {
        const lz = d.forkZ - d.LINE;
        const n = 10, cell = (W * 2) / n;
        for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) {
          const x0 = -W + i * cell;
          this.quad(x0, x0 + cell, -(lz + j * cell), x0, x0 + cell, -(lz + (j - 1) * cell), 0.05, (i + j) % 2 ? C.black : C.white);
        }
      }
    }

    updateObjects() {
      const d = this.d, SP = d.SP;
      const k0 = Math.floor((d.track + FAR) / SP), k1 = Math.ceil((d.track - BACK) / SP);
      const place = (kind, v, x, y, z, ry = 0) => {
        const o = this.model(kind, v);
        o.position.set(x, y, z);
        o.rotation.set(0, ry, 0);
        if (kind === 'windmill') o.getObjectByName('spin').rotation.z = d.clock * 1.2;
        return o;
      };
      for (let k = k0; k >= k1; k--) {
        const s = k * SP, dist = s - d.track, z = -dist;
        const zone = d.zoneAt(s);
        const e = d.edges(dist);
        if (zone.tunnel) {
          if (k % 2 === 0) {
            place('tlight', 0, e.left - 0.02 + 0.06, 2.3, z);
            place('tlight', 0, e.right + 0.02 - 0.06, 2.3, z);
          }
          continue;
        }
        for (const side of [-1, 1]) {
          const water = zone[side < 0 ? 'left' : 'right'];
          const edge = side < 0 ? e.left : e.right;
          if (water) {
            if (zone.objects.boat && rnd(k, 40 + side) > 0.55) {
              const wStart = zone.bridge ? 0 : water === 'sea' ? 2 : 3;
              place('boat', Math.floor(rnd(k, 41 + side) * 4), edge + side * (wStart + 2.5), -0.15, z);
            }
            continue;
          }
          if (rnd(k, 5 + side) < 0.12) continue;
          const kind = KG.pickWeighted(zone.objects, rnd(k, side > 0 ? 1 : 2));
          if (!kind || kind === 'boat' || !MODELS[kind]) continue;
          const r = rnd(k, 9 + side);
          const v = kind === 'shop' ? Math.floor(r * SHOP_SIGNS.length) : Math.floor(r * 4);
          const x = edge + side * ((HALF[kind] || 0.8) + 0.35 + rnd(k, 3 + side) * 1.0);
          // 道の方を少し向く
          place(kind, v, x, 0, z, side * -0.25);
        }
        // 分かれた道のあいだ
        if (e.roads.length === 2 && dist > d.forkZ + d.L * 0.6 && k % 2 === 0) {
          const kind = zone.objects.flowers ? 'flowers' : zone.objects.snowpine ? 'snowpine' : zone.objects.palm ? 'palm' : 'tree';
          place(kind, k % 4, (e.roads[0].cx + e.roads[1].cx) / 2, 0, z);
        }
      }
    }

    updateSigns() {
      const d = this.d;
      const show = (d.phase === 'question' || d.phase === 'after') && d.forkZ != null;
      for (const side of ['L', 'R']) {
        const s = this.signs[side];
        const dist = show ? d.forkZ + 2.5 : 0;
        const hide = !show || dist < 2.5 || dist > FAR || (d.chosen && side !== d.chosen && d.phase === 'after');
        s.g.visible = !hide;
        if (hide) continue;
        const it = d.item;
        this.drawSign(s, d.signText(side), d.selected === side);
        const sg = side === 'L' ? -1 : 1;
        s.g.position.set(sg * (Math.abs(d.branchCenter(side, dist)) + 1.4), 0, -dist);
        const a = Math.max(0, Math.min(1, (dist - 2.5) / 2));
        s.board.material.opacity = a;
        s.post.material.opacity = a;
      }
    }

    updateEvents() {
      const d = this.d;
      const cx = this.camera.position.x;
      for (const e of d.events) {
        if (e.type === 'balloon') {
          const o = this.acquire('balloon' + e.c, () => {
            const m = new ModelBuilder();
            const cs = [['#ff5a4f', '#ffd54a'], ['#3d8bff', '#ffffff'], ['#33c27a', '#ff7eb6']][e.c];
            for (let i = 0; i < 4; i++) m.box(0, 1.2 + i * 0.7, 0, 2.6 - Math.abs(i - 1.5) * 0.6, 0.7, 2.6 - Math.abs(i - 1.5) * 0.6, cs[i % 2]);
            m.box(0, 0, 0, 0.8, 0.6, 0.8, '#9a6b3c');
            for (const sx of [-1, 1]) m.box(sx * 0.35, 0.6, 0, 0.05, 0.7, 0.05, '#7a5a3a');
            return m.build(this.mats);
          });
          o.position.set(cx + (e.x - 0.5) * 70, 12 + e.y * 20 + Math.sin(e.t) * 0.5, -40);
        } else if (e.type === 'plane') {
          const o = this.acquire('plane', () => {
            const m = new ModelBuilder();
            m.box(0, 0, 0, 4, 0.6, 0.7, '#ffffff');
            m.box(0, 0.1, 0, 0.9, 0.12, 4.2, '#d8e2ee');
            m.box(-1.8, 0.4, 0, 0.5, 0.9, 0.12, '#e2574c');
            m.box(-9, 0.2, 0, 14, 0.12, 0.12, '#ffffff');
            return m.build(this.mats);
          });
          o.position.set(cx + (e.x - 0.5) * 140, 30, -90);
          o.scale.x = e.dir;
        } else if (e.type === 'birds') {
          for (let i = 0; i < 5; i++) {
            const o = this.acquire('bird', () => {
              const m = new ModelBuilder();
              m.box(0, 0, 0, 0.3, 0.2, 0.2, '#3b4252');
              m.box(0, 0.05, 0, 0.12, 0.06, 1.0, '#3b4252');
              return m.build(this.mats);
            });
            o.position.set(cx + (e.x - 0.5) * 60 - e.dir * Math.abs(i - 2) * 1.2, 10 + e.y * 10 + Math.abs(i - 2) * 0.6, -30 - i * 0.5);
            o.rotation.set(Math.sin(e.t * 10 + i) * 0.5, 0, 0);
          }
        } else if (e.type === 'rainbow') {
          const a = Math.min(1, e.t / 1.2, (e.dur - e.t) / 1.5);
          if (a <= 0) continue;
          const o = this.acquire('rainbow', () => {
            const m = new ModelBuilder();
            const cols = ['#ff4d4d', '#ff9f43', '#ffe14d', '#4cd964', '#4da6ff', '#7d5fff'];
            cols.forEach((c, j) => {
              const R = 46 - j * 2;
              for (let i = 0; i <= 40; i++) {
                const ang = Math.PI * (0.06 + 0.88 * (i / 40));
                m.box(Math.cos(ang) * R, Math.sin(ang) * R, 0, 3.6, 2.1, 1, c, true);
              }
            });
            const g = m.build({ lit: this.mats.lit, glow: new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, fog: false }) });
            return g;
          });
          o.position.set(cx, -10, -120);
          o.children.forEach(c => { c.material.opacity = a * 0.7; });
        } else if (e.type === 'dolphin') {
          const dist = e.s - d.track;
          if (dist < 2 || dist > FAR) continue;
          const p = (e.t % 2.2) / 1.2;
          if (p > 1) continue;
          const o = this.acquire('dolphin', () => {
            const m = new ModelBuilder();
            m.box(0, 0, 0, 1.6, 0.5, 0.5, '#5b8fd1');
            m.box(0.2, 0.5, 0, 0.4, 0.4, 0.15, '#5b8fd1');
            m.box(-0.9, 0, 0, 0.4, 0.15, 0.7, '#5b8fd1');
            m.box(0.2, -0.1, 0, 1.0, 0.2, 0.45, '#dbe9ff');
            return m.build(this.mats);
          });
          const ex = d.edges(dist).left - 8;
          o.position.set(ex + (p - 0.5) * 4, -0.4 + Math.sin(p * Math.PI) * 3, -dist);
          o.rotation.set(0, 0, (0.5 - p) * 1.6);
        } else if (e.type === 'train') {
          const track = this.acquire('railtrack', () => {
            const m = new ModelBuilder();
            m.box(0, 0, 0, 400, 0.4, 1.4, '#7d8590');
            for (let i = -10; i <= 10; i++) m.box(i * 20, -6, 0, 0.8, 6, 0.8, '#9aa0a8');
            return m.build(this.mats);
          });
          track.position.set(cx, 6, -60);
          for (let i = 0; i < 5; i++) {
            const o = this.acquire('train' + (i === 0 ? 'h' : 'c'), () => {
              const m = new ModelBuilder();
              m.box(0, 0, 0, 3.6, 1.6, 1.6, i === 0 ? '#2e9e5b' : '#ffffff');
              m.box(0, 0.25, 0, 3.62, 0.25, 1.62, '#2e9e5b');
              for (let j = 0; j < 4; j++) m.box(-1.3 + j * 0.85, 0.75, 0.81, 0.5, 0.5, 0.03, '#9ad3ff');
              return m.build(this.mats);
            });
            o.position.set(cx + (e.x - 0.5) * 140 - e.dir * i * 3.8, 6.4, -60);
          }
        }
      }
    }

    updateCar() {
      const d = this.d;
      const look = KG.carLook();
      const key = JSON.stringify(look);
      if (key !== this.carKey) {
        if (this.car) this.scene.remove(this.car);
        const m = new ModelBuilder();
        carModel(m, look);
        this.car = m.build(this.mats);
        this.scene.add(this.car);
        this.carKey = key;
      }
      const bounce = d.shake ? Math.abs(Math.sin(d.clock * 14)) * 0.03 * (d.speedMul || 0) : 0;
      this.car.position.set(d.camX, bounce, -1.0);
      this.car.rotation.set(0, -d.carTilt * 0.35, d.carTilt * 0.06);
    }
  }

  // 車庫やアイテム画面で、車をくるくる回して見せる
  class CarPreview {
    constructor() {
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'car-preview';
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
      this.camera.position.set(3.4, 2.4, 4.4);
      this.camera.lookAt(0, 0.45, 0);
      const sun = new THREE.DirectionalLight('#ffffff', 2.2);
      sun.position.set(-3, 6, 4);
      this.scene.add(new THREE.HemisphereLight('#ffffff', '#6b7f5a', 1.8), sun);
      this.mats = { lit: new THREE.MeshLambertMaterial({ vertexColors: true }), glow: new THREE.MeshBasicMaterial({ vertexColors: true }) };
      // 草ブロックの台
      const m = new ModelBuilder();
      for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) {
        const odd = Math.abs(x + z) % 2;
        m.box(x * 1.1, -0.55, z * 1.1, 1.1, 0.4, 1.1, odd ? '#8b5a2b' : '#7d5126');
        m.box(x * 1.1, -0.15, z * 1.1, 1.1, 0.15, 1.1, odd ? '#62b443' : '#58a63c');
      }
      this.spin = new THREE.Group();
      this.spin.add(m.build(this.mats));
      this.scene.add(this.spin);
      this.key = '';
      this.angle = 0.6;
      this.tick = this.tick.bind(this);
    }
    mount(el) {
      el.appendChild(this.canvas);
      const r = el.getBoundingClientRect();
      this.renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
      this.camera.aspect = r.width / Math.max(1, r.height);
      this.camera.updateProjectionMatrix();
      if (!this.running) { this.running = true; requestAnimationFrame(this.tick); }
    }
    setLook(look) {
      const key = JSON.stringify(look);
      if (key === this.key) return;
      this.key = key;
      if (this.car) this.spin.remove(this.car);
      const m = new ModelBuilder();
      carModel(m, look);
      this.car = m.build(this.mats);
      this.spin.add(this.car);
    }
    tick() {
      // 画面から見えなくなったら止める
      if (!this.canvas.isConnected || !this.canvas.offsetParent) { this.running = false; return; }
      this.angle += 0.012;
      this.spin.rotation.y = this.angle;
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(this.tick);
    }
  }
  KG.getCarPreview = function () {
    if (!window.THREE) return null;
    if (KG.carPreview === undefined) {
      try { KG.carPreview = new CarPreview(); } catch (e) { console.warn('preview', e); KG.carPreview = null; }
    }
    return KG.carPreview;
  };

  // WebGLが使えて、Three.js が読みこめているときだけ使う
  KG.get3D = function (canvas) {
    if (!window.THREE) return null;
    if (!KG.voxel) {
      try { KG.voxel = new Voxel3D(canvas); } catch (e) { console.warn('3D', e); KG.voxel = false; }
    }
    return KG.voxel || null;
  };
})();

// 景色：コースごとのエリア（ゾーン）と、建物・木・背景の描き方
// 1回のドライブの中で、エリアが4〜5回切りかわる
window.KG = window.KG || {};

KG.ZONES = {
  machi: [
    { name: 'じゅうたくがい', sky: ['#6fc3ff', '#d4f0ff'], grass: ['#8ed46b', '#82ca60'], backdrop: 'hills',
      objects: { house: 6, tree: 3, mailbox: 1, vending: 1, bush: 2 }, events: ['balloon', 'birds', 'plane'] },
    { name: 'しょうてんがい', sky: ['#7ccaff', '#e0f4ff'], grass: ['#d8c8ad', '#cfbea1'], backdrop: 'city',
      objects: { shop: 8, lamp: 3, vending: 1 }, events: ['plane', 'birds'] },
    { name: 'こうえん', sky: ['#6fc3ff', '#dcf3ff'], grass: ['#7fd36a', '#74c95f'], backdrop: 'hills', petals: true,
      objects: { tree: 5, flowers: 5, bush: 2, fountain: 1 }, events: ['balloon', 'birds'] },
    { name: 'ビルがい', sky: ['#8ec3ee', '#e4f1fb'], grass: ['#b9c0c8', '#afb6bf'], backdrop: 'skyscrapers',
      objects: { building: 8, signal: 2, lamp: 2 }, events: ['plane', 'train'] },
    { name: 'ゆうやけの かわ', sky: ['#ff8c5a', '#ffd69c'], grass: ['#a3bd5c', '#97b152'], backdrop: 'city_sunset', sun: true, right: 'river',
      objects: { tree: 3, lamp: 3, house: 2 }, events: ['birds', 'train'] },
  ],
  umi: [
    { name: 'すなはま', sky: ['#4fbfff', '#dff6ff'], grass: ['#f3dc9b', '#ebd18b'], backdrop: 'sea', left: 'sea',
      objects: { palm: 5, parasol: 4, rock: 1 }, events: ['dolphin', 'birds', 'plane'] },
    { name: 'みなと', sky: ['#5cbfff', '#e3f5ff'], grass: ['#c9cdd2', '#bfc4c9'], backdrop: 'harbor', left: 'sea',
      objects: { container: 5, lamp: 3, boat: 3 }, events: ['birds', 'plane'] },
    { name: 'とうだいの みさき', sky: ['#55bdfb', '#e8f7ff'], grass: ['#9ad06f', '#8fc666'], backdrop: 'cliff', left: 'sea',
      objects: { lighthouse: 1, pine: 3, flowers: 4, rock: 2 }, events: ['dolphin', 'balloon'] },
    { name: 'ゆうひの うみ', sky: ['#ff7f5a', '#ffd29a'], grass: ['#ebc888', '#e1bd7c'], backdrop: 'sea_sunset', left: 'sea', sun: true,
      objects: { palm: 5, parasol: 1 }, events: ['dolphin', 'birds'] },
  ],
  yama: [
    { name: 'もりの みち', sky: ['#8fd0ff', '#ecf9ff'], grass: ['#5daf4c', '#53a543'], backdrop: 'mountains',
      objects: { pine: 7, tree: 2, bush: 2, torii: 1 }, events: ['birds'] },
    { name: 'おはなばたけ', sky: ['#7cc9ff', '#eaf8ff'], grass: ['#8bd162', '#80c759'], backdrop: 'hills', petals: true,
      objects: { flowers: 8, windmill: 1, tree: 1 }, events: ['balloon', 'birds'] },
    { name: 'かわの はし', sky: ['#86ccff', '#eaf7ff'], grass: ['#5daf4c', '#53a543'], backdrop: 'mountains', left: 'river', right: 'river', bridge: true,
      objects: { pine: 2, rock: 2 }, events: ['birds'] },
    { name: 'トンネル', tunnel: true, grass: ['#3c3c46', '#35353e'], objects: {}, events: [] },
    { name: 'ゆきやま', sky: ['#a6d2f5', '#f0f8ff'], grass: ['#f4f8fc', '#e7eef6'], backdrop: 'snowpeaks', snow: true,
      objects: { snowpine: 7, snowman: 1, rock: 1 }, events: ['birds'] },
  ],
};

// 何度呼んでも同じ値になる乱数（景色が毎フレームちらつかないように）
KG.rnd = function (k, salt = 0) {
  const v = Math.sin(k * 12.9898 + salt * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

// 重み付きで1つ選ぶ
KG.pickWeighted = function (weights, r) {
  const entries = Object.entries(weights);
  const total = entries.reduce((a, [, w]) => a + w, 0);
  let x = r * total;
  for (const [k, w] of entries) { if ((x -= w) < 0) return k; }
  return entries.length ? entries[entries.length - 1][0] : null;
};

const SHOP_SIGNS = ['肉', '魚', '茶', '米', '本', '花', '店', '絵', '楽', '麦'];
const PALETTE = ['#ffd9a8', '#cfe6ff', '#ffe0ea', '#e2f5d0', '#fff1b8', '#e6dcff'];
const ROOFS = ['#e2574c', '#4b7bd8', '#7a5bd1', '#3a9e6a', '#d9822b'];

function rr(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
KG.rr = rr;

function shadow(ctx, x, y, w, u) {
  ctx.fillStyle = 'rgba(0,0,0,0.13)';
  ctx.beginPath();
  ctx.ellipse(x, y, w, u * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
}

// ---- 建物・木などの描き方 ----
// x, y：地面の位置（画面の座標）　u：この距離での1メートル分の大きさ　r：0〜1の乱数　T：時間
KG.OBJ = {
  house(ctx, x, y, u, r) {
    const w = u * (1.4 + r * 0.4), h = u * (1.0 + r * 0.5);
    shadow(ctx, x, y, w * 0.6, u);
    ctx.fillStyle = PALETTE[Math.floor(r * 6)];
    ctx.fillRect(x - w / 2, y - h, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(x + w * 0.25, y - h, w * 0.25, h);
    ctx.fillStyle = ROOFS[Math.floor(r * 5)];
    ctx.beginPath();
    ctx.moveTo(x - w * 0.62, y - h);
    ctx.lineTo(x, y - h - u * 0.7);
    ctx.lineTo(x + w * 0.62, y - h);
    ctx.fill();
    if (r > 0.5) { ctx.fillRect(x + w * 0.2, y - h - u * 0.6, u * 0.16, u * 0.35); }
    ctx.fillStyle = '#8a5a33';
    ctx.fillRect(x - u * 0.15, y - u * 0.55, u * 0.3, u * 0.55);
    ctx.fillStyle = '#7fc4f5';
    ctx.fillRect(x - w * 0.38, y - h * 0.75, w * 0.2, h * 0.25);
    ctx.fillRect(x + w * 0.18, y - h * 0.75, w * 0.2, h * 0.25);
  },
  shop(ctx, x, y, u, r) {
    const w = u * 1.9, h = u * 1.6;
    shadow(ctx, x, y, w * 0.6, u);
    ctx.fillStyle = PALETTE[Math.floor(r * 6)];
    ctx.fillRect(x - w / 2, y - h, w, h);
    ctx.fillStyle = '#bfe6ff';
    ctx.fillRect(x - w * 0.42, y - h * 0.5, w * 0.84, h * 0.5);
    // ひさし（しま模様）
    const stripes = 6, cols = [['#ff5a4f', '#fff'], ['#2fae5b', '#fff'], ['#3d8bff', '#fff'], ['#ffb02e', '#fff']][Math.floor(r * 4)];
    for (let i = 0; i < stripes; i++) {
      ctx.fillStyle = cols[i % 2];
      ctx.beginPath();
      const x0 = x - w * 0.55 + (w * 1.1 * i) / stripes, x1 = x0 + (w * 1.1) / stripes;
      ctx.moveTo(x0 + u * 0.05, y - h * 0.62);
      ctx.lineTo(x1 + u * 0.05, y - h * 0.62);
      ctx.lineTo(x1, y - h * 0.48);
      ctx.lineTo(x0, y - h * 0.48);
      ctx.fill();
    }
    // かんばん（2年生の字）
    ctx.fillStyle = '#fffaf0';
    rr(ctx, x - w * 0.3, y - h * 0.97, w * 0.6, h * 0.3, u * 0.05);
    ctx.fill();
    if (u > 7) {
      ctx.fillStyle = '#c0392b';
      ctx.font = `bold ${h * 0.24}px ${KG.FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(SHOP_SIGNS[Math.floor(r * SHOP_SIGNS.length)], x, y - h * 0.82);
    }
  },
  building(ctx, x, y, u, r, T, night) {
    const w = u * (1.5 + r * 0.6), h = u * (3 + r * 4);
    shadow(ctx, x, y, w * 0.6, u);
    const cols = ['#9fb8d6', '#c9d3df', '#b3c7b8', '#d6c2a8', '#a9b4d9'];
    ctx.fillStyle = cols[Math.floor(r * 5)];
    ctx.fillRect(x - w / 2, y - h, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.fillRect(x + w * 0.3, y - h, w * 0.2, h);
    if (u > 4) {
      const rows = Math.floor(h / (u * 0.5)), cs = 3;
      for (let i = 0; i < rows; i++) for (let j = 0; j < cs; j++) {
        const lit = KG.rnd(i * 7 + j, r * 100) > 0.6;
        ctx.fillStyle = lit ? '#ffe58a' : '#5f7fa6';
        ctx.fillRect(x - w * 0.38 + j * w * 0.27, y - h + u * 0.25 + i * u * 0.5, w * 0.18, u * 0.28);
      }
    }
    ctx.fillStyle = '#777';
    ctx.fillRect(x - u * 0.03, y - h - u * 0.6, u * 0.06, u * 0.6);
    ctx.fillStyle = (Math.floor(T * 2) % 2) ? '#ff4040' : '#802020';
    ctx.beginPath(); ctx.arc(x, y - h - u * 0.62, u * 0.07, 0, Math.PI * 2); ctx.fill();
  },
  tree(ctx, x, y, u, r) {
    shadow(ctx, x, y, u * 0.5, u);
    ctx.fillStyle = '#8a5a33';
    ctx.fillRect(x - u * 0.09, y - u * 0.6, u * 0.18, u * 0.6);
    const s = 0.8 + r * 0.4;
    ctx.fillStyle = r > 0.5 ? '#3c9e4e' : '#2f8f48';
    ctx.beginPath(); ctx.arc(x, y - u * 1.0 * s, u * 0.6 * s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = r > 0.5 ? '#5cc067' : '#4bb35c';
    ctx.beginPath(); ctx.arc(x - u * 0.15, y - u * 1.15 * s, u * 0.4 * s, 0, Math.PI * 2); ctx.fill();
    if (r > 0.75) { // 実のなる木
      ctx.fillStyle = '#ff5a4f';
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(x + Math.cos(i * 1.7) * u * 0.35 * s, y - u * 1.0 * s + Math.sin(i * 1.7) * u * 0.3 * s, u * 0.07, 0, Math.PI * 2); ctx.fill(); }
    }
  },
  pine(ctx, x, y, u, r, T, night, snow) {
    shadow(ctx, x, y, u * 0.5, u);
    ctx.fillStyle = '#7a4f2c';
    ctx.fillRect(x - u * 0.08, y - u * 0.45, u * 0.16, u * 0.45);
    const s = 0.9 + r * 0.6;
    for (let i = 0; i < 3; i++) {
      const top = y - u * (1.1 + i * 0.5) * s, base = y - u * (0.35 + i * 0.5) * s, hw = u * (0.65 - i * 0.14) * s;
      ctx.fillStyle = i % 2 ? '#2e7d4a' : '#3a9058';
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x - hw, base); ctx.lineTo(x + hw, base); ctx.fill();
      if (snow) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x - hw * 0.45, top + (base - top) * 0.45); ctx.lineTo(x + hw * 0.45, top + (base - top) * 0.45); ctx.fill();
      }
    }
  },
  snowpine(ctx, x, y, u, r, T) { KG.OBJ.pine(ctx, x, y, u, r, T, false, true); },
  palm(ctx, x, y, u, r, T) {
    shadow(ctx, x, y, u * 0.6, u);
    const lean = (r - 0.5) * 0.6;
    ctx.strokeStyle = '#9a6b3c';
    ctx.lineWidth = Math.max(1, u * 0.14);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + u * (0.3 + lean), y - u, x + u * (0.15 + lean), y - u * 1.9); ctx.stroke();
    const tx = x + u * (0.15 + lean), ty = y - u * 1.9;
    const sway = Math.sin(T * 2 + r * 6) * 0.08;
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i - 2.5) * 0.62 + sway;
      ctx.fillStyle = i % 2 ? '#2fae5b' : '#27994f';
      ctx.beginPath();
      ctx.ellipse(tx + Math.cos(a) * u * 0.5, ty + Math.sin(a) * u * 0.28 + u * 0.12, u * 0.55, u * 0.14, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#7a4a22';
    ctx.beginPath(); ctx.arc(tx, ty + u * 0.08, u * 0.1, 0, Math.PI * 2); ctx.fill();
  },
  parasol(ctx, x, y, u, r) {
    ctx.fillStyle = ['#ff7eb6', '#3d8bff', '#ffd54a', '#33c27a'][Math.floor(r * 4)];
    ctx.fillRect(x - u * 0.5, y - u * 0.08, u * 1.0, u * 0.12);
    ctx.fillStyle = '#ddd';
    ctx.fillRect(x - u * 0.03, y - u * 1.3, u * 0.06, u * 1.3);
    const cols = [['#ff5a4f', '#fff'], ['#3d8bff', '#fff'], ['#ffb02e', '#fff']][Math.floor(r * 3)];
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = cols[i % 2];
      ctx.beginPath();
      ctx.moveTo(x, y - u * 1.45);
      ctx.arc(x, y - u * 1.1, u * 0.75, Math.PI + (i * Math.PI) / 6, Math.PI + ((i + 1) * Math.PI) / 6);
      ctx.fill();
    }
  },
  flowers(ctx, x, y, u, r) {
    ctx.fillStyle = '#4caf50';
    ctx.beginPath(); ctx.ellipse(x, y - u * 0.1, u * 0.8, u * 0.22, 0, 0, Math.PI * 2); ctx.fill();
    const cols = ['#ff5a8a', '#ffd54a', '#ffffff', '#b07cff', '#ff8a3d'];
    for (let i = 0; i < 9; i++) {
      const fx = x + (KG.rnd(i, r * 50) - 0.5) * u * 1.4, fy = y - u * (0.15 + KG.rnd(i, r * 70) * 0.3);
      ctx.fillStyle = cols[(i + Math.floor(r * 5)) % 5];
      ctx.beginPath(); ctx.arc(fx, fy, u * 0.1, 0, Math.PI * 2); ctx.fill();
    }
  },
  bush(ctx, x, y, u, r) {
    ctx.fillStyle = '#3f9e4f';
    ctx.beginPath(); ctx.ellipse(x, y - u * 0.3, u * 0.6, u * 0.35, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#56b866';
    ctx.beginPath(); ctx.ellipse(x - u * 0.15, y - u * 0.4, u * 0.35, u * 0.22, 0, 0, Math.PI * 2); ctx.fill();
  },
  lamp(ctx, x, y, u, r, T, night) {
    ctx.fillStyle = '#5b6470';
    ctx.fillRect(x - u * 0.04, y - u * 2.2, u * 0.08, u * 2.2);
    ctx.fillRect(x - u * 0.04, y - u * 2.2, u * 0.4, u * 0.06);
    ctx.fillStyle = night ? '#fff3b0' : '#e8eef5';
    ctx.beginPath(); ctx.ellipse(x + u * 0.34, y - u * 2.1, u * 0.14, u * 0.07, 0, 0, Math.PI * 2); ctx.fill();
    if (night) {
      const g = ctx.createRadialGradient(x + u * 0.34, y - u * 2.05, 0, x + u * 0.34, y - u * 2.05, u * 0.9);
      g.addColorStop(0, 'rgba(255,240,170,0.55)');
      g.addColorStop(1, 'rgba(255,240,170,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x + u * 0.34, y - u * 2.05, u * 0.9, 0, Math.PI * 2); ctx.fill();
    }
  },
  signal(ctx, x, y, u, r, T) {
    ctx.fillStyle = '#5b6470';
    ctx.fillRect(x - u * 0.04, y - u * 2.0, u * 0.08, u * 2.0);
    ctx.fillStyle = '#2c3138';
    rr(ctx, x - u * 0.45, y - u * 2.25, u * 0.9, u * 0.32, u * 0.08);
    ctx.fill();
    const on = Math.floor((T + r * 9) / 2.5) % 3;
    ['#33c27a', '#ffc928', '#ff5a4f'].forEach((c, i) => {
      ctx.fillStyle = i === on ? c : '#4a4f57';
      ctx.beginPath(); ctx.arc(x - u * 0.28 + i * u * 0.28, y - u * 2.09, u * 0.1, 0, Math.PI * 2); ctx.fill();
    });
  },
  mailbox(ctx, x, y, u) {
    ctx.fillStyle = '#e53935';
    rr(ctx, x - u * 0.22, y - u * 0.95, u * 0.44, u * 0.95, u * 0.2);
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.fillRect(x - u * 0.13, y - u * 0.65, u * 0.26, u * 0.05);
  },
  vending(ctx, x, y, u, r) {
    ctx.fillStyle = r > 0.5 ? '#e53935' : '#f5f5f5';
    ctx.fillRect(x - u * 0.4, y - u * 1.5, u * 0.8, u * 1.5);
    ctx.fillStyle = '#cfe8ff';
    ctx.fillRect(x - u * 0.32, y - u * 1.4, u * 0.64, u * 0.6);
    const cs = ['#ff7043', '#42a5f5', '#66bb6a', '#ffca28'];
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = cs[i % 4];
      ctx.fillRect(x - u * 0.28 + (i % 4) * u * 0.15, y - u * 1.33 + Math.floor(i / 4) * u * 0.28, u * 0.09, u * 0.2);
    }
    ctx.fillStyle = '#333';
    ctx.fillRect(x - u * 0.25, y - u * 0.35, u * 0.5, u * 0.12);
  },
  fountain(ctx, x, y, u, r, T) {
    ctx.fillStyle = '#b8c4cf';
    ctx.beginPath(); ctx.ellipse(x, y - u * 0.2, u * 1.0, u * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6ec6ff';
    ctx.beginPath(); ctx.ellipse(x, y - u * 0.25, u * 0.85, u * 0.22, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(200,235,255,0.9)';
    ctx.lineWidth = Math.max(1, u * 0.06);
    for (let i = -2; i <= 2; i++) {
      const hh = u * (1.1 + Math.sin(T * 6 + i) * 0.1);
      ctx.beginPath(); ctx.moveTo(x, y - u * 0.3); ctx.quadraticCurveTo(x + i * u * 0.15, y - u * 0.3 - hh, x + i * u * 0.4, y - u * 0.3); ctx.stroke();
    }
  },
  container(ctx, x, y, u, r) {
    const cols = ['#e2574c', '#3d8bff', '#33c27a', '#ffb02e', '#8e6bd8'];
    for (let i = 0; i < 2 + Math.floor(r * 2); i++) {
      ctx.fillStyle = cols[Math.floor(KG.rnd(i, r * 33) * 5)];
      ctx.fillRect(x - u * 1.0, y - u * 0.6 * (i + 1), u * 2.0, u * 0.58);
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      for (let j = 0; j < 6; j++) ctx.fillRect(x - u * 0.95 + j * u * 0.33, y - u * 0.6 * (i + 1) + u * 0.05, u * 0.05, u * 0.48);
    }
  },
  boat(ctx, x, y, u, r, T) {
    const bob = Math.sin(T * 2 + r * 6) * u * 0.06;
    ctx.fillStyle = r > 0.5 ? '#ffffff' : '#ff7043';
    ctx.beginPath();
    ctx.moveTo(x - u * 0.9, y - u * 0.3 + bob); ctx.lineTo(x + u * 0.9, y - u * 0.3 + bob);
    ctx.lineTo(x + u * 0.6, y + bob); ctx.lineTo(x - u * 0.6, y + bob); ctx.fill();
    ctx.fillStyle = '#5b6470';
    ctx.fillRect(x - u * 0.03, y - u * 1.6 + bob, u * 0.06, u * 1.3);
    ctx.fillStyle = r > 0.5 ? '#3d8bff' : '#fff';
    ctx.beginPath(); ctx.moveTo(x + u * 0.05, y - u * 1.55 + bob); ctx.lineTo(x + u * 0.75, y - u * 0.4 + bob); ctx.lineTo(x + u * 0.05, y - u * 0.4 + bob); ctx.fill();
  },
  lighthouse(ctx, x, y, u, r, T) {
    shadow(ctx, x, y, u * 0.7, u);
    const h = u * 4;
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i % 2 ? '#e53935' : '#ffffff';
      const t0 = i / 5, t1 = (i + 1) / 5;
      ctx.beginPath();
      ctx.moveTo(x - u * (0.55 - t0 * 0.2), y - h * t0); ctx.lineTo(x + u * (0.55 - t0 * 0.2), y - h * t0);
      ctx.lineTo(x + u * (0.55 - t1 * 0.2), y - h * t1); ctx.lineTo(x - u * (0.55 - t1 * 0.2), y - h * t1); ctx.fill();
    }
    ctx.fillStyle = '#ffe58a';
    ctx.fillRect(x - u * 0.3, y - h - u * 0.45, u * 0.6, u * 0.45);
    ctx.fillStyle = '#e53935';
    ctx.beginPath(); ctx.moveTo(x - u * 0.4, y - h - u * 0.45); ctx.lineTo(x, y - h - u * 0.85); ctx.lineTo(x + u * 0.4, y - h - u * 0.45); ctx.fill();
    const a = T * 1.5;
    ctx.fillStyle = 'rgba(255,240,170,0.35)';
    ctx.beginPath(); ctx.moveTo(x, y - h - u * 0.22);
    ctx.lineTo(x + Math.cos(a) * u * 4, y - h - u * 0.22 - u * 0.5); ctx.lineTo(x + Math.cos(a) * u * 4, y - h - u * 0.22 + u * 0.5); ctx.fill();
  },
  rock(ctx, x, y, u, r) {
    ctx.fillStyle = '#8d939b';
    ctx.beginPath();
    ctx.moveTo(x - u * 0.7, y); ctx.lineTo(x - u * 0.5, y - u * (0.5 + r * 0.3)); ctx.lineTo(x, y - u * (0.7 + r * 0.3));
    ctx.lineTo(x + u * 0.55, y - u * 0.45); ctx.lineTo(x + u * 0.7, y); ctx.fill();
    ctx.fillStyle = '#a4aab2';
    ctx.beginPath(); ctx.moveTo(x - u * 0.45, y - u * 0.45); ctx.lineTo(x, y - u * (0.65 + r * 0.3)); ctx.lineTo(x + u * 0.1, y - u * 0.3); ctx.fill();
  },
  windmill(ctx, x, y, u, r, T) {
    shadow(ctx, x, y, u * 0.7, u);
    ctx.fillStyle = '#f2e6d0';
    ctx.beginPath(); ctx.moveTo(x - u * 0.5, y); ctx.lineTo(x - u * 0.3, y - u * 2.6); ctx.lineTo(x + u * 0.3, y - u * 2.6); ctx.lineTo(x + u * 0.5, y); ctx.fill();
    ctx.fillStyle = '#c0392b';
    ctx.beginPath(); ctx.moveTo(x - u * 0.4, y - u * 2.6); ctx.lineTo(x, y - u * 3.1); ctx.lineTo(x + u * 0.4, y - u * 2.6); ctx.fill();
    ctx.fillStyle = '#8a5a33';
    ctx.fillRect(x - u * 0.15, y - u * 0.6, u * 0.3, u * 0.6);
    const cx = x, cy = y - u * 2.6;
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    for (let i = 0; i < 4; i++) {
      const a = T * 1.2 + (i * Math.PI) / 2;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(a);
      ctx.fillRect(u * 0.1, -u * 0.12, u * 1.4, u * 0.24);
      ctx.restore();
    }
  },
  torii(ctx, x, y, u) {
    ctx.fillStyle = '#e0452c';
    ctx.fillRect(x - u * 0.9, y - u * 2.0, u * 0.16, u * 2.0);
    ctx.fillRect(x + u * 0.74, y - u * 2.0, u * 0.16, u * 2.0);
    ctx.fillRect(x - u * 1.05, y - u * 1.65, u * 2.1, u * 0.14);
    ctx.fillStyle = '#2b2b2b';
    ctx.beginPath(); ctx.moveTo(x - u * 1.3, y - u * 2.05); ctx.lineTo(x + u * 1.3, y - u * 2.05); ctx.lineTo(x + u * 1.15, y - u * 2.25); ctx.lineTo(x - u * 1.15, y - u * 2.25); ctx.fill();
  },
  snowman(ctx, x, y, u) {
    shadow(ctx, x, y, u * 0.5, u);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(x, y - u * 0.45, u * 0.45, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x, y - u * 1.1, u * 0.32, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#333';
    ctx.beginPath(); ctx.arc(x - u * 0.1, y - u * 1.15, u * 0.04, 0, Math.PI * 2); ctx.arc(x + u * 0.1, y - u * 1.15, u * 0.04, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff8a3d';
    ctx.beginPath(); ctx.moveTo(x, y - u * 1.08); ctx.lineTo(x + u * 0.25, y - u * 1.04); ctx.lineTo(x, y - u * 1.0); ctx.fill();
    ctx.fillStyle = '#e53935';
    ctx.fillRect(x - u * 0.3, y - u * 0.86, u * 0.6, u * 0.1);
  },
  // トンネルのかべの明かり
  tlight(ctx, x, y, u) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, u * 0.8);
    g.addColorStop(0, 'rgba(255,190,90,0.9)');
    g.addColorStop(1, 'rgba(255,190,90,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, u * 0.8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd38a';
    ctx.fillRect(x - u * 0.25, y - u * 0.05, u * 0.5, u * 0.1);
  },
  // イルカ（海の上でジャンプ）
  dolphin(ctx, x, y, u, r, T, night, ev) {
    const p = ev ? (ev.t % 2.2) / 1.2 : 0;
    if (p > 1) return;
    const jx = x + (p - 0.5) * u * 3, jy = y - Math.sin(p * Math.PI) * u * 2;
    const ang = (0.5 - p) * 1.6;
    ctx.save(); ctx.translate(jx, jy); ctx.rotate(-ang);
    ctx.fillStyle = '#5b8fd1';
    ctx.beginPath(); ctx.ellipse(0, 0, u * 0.7, u * 0.22, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-u * 0.1, -u * 0.18); ctx.lineTo(u * 0.1, -u * 0.45); ctx.lineTo(u * 0.2, -u * 0.15); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-u * 0.65, 0); ctx.lineTo(-u * 0.95, -u * 0.2); ctx.lineTo(-u * 0.95, u * 0.2); ctx.fill();
    ctx.fillStyle = '#dbe9ff';
    ctx.beginPath(); ctx.ellipse(u * 0.1, u * 0.08, u * 0.45, u * 0.1, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    if (p < 0.12 || p > 0.88) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      const sx = p < 0.5 ? x - u * 1.5 : x + u * 1.5;
      for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(sx + (i - 2) * u * 0.15, y - u * 0.15 - Math.abs(i - 2) * -u * 0.05, u * 0.1, 0, Math.PI * 2); ctx.fill(); }
    }
  },
};

// ---- 空と背景 ----
KG.drawSky = function (ctx, zone, w, horizon, T) {
  const g = ctx.createLinearGradient(0, 0, 0, horizon);
  g.addColorStop(0, zone.sky[0]);
  g.addColorStop(1, zone.sky[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, horizon + 2);
  // 太陽
  const sunset = zone.sun;
  const sx = sunset ? w * 0.7 : w * 0.15, sy = sunset ? horizon - horizon * 0.12 : horizon * 0.22, sr = horizon * (sunset ? 0.16 : 0.08);
  const glow = ctx.createRadialGradient(sx, sy, sr * 0.5, sx, sy, sr * 3);
  glow.addColorStop(0, sunset ? 'rgba(255,220,120,0.7)' : 'rgba(255,255,220,0.6)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(sx - sr * 3, sy - sr * 3, sr * 6, sr * 6);
  ctx.fillStyle = sunset ? '#ffb347' : '#fff6c9';
  ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
};

KG.drawClouds = function (ctx, w, h, horizon, scroll, sunset) {
  ctx.fillStyle = sunset ? 'rgba(255,220,200,0.85)' : 'rgba(255,255,255,0.92)';
  for (let i = 0; i < 6; i++) {
    const span = w * 1.4;
    const x = (((i * w * 0.27 - scroll * (0.4 + (i % 3) * 0.15)) % span) + span) % span - w * 0.2;
    const y = horizon * (0.12 + (i % 3) * 0.16);
    const s = h * (0.035 + (i % 2) * 0.015);
    ctx.beginPath();
    ctx.ellipse(x, y, s * 2.2, s * 0.8, 0, 0, Math.PI * 2);
    ctx.ellipse(x - s * 1.1, y + s * 0.1, s * 1.1, s * 0.75, 0, 0, Math.PI * 2);
    ctx.ellipse(x + s * 0.4, y - s * 0.55, s * 1.2, s * 1.0, 0, 0, Math.PI * 2);
    ctx.ellipse(x + s * 1.4, y, s * 1.0, s * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
  }
};

function ridge(ctx, w, horizon, off, height, n, seed, color, snowcap) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-w, horizon + 2);
  const pts = [];
  for (let i = -n; i <= n * 2; i++) {
    const x = off % w + (i * w) / n;
    const hh = height * (0.55 + 0.45 * Math.abs(Math.sin(i * 1.7 + seed)));
    pts.push([x, horizon - hh, hh]);
    ctx.lineTo(x, horizon - hh);
    ctx.lineTo(x + w / n / 2, horizon - hh * (0.45 + 0.2 * Math.abs(Math.cos(i + seed))));
  }
  ctx.lineTo(w * 2, horizon + 2);
  ctx.fill();
  if (snowcap) {
    ctx.fillStyle = '#ffffff';
    for (const [x, y, hh] of pts) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - hh * 0.22, y + hh * 0.25);
      ctx.lineTo(x - hh * 0.05, y + hh * 0.2);
      ctx.lineTo(x + hh * 0.08, y + hh * 0.28);
      ctx.lineTo(x + hh * 0.2, y + hh * 0.22);
      ctx.fill();
    }
  }
}

function hills(ctx, w, horizon, off, height, color, freq, seed) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, horizon + 2);
  for (let x = 0; x <= w + 10; x += 10) {
    const y = horizon - height * (0.6 + 0.4 * Math.sin((x - off) * freq + seed));
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w, horizon + 2);
  ctx.fill();
}

function skyline(ctx, w, h, horizon, off, tall, color, windowColor) {
  const bw = w / 16;
  for (let i = -2; i < 20; i++) {
    const x = ((i * bw + off) % (w + bw * 4) + (w + bw * 4)) % (w + bw * 4) - bw * 2;
    const r = KG.rnd(i + 50, 3);
    const bh = h * (tall ? 0.08 + r * 0.16 : 0.04 + r * 0.08);
    ctx.fillStyle = color;
    ctx.fillRect(x, horizon - bh, bw * 0.86, bh + 2);
    if (windowColor) {
      ctx.fillStyle = windowColor;
      for (let yy = horizon - bh + 6; yy < horizon - 6; yy += 10) for (let xx = x + 4; xx < x + bw * 0.86 - 6; xx += 9) {
        if (KG.rnd(xx * 0.1 + yy, i) > 0.55) ctx.fillRect(xx, yy, 4, 5);
      }
    }
  }
}

function seaBand(ctx, w, h, horizon, color, sunset) {
  ctx.fillStyle = color;
  ctx.fillRect(0, horizon - h * 0.015, w, h * 0.015 + 2);
  if (sunset) {
    ctx.fillStyle = 'rgba(255,200,120,0.7)';
    ctx.fillRect(w * 0.64, horizon - h * 0.012, w * 0.12, h * 0.01);
  }
}

KG.drawBackdrop = function (ctx, type, w, h, horizon, off, T) {
  switch (type) {
    case 'hills':
      hills(ctx, w, horizon, off * 0.3, h * 0.1, '#9fd38a', 0.006, 1);
      hills(ctx, w, horizon, off * 0.6, h * 0.06, '#7fc46b', 0.01, 3);
      break;
    case 'city':
      hills(ctx, w, horizon, off * 0.3, h * 0.06, '#a8d695', 0.006, 2);
      skyline(ctx, w, h, horizon, off * 0.5, false, '#a9bdd2', null);
      break;
    case 'skyscrapers':
      skyline(ctx, w, h, horizon, off * 0.3, true, '#9eb2c9', 'rgba(255,255,255,0.5)');
      skyline(ctx, w, h, horizon, off * 0.6 + 40, false, '#8aa0b9', null);
      break;
    case 'city_sunset':
      skyline(ctx, w, h, horizon, off * 0.4, true, '#6b4a6e', 'rgba(255,220,120,0.9)');
      break;
    case 'sea':
      seaBand(ctx, w, h, horizon, '#2f8fd9');
      break;
    case 'sea_sunset':
      seaBand(ctx, w, h, horizon, '#c06a5a', true);
      break;
    case 'harbor': {
      seaBand(ctx, w, h, horizon, '#2f8fd9');
      // ガントリークレーン（港の大きなクレーン）
      for (let i = 0; i < 3; i++) {
        const x = ((w * 0.55 + i * w * 0.16 + off * 0.4) % (w * 1.3) + w * 1.3) % (w * 1.3) - w * 0.15;
        const top = horizon - h * 0.13, legW = h * 0.05, s = h * 0.006;
        ctx.fillStyle = '#e2574c';
        ctx.fillRect(x, top, s, horizon - top);
        ctx.fillRect(x + legW, top, s, horizon - top);
        ctx.fillRect(x - h * 0.06, top - s, legW + h * 0.1, s * 1.6);
        ctx.strokeStyle = '#e2574c'; ctx.lineWidth = s * 0.5;
        ctx.beginPath(); ctx.moveTo(x, horizon); ctx.lineTo(x + legW, top + h * 0.04); ctx.moveTo(x + legW, horizon); ctx.lineTo(x, top + h * 0.04); ctx.stroke();
        ctx.fillStyle = '#ffd54a';
        ctx.fillRect(x + legW * 0.2, top + s, legW * 0.7, s * 2);
      }
      // 沖を走る船
      const sx = ((T * 8 + off * 0.4) % (w * 1.4) + w * 1.4) % (w * 1.4) - w * 0.2, sh = h * 0.02;
      ctx.fillStyle = '#2b3a55';
      ctx.beginPath(); ctx.moveTo(sx, horizon - sh); ctx.lineTo(sx + sh * 7, horizon - sh); ctx.lineTo(sx + sh * 6.2, horizon); ctx.lineTo(sx + sh * 0.6, horizon); ctx.fill();
      ['#e2574c', '#3d8bff', '#ffd54a', '#33c27a'].forEach((c, j) => { ctx.fillStyle = c; ctx.fillRect(sx + sh * (1 + j * 1.2), horizon - sh * 1.8, sh * 1.1, sh * 0.8); });
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(sx + sh * 5.4, horizon - sh * 2.4, sh * 1.1, sh * 1.4);
      break;
    }
    case 'cliff':
      seaBand(ctx, w, h, horizon, '#2f8fd9');
      ctx.fillStyle = '#8bbf6a';
      ctx.beginPath();
      ctx.moveTo(w * 0.55 + off * 0.3, horizon + 2); ctx.lineTo(w * 0.62 + off * 0.3, horizon - h * 0.08);
      ctx.lineTo(w * 1.2, horizon - h * 0.1); ctx.lineTo(w * 1.2, horizon + 2); ctx.fill();
      break;
    case 'mountains':
      ridge(ctx, w, horizon, off * 0.25, h * 0.24, 4, 1, '#8cb3d6', true);
      ridge(ctx, w, horizon, off * 0.5, h * 0.13, 7, 2, '#5e9a6a', false);
      break;
    case 'snowpeaks':
      ridge(ctx, w, horizon, off * 0.25, h * 0.28, 4, 3, '#b9cde3', true);
      ridge(ctx, w, horizon, off * 0.5, h * 0.12, 6, 5, '#e8f0f8', false);
      break;
  }
};

// ドライブモード本体：道路の描画・分かれ道・判定
window.KG = window.KG || {};

KG.Drive = class {
  // opts: { canvas, course, items: [{ q, side }], hud, onFinish(results, elapsed) }
  constructor(opts) {
    Object.assign(this, opts);
    this.ctx = this.canvas.getContext('2d');
    const st = KG.state.settings;
    this.slow = st.slow;
    this.shake = st.shake;
    this.bgSpeed = st.bgSpeed;
    this.T = KG.questionTime();
    const g = (KG.state.profile && KG.state.profile.grade) || 2;
    this.GAP = g <= 2 ? 6 : 5;        // 分かれ道と分かれ道の間の秒数
    this.DETOUR = 4;                 // 遠回りで増える秒数
    this.SPEED = 8;                  // 1秒に進む距離
    this.W = 0.9;                    // 道の半分の幅
    this.D = 2.4;                    // 分かれた道どうしの、左右のずれ
    this.L = 10;                     // 道が分かれきるまでの距離
    this.DEC_Z = 4.2;                // 決定のとき、分かれ道までの距離
    this.LINE = 3.0;                 // 決定ラインは、分かれ道の手前のこの距離
    this.FAR = 70;

    this.idx = 0;
    this.results = [];
    this.elapsed = 0;
    this.track = 0;      // 景色のスクロール量
    this.camX = 0;
    this.carTilt = 0;
    this.bob = 0;
    this.particles = [];
    this.paused = false;
    this.done = false;
    this.setPhase('start', 1.6);
    this.resize = this.resize.bind(this);
    this.loop = this.loop.bind(this);
    window.addEventListener('resize', this.resize);
    this.resize();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  destroy() {
    this.done = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    KG.audio.stopSpeak();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    this.w = this.canvas.width;
    this.h = this.canvas.height;
    this.dpr = dpr;
  }

  get item() { return this.items[this.idx]; }

  setPhase(name, dur) {
    this.phase = name;
    this.phaseT = 0;
    this.phaseDur = dur;
    this.hud.phase(name, this);
  }

  // ---- 入力 ----
  canSelect() { return this.phase === 'question' && !this.paused; }

  select(side) {
    if (!this.canSelect() || this.selected === side) return;
    if (this.selected) this.switchCount++;
    this.selected = side;
    this.lastSelectT = this.phaseT;
    KG.audio.select();
    this.hud.selected(side);
  }

  toggle() {
    if (!this.canSelect()) return;
    this.select(this.selected === 'L' ? 'R' : this.selected === 'R' ? 'L' : (KG.state.settings.hand === 'left' ? 'L' : 'R'));
  }

  setPaused(p) { this.paused = p; if (p) KG.audio.stopSpeak(); }

  // ---- 進行 ----
  loop(now) {
    if (this.done) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.paused) this.update(dt);
    this.draw();
    this.raf = requestAnimationFrame(this.loop);
  }

  update(dt) {
    let speedMul = 1;
    let advance = true;

    if (this.phase === 'question') {
      const remain = this.T - this.phaseT;
      // ゆっくりモード：選ぶまで、分かれ道の手前で止まって待つ
      this.waiting = this.slow && !this.selected && remain <= 1.2;
      if (this.waiting) { advance = false; speedMul = 0; }
      this.hud.waiting(this.waiting);
    }
    if (this.phase === 'after') speedMul = this.lastResult === 'correct' ? 1.3 : 0.8;
    if (this.phase === 'detour') speedMul = 0.8;
    if (this.phase === 'goal') speedMul = Math.max(0, 1 - this.phaseT / 1.5);

    if (advance) {
      this.phaseT += dt;
      if (this.phase !== 'goal' && this.phase !== 'start') this.elapsed += dt;
    }
    const move = this.SPEED * speedMul * dt;
    this.track += move * this.bgSpeed;

    switch (this.phase) {
      case 'start':
        if (this.phaseT >= this.phaseDur) this.setPhase('cruise', 2);
        break;
      case 'cruise':
        if (this.phaseT >= this.phaseDur) this.beginQuestion();
        break;
      case 'question':
        this.forkZ = this.DEC_Z + this.SPEED * Math.max(0, this.T - this.phaseT);
        if (this.phaseT >= this.T) this.decide();
        break;
      case 'after':
        this.forkZ -= move;
        if (this.forkZ < -(this.L + 8)) this.finishFork();
        break;
      case 'detour':
        if (this.phaseT >= this.phaseDur) this.nextOrGoal();
        break;
      case 'goal':
        if (this.phaseT >= 2.2 && !this.finished) {
          this.finished = true;
          this.onFinish(this.results, this.elapsed);
        }
        break;
    }

    // カメラ（車）の左右の位置
    let target = 0;
    if (this.phase === 'question') target = this.selected === 'L' ? -0.45 * this.W : this.selected === 'R' ? 0.45 * this.W : 0;
    else if (this.phase === 'after') target = this.branchCenter(this.chosen, 1.5);
    else if (this.phase === 'detour') target = this.detourCenter(1.5);
    const prev = this.camX;
    const k = this.phase === 'after' || this.phase === 'detour' ? 10 : 6;
    this.camX += (target - this.camX) * Math.min(1, dt * k);
    const vx = (this.camX - prev) / Math.max(dt, 1e-3);
    this.carTilt += (Math.max(-1, Math.min(1, vx * 0.6)) - this.carTilt) * Math.min(1, dt * 8);

    if (this.shake) this.bob = Math.sin(this.track * 1.7) * 0.004 * speedMul;
    else this.bob = 0;

    this.particles = this.particles.filter(p => (p.life -= dt) > 0);
    for (const p of this.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 900 * dt * this.dpr; }
  }

  beginQuestion() {
    this.selected = null;
    this.switchCount = 0;
    this.lastSelectT = null;
    this.chosen = null;
    this.forkZ = this.DEC_Z + this.SPEED * this.T;
    this.setPhase('question', this.T);
    const q = this.item.q;
    if (q.type === 'reading') KG.audio.speak('よみは どっち？');
    else KG.audio.speak(KG.plainText(q) + '。 かんじは どっち？');
  }

  decide() {
    const it = this.item;
    const picked = this.selected;
    const result = !picked ? 'timeout' : picked === it.side ? 'correct' : 'wrong';
    const respT = this.lastSelectT == null ? this.T : this.lastSelectT;
    // 迷った：時間の8割以上かかった、または2回以上選び直した（ゆっくりモードでは選び直しだけで判定）
    const hesitated = result === 'correct' && (this.switchCount >= 2 || (!this.slow && respT >= this.T * 0.8));
    const pickedText = !picked ? null : picked === it.side ? it.q.correct : it.q.wrong;
    KG.recordRead(it.q, result, { hesitated, responseMs: respT * 1000, switchCount: this.switchCount, picked: pickedText });
    this.results.push({ q: it.q, result, hesitated });
    this.lastResult = result;
    // 時間切れのときは、正解の道へ（遠回りの演出だけする）
    this.chosen = picked || it.side;
    this.setPhase('after', 0);
    if (result === 'correct') {
      KG.audio.correct();
      this.burst();
    } else {
      KG.audio.wrong();
    }
    this.hud.result(result, it, hesitated);
  }

  finishFork() {
    // 選んだ道を新しい「まっすぐの道」とみなして、座標をずらす（見た目は切れ目なし）
    const s = this.chosen === 'L' ? -1 : 1;
    this.camX -= s * this.D;
    this.forkZ = null;
    if (this.lastResult !== 'correct') this.setPhase('detour', this.DETOUR);
    else this.nextOrGoal();
  }

  nextOrGoal() {
    this.hud.clearResult();
    this.idx++;
    if (this.idx >= this.items.length) {
      this.setPhase('goal', 2.2);
      KG.audio.goal();
    } else {
      this.setPhase('cruise', this.GAP - 1);
    }
  }

  burst() {
    const cx = this.w / 2, cy = this.h * 0.78;
    const colors = ['#ffd54a', '#ff7eb6', '#7ee0ff', '#9bff7e', '#ffffff'];
    for (let i = 0; i < 28; i++) {
      const a = Math.random() * Math.PI * 2, v = (250 + Math.random() * 400) * this.dpr;
      this.particles.push({ x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 400 * this.dpr, life: 0.9 + Math.random() * 0.4, c: colors[i % colors.length], r: (4 + Math.random() * 5) * this.dpr });
    }
  }

  // ---- 道の形 ----
  smooth(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }

  branchCenter(side, z) {
    const s = side === 'L' ? -1 : 1;
    return s * this.D * this.smooth((z - this.forkZ) / this.L);
  }

  detourCenter(z) {
    const t = this.phaseDur ? this.phaseT / this.phaseDur : 0;
    const amp = Math.sin(Math.PI * Math.min(1, t)) * 1.3;
    return amp * Math.sin((z + this.track) * 0.12);
  }

  // ある距離 z に見えている道の一覧 [{ cx, kind }]
  roadsAt(z) {
    const hasFork = (this.phase === 'question' || this.phase === 'after') && this.forkZ != null;
    if (!hasFork || z < this.forkZ) {
      const cx = this.phase === 'detour' ? this.detourCenter(z) : 0;
      return [{ cx, kind: 'main' }];
    }
    const out = [];
    for (const side of ['L', 'R']) {
      // 決めた後は、選ばなかった道は途中までしか描かない
      if (this.chosen && side !== this.chosen && z > this.forkZ + this.L + 6) continue;
      out.push({ cx: this.branchCenter(side, z), kind: side });
    }
    return out;
  }

  // ---- 描画 ----
  proj(z) {
    const y0 = this.h * (0.40 + this.bob);
    const unitY = (this.h - y0) / z;
    const unitX = Math.min(this.h - y0, this.w * 0.55) / z;
    return { y: y0 + unitY, ux: unitX, uy: unitY, y0 };
  }
  sx(x, ux) { return this.w / 2 + (x - this.camX) * ux; }

  draw() {
    const { ctx, w, h } = this;
    const c = this.course;
    const horizon = h * (0.40 + this.bob);

    // 空
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, c.sky[0]);
    sky.addColorStop(1, c.sky[1]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, horizon + 2);
    this.drawBackdrop(horizon);

    // 地面と道（遠くから手前へ）
    const r = 1.035;
    let zFar = this.FAR;
    let pFar = this.proj(zFar);
    ctx.fillStyle = c.grass[0];
    ctx.fillRect(0, horizon, w, h - horizon);
    while (zFar > 1.0) {
      const zNear = Math.max(1.0, zFar / r);
      const pNear = this.proj(zNear);
      const stripe = Math.floor((zNear + this.track) / 2.2) % 2 === 0;
      const y1 = pFar.y, y2 = pNear.y + 1;
      ctx.fillStyle = stripe ? c.grass[0] : c.grass[1];
      ctx.fillRect(0, y1, w, y2 - y1);
      if (c.id === 'umi') this.drawSea(zFar, zNear, pFar, pNear);

      const roadsF = this.roadsAt(zFar), roadsN = this.roadsAt(zNear);
      for (const rf of roadsF) {
        const rn = roadsN.find(x => x.kind === rf.kind) || (rf.kind !== 'main' ? roadsN.find(x => x.kind === 'main') : roadsN[0]);
        if (!rn) continue;
        this.quad(rf.cx, rn.cx, this.W * 1.12, pFar, pNear, stripe ? '#ffffff' : '#ff5a4f');
        this.quad(rf.cx, rn.cx, this.W, pFar, pNear, stripe ? '#6b6f7a' : '#646873');
        // まん中の線（まっすぐの道だけ）
        if (rf.kind === 'main' && stripe && roadsF.length === 1) this.quad(rf.cx, rn.cx, 0.04, pFar, pNear, '#fff7c2');
      }
      // 決定ライン
      if (this.phase === 'question' && this.forkZ != null) {
        const lz = this.forkZ - this.LINE;
        if (lz <= zFar && lz > zNear) {
          const p = this.proj(lz);
          const half = this.W * p.ux, x = this.sx(0, p.ux);
          const cell = Math.max(4, half / 6);
          for (let i = -6; i < 6; i++) {
            ctx.fillStyle = (i % 2 === 0) ? '#ffffff' : '#222';
            ctx.fillRect(x + i * cell, p.y - cell * 0.5, cell, cell * 0.6);
          }
        }
      }
      zFar = zNear;
      pFar = pNear;
    }

    this.drawScenery();
    this.drawSigns();
    this.drawCar();
    for (const p of this.particles) {
      ctx.globalAlpha = Math.min(1, p.life * 2);
      ctx.fillStyle = p.c;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  quad(cxF, cxN, half, pF, pN, color) {
    const ctx = this.ctx;
    const xF = this.sx(cxF, pF.ux), xN = this.sx(cxN, pN.ux);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(xF - half * pF.ux, pF.y);
    ctx.lineTo(xF + half * pF.ux, pF.y);
    ctx.lineTo(xN + half * pN.ux, pN.y + 1);
    ctx.lineTo(xN - half * pN.ux, pN.y + 1);
    ctx.closePath();
    ctx.fill();
  }

  // うみコース：道の左がわは海
  drawSea(zF, zN, pF, pN) {
    const ctx = this.ctx;
    const roadsF = this.roadsAt(zF), roadsN = this.roadsAt(zN);
    const leftF = Math.min(...roadsF.map(r => r.cx)) - this.W - 2.2;
    const leftN = Math.min(...roadsN.map(r => r.cx)) - this.W - 2.2;
    const xF = this.sx(leftF, pF.ux), xN = this.sx(leftN, pN.ux);
    const stripe = Math.floor((zN + this.track * 0.6) / 3) % 2 === 0;
    ctx.fillStyle = stripe ? '#3fa9f5' : '#38a0ea';
    ctx.beginPath();
    ctx.moveTo(-10, pF.y);
    ctx.lineTo(xF, pF.y);
    ctx.lineTo(xN, pN.y + 1);
    ctx.lineTo(-10, pN.y + 1);
    ctx.fill();
  }

  drawBackdrop(horizon) {
    const ctx = this.ctx, w = this.w, h = this.h;
    const off = -this.camX * 30 * this.dpr;
    if (this.course.id === 'yama') {
      ctx.fillStyle = '#7aa7c9';
      this.mountains(horizon, off * 0.5, h * 0.22, 5, 1);
      ctx.fillStyle = '#5e9a6a';
      this.mountains(horizon, off, h * 0.14, 7, 2);
    } else if (this.course.id === 'machi') {
      ctx.fillStyle = '#9fb6cc';
      for (let i = -2; i < 22; i++) {
        const bw = w / 14, x = ((i * bw + off) % (w + bw * 4)) - bw * 2;
        const bh = h * (0.05 + ((i * 37) % 7) / 60);
        ctx.fillRect(x, horizon - bh, bw * 0.85, bh + 2);
      }
    } else {
      ctx.fillStyle = '#2f8fd9';
      ctx.fillRect(0, horizon - h * 0.012, w, h * 0.012 + 2);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(w * 0.82 + off * 0.3, horizon - h * 0.18, h * 0.05, 0, Math.PI * 2);
      ctx.fill();
    }
    // 雲
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 4; i++) {
      const x = ((i * w * 0.33 + off * 0.2 - this.track * 0.5 * this.dpr) % (w * 1.3) + w * 1.3) % (w * 1.3) - w * 0.15;
      const y = h * (0.08 + (i % 2) * 0.07);
      ctx.beginPath();
      ctx.ellipse(x, y, h * 0.07, h * 0.025, 0, 0, Math.PI * 2);
      ctx.ellipse(x + h * 0.05, y - h * 0.015, h * 0.05, h * 0.03, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  mountains(horizon, off, height, n, seed) {
    const ctx = this.ctx, w = this.w;
    ctx.beginPath();
    ctx.moveTo(-w, horizon + 2);
    for (let i = -n; i <= n * 2; i++) {
      const x = off + (i * w) / n;
      const hh = height * (0.6 + 0.4 * Math.abs(Math.sin(i * 1.7 + seed)));
      ctx.lineTo(x, horizon - hh);
      ctx.lineTo(x + w / n / 2, horizon - hh * 0.55);
    }
    ctx.lineTo(w * 2, horizon + 2);
    ctx.fill();
  }

  drawScenery() {
    const ctx = this.ctx;
    const spacing = 5;
    const startK = Math.floor((this.track + this.FAR) / spacing);
    const endK = Math.ceil((this.track + 1.2) / spacing);
    for (let k = startK; k >= endK; k--) {
      const z = k * spacing - this.track;
      if (z < 1.2 || z > this.FAR) continue;
      const roads = this.roadsAt(z);
      const leftEdge = Math.min(...roads.map(r => r.cx)) - this.W;
      const rightEdge = Math.max(...roads.map(r => r.cx)) + this.W;
      const p = this.proj(z);
      const hash = Math.abs(Math.sin(k * 12.9898) * 43758.5453) % 1;
      for (const s of [-1, 1]) {
        if (this.course.id === 'umi' && s === -1) continue; // 左がわは海
        const offset = 1.0 + hash * 1.8 + (s === 1 ? 0.3 : 0);
        const x = s === -1 ? leftEdge - offset : rightEdge + offset;
        // 分かれた道のあいだにも木を置く
        this.object(this.sx(x, p.ux), p.y, p.uy, k * 2 + (s === 1 ? 1 : 0));
      }
      if (roads.length === 2 && z > this.forkZ + this.L * 0.8 && k % 2 === 0) {
        this.object(this.sx((roads[0].cx + roads[1].cx) / 2, p.ux), p.y, p.uy, k * 3);
      }
    }
  }

  object(x, y, u, seed) {
    const ctx = this.ctx;
    const id = this.course.id;
    const variant = Math.abs(seed) % 3;
    if (x < -u * 3 || x > this.w + u * 3) return;
    if (id === 'machi' && variant !== 2) {
      // 家
      const bw = u * 1.4, bh = u * (1.0 + variant * 0.4);
      ctx.fillStyle = ['#ffd9a8', '#cfe6ff', '#ffe4ef'][seed % 3 < 0 ? 0 : seed % 3];
      ctx.fillRect(x - bw / 2, y - bh, bw, bh);
      ctx.fillStyle = ['#e2574c', '#4b7bd8', '#7a5bd1'][variant];
      ctx.beginPath();
      ctx.moveTo(x - bw * 0.6, y - bh);
      ctx.lineTo(x, y - bh - u * 0.6);
      ctx.lineTo(x + bw * 0.6, y - bh);
      ctx.fill();
      ctx.fillStyle = '#6aa9e9';
      ctx.fillRect(x - bw * 0.3, y - bh * 0.7, bw * 0.22, bh * 0.25);
      ctx.fillRect(x + bw * 0.08, y - bh * 0.7, bw * 0.22, bh * 0.25);
      return;
    }
    if (id === 'umi') {
      // ヤシの木
      ctx.strokeStyle = '#9a6b3c';
      ctx.lineWidth = Math.max(1, u * 0.12);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + u * 0.25, y - u * 0.9, x + u * 0.1, y - u * 1.7);
      ctx.stroke();
      ctx.fillStyle = '#2fae5b';
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i - 2) * 0.7;
        ctx.beginPath();
        ctx.ellipse(x + u * 0.1 + Math.cos(a) * u * 0.45, y - u * 1.7 + Math.sin(a) * u * 0.25 + u * 0.1, u * 0.5, u * 0.13, a, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }
    // 木（やまは とがった木）
    ctx.fillStyle = '#8a5a33';
    ctx.fillRect(x - u * 0.08, y - u * 0.5, u * 0.16, u * 0.5);
    if (id === 'yama') {
      ctx.fillStyle = variant === 0 ? '#2e7d4a' : '#3d8f55';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(x, y - u * (1.0 + i * 0.45) - u * 0.5);
        ctx.lineTo(x - u * (0.6 - i * 0.12), y - u * (0.4 + i * 0.45));
        ctx.lineTo(x + u * (0.6 - i * 0.12), y - u * (0.4 + i * 0.45));
        ctx.fill();
      }
    } else {
      ctx.fillStyle = '#46b35a';
      ctx.beginPath();
      ctx.arc(x, y - u * 0.9, u * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawSigns() {
    if (!(this.phase === 'question' || this.phase === 'after') || this.forkZ == null) return;
    const it = this.item;
    const z = this.forkZ + 2.5;
    if (z < 1.3 || z > this.FAR) return;
    const ctx = this.ctx;
    const p = this.proj(z);
    // 近づいたら消す（看板が画面いっぱいにならないように）
    const alpha = Math.max(0, Math.min(1, (z - 3.5) / 2.5));
    if (alpha <= 0) return;
    ctx.globalAlpha = alpha;
    for (const side of ['L', 'R']) {
      if (this.chosen && side !== this.chosen && this.phase === 'after') continue;
      const text = side === it.side ? it.q.correct : it.q.wrong;
      // 看板は、それぞれの道の外がわに立てる（左右の看板が重ならず、柱が道をふさがない）
      const s = side === 'L' ? -1 : 1;
      const cx = this.sx(s * (Math.abs(this.branchCenter(side, z)) + 1.0), p.ux);
      const bw = 1.7 * p.ux, bh = 0.85 * p.uy;
      const bottom = p.y - 1.25 * p.uy;
      ctx.fillStyle = '#7a7f8a';
      ctx.fillRect(cx - bw * 0.03, bottom, bw * 0.06, p.y - bottom);
      const sel = this.selected === side;
      ctx.fillStyle = '#1f8a4c';
      ctx.strokeStyle = sel ? '#ffd54a' : '#ffffff';
      ctx.lineWidth = Math.max(2, bh * (sel ? 0.1 : 0.05));
      this.roundRect(cx - bw / 2, bottom - bh, bw, bh, bh * 0.15);
      ctx.fill();
      ctx.stroke();
      const size = Math.min(bh * 0.62, (bw * 0.9) / Math.max(1, text.length));
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${size}px ${KG.FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, cx, bottom - bh / 2);
    }
    ctx.globalAlpha = 1;
  }

  roundRect(x, y, w, h, r) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  drawCar() {
    const ctx = this.ctx, w = this.w, h = this.h;
    const cw = Math.min(w * 0.2, h * 0.28), ch = cw * 0.62;
    const x = w / 2, y = h - ch * 0.35 - h * 0.03;
    const color = (KG.CAR_COLORS.find(c => c.id === KG.state.carColor) || KG.CAR_COLORS[0]).color;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.carTilt * 0.08);
    // かげ
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, ch * 0.42, cw * 0.55, ch * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    // タイヤ
    ctx.fillStyle = '#2b2b2b';
    ctx.fillRect(-cw * 0.5, ch * 0.05, cw * 0.18, ch * 0.38);
    ctx.fillRect(cw * 0.32, ch * 0.05, cw * 0.18, ch * 0.38);
    // 車体
    ctx.fillStyle = color;
    this.roundRect(-cw * 0.5, -ch * 0.25, cw, ch * 0.6, ch * 0.18);
    ctx.fill();
    this.roundRect(-cw * 0.34, -ch * 0.62, cw * 0.68, ch * 0.45, ch * 0.18);
    ctx.fill();
    // 窓
    ctx.fillStyle = '#bfe7ff';
    this.roundRect(-cw * 0.27, -ch * 0.55, cw * 0.54, ch * 0.3, ch * 0.1);
    ctx.fill();
    // ライト
    ctx.fillStyle = '#ffef9a';
    this.roundRect(-cw * 0.44, -ch * 0.12, cw * 0.16, ch * 0.12, ch * 0.05);
    ctx.fill();
    this.roundRect(cw * 0.28, -ch * 0.12, cw * 0.16, ch * 0.12, ch * 0.05);
    ctx.fill();
    // ナンバー
    ctx.fillStyle = '#ffffff';
    this.roundRect(-cw * 0.13, ch * 0.08, cw * 0.26, ch * 0.13, ch * 0.03);
    ctx.fill();
    ctx.fillStyle = '#333';
    ctx.font = `bold ${ch * 0.11}px ${KG.FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('かんじ', 0, ch * 0.145);
    ctx.restore();
  }
};

// ドライブモード本体：道路の描画・分かれ道・判定
window.KG = window.KG || {};

KG.Drive = class {
  // opts: { canvas, course, stageIndex, items: [{ q, side }], hud, onFinish(results, elapsed) }
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
    this.SP = 4;                     // 建物や木を置く間隔

    // エリア：ステージごとに始まりのエリアを変えて、毎回ちがう景色にする
    let zones = KG.ZONES[this.course.id] || KG.ZONES.machi;
    let start = (this.stageIndex || 0) % zones.length;
    if (zones[start].tunnel) start = (start + 1) % zones.length;
    this.zones = zones.slice(start).concat(zones.slice(0, start));
    this.bounds = [{ s: -1e9, zi: 0 }];
    this.schedZi = 0;
    this.camZone = this.zones[0];
    this.skyCur = this.skyPrev = this.zones[0];
    this.skyBlend = 1;

    this.idx = 0;
    this.results = [];
    this.elapsed = 0;
    this.clock = 0;
    this.track = 0;      // 景色のスクロール量
    this.camX = 0;
    this.carTilt = 0;
    this.bob = 0;
    this.combo = 0;
    this.boostT = 0;
    this.particles = [];
    this.puffs = [];
    this.weather = [];
    this.events = [];
    this.nextEvent = 2.5;
    this.lastCount = null;
    this.paused = false;
    this.done = false;
    this.setPhase('start', 2.6);
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
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
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
    KG.audio.select(side);
    this.hud.selected(side);
  }

  toggle() {
    if (!this.canSelect()) return;
    this.select(this.selected === 'L' ? 'R' : this.selected === 'R' ? 'L' : (KG.state.settings.hand === 'left' ? 'L' : 'R'));
  }

  setPaused(p) {
    this.paused = p;
    KG.music.duck(p);
    if (p) KG.audio.stopSpeak();
  }

  // ---- エリア ----
  zoneAt(s) {
    for (let i = this.bounds.length - 1; i >= 0; i--) if (this.bounds[i].s <= s) return this.zones[this.bounds[i].zi];
    return this.zones[0];
  }

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
    this.clock += dt;

    if (this.phase === 'question') {
      const remain = this.T - this.phaseT;
      // ゆっくりモード：選ぶまで、分かれ道の手前で止まって待つ
      this.waiting = this.slow && !this.selected && remain <= 1.2;
      if (this.waiting) { advance = false; speedMul = 0; }
      this.hud.waiting(this.waiting);
    }
    if (this.phase === 'start') speedMul = Math.min(1, Math.max(0, (this.phaseT - 1.9) * 2));
    if (this.phase === 'after') speedMul = this.lastResult === 'correct' ? 1.35 : 0.8;
    if (this.phase === 'detour') speedMul = 0.8;
    if (this.phase === 'goal') speedMul = Math.max(0, 1 - this.phaseT / 1.5);
    this.speedMul = speedMul;

    if (advance) {
      this.phaseT += dt;
      if (this.phase !== 'goal' && this.phase !== 'start') this.elapsed += dt;
    }
    const move = this.SPEED * speedMul * dt;
    this.track += move * this.bgSpeed;
    this.boostT = Math.max(0, this.boostT - dt);

    switch (this.phase) {
      case 'start': {
        // 3・2・1・GO！
        const c = Math.max(0, 3 - Math.floor(this.phaseT / 0.65));
        if (c !== this.lastCount) {
          this.lastCount = c;
          this.hud.count(c > 0 ? String(c) : 'GO！');
          KG.audio.count(c);
        }
        if (this.phaseT >= this.phaseDur) this.setPhase('cruise', 1.2);
        break;
      }
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
        if (this.phaseT >= 2.4 && !this.finished) {
          this.finished = true;
          this.onFinish(this.results, this.elapsed);
        }
        break;
    }

    // いまいるエリアが変わったら、空と背景をゆっくり切りかえる
    const cz = this.zoneAt(this.track + 1.5);
    if (cz !== this.camZone) {
      this.camZone = cz;
      if (cz.sky && cz !== this.skyCur) {
        this.skyPrev = this.skyCur;
        this.skyCur = cz;
        this.skyBlend = 0;
      }
      this.hud.zone(cz.name);
    }
    this.skyBlend = Math.min(1, this.skyBlend + dt / 2.5);

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
    this.bob = this.shake ? Math.sin(this.track * 1.7) * 0.004 * speedMul : 0;

    this.updateEffects(dt, speedMul);
  }

  updateEffects(dt, speedMul) {
    const { w, h, dpr } = this;
    this.particles = this.particles.filter(p => (p.life -= dt) > 0);
    for (const p of this.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 900 * dt * dpr; }

    // 排気ガス（ブーストのときは炎）
    this.puffT = (this.puffT || 0) - dt;
    if (this.puffT <= 0 && speedMul > 0) {
      this.puffT = this.boostT > 0 ? 0.03 : 0.09;
      const cw = Math.min(w * 0.2, h * 0.28);
      for (const s of [-1, 1]) {
        this.puffs.push({ x: w / 2 + s * cw * 0.28, y: h - h * 0.05, vx: s * (20 + Math.random() * 30) * dpr, vy: (40 + Math.random() * 40) * dpr, life: 0.6, max: 0.6, fire: this.boostT > 0 });
      }
    }
    this.puffs = this.puffs.filter(p => (p.life -= dt) > 0);
    for (const p of this.puffs) { p.x += p.vx * dt; p.y += p.vy * dt; }

    // 雪・花びら
    const zone = this.camZone;
    const kind = zone.snow ? 'snow' : zone.petals ? 'petal' : null;
    if (kind && this.weather.length < 90 && Math.random() < dt * 40) {
      this.weather.push({ kind, x: Math.random() * w * 1.2 - w * 0.1, y: -10, vy: (kind === 'snow' ? 60 : 50) * dpr * (0.7 + Math.random() * 0.6), ph: Math.random() * 6, s: (kind === 'snow' ? 2 + Math.random() * 3 : 4 + Math.random() * 3) * dpr });
    }
    this.weather = this.weather.filter(p => p.y < h + 20 && (p.kind === kind || (p.fade = (p.fade || 1) - dt * 2) > 0));
    for (const p of this.weather) { p.y += p.vy * dt; p.ph += dt * 2; p.x += Math.sin(p.ph) * 30 * dpr * dt - speedMul * 10 * dpr * dt; }

    // 空のできごと（気球・飛行機・鳥・イルカ・電車）
    this.nextEvent -= dt;
    if (this.nextEvent <= 0) {
      this.nextEvent = 5 + Math.random() * 5;
      const list = (zone.events && zone.events.length ? zone.events : []);
      if (list.length) this.spawnEvent(list[Math.floor(Math.random() * list.length)]);
    }
    for (const e of this.events) { e.t += dt; if (e.vx) e.x += e.vx * dt; }
    this.events = this.events.filter(e => e.t < (e.dur || 30) && (e.vx ? e.x > -0.4 && e.x < 1.4 : true) && !(e.s != null && e.s - this.track < 1));
  }

  spawnEvent(type) {
    const dir = Math.random() < 0.5 ? 1 : -1;
    if (type === 'balloon') this.events.push({ type, t: 0, x: dir > 0 ? -0.1 : 1.1, vx: dir * 0.025, y: 0.15 + Math.random() * 0.15, c: Math.floor(Math.random() * 3) });
    else if (type === 'plane') this.events.push({ type, t: 0, x: dir > 0 ? -0.15 : 1.15, vx: dir * 0.11, y: 0.06 + Math.random() * 0.08, dir });
    else if (type === 'birds') this.events.push({ type, t: 0, x: dir > 0 ? -0.1 : 1.1, vx: dir * 0.07, y: 0.15 + Math.random() * 0.2, dir });
    else if (type === 'train') this.events.push({ type, t: 0, x: dir > 0 ? -0.35 : 1.35, vx: dir * 0.13, dir });
    else if (type === 'dolphin' && this.camZone.left === 'sea') this.events.push({ type, t: 0, s: this.track + 28 + Math.random() * 12, dur: 20 });
  }

  beginQuestion() {
    this.selected = null;
    this.switchCount = 0;
    this.lastSelectT = null;
    this.chosen = null;
    this.forkZ = this.DEC_Z + this.SPEED * this.T;
    this.setPhase('question', this.T);
    KG.music.setIntensity(1);
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
      this.combo++;
      this.boostT = 1.4;
      KG.audio.correct(this.combo);
      this.burst();
      if ([3, 5, 7, 10].includes(this.combo)) {
        setTimeout(() => KG.audio.comboFanfare(this.combo), 350);
        this.events.push({ type: 'rainbow', t: 0, dur: 7 });
      }
    } else {
      this.combo = 0;
      KG.audio.wrong();
    }
    KG.music.setIntensity(this.combo >= 3 ? 2 : 0);
    this.hud.combo(this.combo);
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
    // 次のエリアを、地平線の向こうから始める
    const n = this.zones.length;
    const zi = Math.min(n - 1, Math.floor((this.idx * n) / this.items.length));
    if (zi !== this.schedZi) {
      this.bounds.push({ s: this.track + this.FAR * 0.95, zi });
      this.schedZi = zi;
    }
    if (this.idx >= this.items.length) {
      this.setPhase('goal', 2.4);
      KG.music.stop(0.4);
      KG.audio.goal();
      this.burst(60);
    } else {
      this.setPhase('cruise', this.GAP - 1);
    }
  }

  burst(n = 34) {
    const cx = this.w / 2, cy = this.h * 0.78;
    const colors = ['#ffd54a', '#ff7eb6', '#7ee0ff', '#9bff7e', '#ffffff', '#ffa94d'];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = (250 + Math.random() * 450) * this.dpr;
      this.particles.push({ x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 450 * this.dpr, life: 0.9 + Math.random() * 0.5, c: colors[i % colors.length], r: (4 + Math.random() * 6) * this.dpr, star: i % 3 === 0 });
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

  edges(z) {
    const roads = this.roadsAt(z);
    let lo = Infinity, hi = -Infinity;
    for (const r of roads) { lo = Math.min(lo, r.cx); hi = Math.max(hi, r.cx); }
    return { roads, left: lo - this.W, right: hi + this.W };
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
    const horizon = h * (0.40 + this.bob);
    const off = -this.camX * 30 * this.dpr - this.track * 0.6 * this.dpr;

    // 空と背景（エリアが変わるときは、ゆっくり重ねて切りかえる）
    const layers = this.skyBlend < 1 ? [[this.skyPrev, 1], [this.skyCur, this.skyBlend]] : [[this.skyCur, 1]];
    for (const [z, a] of layers) { ctx.globalAlpha = a; KG.drawSky(ctx, z, w, horizon, this.clock); }
    ctx.globalAlpha = 1;
    this.drawSkyEvents(horizon, true);
    KG.drawClouds(ctx, w, h, horizon, this.track * 1.5 * this.dpr + this.clock * 6 * this.dpr, this.skyCur.sun);
    this.drawSkyEvents(horizon, false);
    for (const [z, a] of layers) { ctx.globalAlpha = a; KG.drawBackdrop(ctx, z.backdrop, w, h, horizon, off, this.clock); }
    ctx.globalAlpha = 1;
    this.drawTrains(horizon);

    // 地面・道・建物（遠くから手前へ。建物も同じ順番で描いて、重なりを正しくする）
    const objs = this.collectObjects();
    let oi = 0;
    const r = 1.035;
    let zFar = this.FAR;
    let pFar = this.proj(zFar);
    ctx.fillStyle = this.zoneAt(this.track + this.FAR).grass[0];
    ctx.fillRect(0, horizon, w, h - horizon);
    while (oi < objs.length && objs[oi].z > zFar) oi++;
    while (zFar > 1.0) {
      const zNear = Math.max(1.0, zFar / r);
      const pNear = this.proj(zNear);
      this.drawSlice(zFar, zNear, pFar, pNear);
      while (oi < objs.length && objs[oi].z > zNear) { this.drawObject(objs[oi]); oi++; }
      zFar = zNear;
      pFar = pNear;
    }

    if (this.camZone.tunnel) this.drawHeadlights();
    this.drawWeather();
    this.drawSpeedLines(horizon);
    this.drawPuffs();
    this.drawCar();
    for (const p of this.particles) {
      ctx.globalAlpha = Math.min(1, p.life * 2);
      ctx.fillStyle = p.c;
      if (p.star) this.star(p.x, p.y, p.r * 1.6);
      else { ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
  }

  star(x, y, r) {
    const ctx = this.ctx;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.fill();
  }

  // 1枚分の地面（帯）と道
  drawSlice(zF, zN, pF, pN) {
    const ctx = this.ctx, w = this.w;
    const zone = this.zoneAt((zF + zN) / 2 + this.track);
    const stripe = Math.floor((zN + this.track) / 2.2) % 2 === 0;
    ctx.fillStyle = stripe ? zone.grass[0] : zone.grass[1];
    ctx.fillRect(0, pF.y, w, pN.y + 2 - pF.y);

    const eF = this.edges(zF), eN = this.edges(zN);
    // 海・川
    for (const side of ['left', 'right']) {
      const water = zone[side];
      if (!water) continue;
      const margin = zone.bridge ? 0.15 : water === 'sea' ? 2.2 : 2.6;
      const cols = water === 'sea' ? ['#3fa9f5', '#38a0ea'] : ['#5cb8ea', '#52aee0'];
      const wstripe = Math.floor((zN + this.track * 0.6) / 3) % 2 === 0;
      ctx.fillStyle = wstripe ? cols[0] : cols[1];
      const xF = side === 'left' ? this.sx(eF.left - margin, pF.ux) : this.sx(eF.right + margin, pF.ux);
      const xN = side === 'left' ? this.sx(eN.left - margin, pN.ux) : this.sx(eN.right + margin, pN.ux);
      const edge = side === 'left' ? -10 : w + 10;
      ctx.beginPath();
      ctx.moveTo(edge, pF.y); ctx.lineTo(xF, pF.y); ctx.lineTo(xN, pN.y + 1); ctx.lineTo(edge, pN.y + 1);
      ctx.fill();
    }

    // 道
    const dark = zone.tunnel;
    for (const rf of eF.roads) {
      const rn = eN.roads.find(x => x.kind === rf.kind) || (rf.kind !== 'main' ? eN.roads.find(x => x.kind === 'main') : eN.roads[0]);
      if (!rn) continue;
      this.quad(rf.cx, rn.cx, this.W * 1.12, pF, pN, stripe ? (dark ? '#9a9aa2' : '#ffffff') : '#ff5a4f');
      this.quad(rf.cx, rn.cx, this.W, pF, pN, dark ? (stripe ? '#4b4d55' : '#46484f') : (stripe ? '#6b6f7a' : '#646873'));
      if (rf.kind === 'main' && stripe && eF.roads.length === 1) this.quad(rf.cx, rn.cx, 0.04, pF, pN, '#fff7c2');
    }

    // 橋の手すり
    if (zone.bridge) {
      this.wallStrip(eF.left - 0.1, eN.left - 0.1, pF, pN, 0.45, '#d5dbe3');
      this.wallStrip(eF.right + 0.1, eN.right + 0.1, pF, pN, 0.45, '#d5dbe3');
    }
    // トンネルのかべと天井
    if (zone.tunnel) {
      const H = 2.6;
      const lF = this.sx(eF.left - 0.35, pF.ux), lN = this.sx(eN.left - 0.35, pN.ux);
      const rF = this.sx(eF.right + 0.35, pF.ux), rN = this.sx(eN.right + 0.35, pN.ux);
      const cF = pF.y - H * pF.uy, cN = pN.y - H * pN.uy;
      // 選ばなかった道が消えるところでは、かべが横に引きのばされないように描かない
      const okL = Math.abs(eF.left - eN.left) < 0.8, okR = Math.abs(eF.right - eN.right) < 0.8;
      ctx.fillStyle = '#2a2830';
      if (okL) ctx.fillRect(-10, cN, lN + 10, pN.y + 2 - cN);
      if (okR) ctx.fillRect(rN, cN, w - rN + 10, pN.y + 2 - cN);
      ctx.fillStyle = '#2b2a31';
      ctx.beginPath(); ctx.moveTo(lF, cF); ctx.lineTo(rF, cF); ctx.lineTo(rN, cN); ctx.lineTo(lN, cN); ctx.fill();
      ctx.fillStyle = stripe ? '#5a5864' : '#514f5a';
      if (okL) { ctx.beginPath(); ctx.moveTo(lF, pF.y); ctx.lineTo(lF, cF); ctx.lineTo(lN, cN); ctx.lineTo(lN, pN.y + 1); ctx.fill(); }
      if (okR) { ctx.beginPath(); ctx.moveTo(rF, pF.y); ctx.lineTo(rF, cF); ctx.lineTo(rN, cN); ctx.lineTo(rN, pN.y + 1); ctx.fill(); }
    }

    // 決定ライン
    if (this.phase === 'question' && this.forkZ != null) {
      const lz = this.forkZ - this.LINE;
      if (lz <= zF && lz > zN) {
        const p = this.proj(lz);
        const half = this.W * p.ux, x = this.sx(0, p.ux);
        const cell = Math.max(4, half / 6);
        for (let i = -6; i < 6; i++) {
          ctx.fillStyle = (i % 2 === 0) ? '#ffffff' : '#222';
          ctx.fillRect(x + i * cell, p.y - cell * 0.5, cell, cell * 0.6);
        }
      }
    }
  }

  wallStrip(xF, xN, pF, pN, height, color) {
    const ctx = this.ctx;
    const aF = this.sx(xF, pF.ux), aN = this.sx(xN, pN.ux);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(aF, pF.y); ctx.lineTo(aF, pF.y - height * pF.uy); ctx.lineTo(aN, pN.y - height * pN.uy); ctx.lineTo(aN, pN.y + 1);
    ctx.fill();
  }

  quad(cxF, cxN, half, pF, pN, color) {
    const ctx = this.ctx;
    const xF = this.sx(cxF, pF.ux), xN = this.sx(cxN, pN.ux);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(xF - half * pF.ux, pF.y);
    ctx.lineTo(xF + half * pF.ux, pF.y);
    ctx.lineTo(xN + half * pN.ux, pN.y + 2);
    ctx.lineTo(xN - half * pN.ux, pN.y + 2);
    ctx.closePath();
    ctx.fill();
  }

  // 見えている範囲の建物・木・看板などを、遠い順に並べる
  collectObjects() {
    const out = [];
    const SP = this.SP;
    const k0 = Math.floor((this.track + this.FAR) / SP), k1 = Math.ceil((this.track + 1.05) / SP);
    for (let k = k0; k >= k1; k--) {
      const s = k * SP, z = s - this.track;
      const zone = this.zoneAt(s);
      if (zone.tunnel) {
        if (k % 2 === 0) { out.push({ z, kind: 'tlight', side: -1 }); out.push({ z, kind: 'tlight', side: 1 }); }
        continue;
      }
      for (const side of [-1, 1]) {
        const water = zone[side < 0 ? 'left' : 'right'];
        if (water) {
          if (zone.objects.boat && KG.rnd(k, 40 + side) > 0.55) out.push({ z, kind: 'boat', side, r: KG.rnd(k, 41 + side), gap: (zone.bridge ? 0.6 : water === 'sea' ? 2.2 : 2.6) + 1.8 });
          continue;
        }
        if (KG.rnd(k, 5 + side) < 0.12) continue;
        const kind = KG.pickWeighted(zone.objects, KG.rnd(k, side > 0 ? 1 : 2));
        if (!kind || kind === 'boat') continue;
        const big = kind === 'building' || kind === 'container' || kind === 'lighthouse' || kind === 'windmill';
        out.push({ z, kind, side, r: KG.rnd(k, 9 + side), gap: (big ? 1.6 : 0.8) + KG.rnd(k, 3 + side) * 1.4, zone });
      }
      // 分かれた道のあいだ
      if (this.forkZ != null && z > this.forkZ + this.L * 0.8 && k % 2 === 0 && (this.phase === 'question' || this.phase === 'after')) {
        out.push({ z, kind: 'center', r: KG.rnd(k, 77), zone });
      }
    }
    // トンネルの入口
    for (const b of this.bounds) {
      if (this.zones[b.zi].tunnel) {
        const z = b.s - this.track;
        if (z > 1.05 && z < this.FAR) out.push({ z, kind: 'portal' });
      }
    }
    for (const e of this.events) if (e.type === 'dolphin') out.push({ z: e.s - this.track, kind: 'dolphin', ev: e, side: -1, r: 0.5 });
    if ((this.phase === 'question' || this.phase === 'after') && this.forkZ != null) out.push({ z: this.forkZ + 2.5, kind: 'signs' });
    out.sort((a, b) => b.z - a.z);
    return out;
  }

  drawObject(o) {
    if (o.z < 1.05) return;
    const ctx = this.ctx;
    const p = this.proj(o.z);
    const u = p.uy;
    if (o.kind === 'signs') return this.drawSigns(o.z);
    const e = this.edges(o.z);
    if (o.kind === 'portal') return this.drawPortal(o.z, p, e);
    if (o.kind === 'tlight') {
      const x = o.side < 0 ? e.left - 0.3 : e.right + 0.3;
      return KG.OBJ.tlight(ctx, this.sx(x, p.ux), p.y - 2.2 * u, u);
    }
    if (o.kind === 'center') {
      const kind = o.zone.objects.flowers ? 'flowers' : o.zone.objects.snowpine ? 'snowpine' : o.zone.objects.palm ? 'palm' : 'tree';
      const x = (e.roads[0].cx + e.roads[e.roads.length - 1].cx) / 2;
      return KG.OBJ[kind](ctx, this.sx(x, p.ux), p.y, u, o.r, this.clock, false);
    }
    if (o.kind === 'dolphin') {
      const x = e.left - 7;
      return KG.OBJ.dolphin(ctx, this.sx(x, p.ux), p.y, u, 0.5, this.clock, false, o.ev);
    }
    const x = o.side < 0 ? e.left - o.gap : e.right + o.gap;
    const X = this.sx(x, p.ux);
    if (X < -u * 4 || X > this.w + u * 4) return;
    const fn = KG.OBJ[o.kind];
    if (fn) fn(ctx, X, p.y, u, o.r, this.clock, !!(o.zone && o.zone.sun));
  }

  drawPortal(z, p, e) {
    const ctx = this.ctx;
    const u = p.uy;
    const l = this.sx(e.left - 0.35, p.ux), r = this.sx(e.right + 0.35, p.ux), top = p.y - 2.6 * u;
    const L = this.sx(-40, p.ux), R = this.sx(40, p.ux);
    // 山の形に、入口の穴をあける
    ctx.fillStyle = '#5f8f55';
    ctx.beginPath();
    ctx.moveTo(L, p.y);
    ctx.lineTo(L, p.y - 4 * u);
    ctx.lineTo((L + l) / 2, p.y - 9 * u);
    ctx.lineTo((l + r) / 2, p.y - 6 * u);
    ctx.lineTo((r + R) / 2, p.y - 10 * u);
    ctx.lineTo(R, p.y - 4 * u);
    ctx.lineTo(R, p.y);
    ctx.closePath();
    ctx.moveTo(l, p.y); ctx.lineTo(r, p.y); ctx.lineTo(r, top); ctx.lineTo(l, top); ctx.closePath();
    ctx.fill('evenodd');
    // コンクリートのわく
    ctx.fillStyle = '#a7adb5';
    const f = 0.35 * u;
    ctx.beginPath();
    ctx.moveTo(l - f, p.y); ctx.lineTo(l - f, top - f); ctx.lineTo(r + f, top - f); ctx.lineTo(r + f, p.y); ctx.closePath();
    ctx.moveTo(l, p.y); ctx.lineTo(r, p.y); ctx.lineTo(r, top); ctx.lineTo(l, top); ctx.closePath();
    ctx.fill('evenodd');
    if (u > 6) {
      ctx.fillStyle = '#1f8a4c';
      KG.rr(ctx, (l + r) / 2 - u * 1.1, top - f - u * 0.65, u * 2.2, u * 0.55, u * 0.08);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${u * 0.36}px ${KG.FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('トンネル', (l + r) / 2, top - f - u * 0.37);
    }
  }

  drawSigns(z) {
    const it = this.item;
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
      KG.rr(ctx, cx - bw / 2, bottom - bh, bw, bh, bh * 0.15);
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

  // 空のできごと。behind=true は雲より奥（虹）
  drawSkyEvents(horizon, behind) {
    const ctx = this.ctx, w = this.w;
    for (const e of this.events) {
      if (behind !== (e.type === 'rainbow')) continue;
      if (e.type === 'rainbow') {
        const a = Math.min(1, e.t / 1.2, (e.dur - e.t) / 1.5) * 0.55;
        if (a <= 0) continue;
        ctx.globalAlpha = a;
        const cols = ['#ff4d4d', '#ff9f43', '#ffe14d', '#4cd964', '#4da6ff', '#7d5fff'];
        const R = w * 0.42, band = horizon * 0.035;
        cols.forEach((c, i) => {
          ctx.strokeStyle = c;
          ctx.lineWidth = band;
          ctx.beginPath(); ctx.arc(w / 2, horizon + R * 0.35, R - i * band, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
        });
        ctx.globalAlpha = 1;
      } else if (e.type === 'balloon') {
        const x = e.x * w, y = e.y * horizon + Math.sin(e.t) * 6 * this.dpr, r = horizon * 0.06;
        const cs = [['#ff5a4f', '#ffd54a'], ['#3d8bff', '#ffffff'], ['#33c27a', '#ff7eb6']][e.c];
        for (let i = 0; i < 5; i++) {
          ctx.fillStyle = cs[i % 2];
          ctx.beginPath(); ctx.ellipse(x, y, r * (1 - i * 0.2), r * 1.15, 0, 0, Math.PI * 2); ctx.fill();
        }
        ctx.strokeStyle = '#7a5a3a'; ctx.lineWidth = 1.5 * this.dpr;
        ctx.beginPath(); ctx.moveTo(x - r * 0.5, y + r * 0.9); ctx.lineTo(x - r * 0.25, y + r * 1.6); ctx.moveTo(x + r * 0.5, y + r * 0.9); ctx.lineTo(x + r * 0.25, y + r * 1.6); ctx.stroke();
        ctx.fillStyle = '#9a6b3c';
        ctx.fillRect(x - r * 0.3, y + r * 1.55, r * 0.6, r * 0.4);
      } else if (e.type === 'plane') {
        const x = e.x * w, y = e.y * horizon, s = horizon * 0.03;
        ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = s * 0.35;
        ctx.beginPath(); ctx.moveTo(x - e.dir * s * 1.2, y); ctx.lineTo(x - e.dir * w * 0.35, y); ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.ellipse(x, y, s * 1.6, s * 0.35, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#d8e2ee';
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - e.dir * s * 0.6, y - s * 1.1); ctx.lineTo(x - e.dir * s * 0.1, y); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x - e.dir * s * 1.3, y); ctx.lineTo(x - e.dir * s * 1.6, y - s * 0.8); ctx.lineTo(x - e.dir * s * 1.1, y); ctx.fill();
      } else if (e.type === 'birds') {
        ctx.strokeStyle = '#3b4252'; ctx.lineWidth = 2 * this.dpr;
        for (let i = 0; i < 5; i++) {
          const x = e.x * w - e.dir * Math.abs(i - 2) * 22 * this.dpr, y = e.y * horizon + Math.abs(i - 2) * 12 * this.dpr + i * 2;
          const f = Math.sin(e.t * 10 + i) * 5 * this.dpr, s = 9 * this.dpr;
          ctx.beginPath(); ctx.moveTo(x - s, y - f); ctx.quadraticCurveTo(x - s * 0.4, y - s * 0.4, x, y); ctx.quadraticCurveTo(x + s * 0.4, y - s * 0.4, x + s, y - f); ctx.stroke();
        }
      }
    }
  }

  drawTrains(horizon) {
    const ctx = this.ctx, w = this.w, h = this.h;
    for (const e of this.events) {
      if (e.type !== 'train') continue;
      const y = horizon - h * 0.045, ch = h * 0.028, cw = h * 0.1;
      ctx.fillStyle = '#7d8590';
      ctx.fillRect(0, y + ch, w, h * 0.006);
      for (let i = 0; i < 5; i++) {
        const x = e.x * w - e.dir * i * (cw + 3);
        ctx.fillStyle = i === 0 ? '#2e9e5b' : '#ffffff';
        KG.rr(ctx, x - cw / 2, y, cw, ch, ch * 0.3);
        ctx.fill();
        ctx.fillStyle = '#2e9e5b';
        ctx.fillRect(x - cw / 2, y + ch * 0.62, cw, ch * 0.18);
        ctx.fillStyle = '#9ad3ff';
        for (let j = 0; j < 4; j++) ctx.fillRect(x - cw * 0.4 + j * cw * 0.22, y + ch * 0.18, cw * 0.14, ch * 0.32);
      }
    }
  }

  drawHeadlights() {
    const ctx = this.ctx, w = this.w, h = this.h;
    const horizon = h * 0.4;
    ctx.fillStyle = 'rgba(255,240,180,0.12)';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(w / 2 + s * w * 0.05, h * 0.88);
      ctx.lineTo(w / 2 + s * w * 0.02, horizon + h * 0.05);
      ctx.lineTo(w / 2 + s * w * 0.16, horizon + h * 0.05);
      ctx.fill();
    }
  }

  drawWeather() {
    const ctx = this.ctx;
    for (const p of this.weather) {
      ctx.globalAlpha = p.fade == null ? 1 : Math.max(0, p.fade);
      if (p.kind === 'snow') {
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(255,170,200,0.9)';
        ctx.beginPath(); ctx.ellipse(p.x, p.y, p.s, p.s * 0.55, p.ph, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  // スピード線（正解でブーストしたとき）
  drawSpeedLines(horizon) {
    if (this.boostT <= 0) return;
    const ctx = this.ctx, w = this.w, h = this.h;
    const a = Math.min(1, this.boostT / 0.6);
    ctx.strokeStyle = `rgba(255,255,255,${0.55 * a})`;
    ctx.lineWidth = 3 * this.dpr;
    for (let i = 0; i < 22; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r0 = h * (0.3 + Math.random() * 0.2), r1 = r0 + h * (0.15 + Math.random() * 0.25);
      const cx = w / 2, cy = horizon;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * r0 * 1.4, cy + Math.sin(ang) * r0);
      ctx.lineTo(cx + Math.cos(ang) * r1 * 1.4, cy + Math.sin(ang) * r1);
      ctx.stroke();
    }
  }

  drawPuffs() {
    const ctx = this.ctx;
    for (const p of this.puffs) {
      const t = 1 - p.life / p.max;
      ctx.globalAlpha = (1 - t) * (p.fire ? 0.85 : 0.35);
      ctx.fillStyle = p.fire ? (t < 0.3 ? '#fff3b0' : t < 0.6 ? '#ffb347' : '#7ee0ff') : '#d9dde3';
      ctx.beginPath(); ctx.arc(p.x, p.y, (4 + t * 16) * this.dpr, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawCar() {
    const ctx = this.ctx, w = this.w, h = this.h;
    const cw = Math.min(w * 0.2, h * 0.28), ch = cw * 0.62;
    const bounce = this.shake ? Math.sin(this.clock * 18) * ch * 0.01 * (this.speedMul || 0) : 0;
    const x = w / 2, y = h - ch * 0.35 - h * 0.03 + bounce;
    const color = (KG.CAR_COLORS.find(c => c.id === KG.state.carColor) || KG.CAR_COLORS[0]).color;
    const rr = (a, b, c, d, e) => KG.rr(ctx, a, b, c, d, e);

    // れんぞく正解のオーラ
    if (this.combo >= 5) {
      const g = ctx.createRadialGradient(x, y, cw * 0.2, x, y, cw * 0.9);
      const hue = (this.clock * 120) % 360;
      g.addColorStop(0, `hsla(${hue},100%,70%,0.45)`);
      g.addColorStop(1, `hsla(${hue},100%,70%,0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(x, y, cw * 0.9, ch * 0.9, 0, 0, Math.PI * 2); ctx.fill();
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.carTilt * 0.08);
    // かげ
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(0, ch * 0.44, cw * 0.58, ch * 0.12, 0, 0, Math.PI * 2); ctx.fill();
    // タイヤ
    ctx.fillStyle = '#222';
    rr(-cw * 0.52, ch * 0.02, cw * 0.2, ch * 0.42, ch * 0.06); ctx.fill();
    rr(cw * 0.32, ch * 0.02, cw * 0.2, ch * 0.42, ch * 0.06); ctx.fill();
    ctx.fillStyle = '#9aa0a8';
    ctx.fillRect(-cw * 0.47, ch * 0.18, cw * 0.1, ch * 0.08);
    ctx.fillRect(cw * 0.37, ch * 0.18, cw * 0.1, ch * 0.08);
    // 車体
    const body = ctx.createLinearGradient(0, -ch * 0.3, 0, ch * 0.4);
    body.addColorStop(0, '#ffffff');
    body.addColorStop(0.08, color);
    body.addColorStop(1, color);
    ctx.fillStyle = body;
    rr(-cw * 0.5, -ch * 0.25, cw, ch * 0.62, ch * 0.2); ctx.fill();
    ctx.fillStyle = color;
    rr(-cw * 0.35, -ch * 0.64, cw * 0.7, ch * 0.48, ch * 0.2); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    rr(-cw * 0.5, ch * 0.18, cw, ch * 0.19, ch * 0.1); ctx.fill();
    // 窓（光の反射つき）
    ctx.fillStyle = '#a9dcff';
    rr(-cw * 0.28, -ch * 0.57, cw * 0.56, ch * 0.32, ch * 0.1); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath(); ctx.moveTo(-cw * 0.2, -ch * 0.55); ctx.lineTo(-cw * 0.08, -ch * 0.55); ctx.lineTo(-cw * 0.2, -ch * 0.28); ctx.lineTo(-cw * 0.27, -ch * 0.28); ctx.fill();
    // ウイング
    ctx.fillStyle = '#2b2d42';
    rr(-cw * 0.46, -ch * 0.36, cw * 0.92, ch * 0.09, ch * 0.04); ctx.fill();
    ctx.fillRect(-cw * 0.3, -ch * 0.28, cw * 0.05, ch * 0.08);
    ctx.fillRect(cw * 0.25, -ch * 0.28, cw * 0.05, ch * 0.08);
    // テールランプ（光る）
    for (const s of [-1, 1]) {
      const lx = s * cw * 0.36;
      const g = ctx.createRadialGradient(lx, -ch * 0.06, 0, lx, -ch * 0.06, cw * 0.14);
      g.addColorStop(0, 'rgba(255,80,80,0.9)');
      g.addColorStop(1, 'rgba(255,80,80,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(lx, -ch * 0.06, cw * 0.14, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff3b3b';
      rr(lx - cw * 0.08, -ch * 0.12, cw * 0.16, ch * 0.12, ch * 0.05); ctx.fill();
    }
    // ナンバー
    ctx.fillStyle = '#ffffff';
    rr(-cw * 0.14, ch * 0.07, cw * 0.28, ch * 0.14, ch * 0.03); ctx.fill();
    ctx.fillStyle = '#333';
    ctx.font = `bold ${ch * 0.11}px ${KG.FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('かんじ', 0, ch * 0.145);
    ctx.restore();
  }
};

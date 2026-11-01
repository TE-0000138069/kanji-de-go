// ピットイン：なぞり書き → 何も見ずに書く
// 判定は、お手本の字の形に、書いた線がどれだけ重なっているかで行う（ゆるめの判定）
window.KG = window.KG || {};

KG.WritePad = class {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.strokes = [];
    this.cur = null;
    this.guide = null;      // なぞり書きのときのお手本の字
    this.reveal = null;     // 書いた後に重ねて見せる字
    this.resize();
    const pos = e => {
      const r = canvas.getBoundingClientRect();
      return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
    };
    canvas.addEventListener('pointerdown', e => {
      if (this.locked) return;
      canvas.setPointerCapture(e.pointerId);
      this.cur = [pos(e)];
      this.strokes.push(this.cur);
      this.draw();
    });
    canvas.addEventListener('pointermove', e => {
      if (!this.cur) return;
      this.cur.push(pos(e));
      this.draw();
    });
    const end = () => { this.cur = null; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    this.draw();
  }

  clear() { this.strokes = []; this.reveal = null; this.locked = false; this.draw(); }

  drawChar(ctx, ch, size, color) {
    ctx.fillStyle = color;
    ctx.font = `${size * 0.82}px ${KG.FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ch, size / 2, size / 2 + size * 0.03);
  }

  draw() {
    const { ctx, canvas } = this;
    const s = canvas.width;
    ctx.clearRect(0, 0, s, s);
    ctx.fillStyle = '#fffdf6';
    ctx.fillRect(0, 0, s, s);
    // 十字の補助線
    ctx.strokeStyle = '#f0b9a8';
    ctx.lineWidth = Math.max(1, s * 0.004);
    ctx.setLineDash([s * 0.02, s * 0.02]);
    ctx.beginPath();
    ctx.moveTo(s / 2, 0); ctx.lineTo(s / 2, s);
    ctx.moveTo(0, s / 2); ctx.lineTo(s, s / 2);
    ctx.stroke();
    ctx.setLineDash([]);
    if (this.guide) this.drawChar(ctx, this.guide, s, 'rgba(120,140,170,0.28)');
    if (this.reveal) this.drawChar(ctx, this.reveal, s, 'rgba(255,90,79,0.35)');
    this.drawInk(ctx, s, '#222', 0.045);
  }

  drawInk(ctx, s, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = s * width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const st of this.strokes) {
      ctx.beginPath();
      st.forEach(([x, y], i) => (i ? ctx.lineTo(x * s, y * s) : ctx.moveTo(x * s, y * s)));
      if (st.length === 1) ctx.lineTo(st[0][0] * s + 0.5, st[0][1] * s);
      ctx.stroke();
    }
  }

  // 判定：{ coverage: お手本のうち書けた割合, outside: はみ出した割合 }
  score(ch) {
    const N = 96;
    const mk = () => { const c = document.createElement('canvas'); c.width = c.height = N; return c.getContext('2d'); };
    const g = mk(), gd = mk(), ink = mk();
    this.drawChar(g, ch, N, '#000');
    // はみ出しの判定用に、お手本を太らせた形
    for (const [dx, dy] of [[0, 0], [4, 0], [-4, 0], [0, 4], [0, -4], [3, 3], [-3, 3], [3, -3], [-3, -3]]) {
      gd.save();
      gd.translate(dx, dy);
      this.drawChar(gd, ch, N, '#000');
      gd.restore();
    }
    this.drawInk(ink, N, '#000', 0.09);
    const a = g.getImageData(0, 0, N, N).data;
    const b = gd.getImageData(0, 0, N, N).data;
    const c = ink.getImageData(0, 0, N, N).data;
    let glyph = 0, covered = 0, inkN = 0, out = 0;
    for (let i = 3; i < a.length; i += 4) {
      const isG = a[i] > 100, isI = c[i] > 100;
      if (isG) { glyph++; if (isI) covered++; }
      if (isI) { inkN++; if (b[i] < 20) out++; }
    }
    return { coverage: glyph ? covered / glyph : 0, outside: inkN ? out / inkN : 1, inkN };
  }
};

// ピットインの進行
KG.Pitin = class {
  constructor(root, chars, onDone) {
    this.root = root;
    this.chars = chars;
    this.onDone = onDone;
    this.i = 0;
    this.pad = new KG.WritePad(root.querySelector('#pad'));
    this.msg = root.querySelector('#pitinMsg');
    this.big = root.querySelector('#pitinChar');
    this.count = root.querySelector('#pitinCount');
    this.btnCheck = root.querySelector('#pitinCheck');
    this.btnClear = root.querySelector('#pitinClear');
    this.btnNext = root.querySelector('#pitinNext');
    this.btnCheck.onclick = () => this.check();
    this.btnClear.onclick = () => this.pad.clear();
    this.btnNext.onclick = () => this.next();
    root.querySelector('#pitinSkip').onclick = () => this.finish();
    this.start();
  }

  get ch() { return this.chars[this.i]; }

  start() {
    this.step = 'trace';
    this.tries = 0;
    this.count.textContent = `${this.i + 1} / ${this.chars.length}`;
    this.big.textContent = this.ch;
    this.big.style.visibility = 'visible';
    this.pad.guide = this.ch;
    this.pad.clear();
    this.btnNext.hidden = true;
    this.btnCheck.hidden = false;
    this.say('うすい字を なぞってみよう');
  }

  say(t) { this.msg.textContent = t; }

  check() {
    const sc = this.pad.score(this.ch);
    if (sc.inkN < 30) { this.say('もうすこし かいてみよう'); return; }
    if (this.step === 'trace') {
      if (sc.coverage >= 0.5 && sc.outside <= 0.35) {
        KG.audio.correct();
        this.step = 'blind';
        this.tries = 0;
        this.big.style.visibility = 'hidden';
        this.pad.guide = null;
        this.pad.clear();
        this.say('こんどは みないで かいてみよう！');
      } else {
        KG.audio.wrong();
        this.say('うすい字の 上を ていねいに なぞろう');
        this.pad.clear();
      }
      return;
    }
    // 何も見ずに書くテスト
    const pass = sc.coverage >= 0.38 && sc.outside <= 0.45;
    this.pad.reveal = this.ch;
    this.pad.locked = true;
    this.pad.draw();
    this.big.style.visibility = 'visible';
    this.tries++;
    if (pass) {
      KG.audio.correct();
      KG.recordWrite(this.ch, true);
      this.say('すごい！ かけたね！ ⭕');
      this.showNext();
    } else if (this.tries < 2) {
      KG.audio.wrong();
      this.say('あかい字と くらべてみよう。もういちど！');
      setTimeout(() => {
        this.pad.clear();
        this.big.style.visibility = 'hidden';
      }, 1800);
    } else {
      KG.recordWrite(this.ch, false);
      this.say('つぎは かけるよ！ あかい字を よく みておこう');
      this.showNext();
    }
  }

  showNext() {
    this.btnCheck.hidden = true;
    this.btnNext.hidden = false;
    this.btnNext.textContent = this.i + 1 < this.chars.length ? 'つぎの字へ' : 'おわり';
  }

  next() {
    this.i++;
    if (this.i >= this.chars.length) this.finish();
    else this.start();
  }

  finish() {
    KG.save();
    this.onDone();
  }
};

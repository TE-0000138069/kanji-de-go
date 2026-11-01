// 画面の切り替えと、各画面の動き
window.KG = window.KG || {};

KG.load();
KG.FONT = getComputedStyle(document.documentElement).getPropertyValue('--font').trim() || 'sans-serif';
KG.state.settings.tiltInvert = !!KG.state.settings.tiltInvert;

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const stars = (n, max = 3) => '★'.repeat(n) + '<span class="off">' + '★'.repeat(max - n) + '</span>';

const ui = { course: 'machi', zukanCourse: 'machi', parentTab: 'report', current: null, drive: null, sessionPlay: 0 };

function applyTextSize() {
  document.documentElement.style.setProperty('--ts', KG.state.settings.textSize);
}

function toast(msg, ms = 2200) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('on'), ms);
}

function show(id, ...args) {
  $$('.screen').forEach(s => s.classList.remove('on'));
  $('#scr-' + id).classList.add('on');
  ui.current = id;
  const r = renderers[id];
  if (r) r(...args);
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-go]');
  if (!b) return;
  KG.audio.unlock();
  const go = b.dataset.go;
  $('#limitModal').hidden = true;
  if (go === 'start') show(KG.state.profile ? 'home' : 'setup');
  else show(go);
});

// ---------------- 各画面 ----------------
const renderers = {
  setup() {
    $$('#setupGrade button').forEach(b => {
      b.onclick = () => { $$('#setupGrade button').forEach(x => x.classList.remove('on')); b.classList.add('on'); };
    });
    $('#setupOk').onclick = () => {
      const name = $('#setupName').value.trim() || 'ドライバー';
      const grade = +($('#setupGrade .on') || { dataset: { v: 2 } }).dataset.v;
      KG.state.profile = { nickname: name, grade };
      KG.state.settings.control = 'tap'; // 傾け操作は、設定画面で許可してから使う
      KG.save();
      show('home');
    };
  },

  home() {
    const p = KG.state.profile;
    $('#homeHello').textContent = `${p.nickname} さん、どこへ いく？`;
    $('#homeStars').textContent = `⭐ ${KG.totalStars()}`;
    $('#homeMastered').textContent = `📖 おぼえた字 ${KG.allChars.filter(KG.isMastered).length} / ${KG.allChars.length}`;
    $('#limitModal').hidden = !KG.overTimeLimit();
  },

  map() {
    const tabs = $('#courseTabs');
    tabs.innerHTML = KG.courses.map(c => `<button data-c="${c.id}" class="${c.id === ui.course ? 'on' : ''}">${c.emoji} ${c.name}</button>`).join('');
    tabs.querySelectorAll('button').forEach(b => (b.onclick = () => { ui.course = b.dataset.c; renderers.map(); }));
    const course = KG.courses.find(c => c.id === ui.course);
    let html = '';
    const custom = KG.state.parent.customKanji.filter(c => KG.kanji[c]);
    if (custom.length) {
      html += `<button class="stage custom" data-kind="custom"><span class="num">🏠</span>おうちの人コース<span class="chars">${esc(custom.slice(0, 6).join(''))}${custom.length > 6 ? '…' : ''}</span></button>`;
    }
    course.stages.forEach((chars, i) => {
      const open = KG.isStageOpen(course.id, i);
      const rec = KG.state.stages[KG.stageId(course.id, i)];
      html += `<button class="stage ${open ? '' : 'locked'}" data-kind="normal" data-i="${i}" ${open ? '' : 'disabled'}>
        <span class="num">${open ? i + 1 : '🔒'}</span>
        <span class="chars">${open ? esc(chars.join('')) : ''}</span>
        <span class="st">${rec ? '★'.repeat(rec.stars) + '☆'.repeat(3 - rec.stars) : '☆☆☆'}</span></button>`;
    });
    const weakN = KG.allChars.filter(KG.isWeak).length;
    html += `<button class="stage boss" data-kind="weak"><span class="num">🌀</span>にがてトンネル<span class="chars">にがてな字 ${weakN}こ</span></button>`;
    $('#mapBody').innerHTML = html;
    $$('#mapBody .stage').forEach(b => {
      b.onclick = () => {
        const kind = b.dataset.kind;
        if (kind === 'normal') startDrive({ kind, id: KG.stageId(course.id, +b.dataset.i), course, chars: course.stages[+b.dataset.i] });
        else if (kind === 'weak') startDrive({ kind, id: `${course.id}-boss`, course, chars: [] });
        else startDrive({ kind, id: 'custom', course, chars: custom });
      };
    });
  },

  result(data) {
    const { results, elapsed, starsN, isBest, noMiss } = data;
    const correct = results.filter(r => r.result === 'correct').length;
    $('#resTitle').textContent = noMiss ? 'ノーミス ゴール！' : 'ゴール！';
    $('#resStars').innerHTML = stars(starsN);
    $('#resCorrect').textContent = `${correct} / ${results.length}`;
    $('#resTime').textContent = `${elapsed.toFixed(1)}びょう`;
    const bonus = [];
    if (noMiss) bonus.push('✨ ノーミスボーナス！');
    if (isBest) bonus.push('🏁 じこベスト こうしん！');
    $('#resBonus').textContent = bonus.join('　');
    $('#resList').innerHTML = results.map(r => {
      const mark = r.result === 'correct' ? (r.hesitated ? '🤔' : '⭕') : '❌';
      return `<span>${mark} ${esc(r.q.kanji)}</span>`;
    }).join('');
    const missed = results.filter(r => r.result !== 'correct' || r.hesitated).map(r => r.q.kanji);
    const pit = KG.pickPitinChars(missed);
    $('#resNext').textContent = pit.length ? '🔧 ピットインへ' : '⛽ スタンドへ';
    $('#resNext').onclick = () => (pit.length ? show('pitin', pit) : show('stamp', true));
  },

  pitin(chars) {
    new KG.Pitin($('#scr-pitin'), chars, () => show('stamp', true));
  },

  stamp(fresh) {
    const n = KG.state.stamps.length;
    const card = $('#stampCard');
    const inCard = n === 0 ? 0 : ((n - 1) % 10) + 1;
    card.innerHTML = Array.from({ length: 10 }, (_, i) =>
      `<div class="${i < inCard ? 'got' : ''} ${fresh && i === inCard - 1 ? 'new' : ''}">${i < inCard ? '⛽' : ''}</div>`).join('');
    $('#stampMsg').textContent = fresh ? `スタンプ ゲット！ ぜんぶで ${n}こ` : `あつめた スタンプ：${n}こ`;
    if (fresh) KG.audio.stamp();
    $('#stampToMap').hidden = !fresh;
  },

  zukan() {
    const tabs = $('#zukanTabs');
    tabs.innerHTML = KG.courses.map(c => `<button data-c="${c.id}" class="${c.id === ui.zukanCourse ? 'on' : ''}">${c.emoji} ${c.name}</button>`).join('');
    tabs.querySelectorAll('button').forEach(b => (b.onclick = () => { ui.zukanCourse = b.dataset.c; renderers.zukan(); }));
    const course = KG.courses.find(c => c.id === ui.zukanCourse);
    $('#zukanCount').textContent = `おぼえた字 ${KG.allChars.filter(KG.isMastered).length}`;
    $('#zukanGrid').innerHTML = course.chars.map(ch => {
      const s = KG.starsOf(ch);
      const seen = KG.state.progress[ch] && KG.state.progress[ch].read.seen;
      return `<div class="zcell ${seen ? '' : 'unseen'} ${KG.isWeak(ch) ? 'weak' : ''}" data-k="${esc(ch)}"><span class="k">${seen ? esc(ch) : '？'}</span><span class="s">${'★'.repeat(s)}${'☆'.repeat(3 - s)}</span></div>`;
    }).join('');
    $$('#zukanGrid .zcell').forEach(c => (c.onclick = () => {
      const ch = c.dataset.k;
      if (!KG.state.progress[ch] || !KG.state.progress[ch].read.seen) { toast('まだ であっていない字だよ'); return; }
      const q = KG.qByKanji[ch][0];
      toast(q.text.replace(/\{(.+?)\}/, `$1（${q.correct}）`), 3000);
      KG.audio.speak(q.text.replace(/\{(.+?)\}/, q.correct));
    }));
  },

  garage() {
    const total = KG.totalStars();
    $('#garageStars').textContent = `⭐ ${total}`;
    $('#garageList').innerHTML = KG.CAR_COLORS.map(c => {
      const locked = total < c.stars;
      return `<button class="garage-item ${KG.state.carColor === c.id ? 'sel' : ''} ${locked ? 'locked' : ''}" data-id="${c.id}" ${locked ? 'disabled' : ''}>
        <span class="sw" style="background:${c.color}"></span>${c.name}<small>${locked ? `⭐${c.stars}で ひらく` : KG.state.carColor === c.id ? 'のっている' : ''}</small></button>`;
    }).join('');
    $$('#garageList .garage-item').forEach(b => (b.onclick = () => { KG.state.carColor = b.dataset.id; KG.save(); renderers.garage(); }));
  },

  settings() {
    const s = KG.state.settings;
    const rows = [
      { key: 'control', label: 'そうさ', opts: [['tap', 'タップ'], ['tilt', 'かたむける']], sub: 'タップ：がめんの ひだり・みぎを さわる　かたむける：iPadを ハンドルのように まわす' },
      { key: 'tiltInvert', label: 'かたむける むきを はんたいにする', opts: [[false, 'しない'], [true, 'する']] },
      { key: 'oneHand', label: 'かたてボタン', opts: [[false, 'なし'], [true, 'あり']], sub: 'おすたびに ひだり・みぎが いれかわる ボタン' },
      { key: 'hand', label: 'かたてボタンの ばしょ', opts: [['left', 'ひだり'], ['right', 'みぎ']] },
      { key: 'slow', label: 'ゆっくりモード', opts: [[false, 'なし'], [true, 'あり']], sub: 'わかれみちの てまえで とまって まってくれる' },
      { key: 'grade', label: 'なんねんせい？（はやさが かわるよ）', opts: [1, 2, 3, 4, 5, 6].map(g => [g, String(g)]) },
      { key: 'se', label: 'こうかおん', opts: [[0, 'なし'], [0.4, 'ちいさい'], [0.7, 'ふつう'], [1, 'おおきい']] },
      { key: 'voice', label: 'よみあげ', opts: [[true, 'あり'], [false, 'なし']] },
      { key: 'textSize', label: 'もじの おおきさ', opts: [[1, 'ふつう'], [1.2, 'おおきい'], [1.4, 'とても おおきい']] },
      { key: 'shake', label: 'がめんの ゆれ', opts: [[true, 'あり'], [false, 'なし']] },
      { key: 'bgSpeed', label: 'けしきの はやさ', opts: [[0.5, 'ゆっくり'], [1, 'ふつう'], [1.5, 'はやい']] },
    ];
    const val = k => (k === 'grade' ? KG.state.profile.grade : s[k]);
    $('#settingsBody').innerHTML = rows.map((r, ri) => `<div class="row"><div>${r.label}</div>
      <div class="seg">${r.opts.map(([v, t], oi) => `<button data-r="${ri}" data-o="${oi}" class="${val(r.key) === v ? 'on' : ''}">${t}</button>`).join('')}</div>
      ${r.sub ? `<div class="sub">${r.sub}</div>` : ''}</div>`).join('');
    $$('#settingsBody .seg button').forEach(b => (b.onclick = () => {
      const r = rows[+b.dataset.r];
      const v = r.opts[+b.dataset.o][0];
      if (r.key === 'control' && v === 'tilt') {
        requestTilt().then(ok => {
          if (ok) { s.control = 'tilt'; KG.save(); renderers.settings(); }
          else toast('かたむけ そうさが つかえません（HTTPSで ひらく ひつようが あります）', 3500);
        });
        return;
      }
      if (r.key === 'grade') KG.state.profile.grade = v;
      else s[r.key] = v;
      if (r.key === 'textSize') applyTextSize();
      if (r.key === 'se') KG.audio.select();
      KG.save();
      renderers.settings();
    }));
  },

  lock() {
    const a = 11 + Math.floor(Math.random() * 39), b = 11 + Math.floor(Math.random() * 39);
    let ans = '';
    $('#lockQ').textContent = `${a} ＋ ${b} ＝ ？`;
    $('#lockAns').textContent = '';
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'けす', '0', 'OK'];
    $('#keypad').innerHTML = keys.map(k => `<button>${k}</button>`).join('');
    $$('#keypad button').forEach(btn => (btn.onclick = () => {
      const k = btn.textContent;
      if (k === 'けす') ans = '';
      else if (k === 'OK') {
        if (+ans === a + b) { show('parent'); return; }
        toast('ちがいます');
        ans = '';
      } else if (ans.length < 3) ans += k;
      $('#lockAns').textContent = ans;
    }));
  },

  parent() {
    $$('#parentTabs button').forEach(b => {
      b.classList.toggle('on', b.dataset.tab === ui.parentTab);
      b.onclick = () => { ui.parentTab = b.dataset.tab; renderers.parent(); };
    });
    parentTabs[ui.parentTab]();
  },
};

// ---------------- 保護者メニュー ----------------
const parentTabs = {
  report() {
    const st = KG.state;
    const att = st.attempts;
    const mastered = KG.allChars.filter(KG.isMastered).length;
    const readOk = KG.allChars.filter(c => st.progress[c] && st.progress[c].read.level >= 2).length;
    const weak = KG.allChars.filter(KG.isWeak);
    const min = d => Math.round((st.usage[d] || 0) / 60);
    const days = Array.from({ length: 14 }, (_, i) => KG.today(i - 13));
    const week = days.slice(-7).reduce((a, d) => a + min(d), 0);
    const maxMin = Math.max(5, ...days.map(min));
    const rate = type => {
      const xs = att.filter(a => a.type === type);
      if (!xs.length) return '—';
      const ok = xs.filter(a => a.result === 'correct').length;
      const hes = xs.filter(a => a.hes).length;
      return `${Math.round((ok / xs.length) * 100)}%（${ok}/${xs.length}）` + (type !== 'write' ? `　迷い ${hes}回` : '');
    };
    const weakRows = weak.map(c => {
      const xs = att.filter(a => a.k === c && a.result !== 'correct');
      const picks = {};
      xs.forEach(a => { if (a.picked) picks[a.picked] = (picks[a.picked] || 0) + 1; });
      const top = Object.entries(picks).sort((a, b) => b[1] - a[1])[0];
      const p = st.progress[c];
      return { c, n: xs.length, top: top ? top[0] : '（時間切れ・迷い）', r: p.read.level, w: p.write.level, last: (xs[xs.length - 1] || {}).day || '' };
    }).sort((a, b) => b.n - a.n);

    $('#parentBody').innerHTML = `
      <div class="card"><h3>概要</h3><div class="kpis">
        <div class="kpi"><small>覚えた字（読み＋書き）</small><b>${mastered} / ${KG.allChars.length}</b></div>
        <div class="kpi"><small>読みを覚えた字</small><b>${readOk}</b></div>
        <div class="kpi"><small>苦手な字</small><b>${weak.length}</b></div>
        <div class="kpi"><small>今日の学習時間</small><b>${min(KG.today())}分</b></div>
        <div class="kpi"><small>直近7日の合計</small><b>${week}分</b></div>
        <div class="kpi"><small>難易度レベル（自動）</small><b>${st.difficulty} / 5</b></div>
      </div></div>
      <div class="card"><h3>学習した日と時間（直近14日・分）</h3><div class="bars">
        ${days.map(d => `<div><span style="height:${(min(d) / maxMin) * 100}%"></span>${d.slice(8)}</div>`).join('')}
      </div></div>
      <div class="card"><h3>問題の種類ごとの正解率</h3><table class="list">
        <tr><th>読み</th><td>${rate('reading')}</td></tr>
        <tr><th>漢字を選ぶ</th><td>${rate('choose')}</td></tr>
        <tr><th>何も見ずに書く</th><td>${rate('write')}</td></tr>
      </table></div>
      <div class="card"><h3>苦手な字（間違えた回数の多い順）</h3>
        ${weakRows.length ? `<table class="list"><tr><th>字</th><th>間違い</th><th>よく選んだ答え</th><th>読み段階</th><th>書き段階</th><th>最後に間違えた日</th></tr>
        ${weakRows.map(r => `<tr><td class="k">${esc(r.c)}</td><td>${r.n}</td><td>${esc(r.top)}</td><td>${r.r}</td><td>${r.w}</td><td>${r.last}</td></tr>`).join('')}</table>` : '<p>まだありません</p>'}
      </div>`;
  },

  custom() {
    const sel = new Set(KG.state.parent.customKanji);
    $('#parentBody').innerHTML = `
      <div class="card"><h3>出題する字を選ぶ（${sel.size}字選択中）</h3>
        <p>選んだ字は、地図の「おうちの人コース」で出題されます（例：今週の漢字テストの範囲）。</p>
        <div class="prow"><button class="btn small" id="customClear">すべて外す</button></div>
      </div>
      ${KG.courses.map(c => `<div class="card"><h3>${c.emoji} ${c.name}コース</h3><div class="pick-grid">
        ${c.chars.map(ch => `<button class="${sel.has(ch) ? 'on' : ''}" data-k="${esc(ch)}">${esc(ch)}</button>`).join('')}
      </div></div>`).join('')}`;
    $$('.pick-grid button').forEach(b => (b.onclick = () => {
      const k = b.dataset.k;
      if (sel.has(k)) sel.delete(k); else sel.add(k);
      KG.state.parent.customKanji = KG.allChars.filter(c => sel.has(c));
      KG.save();
      parentTabs.custom();
    }));
    $('#customClear').onclick = () => { KG.state.parent.customKanji = []; KG.save(); parentTabs.custom(); };
  },

  psettings() {
    const p = KG.state.parent;
    const opt = (vals, cur, unit) => vals.map(v => `<option value="${v}" ${v === cur ? 'selected' : ''}>${v ? v + unit : 'なし'}</option>`).join('');
    $('#parentBody').innerHTML = `
      <div class="card"><h3>利用時間</h3>
        <div class="prow">1日の上限 <select id="pLimit">${opt([0, 15, 30, 45, 60], p.timeLimit, '分')}</select></div>
        <div class="prow">休憩の案内 <select id="pBreak">${opt([0, 15, 20, 30], p.breakEvery, '分ごと')}</select></div>
        <div class="prow"><button class="btn small" id="pAllow">今日だけ上限を解除する</button> ${p.allowDay === KG.today() ? '（今日は解除中）' : ''}</div>
      </div>
      <div class="card"><h3>データ</h3>
        <div class="prow"><button class="btn small" id="pExport">学習データを書き出す（JSON）</button></div>
        <div class="prow"><button class="btn small danger" id="pReset">すべての学習記録を削除する</button></div>
        <p class="note">データはこのiPadのブラウザの中だけに保存されています。Safariの「履歴とWebサイトデータを消去」をすると消えるので、ときどき書き出しておくと安心です。</p>
      </div>`;
    $('#pLimit').onchange = e => { p.timeLimit = +e.target.value; KG.save(); };
    $('#pBreak').onchange = e => { p.breakEvery = +e.target.value; KG.save(); };
    $('#pAllow').onclick = () => { p.allowDay = KG.today(); KG.save(); parentTabs.psettings(); toast('今日の上限を解除しました'); };
    $('#pExport').onclick = () => {
      const blob = new Blob([JSON.stringify(KG.state, null, 1)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `kanji-de-go-${KG.today()}.json`;
      a.click();
    };
    $('#pReset').onclick = () => {
      if (!confirm('すべての学習記録を削除します。よろしいですか？')) return;
      KG.resetAll();
      applyTextSize();
      show('title');
    };
  },
};

// ---------------- 傾け操作 ----------------
let tiltGranted = false;
function requestTilt() {
  const DM = window.DeviceMotionEvent;
  if (!DM) return Promise.resolve(false);
  if (typeof DM.requestPermission === 'function') {
    return DM.requestPermission().then(r => (tiltGranted = r === 'granted')).catch(() => false);
  }
  tiltGranted = true;
  return Promise.resolve(true);
}

const tilt = { base: null, handler: null };
function startTilt(drive) {
  stopTilt();
  tilt.base = null;
  tilt.handler = e => {
    const g = e.accelerationIncludingGravity;
    if (!g || g.x == null) return;
    if (Math.hypot(g.x, g.y) < 3) return; // 机に平らに置いているときは反応しない
    // 画面の面の中での重力の向き。ハンドルのように回すと、この角度が変わる
    const ang = (Math.atan2(g.x, g.y) * 180) / Math.PI;
    if (tilt.base == null) { tilt.base = ang; return; }
    let d = ang - tilt.base;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    if (KG.state.settings.tiltInvert) d = -d;
    if (d > 15) drive.select('R');
    else if (d < -15) drive.select('L');
  };
  window.addEventListener('devicemotion', tilt.handler);
}
function stopTilt() {
  if (tilt.handler) window.removeEventListener('devicemotion', tilt.handler);
  tilt.handler = null;
}

// ---------------- ドライブ ----------------
function startDrive(stage) {
  if (KG.overTimeLimit()) { $('#limitModal').hidden = false; return; }
  if (stage.kind === 'weak' && !KG.allChars.some(c => KG.state.progress[c] && KG.state.progress[c].read.seen)) {
    toast('まず ふつうの ステージを はしってみよう！');
    return;
  }
  const items = KG.pickDriveQuestions(stage);
  if (!items.length) { toast('もんだいが ありません'); return; }
  if (KG.state.settings.control === 'tilt' && !tiltGranted) requestTilt(); // タップの流れの中で許可をもらう

  show('drive');
  const hud = makeHud(items);
  ui.drive = new KG.Drive({
    canvas: $('#driveCanvas'),
    course: stage.course,
    items,
    hud,
    onFinish: (results, elapsed) => finishDrive(stage, results, elapsed),
  });
  if (KG.state.settings.control === 'tilt') startTilt(ui.drive);
  const tb = $('#toggleBtn');
  tb.className = 'toggle-btn' + (KG.state.settings.oneHand ? ' on ' + KG.state.settings.hand : '');
}

function makeHud(items) {
  const prog = $('#progress');
  prog.innerHTML = items.map(() => '<i></i>').join('');
  const dots = prog.querySelectorAll('i');
  const banner = $('#qBanner'), cL = $('#choiceL'), cR = $('#choiceR');
  const fb = $('#feedback'), ex = $('#explain'), sm = $('#startMsg'), wh = $('#waitHint');
  let lastWait = false;
  [banner, cL, cR, fb, ex, sm, wh].forEach(el => el.classList.remove('on'));
  return {
    phase(name, d) {
      dots.forEach((x, i) => x.classList.toggle('now', i === d.idx && name !== 'goal'));
      if (name === 'start') { sm.textContent = 'よーい… スタート！'; sm.classList.add('on'); }
      if (name === 'cruise') sm.classList.remove('on');
      if (name === 'question') {
        const it = d.item, q = it.q;
        banner.querySelector('.qlabel').textContent = q.type === 'reading' ? 'よみは どっち？' : 'かんじは どっち？';
        banner.querySelector('.qtext').innerHTML = esc(q.text).replace(/\{(.+?)\}/, '<em>$1</em>').replace(/\[(.+?)\]/, '<u>$1</u>');
        cL.querySelector('.ctext').textContent = it.side === 'L' ? q.correct : q.wrong;
        cR.querySelector('.ctext').textContent = it.side === 'R' ? q.correct : q.wrong;
        [cL, cR].forEach(c => c.classList.remove('sel'));
        [banner, cL, cR].forEach(c => c.classList.add('on'));
      }
      if (name === 'after') [banner, cL, cR, wh].forEach(c => c.classList.remove('on'));
      if (name === 'goal') { sm.textContent = '🏁 ゴール！'; sm.classList.add('on'); }
    },
    selected(side) {
      cL.classList.toggle('sel', side === 'L');
      cR.classList.toggle('sel', side === 'R');
    },
    waiting(w) {
      if (w !== lastWait) { wh.classList.toggle('on', w); lastWait = w; }
    },
    result(result, it, hesitated) {
      const i = ui.drive.idx;
      dots[i].classList.add(result === 'correct' ? (hesitated ? 'hes' : 'ok') : 'ng');
      fb.className = 'feedback on ' + (result === 'correct' ? 'ok' : '');
      fb.textContent = result === 'correct' ? 'せいかい！' : result === 'timeout' ? 'じかんぎれ！' : 'おしい！';
      setTimeout(() => fb.classList.remove('on'), 1100);
      if (result !== 'correct') {
        ex.innerHTML = `せいかいは <b>${esc(it.q.correct)}</b><br>${esc(KG.explain(it.q))}`;
        setTimeout(() => ex.classList.add('on'), 600);
      }
    },
    clearResult() { ex.classList.remove('on'); },
  };
}

function finishDrive(stage, results, elapsed) {
  const d = ui.drive;
  d.destroy();
  stopTilt();
  ui.drive = null;
  const correct = results.filter(r => r.result === 'correct').length;
  const noMiss = correct === results.length;
  const starsN = noMiss ? 3 : correct >= 9 ? 2 : correct >= 7 ? 1 : 0;
  const rec = KG.state.stages[stage.id] || { stars: 0, best: null };
  const isBest = starsN > 0 && (rec.best == null || elapsed < rec.best);
  rec.stars = Math.max(rec.stars, starsN);
  if (isBest) rec.best = +elapsed.toFixed(1);
  KG.state.stages[stage.id] = rec;
  KG.state.stamps.push(KG.today());
  KG.adjustDifficulty();
  KG.save();
  show('result', { results, elapsed, starsN, isBest, noMiss });
  const be = KG.state.parent.breakEvery;
  if (be && ui.sessionPlay >= be * 60) {
    ui.sessionPlay = 0;
    setTimeout(() => toast('👀 すこし めを やすめよう', 4000), 800);
  }
}

// ドライブ中の入力（タップ・キーボード）
$('#scr-drive').addEventListener('pointerdown', e => {
  if (!ui.drive || e.target.closest('button')) return;
  KG.audio.unlock();
  if (KG.state.settings.control !== 'tap' && KG.state.settings.control !== 'tilt') return;
  ui.drive.select(e.clientX < window.innerWidth / 2 ? 'L' : 'R');
});
$('#toggleBtn').addEventListener('pointerdown', e => { e.preventDefault(); if (ui.drive) ui.drive.toggle(); });
document.addEventListener('keydown', e => {
  if (!ui.drive) return;
  if (e.key === 'ArrowLeft') ui.drive.select('L');
  if (e.key === 'ArrowRight') ui.drive.select('R');
  if (e.key === ' ') ui.drive.toggle();
  if (e.key === 'Escape') setPause(true);
});
function setPause(p) {
  if (!ui.drive) return;
  ui.drive.setPaused(p);
  $('#pauseMenu').hidden = !p;
}
$('#pauseBtn').onclick = () => setPause(true);
$('#resumeBtn').onclick = () => setPause(false);
$('#quitBtn').onclick = () => {
  $('#pauseMenu').hidden = true;
  if (ui.drive) { ui.drive.destroy(); ui.drive = null; }
  stopTilt();
  KG.save();
  show('map');
};
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (ui.drive && !ui.drive.paused) setPause(true); KG.save(); }
});

setInterval(() => {
  if (ui.drive) $('#timer').textContent = ui.drive.elapsed.toFixed(1);
}, 100);

// 利用時間：ドライブ中とピットイン中だけ数える
setInterval(() => {
  if (document.hidden) return;
  if (ui.current === 'drive' || ui.current === 'pitin') {
    KG.addUsage(5);
    ui.sessionPlay += 5;
  }
}, 5000);

// ---------------- 起動 ----------------
applyTextSize();
show('title');
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW', e));
}

// 保存と学習の仕組み（間隔反復・にがてリスト・問題の選び方）
window.KG = window.KG || {};

const STORE_KEY = 'kanjiDeGo.v1';                 // v1.0まで（1人分）。v1.1からは STORE_KEY + ':' + ユーザーID
const PROFILES_KEY = 'kanjiDeGo.profiles';         // ユーザーの一覧 { active, list: [{ id, name, grade, color, stars }] }
const SHARED_KEY = 'kanjiDeGo.shared';             // 兄弟で共通のもの（ドリルの順番と例文）
KG.INTERVALS = [0, 1, 3, 7, 14, 30]; // 段階ごとの、次の復習までの日数
KG.CAR_COLORS = [
  { id: 'red', name: 'あか', color: '#ff5a4f', stars: 0 },
  { id: 'blue', name: 'あお', color: '#3d8bff', stars: 3 },
  { id: 'yellow', name: 'きいろ', color: '#ffc928', stars: 8 },
  { id: 'green', name: 'みどり', color: '#33c27a', stars: 15 },
  { id: 'pink', name: 'ピンク', color: '#ff7eb6', stars: 25 },
  { id: 'purple', name: 'むらさき', color: '#9b6bff', stars: 40 },
  { id: 'gold', name: 'きんいろ', color: '#e0a800', stars: 60 },
];

// スタンプがたまるともらえる、車のアイテム
KG.CAR_ITEMS = [
  { id: 'star', slot: 'decal', name: 'ほしの ステッカー', need: 3, ico: 'star' },
  { id: 'goldwheel', slot: 'wheel', name: 'きんの タイヤ', need: 6, ico: 'wheel' },
  { id: 'flag', slot: 'roof', name: 'はた', need: 10, ico: 'flag' },
  { id: 'truck', slot: 'body', name: 'トラック', need: 15, ico: 'truck' },
  { id: 'crown', slot: 'roof', name: 'かんむり', need: 20, ico: 'crown' },
  { id: 'fire', slot: 'decal', name: 'ほのおの もよう', need: 25, ico: 'fire' },
  { id: 'siren', slot: 'roof', name: 'サイレン', need: 30, ico: 'siren' },
  { id: 'kart', slot: 'body', name: 'カート', need: 40, ico: 'kart' },
  { id: 'rainbow', slot: 'paint', name: 'にじいろ ペンキ', need: 50, ico: 'rainbow' },
  { id: 'bus', slot: 'body', name: 'バス', need: 60, ico: 'bus' },
];
KG.CAR_SLOTS = [
  { id: 'paint', name: 'いろ' }, { id: 'body', name: 'かたち' }, { id: 'wheel', name: 'タイヤ' },
  { id: 'roof', name: 'やね' }, { id: 'decal', name: 'もよう' },
];
// 何もつけていないとき
KG.CAR_DEFAULT = { body: 'normal', wheel: 'normal', roof: 'none', decal: 'none', paint: 'color' };

function defaultState() {
  return {
    profile: null, // { nickname, grade }
    settings: {
      control: 'tap', oneHand: false, hand: 'right', slow: false,
      se: 0.7, bgm: 0.5, graphics: '3d', voice: true, textSize: 1, shake: true, bgSpeed: 1,
    },
    parent: { timeLimit: 0, breakEvery: 20, customKanji: [], drillOrder: {}, drillExamples: {}, cheer: '' },
    progress: {},  // 字 -> { read: {...}, write: {...} }
    attempts: [],  // 1問ごとの記録
    stages: {},    // ステージID -> { stars, best }
    stamps: [],    // スタンプをもらった日の一覧（ドライブ1回ごと）
    carColor: 'red',
    coins: 0,          // 集めたコイン（お店で使える）
    shopOwned: [],     // お店で買った色
    ghosts: {},        // ステージごとの自己ベストの走り（ゴーストカー）
    daily: null,       // きょうのミッション
    tutorialDone: false,
    driveMode: 'read', // 'read'（よみで はしる）／'write'（かきで はしる）
    carParts: { ...KG.CAR_DEFAULT },
    rewardsSeen: [], // 「アイテム ゲット！」を見せたアイテム
    mapSeen: {},     // 地図で、どのステージまで開いたのを見せたか（新しく開いたときの演出用）
    difficulty: 3,
    recent: [],    // 直近の結果（1=すっきり正解 0=それ以外）
    usage: {},     // 日付 -> 秒
    radicalClaimed: [], // ごほうびをもらった部首カード
  };
}

// ---- ユーザー（兄弟ごとの記録）----
KG.profiles = { active: null, list: [] };

function readJSON(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
}

// ユーザーの一覧を読む。v1.0までの1人分の記録は、1人目のユーザーとして引きつぐ
KG.loadProfiles = function () {
  KG.profiles = readJSON(PROFILES_KEY, null) || { active: null, list: [] };
  if (!KG.profiles.list.length) {
    const old = readJSON(STORE_KEY, null);
    if (old && old.profile) {
      const id = 'p1';
      localStorage.setItem(STORE_KEY + ':' + id, JSON.stringify(old));
      KG.profiles = { active: id, list: [{ id, name: old.profile.nickname, grade: old.profile.grade }] };
      localStorage.setItem(PROFILES_KEY, JSON.stringify(KG.profiles));
      // ドリルの順番と例文は、兄弟で共通にする
      const par = old.parent || {};
      localStorage.setItem(SHARED_KEY, JSON.stringify({ drillOrder: par.drillOrder || {}, drillExamples: par.drillExamples || {} }));
      localStorage.removeItem(STORE_KEY);
    }
  }
  if (KG.profiles.active && !KG.profiles.list.some(x => x.id === KG.profiles.active)) KG.profiles.active = null;
};

function stateFrom(s) {
  const d = defaultState();
  const st = { ...d, ...s, settings: { ...d.settings, ...s.settings }, parent: { ...d.parent, ...s.parent }, carParts: { ...KG.CAR_DEFAULT, ...(s.carParts || {}) } };
  // v0.2までは2年生だけで、ステージIDに学年がなかった
  for (const k of Object.keys(st.stages)) {
    if (/^(machi|umi|yama)-/.test(k)) { st.stages['g2-' + k] = st.stages[k]; delete st.stages[k]; }
  }
  return st;
}

// いま選ばれているユーザーの記録を読む（ユーザーがいなければ、空の記録）
KG.load = function () {
  KG.loadProfiles();
  const id = KG.profiles.active;
  const raw = id ? readJSON(STORE_KEY + ':' + id, null) : null;
  KG.state = raw ? stateFrom(raw) : defaultState();
  // 兄弟で共通のドリルの順番と例文
  const shared = readJSON(SHARED_KEY, null);
  if (shared) {
    KG.state.parent.drillOrder = shared.drillOrder || {};
    KG.state.parent.drillExamples = shared.drillExamples || {};
  }
  if (KG.setGrade) KG.setGrade((KG.state.profile && KG.state.profile.grade) || 2);
};

KG.save = function () {
  const s = KG.state;
  const id = KG.profiles.active;
  if (!id) return; // ユーザーを作る前は保存しない
  if (s.attempts.length > 5000) s.attempts = s.attempts.slice(-5000);
  localStorage.setItem(STORE_KEY + ':' + id, JSON.stringify(s));
  localStorage.setItem(SHARED_KEY, JSON.stringify({ drillOrder: s.parent.drillOrder || {}, drillExamples: s.parent.drillExamples || {} }));
  // 「だれが あそぶ？」画面で見せる情報
  const me = KG.profiles.list.find(x => x.id === id);
  if (me && s.profile) {
    me.name = s.profile.nickname;
    me.grade = s.profile.grade;
    me.color = KG.findColor(s.carColor).color;
    me.stars = Object.values(s.stages).reduce((a, x) => a + (x.stars || 0), 0);
    me.stamps = s.stamps.length;
  }
  localStorage.setItem(PROFILES_KEY, JSON.stringify(KG.profiles));
};

// ユーザーを切りかえる
KG.switchProfile = function (id) {
  KG.save();
  KG.profiles.active = id;
  localStorage.setItem(PROFILES_KEY, JSON.stringify(KG.profiles));
  KG.load();
};

// ユーザーを新しく作って、そのユーザーにする
KG.createProfile = function (name, grade) {
  if (KG.profiles.active) KG.save();
  let n = KG.profiles.list.length + 1;
  while (KG.profiles.list.some(x => x.id === 'p' + n)) n++;
  const id = 'p' + n;
  KG.profiles.list.push({ id, name, grade });
  KG.profiles.active = id;
  const shared = readJSON(SHARED_KEY, null);
  KG.state = defaultState();
  KG.state.profile = { nickname: name, grade };
  if (shared) { KG.state.parent.drillOrder = shared.drillOrder || {}; KG.state.parent.drillExamples = shared.drillExamples || {}; }
  if (KG.setGrade) KG.setGrade(grade);
  KG.save();
};

// ユーザーを消す（そのユーザーの記録もすべて消える）
KG.deleteProfile = function (id) {
  localStorage.removeItem(STORE_KEY + ':' + id);
  KG.profiles.list = KG.profiles.list.filter(x => x.id !== id);
  if (KG.profiles.active === id) KG.profiles.active = KG.profiles.list.length ? KG.profiles.list[0].id : null;
  localStorage.setItem(PROFILES_KEY, JSON.stringify(KG.profiles));
  KG.load();
};

// いまのユーザーの学習記録だけを消す（名前と学年は残す）
KG.resetAll = function () {
  const keep = KG.state.profile;
  const par = KG.state.parent;
  KG.state = defaultState();
  KG.state.profile = keep;
  KG.state.parent.drillOrder = par.drillOrder;
  KG.state.parent.drillExamples = par.drillExamples;
  if (KG.setGrade) KG.setGrade((keep && keep.grade) || 2);
  KG.save();
};

// ---- 日付 ----
KG.today = function (offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};

function newSkill() {
  return { level: 0, due: null, seen: false, lastUpDay: null, todayDay: null, todayQ: [], weak: false, weakOk: 0, weakOkDay: null };
}

KG.prog = function (ch) {
  const p = KG.state.progress;
  if (!p[ch]) p[ch] = { read: newSkill(), write: newSkill() };
  return p[ch];
};

function levelUp(sk, today) {
  if (sk.lastUpDay === today) return; // 1日に上げるのは1段階まで（日をあけて確かめるため）
  sk.level = Math.min(5, sk.level + 1);
  sk.lastUpDay = today;
  sk.due = KG.today(KG.INTERVALS[sk.level]);
}

function markWeak(sk) {
  sk.weak = true;
  sk.weakOk = 0;
}

function weakOk(sk, today) {
  if (!sk.weak || sk.weakOkDay === today) return;
  sk.weakOk += 1;
  sk.weakOkDay = today;
  if (sk.weakOk >= 2) sk.weak = false; // 別の日に2回正解したら、にがてリストから出る
}

// ドライブの1問の結果を記録する
// result: 'correct' | 'wrong' | 'timeout'
KG.recordRead = function (q, result, info) {
  const today = KG.today();
  const sk = KG.prog(q.kanji).read;
  const hesitated = result === 'correct' && info.hesitated;
  KG.state.attempts.push({
    q: q.id, k: q.kanji, type: q.type, t: Date.now(), day: today, result,
    ms: Math.round(info.responseMs || 0), sw: info.switchCount || 0, hes: hesitated,
    picked: info.picked || null, diff: KG.state.difficulty,
  });
  if (!sk.seen) { sk.seen = true; sk.due = today; }
  if (sk.todayDay !== today) { sk.todayDay = today; sk.todayQ = []; }

  if (result === 'correct' && !hesitated) {
    if (!sk.todayQ.includes(q.id)) sk.todayQ.push(q.id);
    // まぐれ当たり対策：同じ日に、別の問題でも正解したときだけ段階を上げる
    if (sk.todayQ.length >= 2) {
      levelUp(sk, today);
      weakOk(sk, today);
    }
  } else if (hesitated) {
    markWeak(sk); // 迷った：段階はそのまま、にがてリストへ
  } else {
    sk.level = Math.min(sk.level, 1);
    sk.due = KG.today(1);
    markWeak(sk);
  }
  KG.state.recent.push(result === 'correct' && !hesitated ? 1 : 0);
  if (KG.state.recent.length > 20) KG.state.recent.shift();
};

// 何も見ずに書くテストの結果を記録する
KG.recordWrite = function (ch, pass) {
  const today = KG.today();
  const sk = KG.prog(ch).write;
  sk.seen = true;
  KG.state.attempts.push({ q: ch + '-W', k: ch, type: 'write', t: Date.now(), day: today, result: pass ? 'correct' : 'wrong' });
  if (pass) {
    levelUp(sk, today);
    weakOk(sk, today);
  } else {
    sk.level = Math.min(sk.level, 1);
    sk.due = KG.today(1);
    markWeak(sk);
  }
};

KG.isMastered = function (ch) {
  const p = KG.state.progress[ch];
  return !!p && p.read.level >= 2 && p.write.level >= 2;
};

KG.isWeak = function (ch) {
  const p = KG.state.progress[ch];
  return !!p && (p.read.weak || p.write.weak);
};

// 図鑑・レポートで見せる星（0〜3）
KG.starsOf = function (ch) {
  const p = KG.state.progress[ch];
  if (!p || !p.read.seen) return 0;
  if (KG.isMastered(ch)) return 3;
  if (p.read.level >= 2) return 2;
  return p.read.level >= 1 || p.read.todayQ.length > 0 ? 1 : 0;
};

// ---- 難易度 ----
KG.adjustDifficulty = function () {
  const r = KG.state.recent;
  if (r.length < 10) return;
  const rate = r.reduce((a, b) => a + b, 0) / r.length;
  if (rate > 0.85 && KG.state.difficulty < 5) { KG.state.difficulty++; KG.state.recent = []; }
  else if (rate < 0.6 && KG.state.difficulty > 1) { KG.state.difficulty--; KG.state.recent = []; }
};

// 問題が出てから決定ラインまでの秒数
KG.questionTime = function () {
  const g = (KG.state.profile && KG.state.profile.grade) || 2;
  let t = g <= 2 ? 6 : g <= 4 ? 5 : 4;
  const lv = KG.state.difficulty;
  if (lv === 1) t += 1;
  if (lv === 5) t -= 0.5;
  return t;
};

// ---- 問題の選び方 ----
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
KG.shuffle = shuffle;

function pickQuestionFor(ch, usedIds) {
  const today = KG.today();
  const sk = KG.prog(ch).read;
  const doneToday = sk.todayDay === today ? sk.todayQ : [];
  const target = { 1: 1, 2: 1, 3: 2, 4: 3, 5: 3 }[KG.state.difficulty];
  const cands = KG.qByKanji[ch].concat(KG.drillQuestions(ch)).filter(q => !usedIds.has(q.id));
  if (!cands.length) return null;
  // 今日まだ正解していない問題を優先し、難易度が近いものを選ぶ。ドリルの例文は少し優先する
  const score = q => (doneToday.includes(q.id) ? 10 : 0) + Math.abs(q.difficulty - target) + Math.random() * 0.5 - (q.custom ? 0.8 : 0);
  cands.sort((a, b) => score(a) - score(b));
  return cands[0];
}

// stage: { kind: 'normal'|'weak'|'custom', chars: [...] }
// mode: 'read'（読みで走る）／'write'（書きで走る）。書きのときは「書き」の記録で選ぶ
KG.pickDriveQuestions = function (stage, count = 10, mode = 'read') {
  const sk = mode === 'write' ? 'write' : 'read';
  const today = KG.today();
  const prog = c => KG.state.progress[c];
  const seen = KG.allChars.filter(c => prog(c) && (prog(c).read.seen || prog(c)[sk].seen));
  const chosen = [];
  const add = list => {
    for (const c of list) {
      if (chosen.length >= count) break;
      if (!chosen.includes(c)) chosen.push(c);
    }
  };
  // 今日1問だけ正解していて、確認待ちの字
  const pending = seen.filter(c => {
    const k = prog(c)[sk];
    return sk === 'read' && k.todayDay === today && k.todayQ.length === 1 && k.lastUpDay !== today;
  });
  const due = seen.filter(c => prog(c)[sk].due && prog(c)[sk].due <= today)
    .sort((a, b) => prog(a)[sk].due.localeCompare(prog(b)[sk].due));
  const weak = shuffle(seen.filter(c => KG.isWeak(c)));

  if (stage.kind === 'weak') {
    add(weak);
    add(seen.slice().sort((a, b) => prog(a)[sk].level - prog(b)[sk].level));
  } else if (stage.kind === 'custom') {
    add(shuffle(stage.chars.slice()));
  } else {
    const fresh = stage.chars.filter(c => !prog(c) || !prog(c)[sk].seen);
    add(fresh.slice(0, 3));        // 新しい字 3
    add(weak.slice(0, 2));         // にがて 2
    add(shuffle(pending).slice(0, 3));
    add(due);                      // 復習
    add(shuffle(stage.chars.slice())); // 足りなければ、このステージの字
    add(shuffle(seen.slice()));
  }

  // 字ごとに問題を決める。字が足りないときは、同じ字の別の問題を足す
  const used = new Set();
  const qs = [];
  for (const c of chosen) {
    const q = pickQuestionFor(c, used);
    if (q) { qs.push(q); used.add(q.id); }
  }
  let guard = 0;
  while (qs.length < count && chosen.length && guard++ < 50) {
    const c = chosen[guard % chosen.length];
    let q = pickQuestionFor(c, used);
    if (!q) q = KG.qByKanji[c][Math.floor(Math.random() * 2)];
    qs.push(q); used.add(q.id);
  }
  shuffle(qs);
  // 同じ字の問題が続かないように並べかえる
  for (let i = 1; i < qs.length; i++) {
    if (qs[i].kanji === qs[i - 1].kanji) {
      const j = qs.findIndex((q, k) => k > i && q.kanji !== qs[i - 1].kanji);
      if (j > 0) [qs[i], qs[j]] = [qs[j], qs[i]];
    }
  }
  return qs.map((q, i) => ({ q, side: null, index: i })).map(assignSides(qs.length));
};

// 正解の道を左右5つずつにし、同じ側が3回より多く続かないようにする
function assignSides(n) {
  let sides;
  for (let tries = 0; tries < 100; tries++) {
    sides = shuffle(Array.from({ length: n }, (_, i) => (i < Math.ceil(n / 2) ? 'L' : 'R')));
    let run = 1, ok = true;
    for (let i = 1; i < n; i++) {
      run = sides[i] === sides[i - 1] ? run + 1 : 1;
      if (run > 3) { ok = false; break; }
    }
    if (ok) break;
  }
  return item => ({ ...item, side: sides[item.index] });
}

// ピットインで練習する字（最大3字）
// 1. このドライブで間違えた字・迷った字  2. 書きの復習の日が来た字
KG.pickPitinChars = function (missed) {
  const today = KG.today();
  const list = [...new Set(missed)];
  if (list.length < 3) {
    const writeDue = KG.allChars.filter(c => {
      const p = KG.state.progress[c];
      if (!p || p.read.level < 1 || list.includes(c)) return false;
      return !p.write.seen || (p.write.due && p.write.due <= today);
    }).sort((a, b) => KG.state.progress[b].read.level - KG.state.progress[a].read.level);
    list.push(...writeDue);
  }
  return list.slice(0, 3);
};

// 書きの問題の見せ方。書く字を「□」にして、上に読みをつける
// 例：「[うみ]で およぐ」→ 前「」・字「□」・読み「うみ」・後「で およぐ」
KG.writePrompt = function (q) {
  let word, reading, m;
  if (q.type === 'reading') {
    m = q.text.match(/\{(.+?)\}/);
    word = m ? m[1] : q.kanji;
    reading = q.correct;
  } else {
    m = q.text.match(/\[(.+?)\]/);
    word = q.correct;
    reading = m ? m[1] : '';
  }
  const before = m ? q.text.slice(0, m.index) : '';
  const after = m ? q.text.slice(m.index + m[0].length) : '';
  const i = word.indexOf(q.kanji);
  return { before, after, reading, pre: word.slice(0, i), post: word.slice(i + 1), target: q.kanji };
};

// 書きで走ったあとのピットイン（読みの練習）で使う字
KG.pickPitinReadChars = function (missed) {
  const today = KG.today();
  const list = [...new Set(missed)];
  if (list.length < 3) {
    list.push(...KG.allChars.filter(c => {
      const p = KG.state.progress[c];
      return p && p.read.seen && !list.includes(c) && p.read.due && p.read.due <= today;
    }));
  }
  return list.slice(0, 3);
};

// ---- ミッション（ステージごとに3つ。達成した数が星の数）----
// stats: { correct, total, coins, maxCombo, boostHits, bonusOk, elapsed }
KG.stageMissions = function (stageId, mode, total) {
  const T = KG.questionTime();
  const g = (KG.state.profile && KG.state.profile.grade) || 2;
  const gap = g <= 2 ? 6 : 5;
  const need = Math.ceil(total * 0.7);
  const pool = [
    { id: 'nomiss', text: 'ノーミスで ゴール', ok: s => s.correct === s.total },
    { id: 'combo3', text: '3れんぞく せいかい', ok: s => s.maxCombo >= 3 },
    { id: 'coins', text: `コインを ${mode === 'write' ? 35 : 60}まい あつめる`, ok: s => s.coins >= (mode === 'write' ? 35 : 60) },
    { id: 'bonus', text: 'ボーナスゲートで せいかい', ok: s => s.bonusOk >= 1 },
    { id: 'boost', text: 'ブーストを 2かい ふむ', ok: s => s.boostHits >= 2 },
  ];
  if (total >= 10) pool.push({ id: 'combo5', text: '5れんぞく せいかい', ok: s => s.maxCombo >= 5 });
  // タイムは、読みで走るときだけ（ゆっくりモードでは出さない）
  if (mode !== 'write' && !KG.state.settings.slow) {
    const sec = Math.round(total * (T + gap + 1.5));
    pool.push({ id: 'time', text: `${sec}びょう いないで ゴール`, ok: s => s.elapsed <= sec });
  }
  // ステージごとに決まった2つを選ぶ（同じステージなら、いつも同じミッション）
  let h = 0;
  for (const ch of stageId + mode) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const picks = [];
  const rest = pool.slice();
  while (picks.length < 2 && rest.length) picks.push(rest.splice(h % rest.length, 1)[0]), (h = (h * 1103515245 + 12345) >>> 0);
  return [{ id: 'clear', text: `${need}もん いじょう せいかい`, ok: s => s.correct >= need }, ...picks];
};

// ---- ステージ ----
KG.stageId = (courseId, idx) => `${KG.stagePrefix || 'g' + KG.grade}-${courseId}-${idx}`;

KG.isStageOpen = function (courseId, idx) {
  if (idx === 0) return true;
  const prev = KG.state.stages[KG.stageId(courseId, idx - 1)];
  return !!prev && prev.stars >= 1;
};

KG.totalStars = function () {
  return Object.values(KG.state.stages).reduce((a, s) => a + (s.stars || 0), 0);
};

// ---- 車のアイテム ----
KG.itemOpen = it => KG.state.stamps.length >= it.need;
// まだ「アイテム ゲット！」を見せていない、もらえたアイテム
KG.newRewards = () => KG.CAR_ITEMS.filter(it => KG.itemOpen(it) && !KG.state.rewardsSeen.includes(it.id));
KG.nextReward = () => KG.CAR_ITEMS.find(it => !KG.itemOpen(it)) || null;
// いまの車の見た目（色とアイテム）
KG.carLook = function (override) {
  const parts = { ...KG.CAR_DEFAULT, ...KG.state.carParts, ...(override || {}) };
  for (const slot of ['body', 'wheel', 'roof', 'decal', 'paint']) {
    const it = KG.CAR_ITEMS.find(x => x.id === parts[slot]);
    if (it && !KG.itemOpen(it)) parts[slot] = KG.CAR_DEFAULT[slot]; // まだもらっていないものは使えない
  }
  const color = parts.paint === 'rainbow' ? 'rainbow' : KG.findColor(KG.state.carColor).color;
  return { ...parts, color };
};

// ---- コインのお店（車の色）----
KG.SHOP_COLORS = [
  { id: 'mint', name: 'ミント', color: '#5fe0c0', price: 100 },
  { id: 'orange', name: 'オレンジ', color: '#ff9f43', price: 150 },
  { id: 'black', name: 'ブラック', color: '#2b2d42', price: 200 },
  { id: 'white', name: 'ホワイト', color: '#f4f4f4', price: 200 },
  { id: 'sky', name: 'そらいろ', color: '#7ec8ff', price: 250 },
  { id: 'silver', name: 'シルバー', color: '#b8c4cf', price: 300 },
];
KG.findColor = id => KG.CAR_COLORS.concat(KG.SHOP_COLORS).find(c => c.id === id) || KG.CAR_COLORS[0];

// ---- ドライバーランク（正解した数と星で上がる）----
KG.RANKS = [
  { name: 'ルーキー', pts: 0, color: '#9aa0a8' },
  { name: 'ブロンズ', pts: 60, color: '#c97c3a' },
  { name: 'シルバー', pts: 180, color: '#c0c6cc' },
  { name: 'ゴールド', pts: 400, color: '#ffd54a' },
  { name: 'プラチナ', pts: 800, color: '#7ee0ff' },
  { name: 'ダイヤ', pts: 1500, color: '#b07cff' },
  { name: 'レジェンド', pts: 3000, color: '#ff5a8a' },
];
KG.rankPoints = () => KG.state.attempts.filter(a => a.result === 'correct').length + KG.totalStars() * 5;
KG.rankOf = function (pts = KG.rankPoints()) {
  let i = 0;
  while (i + 1 < KG.RANKS.length && pts >= KG.RANKS[i + 1].pts) i++;
  const cur = KG.RANKS[i], next = KG.RANKS[i + 1];
  return { i, rank: cur, next, pts, toNext: next ? next.pts - pts : 0, progress: next ? (pts - cur.pts) / (next.pts - cur.pts) : 1 };
};

// ---- きょうのミッション（毎日3つ。全部できたら「ふしぎな箱」）----
KG.DAILY_POOL = [
  { id: 'drive2', text: 'ドライブを 2かい はしる', key: 'drives', need: 2 },
  { id: 'coin100', text: 'コインを 100まい あつめる', key: 'coins', need: 100 },
  { id: 'weak3', text: 'にがての字を 3つ せいかい', key: 'weakOk', need: 3 },
  { id: 'write1', text: 'かきで 1かい はしる', key: 'writeDrives', need: 1 },
  { id: 'nomiss1', text: 'ノーミスで ゴール', key: 'nomiss', need: 1 },
  { id: 'bonus2', text: 'ボーナスゲートで 2かい せいかい', key: 'bonus', need: 2 },
  { id: 'combo5', text: '5れんぞく せいかい', key: 'combo5', need: 1 },
  { id: 'pit2', text: 'ピットインで 2もん せいかい', key: 'pitOk', need: 2 },
];
KG.daily = function () {
  const today = KG.today();
  if (!KG.state.daily || KG.state.daily.day !== today) {
    // 日付とユーザーで決まる3つ（同じ日なら、いつも同じ）
    let h = 7;
    for (const ch of today + (KG.profiles && KG.profiles.active)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const pool = KG.DAILY_POOL.slice(), ids = [];
    while (ids.length < 3) { ids.push(pool.splice(h % pool.length, 1)[0].id); h = (h * 1103515245 + 12345) >>> 0; }
    KG.state.daily = { day: today, ids, c: {}, done: false, opened: false };
  }
  const d = KG.state.daily;
  const list = d.ids.map(id => {
    const m = KG.DAILY_POOL.find(x => x.id === id);
    const v = d.c[m.key] || 0;
    return { ...m, v: Math.min(v, m.need), ok: v >= m.need };
  });
  return { list, done: d.done, opened: d.opened };
};
// 数を足す。3つとも達成したら true を返す（1日1回）
KG.dailyAdd = function (key, n = 1) {
  KG.daily();
  const d = KG.state.daily;
  d.c[key] = (d.c[key] || 0) + n;
  if (!d.done && KG.daily().list.every(x => x.ok)) { d.done = true; return true; }
  return false;
};
// ふしぎな箱の中身（ランクが上がるほど多い）
KG.boxCoins = () => 50 + KG.rankOf().i * 20;

// ---- 利用時間 ----
KG.addUsage = function (sec) {
  const d = KG.today();
  KG.state.usage[d] = (KG.state.usage[d] || 0) + sec;
};

KG.overTimeLimit = function () {
  const lim = KG.state.parent.timeLimit;
  if (KG.state.parent.allowDay === KG.today()) return false; // 保護者が「きょうだけ延長」した
  return lim > 0 && (KG.state.usage[KG.today()] || 0) >= lim * 60;
};

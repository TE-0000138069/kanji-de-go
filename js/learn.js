// 保存と学習の仕組み（間隔反復・にがてリスト・問題の選び方）
window.KG = window.KG || {};

const STORE_KEY = 'kanjiDeGo.v1';
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

function defaultState() {
  return {
    profile: null, // { nickname, grade }
    settings: {
      control: 'tap', oneHand: false, hand: 'right', slow: false,
      se: 0.7, bgm: 0.5, voice: true, textSize: 1, shake: true, bgSpeed: 1,
    },
    parent: { timeLimit: 0, breakEvery: 20, customKanji: [] },
    progress: {},  // 字 -> { read: {...}, write: {...} }
    attempts: [],  // 1問ごとの記録
    stages: {},    // ステージID -> { stars, best }
    stamps: [],    // スタンプをもらった日の一覧（ドライブ1回ごと）
    carColor: 'red',
    difficulty: 3,
    recent: [],    // 直近の結果（1=すっきり正解 0=それ以外）
    usage: {},     // 日付 -> 秒
  };
}

KG.load = function () {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      const d = defaultState();
      KG.state = { ...d, ...s, settings: { ...d.settings, ...s.settings }, parent: { ...d.parent, ...s.parent } };
      return;
    }
  } catch (e) { console.warn(e); }
  KG.state = defaultState();
};

KG.save = function () {
  const s = KG.state;
  if (s.attempts.length > 5000) s.attempts = s.attempts.slice(-5000);
  localStorage.setItem(STORE_KEY, JSON.stringify(s));
};

KG.resetAll = function () {
  localStorage.removeItem(STORE_KEY);
  KG.state = defaultState();
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
  const cands = KG.qByKanji[ch].filter(q => !usedIds.has(q.id));
  if (!cands.length) return null;
  // 今日まだ正解していない問題を優先し、難易度が近いものを選ぶ
  cands.sort((a, b) => {
    const da = (doneToday.includes(a.id) ? 10 : 0) + Math.abs(a.difficulty - target) + Math.random() * 0.5;
    const db = (doneToday.includes(b.id) ? 10 : 0) + Math.abs(b.difficulty - target) + Math.random() * 0.5;
    return da - db;
  });
  return cands[0];
}

// stage: { kind: 'normal'|'weak'|'custom', chars: [...] }
KG.pickDriveQuestions = function (stage, count = 10) {
  const today = KG.today();
  const prog = c => KG.state.progress[c];
  const seen = KG.allChars.filter(c => prog(c) && prog(c).read.seen);
  const chosen = [];
  const add = list => {
    for (const c of list) {
      if (chosen.length >= count) break;
      if (!chosen.includes(c)) chosen.push(c);
    }
  };
  // 今日1問だけ正解していて、確認待ちの字
  const pending = seen.filter(c => {
    const sk = prog(c).read;
    return sk.todayDay === today && sk.todayQ.length === 1 && sk.lastUpDay !== today;
  });
  const due = seen.filter(c => prog(c).read.due && prog(c).read.due <= today)
    .sort((a, b) => prog(a).read.due.localeCompare(prog(b).read.due));
  const weak = shuffle(seen.filter(c => KG.isWeak(c)));

  if (stage.kind === 'weak') {
    add(weak);
    add(seen.slice().sort((a, b) => prog(a).read.level - prog(b).read.level));
  } else if (stage.kind === 'custom') {
    add(shuffle(stage.chars.slice()));
  } else {
    const fresh = stage.chars.filter(c => !prog(c) || !prog(c).read.seen);
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

// ---- ステージ ----
KG.stageId = (courseId, idx) => `${courseId}-${idx}`;

KG.isStageOpen = function (courseId, idx) {
  if (idx === 0) return true;
  const prev = KG.state.stages[KG.stageId(courseId, idx - 1)];
  return !!prev && prev.stars >= 1;
};

KG.totalStars = function () {
  return Object.values(KG.state.stages).reduce((a, s) => a + (s.stars || 0), 0);
};

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

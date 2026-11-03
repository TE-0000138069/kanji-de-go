// 漢字でGO！ 問題データの組み立て
// 問題そのものは js/grades/g1.js 〜 g6.js にある（1行 = 1字）
//   字 | 読み問題の文 | 正 | 誤 | 漢字選び問題の文 | 正 | 誤 | まちがいの種類
// 読み問題：{ } で囲んだ部分の読みを答える
// 漢字選び問題：[ ] で囲んだ部分の漢字を選ぶ
// まちがいの種類：s=形が似ている h=同じ読み m=意味が近い e=よくある書きまちがい
window.KG = window.KG || {};
KG.GRADE_RAW = KG.GRADE_RAW || {};

// コース（見た目のテーマ）。学年ごとの字を、この3つに順番に分ける
KG.COURSE_DEFS = [
  { id: 'machi', name: 'まち', emoji: '🏙️', sky: ['#8fd3ff', '#d9f2ff'], grass: ['#8ed46b', '#7cc85a'] },
  { id: 'umi', name: 'うみ', emoji: '🌊', sky: ['#6ec6ff', '#e0f7ff'], grass: ['#f3dc9b', '#ead08a'] },
  { id: 'yama', name: 'やま', emoji: '⛰️', sky: ['#a4dcff', '#f0fbff'], grass: ['#6cbf5b', '#5daf4c'] },
];

// クリアすると あらわれる のりもののコース（同じ字を、だんだん むずかしく）
// lap：2＝2しゅうめ（時間が短い・むずかしい問題が多い）3＝3しゅうめ（もっと速い）
KG.EXTRA_DEFS = [
  { id: 'fune', name: 'ふね', emoji: '⛵', vehicle: 'ship', lap: 2, zones: 'fune', music: 'umi', map: 'umi', from: 'umi',
    hint: 'うみコースを ぜんぶ クリアすると…？', hello: 'うみの うえを すすもう！' },
  { id: 'hikoki', name: 'ひこうき', emoji: '✈️', vehicle: 'plane', lap: 3, zones: 'hikoki', music: 'yama', map: 'yama', from: 'yama',
    hint: 'やまコースを ぜんぶ クリアすると…？', hello: 'やまの うえの そらを とぼう！' },
  { id: 'sora', name: 'そら', emoji: '☁️', vehicle: 'plane', lap: 3, zones: 'sora', music: 'yama', map: 'yama', from: 'all', stageSize: 12,
    hint: 'ぜんぶの ステージを クリアすると…？', hello: 'くもの うえを とんでいこう！' },
];

KG.GRADES = [1, 2, 3, 4, 5, 6];
KG.STAGE_SIZE = 9;
KG.REASON_DIFF = { m: 1, s: 2, h: 3, e: 3 };

// すべての学年のデータを読みこむ
KG.buildData = function () {
  KG.kanji = {};          // 字 -> { char, grade, course, stage, order }
  KG.questions = [];
  KG.qByKanji = {};
  KG.coursesByGrade = {};
  KG.charsByGrade = {};
  let order = 0;
  for (const g of KG.GRADES) {
    const raw = KG.GRADE_RAW[g] || '';
    const chars = [];
    raw.trim().split('\n').forEach(line => {
      const f = line.split('|');
      if (f.length < 8) return;
      const [ch, rText, rOk, rNg, cText, cOk, cNg, reason] = f;
      if (KG.kanji[ch]) return;
      chars.push(ch);
      KG.kanji[ch] = { char: ch, grade: g, order: order++ };
      const qs = [
        { id: ch + '-R', kanji: ch, grade: g, type: 'reading', text: rText, correct: rOk, wrong: rNg, difficulty: 2 },
        { id: ch + '-C', kanji: ch, grade: g, type: 'choose', text: cText, correct: cOk, wrong: cNg, reason, difficulty: KG.REASON_DIFF[reason] || 2 },
      ];
      KG.qByKanji[ch] = qs;
      KG.questions.push(...qs);
    });
    KG.charsByGrade[g] = chars;
    // 3つのコースに分ける（例：160字 → 54・53・53字）
    const a = Math.ceil(chars.length / 3), b = Math.ceil((chars.length - a) / 2);
    const parts = [chars.slice(0, a), chars.slice(a, a + b), chars.slice(a + b)];
    KG.coursesByGrade[g] = KG.COURSE_DEFS.map((def, i) => {
      const cs = parts[i];
      const stages = [];
      for (let j = 0; j < cs.length; j += KG.STAGE_SIZE) stages.push(cs.slice(j, j + KG.STAGE_SIZE));
      cs.forEach((c, k) => Object.assign(KG.kanji[c], { course: def.id, stage: Math.floor(k / KG.STAGE_SIZE) }));
      return { ...def, grade: g, chars: cs, stages };
    });
  }
  KG.everyChar = Object.keys(KG.kanji);
};

// 学年を切りかえる。地図・図鑑・問題の選び方は、この学年の字が対象になる
// 保護者が「ドリルの順番」を入れているときは、その順番でステージを作る
KG.setGrade = function (g) {
  g = Math.max(1, Math.min(6, +g || 2));
  KG.grade = g;
  KG.allChars = KG.charsByGrade[g];
  const order = KG.state && KG.state.parent && KG.state.parent.drillOrder && KG.state.parent.drillOrder[g];
  if (order && order.length) {
    KG.courses = KG.coursesFromDrill(g, order);
    KG.stagePrefix = `g${g}d`;
  } else {
    KG.courses = KG.coursesByGrade[g];
    KG.stagePrefix = `g${g}`;
  }
};

// ドリルの「回」をステージにする。回の順に、まち・うみ・やまの3コースへ分ける
// order: [{ name: '1 てんき', chars: ['天', '気', ...] }, ...]
KG.coursesFromDrill = function (g, order) {
  const units = [];
  const used = new Set();
  for (const u of order) {
    const cs = u.chars.filter(c => KG.kanji[c] && !used.has(c));
    cs.forEach(c => used.add(c));
    // 1つの回に字が多いときは、12字ずつに分ける
    for (let i = 0; i < cs.length; i += 12) units.push({ name: u.name + (cs.length > 12 ? `（${i / 12 + 1}）` : ''), chars: cs.slice(i, i + 12) });
  }
  // ドリルに入っていない、この学年の字は「のこりの字」として最後に
  const rest = KG.charsByGrade[g].filter(c => !used.has(c));
  for (let i = 0; i < rest.length; i += 9) units.push({ name: 'のこりの字', chars: rest.slice(i, i + 9) });
  const a = Math.ceil(units.length / 3), b = Math.ceil((units.length - a) / 2);
  const parts = [units.slice(0, a), units.slice(a, a + b), units.slice(a + b)];
  return KG.COURSE_DEFS.map((def, i) => ({
    ...def, grade: g, drill: true,
    chars: parts[i].flatMap(u => u.chars),
    stages: parts[i].map(u => u.chars),
    stageNames: parts[i].map(u => u.name),
  }));
};

// ドリルの順番の入力を読む。1行が1回。「回の名前：字字字」または「字字字」
KG.parseDrillOrder = function (text, g) {
  const order = [], unknown = [], other = [];
  text.split(/\r?\n/).forEach((line, i) => {
    line = line.trim();
    if (!line) return;
    let name = '', body = line;
    const m = line.match(/^(.+?)[:：]\s*(.*)$/);
    if (m) { name = m[1].trim(); body = m[2]; }
    const chars = [];
    for (const ch of body) {
      if (!/[\u4e00-\u9fff]/.test(ch)) continue;
      if (!KG.kanji[ch]) { unknown.push(ch); continue; }
      if (KG.kanji[ch].grade !== g) other.push(ch);
      chars.push(ch);
    }
    if (chars.length) order.push({ name: name || `${order.length + 1}かい`, chars });
  });
  return { order, unknown: [...new Set(unknown)], other: [...new Set(other)] };
};

// ドリルの例文の入力を読む。1行が1問。「字｜文｜正しい読み｜まちがいの読み」
KG.parseDrillExamples = function (text) {
  const qs = {}, errors = [];
  text.split(/\r?\n/).forEach((line, i) => {
    line = line.trim();
    if (!line) return;
    const f = line.split(/[|｜]/).map(x => x.trim());
    const [ch, sentence, ok, ng] = f;
    if (f.length < 4 || !ch || !sentence || !ok || !ng) { errors.push(`${i + 1}行め：「字｜文｜正しい読み｜まちがいの読み」の形にしてください`); return; }
    if (!KG.kanji[ch]) { errors.push(`${i + 1}行め：「${ch}」は小学校で習う字ではありません`); return; }
    if (!sentence.includes(ch)) { errors.push(`${i + 1}行め：文の中に「${ch}」がありません`); return; }
    if (ok === ng) { errors.push(`${i + 1}行め：正しい読みと まちがいの読みが同じです`); return; }
    (qs[ch] = qs[ch] || []).push({ sentence, ok, ng });
  });
  return { qs, errors };
};

// 保護者が入れた例文を、問題の形にする（読みの問題）
KG.drillQuestions = function (ch) {
  const list = KG.state && KG.state.parent && KG.state.parent.drillExamples && KG.state.parent.drillExamples[ch];
  if (!list) return [];
  return list.map((e, i) => ({
    id: `${ch}-U${i}`, kanji: ch, grade: KG.kanji[ch].grade, type: 'reading', custom: true,
    text: e.sentence.replace(ch, `{${ch}}`), correct: e.ok, wrong: e.ng, difficulty: 2,
  }));
};

KG.buildData();
KG.setGrade(2);

// 問題文から { } や [ ] を取りのぞいた文
KG.plainText = function (q) {
  return q.text.replace(/[{}\[\]]/g, '');
};

// 不正解のときの解説
KG.explain = function (q) {
  if (q.type === 'reading') {
    const word = (q.text.match(/\{(.+?)\}/) || [])[1] || q.kanji;
    return `「${word}」は「${q.correct}」と よむよ。`;
  }
  const yomi = (q.text.match(/\[(.+?)\]/) || [])[1] || '';
  const note = { s: 'かたちが にているね。', h: 'よみが おなじだね。', m: 'いみが にているね。', e: 'よく まちがえるところだよ。' }[q.reason] || '';
  return `「${yomi}」は「${q.correct}」と かくよ。「${q.wrong}」と ${note}`;
};

// ---- のりもののコース（ふね・ひこうき・そら）----
KG.courseCleared = c => c.stages.every((_, i) => (KG.state.stages[KG.stageId(c.id, i)] || {}).stars >= 1);

// いまの学年の、のりもののコース。open：あらわれているか
KG.extraCourses = function () {
  const base = id => KG.courses.find(c => c.id === id);
  const list = [];
  for (const def of KG.EXTRA_DEFS) {
    let chars, stages;
    if (def.from === 'all') {
      chars = KG.courses.flatMap(c => c.chars);
      stages = [];
      for (let j = 0; j < chars.length; j += def.stageSize) stages.push(chars.slice(j, j + def.stageSize));
    } else {
      const b = base(def.from);
      if (!b) continue;
      chars = b.chars;
      stages = b.stages;
    }
    list.push({ ...def, grade: KG.grade, chars, stages, extra: true });
  }
  // あらわれる条件
  const done = id => { const c = base(id) || list.find(x => x.id === id); return !!c && KG.courseCleared(c); };
  for (const c of list) {
    c.open = c.from === 'all'
      ? KG.courses.every(KG.courseCleared) && list.filter(x => x.from !== 'all').every(x => done(x.id))
      : done(c.from);
  }
  return list;
};

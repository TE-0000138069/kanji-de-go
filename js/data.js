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
KG.setGrade = function (g) {
  g = Math.max(1, Math.min(6, +g || 2));
  KG.grade = g;
  KG.courses = KG.coursesByGrade[g];
  KG.allChars = KG.charsByGrade[g];
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

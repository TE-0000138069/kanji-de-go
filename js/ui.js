// 画面の切り替えと、各画面の動き
window.KG = window.KG || {};

KG.load();
KG.FONT = getComputedStyle(document.documentElement).getPropertyValue('--font').trim() || 'sans-serif';
KG.state.settings.tiltInvert = !!KG.state.settings.tiltInvert;

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const stars = (n, max = 3) => '★'.repeat(n) + '<span class="off">' + '★'.repeat(max - n) + '</span>';

const MENU_MUSIC = ['home', 'map', 'zukan', 'garage', 'stamp', 'settings', 'setup', 'pitin', 'profiles'];
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
  if (MENU_MUSIC.includes(id)) KG.music.play('menu');
  else if (id === 'parent' || id === 'lock') KG.music.stop(0.5);
  const r = renderers[id];
  if (r) r(...args);
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-go]');
  if (!b) return;
  KG.audio.unlock();
  const go = b.dataset.go;
  $('#limitModal').hidden = true;
  if (go === 'start') show(!KG.profiles.list.length ? 'setup' : KG.profiles.list.length > 1 || !KG.state.profile ? 'profiles' : 'home');
  else show(go);
});

// ---------------- 各画面 ----------------
const renderers = {
  setup() {
    $$('#setupGrade button').forEach(b => {
      b.onclick = () => { $$('#setupGrade button').forEach(x => x.classList.remove('on')); b.classList.add('on'); };
    });
    $('#setupName').value = '';
    $('#setupCancel').hidden = !KG.profiles.list.length;
    $('#setupCancel').onclick = () => show('profiles');
    $('#setupOk').onclick = () => {
      const name = $('#setupName').value.trim() || 'ドライバー';
      const grade = +($('#setupGrade .on') || { dataset: { v: 2 } }).dataset.v;
      KG.createProfile(name, grade);
      resetUiForProfile();
      show('home');
    };
  },

  // だれが あそぶ？
  profiles() {
    const list = KG.profiles.list;
    $('#profileList').innerHTML = list.map(x => `
      <button class="profile-card ${x.id === KG.profiles.active ? 'now' : ''}" data-id="${x.id}">
        <span class="pc-car" style="--c:${x.color || '#ff5a4f'}"></span>
        <b>${esc(x.name)}</b>
        <small>${x.grade}ねんせい</small>
        <small><i class="ico ico-star"></i> ${x.stars || 0}　<i class="ico ico-fuel"></i> ${x.stamps || 0}</small>
      </button>`).join('') + `
      <button class="profile-card add" id="profileAdd"><span class="pc-plus">＋</span><b>あたらしく ふやす</b><small>きょうだいを ついか</small></button>`;
    $$('#profileList .profile-card[data-id]').forEach(b => (b.onclick = () => {
      KG.switchProfile(b.dataset.id);
      resetUiForProfile();
      KG.audio.select('R');
      toast(`${KG.state.profile.nickname} さん、いらっしゃい！`);
      show('home');
    }));
    $('#profileAdd').onclick = () => show('setup');
  },

  home() {
    const p = KG.state.profile;
    if (!p) { show(KG.profiles.list.length ? 'profiles' : 'setup'); return; }
    $('#userBtn').innerHTML = `👤 ${esc(p.nickname)}　<small>かえる</small>`;
    $('#homeHello').textContent = `${p.nickname} さん（${KG.grade}ねんせい）、どこへ いく？`;
    $('#homeStars').textContent = `⭐ ${KG.totalStars()}`;
    $('#homeMastered').textContent = `📖 おぼえた字 ${KG.allChars.filter(KG.isMastered).length} / ${KG.allChars.length}`;
    const rk = KG.rankOf();
    $('#homeRank').innerHTML = `<i class="ico ico-medal"></i> <b style="color:${rk.rank.color}">${rk.rank.name}</b> ドライバー
      <span class="rk-bar"><i style="width:${Math.round(rk.progress * 100)}%"></i></span>${rk.next ? `<small>${rk.next.name}まで あと ${rk.toNext}</small>` : '<small>さいこうランク！</small>'}`;
    const dl = KG.daily();
    $('#homeDaily').innerHTML = `<b>きょうの ミッション</b>` + dl.list.map(m => `<div class="${m.ok ? 'ok' : ''}">${m.ok ? '✅' : '⬜'} ${esc(m.text)} <small>${m.v}/${m.need}</small></div>`).join('') +
      (dl.done && !dl.opened ? '<button class="btn small" id="dailyBox"><i class="ico ico-box"></i> ふしぎな はこを あける</button>' : dl.opened ? '<div class="done">🎉 きょうは ぜんぶ たっせい！</div>' : '');
    if ($('#dailyBox')) $('#dailyBox').onclick = openBox;
    $('#limitModal').hidden = !KG.overTimeLimit();
  },

  map() {
    $('#mapTitle').textContent = `ちず（${KG.grade}ねんせいの かんじ）`;
    const cleared = c => c.stages.filter((_, i) => (KG.state.stages[KG.stageId(c.id, i)] || {}).stars >= 1).length;
    // コースのタブ：どこまで進んだかも見せる
    const tabs = $('#courseTabs');
    tabs.innerHTML = KG.courses.map(c => {
      const n = cleared(c), all = n === c.stages.length;
      return `<button data-c="${c.id}" class="${c.id === ui.course ? 'on' : ''}">${c.emoji} ${c.name} <small>${all ? '★クリア！' : `${n}/${c.stages.length}`}</small></button>`;
    }).join('');
    tabs.querySelectorAll('button').forEach(b => (b.onclick = () => { ui.course = b.dataset.c; renderers.map(); }));
    const course = KG.courses.find(c => c.id === ui.course) || KG.courses[0];

    // ステージの記録
    const recs = course.stages.map((_, i) => KG.state.stages[KG.stageId(course.id, i)] || { stars: 0 });
    let current = recs.findIndex(r => !(r.stars >= 1));
    if (current < 0) current = course.stages.length; // ぜんぶクリア → 車はにがてトンネルへ
    const stars = recs.reduce((a, r) => a + (r.stars || 0), 0);
    const done = cleared(course);
    const pct = Math.round((done / course.stages.length) * 100);
    const gradeStages = KG.courses.reduce((a, c) => a + c.stages.length, 0);
    const gradeDone = KG.courses.reduce((a, c) => a + cleared(c), 0);
    $('#mapProgress').innerHTML = `
      <div class="mp-row"><b>${course.emoji} ${course.name}コース</b> クリア ${done} / ${course.stages.length}
        <span class="mp-bar"><i style="width:${pct}%"></i></span> <i class="ico ico-star"></i> ${stars} / ${course.stages.length * 3}</div>
      <div class="mp-row small">${KG.grade}ねんせい ぜんぶで ${gradeDone} / ${gradeStages} ステージ${gradeDone === gradeStages ? '　🏆 コンプリート！' : ''}</div>`;

    // よみで はしる／かきで はしる
    const mode = KG.state.driveMode === 'write' ? 'write' : 'read';
    $('#modeSwitch').innerHTML = `<button data-m="read" class="${mode === 'read' ? 'on' : ''}">📖 よみで はしる</button><button data-m="write" class="${mode === 'write' ? 'on' : ''}">✏️ かきで はしる</button>`;
    $$('#modeSwitch button').forEach(b => (b.onclick = () => {
      KG.state.driveMode = b.dataset.m;
      KG.save();
      KG.audio.select('R');
      toast(b.dataset.m === 'write' ? '✏️ かきで はしるよ！ わかれみちで かんじを かこう' : '📖 よみで はしるよ！ ただしい みちを えらぼう');
      renderers.map();
    }));

    // おうちの人コース
    const custom = KG.state.parent.customKanji.filter(c => KG.kanji[c]);
    $('#mapExtra').innerHTML = custom.length ? `<button class="btn small" id="customGo"><i class="ico ico-house"></i> おうちの人コース（${esc(custom.slice(0, 5).join(''))}${custom.length > 5 ? '…' : ''}）</button>` : '';
    if (custom.length) $('#customGo').onclick = () => startDrive({ kind: 'custom', id: 'custom', course, chars: custom });

    // 地図
    const starsHtml = n => Array.from({ length: 3 }, (_, j) => `<i class="ico ico-star ${j < n ? '' : 'off'}"></i>`).join('');
    const nodes = course.stages.map((chars, i) => {
      const st = i < current ? 'cleared' : i === current ? 'current' : 'locked';
      const label = course.stageNames ? course.stageNames[i] : chars.join('');
      return {
        cls: st,
        disabled: st === 'locked',
        stars: recs[i].stars || 0,
        html: st === 'locked'
          ? `<span class="nn"><i class="ico ico-lock"></i></span><span class="nl">？？？</span>`
          : `${st === 'current' ? '<span class="next">NEXT!</span>' : ''}<span class="nn">${i + 1}</span><span class="nl">${esc(label)}</span><span class="ns">${starsHtml(recs[i].stars || 0)}</span>`,
        onPick: () => startDrive({ kind: 'normal', id: KG.stageId(course.id, i), idx: i, course, chars }),
      };
    });
    const weakN = KG.allChars.filter(KG.isWeak).length;
    nodes.push({
      boss: true, cls: 'boss',
      html: `<span class="nn">🌀</span><span class="nl">にがてトンネル</span><span class="ns small">にがて ${weakN}こ</span>`,
      onPick: () => startDrive({ kind: 'weak', id: `${course.id}-boss`, course, chars: [] }),
    });
    // 前に見たときより進んでいたら、車が走る演出
    const key = KG.stagePrefix + '-' + course.id;
    const from = KG.state.mapSeen[key];
    const celebrate = () => {
      KG.audio.comboFanfare(5);
      toast(current >= course.stages.length ? `${course.name}コース クリア！ おめでとう！` : 'あたらしい ステージが ひらいたよ！');
    };
    requestAnimationFrame(() => KG.MapView.render({ world: $('#mapWorld'), canvas: $('#mapCanvas'), course: course.id, nodes, current, from: from == null ? current : from, celebrate }));
    KG.state.mapSeen[key] = current;
    KG.save();
  },

  result(data) {
    const { results, elapsed, starsN, isBest, noMiss, mode, coins = 0, missionResults = [], rankUp, dailyDone, boss, bossWin } = data;
    const extra = [];
    if (boss) extra.push(bossWin ? '👾 かんじモンスターを やっつけた！' : '👾 モンスターに にげられた… つぎこそ！');
    if (rankUp) extra.push(`<i class="ico ico-medal"></i> ランクアップ！ <b style="color:${rankUp.color}">${rankUp.name}</b> ドライバーに なった！`);
    if (dailyDone) extra.push('<i class="ico ico-box"></i> きょうの ミッション たっせい！ ホームで はこを あけよう');
    $('#resExtra').innerHTML = extra.map(x => `<div>${x}</div>`).join('');
    if (rankUp || bossWin) setTimeout(() => KG.audio.comboFanfare(8), 1800);
    $('#resCoins').textContent = `${coins}まい`;
    $('#resMissions').innerHTML = missionResults.map(m => `<div class="${m.now ? 'ok' : m.before ? 'was' : 'ng'}">
      <span>${m.now ? '✅' : m.before ? '☑️' : '⬜'}</span> ${esc(m.text)} ${m.isNew ? '<b class="new">NEW!</b>' : ''}</div>`).join('');
    const correct = results.filter(r => r.result === 'correct').length;
    $('#resTitle').textContent = boss ? (bossWin ? 'モンスター たいじ！' : 'ゴール！') : noMiss ? 'ノーミス ゴール！' : 'ゴール！';
    $('#resStars').innerHTML = '<span class="off">★★★</span>';
    for (let i = 0; i < starsN; i++) {
      setTimeout(() => {
        $('#resStars').innerHTML = Array.from({ length: 3 }, (_, j) => j <= i ? `<span class="${j === i ? 'pop' : ''}">★</span>` : '<span class="off">★</span>').join('');
        KG.audio.star(i);
      }, 500 + i * 450);
    }
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
    // よみで走ったら書きの練習、かきで走ったら読みの練習
    const pitMode = mode === 'write' ? 'read' : 'write';
    const pit = pitMode === 'read' ? KG.pickPitinReadChars(missed) : KG.pickPitinChars(missed);
    $('#resNext').textContent = pit.length ? (pitMode === 'read' ? 'ピットイン（よみ）へ ▶' : 'ピットイン（かき）へ ▶') : 'スタンドへ ▶';
    $('#resNext').onclick = () => (pit.length ? show('pitin', pit, pitMode) : show('stamp', true));
  },

  pitin(chars, pitMode = 'write') {
    const root = $('#scr-pitin');
    const read = pitMode === 'read';
    $('#pitinRead').hidden = !read;
    root.querySelector('.pitin-body').hidden = read;
    root.querySelector('.pitin-btns').hidden = read;
    root.querySelector('.topbar h2').firstChild.textContent = read ? '🔧 ピットイン（よみ） ' : '🔧 ピットイン（かき） ';
    if (read) new KG.PitinRead(root, chars, () => show('stamp', true));
    else ui.pitin = new KG.Pitin(root, chars, () => show('stamp', true));
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
    renderNextReward($('#stampNext'));
    if (KG.newRewards().length) setTimeout(showReward, fresh ? 1100 : 300);
  },

  zukan() {
    const tabs = $('#zukanTabs');
    tabs.innerHTML = KG.courses.map(c => `<button data-c="${c.id}" class="${c.id === ui.zukanCourse ? 'on' : ''}">${c.emoji} ${c.name}</button>`).join('')
      + (KG.RADICALS ? `<button data-c="bushu" class="${ui.zukanCourse === 'bushu' ? 'on' : ''}">🃏 ぶしゅカード</button>` : '');
    tabs.querySelectorAll('button').forEach(b => (b.onclick = () => { ui.zukanCourse = b.dataset.c; renderers.zukan(); }));
    if (ui.zukanCourse === 'bushu') return renderBushu();
    const course = KG.courses.find(c => c.id === ui.zukanCourse) || KG.courses[0];
    ui.zukanCourse = course.id;
    $('#zukanGrid').className = 'zukan-grid';
    $('#zukanCount').textContent = `${KG.grade}ねんせい おぼえた字 ${KG.allChars.filter(KG.isMastered).length} / ${KG.allChars.length}`;
    $('#zukanGrid').innerHTML = course.chars.map(ch => {
      const s = KG.starsOf(ch);
      const seen = metChar(ch);
      return `<div class="zcell ${seen ? '' : 'unseen'} ${KG.isWeak(ch) ? 'weak' : ''}" data-k="${esc(ch)}"><span class="k">${seen ? esc(ch) : '？'}</span><span class="s">${'★'.repeat(s)}${'☆'.repeat(3 - s)}</span></div>`;
    }).join('');
    $$('#zukanGrid .zcell').forEach(c => (c.onclick = () => openStroke(c.dataset.k)));
  },

  garage() {
    const total = KG.totalStars(), stamps = KG.state.stamps.length;
    $('#garageStars').innerHTML = `<i class="ico ico-star"></i> ${total}　<i class="ico ico-fuel"></i> ${stamps}　<i class="ico ico-coin"></i> ${KG.state.coins || 0}`;
    showPreview($('#garagePreview'), KG.carLook());
    renderNextReward($('#garageNext'));
    ui.garageSlot = ui.garageSlot || 'paint';
    $('#garageTabs').innerHTML = KG.CAR_SLOTS.map(s => `<button data-s="${s.id}" class="${s.id === ui.garageSlot ? 'on' : ''}">${s.name}</button>`).join('');
    $$('#garageTabs button').forEach(b => (b.onclick = () => { ui.garageSlot = b.dataset.s; renderers.garage(); }));
    const parts = KG.carLook();
    let items = [];
    if (ui.garageSlot === 'paint') {
      items = KG.CAR_COLORS.map(c => ({
        key: 'c:' + c.id, name: c.name, html: `<span class="sw" style="background:${c.color}"></span>`,
        locked: total < c.stars, lockText: `<i class="ico ico-star"></i>${c.stars}で ひらく`,
        on: parts.paint === 'color' && KG.state.carColor === c.id,
        pick: () => { KG.state.carColor = c.id; KG.state.carParts.paint = 'color'; },
      }));
      // コインのお店
      const coins = KG.state.coins || 0;
      for (const c of KG.SHOP_COLORS) {
        const owned = (KG.state.shopOwned || []).includes(c.id);
        items.push({
          key: 's:' + c.id, name: c.name, html: `<span class="sw" style="background:${c.color}"></span>`,
          shop: !owned, price: c.price, canBuy: coins >= c.price,
          on: parts.paint === 'color' && KG.state.carColor === c.id,
          pick: () => {
            if (!owned) {
              if (coins < c.price) { toast(`コインが あと ${c.price - coins}まい たりないよ`); return false; }
              if (!confirm(`コイン ${c.price}まいで「${c.name}」を かいますか？`)) return false;
              KG.state.coins -= c.price;
              KG.state.shopOwned = (KG.state.shopOwned || []).concat(c.id);
              KG.audio.stamp();
              toast(`「${c.name}」を かったよ！`);
            }
            KG.state.carColor = c.id; KG.state.carParts.paint = 'color';
          },
        });
      }
    } else {
      const none = { body: 'ふつうの くるま', wheel: 'ふつうの タイヤ', roof: 'なし', decal: 'なし' }[ui.garageSlot];
      items.push({ key: 'none', name: none, html: ui.garageSlot === 'body' ? '<i class="ico ico-car"></i>' : '<span class="none">－</span>', on: parts[ui.garageSlot] === KG.CAR_DEFAULT[ui.garageSlot], pick: () => { KG.state.carParts[ui.garageSlot] = KG.CAR_DEFAULT[ui.garageSlot]; } });
    }
    for (const it of KG.CAR_ITEMS.filter(x => x.slot === ui.garageSlot)) {
      items.push({
        key: it.id, name: it.name, html: `<i class="ico ico-${it.ico}"></i>`,
        locked: !KG.itemOpen(it), lockText: `<i class="ico ico-fuel"></i>あと ${it.need - stamps}こ`,
        on: parts[it.slot] === it.id, pick: () => { KG.state.carParts[it.slot] = it.id; },
      });
    }
    $('#garageList').innerHTML = items.map((it, i) => `<button class="garage-item ${it.on ? 'sel' : ''} ${it.locked ? 'locked' : ''} ${it.shop ? 'shop' : ''}" data-i="${i}" ${it.locked ? 'disabled' : ''}>
      ${it.html}${esc(it.name)}<small>${it.locked ? it.lockText : it.on ? 'つけている' : it.shop ? `<i class="ico ico-coin"></i>${it.price}まいで かう` : ''}</small></button>`).join('');
    $$('#garageList .garage-item').forEach(b => (b.onclick = () => { if (items[+b.dataset.i].pick() === false) return; KG.save(); KG.audio.select('R'); renderers.garage(); }));
  },

  settings() {
    const s = KG.state.settings;
    const rows = [
      { key: 'control', label: 'そうさ', opts: [['tap', 'タップ'], ['tilt', 'かたむける']], sub: 'タップ：がめんの ひだり・みぎを さわる　かたむける：iPadを ハンドルのように まわす' },
      { key: 'tiltInvert', label: 'かたむける むきを はんたいにする', opts: [[false, 'しない'], [true, 'する']] },
      { key: 'oneHand', label: 'かたてボタン', opts: [[false, 'なし'], [true, 'あり']], sub: 'おすたびに ひだり・みぎが いれかわる ボタン' },
      { key: 'hand', label: 'かたてボタンの ばしょ', opts: [['left', 'ひだり'], ['right', 'みぎ']] },
      { key: 'slow', label: 'ゆっくりモード', opts: [[false, 'なし'], [true, 'あり']], sub: 'わかれみちの てまえで とまって まってくれる' },
      { key: 'grade', label: 'なんねんせい？（でる かんじと はやさが かわるよ）', opts: [1, 2, 3, 4, 5, 6].map(g => [g, String(g)]) },
      { key: 'bgm', label: 'BGM（おんがく）', opts: [[0, 'なし'], [0.3, 'ちいさい'], [0.5, 'ふつう'], [0.8, 'おおきい']] },
      { key: 'se', label: 'こうかおん', opts: [[0, 'なし'], [0.4, 'ちいさい'], [0.7, 'ふつう'], [1, 'おおきい']] },
      { key: 'voice', label: 'よみあげ', opts: [[true, 'あり'], [false, 'なし']] },
      { key: 'textSize', label: 'もじの おおきさ', opts: [[1, 'ふつう'], [1.2, 'おおきい'], [1.4, 'とても おおきい']] },
      { key: 'graphics', label: 'ドライブの がめん', opts: [['3d', 'ブロック3D'], ['2d', 'かるい2D']], sub: 'うごきが カクカクするときは「かるい2D」に してね' },
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
      if (r.key === 'grade') {
        KG.state.profile.grade = v;
        KG.setGrade(v);
        ui.course = 'machi';
        ui.zukanCourse = 'machi';
        ui.customGrade = v;
        toast(`${v}ねんせいの かんじに かえたよ！`);
      }
      else s[r.key] = v;
      if (r.key === 'textSize') applyTextSize();
      if (r.key === 'se' || r.key === 'bgm') { KG.audio.applyVolumes(); if (r.key === 'se') KG.audio.select('R'); }
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
        if (+ans === a + b) { ui.customGrade = KG.grade; show('parent'); return; }
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

window.addEventListener('resize', () => {
  if (ui.current !== 'map') return;
  clearTimeout(ui.mapResize);
  ui.mapResize = setTimeout(() => renderers.map(), 200);
});

// ---------------- ドリルの写真から読み取る ----------------
const API_KEY_STORE = 'kanjiDeGo.apiKey'; // 学習データとは別に保存（書き出しにも入れない）
const GEMINI_KEY_STORE = 'kanjiDeGo.geminiKey';
const AI_PROVIDER_STORE = 'kanjiDeGo.aiProvider';
const aiProvider = () => localStorage.getItem(AI_PROVIDER_STORE) === 'gemini' ? 'gemini' : 'claude';
const keyStore = p => (p === 'gemini' ? GEMINI_KEY_STORE : API_KEY_STORE);
const aiKey = p => localStorage.getItem(keyStore(p)) || '';
ui.drillPhotos = [];

function setupPhotoReader(g) {
  const list = $('#photoList');
  const draw = () => {
    $('#photoCount').textContent = ui.drillPhotos.length ? `${ui.drillPhotos.length}ページ` : '';
    list.innerHTML = ui.drillPhotos.map((p, i) => `<div class="photo"><img src="${p.url}" alt=""><b>${i + 1}</b>
      <span><button data-a="up" data-i="${i}">◀</button><button data-a="down" data-i="${i}">▶</button><button data-a="del" data-i="${i}">✕</button></span></div>`).join('');
    list.querySelectorAll('button').forEach(b => (b.onclick = () => {
      const i = +b.dataset.i, a = b.dataset.a, P = ui.drillPhotos;
      if (a === 'del') { URL.revokeObjectURL(P[i].url); P.splice(i, 1); }
      if (a === 'up' && i > 0) [P[i - 1], P[i]] = [P[i], P[i - 1]];
      if (a === 'down' && i < P.length - 1) [P[i + 1], P[i]] = [P[i], P[i + 1]];
      draw();
    }));
  };
  const add = e => {
    for (const f of e.target.files) ui.drillPhotos.push({ file: f, url: URL.createObjectURL(f) });
    e.target.value = '';
    draw();
  };
  $('#photoCam').onchange = add;
  $('#photoLib').onchange = add;
  draw();

  $$('#aiProvider button').forEach(b => (b.onclick = () => { localStorage.setItem(AI_PROVIDER_STORE, b.dataset.p); parentTabs.drill(); }));
  $('#apiKeySave').onclick = () => { localStorage.setItem(keyStore(aiProvider()), $('#apiKey').value.trim()); toast('APIキーを保存しました'); };
  $('#apiKeyClear').onclick = () => { localStorage.removeItem(keyStore(aiProvider())); $('#apiKey').value = ''; toast('APIキーを消しました'); };

  $('#photoRead').onclick = async () => {
    const msg = $('#photoMsg');
    const provider = aiProvider();
    const apiKey = ($('#apiKey').value || '').trim() || aiKey(provider);
    if (!KG.drillAI) { msg.textContent = 'AIの読み取り機能を読みこめませんでした。インターネットにつないで、アプリを開き直してください。'; return; }
    if (!ui.drillPhotos.length) { msg.textContent = 'まず、ドリルのページを撮ってください。'; return; }
    if (!apiKey) { msg.textContent = 'APIキーを入れてください。'; return; }
    if (!navigator.onLine) { msg.textContent = 'インターネットにつながっていません。'; return; }
    localStorage.setItem(keyStore(provider), apiKey);
    const btn = $('#photoRead');
    btn.disabled = true;
    try {
      const { data, usage } = await KG.drillAI.extract({ provider, apiKey, files: ui.drillPhotos.map(p => p.file), grade: g, onProgress: t => (msg.textContent = t) });
      // 1. 順番：アプリにない字（小学校で習わない字）は外す
      const units = (data.units || []).map(u => ({ name: String(u.name || '').replace(/[:：\n]/g, ' ').trim(), chars: (u.kanji || []).join('').split('').filter(c => KG.kanji[c]) })).filter(u => u.chars.length);
      const orderText = units.map(u => `${u.name || ''}：${u.chars.join('')}`).join('\n');
      // 2. 例文：形が正しいものだけ
      const exLines = (data.examples || []).filter(e => KG.kanji[e.kanji] && e.sentence && e.sentence.includes(e.kanji) && e.reading && e.wrong_reading && e.reading !== e.wrong_reading)
        .map(e => `${e.kanji}｜${e.sentence.replace(/[|｜]/g, ' ')}｜${e.reading}｜${e.wrong_reading}`);
      const add = (id, text) => { const t = $(id); t.value = (t.value.trim() ? t.value.trim() + '\n' : '') + text; };
      if (orderText) add('#drillOrder', orderText);
      if (exLines.length) add('#drillEx', exLines.join('\n'));
      const yen = KG.drillAI.estimateYen(provider, usage);
      msg.innerHTML = `<b>読み取りました：${units.length}回・${units.reduce((a, u) => a + u.chars.length, 0)}字、例文${exLines.length}問</b>（${provider === 'gemini' ? `有料プランなら約${yen}円・無料枠なら0円` : `料金の目安：約${yen}円`}）<br>
        1・2 の欄に追加しました。内容を確かめてから、それぞれ「保存」を押してください。` + (data.notes ? `<br>AIからのメモ：${esc(data.notes)}` : '');
    } catch (e) {
      msg.textContent = KG.drillAI.explainError(e);
    } finally {
      btn.disabled = false;
    }
  };

  // iPadの「テキスト認識表示」で写した文字から、漢字を拾う
  $('#pasteGo').onclick = () => {
    const units = [];
    let cur = null;
    for (const raw of $('#pasteText').value.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      // 「6回」「第3回」「12」などで始まる行は、回の区切り。区切りの部分の字（回など）は拾わない
      const mark = line.match(/^(第?[0-9０-９一二三四五六七八九十]+回|[0-9０-９]+)/);
      if (mark || !cur) { cur = { name: line.slice(0, 12), chars: [] }; units.push(cur); }
      for (const ch of mark ? line.slice(mark[0].length) : line) if (KG.kanji[ch] && KG.kanji[ch].grade === g && !units.some(u => u.chars.includes(ch))) cur.chars.push(ch);
    }
    const good = units.filter(u => u.chars.length);
    if (!good.length) { toast(`${g}年生の漢字が見つかりませんでした`); return; }
    const t = $('#drillOrder');
    t.value = (t.value.trim() ? t.value.trim() + '\n' : '') + good.map(u => `${u.name.replace(/[:：]/g, ' ')}：${u.chars.join('')}`).join('\n');
    toast(`${good.length}回分を 1 に入れました。確かめてから保存してください`);
  };
}

// ---------------- 車のアイテム ----------------
// 回る車の表示（3Dが使えないときは、文字だけ）
function showPreview(box, look) {
  const pv = KG.getCarPreview && KG.getCarPreview();
  if (!pv) { box.innerHTML = '<div class="no3d">くるま</div>'; return; }
  pv.setLook(look);
  pv.mount(box);
}
function renderNextReward(el) {
  const it = KG.nextReward(), n = KG.state.stamps.length;
  if (!it) { el.innerHTML = '<i class="ico ico-crown"></i> アイテムを ぜんぶ あつめたよ！'; return; }
  const prev = KG.CAR_ITEMS.filter(x => x.need <= n).reduce((a, x) => Math.max(a, x.need), 0);
  const pct = Math.round(((n - prev) / (it.need - prev)) * 100);
  el.innerHTML = `つぎ：<i class="ico ico-${it.ico}"></i>${esc(it.name)} あと ${it.need - n}こ` + (el.classList.contains('garage-next') ? `<span class="bar"><i style="width:${pct}%"></i></span>` : '');
}
// 「アイテム ゲット！」をひとつずつ見せる
function showReward() {
  const it = KG.newRewards()[0];
  if (!it) return;
  const modal = $('#rewardModal');
  modal.hidden = false;
  $('#rewardName').innerHTML = `<i class="ico ico-${it.ico}"></i>${esc(it.name)}`;
  showPreview($('#rewardPreview'), KG.carLook({ [it.slot]: it.id }));
  KG.audio.goal();
  const done = equip => {
    if (equip) KG.state.carParts[it.slot] = it.id;
    KG.state.rewardsSeen.push(it.id);
    KG.save();
    modal.hidden = true;
    if (KG.newRewards().length) setTimeout(showReward, 300);
    else if (equip) toast('くるまが かわったよ！ ドライブで みてみよう');
  };
  $('#rewardEquip').onclick = () => done(true);
  $('#rewardLater').onclick = () => done(false);
}

// きょうのミッションを全部たっせいしたら、ふしぎな箱
function openBox() {
  const dl = KG.daily();
  if (!dl.done || dl.opened) return;
  const m = $('#boxModal');
  m.hidden = false;
  $('#boxMsg').textContent = 'はこを タップして あけてみよう！';
  $('#boxClose').hidden = true;
  $('#boxOpen').classList.remove('opened');
  $('#boxOpen').onclick = () => {
    if ($('#boxOpen').classList.contains('opened')) return;
    const n = KG.boxCoins();
    KG.state.coins = (KG.state.coins || 0) + n;
    KG.state.daily.opened = true;
    KG.save();
    $('#boxOpen').classList.add('opened');
    KG.audio.goal();
    $('#boxMsg').innerHTML = `<i class="ico ico-coin"></i> コイン ${n}まい ゲット！`;
    $('#boxClose').hidden = false;
  };
  $('#boxClose').onclick = () => { m.hidden = true; if (ui.current === 'home') renderers.home(); };
}

// ユーザーを切りかえたら、画面の状態（選んでいたコースなど）を元にもどす
// もう であった字か（読みでも書きでも）
function metChar(ch) {
  const p = KG.state.progress[ch];
  return !!(p && ((p.read && p.read.seen) || (p.write && p.write.seen)));
}

// ぶしゅカード：同じ部首の字を ぜんぶ であうと、カード かんせい
function renderBushu() {
  const pool = KG.GRADES.filter(g => g <= KG.grade).flatMap(g => KG.charsByGrade[g]);
  const groups = KG.radicalGroups(pool).filter(g => g.chars.length >= 2);
  const claimed = KG.state.radicalClaimed || (KG.state.radicalClaimed = []);
  const done = groups.filter(g => g.chars.every(metChar)).length;
  $('#zukanCount').textContent = `かんせい ${done} / ${groups.length}まい`;
  const grid = $('#zukanGrid');
  grid.className = 'bushu-grid';
  grid.innerHTML = groups.map(g => {
    const got = g.chars.filter(metChar).length;
    const full = got === g.chars.length;
    const reward = 20 + 5 * g.chars.length;
    const btn = full && !claimed.includes(g.r)
      ? `<button class="btn small bushu-claim" data-r="${esc(g.r)}"><i class="ico ico-coin"></i> ${reward}まい もらう</button>`
      : full ? '<span class="bushu-ok">✔ かんせい</span>' : `<span class="bushu-n">あと ${g.chars.length - got}字</span>`;
    return `<div class="bushu-card ${full ? 'full' : ''}">
      <div class="bushu-head"><span class="bushu-r">${esc(g.r)}</span><span class="bushu-name">${esc(g.name)}</span></div>
      <div class="bushu-bar"><i style="width:${(got / g.chars.length) * 100}%"></i></div>
      <div class="bushu-chips">${g.chars.map(c => metChar(c) ? `<span class="chip" data-k="${esc(c)}">${esc(c)}</span>` : '<span class="chip off">？</span>').join('')}</div>
      <div class="bushu-foot">${got} / ${g.chars.length}　${btn}</div>
    </div>`;
  }).join('');
  $$('#zukanGrid .chip[data-k]').forEach(c => (c.onclick = () => openStroke(c.dataset.k)));
  $$('#zukanGrid .bushu-claim').forEach(b => (b.onclick = () => {
    const g = groups.find(x => x.r === b.dataset.r);
    if (!g || claimed.includes(g.r)) return;
    claimed.push(g.r);
    const n = 20 + 5 * g.chars.length;
    KG.state.coins = (KG.state.coins || 0) + n;
    KG.save();
    KG.audio.goal();
    toast(`「${g.name || g.r}」カード かんせい！ コイン ${n}まい ゲット！`, 2600);
    renderBushu();
  }));
}

// 図鑑の字をタップ：書き順のアニメ・部首・例文
function openStroke(ch) {
  if (!metChar(ch)) { toast('まだ であっていない字だよ'); return; }
  const q = (KG.qByKanji[ch] || [])[0];
  if (!KG.Stroke || !KG.Stroke.has(ch)) {
    if (q) toast(q.text.replace(/\{(.+?)\}/, `$1（${q.correct}）`), 3000);
    return;
  }
  const m = $('#strokeModal');
  const n = KG.Stroke.strokes(ch).length;
  $('#smTitle').textContent = `${ch}（${n}かく）`;
  const rad = KG.RADICALS && KG.RADICALS[ch];
  const rname = rad ? KG.radicalName(rad) : '';
  $('#smInfo').innerHTML = (rad ? `ぶしゅ：<b>${esc(rad.r)}</b>${rname ? `（${esc(rname)}）` : ''}<br>` : '')
    + (q ? esc(q.text.replace(/\{(.+?)\}/, `$1（${q.correct}）`)) : '');
  let stop = null;
  const play = () => { if (stop) stop(); stop = KG.Stroke.animate($('#smCanvas'), ch, { perStroke: n > 12 ? 380 : 520 }); };
  $('#smReplay').onclick = play;
  $('#smClose').onclick = () => { if (stop) stop(); m.hidden = true; };
  m.hidden = false;
  play();
  if (q) KG.audio.speak(q.text.replace(/\{(.+?)\}/, q.correct));
}

function resetUiForProfile() {
  ui.course = 'machi';
  ui.zukanCourse = 'machi';
  ui.garageSlot = 'paint';
  ui.customGrade = null;
  ui.drillGrade = null;
  applyTextSize();
}

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
        <div class="kpi"><small>${KG.grade}年生の字で覚えた字（読み＋書き）</small><b>${mastered} / ${KG.allChars.length}</b></div>
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
    if (!ui.customGrade) ui.customGrade = KG.grade;
    const sel = new Set(KG.state.parent.customKanji);
    $('#parentBody').innerHTML = `
      <div class="card"><h3>出題する字を選ぶ（${sel.size}字選択中）</h3>
        <p>選んだ字は、地図の「おうちの人コース」で出題されます（例：今週の漢字テストの範囲）。</p>
        <div class="prow"><button class="btn small" id="customClear">すべて外す</button></div>
      </div>
      <div class="tabs" id="customGrades">${KG.GRADES.map(g => `<button data-g="${g}" class="${g === ui.customGrade ? 'on' : ''}">${g}年生${g === KG.grade ? '（いまの学年）' : ''}</button>`).join('')}</div>
      ${KG.coursesByGrade[ui.customGrade].map(c => `<div class="card"><h3>${c.emoji} ${c.name}コース</h3><div class="pick-grid">
        ${c.chars.map(ch => `<button class="${sel.has(ch) ? 'on' : ''}" data-k="${esc(ch)}">${esc(ch)}</button>`).join('')}
      </div></div>`).join('')}`;
    $$('.pick-grid button').forEach(b => (b.onclick = () => {
      const k = b.dataset.k;
      if (sel.has(k)) sel.delete(k); else sel.add(k);
      KG.state.parent.customKanji = KG.everyChar.filter(c => sel.has(c));
      KG.save();
      parentTabs.custom();
    }));
    $$('#customGrades button').forEach(b => (b.onclick = () => { ui.customGrade = +b.dataset.g; parentTabs.custom(); }));
    $('#customClear').onclick = () => { KG.state.parent.customKanji = []; KG.save(); parentTabs.custom(); };
  },

  drill() {
    ui.drillGrade = ui.drillGrade || KG.grade;
    const g = ui.drillGrade;
    const order = (KG.state.parent.drillOrder || {})[g] || [];
    const orderText = order.map(u => `${u.name}：${u.chars.join('')}`).join('\n');
    const ex = KG.state.parent.drillExamples || {};
    const exText = Object.entries(ex).filter(([c]) => KG.kanji[c] && KG.kanji[c].grade === g)
      .flatMap(([c, list]) => list.map(e => `${c}｜${e.sentence}｜${e.ok}｜${e.ng}`)).join('\n');
    $('#parentBody').innerHTML = `
      <div class="card"><h3>ドリルに合わせる</h3>
        <p>お子さんがお使いの漢字ドリルの順番や例文に合わせられます。ドリルを見ながら入力してください。
        入力した内容は、このiPadの中だけに保存されます。</p>
        <div class="tabs" id="drillGrades">${KG.GRADES.map(x => `<button data-g="${x}" class="${x === g ? 'on' : ''}">${x}年生${x === KG.grade ? '（いまの学年）' : ''}</button>`).join('')}</div>
      </div>
      <div class="card"><h3>0. 写真から読み取る（かんたん入力）</h3>
        <p>ドリルのページを撮ると、AI（${aiProvider() === 'gemini' ? 'Gemini' : 'Claude'}）が回ごとの漢字と例文を読み取って、下の 1・2 に入れます。
        内容を確かめてから「保存」を押してください。ページは何枚でも追加できます（撮った順＝ページの順）。</p>
        <div class="prow">
          <label class="btn small file-btn">📷 カメラで撮る<input type="file" accept="image/*" capture="environment" id="photoCam" hidden></label>
          <label class="btn small file-btn">🖼 アルバムから選ぶ<input type="file" accept="image/*" multiple id="photoLib" hidden></label>
          <span id="photoCount"></span>
        </div>
        <div id="photoList" class="photo-list"></div>
        <details class="api-box" ${aiKey(aiProvider()) ? '' : 'open'}>
          <summary>AIを使う設定（いま：${aiProvider() === 'gemini' ? 'Gemini' : 'Claude'}）</summary>
          <div class="seg" id="aiProvider">
            <button data-p="claude" class="${aiProvider() === 'claude' ? 'on' : ''}">Claude（Anthropic）</button>
            <button data-p="gemini" class="${aiProvider() === 'gemini' ? 'on' : ''}">Gemini（Google）</button>
          </div>
          ${aiProvider() === 'gemini'
            ? `<p class="note">Google AI Studio（aistudio.google.com）で作った Gemini のAPIキーを入れてください。<b>無料枠</b>で使えます（1日・1分あたりの回数に上限あり）。
               ただし無料枠では、送った写真がGoogleのサービス改善に使われることがあります（有料プランでは使われません）。名前などが写らないように撮ってください。
               モデル：${KG.drillAI ? KG.drillAI.geminiModel : '―'}</p>`
            : `<p class="note">Anthropic のAPIキー（sk-ant- で始まる文字）を入れてください。料金は使った分だけで、写真10枚で おおよそ数十円です。
               写真は読み取りのために Anthropic に送られます。モデル：${KG.drillAI ? KG.drillAI.model : '―'}</p>`}
          <p class="note">キーは このiPadの中だけに保存され、AIへの問い合わせにだけ使います（学習データの書き出しには入りません）。</p>
          <div class="prow"><input type="password" id="apiKey" placeholder="${aiProvider() === 'gemini' ? 'Gemini のAPIキー' : 'sk-ant-...'}" autocomplete="off" value="${esc(aiKey(aiProvider()))}">
            <button class="btn small" id="apiKeySave">キーを保存</button><button class="btn small danger" id="apiKeyClear">キーを消す</button></div>
        </details>
        <div class="prow"><button class="btn big" id="photoRead">写真を読み取る</button></div>
        <div id="photoMsg" class="drill-msg"></div>
        <details class="api-box">
          <summary>AIを使わない方法（iPadの「テキスト認識表示」）</summary>
          <p class="note">iPadのカメラやアルバムで写真の文字を長押しして「すべてを選択」→「コピー」し、下に貼り付けてください。
          漢字を拾って、1 の欄に入れます（数字や「回」で始まる行を、回の区切りにします）。</p>
          <textarea id="pasteText" rows="4" placeholder="ここに貼り付け"></textarea>
          <div class="prow"><button class="btn small" id="pasteGo">漢字を拾って 1 に入れる</button></div>
        </details>
      </div>
      <div class="card"><h3>1. ドリルの順番（${g}年生）</h3>
        <p>1行に1回分。「回の名前：その回の字」の形で書きます（回の名前は省略できます）。地図のステージが、この順番・このまとまりになります。
        入力しなかった字は「のこりの字」として最後のステージに入ります。</p>
        <textarea id="drillOrder" rows="10" placeholder="1 てんきの はなし：天気雨雪雲\n2 あさの じかん：朝昼夜時間\n…">${esc(orderText)}</textarea>
        <div class="prow"><button class="btn small" id="drillOrderSave">順番を保存する</button><button class="btn small danger" id="drillOrderClear">順番を消す（もとの順番にもどす）</button></div>
        <div id="drillOrderMsg" class="drill-msg"></div>
      </div>
      <div class="card"><h3>2. ドリルの例文（読みの問題）</h3>
        <p>1行に1問。「字｜文｜正しい読み｜まちがいの読み」の形で書きます。ドライブでは、ここに入れた例文が優先して出題されます。</p>
        <p class="note">例：<code>海｜海で およぐ｜うみ｜かい</code>　（区切りは「｜」か「|」）</p>
        <textarea id="drillEx" rows="8" placeholder="海｜海で およぐ｜うみ｜かい">${esc(exText)}</textarea>
        <div class="prow"><button class="btn small" id="drillExSave">例文を保存する</button></div>
        <div id="drillExMsg" class="drill-msg"></div>
      </div>`;
    $$('#drillGrades button').forEach(b => (b.onclick = () => { ui.drillGrade = +b.dataset.g; parentTabs.drill(); }));
    setupPhotoReader(g);
    const reGrade = () => { KG.setGrade(KG.grade); };
    $('#drillOrderSave').onclick = () => {
      const r = KG.parseDrillOrder($('#drillOrder').value, g);
      KG.state.parent.drillOrder = KG.state.parent.drillOrder || {};
      if (r.order.length) KG.state.parent.drillOrder[g] = r.order; else delete KG.state.parent.drillOrder[g];
      KG.save(); reGrade();
      const n = r.order.reduce((a, u) => a + u.chars.length, 0);
      const rest = KG.charsByGrade[g].filter(c => !r.order.some(u => u.chars.includes(c))).length;
      $('#drillOrderMsg').innerHTML = `<b>保存しました：${r.order.length}回・${n}字</b>（入っていない${g}年生の字：${rest}字）` +
        (r.other.length ? `<br>ほかの学年の字：${esc(r.other.join(''))}（そのまま出題します）` : '') +
        (r.unknown.length ? `<br>小学校で習わない字のため外しました：${esc(r.unknown.join(''))}` : '');
    };
    $('#drillOrderClear').onclick = () => {
      if (!confirm(`${g}年生のドリルの順番を消して、もとの順番にもどしますか？`)) return;
      if (KG.state.parent.drillOrder) delete KG.state.parent.drillOrder[g];
      KG.save(); reGrade(); parentTabs.drill();
    };
    $('#drillExSave').onclick = () => {
      const r = KG.parseDrillExamples($('#drillEx').value);
      const all = KG.state.parent.drillExamples || {};
      // この学年の分を入れかえる
      for (const c of Object.keys(all)) if (KG.kanji[c] && KG.kanji[c].grade === g) delete all[c];
      Object.assign(all, r.qs);
      KG.state.parent.drillExamples = all;
      KG.save();
      const n = Object.values(r.qs).reduce((a, l) => a + l.length, 0);
      $('#drillExMsg').innerHTML = `<b>保存しました：${n}問</b>` + (r.errors.length ? '<br>' + r.errors.map(esc).join('<br>') : '');
    };
  },

  psettings() {
    const p = KG.state.parent;
    const opt = (vals, cur, unit) => vals.map(v => `<option value="${v}" ${v === cur ? 'selected' : ''}>${v ? v + unit : 'なし'}</option>`).join('');
    $('#parentBody').innerHTML = `
      <div class="card"><h3>ユーザー（きょうだい）</h3>
        <p class="note">利用時間・学習記録は、ユーザーごとです（いまのユーザー：<b>${esc(KG.state.profile.nickname)}</b>）。ドリルの順番と例文は、全員で共通です。</p>
        ${KG.profiles.list.map(x => `<div class="prow">
          <input class="pname" data-id="${x.id}" value="${esc(x.name)}" maxlength="10"> ${x.grade}年生
          <button class="btn small" data-rename="${x.id}">名前を変える</button>
          <button class="btn small danger" data-del="${x.id}">このユーザーを消す</button></div>`).join('')}
      </div>
      <div class="card"><h3>おうえんメッセージ（${esc(KG.state.profile.nickname)}）</h3>
        <p class="note">ドライブの はじめに、ナビの ふきだしで 表示されます（30文字まで）。</p>
        <div class="prow"><input id="pCheer" class="pname" style="width:24em" maxlength="30" value="${esc(p.cheer || '')}" placeholder="例：きょうも がんばってね！"><button class="btn small" id="pCheerSave">保存</button></div>
      </div>
      <div class="card"><h3>利用時間（${esc(KG.state.profile.nickname)}）</h3>
        <div class="prow">1日の上限 <select id="pLimit">${opt([0, 15, 30, 45, 60], p.timeLimit, '分')}</select></div>
        <div class="prow">休憩の案内 <select id="pBreak">${opt([0, 15, 20, 30], p.breakEvery, '分ごと')}</select></div>
        <div class="prow"><button class="btn small" id="pAllow">今日だけ上限を解除する</button> ${p.allowDay === KG.today() ? '（今日は解除中）' : ''}</div>
      </div>
      <div class="card"><h3>データ</h3>
        <div class="prow"><button class="btn small" id="pExport">学習データを書き出す（JSON）</button></div>
        <div class="prow"><button class="btn small danger" id="pReset">${esc(KG.state.profile.nickname)} さんの学習記録を削除する</button></div>
        <p class="note">データはこのiPadのブラウザの中だけに保存されています。Safariの「履歴とWebサイトデータを消去」をすると消えるので、ときどき書き出しておくと安心です。</p>
      </div>
      <div class="card"><h3>使っているデータ</h3>
        <p class="note">書き順・部首データ：KanjiVG（Ulrich Apel, CC BY-SA 3.0）https://kanjivg.tagaini.net<br>フォント：DotGothic16（SIL OFL 1.1）／3D表示：three.js（MIT）</p>
      </div>`;
    $$('[data-rename]').forEach(b => (b.onclick = () => {
      const id = b.dataset.rename;
      const name = (document.querySelector(`.pname[data-id="${id}"]`).value || '').trim();
      if (!name) return;
      const x = KG.profiles.list.find(y => y.id === id);
      x.name = name;
      if (id === KG.profiles.active) KG.state.profile.nickname = name;
      else {
        // ほかのユーザーの記録の中の名前も変える
        const key = 'kanjiDeGo.v1:' + id;
        try { const st = JSON.parse(localStorage.getItem(key)); st.profile.nickname = name; localStorage.setItem(key, JSON.stringify(st)); } catch (e) { /* 記録がまだない */ }
      }
      KG.save();
      toast('名前を変えました');
      parentTabs.psettings();
    }));
    $$('[data-del]').forEach(b => (b.onclick = () => {
      const x = KG.profiles.list.find(y => y.id === b.dataset.del);
      if (!confirm(`「${x.name}」のユーザーと、すべての学習記録を消します。元にはもどせません。よろしいですか？`)) return;
      KG.deleteProfile(x.id);
      resetUiForProfile();
      if (!KG.profiles.list.length) { show('setup'); return; }
      toast(`「${x.name}」を消しました`);
      parentTabs.psettings();
    }));
    $('#pCheerSave').onclick = () => { p.cheer = $('#pCheer').value.trim(); KG.save(); toast('おうえんメッセージを保存しました'); };
    $('#pLimit').onchange = e => { p.timeLimit = +e.target.value; KG.save(); };
    $('#pBreak').onchange = e => { p.breakEvery = +e.target.value; KG.save(); };
    $('#pAllow').onclick = () => { p.allowDay = KG.today(); KG.save(); parentTabs.psettings(); toast('今日の上限を解除しました'); };
    $('#pExport').onclick = () => {
      const blob = new Blob([JSON.stringify(KG.state, null, 1)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `kanji-de-go-${KG.state.profile.nickname}-${KG.today()}.json`;
      a.click();
    };
    $('#pReset').onclick = () => {
      if (!confirm(`${KG.state.profile.nickname} さんの学習記録をすべて削除します。よろしいですか？`)) return;
      KG.resetAll();
      resetUiForProfile();
      toast('学習記録を削除しました');
      parentTabs.psettings();
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
    else if (Math.abs(d) < 8) drive.centerLane();
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
  const mode = KG.state.driveMode === 'write' ? 'write' : 'read';
  // 書きは1問に時間がかかるので、6問にする
  const items = KG.pickDriveQuestions(stage, mode === 'write' ? 6 : 10, mode);
  if (!items.length) { toast('もんだいが ありません'); return; }
  // イベントゲート：さいごはファイナル、まん中あたりにボーナスとジャンプ
  if (items.length >= 4) {
    const mid = KG.shuffle(items.slice(1, -1).map((_, i) => i + 1));
    items[mid[0]].event = 'bonus';
    items[mid[1]].event = 'jump';
    if (items.length >= 8) items[mid[2]].event = 'bonus';
  }
  items[items.length - 1].event = 'final';
  const missions = KG.stageMissions(stage.id, mode, items.length);
  const ghostKey = stage.id + ':' + mode;
  const ghost = !KG.state.settings.slow && KG.state.ghosts && KG.state.ghosts[ghostKey] ? KG.state.ghosts[ghostKey].s : null;
  if (KG.state.settings.control === 'tilt' && !tiltGranted) requestTilt(); // タップの流れの中で許可をもらう

  show('drive');
  KG.music.play(stage.course.id);
  const hud = makeHud(items, mode, missions);
  ui.drive = new KG.Drive({
    mode,
    ghost,
    boss: stage.kind === 'weak',
    tutorial: !KG.state.tutorialDone,
    canvas: $('#driveCanvas'),
    canvas3d: $('#driveCanvas3d'),
    course: stage.course,
    stageIndex: stage.kind === 'normal' ? stage.idx : Math.floor(Math.random() * 5),
    items,
    hud,
    onFinish: (results, elapsed, stats) => finishDrive(stage, results, elapsed, mode, missions, stats),
  });
  if (KG.state.settings.control === 'tilt') startTilt(ui.drive);
  const cheer = (KG.state.parent.cheer || '').trim();
  if (cheer) setTimeout(() => hud.say('cheer', cheer), 3200);
  const tb = $('#toggleBtn');
  tb.className = 'toggle-btn' + (KG.state.settings.oneHand ? ' on ' + KG.state.settings.hand : '');
}

function makeHud(items, mode = 'read', missions = []) {
  const wb = $('#writeBox');
  wb.hidden = true;
  const coinHud = $('#coinHud'), evb = $('#eventBanner'), mc = $('#missionCard');
  const nav = $('#navBubble'), tipBox = $('#tipBox'), bossBar = $('#bossBar');
  nav.classList.remove('on'); tipBox.classList.remove('on');
  bossBar.hidden = true;
  $('#ghostHud').hidden = true;
  coinHud.querySelector('b').textContent = '0';
  evb.classList.remove('on');
  // スタートのときに、このステージのミッションを見せる
  mc.innerHTML = '<b>ミッション</b>' + missions.map((m, i) => `<div><i class="ico ico-star"></i> ${esc(m.text)}</div>`).join('');
  mc.classList.add('on');
  setTimeout(() => mc.classList.remove('on'), 3400);
  const prog = $('#progress');
  prog.innerHTML = items.map(() => '<i></i>').join('');
  const dots = prog.querySelectorAll('i');
  const banner = $('#qBanner'), cL = $('#choiceL'), cR = $('#choiceR');
  const fb = $('#feedback'), ex = $('#explain'), sm = $('#startMsg'), wh = $('#waitHint');
  const cb = $('#combo'), zn = $('#zoneName'), ch = $('#changeHint'), bar = banner.querySelector('.qtimer i');
  let lastWait = false;
  [banner, cL, cR, fb, ex, sm, wh, cb, zn, ch].forEach(el => el.classList.remove('on'));
  return {
    // 決定ラインまでの残り時間（1→0）
    timer(frac) { bar.style.transform = `scaleX(${Math.max(0, frac)})`; },
    // ナビ（ピヨナビ）のせりふ
    say(kind, arg) {
      const L = {
        start: ['いくよ！ しゅっぱつ しんこう！', 'きょうも がんばろう！', 'コインも あつめて いこう！'],
        correct: ['いいね！', 'さすが！', 'その ちょうし！', 'ナイス！'],
        combo: ['すごい！ れんぞく せいかい！', 'とまらないね！', 'ぜっこうちょう！'],
        wrong: ['だいじょうぶ！ つぎ いこう', 'おしい！ いま おぼえちゃおう', 'まちがえても へっちゃら！'],
        bonus: ['きんいろの かんばんだ！ チャンス！'],
        jump: ['ジャンプだい だ！ とんで いこう！'],
        final: ['さいごの もんだい！ きめよう！'],
        boost: ['ブースト！ びゅーん！'],
        zone: [`${arg}に ついたよ！`],
        goal: ['ゴール！ よく がんばったね！'],
        boss_start: ['かんじモンスターが にげてる！ せいかいして おいつこう！'],
        boss_near: ['ちかづいてきた！'],
        boss_close: ['あと すこしで つかまえられる！'],
        boss_far: ['にげられた！ まけないで！'],
        boss_win: ['つかまえた！ モンスターを やっつけたよ！'],
        boss_lose: ['にげられちゃった… また ちょうせんしよう！'],
        cheer: [arg ? `おうちの人から：「${arg}」` : ''],
      }[kind];
      if (!L || !L[0]) return;
      nav.querySelector('span').textContent = L[Math.floor(Math.random() * L.length)];
      nav.classList.add('on');
      clearTimeout(nav.timer);
      nav.timer = setTimeout(() => nav.classList.remove('on'), kind === 'cheer' ? 4000 : 2400);
    },
    // はじめての人への ヒント
    tip(text) {
      tipBox.textContent = '💡 ' + text;
      tipBox.classList.add('on');
      clearTimeout(tipBox.timer);
      tipBox.timer = setTimeout(() => tipBox.classList.remove('on'), 5000);
    },
    coins(n, add) {
      coinHud.querySelector('b').textContent = n;
      coinHud.classList.remove('pop'); void coinHud.offsetWidth; coinHud.classList.add('pop');
    },
    // イベントゲートの案内
    event(ev) {
      const text = { bonus: '⭐ ボーナスゲート！ せいかいで コイン 3ばい', jump: '🦘 ジャンプゲート！ せいかいで ジャンプ', final: '🏁 ファイナルゲート！ さいごの もんだい' }[ev];
      evb.className = 'event-banner' + (ev ? ' on ' + ev : '');
      evb.textContent = text || '';
      if (ev) setTimeout(() => evb.classList.remove('on'), 2600);
    },
    // 書く枠を出す
    writeStart(it) {
      wb.hidden = false;
      if (!ui.drivePad) ui.drivePad = new KG.WritePad($('#drivePad'));
      const pad = ui.drivePad;
      pad.resize();
      pad.clear();
      const target = it.q.kanji;
      const finish = pass => {
        pad.reveal = target;
        pad.locked = true;
        pad.draw();
        if (pass) KG.audio.select('R'); else KG.audio.wrong();
        setTimeout(() => { if (ui.drive) ui.drive.submitWrite(pass); }, pass ? 500 : 1300);
      };
      $('#wbClear').onclick = () => { if (!pad.locked) pad.clear(); };
      $('#wbDont').onclick = () => { if (!pad.locked) finish(false); };
      $('#wbOk').onclick = () => {
        if (pad.locked) return;
        const sc = pad.score(target);
        if (sc.inkN < 30) { toast('かんじを かいてね'); return; }
        finish(sc.coverage >= 0.38 && sc.outside <= 0.45);
      };
    },
    writeEnd() { wb.hidden = true; },
    count(text) {
      sm.textContent = text;
      sm.classList.add('on');
      sm.classList.remove('pop'); void sm.offsetWidth; sm.classList.add('pop');
    },
    combo(n) {
      cb.classList.remove('on', 'big');
      if (n >= 2) {
        void cb.offsetWidth;
        cb.textContent = n >= 5 ? `🌈 ${n}れんぞく！ すごい！` : `🔥 ${n}れんぞく！`;
        cb.classList.add('on');
        if (n >= 5) cb.classList.add('big');
      }
    },
    zone(name) {
      zn.textContent = `📍 ${name}`;
      zn.classList.add('on');
      clearTimeout(zn.timer);
      zn.timer = setTimeout(() => zn.classList.remove('on'), 3500);
    },
    phase(name, d) {
      dots.forEach((x, i) => x.classList.toggle('now', i === d.idx && name !== 'goal'));
      if (name === 'cruise') sm.classList.remove('on', 'pop');
      if (name === 'question') {
        const it = d.item, q = it.q;
        if (mode === 'write') {
          const w = KG.writePrompt(q);
          banner.querySelector('.qlabel').textContent = '✏️ かんじで かこう！';
          banner.querySelector('.qtext').innerHTML = `${esc(w.before)}<ruby>${esc(w.pre)}<span class="wq">□</span>${esc(w.post)}<rt>${esc(w.reading)}</rt></ruby>${esc(w.after)}`;
          banner.classList.add('on');
          return;
        }
        banner.querySelector('.qlabel').textContent = q.type === 'reading' ? 'よみは どっち？' : 'かんじは どっち？';
        banner.querySelector('.qtext').innerHTML = esc(q.text).replace(/\{(.+?)\}/, '<em>$1</em>').replace(/\[(.+?)\]/, '<u>$1</u>');
        cL.querySelector('.ctext').textContent = it.side === 'L' ? q.correct : q.wrong;
        cR.querySelector('.ctext').textContent = it.side === 'R' ? q.correct : q.wrong;
        [cL, cR].forEach(c => c.classList.remove('sel'));
        [banner, cL, cR].forEach(c => c.classList.add('on'));
      }
      if (name === 'after') [banner, cL, cR, wh, ch].forEach(c => c.classList.remove('on'));
      if (name === 'goal') { this.count('🏁 ゴール！'); cb.classList.remove('on'); }
    },
    selected(side) {
      cL.classList.toggle('sel', side === 'L');
      cR.classList.toggle('sel', side === 'R');
      ch.classList.add('on');
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

function finishDrive(stage, results, elapsed, mode = 'read', missions = [], stats = {}) {
  const d = ui.drive;
  d.destroy();
  stopTilt();
  ui.drive = null;
  const correct = results.filter(r => r.result === 'correct').length;
  const noMiss = correct === results.length;
  const rankBefore = KG.rankOf(KG.rankPoints() - correct).i;
  // ミッション：何回かに分けて達成してもよい（達成したものは記録に残る）
  const st = { correct, total: results.length, elapsed, coins: stats.coins || 0, maxCombo: stats.maxCombo || 0, boostHits: stats.boostHits || 0, bonusOk: stats.bonusOk || 0 };
  const rec = KG.state.stages[stage.id] || { stars: 0, best: null };
  rec.missions = rec.missions || {};
  rec.missions[mode] = rec.missions[mode] || [];
  const done = rec.missions[mode];
  const missionResults = missions.map(m => {
    const now = m.ok(st);
    const isNew = now && !done.includes(m.id);
    if (isNew) done.push(m.id);
    return { text: m.text, now, before: !now && done.includes(m.id), isNew };
  });
  const starsN = Math.min(3, done.length);
  const isBest = correct > 0 && (rec.best == null || elapsed < rec.best);
  rec.stars = Math.max(rec.stars || 0, starsN);
  KG.state.coins = (KG.state.coins || 0) + st.coins;
  // ゴースト：自己ベストのときの走りを残す
  KG.state.ghosts = KG.state.ghosts || {};
  const gk = stage.id + ':' + mode;
  if (stats.distSamples && (!KG.state.ghosts[gk] || elapsed < KG.state.ghosts[gk].time)) KG.state.ghosts[gk] = { time: +elapsed.toFixed(1), s: stats.distSamples.map(v => +v.toFixed(1)) };
  // きょうのミッション
  let dailyDone = false;
  const add = (k, n) => { if (n > 0 && KG.dailyAdd(k, n)) dailyDone = true; };
  add('drives', 1);
  add('coins', st.coins);
  add('writeDrives', mode === 'write' ? 1 : 0);
  add('nomiss', noMiss ? 1 : 0);
  add('bonus', st.bonusOk);
  add('combo5', st.maxCombo >= 5 ? 1 : 0);
  add('weakOk', results.filter(r => r.wasWeak).length);
  KG.state.tutorialDone = true;
  if (isBest) rec.best = +elapsed.toFixed(1);
  KG.state.stages[stage.id] = rec;
  KG.state.stamps.push(KG.today());
  KG.adjustDifficulty();
  KG.save();
  const rankAfter = KG.rankOf();
  show('result', { results, elapsed, starsN: rec.stars, isBest, noMiss, mode, coins: st.coins, missionResults,
    rankUp: rankAfter.i > rankBefore ? rankAfter.rank : null, dailyDone, boss: stage.kind === 'weak', bossWin: stats.bossWin });
  const be = KG.state.parent.breakEvery;
  if (be && ui.sessionPlay >= be * 60) {
    ui.sessionPlay = 0;
    setTimeout(() => toast('👀 すこし めを やすめよう', 4000), 800);
  }
}

// ドライブ中の入力（タップ・キーボード）
$('#scr-drive').addEventListener('pointerdown', e => {
  if (!ui.drive || e.target.closest('button') || e.target.closest('#writeBox')) return;
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
  if (!ui.drive) return;
  $('#timer').textContent = ui.drive.elapsed.toFixed(1);
  // ゴースト：じこベストとの差
  const d = ui.drive, gh = $('#ghostHud');
  gh.hidden = !(d.ghost && d.ghostDiff != null && d.phase !== 'start');
  if (!gh.hidden) {
    const v = Math.abs(d.ghostDiff).toFixed(1);
    gh.className = 'ghost-hud ' + (d.ghostDiff >= 0 ? 'ahead' : 'behind');
    gh.textContent = `👻 じこベストより ${v}びょう ${d.ghostDiff >= 0 ? 'はやい！' : 'おそい'}`;
  }
  // ボス：モンスターとの きょり
  const bar = $('#bossBar');
  if (d.boss) {
    bar.hidden = false;
    const g = d.monsterShown == null ? d.monsterGap : d.monsterShown;
    bar.querySelector('.bb-mon').style.left = Math.max(8, Math.min(92, (g / 40) * 100)) + '%';
  }
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

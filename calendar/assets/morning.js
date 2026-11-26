/* ==========================================================
   ☀️ 아침의 질문 — 하루 하나, 스스로 생각하는 시간 (2026-11-26)
   · 한국 시간 자정(00:00)에 날짜가 바뀌면 다음 질문으로 넘어가고,
     같은 날에는 새로고침·재접속해도 같은 질문이 나온다.
   · 질문 365개는 assets/morning-questions.js 에 있다(손님이 보는 기본 문구).
     관리자가 /calendar/yoon-key/ ☀️ 아침의 질문 탭에서 고친 문구가 있으면
     서버(morning_questions_public)에서 받아 그 문구로 보여 준다.
   · 답은 **이 기기에만** 저장한다(localStorage `yoonise.morningq.v1`).
     서버로 보내지 않고, 다른 사람에게 보이지 않으며, AI 가 평가·분석하지 않는다.
   · 답은 선택이다. 쓰지 않고 생각만 하고 넘어가도 된다.
   · 이 파일은 문구·질문 고르기·답 저장만 맡는다.
     운세 생성 로직·화면 구성·결제·감정서는 건드리지 않는다.
   ========================================================== */
(function (global) {
  'use strict';

  var KEY = 'yoonise.morningq.v1';              // { v:1, entries:{ 'YYYY-MM-DD': { t, at } } }
  var POOL_KEY = 'yoonise.morningq.pool.v1';    // 서버에서 받은 수정·추가 문구 캐시
  var SB_URL = 'https://fifynkkaeqcjlovesuop.supabase.co';
  var SB_KEY = 'sb_publishable_JzSUlMOH9s38aer6y1BVEg_rHcQLGxF';
  var DAY = 86400000;
  var MAX_LEN = 600;

  var mem = {
    entries: {},
    pool: null,          // { over:{ 'YYYY-MM-DD': '문구' }, at:'YYYY-MM-DD' }
    poolTried: false,
    writing: false
  };

  /* ── 날짜 — 한국 시간 기준 ─────────────────────────────── */
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function kstDate(ts) {
    var d = new Date((typeof ts === 'number' ? ts : Date.now()) + 9 * 3600 * 1000);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
  }
  function isoOf(ts) {
    var p = kstDate(ts);
    return p.y + '-' + pad2(p.m) + '-' + pad2(p.d);
  }
  function isoNow() { return isoOf(Date.now()); }
  function ordinalOf(iso) {
    var p = String(iso || '').split('-');
    if (p.length !== 3) return 0;
    return Math.floor(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])) / DAY);
  }
  function addDays(iso, n) {
    var t = ordinalOf(iso) + n;
    var d = new Date(t * DAY);
    return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
  }

  /* ── 질문 365개 ────────────────────────────────────────── */
  var DB = (global.MORNING_QUESTIONS && global.MORNING_QUESTIONS.items) ? global.MORNING_QUESTIONS.items : [];
  var BASE_ISO = (global.MORNING_QUESTIONS && global.MORNING_QUESTIONS.base) || '2026-11-26';

  /* ── 관리자 문구 — **날짜별** 수정분 ─────────────────────
     기본 365개는 날짜 → 번호(365일 주기)로 고른다. 관리자가 특정 날짜의 문구를 고치면
     그 날짜만 바뀌고 다른 날의 질문은 그대로다(주기가 밀리지 않는다).
     저장 모양: { over: { 'YYYY-MM-DD': '문구' } } */
  function loadPool() {
    var o = null;
    try { o = JSON.parse(localStorage.getItem(POOL_KEY)); } catch (e) { o = null; }
    mem.pool = (o && o.over && typeof o.over === 'object') ? o : { over: {} };
    if (!mem.pool.over || typeof mem.pool.over !== 'object') mem.pool.over = {};
  }
  function savePool() {
    try { localStorage.setItem(POOL_KEY, JSON.stringify(mem.pool)); } catch (e) {}
  }
  function overrideOf(iso) {
    if (!mem.pool) loadPool();
    var t = mem.pool.over[iso];
    return (typeof t === 'string' && t.trim()) ? t : '';
  }
  /** 날짜 → 그날의 질문 번호(0부터). 기본 365개를 365일 주기로 돈다. */
  function slotOf(iso) {
    var L = DB.length || 365;
    var n = ordinalOf(iso) - ordinalOf(BASE_ISO);
    return ((n % L) + L) % L;
  }
  function baseQuestionOf(iso) {
    if (!DB.length) return '';
    return (DB[slotOf(iso)] || {}).t || '';
  }
  function questionOf(iso) {
    return overrideOf(iso) || baseQuestionOf(iso);
  }
  /* ── 관리자 문구 받기 (손님 화면이 켜질 때 한 번) ──────────
     서버가 아직 없거나 연결이 안 되면 이 기기에 마지막으로 받아 둔 문구로,
     그것도 없으면 기본 365개 그대로 보여 준다. 화면을 막지 않는다.

     · MORNING_QUESTIONS.remote === true 일 때만 서버에 묻는다.
       (Supabase 테이블·함수를 넣기 전에는 꺼 두어, 손님 화면이 404 를 부르지 않게 한다.
        docs/morning-questions-db.sql 을 넣은 뒤 morning-questions.js 의 remote 를 true 로.)
     · 어떤 실패도 조용히 넘긴다 — 손님은 늘 질문을 본다. */
  function remoteOn() {
    return !!(global.MORNING_QUESTIONS && global.MORNING_QUESTIONS.remote === true);
  }
  function fetchPool(done) {
    var go = function () { if (done) done(); };
    if (!remoteOn() || !global.fetch) { go(); return; }
    var opt = {
      method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY },
      body: '{}'
    };
    var ctrl = null, timer = 0;
    try {
      if (global.AbortController) { ctrl = new AbortController(); opt.signal = ctrl.signal; }
    } catch (e) { ctrl = null; }
    if (ctrl) timer = setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, 6000);
    try {
      global.fetch(SB_URL + '/rest/v1/rpc/morning_questions_public', opt).then(function (res) {
        if (timer) clearTimeout(timer);
        if (!res.ok) { go(); return null; }
        return res.text().then(function (t) {
          var d = null;
          try { d = t ? JSON.parse(t) : null; } catch (e) { d = null; }
          if (!d || !d.ok) { go(); return; }
          var over = {};
          (d.items || []).forEach(function (it) {
            var day = String((it && it.day) || '').slice(0, 10);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
            var tx = String((it && it.text) || '').trim();
            if (tx) over[day] = tx;
          });
          mem.pool = { over: over, at: isoNow() };
          savePool();
          go();
        }, function () { go(); });
      }, function () { go(); }).catch(function () { go(); });
    } catch (e) { go(); }
  }

  /* ── 답 — 이 기기에만 ─────────────────────────────────── */
  function load() {
    var o = null;
    try { o = JSON.parse(localStorage.getItem(KEY)); } catch (e) { o = null; }
    mem.entries = (o && o.entries && typeof o.entries === 'object') ? o.entries : {};
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ v: 1, entries: mem.entries })); } catch (e) {}
  }
  function answerOf(iso) {
    var r = mem.entries[iso];
    return (r && typeof r.t === 'string') ? r.t : '';
  }
  function hasAnswer(iso) { return !!answerOf(iso); }
  function setAnswer(iso, text) {
    if (!iso) return '';
    var t = String(text == null ? '' : text).replace(/\r\n/g, '\n').slice(0, MAX_LEN);
    if (!t.trim()) {
      delete mem.entries[iso];
      save();
      return '';
    }
    mem.entries[iso] = { t: t.trim(), at: Date.now() };
    save();
    return mem.entries[iso].t;
  }
  function answeredKeys() {
    var out = [];
    for (var k in mem.entries) {
      if (!Object.prototype.hasOwnProperty.call(mem.entries, k)) continue;
      if (mem.entries[k] && typeof mem.entries[k].t === 'string' && mem.entries[k].t.trim()) out.push(k);
    }
    return out;
  }
  function countAnswered() { return answeredKeys().length; }

  /* ── 화면 — 오늘의 카드 ──────────────────────────────── */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function $(s) { return document.querySelector(s); }

  var cardIso = '';        // 지금 카드에 그려 둔 날짜 — 자정이 지나면 다시 그린다

  function paintCard() {
    var card = $('#morningCard');
    if (!card) return;
    cardIso = isoNow();
    var q = questionOf(cardIso);
    var el = $('#mqText');
    if (el) el.textContent = q;
    var mine = $('#mqMine'), saved = $('#mqSaved');
    var mineEl = $('#mqMineText');
    var a = answerOf(cardIso);
    if (mine) mine.hidden = !a;
    if (mineEl) mineEl.textContent = a;
    if (saved) saved.hidden = !a;
    var btn = $('#mqBtn');
    if (btn) btn.innerHTML = a ? '내 생각 고치기 <span aria-hidden="true">→</span>' : '나의 생각 남기기 <span aria-hidden="true">→</span>';
    var input = $('#mqInput');
    if (input && !mem.writing) input.value = a;
    var foot = document.querySelector('#morningCard .mq__foot');
    if (foot) foot.hidden = !!mem.writing;
    syncCount();
  }

  function syncCount() {
    var input = $('#mqInput'), cnt = $('#mqCount'), save = $('#mqSave');
    if (!input) return;
    var n = input.value.length;
    if (cnt) cnt.textContent = n + ' / ' + MAX_LEN;
    if (save) save.disabled = !input.value.trim();
  }

  function openWriter() {
    var box = $('#mqWrite'), input = $('#mqInput');
    if (!box || !input) return;
    mem.writing = true;
    input.value = answerOf(cardIso);
    box.hidden = false;
    /* 쓰는 동안에는 아래 버튼·이미 남긴 생각을 접어 둔다 — 같은 일을 두 번 시키지 않게 */
    var foot = document.querySelector('#morningCard .mq__foot');
    if (foot) foot.hidden = true;
    var mine = $('#mqMine');
    if (mine) mine.hidden = true;
    syncCount();
    try { input.focus({ preventScroll: true }); } catch (e) { try { input.focus(); } catch (e2) {} }
    try {
      box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) { try { box.scrollIntoView(); } catch (e2) {} }
  }
  function closeWriter() {
    var box = $('#mqWrite');
    mem.writing = false;
    if (box) box.hidden = true;
    var foot = document.querySelector('#morningCard .mq__foot');
    if (foot) foot.hidden = false;
    paintCard();
  }
  function commitCard() {
    var input = $('#mqInput');
    if (!input) return false;
    setAnswer(cardIso, input.value);
    mem.writing = false;
    var box = $('#mqWrite');
    if (box) box.hidden = true;
    paintCard();
    return true;
  }

  /* ── 날짜별 기록 — 날짜 팝업·기록 보기에서 함께 보기 ────────
     저녁 한 줄 기록과 **칸을 나눠** 보여 준다(같은 칸에 섞지 않는다). */
  function blockHTML(iso, opts) {
    if (!iso) return '';
    var o = opts || {};
    var q = questionOf(iso);
    if (!q) return '';
    var a = answerOf(iso);
    var today = iso === isoNow();
    return '<section class="mqday" data-mq="' + esc(iso) + '">' +
      '<p class="mqday__t"><span aria-hidden="true">☀️</span> 아침의 질문</p>' +
      '<p class="mqday__q">' + esc(q) + '</p>' +
      '<p class="mqday__a"' + (a ? '' : ' hidden') + '><b>내 생각</b><span data-mq-atext>' + esc(a) + '</span></p>' +
      '<p class="mqday__none"' + (a ? ' hidden' : '') + '>' + (today ? '오늘의 생각을 아직 남기지 않았어요. 남기지 않고 넘어가도 괜찮아요.' : '이 날은 남긴 생각이 없어요.') + '</p>' +
      (o.readonly ? '' :
        '<div class="mqday__write" hidden>' +
          '<label class="mqday__cap" for="mqdayInput">' + (a ? '내 생각 고치기' : '내 생각 남기기') + ' <span>(선택 · 이 기기에만 저장)</span></label>' +
          '<textarea class="mqday__input" id="mqdayInput" rows="3" maxlength="' + MAX_LEN + '" placeholder="떠오른 대로 적어 보세요. 안 적어도 괜찮아요.">' + esc(a) + '</textarea>' +
          '<div class="mqday__acts">' +
            '<button type="button" class="mqday__save" data-mq-save>저장하기</button>' +
            '<button type="button" class="mqday__cancel" data-mq-cancel>닫기</button>' +
          '</div>' +
        '</div>' +
        '<button type="button" class="mqday__btn" data-mq-open>' + (a ? '내 생각 고치기 →' : '나의 생각 남기기 →') + '</button>') +
      '</section>';
  }

  /** 기록 보기(📖) 한 칸에 붙는 ☀️ 표시 — 저녁 1초 체크·성찰과 구분되는 이름표 */
  function chipHTML() {
    return '<span class="dbook__chip dbook__chip--mq">☀️ 아침의 질문</span>';
  }
  function bookLinesHTML(iso) {
    var a = answerOf(iso);
    var q = questionOf(iso);
    if (!a || !q) return '';
    return '<span class="dbook__mq">☀️ ' + esc(q) + '</span>' +
      '<span class="dbook__mqa">' + esc(a) + '</span>';
  }
  /** .txt 로 내려받을 때 한 날짜 몫 */
  function textLines(iso) {
    var a = answerOf(iso);
    var q = questionOf(iso);
    if (!a || !q) return [];
    return ['☀️ 아침의 질문 Q. ' + q, '   A. ' + a.replace(/\n/g, '\n      ')];
  }

  /* ── 붙이기 ──────────────────────────────────────────── */
  function bind() {
    var card = $('#morningCard');
    if (card) {
      card.addEventListener('click', function (e) {
        var t = e.target;
        if (!t || !t.closest) return;
        if (t.closest('#mqBtn')) { e.preventDefault(); openWriter(); return; }
        if (t.closest('#mqSave')) { e.preventDefault(); commitCard(); pulse('오늘의 생각을 남겼어요'); return; }
        if (t.closest('#mqClose')) { e.preventDefault(); closeWriter(); return; }
      });
      card.addEventListener('input', function (e) {
        if (e.target && e.target.id === 'mqInput') syncCount();
      });
      card.addEventListener('keydown', function (e) {
        if (!e.target || e.target.id !== 'mqInput') return;
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); commitCard(); }
        if (e.key === 'Escape') { e.preventDefault(); closeWriter(); }
      });
    }
    /* 날짜 팝업 안 — 같은 카드가 여러 번 그려져도 한 곳에서 받는다 */
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var sec = t.closest('[data-mq]');
      if (!sec) return;
      var iso = sec.getAttribute('data-mq');
      if (t.closest('[data-mq-open]')) {
        e.preventDefault();
        var box = sec.querySelector('.mqday__write');
        var inp = sec.querySelector('.mqday__input');
        if (!box || !inp) return;
        box.hidden = false;
        try { inp.focus({ preventScroll: true }); } catch (err) { try { inp.focus(); } catch (err2) {} }
        return;
      }
      if (t.closest('[data-mq-save]')) {
        e.preventDefault();
        var box2 = sec.querySelector('.mqday__write');
        var inp2 = sec.querySelector('.mqday__input');
        if (!inp2) return;
        setAnswer(iso, inp2.value);
        if (box2) box2.hidden = true;
        var a = answerOf(iso);
        var txt = sec.querySelector('[data-mq-atext]');
        var pa = sec.querySelector('.mqday__a');
        var none = sec.querySelector('.mqday__none');
        var btn = sec.querySelector('.mqday__btn');
        if (txt) txt.textContent = a;
        if (pa) pa.hidden = !a;
        if (none) { none.hidden = !!a; }
        if (btn) btn.innerHTML = a ? '내 생각 고치기 →' : '나의 생각 남기기 →';
        if (a) pulse('이 날의 생각을 남겼어요');
        return;
      }
      if (t.closest('[data-mq-cancel]')) {
        e.preventDefault();
        var box3 = sec.querySelector('.mqday__write');
        var inp3 = sec.querySelector('.mqday__input');
        if (inp3) inp3.value = answerOf(iso);
        if (box3) box3.hidden = true;
      }
    });
  }

  function pulse(msg) {
    var el = $('#mqSaved');
    if (el) {
      el.textContent = msg + ' ✓';
      el.hidden = false;
      clearTimeout(pulse._t);
      pulse._t = setTimeout(function () { paintCard(); }, 2600);
      return;
    }
    /* 팝업 안 — 잠깐 보이는 한 줄 */
    var toast = document.createElement('p');
    toast.className = 'mqtoast';
    toast.textContent = msg + ' ✓';
    document.body.appendChild(toast);
    setTimeout(function () { try { document.body.removeChild(toast); } catch (e) {} }, 2200);
  }

  /* ── 자정이 지나면 새 질문으로 ─────────────────────────── */
  var lastIso = '';
  function tick() {
    var now = isoNow();
    if (now === lastIso) return;
    lastIso = now;
    paintCard();
    document.dispatchEvent(new CustomEvent('morningq:day', { detail: { iso: now } }));
  }

  function boot() {
    load();
    loadPool();
    bind();
    paintCard();
    lastIso = isoNow();
    setInterval(tick, 30000);
    /* 관리자가 고친 문구가 있으면 받아서 다시 그린다 — 손님 화면을 막지 않는다 */
    fetchPool(function () { paintCard(); });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible') return;
      tick();
      if (!mem.poolTried) { mem.poolTried = true; fetchPool(function () { paintCard(); }); }
    });
  }

  global.MorningQ = {
    KEY: KEY,
    isoNow: isoNow,
    addDays: addDays,
    slotOf: slotOf,
    questionOf: questionOf,
    answerOf: answerOf,
    hasAnswer: hasAnswer,
    setAnswer: setAnswer,
    answeredKeys: answeredKeys,
    countAnswered: countAnswered,
    blockHTML: blockHTML,
    chipHTML: chipHTML,
    bookLinesHTML: bookLinesHTML,
    textLines: textLines,
    paintCard: paintCard,
    reload: function () { load(); paintCard(); }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);

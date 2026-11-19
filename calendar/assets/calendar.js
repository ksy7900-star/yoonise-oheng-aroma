/*! 윤이세 내 인생 타이밍 캘린더 — 화면 로직 */
(function () {
  'use strict';

  var M = window.Manse, T = window.Timing;
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var STORE_KEY = 'yoonise.timing.v1';
  var MAIN_KEY = 'yoonise.oheng.last.v1';   // 기존 오행 앱에 저장된 사주가 있으면 그대로 이어받는다
  var RANGE_FROM = '2026-11-01';
  var RANGE_TO = '2028-02-03';   // 정미년 마지막 날 — 2028-02-04 입춘부터 무신년
  var TERMS_FROM = '2026-01-01';  // 세운(입춘) 기준을 잡기 위해 앞해 입춘부터 절기 표를 만든다
  var FREE_DAYS = 3;   // 오늘 포함 3일(D+0·D+1·D+2)만 무료
  var DOW_EN = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  var DOW_KO = ['일', '월', '화', '수', '목', '금', '토'];
  var KAKAO = 'https://pf.kakao.com/_hxfbCG/chat';
  var LITTLY = 'https://litt.ly/yoonise';

  /* ── 2027 정미년 대표 수호 부적 · 톡톡톡 리추얼 ────── */
  var STAMP_KEY = 'yoonise.timing.stamp.v1';
  var TALIS_PATH = 'assets/talisman/';
  // 날짜 배지 5개 ↔ 오행 부적 5장 (plan 확정 매칭)
  var BADGE_TO_EL = { '럭키': '목', '입단속': '수', '결정': '화', '머니': '금', '리셋': '토' };
  var EL_ORDER = ['목', '화', '토', '금', '수'];
  // 나를 생하는(인성) / 같은 편(비겁) / 내가 생하는(식상) / 내가 극하는(재성) / 나를 극하는(관성)
  var EL_MOTHER = { 목: '수', 화: '목', 토: '화', 금: '토', 수: '금' };
  var EL_BIRTH = { 목: '화', 화: '토', 토: '금', 금: '수', 수: '목' };
  var EL_OVER = { 목: '토', 화: '금', 토: '수', 금: '목', 수: '화' };
  var EL_PRESS = { 목: '금', 화: '수', 토: '목', 금: '화', 수: '토' };

  var TALIS = {
    목: {
      key: 'wood', label: '목(木)', josa: '이',
      why: '새로 시작하고 뻗어 나가는 기운 — 기회를 붙잡고 사람에게 먼저 다가가는 힘을 채워 줍니다.',
      done: '✨ 오늘 럭키 기운 충전 완료!',
      sub: '별빛이 톡톡 — 오늘은 먼저 손 내밀어 보세요.',
      taps: ['톡 — 새싹이 올라옵니다', '톡톡 — 마지막 한 번!']
    },
    화: {
      key: 'fire', label: '화(火)', josa: '가',
      why: '결정하고 표현하는 기운 — 미루지 않고 밀고 나가는 힘을 채워 줍니다.',
      done: '🔥 오늘 결정의 불씨 ON!',
      sub: '오늘 정할 일 하나, 지금 적어 두세요.',
      taps: ['톡 — 불씨가 붙었어요', '톡톡 — 마지막 한 번!']
    },
    토: {
      key: 'earth', label: '토(土)', josa: '가',
      why: '중심을 잡고 버티는 기운 — 일이 흔들릴 때 내 자리를 지키는 힘을 채워 줍니다.',
      done: '🌱 오늘 리셋 완료 — 중심 다시 세웠어요.',
      sub: '새 달의 기준을 한 줄로 적어 두면 오래갑니다.',
      taps: ['톡 — 중심이 잡혀요', '톡톡 — 마지막 한 번!']
    },
    금: {
      key: 'metal', label: '금(金)', josa: '이',
      why: '벌여 둔 일을 매듭짓고 재물을 지키는 기운을 채워 줍니다.',
      done: '💰 오늘 머니 그릇 채움 완료!',
      sub: '나가는 돈부터 한 번 확인해 보세요.',
      taps: ['톡 — 그릇이 단단해져요', '톡톡 — 마지막 한 번!']
    },
    수: {
      key: 'water', label: '수(水)', josa: '가',
      why: '차분히 흐르며 지켜 내는 기운 — 말과 감정을 다스리는 힘을 채워 줍니다.',
      done: '🛡️ 오늘 입단속 방패 ON!',
      sub: '보내기 전에 한 번 접어 두세요.',
      taps: ['톡 — 방패가 올라와요', '톡톡 — 마지막 한 번!']
    }
  };

  var ritual = {};   // { iso: 두드린 횟수 } — 같은 화면 안에서만 기억

  var state = {
    gender: '', calendar: 'solar', res: null, natal: null,
    terms: null, view: null, sel: null, todayISO: '', cache: {}, icsDays: [],
    stamps: {}, justStamped: null, pendingStamp: null
  };

  /* ── 저장 ──────────────────────────────────────────── */
  function saveInput(o) {
    try {
      var copy = {};
      for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) copy[k] = o[k];
      copy.savedAt = new Date().toISOString();
      localStorage.setItem(STORE_KEY, JSON.stringify(copy));
    } catch (e) { /* 저장이 막혀도 계산은 그대로 */ }
  }
  function loadInput() {
    var keys = [STORE_KEY, MAIN_KEY];
    for (var i = 0; i < keys.length; i++) {
      try {
        var raw = localStorage.getItem(keys[i]);
        if (!raw) continue;
        var o = JSON.parse(raw);
        if (!o || !o.y || !o.m || !o.d || !o.gender) continue;
        return o;
      } catch (e) { /* 다음 후보 */ }
    }
    return null;
  }
  function clearInput() {
    try { localStorage.removeItem(STORE_KEY); } catch (e) {}
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtMD(iso) { var p = T.parseISO(iso); return p.m + '.' + p.d; }
  function fmtKoDate(iso) {
    var p = T.parseISO(iso);
    return p.y + '년 ' + p.m + '월 ' + p.d + '일';
  }

  /* ── 폼 ────────────────────────────────────────────── */
  function initForm() {
    var ySel = $('#year'), mSel = $('#month'), dSel = $('#day'), hSel = $('#hour'), miSel = $('#minute');
    var nowY = new Date().getFullYear();
    var opts = '<option value="">년</option>';
    for (var y = nowY; y >= 1940; y--) opts += '<option value="' + y + '">' + y + '년</option>';
    ySel.innerHTML = opts;

    opts = '<option value="">월</option>';
    for (var m = 1; m <= 12; m++) opts += '<option value="' + m + '">' + m + '월</option>';
    mSel.innerHTML = opts;
    fillDays();
    mSel.addEventListener('change', fillDays);

    opts = '<option value="">시</option>';
    for (var h = 0; h < 24; h++) opts += '<option value="' + h + '">' + (h < 10 ? '0' : '') + h + '시</option>';
    hSel.innerHTML = opts;

    opts = '<option value="">분</option>';
    for (var mi = 0; mi < 60; mi += 30) opts += '<option value="' + mi + '">' + (mi < 10 ? '0' : '') + mi + '분</option>';
    miSel.innerHTML = opts;

    var jisi = '';
    M.JISI.forEach(function (j) {
      var repH = Math.floor(j.rep / 60), repM = j.rep % 60;
      jisi += '<button type="button" class="jisi__btn" data-idx="' + j.idx + '" data-hour="' + repH +
        '" data-min="' + repM + '">' + j.ko +
        '<small>' + j.start + '~' + j.end + '</small></button>';
    });
    $('#jisi').innerHTML = jisi;
    $('#jisi').addEventListener('click', function (e) {
      var b = e.target.closest('.jisi__btn');
      if (!b) return;
      hSel.value = b.dataset.hour;
      miSel.value = b.dataset.min;
      syncJisi();
    });
    hSel.addEventListener('change', syncJisi);
    miSel.addEventListener('change', syncJisi);

    $('#genderChips').addEventListener('click', function (e) {
      var b = e.target.closest('.chip'); if (!b) return;
      state.gender = b.dataset.gender;
      $$('#genderChips .chip').forEach(function (c) {
        var on = c === b;
        c.classList.toggle('is-on', on);
        c.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      setGenderError(false);
      var alertEl = $('#formAlert');
      if (alertEl && !alertEl.hidden) alertEl.hidden = true;
    });

    $('#calendarSeg').addEventListener('click', function (e) {
      var b = e.target.closest('.seg'); if (!b) return;
      state.calendar = b.dataset.cal;
      $$('#calendarSeg .seg').forEach(function (c) {
        var on = c === b;
        c.classList.toggle('is-on', on);
        c.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      $('#leapRow').hidden = state.calendar !== 'lunar';
      $('#dateLabel').textContent = state.calendar === 'lunar' ? '음력 생년월일' : '생년월일';
      fillDays();
    });

    $('#timeUnknown').addEventListener('change', function () {
      var unk = this.checked;
      $('#timeBox').hidden = unk;
      $('#timeUnknownNote').hidden = !unk;
    });

    $('#region').innerHTML = M.REGIONS.map(function (r) {
      return '<option value="' + r.key + '">' + r.name + '</option>';
    }).join('');

    $('#birthForm').addEventListener('submit', onSubmit);
    $('#againBtn').addEventListener('click', openForm);
    $('#editBtn').addEventListener('click', openForm);
    $('#clearBtn').addEventListener('click', function () { clearInput(); location.reload(); });
    $('#prevMonth').addEventListener('click', function () { shiftMonth(-1); });
    $('#nextMonth').addEventListener('click', function () { shiftMonth(1); });
    $('#icsBtn').addEventListener('click', downloadICS);
  }

  function fillDays() {
    var y = $('#year').value, m = $('#month').value;
    var max = 31;
    if (y && m) {
      max = new Date(Number(y), Number(m), 0).getDate();
      if (state.calendar === 'lunar') max = 30;
    }
    var cur = $('#day').value;
    var opts = '<option value="">일</option>';
    for (var d = 1; d <= max; d++) opts += '<option value="' + d + '">' + d + '일</option>';
    $('#day').innerHTML = opts;
    if (cur && Number(cur) <= max) $('#day').value = cur;
  }

  function syncJisi() {
    var h = $('#hour').value, mi = $('#minute').value;
    var on = (h !== '' && mi !== '');
    var idx = on ? M.jisiIndex(Number(h), Number(mi)) : -1;
    $$('#jisi .jisi__btn').forEach(function (b) {
      b.classList.toggle('is-on', Number(b.dataset.idx) === idx);
    });
    var hint = $('#timeHint');
    if (hint) hint.textContent = on && idx >= 0 ? M.JISI[idx].ko + '시' : '';
  }

  function setGenderError(on) {
    $('#genderError').hidden = !on;
    $('#genderField').classList.toggle('is-error', on);
  }

  function readForm() {
    var o = {
      name: $('#name').value.trim(),
      gender: state.gender,
      calendar: state.calendar,
      y: Number($('#year').value), m: Number($('#month').value), d: Number($('#day').value),
      leap: $('#leap').checked,
      timeKnown: !$('#timeUnknown').checked,
      hh: Number($('#hour').value || 0), mm: Number($('#minute').value || 0),
      region: $('#region').value,
      trueSolar: $('#trueSolar').checked,
      dst: $('#dst').checked,
      ziRule: $('#ziRule').value
    };
    var r = M.REGIONS.filter(function (x) { return x.key === o.region; })[0];
    o.longitude = r ? r.lon : 126.98;
    return o;
  }

  function onSubmit(e) {
    e.preventDefault();
    var alertEl = $('#formAlert');
    if (!state.gender) {
      setGenderError(true);
      alertEl.hidden = false;
      alertEl.textContent = '성별을 선택해야 원국을 정확히 세울 수 있어요. 여성 / 남성을 골라 주세요.';
      $('#genderField').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setGenderError(false);
    alertEl.hidden = true;

    var o = readForm();
    if (!o.timeKnown) { o.hh = 12; o.mm = 0; }
    $('#submitBtn').classList.add('is-loading');
    $('#submitBtn').textContent = '원국을 세우는 중…';

    setTimeout(function () {
      try {
        var res = M.compute(o);
        saveInput(o);
        state.res = res;
        state.natal = T.natalOf(res);
        state.cache = {};
        state.sel = null;
        state.justStamped = null;
        for (var kd in ritual) if (Object.prototype.hasOwnProperty.call(ritual, kd)) delete ritual[kd];
        var today = new Date();
        state.todayISO = T.isoOf(today.getFullYear(), today.getMonth() + 1, today.getDate());
        state.view = clampView(today.getFullYear(), today.getMonth() + 1);
        $('#formCard').hidden = true;
        $('#result').hidden = false;
        render();
        $('#result').scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (err) {
        alertEl.hidden = false;
        alertEl.textContent = err && err.message ? err.message : '입력을 다시 확인해 주세요.';
        $('#formCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
      } finally {
        $('#submitBtn').classList.remove('is-loading');
        $('#submitBtn').textContent = '내 타이밍 캘린더 열기';
      }
    }, 40);
  }

  function applyInput(o) {
    $('#name').value = o.name || '';
    state.gender = o.gender === 'M' ? 'M' : (o.gender === 'F' ? 'F' : '');
    $$('#genderChips .chip').forEach(function (c) {
      var on = c.dataset.gender === state.gender;
      c.classList.toggle('is-on', on);
      c.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    setGenderError(false);

    state.calendar = o.calendar === 'lunar' ? 'lunar' : 'solar';
    $$('#calendarSeg .seg').forEach(function (b) {
      var on = b.dataset.cal === state.calendar;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    $('#leapRow').hidden = state.calendar !== 'lunar';
    $('#dateLabel').textContent = state.calendar === 'lunar' ? '음력 생년월일' : '생년월일';
    $('#year').value = o.y;
    $('#month').value = o.m;
    fillDays();
    $('#day').value = o.d;
    $('#leap').checked = !!o.leap;

    var known = o.timeKnown !== false;
    $('#timeUnknown').checked = !known;
    $('#timeBox').hidden = !known;
    $('#timeUnknownNote').hidden = known;
    $('#hour').value = known ? o.hh : '';
    $('#minute').value = known ? o.mm : '';
    if (o.region) $('#region').value = o.region;
    $('#trueSolar').checked = !!o.trueSolar;
    $('#dst').checked = !!o.dst;
    $('#ziRule').value = o.ziRule || '23';
    syncJisi();
  }

  function openForm() {
    $('#formCard').hidden = false;
    $('#formCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ── 공통 계산 ─────────────────────────────────────── */
  function clampView(y, m) {
    var v = y * 12 + (m - 1);
    var lo = 2026 * 12 + 10, hi = 2028 * 12 + 1;
    if (v < lo) v = lo;
    if (v > hi) v = hi;
    return { y: Math.floor(v / 12), m: (v % 12) + 1 };
  }
  function inFree(iso) {
    return iso >= state.todayISO && iso <= T.addDays(state.todayISO, FREE_DAYS - 1);
  }
  function infoFor(iso) {
    if (!state.natal) return null;
    if (state.cache[iso]) return state.cache[iso];
    var info = T.dayInfo(iso, state.natal, state.terms);
    state.cache[iso] = info;
    return info;
  }

  /* ── 1년 대표 수호 부적 ──────────────────────────── */
  function sigOf() {
    if (!state.res) return '';
    var i = state.res.input;
    return [i.y, i.m, i.d, i.gender, i.calendar, i.timeKnown ? 1 : 0, i.hh || 0, i.mm || 0].join('|');
  }
  function loadStamps() {
    try { state.stamps = JSON.parse(localStorage.getItem(STAMP_KEY)) || {}; } catch (e) { state.stamps = {}; }
    if (!state.stamps || typeof state.stamps !== 'object') state.stamps = {};
  }
  function stampOf(iso) {
    var bag = state.stamps[sigOf()];
    return bag && bag[iso] ? bag[iso] : null;
  }
  function saveStamp(iso, el) {
    var sig = sigOf();
    if (!sig) return;
    if (!state.stamps[sig]) state.stamps[sig] = {};
    state.stamps[sig][iso] = { el: el, at: new Date().toISOString() };
    try { localStorage.setItem(STAMP_KEY, JSON.stringify(state.stamps)); } catch (e) {}
  }

  /** 원국 글자에서 가장 적은 오행 → 1년 대표 부적.
   *  동률이면 나를 도와주는 순서(인성 → 비겁 → 식상 → 재성 → 관성)로 한 가지만 고른다. */
  function repElement() {
    var counts = (state.res && state.res.counts) || {};
    var me = state.res && state.res.dayMaster ? state.res.dayMaster.element : '토';
    var min = Infinity;
    EL_ORDER.forEach(function (e) { var c = counts[e] || 0; if (c < min) min = c; });
    if (min === Infinity) min = 0;
    var ties = EL_ORDER.filter(function (e) { return (counts[e] || 0) === min; });
    var pref = [EL_MOTHER[me], me, EL_BIRTH[me], EL_OVER[me], EL_PRESS[me]];
    var pick = ties[0];
    for (var i = 0; i < pref.length; i++) {
      if (ties.indexOf(pref[i]) >= 0) { pick = pref[i]; break; }
    }
    return { el: pick, count: min, ties: ties.length };
  }

  function renderTalisman() {
    var box = $('#talisBanner');
    if (!box) return;
    if (!state.res) { box.innerHTML = ''; return; }
    var r = repElement(), t = TALIS[r.el];
    var total = state.res.total || 8;
    var who = state.res.input.name ? state.res.input.name + ' 님' : '나';
    var why = (r.count === 0
      ? total + '글자에 ' + r.el + t.josa + ' 하나도 없어요. '
      : total + '글자 중 ' + r.el + t.josa + ' ' + r.count + '개로 가장 적어요. ') + t.why;
    box.innerHTML =
      '<img class="talis-banner__img" src="' + TALIS_PATH + t.key + '.jpg" width="76" height="76" ' +
      'alt="' + esc(t.label) + ' 수호 부적 캐릭터">' +
      '<div class="talis-banner__body">' +
      '<p class="talis-banner__eyebrow">GUARDIAN TALISMAN · 1년 대표 부적</p>' +
      '<p class="talis-banner__title">' + esc(who) + '의 2027 정미년 대표 수호 부적 — <b>' + esc(t.label) + '</b></p>' +
      '<p class="talis-banner__why">' + esc(why) + '</p>' +
      '<p class="talis-banner__note">1년 내내 이 기운이 내 사주를 받쳐 주는 부적이에요.' +
      (r.ties > 1 ? ' 가장 적은 오행이 여럿이라 나를 도와주는 기운부터 골랐어요.' : '') + '</p>' +
      '</div>';
  }

  /* ── 톡·톡·톡 리추얼 ───────────────────────────────── */
  function dayElement(info) {
    var badges = info.badges || [];
    if (badges.length && BADGE_TO_EL[badges[0].text]) return BADGE_TO_EL[badges[0].text];
    return repElement().el;   // 배지 없는 평범한 날은 1년 대표 부적으로
  }

  function doneText(t, iso) {
    return iso === state.todayISO ? t.done : t.done.replace('오늘 ', '이 날 ');
  }

  function ritualHTML(info) {
    var st = stampOf(info.iso);
    var auto = dayElement(info);
    var el = (st && st.el && TALIS[st.el]) ? st.el : auto;
    var t = TALIS[el];
    var done = !!st;
    var n = done ? 3 : (ritual[info.iso] || 0);
    var b0 = (info.badges || [])[0];
    var tag = (b0 && BADGE_TO_EL[b0.text] === el) ? b0.text : '1년 대표 부적';
    var lead = info.iso === state.todayISO ? '오늘의 수호 부적' : '이 날의 수호 부적';
    var msg = done
      ? esc(doneText(t, info.iso)) + '<small>' + esc(t.sub) + '</small>'
      : (n > 0 ? '한 번 더 — ' + (3 - n) + '번 남았어요.' : '부적을 세 번 두드려 ' +
        (info.iso === state.todayISO ? '오늘' : '그날') + '의 기운을 켜 보세요.');
    return '<div class="ritual ritual--' + el + (done ? ' is-done' : '') + '" data-ritual-wrap="' + info.iso + '" data-el="' + el + '">' +
      '<p class="ritual__eyebrow">' + lead + ' · ' + esc(t.label) + ' · ' + esc(tag) + '</p>' +
      '<button type="button" class="ritual__tap" data-ritual="tap" aria-label="' + esc(t.label) + ' 부적 두드리기 (' + n + '/3)">' +
      '<img class="ritual__img" src="' + TALIS_PATH + t.key + '.jpg" width="112" height="112" ' +
      'alt="' + esc(t.label) + ' 수호 부적 캐릭터, 세 번 두드려 오늘의 기운을 켜는 부적">' +
      '</button>' +
      '<p class="ritual__count">톡 · 톡 · 톡 <b>' + n + '/3</b></p>' +
      '<p class="ritual__msg" aria-live="polite">' + msg + '</p>' +
      '</div>';
  }

  function bop(btn) {
    var img = btn.querySelector('.ritual__img');
    if (!img) return;
    img.classList.remove('is-bop');
    void img.offsetWidth;   // 애니메이션 재시작
    img.classList.add('is-bop');
  }

  function spawnFx(btn) {
    var old = btn.querySelector('.ritual__fx');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var s = document.createElement('span');
    s.className = 'ritual__fx';
    btn.appendChild(s);
    setTimeout(function () { if (s.parentNode) s.parentNode.removeChild(s); }, 720);
  }

  function onRitualTap(btn) {
    var wrap = btn.closest('[data-ritual-wrap]');
    if (!wrap) return;
    var iso = wrap.getAttribute('data-ritual-wrap');
    var el = wrap.getAttribute('data-el');
    var t = TALIS[el];
    if (!t) return;
    var n = stampOf(iso) ? 3 : (ritual[iso] || 0);
    bop(btn);
    if (n >= 3) return;                       // 이미 찍힌 날 — 살짝 튀기기만
    n += 1;
    ritual[iso] = n;
    spawnFx(btn);
    if (n >= 3) sfxDone(); else sfxTap(n);

    var countEl = wrap.querySelector('.ritual__count b');
    if (countEl) countEl.textContent = n + '/3';
    btn.setAttribute('aria-label', esc(t.label) + ' 부적 두드리기 (' + n + '/3)');

    var msgEl = wrap.querySelector('.ritual__msg');
    if (n >= 3) {
      saveStamp(iso, el);
      wrap.classList.add('is-done');
      if (msgEl) msgEl.innerHTML = esc(doneText(t, iso)) + '<small>' + esc(t.sub) + '</small>';
      if (modalEl && !modalEl.hidden) {
        // 팝업이 닫히는 순간 달력 셀에 도장이 쾅 찍히도록 미뤄 둔다
        state.pendingStamp = iso;
        var note = modalBody && modalBody.querySelector('.modal__stamp-note');
        if (note) note.hidden = false;
      } else {
        state.justStamped = iso;
        renderCalendar();                     // 달력 셀에 도장이 쾅
      }
    } else if (msgEl) {
      msgEl.textContent = t.taps[n - 1] || ('한 번 더 — ' + (3 - n) + '번 남았어요.');
    }
  }

  /* ── 렌더 ──────────────────────────────────────────── */
  function render() {
    renderSavedBar();
    renderNatal();
    renderTalisman();
    renderCalendar();
    renderIcs();
  }

  function renderSavedBar() {
    var r = state.res;
    var nm = (r.input.name ? r.input.name + ' 님' : '내 사주');
    $('#savedBarName').textContent = nm;
    var lunar = r.lunar ? '음력 ' + (r.lunar.leap ? '윤' : '') + r.lunar.m + '.' + r.lunar.d : '';
    $('#savedBarMeta').textContent = '양력 ' + r.solar.y + '.' + r.solar.m + '.' + r.solar.d +
      (r.input.timeKnown ? ' ' + (r.input.hh < 10 ? '0' : '') + r.input.hh + ':' + (r.input.mm < 10 ? '0' : '') + r.input.mm : ' · 시간 모름') +
      ' · ' + (r.input.gender === 'M' ? '남성' : '여성') + (lunar ? ' · ' + lunar : '');
  }

  function renderNatal() {
    var p = state.res.pillars, t = state.res.tenGod;
    var cols = [
      { key: 'time', pos: '시주', me: false },
      { key: 'day', pos: '일주', me: true },
      { key: 'month', pos: '월주', me: false },
      { key: 'year', pos: '년주', me: false }
    ];

    // 정통 만세력식 4칸 표: [시주 | 일주 | 월주 | 년주]
    //  위 → 아래: 천간 십신 / 천간 타일 / 지지 타일 / 지지 십신
    var row = { pos: [], ganTen: [], gan: [], zhi: [], zhiTen: [] };
    cols.forEach(function (c) {
      var me = c.me ? ' is-me' : '';
      row.pos.push('<span class="natal__pos' + me + '">' + c.pos + '</span>');

      var pil = p[c.key];
      if (!pil) {
        row.ganTen.push('<span class="natal__ten' + me + '">—</span>');
        row.gan.push('<span class="natal__tile natal__tile--none' + me + '">—</span>');
        row.zhi.push('<span class="natal__tile natal__tile--none' + me + '">—</span>');
        row.zhiTen.push('<span class="natal__ten natal__ten--zhi natal__ten--mute' + me + '">시간 모름</span>');
        return;
      }

      var tg = t[c.key] || {};
      row.ganTen.push('<span class="natal__ten natal__ten--gan' + me + '">' +
        (c.me ? '일간<small>나</small>' : esc(tg.gan || '—')) + '</span>');
      row.gan.push('<span class="natal__tile natal__tile--' + esc(M.GAN_EL[pil.ganIndex]) + me + '">' + esc(pil.gan) + '</span>');
      row.zhi.push('<span class="natal__tile natal__tile--' + esc(M.ZHI_EL[pil.zhiIndex]) + me + '">' + esc(pil.zhi) + '</span>');
      row.zhiTen.push('<span class="natal__ten natal__ten--zhi' + me + '">' + esc(tg.zhi || '—') + '</span>');
    });

    $('#natal').innerHTML = row.pos.concat(row.ganTen, row.gan, row.zhi, row.zhiTen).join('');

    var jq = state.res.jieqi;
    $('#natalMeta').textContent = state.res.input.gender === 'M' ? '남성' : '여성';
    $('#natalNote').innerHTML = '연주는 입춘 ' + esc(jq.lichun) + ' 기준, 월주는 ' + esc(jq.prev.name) + ' 절입 ' + esc(jq.prev.at) + ' 이후로 계산했어요.' +
      (state.res.input.timeKnown ? ' 지지 십신은 지장간의 본기(本氣) 기준입니다.' : ' 시간을 몰라 시주는 비워 두었습니다.');
  }

  function renderCalendar() {
    var v = state.view;
    $('#calYear').textContent = v.y;
    $('#calTitle').textContent = v.m + '월';

    var first = new Date(Date.UTC(v.y, v.m - 1, 1)).getUTCDay();
    var dim = T.daysInMonth(v.y, v.m);
    if (T.isoOf(v.y, v.m, dim) > RANGE_TO) dim = T.parseISO(RANGE_TO).d;   // 마지막 달은 정미년 끝까지만
    var html = '';
    for (var i = 0; i < first; i++) html += '<span aria-hidden="true"></span>';

    var stat = { red: 0, gold: 0, blue: 0, gray: 0 };
    for (var d = 1; d <= dim; d++) {
      var iso = T.isoOf(v.y, v.m, d);
      var info = infoFor(iso);
      if (!info) continue;
      var badges = info.badges || [];
      var cls = ['day'];
      if (info.dow === 0) cls.push('day--sun');
      if (info.dow === 6) cls.push('day--sat');
      if (iso < state.todayISO) cls.push('day--past');
      else if (inFree(iso)) cls.push('day--free');
      if (iso === state.todayISO) cls.push('is-today');
      if (iso === state.sel) cls.push('is-sel');

      // 셀 배경 틴트는 입단속·럭키에만 — 결정·머니·리셋은 배지로만 표시해 색을 아낀다
      var lead = badges.length ? badges[0].cat : '';
      if (lead === 'red' || lead === 'gold') cls.push('day--t-' + lead);

      badges.forEach(function (b) { if (stat[b.cat] != null) stat[b.cat]++; });

      var badgeHtml = badges.map(function (b) {
        return '<span class="badge badge--' + b.cat + ' day__badge">' + esc(b.text) + '</span>';
      }).join('');

      var label = v.m + '월 ' + d + '일 ' + DOW_KO[info.dow] + '요일, ' + info.headline;
      if (iso < state.todayISO) label = v.m + '월 ' + d + '일, 지난 날';
      var stamp = stampOf(iso);
      if (stamp) {
        cls.push('day--stamped');
        if (iso >= state.todayISO) label += ', 부적 완료';
      }

      html += '<button type="button" class="' + cls.join(' ') + '" data-iso="' + iso + '"' +
        (iso === state.sel ? ' aria-current="date"' : '') +
        (iso < state.todayISO ? ' tabindex="-1"' : '') +
        ' aria-label="' + esc(label) + '">' +
        '<span class="day__num">' + d + '</span>' +
        (stamp ? '<span class="day__stamp' + (state.justStamped === iso ? ' is-new' : '') + '" aria-hidden="true">✓</span>' : '') +
        '<span class="day__badges">' + badgeHtml + '</span>' +
        '</button>';
    }
    $('#calGrid').innerHTML = html;
    state.justStamped = null;

    var bits = [];
    if (stat.gold) bits.push('럭키 ' + stat.gold);
    if (stat.red) bits.push('입단속 ' + stat.red);
    if (stat.blue) bits.push('결정·머니 ' + stat.blue);
    if (stat.gray) bits.push('리셋 ' + stat.gray);
    $('#calSummary').textContent = bits.length ? bits.join('  ·  ') : '이 달은 표시할 신호가 적은 달이에요';

    $('#prevMonth').disabled = (v.y === 2026 && v.m === 11);
    $('#nextMonth').disabled = (v.y === 2028 && v.m === 2);

    renderSaeun(v, dim);

    var freeEnd = T.parseISO(T.addDays(state.todayISO, FREE_DAYS - 1));
    var noteText = freeEnd.m + '월 ' + freeEnd.d + '일까지는 날짜를 눌러 처방을 볼 수 있어요. 그 뒤 날짜는 표시만 보이고, 누르면 여는 방법이 나옵니다.';
    if (v.y === 2028 && v.m === 2) {
      noteText = '정미년은 2028년 2월 3일까지예요. 2월 4일 입춘부터는 무신년(戊申)으로 세운이 바뀌어 달력이 여기서 끝납니다.';
    }
    $('#calNote').textContent = noteText;
  }

  /* ── 세운 줄: 입춘에서 해가 바뀐다 ─────────────────── */
  function renderSaeun(v, dim) {
    var el = $('#calSaeun');
    if (!el) return;
    var s1 = T.saeunOf(T.isoOf(v.y, v.m, 1), state.terms);
    var s2 = T.saeunOf(T.isoOf(v.y, v.m, dim), state.terms);
    if (!s1 || !s2) { el.textContent = ''; el.classList.remove('is-shift'); return; }

    if (s1.year !== s2.year) {
      // 이 달 안에서 입춘을 지나 해가 바뀐다
      var lc = null;
      state.terms.list.forEach(function (t) {
        if (t.ko === '입춘' && t.iso.slice(0, 7) === T.isoOf(v.y, v.m, 1).slice(0, 7)) lc = t;
      });
      var md = lc ? (T.parseISO(lc.iso).m + '.' + T.parseISO(lc.iso).d) : '';
      el.innerHTML = '<b>' + esc(s1.label) + '</b> → <b>' + esc(s2.label) + '</b>' +
        (md ? ' · ' + md + ' 입춘 시작' : '');
      el.classList.add('is-shift');
      return;
    }

    el.classList.remove('is-shift');
    if (T.isoOf(v.y, v.m, dim) === RANGE_TO) {
      var e = T.parseISO(RANGE_TO);
      el.innerHTML = '<b>' + esc(s1.label) + '</b> · ' + e.m + '.' + e.d + '까지 (정미년 끝)'; 
    } else if (s1.year < 2027) {
      el.innerHTML = '<b>' + esc(s1.label) + '</b> · 정미년 입춘 전';
    } else {
      el.innerHTML = '<b>' + esc(s1.label) + '</b>';
    }
  }

  function shiftMonth(dir) {
    var v = clampView(state.view.y, state.view.m + dir);
    if (v.y === state.view.y && v.m === state.view.m) return;
    state.view = v;
    state.sel = null;
    renderCalendar();
  }

  /* ── 날짜 팝업 모달 ───────────────────────────────── */
  var modalEl = null, modalBody = null, modalDialog = null;
  var lastFocus = null, modalClosing = false;

  function openDayModal(iso) {
    var info = infoFor(iso);
    if (!info || !modalEl) return;
    var lock = !inFree(iso);
    lastFocus = document.activeElement;
    state.sel = iso;
    renderCalendar();                       // 날짜 칸 선택 표시
    modalBody.innerHTML = lock ? lockModalHTML(info) : briefModalHTML(info);
    modalDialog.classList.toggle('modal__dialog--lock', lock);
    modalEl.hidden = false;
    document.body.classList.add('is-modal-open');
    modalBody.scrollTop = 0;
    sfxOpen();                              // 뿅 — 사용자 클릭 안에서 재생
    try { modalDialog.focus({ preventScroll: true }); } catch (e) { modalDialog.focus(); }
  }

  function closeDayModal() {
    if (!modalEl || modalEl.hidden || modalClosing) return;
    modalClosing = true;
    modalEl.classList.add('is-closing');
    var backIso = state.sel;
    setTimeout(function () {
      modalEl.classList.remove('is-closing');
      modalEl.hidden = true;
      document.body.classList.remove('is-modal-open');
      modalBody.innerHTML = '';
      modalClosing = false;
      if (state.pendingStamp) {
        // 팝업이 사라진 자리에서 달력 셀에 금색 ✓가 쾅
        state.justStamped = state.pendingStamp;
        state.pendingStamp = null;
        renderCalendar();
      }
      var back = backIso ? $('#calGrid .day[data-iso="' + backIso + '"]') : null;
      var target = back || lastFocus;
      if (target && target.focus) { try { target.focus({ preventScroll: true }); } catch (e) {} }
      lastFocus = null;
    }, 180);
  }

  function modalHead(info) {
    var today = info.iso === state.todayISO;
    return '<p class="modal__eyebrow">' + (today ? 'TODAY · 데일리 브리핑' : 'DAILY BRIEFING · 데일리 브리핑') + '</p>' +
      '<p class="modal__date" id="modalTitle">' + fmtMD(info.iso) +
      '<span>' + DOW_KO[info.dow] + '요일 · ' + esc(info.gz.textKo) + '일</span></p>' +
      '<p class="modal__sub">' + esc(fmtKoDate(info.iso)) + ' · 음력 ' + esc(info.lunarText) + '</p>';
  }

  function briefModalHTML(info) {
    var gz = info.gz;
    var today = info.iso === state.todayISO;
    var when = today ? '오늘' : '이 날';
    var strong = info.marks.filter(function (m) { return !m.minor && m.cat !== 'gray'; });
    var markHtml = strong.slice(0, 3).map(function (m) {
      return '<span class="mark mark--' + m.cat + '"><span class="mark__dot dot dot--' + m.cat + '"></span>' + esc(m.label) + '</span>';
    }).join('');
    var why = info.marks.filter(function (m) { return m.cat !== 'gray'; })
      .map(function (m) { return '<li>' + esc(m.detail) + '</li>'; }).join('');
    var whyTen = '<li>내 일간 ' + esc(state.natal ? state.natal.gan : '') + ' 기준, ' + when + ' 천간 ' + esc(gz.gan) + '은 ' +
      esc(info.tenGod || '—') + ' — ' +
      esc(info.tenGod === '비견' || info.tenGod === '겁재' ? '내 기운이 그대로 올라오는 자리' : '내 사주 위에 하루가 얹히는 자리') + '</li>';

    var termLine = info.term
      ? '<p class="brief__term"><b>' + esc(info.term.ko) + '</b> ' + esc(info.term.time) + ' · ' +
        (info.term.isJie ? esc(info.term.monthText) + '월 시작' + (info.term.yearText ? ' (' + esc(info.term.yearText) + '년)' : '') : '24절기') + '</p>'
      : '';
    var saeunHtml = info.saeun
      ? '<p class="brief__saeun">' + esc(info.saeun.label) + ' 세운' +
        (info.saeun.isLichunDay ? ' · <b>이날 입춘, 새 세운 시작</b>' : '') + '</p>'
      : '';

    return modalHead(info) +
      '<p class="modal__headline">' + esc(info.headline) + '</p>' +
      saeunHtml +
      ritualHTML(info) +
      '<p class="modal__stamp-note"' + (stampOf(info.iso) ? '' : ' hidden') + '>✓ 달력에 금색 완료 도장을 찍었어요.</p>' +
      '<div class="brief__gz modal__gz">' +
      '<span class="brief__gz-hanja">' + esc(gz.text) + '</span>' +
      '<span class="brief__gz-ko">' + esc(gz.textKo) + '일</span>' +
      '<span class="pill pill--' + esc(info.ganEl) + '">' + esc(info.ganEl) + '</span>' +
      '<span class="pill pill--' + esc(info.zhiEl) + '">' + esc(info.zhiEl) + '</span>' +
      (info.tenGod ? '<span class="pill">' + esc(info.tenGod) + '</span>' : '') +
      '</div>' +
      (markHtml ? '<div class="marks">' + markHtml + '</div>' : '') +
      '<ul class="brief__why">' + whyTen + why + '</ul>' +
      '<div class="rx">' +
      '<p class="rx__label">' + when + '의 처방</p>' +
      '<div class="rx__item"><span class="rx__n">01</span><span>' + esc(info.lines[0]) + '</span></div>' +
      '<div class="rx__item"><span class="rx__n">02</span><span>' + esc(info.lines[1]) + '</span></div>' +
      '</div>' +
      termLine +
      '<button type="button" class="btn btn--ghost modal__done-btn" data-modal-close>닫고 달력 보기</button>';
  }

  function lockModalHTML(info) {
    var marks = info.marks.filter(function (m) { return !m.minor && m.cat !== 'gray'; }).slice(0, 2);
    var markHtml = marks.map(function (m) {
      return '<span class="mark"><span class="mark__dot dot dot--' + m.cat + '"></span>' + esc(m.label) + '</span>';
    }).join('');
    var fe = T.parseISO(T.addDays(state.todayISO, FREE_DAYS - 1));
    return '<p class="modal__eyebrow">FREE TRIAL · 3 DAYS</p>' +
      '<p class="modal__date" id="modalTitle">' + fmtMD(info.iso) +
      '<span>' + DOW_KO[info.dow] + '요일 · ' + esc(info.gz.textKo) + '일' +
      (info.saeun ? ' · ' + esc(info.saeun.label) : '') + '</span></p>' +
      (info.term ? '<p class="lock__term">' + esc(info.term.ko) + ' ' + esc(info.term.time) +
        (info.term.isJie ? ' · ' + esc(info.term.monthText) + '월 시작' : '') + '</p>' : '') +
      '<p class="lock__title">🔒 3일 무료 체험 이후<br>정미년 1년 전체 열기</p>' +
      '<p class="lock__sub">정미년 패스 / 윤이세 1:1 상담</p>' +
      '<p class="lock__early">얼리버드 12+2개월 · 2026 연말·1월 보너스 포함</p>' +
      (markHtml ? '<div class="lock__marks">' + markHtml + '</div>' : '') +
      '<p class="lock__hint">이 날의 작용과 처방은 무료 구간(' + fe.m + '월 ' + fe.d + '일까지) 밖이에요. ' +
      '지금 시작하면 2026 남은 연말·1월은 보너스로 열리고, 2027 정미년(입춘~) 1년 전체와 리셋 알람까지 이어집니다.</p>' +
      '<div class="lock__actions">' +
      '<a class="btn btn--cream" href="' + KAKAO + '" target="_blank" rel="noopener">카카오톡으로 1:1 상담</a>' +
      '<a class="btn btn--ghost-light" href="' + LITTLY + '" target="_blank" rel="noopener">정미년 패스 안내 보기</a>' +
      '</div>' +
      '<button type="button" class="btn modal__done-btn modal__done-btn--dark" data-modal-close>닫고 달력 보기</button>';
  }

  /* ── 효과음 · 진동 (Web Audio 합성, 음원 파일 없음) ── */
  var SOUND_KEY = 'yoonise.timing.sound.v1';
  var sound = { on: true, ctx: null };

  function loadSoundPref() {
    try { if (localStorage.getItem(SOUND_KEY) === '0') sound.on = false; } catch (e) {}
  }
  function saveSoundPref() {
    try { localStorage.setItem(SOUND_KEY, sound.on ? '1' : '0'); } catch (e) {}
  }
  function vibrate(p) {
    if (!sound.on || !navigator.vibrate) return;
    try { navigator.vibrate(p); } catch (e) {}
  }
  /* AudioContext는 반드시 사용자 제스처(날짜 클릭·부적 탭) 안에서 만든다
     — 모바일 Safari/Chrome 자동재생 정책 통과용 */
  function audioCtx() {
    if (!sound.on) return null;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      if (!sound.ctx) sound.ctx = new AC();
      if (sound.ctx.state === 'suspended' && sound.ctx.resume) sound.ctx.resume();
      return sound.ctx;
    } catch (e) { return null; }
  }
  function tone(ctx, o) {
    var t0 = ctx.currentTime + (o.at || 0);
    var osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.from, t0);
    if (o.to && o.to !== o.from) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + (o.glide || o.dur));
    var peak = o.gain == null ? 0.14 : o.gain;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + (o.attack || 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(t0); osc.stop(t0 + o.dur + 0.03);
  }
  /* 나무 타격의 '톡' — 아주 짧은 밴드패스 노이즈 */
  function wood(ctx, at, gain) {
    var n = Math.floor(ctx.sampleRate * 0.05);
    if (n <= 0) return;
    var buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3.2);
    var src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 1.0;
    g.gain.value = gain == null ? 0.05 : gain;
    src.buffer = buf; src.connect(bp); bp.connect(g); g.connect(ctx.destination);
    src.start(ctx.currentTime + (at || 0));
  }

  /* 1) 모달이 뿅 튀어나올 때 — 880→1320Hz 맑은 차임 */
  function sfxOpen() {
    vibrate(15);
    var ctx = audioCtx(); if (!ctx) return;
    tone(ctx, { from: 880, to: 1320, dur: 0.34, glide: 0.13, type: 'sine', gain: 0.13 });
    tone(ctx, { from: 1320, to: 1760, dur: 0.28, type: 'sine', gain: 0.055, at: 0.07, glide: 0.12 });
  }
  /* 2) 부적 두드리기(1/3·2/3) — 420→220Hz 톡, 두 번째는 살짝 높게 */
  function sfxTap(step) {
    vibrate(25);
    var ctx = audioCtx(); if (!ctx) return;
    var base = 420 + (step - 1) * 45;
    tone(ctx, { from: base, to: base * 0.52, dur: 0.14, glide: 0.05, type: 'triangle', gain: 0.2, attack: 0.004 });
    tone(ctx, { from: base * 2, to: base * 2, dur: 0.06, type: 'sine', gain: 0.045 });
    wood(ctx, 0, 0.05);
  }
  /* 3) 3/3 완료 — 도장 '쾅' 저음 타격 + C5-E5-G5-C6 상승 아르페지오 */
  function sfxDone() {
    vibrate([30, 40, 55]);
    var ctx = audioCtx(); if (!ctx) return;
    // 쾅 — 낮게 떨어지는 타격 + 노이즈 임팩트
    tone(ctx, { from: 150, to: 52, dur: 0.26, glide: 0.16, type: 'sine', gain: 0.42, attack: 0.004 });
    tone(ctx, { from: 96, to: 44, dur: 0.34, glide: 0.22, type: 'triangle', gain: 0.2, attack: 0.006 });
    wood(ctx, 0, 0.12);
    // 반짝 — 상승 화음
    [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) {
      tone(ctx, { from: f, to: f, dur: 0.55, type: 'sine', gain: 0.15, at: 0.09 + i * 0.085, attack: 0.008 });
      tone(ctx, { from: f * 2, to: f * 2, dur: 0.4, type: 'triangle', gain: 0.035, at: 0.09 + i * 0.085 });
    });
  }
  function syncSoundBtn() {
    $$('.js-sound').forEach(function (b) {
      b.textContent = sound.on ? '🔊 소리' : '🔇 무음';
      b.setAttribute('aria-pressed', sound.on ? 'true' : 'false');
      b.setAttribute('aria-label', sound.on ? '효과음과 진동 켜짐 — 끄기' : '효과음과 진동 꺼짐 — 켜기');
      b.title = sound.on ? '효과음·진동 끄기' : '효과음·진동 켜기';
      b.classList.toggle('is-off', !sound.on);
    });
  }

  /* ── .ics ──────────────────────────────────────────── */
  function renderIcs() {
    var days = [];
    for (var i = 0; i < FREE_DAYS; i++) {
      var iso = T.addDays(state.todayISO, i);
      var info = infoFor(iso);
      if (!info) continue;
      days.push(info);
    }
    var exportable = days.filter(function (d) {
      return !!d.term || d.marks.some(function (m) { return !m.minor && (m.cat === 'red' || m.cat === 'gold'); });
    });
    state.icsDays = exportable;
    var btn = $('#icsBtn');
    btn.disabled = exportable.length === 0;
    var end = T.parseISO(T.addDays(state.todayISO, FREE_DAYS - 1));
    $('#icsStatus').textContent = exportable.length
      ? '오늘 ~ ' + end.m + '.' + end.d + ' 중 ' + exportable.length + '일이 담깁니다. 기기 캘린더에 넣으면 전날 저녁과 당일 오전에 알림이 떠요.'
      : '이번 3일은 담을 만한 럭키·입단속 날이 없어요. 잔잔한 날은 알림 없이 넘어갑니다.';
  }

  function downloadICS() {
    if (!state.icsDays.length) return;
    try {
      var name = state.res.input.name || '';
      var text = T.buildICS(state.icsDays, { name: name });
      var fileName = 'yoonise-timing-' + state.todayISO.replace(/-/g, '') + '-free3.ics';
      var blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = fileName;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
      $('#icsStatus').textContent = '파일을 만들었어요 — ' + fileName + ' · 열어서 캘린더에 추가해 주세요.';
    } catch (e) {
      $('#icsStatus').textContent = '이 브라우저에서는 파일 저장이 막혀 있어요. 잠시 뒤 다시 시도해 주세요.';
    }
  }

  /* ── 시작 ──────────────────────────────────────────── */
  function boot() {
    var now = new Date();
    state.todayISO = T.isoOf(now.getFullYear(), now.getMonth() + 1, now.getDate());
    state.terms = T.buildTerms(TERMS_FROM, RANGE_TO);
    loadStamps();
    state.view = clampView(now.getFullYear(), now.getMonth() + 1);
    initForm();

    modalEl = $('#dayModal');
    modalBody = $('#modalBody');
    modalDialog = $('#modalDialog');

    loadSoundPref();
    syncSoundBtn();
    $$('.js-sound').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        sound.on = !sound.on;
        saveSoundPref();
        syncSoundBtn();
        if (sound.on) sfxTap(1);            // 켜졌다는 확인음도 제스처 안에서
      });
    });

    // 팝업 안: 부적 두드리기 / X·배경·닫기 버튼
    modalEl.addEventListener('click', function (e) {
      var tap = e.target.closest ? e.target.closest('[data-ritual="tap"]') : null;
      if (tap) { onRitualTap(tap); return; }
      if (e.target.closest('[data-modal-close]')) closeDayModal();
    });

    // ESC 닫기 + Tab 포커스가 팝업 밖으로 나가지 않게
    document.addEventListener('keydown', function (e) {
      if (!modalEl || modalEl.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); closeDayModal(); return; }
      if (e.key !== 'Tab') return;
      var f = $$('a[href], button:not([disabled])', modalDialog).filter(function (el) {
        return el.offsetParent !== null;
      });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === modalDialog)) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    });

    $('#calGrid').addEventListener('click', function (e) {
      var b = e.target.closest('.day[data-iso]');
      if (!b) return;
      var iso = b.dataset.iso;
      if (iso < state.todayISO) return;
      openDayModal(iso);
    });

    var saved = loadInput();
    if (saved) {
      applyInput(saved);
      try {
        var o = readForm();
        o.y = saved.y; o.m = saved.m; o.d = saved.d; o.leap = !!saved.leap;
        o.calendar = saved.calendar || 'solar';
        o.timeKnown = saved.timeKnown !== false;
        o.hh = saved.hh; o.mm = saved.mm;
        o.region = saved.region || 'seoul';
        o.trueSolar = !!saved.trueSolar; o.dst = !!saved.dst; o.ziRule = saved.ziRule || '23';
        var r = M.REGIONS.filter(function (x) { return x.key === o.region; })[0];
        o.longitude = r ? r.lon : 126.98;
        o.gender = saved.gender;
        state.res = M.compute(o);
        state.natal = T.natalOf(state.res);
        state.cache = {};
        $('#formCard').hidden = true;
        $('#result').hidden = false;
        render();
      } catch (err) {
        $('#formCard').hidden = false;
      }
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

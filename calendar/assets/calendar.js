/*! 윤이세 내 인생 타이밍 캘린더 — 화면 로직 */
(function () {
  'use strict';

  var M = window.Manse, T = window.Timing;
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var STORE_KEY = 'yoonise.timing.v1';
  var MAIN_KEY = 'yoonise.oheng.last.v1';   // 기존 오행 앱에 저장된 사주가 있으면 그대로 이어받는다
  var RANGE_FROM = '2026-11-01';
  var RANGE_TO = '2027-12-31';
  var FREE_DAYS = 3;   // 오늘 포함 3일(D+0·D+1·D+2)만 무료
  var DOW_EN = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  var DOW_KO = ['일', '월', '화', '수', '목', '금', '토'];
  var KAKAO = 'https://pf.kakao.com/_hxfbCG/chat';
  var LITTLY = 'https://litt.ly/yoonise';

  var state = {
    gender: '', calendar: 'solar', res: null, natal: null,
    terms: null, view: null, sel: null, todayISO: '', cache: {}, icsDays: []
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
    var lo = 2026 * 12 + 10, hi = 2027 * 12 + 11;
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

  /* ── 렌더 ──────────────────────────────────────────── */
  function render() {
    renderSavedBar();
    renderNatal();
    renderCalendar();
    renderIcs();
    var sel = state.sel || state.todayISO;
    if (sel >= RANGE_FROM && sel <= RANGE_TO) {
      if (!state.sel) {
        var p = T.parseISO(sel);
        if (p.y === state.view.y && p.m === state.view.m) { state.sel = sel; }
        else state.sel = state.view.y + '-' + (state.view.m < 10 ? '0' : '') + state.view.m + '-01';
      }
      renderDetail(state.sel);
    }
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

      // 셀 배경 틴트는 주의·기회에만 — 계약·재물·절기는 배지로만 표시해 색을 아낀다
      var lead = badges.length ? badges[0].cat : '';
      if (lead === 'red' || lead === 'gold') cls.push('day--t-' + lead);

      badges.forEach(function (b) { if (stat[b.cat] != null) stat[b.cat]++; });

      var badgeHtml = badges.map(function (b) {
        return '<span class="badge badge--' + b.cat + ' day__badge">' + esc(b.text) + '</span>';
      }).join('');

      var label = v.m + '월 ' + d + '일 ' + DOW_KO[info.dow] + '요일, ' + info.headline;
      if (iso < state.todayISO) label = v.m + '월 ' + d + '일, 지난 날';

      html += '<button type="button" class="' + cls.join(' ') + '" data-iso="' + iso + '"' +
        (iso === state.sel ? ' aria-current="date"' : '') +
        (iso < state.todayISO ? ' tabindex="-1"' : '') +
        ' aria-label="' + esc(label) + '">' +
        '<span class="day__num">' + d + '</span>' +
        '<span class="day__badges">' + badgeHtml + '</span>' +
        '</button>';
    }
    $('#calGrid').innerHTML = html;

    var bits = [];
    if (stat.gold) bits.push('기회 ' + stat.gold);
    if (stat.red) bits.push('주의 ' + stat.red);
    if (stat.blue) bits.push('계약·재물 ' + stat.blue);
    if (stat.gray) bits.push('절기 ' + stat.gray);
    $('#calSummary').textContent = bits.length ? bits.join('  ·  ') : '이 달은 표시할 신호가 적은 달이에요';

    $('#prevMonth').disabled = (v.y === 2026 && v.m === 11);
    $('#nextMonth').disabled = (v.y === 2027 && v.m === 12);

    var freeEnd = T.parseISO(T.addDays(state.todayISO, FREE_DAYS - 1));
    $('#calNote').textContent = freeEnd.m + '월 ' + freeEnd.d + '일까지는 날짜를 눌러 처방을 볼 수 있어요. 그 뒤 날짜는 표시만 보이고, 누르면 여는 방법이 나옵니다.';
  }

  function shiftMonth(dir) {
    var v = clampView(state.view.y, state.view.m + dir);
    if (v.y === state.view.y && v.m === state.view.m) return;
    state.view = v;
    var p = T.parseISO(state.todayISO);
    state.sel = (p.y === v.y && p.m === v.m) ? state.todayISO : T.isoOf(v.y, v.m, 1);
    renderCalendar();
    renderDetail(state.sel);
  }

  /* ── 날짜 상세 ─────────────────────────────────────── */
  function renderDetail(iso) {
    var info = infoFor(iso);
    if (!info) return;
    var el = $('#detail');
    if (iso < state.todayISO) {
      el.innerHTML = '<article class="brief"><p class="brief__date">' + fmtMD(iso) +
        '<small>' + DOW_EN[info.dow] + '</small></p>' +
        '<p class="brief__headline" style="margin-top:10px">지난 날이에요.</p>' +
        '<p class="micro">지난 날짜의 처방은 열리지 않습니다. 오늘이나 내일 날짜를 눌러 보세요.</p></article>';
      return;
    }
    if (!inFree(iso)) { el.innerHTML = lockHTML(info); return; }
    el.innerHTML = briefHTML(info);
  }

  function briefHTML(info) {
    var gz = info.gz;
    var strong = info.marks.filter(function (m) { return !m.minor && m.cat !== 'gray'; });
    var marks = strong.slice(0, 3);
    var markHtml = marks.map(function (m) {
      return '<span class="mark mark--' + m.cat + '"><span class="mark__dot dot dot--' + m.cat + '"></span>' + esc(m.label) + '</span>';
    }).join('');
    var why = info.marks.filter(function (m) { return m.cat !== 'gray'; })
      .map(function (m) { return '<li>' + esc(m.detail) + '</li>'; }).join('');
    var myGan = state.natal ? state.natal.gan : '';
    var whyTen = '<li>내 일간 ' + esc(myGan) + ' 기준, 오늘 천간 ' + esc(gz.gan) + '은 ' + esc(info.tenGod || '—') +
      ' — ' + esc(info.tenGod === '비견' || info.tenGod === '겁재' ? '내 기운이 그대로 올라오는 자리' : '내 사주 위에 오늘 얹히는 자리') + '</li>';

    var termLine = info.term
      ? '<p class="brief__term"><b>' + esc(info.term.ko) + '</b> ' + esc(info.term.time) + ' · ' +
        (info.term.isJie ? esc(info.term.monthText) + '월 시작' + (info.term.yearText ? ' (' + esc(info.term.yearText) + '년)' : '') : '24절기') + '</p>'
      : '';

    return '<article class="brief">' +
      '<div class="brief__top">' +
      '<p class="brief__date">' + fmtMD(info.iso) + '<small>' + DOW_EN[info.dow] + '</small></p>' +
      '<p class="brief__lunar">' + esc(fmtKoDate(info.iso)) + '<br>음력 ' + esc(info.lunarText) + '</p>' +
      '</div>' +
      '<p class="brief__headline">' + esc(info.headline) + '</p>' +
      '<div class="brief__rule"></div>' +
      '<div class="brief__gz">' +
      '<span class="brief__gz-hanja">' + esc(gz.text) + '</span>' +
      '<span class="brief__gz-ko">' + esc(gz.textKo) + '일</span>' +
      '<span class="pill pill--' + esc(info.ganEl) + '">' + esc(info.ganEl) + '</span>' +
      '<span class="pill pill--' + esc(info.zhiEl) + '">' + esc(info.zhiEl) + '</span>' +
      (info.tenGod ? '<span class="pill">' + esc(info.tenGod) + '</span>' : '') +
      '</div>' +
      (markHtml ? '<div class="marks">' + markHtml + '</div>' : '') +
      '<ul class="brief__why">' + whyTen + why + '</ul>' +
      '<div class="rx">' +
      '<p class="rx__label">오늘의 처방</p>' +
      '<div class="rx__item"><span class="rx__n">01</span><span>' + esc(info.lines[0]) + '</span></div>' +
      '<div class="rx__item"><span class="rx__n">02</span><span>' + esc(info.lines[1]) + '</span></div>' +
      '</div>' + termLine +
      '</article>';
  }

  function lockHTML(info) {
    var marks = info.marks.filter(function (m) { return !m.minor && m.cat !== 'gray'; }).slice(0, 2);
    var markHtml = marks.map(function (m) {
      return '<span class="mark"><span class="mark__dot dot dot--' + m.cat + '"></span>' + esc(m.label) + '</span>';
    }).join('');
    var freeEnd = T.parseISO(T.addDays(state.todayISO, FREE_DAYS - 1));
    return '<article class="lock">' +
      '<p class="lock__eyebrow">FREE TRIAL · 3 DAYS</p>' +
      '<p class="lock__date">' + fmtMD(info.iso) + ' <span>' + DOW_EN[info.dow] + ' · ' + esc(info.gz.textKo) + '일</span></p>' +
      (info.term ? '<p class="lock__term">' + esc(info.term.ko) + ' ' + esc(info.term.time) +
        (info.term.isJie ? ' · ' + esc(info.term.monthText) + '월 시작' : '') + '</p>' : '') +
      '<p class="lock__title">🔒 3일 무료 체험 이후 · 2027 정미년 전체 1년 타이밍 열기</p>' +
      '<p class="lock__sub">(정미년 패스 / 윤이세 1:1 상담)</p>' +
      (markHtml ? '<div class="lock__marks">' + markHtml + '</div>' : '') +
      '<p class="lock__hint">이 날의 작용과 처방은 무료 구간(' + freeEnd.m + '월 ' + freeEnd.d + '일까지) 밖이에요. ' +
      '2027 정미년 12개월 전체 캘린더와 절기 알람은 정미년 패스에서 열립니다.</p>' +
      '<div class="lock__actions">' +
      '<a class="btn btn--cream" href="' + KAKAO + '" target="_blank" rel="noopener">카카오톡으로 1:1 상담</a>' +
      '<a class="btn btn--ghost-light" href="' + LITTLY + '" target="_blank" rel="noopener">정미년 패스 안내 보기</a>' +
      '</div></article>';
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
      : '이번 3일은 담을 만한 변동일·추진일이 없어요. 잔잔한 날은 알림 없이 넘어갑니다.';
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
    state.terms = T.buildTerms(RANGE_FROM, RANGE_TO);
    state.view = clampView(now.getFullYear(), now.getMonth() + 1);
    initForm();

    $('#calGrid').addEventListener('click', function (e) {
      var b = e.target.closest('.day[data-iso]');
      if (!b) return;
      var iso = b.dataset.iso;
      if (iso < state.todayISO) return;
      state.sel = iso;
      renderCalendar();
      renderDetail(iso);
      $('#detail').scrollIntoView({ behavior: 'smooth', block: 'center' });
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

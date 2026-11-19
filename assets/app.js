/*! 윤이세사주 오행·아로마 테스트 — 화면 로직 */
(function () {
  'use strict';

  var D = window.APP_DATA, M = window.Manse;
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var GEN = { 목: '화', 화: '토', 토: '금', 금: '수', 수: '목' };
  var CONTROL = { 목: '토', 토: '수', 수: '화', 화: '금', 금: '목' };
  var PREV = { 화: '목', 토: '화', 금: '토', 수: '금', 목: '수' };
  var state = { gender: '', calendar: 'solar', last: null, hidden: false, restored: false };

  /* ───────── 내 정보 기억 (기기에만 저장) ───────── */
  var STORE_KEY = 'yoonise.oheng.last.v1';

  function saveInput(o) {
    try {
      var copy = {};
      for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) copy[k] = o[k];
      copy.savedAt = new Date().toISOString();
      localStorage.setItem(STORE_KEY, JSON.stringify(copy));
    } catch (e) { /* 저장이 막힌 브라우저도 계산은 그대로 */ }
  }

  function loadInput() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || !o.y || !o.m || !o.d || !o.gender) return null;
      return o;
    } catch (e) { return null; }
  }

  function clearInput() {
    try { localStorage.removeItem(STORE_KEY); } catch (e) {}
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pct(p) { return (Math.round(p * 10) / 10).toFixed(p % 1 === 0 ? 0 : 1); }

  // 받침에 맞는 조사 (목·금 → 을, 화·토·수 → 를)
  function josa(el, pair) { // pair: '을를' | '은는' | '이가' | '과와'
    var hasFinal = { 목: true, 금: true }[el];
    if (pair === '을를') return hasFinal ? '을' : '를';
    if (pair === '은는') return hasFinal ? '은' : '는';
    if (pair === '이가') return hasFinal ? '이' : '가';
    return hasFinal ? '과' : '와';
  }

  /* ───────── 폼 초기화 ───────── */
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
    for (var mi = 0; mi < 60; mi += 5) opts += '<option value="' + mi + '">' + (mi < 10 ? '0' : '') + mi + '분</option>';
    miSel.innerHTML = opts;

    // 12지시 — 한국 사주명리 표준 30분 경계 (자시 23:30~01:30 …)
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

    // 성별 칩 — 필수 선택
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

    // 양력/음력
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

    // 시간 모름
    $('#timeUnknown').addEventListener('change', function () {
      var unk = this.checked;
      $('#timeBox').hidden = unk;
      $('#timeUnknownNote').hidden = !unk;
    });

    // 지역
    $('#region').innerHTML = M.REGIONS.map(function (r) {
      return '<option value="' + r.key + '">' + r.name + ' (경도 ' + r.lon + '°)</option>';
    }).join('');

    $('#birthForm').addEventListener('submit', onSubmit);
    $('#againBtn').addEventListener('click', openForm);
    if ($('#editBtn')) $('#editBtn').addEventListener('click', openForm);
    if ($('#clearBtn')) $('#clearBtn').addEventListener('click', resetAll);
  }

  /* 저장된 값을 폼에 그대로 되살린다 */
  function applyInput(o) {
    if (!o) return;
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

    $('#timeUnknown').checked = !o.timeKnown;
    $('#timeBox').hidden = !o.timeKnown;
    $('#timeUnknownNote').hidden = !!o.timeKnown;
    $('#hour').value = o.timeKnown ? o.hh : '';
    $('#minute').value = o.timeKnown ? o.mm : '';

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

  function resetAll() {
    clearInput();
    location.reload();
  }

  /* 재방문·새로고침 시: 저장된 사주로 오늘 결과를 바로 연다 */
  function restoreSaved() {
    var saved = loadInput();
    if (!saved) return;
    applyInput(saved);
    try {
      var res = M.compute(saved);
      state.restored = true;
      render(res, { noScroll: true });
      $('#formCard').hidden = true;
      window.scrollTo(0, 0);
    } catch (e) {
      // 저장값이 깨졌거나 존재하지 않는 날짜면 조용히 지우고 폼을 보여 준다
      clearInput();
      $('#formCard').hidden = false;
    }
  }

  function fillDays() {
    var y = +$('#year').value, m = +$('#month').value;
    var dSel = $('#day'), cur = +dSel.value || 0;
    var max = 31;
    if (state.calendar === 'lunar') {
      max = 30;
    } else if (m) {
      max = new Date(y || 2000, m, 0).getDate();
    }
    var out = '<option value="">일</option>';
    for (var d = 1; d <= max; d++) out += '<option value="' + d + '">' + d + '일</option>';
    dSel.innerHTML = out;
    if (cur && cur <= max) dSel.value = cur;
  }

  function jisiOf(h, mi) {
    if (h === null || h === '' || isNaN(h)) return null;
    var j = M.jisiOf(+h, mi === '' || mi === null || isNaN(mi) ? 0 : +mi);
    return { ko: j.ko, hanja: j.hanja, start: j.start, end: j.end, idx: j.idx };
  }

  function syncJisi() {
    var h = $('#hour').value, mi = $('#minute').value;
    var hv = h === '' ? null : +h;
    var idxNow = hv === null ? -1 : M.jisiIndex(hv, mi === '' ? 0 : +mi);
    $$('#jisi .jisi__btn').forEach(function (b) {
      b.classList.toggle('is-on', hv !== null && +b.dataset.idx === idxNow);
    });
    if (hv === null) { $('#timeHint').textContent = '시간을 고르면 시주를 계산해요'; return; }
    var j = jisiOf(hv, mi);
    if (!j) return;
    $('#timeHint').textContent = j.ko + '시(' + j.hanja + '時) ' + j.start + '~' + j.end + ' · ' +
      String(hv).padStart(2, '0') + ':' + (mi === '' ? '00' : String(mi).padStart(2, '0'));
  }

  function setGenderError(on) {
    var box = $('#genderField'), msg = $('#genderError');
    if (box) box.classList.toggle('is-error', !!on);
    if (msg) msg.hidden = !on;
    var chips = $('#genderChips');
    if (chips) chips.setAttribute('aria-invalid', on ? 'true' : 'false');
  }

  /* ───────── 제출 ───────── */
  function onSubmit(e) {
    e.preventDefault();
    var alertEl = $('#formAlert');
    alertEl.hidden = true;

    var y = $('#year').value, m = $('#month').value, d = $('#day').value;
    if (!y || !m || !d) { return fail('생년월일을 모두 선택해 주세요.'); }
    if (!state.gender) { setGenderError(true); return fail('성별을 선택해 주세요. (여성 / 남성 중 하나)', $('#genderField')); }
    var timeUnknown = $('#timeUnknown').checked;
    var hh = $('#hour').value, mm = $('#minute').value;
    if (!timeUnknown && hh === '') { return fail('태어난 시간을 고르거나, 위의 ‘몰라요’를 켜 주세요.'); }

    var region = M.REGIONS.filter(function (r) { return r.key === $('#region').value; })[0] || M.REGIONS[0];
    var opts = {
      name: $('#name').value,
      gender: state.gender,
      calendar: state.calendar,
      y: y, m: m, d: d,
      leap: $('#leap').checked,
      timeKnown: !timeUnknown,
      hh: hh === '' ? 0 : +hh,
      mm: mm === '' ? 0 : +mm,
      region: region.key,
      longitude: region.lon,
      trueSolar: $('#trueSolar').checked,
      dst: $('#dst').checked,
      ziRule: $('#ziRule').value
    };

    var btn = $('#submitBtn');
    btn.classList.add('is-loading');
    $('.submit__label', btn).textContent = '사주를 세우는 중…';

    setTimeout(function () {
      var res;
      try {
        res = M.compute(opts);
      } catch (err) {
        btn.classList.remove('is-loading');
        $('.submit__label', btn).textContent = '오늘 내 기운 보기';
        return fail(err && err.message ? err.message : '계산 중 문제가 생겼어요. 입력을 다시 확인해 주세요.');
      }
      btn.classList.remove('is-loading');
      $('.submit__label', btn).textContent = '오늘 내 기운 보기';
      saveInput(opts);
      state.restored = false;
      render(res);
    }, 620);

    function fail(msg, target) {
      alertEl.textContent = msg;
      alertEl.hidden = false;
      (target || alertEl).scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  /* ───────── 렌더 ───────── */
  function render(res, opts) {
    state.last = res;
    var name = res.input.name;
    var who = name ? name + '님' : '나';

    $('#result').hidden = false;
    renderSavedBar(res);

    // 요약
    $('#summaryEyebrow').textContent = who + '의 사주';
    $('#summaryTitle').textContent = who === '나' ? '나의 사주 원국' : who + '의 사주 원국';
    var dateBits = [
      '양력 ' + res.solar.y + '.' + p2(res.solar.m) + '.' + p2(res.solar.d),
      '음력 ' + res.lunar.text
    ];
    if (res.input.timeKnown) dateBits.push(p2(res.input.hh) + ':' + p2(res.input.mm));
    else dateBits.push('시간 모름');
    $('#summaryDates').innerHTML = dateBits.join(' · ') +
      (res.input.calendar === 'lunar' ? ' <span class="fine">(음력으로 입력)</span>' : '');

    renderWonguk(res);
    renderBalance(res);
    renderArchetype(res);
    renderToday(res);
    renderRitual(res);

    var jieNote = '';
    var alt = res.jieqi.altYM;
    if (!res.input.timeKnown && alt) {
      jieNote = '태어난 날이 <b>' + esc(alt.name) + '</b> 절입일(' + esc(alt.at) + ')이에요. ' +
        '시간을 모르면 정오 12:00 기준으로 계산했어요 — 절입 전 ' + esc(alt.before) + ' / 절입 후 ' + esc(alt.after) + '. ' +
        '출생 시간을 알면 더 정확해져요. ';
    }
    $('#jieqiNote').innerHTML = jieNote + (alt && !res.input.timeKnown
      ? '연주는 위 입춘 시각, 월주는 같은 절입 시각을 기준으로 삼았어요.'
      : '연주는 <b>입춘 ' + esc(res.jieqi.lichun) + '</b> 기준, 월주는 <b>' +
        esc(res.jieqi.prev.name) + ' ' + esc(res.jieqi.prev.at) + '</b> 절입 이후로 계산했어요.') +
      (res.input.trueSolar ? ' 진태양시 −' + Math.abs(res.apply.lonMin) + '분 적용.' : '') +
      (res.input.dst ? ' 서머타임 −60분 적용.' : '');

    revealCards();
    if (!(opts && opts.noScroll)) {
      setTimeout(function () {
        $('#result').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    }
  }

  function p2(n) { return (n < 10 ? '0' : '') + n; }

  function renderWonguk(res) {
    var P = res.pillars;
    // 연·월·일·시(시간 순서) — 천간 읽기 문장에 사용
    var chrono = [
      { key: 'year', label: '년', han: '年', p: P.year },
      { key: 'month', label: '월', han: '月', p: P.month },
      { key: 'day', label: '일', han: '日', p: P.day },
      { key: 'time', label: '시', han: '時', p: P.time }
    ];
    // 표는 한국 정통 만세력처럼 오른쪽이 년주가 되도록 시주 → 년주 순으로 놓는다
    var cols = chrono.slice().reverse();
    var html = '<div class="wg__label"></div>';
    cols.forEach(function (c) {
      html += '<div class="wg__head"><b>' + c.label + '주</b><small>' + c.han + '柱</small>' +
        (c.key === 'day' ? '<span class="wg__me">나</span>' : '') + '</div>';
    });

    // 천간
    html += '<div class="wg__label">천간</div>';
    cols.forEach(function (c) {
      if (!c.p) {
        html += '<div class="wg__cell wg__cell--empty"><span class="wg__hanja">—</span><span class="wg__ko">모름</span></div>';
        return;
      }
      var isMe = c.key === 'day';
      html += '<div class="wg__cell' + (isMe ? ' wg__cell--me' : '') + '">' +
        '<span class="wg__hanja" style="color:' + D.ELEMENTS[M.GAN_EL[c.p.ganIndex]].color + '">' + c.p.gan + '</span>' +
        '<span class="wg__ko">' + c.p.ganKo + '</span>' +
        '<span class="wg__el" style="background:' + D.ELEMENTS[M.GAN_EL[c.p.ganIndex]].color + '">' + M.GAN_EL[c.p.ganIndex] + '</span>' +
        '</div>';
    });

    // 지지
    html += '<div class="wg__label">지지</div>';
    cols.forEach(function (c) {
      if (!c.p) {
        html += '<div class="wg__cell wg__cell--empty"><span class="wg__hanja">—</span><span class="wg__ko">모름</span></div>';
        return;
      }
      var el = M.ZHI_EL[c.p.zhiIndex];
      html += '<div class="wg__cell">' +
        '<span class="wg__hanja" style="color:' + D.ELEMENTS[el].color + '">' + c.p.zhi + '</span>' +
        '<span class="wg__ko">' + c.p.zhiKo + ' · ' + M.ZHI_ANIMAL[c.p.zhiIndex] + '</span>' +
        '<span class="wg__el" style="background:' + D.ELEMENTS[el].color + '">' + el + '</span>' +
        '</div>';
    });

    // 지장간
    html += '<div class="wg__label wg__hidrow">지장간</div>';
    cols.forEach(function (c) {
      var hid = c.key === 'time' ? res.hidden.time : res.hidden[c.key];
      if (!hid) { html += '<div class="wg__cell wg__cell--last wg__hidrow"><span class="wg__ko">—</span></div>'; return; }
      html += '<div class="wg__cell wg__cell--last wg__hidrow"><span class="wg__hidden">' + hid.map(function (g) {
        var gi = M.GAN.indexOf(g);
        return '<b style="color:' + D.ELEMENTS[M.GAN_EL[gi]].color + '">' + g + '</b>';
      }).join(' ') + '</span></div>';
    });

    var readSeen = {};
    var read = '천간 읽기 — ' + chrono.filter(function (c) { return c.p; }).filter(function (c) {
      if (readSeen[c.p.ganIndex]) return false;
      readSeen[c.p.ganIndex] = true; return true;
    }).map(function (c) {
      return c.p.gan + ' ' + M.GAN_HUN[c.p.ganIndex];
    }).join(' · ');

    var el = $('#wonguk');
    el.innerHTML = html;
    el.classList.toggle('is-compact', !state.hidden);
    var readEl = document.getElementById('wongukRead');
    if (!readEl) {
      readEl = document.createElement('p');
      readEl.className = 'wonguk__read';
      readEl.id = 'wongukRead';
      el.parentNode.insertBefore(readEl, el.nextSibling);
    }
    readEl.innerHTML = read;
  }

  function renderBalance(res) {
    var order = D.ORDER;
    var counts = res.counts, percents = res.percents;
    var maxEl = order[0], minEl = order[0];
    order.forEach(function (e) {
      if (counts[e] > counts[maxEl]) maxEl = e;
      if (counts[e] < counts[minEl]) minEl = e;
    });
    // 동점 처리: 가장 적은 기운이 여럿이면 일간을 생(生)하는 기운을 우선
    var minSet = order.filter(function (e) { return counts[e] === counts[minEl]; });
    var dmEl = res.dayMaster.element;
    var pick = minSet.filter(function (e) { return e === PREV[dmEl]; })[0] || minSet[0];

    // 동점 최대
    var maxSet = order.filter(function (e) { return counts[e] === counts[maxEl]; });

    // 도넛
    var C = 2 * Math.PI * 54, off = 0, segs = '';
    order.forEach(function (e) {
      var v = counts[e] / (res.total || 1);
      if (v <= 0) return;
      var len = C * v;
      segs += '<circle cx="66" cy="66" r="54" fill="none" stroke="' + D.ELEMENTS[e].color +
        '" stroke-width="16" stroke-dasharray="' + (len - 2.2).toFixed(2) + ' ' + (C - len + 2.2).toFixed(2) +
        '" stroke-dashoffset="' + (-off).toFixed(2) + '" stroke-linecap="butt"></circle>';
      off += len;
    });
    $('#donut').innerHTML =
      '<svg viewBox="0 0 132 132" width="132" height="132" aria-hidden="true">' +
      '<circle cx="66" cy="66" r="54" fill="none" stroke="#F0E9DC" stroke-width="16"></circle>' + segs + '</svg>' +
      '<div class="donut__center"><small>가장 강한 기운</small>' +
      '<b style="color:' + D.ELEMENTS[maxEl].color + '">' + maxEl + ' ' + D.ELEMENTS[maxEl].hanja + '</b>' +
      '<span>' + pct(percents[maxEl]) + '%</span></div>';

    // 범례
    $('#legend').innerHTML = order.map(function (e) {
      return '<div class="legend__row">' +
        '<span class="legend__name"><i class="legend__dot" style="background:' + D.ELEMENTS[e].color + '"></i>' + e + ' ' + D.ELEMENTS[e].hanja + '</span>' +
        '<span class="legend__bar"><i class="legend__fill" data-w="' + percents[e] + '" style="background:' + D.ELEMENTS[e].color + '"></i></span>' +
        '<span class="legend__val">' + pct(percents[e]) + '%</span>' +
        '</div>';
    }).join('');
    setTimeout(function () {
      $$('#legend .legend__fill').forEach(function (f) { f.style.width = Math.max(2, f.dataset.w) + '%'; });
    }, 120);

    // 태그
    var tags = '<span class="tag tag--fill">가장 강한 기운 <b>' + maxSet.map(function (e) {
      return D.ELEMENTS[e].emoji + ' ' + e;
    }).join('·') + '</b></span>';
    var thinSet = order.filter(function (e) { return counts[e] === counts[minEl]; });
    tags += '<span class="tag tag--thin">조율이 필요한 기운 <b>' + thinSet.map(function (e) {
      return D.ELEMENTS[e].emoji + ' ' + e;
    }).join('·') + '</b></span>';
    $('#balanceTags').innerHTML = tags;

    // 해설
    var totalTxt = res.input.timeKnown ? '여덟 글자' : '여섯 글자';
    var spread = percents[maxEl] - Math.min.apply(null, order.map(function (e) { return percents[e]; }));
    var html;
    if (spread <= 20) {
      html = totalTxt + '에 다섯 기운이 비교적 <b>고르게</b> 담겨 있어요. 한쪽으로 크게 치우치지 않아 ' +
        '상황에 따라 유연하게 기운을 바꿔 쓸 수 있는 사주예요.';
      if (counts[pick] === 0) html += ' 다만 <b>' + pick + '의 기운</b>은 한 글자도 없어서, 향이나 색으로 살짝 채워 주면 좋아요.';
    } else {
      html = totalTxt + ' 가운데 <b>' + maxEl + '의 기운</b>이 ' + pct(percents[maxEl]) + '%로 가장 두터워요. ';
      if (thinSet.length === 1) {
        html += '<b>' + pick + '의 기운</b>은 ' + pct(percents[pick]) + '%로 가장 적고요. ';
      } else {
        html += '<b>' + thinSet.join('·') + '의 기운</b>이 ' + pct(percents[pick]) + '%로 가장 적고요. ';
      }
      html += '넘치는 기운은 흘려보내고 적은 기운은 살짝 채워 주면, 요즘의 컨디션이 한결 편안해져요.';
    }
    $('#balanceReading').innerHTML = html;

    // 기운별 짧은 해설
    var notes = '';
    notes += '<p class="element-note"><b>' + maxEl + ' · ' + D.ELEMENTS[maxEl].title + '</b> — ' +
      esc(D.ELEMENTS[maxEl].full) + '</p>';
    if (pick !== maxEl) {
      notes += '<p class="element-note"><b>' + pick + ' · ' + D.ELEMENTS[pick].title + '</b> — ' +
        esc(D.ELEMENTS[pick].thin) + '</p>';
    }
    $('#elementNotes').innerHTML = notes;

    res._maxEl = maxEl; res._minEl = pick; res._maxPct = percents[maxEl]; res._minSet = thinSet;
  }

  function renderArchetype(res) {
    var dm = res.dayMaster;
    var stem = D.STEMS[dm.ganIndex];
    var yin = dm.ganIndex % 2 === 1;
    $('#archetypeBody').innerHTML =
      '<span class="arch__emoji" aria-hidden="true">' + stem.emoji + '</span>' +
      '<p class="arch__tagline">일간 ' + dm.gan + ' · ' + dm.element + ' · ' + (yin ? '음' : '양') + '</p>' +
      '<h3 class="arch__title">' + esc(stem.image) + '</h3>' +
      '<p class="arch__desc">' + esc(stem.tagline) + '. ' + esc(stem.desc) + '</p>' +
      '<div class="arch__keywords">' + stem.keywords.map(function (k) { return '<span>#' + k + '</span>'; }).join('') + '</div>' +
      '<div class="arch__grid">' +
      '<div class="arch__box"><h4>타고난 강점</h4><ul>' + stem.strengths.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul></div>' +
      '<div class="arch__box"><h4>조율 팁</h4><ul>' + stem.tips.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul></div>' +
      '</div>';
  }

  function renderSavedBar(res) {
    var bar = $('#savedBar');
    if (!bar) return;
    var o = res.input;
    $('#savedBarName').textContent = (o.name ? o.name + '님' : '내 사주') + ' 기준으로 열었어요';
    $('#savedBarMeta').textContent = [
      (o.calendar === 'lunar' ? '음력 ' : '') + o.y + '.' + p2(+o.m) + '.' + p2(+o.d),
      o.timeKnown ? p2(o.hh) + ':' + p2(o.mm) : '시간 모름',
      o.gender === 'M' ? '남성' : '여성'
    ].join(' · ');
    bar.hidden = false;
  }

  function renderRitual(res) {
    var minEl = res._minEl;
    var oil = (D.AROMAS[minEl] || [])[0];
    var color = D.COLORS[minEl] || { name: minEl };
    var habit = (D.ROUTINES[minEl] || [])[0];

    $('#ritualLead').innerHTML = '오늘은 <b>' + minEl + '의 기운</b>이 ' + pct(res.percents[minEl]) +
      '%로 가장 적어요. 억지로 채우기보다, 향·색·습관 하나로 살짝 도와주면 충분해요.';

    var items = [];
    if (oil) items.push({
      k: '향', el: minEl,
      v: '<b>' + esc(oil.name) + '</b> 향 한 번 — ' + esc(oil.usage)
    });
    items.push({
      k: '색', el: minEl,
      v: '<b>' + esc(color.name) + '</b> 계열 소품 하나 — 컵·스카프·메모지처럼 눈에 닿는 곳에'
    });
    if (habit) items.push({
      k: '습관', el: minEl,
      v: esc(habit)
    });

    $('#ritualList').innerHTML = items.map(function (it) {
      return '<li class="ritual__item">' +
        '<span class="ritual__k" style="background:' + D.ELEMENTS[it.el].soft + ';color:' + D.ELEMENTS[it.el].color + '">' + it.k + '</span>' +
        '<span class="ritual__v">' + it.v + '</span></li>';
    }).join('');
  }

  function renderToday(res) {
    var t = M.todayInfo();
    var nd = new Date();
    nd.setDate(nd.getDate() + 1);
    var tm = M.todayInfo(nd);
    var weekdays = ['일', '월', '화', '수', '목', '금', '토'];
    var wd = weekdays[new Date().getDay()];

    var myEl = res.dayMaster.element, myGan = res.dayMaster.gan;
    var rel;
    if (t.ganEl === myEl) rel = D.RELATIONS.same;
    else if (GEN[t.ganEl] === myEl) rel = D.RELATIONS.give;
    else if (GEN[myEl] === t.ganEl) rel = D.RELATIONS.express;
    else if (CONTROL[t.ganEl] === myEl) rel = D.RELATIONS.slow;
    else rel = D.RELATIONS.control;

    var advice = (rel.advice || []).map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('');

    $('#todayBody').innerHTML =
      '<div class="today__head">' +
        '<div>' +
          '<p class="today__day">' + esc(t.date) + ' (' + wd + ') · 음력 ' + esc(t.lunarText) + '</p>' +
          '<p class="today__gzlbl">오늘의 일진</p>' +
        '</div>' +
        '<div class="today__gz">' +
          '<span class="today__hanja" style="color:' + D.ELEMENTS[t.ganEl].color + '">' + esc(t.ganZhi.text) + '</span>' +
          '<span class="today__gzsub">' + esc(t.ganZhi.textKo) + ' · ' + D.ELEMENTS[t.ganEl].emoji + ' ' + D.ELEMENTS[t.ganEl].title + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="today__verse">' +
        '<span class="today__me">나의 일간 <b>' + myGan + ' · ' + myEl + '</b></span>' +
        '<span class="today__x" aria-hidden="true">×</span>' +
        '<span class="today__me">오늘 <b>' + t.ganZhi.gan + ' · ' + t.ganEl + '</b>의 기운</span>' +
      '</div>' +
      '<p class="today__rel">' + esc(rel.label) + '</p>' +
      '<p class="today__text">' + esc(rel.text) + '</p>' +
      (advice ? '<ul class="today__advice">' + advice + '</ul>' : '') +
      '<p class="today__next">내일은 <b>' + esc(tm.ganZhi.text) + '(' + esc(tm.ganZhi.textKo) + ')</b> 일진으로 다시 봐 드려요.</p>';
  }

  /* ───────── 등장 애니메이션 ───────── */
  function revealCards() {
    var cards = $$('#result .card, #result .mid-cta, #result .cta, #result .result__foot');
    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      cards.forEach(function (c) { c.classList.add('reveal', 'is-in'); });
      return;
    }
    cards.forEach(function (c, i) {
      c.classList.add('reveal');
      c.style.transitionDelay = Math.min(i * 60, 240) + 'ms';
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    cards.forEach(function (c) { io.observe(c); });
    // 첫 화면 카드는 즉시
    setTimeout(function () { cards.slice(0, 2).forEach(function (c) { c.classList.add('is-in'); }); }, 80);
    // 안전장치: 어떤 이유로든 관찰이 동작하지 않으면 2.5초 뒤 모두 표시
    setTimeout(function () { cards.forEach(function (c) { c.classList.add('is-in'); }); }, 2500);
  }

  /* ───────── 복사 ───────── */
  function buildShareText(res) {
    var P = res.pillars, name = res.input.name;
    var L = [];
    L.push('🌿 ' + (name ? name + '님의' : '나의') + ' 사주 오행 테스트 결과');
    L.push('');
    L.push('■ 사주 원국 (' +
      (res.input.timeKnown ? '양력 ' + res.solar.y + '.' + p2(res.solar.m) + '.' + p2(res.solar.d) + ' ' + p2(res.input.hh) + ':' + p2(res.input.mm)
                           : '양력 ' + res.solar.y + '.' + p2(res.solar.m) + '.' + p2(res.solar.d) + ' 시간 모름') +
      ' · 음력 ' + res.lunar.text + ')');
    L.push('년 ' + P.year.text + '(' + P.year.textKo + ') · 월 ' + P.month.text + '(' + P.month.textKo + ')');
    L.push('일 ' + P.day.text + '(' + P.day.textKo + ')' + (P.time ? ' · 시 ' + P.time.text + '(' + P.time.textKo + ')' : ' · 시 모름'));
    L.push('');
    L.push('■ 오행 밸런스');
    L.push(D.ORDER.map(function (e) { return e + ' ' + pct(res.percents[e]) + '%'; }).join(' · '));
    L.push('가장 강한 기운: ' + res._maxEl + ' / 조율이 필요한 기운: ' + (res._minSet || [res._minEl]).join('·'));
    L.push('');
    var stem = D.STEMS[res.dayMaster.ganIndex];
    L.push('■ 나의 기질: ' + stem.image + ' (' + res.dayMaster.gan + res.dayMaster.ganKo + ')');
    L.push(stem.tagline);
    L.push('');
    L.push('■ 오늘의 내 기운');
    var t = M.todayInfo();
    L.push(t.date + ' 일진 ' + t.ganZhi.text + '(' + t.ganZhi.textKo + ')');
    var relLine = $('#todayBody .today__rel'), relText = $('#todayBody .today__text');
    if (relLine) L.push(relLine.textContent.trim());
    if (relText) L.push(relText.textContent.trim());
    L.push('');
    L.push('■ 오늘의 가벼운 개운 팁');
    $$('#ritualList .ritual__item').forEach(function (li) {
      var k = li.querySelector('.ritual__k'), v = li.querySelector('.ritual__v');
      if (k && v) L.push('- ' + k.textContent.trim() + ' · ' + v.textContent.replace(/\s+/g, ' ').trim());
    });
    L.push('');
    L.push('■ 윤이세 1:1 상담 — 원포인트 49,000원 / 종합 컨설팅 100,000원');
    L.push('▶ 카톡 상담: ' + D.LINKS.kakao);
    L.push('▶ 윤이세사주 전체 메뉴: ' + D.LINKS.littly);
    return L.join('\n');
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); resolve(); } catch (e) { reject(e); }
      document.body.removeChild(ta);
    });
  }

  /* ───────── 이벤트 ───────── */
  function initEvents() {
    $('#copyBtn').addEventListener('click', function () {
      if (!state.last) return;
      var sub = $('#copySub');
      copyText(buildShareText(state.last)).then(function () {
        sub.textContent = '복사했어요! 카톡에 붙여넣기 하세요';
        sub.classList.add('is-done');
        setTimeout(function () { sub.textContent = '카톡·문자로 붙여넣기'; sub.classList.remove('is-done'); }, 2600);
      }).catch(function () { sub.textContent = '복사가 안 되면 결과를 길게 눌러 선택해 주세요'; });
    });

    $('#hiddenToggle').addEventListener('click', function () {
      state.hidden = !state.hidden;
      this.setAttribute('aria-expanded', state.hidden ? 'true' : 'false');
      this.textContent = state.hidden ? '지장간(숨은 기운) 접기' : '지장간(숨은 기운) 보기';
      $('#wonguk').classList.toggle('is-compact', !state.hidden);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initForm(); initEvents(); syncJisi();
    restoreSaved();
  });
})();

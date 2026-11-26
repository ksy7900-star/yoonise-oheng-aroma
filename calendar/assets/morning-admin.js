/* ==========================================================
   ☀️ 아침의 질문 — 관리자 확인·수정·추가 (2026-11-26)
   · /calendar/yoon-key/ 의 다섯 번째 탭. 손님 화면과 같은 질문 DB
     (assets/morning-questions.js)를 읽어 **날짜별로 365일 예정**을 보여 준다.
   · 고친 문구는 날짜 하나에만 적용된다 — 그 날 손님 화면(한국 시간 자정 기준)에 바로 쓰인다.
     다른 날의 질문은 그대로라 주기가 밀리지 않는다.
   · 서버 저장은 Supabase 함수 하나(admin_morning_questions) — 기존 관리자 PIN 확인을 그대로 거친다.
     SQL: repo/docs/morning-questions-db.sql
   · 질문 문구와 날짜만 다룬다. 손님 답변은 서버에 없다(각자 기기에만).
   ========================================================== */
(function () {
  'use strict';

  var SB_URL = 'https://fifynkkaeqcjlovesuop.supabase.co';
  var SB_KEY = 'sb_publishable_JzSUlMOH9s38aer6y1BVEg_rHcQLGxF';
  var DAY = 86400000;
  var DB = (window.MORNING_QUESTIONS && window.MORNING_QUESTIONS.items) || [];
  var CATS = (window.MORNING_QUESTIONS && window.MORNING_QUESTIONS.cats) || {};
  var BASE_ISO = (window.MORNING_QUESTIONS && window.MORNING_QUESTIONS.base) || '2026-11-26';

  var st = { over: {}, ready: false, busy: false, editing: '', note: '' };

  function $(s) { return document.querySelector(s); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function kstToday() {
    var d = new Date(Date.now() + 9 * 3600 * 1000);
    return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
  }
  function ordinalOf(iso) {
    var p = String(iso || '').split('-');
    if (p.length !== 3) return 0;
    return Math.floor(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])) / DAY);
  }
  function isoFromOrd(n) {
    var d = new Date(n * DAY);
    return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
  }
  function addDays(iso, n) { return isoFromOrd(ordinalOf(iso) + n); }
  function dowOf(iso) {
    var p = iso.split('-');
    return ['일', '월', '화', '수', '목', '금', '토'][new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]))).getUTCDay()];
  }
  function mdOf(iso) { var p = iso.split('-'); return p[1] + '.' + p[2]; }
  function slotOf(iso) {
    var L = DB.length || 365;
    var n = ordinalOf(iso) - ordinalOf(BASE_ISO);
    return ((n % L) + L) % L;
  }
  function baseOf(iso) {
    var it = DB[slotOf(iso)] || {};
    return { t: it.t || '', c: it.c || '' };
  }
  function textOf(iso) { return st.over[iso] || baseOf(iso).t; }
  function catOf(iso) { return st.over[iso] ? 'admin' : baseOf(iso).c; }

  function pin() {
    try { return window.YoonKeyPin ? (window.YoonKeyPin.get() || '') : ''; } catch (e) { return ''; }
  }
  function rpc(name, body) {
    var opt = {
      method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY },
      body: JSON.stringify(body || {})
    };
    return fetch(SB_URL + '/rest/v1/rpc/' + name, opt).then(function (res) {
      return res.text().then(function (t) {
        var d = null;
        try { d = t ? JSON.parse(t) : null; } catch (e) { d = null; }
        if (!res.ok) throw new Error((d && (d.message || d.hint)) || ('HTTP ' + res.status));
        return d || {};
      });
    });
  }
  function stateMsg(t, bad) {
    var el = $('#mqrState');
    if (!el) return;
    el.textContent = t || '';
    el.hidden = !t;
    el.style.color = bad ? '#BE123C' : '';
  }

  /* ── 목록 ─────────────────────────────────────────── */
  function days() {
    var out = [], t0 = kstToday();
    for (var i = 0; i < 365; i++) out.push(addDays(t0, i));
    return out;
  }
  function rowHTML(iso) {
    var edited = !!st.over[iso];
    var cat = catOf(iso);
    var catLabel = edited ? '관리자 수정' : (CATS[cat] || '');
    return '<li class="mqr' + (edited ? ' is-edited' : '') + '" data-day="' + iso + '">' +
      '<button type="button" class="mqr__head" data-mqr-open aria-expanded="false">' +
        '<span class="mqr__top">' +
          '<span class="mqr__date">' + mdOf(iso) + ' <em>(' + dowOf(iso) + ')</em></span>' +
          '<span class="mqr__cat">' + esc(catLabel) + '</span>' +
          (edited ? '<span class="mqr__badge">고친 문구</span>' : '') +
          '<span class="mqr__pen" aria-hidden="true">✎</span>' +
        '</span>' +
        '<span class="mqr__text">' + esc(textOf(iso)) + '</span>' +
      '</button>' +
      '<div class="mqr__edit" hidden>' +
        '<textarea class="mqr__in" rows="3" maxlength="200" aria-label="' + esc(iso) + ' 질문 문구">' + esc(textOf(iso)) + '</textarea>' +
        '<div class="mqr__acts">' +
          '<button type="button" class="mqr__save" data-mqr-save>저장</button>' +
          '<button type="button" class="mqr__cancel" data-mqr-cancel>닫기</button>' +
          (edited ? '<button type="button" class="mqr__reset" data-mqr-reset>기본 문구로</button>' : '') +
          '<span class="mqr__hint">' + esc(mdOf(iso)) + ' 하루에만 적용돼요</span>' +
        '</div>' +
        '<p class="mqr__msg" data-mqr-msg></p>' +
      '</div>' +
    '</li>';
  }
  function render() {
    var list = $('#mqrList');
    if (!list) return;
    var q = ($('#mqrSearch') && $('#mqrSearch').value || '').trim();
    var all = days();
    var rows = q ? all.filter(function (d) { return textOf(d).indexOf(q) >= 0 || d.indexOf(q) >= 0; }) : all;
    list.innerHTML = rows.map(rowHTML).join('');
    var edited = Object.keys(st.over).length;
    if ($('#mqrTotal')) $('#mqrTotal').textContent = '365';
    if ($('#mqrEdited')) $('#mqrEdited').textContent = edited ? edited : '0';
    if ($('#mqrShown')) $('#mqrShown').textContent = rows.length + '일';
    stateMsg(st.note || '');
    var remoteOn = !!(window.MORNING_QUESTIONS && window.MORNING_QUESTIONS.remote === true);
    var b = $('#mqrRemote');
    if (b) {
      b.hidden = remoteOn;
      b.textContent = '지금은 손님 화면이 서버에 저장된 수정 문구를 읽지 않습니다(기본 365개 사용). '
        + 'docs/morning-questions-db.sql 을 넣은 뒤 assets/morning-questions.js 의 remote 를 true 로 켜면 반영됩니다.';
    }
  }

  function load() {
    if (!DB.length) { stateMsg('질문 DB(morning-questions.js)를 읽지 못했어요.', true); return; }
    var p = pin();
    st.note = '';
    render();
    if (!p) { stateMsg('비밀번호가 아직 없어요 — 🔒 잠그기를 누른 뒤 6자리를 다시 넣어 주세요.', true); return; }
    stateMsg('서버에서 수정 문구를 불러오는 중…');
    rpc('admin_morning_questions', { p_pin: p, p_action: 'list' }).then(function (d) {
      if (!d || !d.ok) {
        var e = (d && d.error) || '';
        stateMsg(e === 'pin_locked'
          ? '비밀번호 시도가 너무 많아 잠시 잠겼어요. 10분 뒤에 다시 시도해 주세요.'
          : '서버 확인에 실패했어요 (' + e + ')', true);
        return;
      }
      var over = {};
      (d.items || []).forEach(function (it) {
        var day = String(it && it.day || '').slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(day) && it.text) over[day] = String(it.text);
      });
      st.over = over;
      st.ready = true;
      render();
    }, function (err) {
      var m = (err && err.message) || '';
      stateMsg(/404|PGRST202|not find|does not exist/i.test(m)
        ? '서버 기능이 아직 없어요 — docs/morning-questions-db.sql 을 Supabase에 한 번 넣어 주세요. (지금은 기본 365개만 보입니다)'
        : '불러오지 못했어요 · ' + (m || '연결을 확인해 주세요'), true);
    });
  }

  function saveOne(iso, text, btn) {
    var p = pin();
    if (!p) { msgOf(iso, '비밀번호가 없어요 — 다시 열고 6자리를 넣어 주세요.', true); return; }
    if (btn) { btn.disabled = true; btn.textContent = '저장 중…'; }
    rpc('admin_morning_questions', { p_pin: p, p_action: 'set', p_day: iso, p_text: text })
      .then(function (d) {
        if (btn) { btn.disabled = false; btn.textContent = '저장'; }
        if (!d || !d.ok) { msgOf(iso, '저장하지 못했어요 (' + ((d && d.error) || '') + ')', true); return; }
        st.over[iso] = String(d.text || text);
        render();
        msgOf(iso, '저장했어요 — ' + mdOf(iso) + ' 손님 화면에 바로 적용됩니다.', false);
      }, function (err) {
        if (btn) { btn.disabled = false; btn.textContent = '저장'; }
        var m = (err && err.message) || '';
        msgOf(iso, /404|not find|does not exist/i.test(m)
          ? '서버 함수가 없어 저장하지 못했어요 — docs/morning-questions-db.sql 을 먼저 넣어 주세요.'
          : '저장하지 못했어요 · ' + (m || '연결을 확인해 주세요'), true);
      });
  }
  function clearOne(iso, btn) {
    var p = pin();
    if (!p) { msgOf(iso, '비밀번호가 없어요 — 다시 열고 6자리를 넣어 주세요.', true); return; }
    if (!window.confirm(mdOf(iso) + ' 질문을 기본 문구로 되돌릴까요?')) return;
    if (btn) { btn.disabled = true; btn.textContent = '되돌리는 중…'; }
    rpc('admin_morning_questions', { p_pin: p, p_action: 'clear', p_day: iso }).then(function (d) {
      if (btn) { btn.disabled = false; btn.textContent = '기본 문구로'; }
      if (!d || !d.ok) { msgOf(iso, '되돌리지 못했어요 (' + ((d && d.error) || '') + ')', true); return; }
      delete st.over[iso];
      render();
      msgOf(iso, '기본 문구로 돌아갔어요.', false);
    }, function (err) {
      if (btn) { btn.disabled = false; btn.textContent = '기본 문구로'; }
      msgOf(iso, '되돌리지 못했어요 · ' + ((err && err.message) || '연결을 확인해 주세요'), true);
    });
  }
  function msgOf(iso, t, bad) {
    var li = document.querySelector('.mqr[data-day="' + iso + '"]');
    if (!li) { stateMsg(t, bad); return; }
    var m = li.querySelector('[data-mqr-msg]');
    if (!m) return;
    m.textContent = t;
    m.hidden = !t;
    m.style.color = bad ? '#BE123C' : '#047857';
  }
  function openRow(iso) {
    document.querySelectorAll('.mqr').forEach(function (li) {
      if (li.getAttribute('data-day') !== iso) {
        var e = li.querySelector('.mqr__edit'); if (e) e.hidden = true;
        var h = li.querySelector('.mqr__head'); if (h) h.setAttribute('aria-expanded', 'false');
      }
    });
    var li = document.querySelector('.mqr[data-day="' + iso + '"]');
    if (!li) return;
    var box = li.querySelector('.mqr__edit'), head = li.querySelector('.mqr__head');
    var inp = li.querySelector('.mqr__in');
    if (!box) return;
    box.hidden = false;
    if (head) head.setAttribute('aria-expanded', 'true');
    if (inp) { try { inp.focus({ preventScroll: true }); } catch (e) { try { inp.focus(); } catch (e2) {} } }
  }

  /* ── 붙이기 ───────────────────────────────────────── */
  function bind() {
    var list = $('#mqrList');
    if (list) {
      list.addEventListener('click', function (e) {
        var t = e.target; if (!t || !t.closest) return;
        var li = t.closest('.mqr'); if (!li) return;
        var iso = li.getAttribute('data-day');
        if (t.closest('[data-mqr-open]')) { e.preventDefault(); openRow(iso); return; }
        if (t.closest('[data-mqr-cancel]')) {
          e.preventDefault();
          var box = li.querySelector('.mqr__edit'); if (box) box.hidden = true;
          var inp = li.querySelector('.mqr__in'); if (inp) inp.value = textOf(iso);
          var h = li.querySelector('.mqr__head'); if (h) h.setAttribute('aria-expanded', 'false');
          return;
        }
        if (t.closest('[data-mqr-save]')) {
          e.preventDefault();
          var inp2 = li.querySelector('.mqr__in');
          if (!inp2) return;
          saveOne(iso, inp2.value.trim(), t.closest('[data-mqr-save]'));
          return;
        }
        if (t.closest('[data-mqr-reset]')) { e.preventDefault(); clearOne(iso, t.closest('[data-mqr-reset]')); }
      });
    }
    if ($('#mqrReload')) $('#mqrReload').addEventListener('click', load);
    if ($('#mqrSearch')) $('#mqrSearch').addEventListener('input', function () { render(); });
    // 다른 날짜에 새 질문 넣기
    if ($('#mqrAddGo')) $('#mqrAddGo').addEventListener('click', function () {
      var day = ($('#mqrAddDay') && $('#mqrAddDay').value || '').trim();
      var tx = ($('#mqrAddText') && $('#mqrAddText').value || '').trim();
      var out = $('#mqrAddMsg');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) { if (out) { out.textContent = '날짜를 골라 주세요.'; out.style.color = '#BE123C'; } return; }
      if (tx.length < 5) { if (out) { out.textContent = '질문을 다섯 글자 이상 적어 주세요.'; out.style.color = '#BE123C'; } return; }
      var btn = $('#mqrAddGo'); btn.disabled = true; btn.textContent = '저장 중…';
      var p = pin();
      rpc('admin_morning_questions', { p_pin: p, p_action: 'set', p_day: day, p_text: tx }).then(function (d) {
        btn.disabled = false; btn.textContent = '이 날짜에 넣기';
        if (!d || !d.ok) { if (out) { out.textContent = '저장하지 못했어요 (' + ((d && d.error) || '') + ')'; out.style.color = '#BE123C'; } return; }
        st.over[day] = String(d.text || tx);
        if ($('#mqrAddText')) $('#mqrAddText').value = '';
        if (out) { out.textContent = mdOf(day) + ' 질문을 넣었어요 — 손님 화면에 바로 적용됩니다.'; out.style.color = '#047857'; }
        render();
      }, function (err) {
        btn.disabled = false; btn.textContent = '이 날짜에 넣기';
        if (out) {
          var m = (err && err.message) || '';
          out.textContent = /404|not find|does not exist/i.test(m)
            ? '서버 함수가 없어 저장하지 못했어요 — docs/morning-questions-db.sql 을 먼저 넣어 주세요.'
            : '저장하지 못했어요 · ' + (m || '연결을 확인해 주세요');
          out.style.color = '#BE123C';
        }
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { bind(); render(); });
  else { bind(); render(); }

  window.YoonMorningAdmin = { load: load, render: render, state: st };
})();

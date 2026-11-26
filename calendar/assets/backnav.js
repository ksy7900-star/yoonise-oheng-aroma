/* ==========================================================
   사주타이밍 · 윤이세사주 — 휴대폰 시스템 뒤로가기 통합 관리 (?v=20261126ad)
   ----------------------------------------------------------
   요청(#22697): 앱 전체에서 휴대폰 하단의 **시스템 뒤로가기**를 눌렀을 때
   · 열려 있는 팝업·상세 화면·펼친 카드를 **역순으로 하나씩** 닫고,
   · 다 닫힌 최상위 화면에서는 실수로 이탈하지 않게 한 번 막아 주고,
   · X·배경·닫기 버튼으로 닫았을 때 유령 스택이 남지 않게 한다.

   ■ 방식 — 히스토리 항목은 **하나만** 쓴다 (pushState 센티널 1장)
     팝업마다 pushState 를 쌓으면, X 로 닫았을 때 그 항목을 되돌리려고
     history.back() 을 부르게 되고 그 사이에 또 열리면 스택이 어긋난다(유령 항목).
     그래서 화면 위에는 항상 같은 문서의 항목 하나(ynBack)만 두고,
     팝업의 '열림/닫힘'은 이 파일 안의 **논리 스택**(stack)으로만 관리한다.
       · 열기  → stack.push + (아직 안 걸려 있으면) 센티널 pushState
       · 닫기  → stack 에서 그 표면과 그 위(안쪽) 표면까지 제거  ← 유령 스택 없음
       · 뒤로  → popstate → stack 의 맨 위 표면을 닫고 센티널을 다시 건다
     · 뒤로가기 두 번으로 종료: 최상위에서 첫 번째 뒤로가기는 안내 토스트만,
       2초 안에 두 번째로 누르면 페이지를 떠난다(안드로이드 앱 표준).
     · 키보드가 올라와 있으면 뒤로가기는 **키보드만** 닫는다(기존 시스템 동작 유지).

   ■ 다른 파일에서 쓰는 법 (딱 두 줄)
       BackNav.open('day', closeDayModal);   // 표면을 열었을 때
       BackNav.close('day');                 // 그 표면을 닫았을 때 (어떤 방법으로든)
     닫는 함수는 반드시 '실제로 닫는 기존 함수'를 그대로 넘긴다 — 새 닫기 로직을 만들지 않는다.

   ■ 건드리지 않는 것
     디자인·문구·운세 계산·저장 데이터·기존 X 버튼 동작·결제 흐름. 이 파일은
     '어떤 뒤로가기가 어떤 기존 닫기 함수를 부를지'만 정한다.
   ========================================================== */
(function (global) {
  'use strict';

  var BUILD = '20261126ad';
  var EXIT_MSG = '뒤로가기를 한 번 더 누르면 종료됩니다';
  var EXIT_GAP = 2000;      // ms — 이 안에 한 번 더 누르면 나간다
  var EXIT_STEPS = 5;       // 스스로 뒤로 갈 때 최대 항목 수 (안전장치)
  var SCROLL_KEY = 'yoonise.nav.scroll.v1';   // 다른 페이지에 갔다 돌아올 때 보던 자리

  var stack = [];           // [{ k: 표면이름, c: 닫는 함수 }] — 맨 위가 마지막에 연 것
  var seq = 0;              // 센티널 상태 번호
  var armed = false;        // 지금 히스토리 항목이 우리 센티널인가
  var baseUrl = '';         // 센티널을 걸 때 쓰는 주소(해시 없이 — 주소창을 흔들지 않는다)
  var lastRoot = 0;         // 최상위에서 마지막으로 뒤로가기를 누른 시각
  var leaving = 0;          // 스스로 페이지를 떠나는 중 (남은 되돌림 횟수)
  var anonSeq = 0;          // id 없는 <details> 에 붙이는 이름표
  var toastEl = null, toastT = 0;
  var started = false;

  /* ── 글자를 입력하는 칸인가 — 키보드가 올라와 있으면 뒤로가기는 키보드부터 ── */
  function isEditable(el) {
    if (!el || !el.tagName) return false;
    var tag = el.tagName.toLowerCase();
    if (tag === 'textarea') return true;
    if (tag === 'input') {
      var t = (el.type || 'text').toLowerCase();
      return ['button', 'submit', 'reset', 'checkbox', 'radio', 'file', 'range',
        'color', 'image'].indexOf(t) < 0;
    }
    return !!el.isContentEditable;
  }

  /* ── 안내 토스트 — 앱의 기존 토스트(.toast)를 그대로 쓴다 ── */
  function toast(msg) {
    var t = global.YoonCalendar && global.YoonCalendar.toast;
    if (typeof t === 'function') {
      try { t(msg); return; } catch (e) { }
    }
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      toastEl.setAttribute('role', 'status');
      toastEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.remove('is-on');
    void toastEl.offsetWidth;
    toastEl.classList.add('is-on');
    clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.classList.remove('is-on'); }, 2800);
  }

  /* ── 히스토리에 우리 항목 하나를 건다 ──
     keepHash: 첫 항목만 true — 주소에 붙어 온 #talis 같은 해시를 지우지 않아야
     앱이 열린 직후 그 해시를 읽고 부적 팝업을 열 수 있다(지운 뒤에는 앱이 스스로 정리). */
  function arm(keepHash) {
    if (!global.history || typeof global.history.pushState !== 'function') return;
    var url = baseUrl || global.location.pathname;
    if (keepHash) url += (global.location.hash || '');
    try {
      seq += 1;
      global.history.pushState({ ynBack: seq }, '', url);
      armed = true;
    } catch (e) {
      armed = false;
    }
  }

  /* ── 표면 열기 ───────────────────────────────────────── */
  function open(key, closeFn) {
    if (!key || typeof closeFn !== 'function') return false;
    for (var i = stack.length - 1; i >= 0; i--) {
      if (stack[i].k === key) {          // 이미 열려 있으면 중복으로 쌓지 않는다
        stack.length = i + 1;
        stack[i].c = closeFn;
        if (!armed) arm();
        return true;
      }
    }
    stack.push({ k: key, c: closeFn });
    if (!armed) arm();
    return true;
  }

  /* ── 표면 닫기(어떤 방법으로 닫았든) — 그 표면과 그 위(안쪽) 표면까지 걷어낸다 ── */
  function close(key) {
    for (var i = stack.length - 1; i >= 0; i--) {
      if (stack[i].k === key) { stack.length = i; return true; }
    }
    return false;
  }

  /* ── 뒤로가기 한 번 = 맨 위 표면 하나 닫기 ── */
  function stepBack() {
    if (!stack.length) return false;
    var top = stack.pop();
    try { top.c(); } catch (e) { }
    return true;
  }

  function onPop() {
    /* 스스로 페이지를 떠나는 중 — 같은 문서 항목이 더 남아 있으면 한 번 더 물러난다 */
    if (leaving > 0) {
      leaving -= 1;
      if (leaving > 0) { try { global.history.back(); } catch (err) { } }
      return;
    }
    armed = false;

    /* 키보드가 올라와 있으면 키보드만 닫는다 (기존 시스템 동작을 방해하지 않는다) */
    var ae = document.activeElement;
    if (isEditable(ae)) {
      try { ae.blur(); } catch (err) { }
      arm();
      return;
    }

    /* 열려 있는 팝업·상세·펼침이 있으면 맨 위부터 닫는다 */
    if (stepBack()) { arm(); return; }

    /* 최상위 화면 — 실수 이탈 방지 (한 번은 안내, 2초 안에 두 번째면 나간다) */
    var now = Date.now();
    if (lastRoot && (now - lastRoot) <= EXIT_GAP) {
      lastRoot = 0;
      leaving = EXIT_STEPS;
      try { global.history.back(); } catch (err) { }
      return;
    }
    lastRoot = now;
    toast(EXIT_MSG);
    arm();
  }

  /* ── 접힘/펼침(<details>)도 같은 스택에 — 열면 쌓고, 닫으면 걷어낸다 ──
     toggle 은 버블하지 않아 캡처로 받는다. id 가 없는 것(#advanced 등)은
     한 번만 이름표(data-bn)를 붙여 기억한다. */
  function detailKey(d) {
    if (!d) return '';
    if (d.id) return 'details:' + d.id;
    var k = d.getAttribute('data-bn');
    if (!k) {
      anonSeq += 1;
      k = 'a' + anonSeq;
      try { d.setAttribute('data-bn', k); } catch (e) { }
    }
    return 'details:' + k;
  }

  function onToggle(e) {
    var d = e && e.target;
    if (!d || !d.tagName || d.tagName.toLowerCase() !== 'details') return;
    var key = detailKey(d);
    if (!key) return;
    if (d.open) {
      open(key, function () { try { d.open = false; } catch (err) { } });
    } else {
      close(key);
    }
  }

  /* ── 보던 자리 기억 — 같은 문서 안의 뒤로가기(팝업 닫기)에서는 브라우저가
     화면을 맨 위로 되돌리지 않게(manual) 두고, 다른 페이지에 갔다 돌아온
     경우(back_forward)에만 이 함수로 예전에 보던 자리로 돌린다. ── */
  function navType() {
    try {
      var list = global.performance && global.performance.getEntriesByType
        ? global.performance.getEntriesByType('navigation') : null;
      return (list && list[0] && list[0].type) || '';
    } catch (e) { return ''; }
  }
  function saveScroll() {
    try {
      sessionStorage.setItem(SCROLL_KEY, String(global.scrollY || document.documentElement.scrollTop || 0));
    } catch (e) { }
  }
  function restoreScroll() {
    var y = 0;
    try { y = Number(sessionStorage.getItem(SCROLL_KEY) || 0) || 0; } catch (e) { y = 0; }
    if (!y) return;
    var put = function () {
      try {
        var max = Math.max(0, document.documentElement.scrollHeight - global.innerHeight);
        if (y <= max + 2) global.scrollTo(0, y);
      } catch (e) { }
    };
    [40, 160, 380, 700].forEach(function (ms) { setTimeout(put, ms); });
  }

  function start() {
    if (started) return;
    started = true;
    try { baseUrl = global.location.pathname + global.location.search; } catch (e) { baseUrl = ''; }
    /* 스크롤은 브라우저가 히스토리 항목마다 되돌리게 두지 않는다 —
       같은 문서 안에서 뒤로가기를 누를 때마다 화면이 맨 위(0)로 튀어 버리기 때문.
       대신 페이지를 떠날 때 보던 자리를 적어 두고, 뒤로 돌아온 화면에서 우리가 되돌린다. */
    try { global.history.scrollRestoration = 'manual'; } catch (e) { }
    document.addEventListener('toggle', onToggle, true);
    global.addEventListener('popstate', onPop);
    global.addEventListener('pagehide', saveScroll);
    global.addEventListener('pageshow', function (e) {
      if (!e) return;
      if (e.persisted) {                 // 뒤로 돌아와 되살아난 화면 — 브라우저가 얼린 그대로
        leaving = 0;
        lastRoot = 0;
        if (!armed) arm();
        return;
      }
      var t = navType();
      if (t === 'back_forward' || t === 'reload') restoreScroll();
      else { try { sessionStorage.removeItem(SCROLL_KEY); } catch (err) { } }
    });
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      var t0 = navType();
      if (t0 === 'back_forward' || t0 === 'reload') restoreScroll();
    }
    arm(true);        // 첫 항목 — 주소의 #해시를 건드리지 않는다
  }

  global.BackNav = {
    open: open,
    close: close,
    depth: function () { return stack.length; },
    keys: function () { return stack.map(function (x) { return x.k; }); },
    version: BUILD
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(window);

/* ==========================================================
   타이밍달력 · 윤이세사주 — 홈 화면 앱 설치(PWA)
   · 설치 버튼 : 앱으로 열려 있으면 숨김, 브라우저면 상단에 노출
   · beforeinstallprompt 가 잡히면 누르는 즉시 네이티브 설치 창
   · 카톡·네이버 인앱 / iOS / 그 외 브라우저는 각각 맞는 안내 + 주소 복사
   · 2026-11-23: 달력 맨 아래 `📲 내 폰 바탕화면에 꺼내 두기`(#getAppBar)와
     액운 태우기 STEP 3 한 줄([data-pwa-install])도 같은 길로 연결 — 앱으로 열면 함께 숨긴다.
   ========================================================== */
(function () {
  'use strict';

  var bar = document.getElementById('installBar');
  var goBtn = document.getElementById('installGo');
  var hideBtn = document.getElementById('installHide');
  var modal = document.getElementById('installModal');
  var dialog = document.getElementById('installDialog');
  var body = document.getElementById('installBody');
  var getBar = document.getElementById('getAppBar');   // 수호 부적 카드 아래 초대 카드
  var careGo = document.getElementById('careGo');       // ⚡ 긴급 개운템 카드의 버튼
  if (!bar || !modal || !body) return;

  var HIDE_KEY = 'yoonise.install.hide';
  var PAGE_URL = location.origin + location.pathname.replace(/index\.html$/, '');
  var deferredPrompt = null;
  var lastFocus = null;

  /* ── 지금 어떤 껍데기에서 열렸나 ───────────────────── */
  function ua() { return navigator.userAgent || ''; }
  function isStandalone() {
    try {
      if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
      if (window.matchMedia && window.matchMedia('(display-mode: fullscreen)').matches) return true;
      if (window.matchMedia && window.matchMedia('(display-mode: minimal-ui)').matches) return true;
    } catch (e) {}
    return navigator.standalone === true;
  }
  function isKakao() { return /KAKAOTALK/i.test(ua()); }
  function isNaverInapp() { return /NAVER\(inapp/i.test(ua()); }
  function isIOS() {
    return /iPhone|iPad|iPod/i.test(ua()) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }
  function isAndroid() { return /Android/i.test(ua()); }
  function isSamsung() { return /SamsungBrowser/i.test(ua()); }
  function isInapp() { return isKakao() || isNaverInapp(); }

  function hideBar() {
    bar.hidden = true;
    bar.classList.remove('is-on');
  }
  function showBar() {
    if (isStandalone()) { hideBar(); return; }
    try { if (sessionStorage.getItem(HIDE_KEY) === '1') return; } catch (e) {}
    bar.hidden = false;
    // 한 프레임 뒤에 켜야 아래에서 올라오는 느낌이 산다
    requestAnimationFrame(function () { bar.classList.add('is-on'); });
  }

  /* ── 앱으로 연 상태면 카드 자체를 숨긴다 ────────────────
     · #getAppBar : 달력 맨 아래 초대 카드
     · [data-pwa-install] : 액운 태우기 STEP 3 한 줄 (나중에 그려지므로 html 클래스로 함께 숨김) */
  function markStandalone() {
    var on = isStandalone();
    try { document.documentElement.classList.toggle('is-standalone', on); } catch (e) {}
    if (getBar) {
      if (on) { getBar.hidden = true; getBar.classList.remove('is-on'); }
      else showGetBar();
    }
    return on;
  }
  function showGetBar() {
    if (!getBar || isStandalone()) return;
    getBar.hidden = false;
    requestAnimationFrame(function () { getBar.classList.add('is-on'); });
  }

  /* ── 토스트 ─────────────────────────────────────────── */
  var toastEl = null, toastTimer = 0;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast pwa-toast';
      toastEl.setAttribute('role', 'status');
      toastEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.remove('is-on');
    void toastEl.offsetWidth;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-on'); }, 2800);
  }

  /* ── 주소 복사 ──────────────────────────────────────── */
  function legacyCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }
  function copyUrl() {
    var done = function (ok) {
      toast(ok ? '📋 주소를 복사했어요 — 브라우저 주소창에 붙여 넣으세요' : '주소를 길게 눌러 직접 복사해 주세요');
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(PAGE_URL).then(function () { done(true); }, function () { done(legacyCopy(PAGE_URL)); });
    } else {
      done(legacyCopy(PAGE_URL));
    }
  }

  /* ── 안내 팝업 ──────────────────────────────────────── */
  var COPY_BTN = '<button type="button" class="install__copy" data-install-copy>' +
    '<span aria-hidden="true">📋</span> 주소 복사하기</button>' +
    '<p class="install__addr" data-install-addr></p>';
  var COPY_BTN_SUB = '<button type="button" class="install__copy install__copy--sub" data-install-copy>' +
    '<span aria-hidden="true">📋</span> 주소 복사하기</button>' +
    '<p class="install__addr" data-install-addr></p>';

  function stepsHTML(list) {
    return '<ol class="install__steps">' + list.map(function (s) {
      return '<li class="install__step"><span class="install__n" aria-hidden="true">' + s[0] + '</span>' +
        '<span class="install__st">' + s[1] + '</span></li>';
    }).join('') + '</ol>';
  }

  /** 안드로이드 크롬으로 바로 여는 intent 주소 — 카톡 인앱에서 ⋮ 메뉴를 헤매지 않게 (2026-11-24) */
  function chromeIntent() {
    var u = PAGE_URL.replace(/^https?:\/\//, '');
    return 'intent://' + u + '#Intent;scheme=https;package=com.android.chrome;end';
  }
  function contentFor(kind) {
    if (kind === 'inapp') {
      var where = isKakao() ? '카톡' : '네이버';
      var toBrowser = isIOS() ? '사파리' : '크롬';
      /* 2026-11-24 — 안드로이드 카톡에서는 '크롬으로 바로 열기' 원터치 버튼 하나만 크게 둔다.
         iOS 는 기존처럼 카톡의 '브라우저에서 열기' 로 넘긴다. */
      var chromeBtn = (isKakao() && isAndroid())
        ? '<a class="install__copy install__ext install__chrome" href="' + chromeIntent() + '" data-install-chrome>' +
          '<span aria-hidden="true">🌐</span> 크롬으로 바로 열기 →</a>'
        : '';
      var extBtn = (!chromeBtn && isKakao())
        ? '<button type="button" class="install__copy install__ext" data-install-external>' +
          '<span aria-hidden="true">↗</span> 브라우저에서 열기</button>'
        : '';
      return '<p class="install__eyebrow">INSTALL</p>' +
        '<h2 class="install__t" id="installTitle">' + where + ' 안에선 설치 창이 안 떠요</h2>' +
        '<p class="install__d">' + (chromeBtn
          ? '아래 <b>크롬으로 바로 열기</b>를 누르면 크롬에서 열려요.<br>크롬에서 한 번 더 누르면 홈 화면에 꺼내 둘 수 있어요.'
          : '우측 메뉴(<b>⋮</b> / <b>···</b>)에서 <b>\'다른 브라우저로 열기\'</b>를 누른 뒤 꺼내 두세요.<br>열린 ' + toBrowser + ' 화면에서 한 번 더 누르면 끝이에요.') + '</p>' +
        chromeBtn + extBtn +
        '<p class="install__hint">버튼이 안 열리면 아래 주소를 복사해 ' + toBrowser + ' 주소창에 붙여 넣어 주세요.</p>' +
        ((chromeBtn || extBtn) ? COPY_BTN_SUB : COPY_BTN);
    }
    if (kind === 'ios') {
      return '<p class="install__eyebrow">INSTALL · iPhone</p>' +
        '<h2 class="install__t" id="installTitle">사파리에선 이렇게 꺼내요</h2>' +
        '<p class="install__d">하단 공유(<b>□↑</b>) 또는 메뉴에서 <b>\'홈 화면에 추가\'</b>를 누르면 바탕화면에 아이콘이 생겨요.</p>' +
        stepsHTML([
          ['1', '사파리 하단 가운데 <b>공유 □↑</b>를 눌러요'],
          ['2', '목록을 내려 <b>홈 화면에 추가</b>를 골라요'],
          ['3', '오른쪽 위 <b>추가</b>를 누르면 끝']
        ]) +
        '<p class="install__hint">카톡·네이버에서 열었다면 먼저 사파리로 열어야 해요.</p>' +
        COPY_BTN;
    }
    if (kind === 'samsung') {
      return '<p class="install__eyebrow">INSTALL · Samsung Internet</p>' +
        '<h2 class="install__t" id="installTitle">삼성 인터넷에서 까는 법</h2>' +
        '<p class="install__d">아래 메뉴를 열고 <b>홈 화면에 추가</b>를 고르면 앱처럼 깔려요.</p>' +
        stepsHTML([
          ['1', '오른쪽 아래 <b>가로줄 세 개 메뉴</b>를 눌러요'],
          ['2', '<b>홈 화면에 추가</b>를 골라요'],
          ['3', '<b>추가</b>를 누르면 홈 화면에 아이콘이 생겨요']
        ]) + COPY_BTN;
    }
    if (kind === 'android') {
      return '<p class="install__eyebrow">INSTALL · Chrome</p>' +
        '<h2 class="install__t" id="installTitle">크롬에서 까는 법</h2>' +
        '<p class="install__d">주소창 오른쪽 <b>점 세 개 메뉴</b>에서 <b>앱 설치</b>를 고르면 돼요.<br>(안 보이면 <b>홈 화면에 추가</b>를 고르세요)</p>' +
        stepsHTML([
          ['1', '오른쪽 위 <b>점 세 개 메뉴</b>를 눌러요'],
          ['2', '<b>앱 설치</b> 또는 <b>홈 화면에 추가</b>를 골라요'],
          ['3', '<b>설치</b>를 누르면 홈 화면에 아이콘이 생겨요']
        ]) +
        /* 2026-11-23 김나영 님 #16851 — 크롬 메뉴 맨 위의 ⬇️(다운로드)를 눌러 오프라인 저장으로 새는 걸 막는다 */
        '<p class="install__hint">메뉴 맨 위의 <b>⬇️ 다운로드</b> 아이콘이 아니라, 메뉴를 아래로 내려 <b>홈 화면에 추가</b>를 눌러 주세요.</p>' +
        COPY_BTN;
    }
    return '<p class="install__eyebrow">INSTALL</p>' +
      '<h2 class="install__t" id="installTitle">홈 화면에 꺼내 두기</h2>' +
      '<p class="install__d">지금 쓰는 브라우저에서는 설치 버튼이 안 보일 수 있어요.<br>휴대폰이면 <b>크롬·사파리</b>로 열어 주세요.</p>' +
      '<p class="install__d">크롬이면 주소창 오른쪽 <b>점 세 개 → 앱 설치</b>(또는 <b>홈 화면에 추가</b>)로 꺼낼 수 있어요.</p>' +
      COPY_BTN;
  }

  function kindNow() {
    if (isInapp()) return 'inapp';
    if (isIOS()) return 'ios';
    if (isSamsung()) return 'samsung';
    if (isAndroid()) return 'android';
    return 'other';
  }

  function fillAddr() {
    var el = body.querySelector('[data-install-addr]');
    if (el) el.textContent = PAGE_URL;
  }

  function openModal(kind) {
    body.innerHTML = contentFor(kind);
    fillAddr();
    lastFocus = document.activeElement;
    modal.hidden = false;
    if (window.BackNav) window.BackNav.open('install', closeModal);     // 휴대폰 뒤로가기 → 설치 안내부터 닫기
    document.body.classList.add('is-modal-open');
    /* 닫기(✕)에 초점을 주면 닫기 버튼에 테두리가 잡혀 '닫으세요'처럼 보인다 — 팝업 자체에 초점 */
    try { dialog.focus({ preventScroll: true }); } catch (e) {}
    dialog.scrollTop = 0;
  }

  function closeModal() {
    if (modal.hidden) return;
    if (window.BackNav) window.BackNav.close('install');
    modal.hidden = true;
    body.innerHTML = '';
    if (!document.querySelector('.modal:not([hidden])')) {
      document.body.classList.remove('is-modal-open');
    }
    if (lastFocus && lastFocus.focus) {
      try { lastFocus.focus({ preventScroll: true }); } catch (e) {}
    }
  }

  /* ── 누르면 ─────────────────────────────────────────── */
  function onInstallClick() {
    if (isStandalone()) { hideBar(); return; }

    if (deferredPrompt) {
      var p = deferredPrompt;
      deferredPrompt = null;
      p.prompt();
      p.userChoice.then(function (choice) {
        if (choice && choice.outcome === 'accepted') {
          toast('📲 홈 화면에 앱이 깔렸어요');
          hideBar();
        } else {
          // 스스로 닫았으면 다음부터는 브라우저 메뉴 안내로
          openModal(kindNow());
        }
      }).catch(function () {});
      return;
    }
    openModal(kindNow());
  }

  if (goBtn) goBtn.addEventListener('click', onInstallClick);

  /* ── 상시 `📲 앱 설치` (달력 하단 · 하단 픽셀) ─────────────────
     배너를 닫았거나 설치 기록이 남아도, 이미 앱으로 열려 있어도 눌리게 둔다. */
  function onPersistClick() {
    if (isStandalone()) {
      toast('지금은 홈 화면 앱으로 열려 있어요 — 아이콘을 누르면 바로 열립니다');
      return;
    }
    onInstallClick();
  }
  ['installCal', 'installFoot'].forEach(function (id) {
    var btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', onPersistClick);
  });
  if (hideBtn) {
    hideBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      try { sessionStorage.setItem(HIDE_KEY, '1'); } catch (err) {}
      hideBar();
    });
  }

  modal.addEventListener('click', function (e) {
    if (e.target.closest('[data-install-close]')) { closeModal(); return; }
    if (e.target.closest('[data-install-copy]')) { copyUrl(); return; }
    if (e.target.closest('[data-install-external]')) {
      // 카톡 인앱 → 기본 브라우저로 바로 넘긴다 (안 열리면 아래 주소 복사가 길)
      try { location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(PAGE_URL); } catch (err) {}
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !modal.hidden) closeModal();
  });

  /* ── 브라우저가 설치를 허락할 때 ─────────────────────── */
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    showBar();
  });
  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    hideBar();
    if (getBar) { getBar.hidden = true; getBar.classList.remove('is-on'); }
    toast('📲 홈 화면에 앱이 깔렸어요 — 아이콘을 눌러 바로 열어 보세요');
  });

  /* ── ⚡ 긴급 개운템 — 바탕화면에 꺼내 두면 그 자리에서 바로 열린다 ──
     · 브라우저로 열었을 때 : 바탕화면 설치(또는 카톡·아이폰 안내)로 이어진다
     · 바탕화면 아이콘(앱)으로 열었을 때 : 개운템 무료 체험 화면을 연다(calendar.js 가 받는다) */
  if (careGo) {
    careGo.addEventListener('click', function (e) {
      e.preventDefault();
      if (isStandalone()) {
        try { document.dispatchEvent(new CustomEvent('yoonise:care-open')); }
        catch (err) { document.dispatchEvent(new Event('yoonise:care-open')); }
        return;
      }
      onInstallClick();
    });
  }

  /* ── `📲 내 폰 바탕화면에 꺼내 두기` — 달력 맨 아래 카드 · 액운 태우기 STEP 3 한 줄 ──
     두 버튼 모두 data-pwa-install 하나로 묶어, 어디에 그려지든 같은 길로 보낸다. */
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('[data-pwa-install]') : null;
    if (!t) return;
    e.preventDefault();
    onInstallClick();
  }, false);

  /* 앱으로 열린 채로 시작했거나, 설치 뒤 standalone으로 바뀌면 버튼을 숨긴다 */
  try {
    var mq = window.matchMedia('(display-mode: standalone)');
    var onChange = function () { markStandalone(); if (mq.matches) hideBar(); else showBar(); };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  } catch (e) {}

  showBar();
  markStandalone();

  /* ── 자동 새로 고침은 '한 번'만 — 설치 앱에서는 주소를 바꾸지 않는다 ──────
     (2026-11-24 #19032 · 설치 고객 앱이 다시 열 때 꺼지던 문제)
     · 홈 화면에 깔린 앱(iOS standalone·안드로이드 WebAPK)에서 location.replace 로
       주소(?v=)를 바꾸면 그건 '새로 고침'이 아니라 앱 밖으로 나가는 이동으로 처리된다.
       iOS 는 사파리로 튕기고, 안드로이드 WebAPK 는 앱 창이 다시 뜬다 — 고객에게는 앱이 꺼진 것으로 보인다.
       그래서 설치 앱에서는 주소를 그대로 두고 location.reload() 만 한다.
     · 갱신 경로가 둘(cacheHeal · controllerchange)이라 같은 실행에서 두 번 넘어갈 수 있었다.
       sessionStorage 에 시각을 남겨 새로 고쳐도 살아 있게 하고, 한 번 넘어가면 잠근다. */
  var NAV_KEY = 'yoonise.nav.at';
  var NAV_WINDOW = 20000;                 // 이 시간 안에는 자동 새로 고침을 다시 하지 않는다
  function navLocked() {
    try {
      var t = parseInt(sessionStorage.getItem(NAV_KEY) || '0', 10);
      return !!t && (Date.now() - t) < NAV_WINDOW;
    } catch (e) { return false; }
  }
  function lockNav() {
    try { sessionStorage.setItem(NAV_KEY, String(Date.now())); } catch (e) {}
  }
  /* nextUrl 이 있으면(브라우저 탭) 그 주소로, 없거나 설치 앱이면 같은 주소로 새로 고친다 */
  function refreshOnce(nextUrl) {
    if (document.visibilityState === 'hidden') return false;   // 앱이 뒤에 있으면 건드리지 않는다
    if (navLocked()) return false;                             // 방금 넘어왔다 — 두 번 가지 않는다
    lockNav();
    try {
      if (nextUrl && !isStandalone()) location.replace(nextUrl);
      else location.reload();
    } catch (e) {
      try { location.reload(); } catch (e2) {}
    }
    return true;
  }

  /* ── 서비스 워커 (network-first · skipWaiting · claim) ──
     · 등록할 때 updateViaCache:'none' — sw.js 자체가 브라우저 HTTP 캐시(max-age=600)에
       가려 새 버전 확인이 10분 밀리는 일을 막는다 (2026-11-24 #18768).
     · 등록 직후·'화면이 다시 보일 때'·'뒤로/앞으로 캐시로 돌아왔을 때(pageshow)'마다
       update() 로 새 sw.js 를 확인한다.
     · 새 워커가 이 화면을 넘겨받으면(controllerchange) 딱 한 번 새로 고친다 —
       앱을 켜 두 채로 배포해도 예전 화면이 남지 않게 (2026-11-23 제보 #16176)
       (첫 설치에서 claim 으로 넘겨받는 경우엔 새로 고치지 않는다) */
  if ('serviceWorker' in navigator) {
    var hadController = !!navigator.serviceWorker.controller;
    var didReload = false;

    /* 새로 고쳐도 안전한가 — 입력 중이거나 아직 저장 전인 글이 있으면 건드리지 않는다.
       (localStorage 의 사주·1초 체크·결제 기록은 새로 고쳐도 그대로다. 지킬 것은 지금 쓰는 중인 글.) */
    function hasUnsavedInput() {
      try {
        var el = document.activeElement;
        var tag = (el && el.tagName ? el.tagName : '').toLowerCase();
        if (tag === 'textarea' || tag === 'select') return true;
        if (el && el.isContentEditable) return true;
        if (tag === 'input') {
          var t = (el.getAttribute('type') || 'text').toLowerCase();
          if (t !== 'checkbox' && t !== 'radio' && t !== 'button' && t !== 'submit' && t !== 'range') return true;
        }
        /* 포커스가 빠져 있어도 저장 전 글이 남아 있으면 그대로 둔다 */
        var diary = document.querySelector('#diaryText');
        if (diary && String(diary.value || '').trim()) return true;
        var nameIn = document.querySelector('#name');
        if (nameIn && nameIn.offsetParent && String(nameIn.value || '').trim()) return true;
      } catch (e) {}
      return false;
    }

    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (didReload || !hadController) return;
      didReload = true;
      if (hasUnsavedInput()) return;      // 쓰던 글을 지우지 않는다 — 다음에 열 때 최신으로 뜬다
      refreshOnce();                      // 설치 앱이면 주소 그대로 새로 고침 (앱이 닫히지 않게)
    });

    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js', { scope: './', updateViaCache: 'none' }).then(function (reg) {
        try { reg.update(); } catch (e) {}
        document.addEventListener('visibilitychange', function () {
          if (document.visibilityState !== 'visible') return;
          try { reg.update(); } catch (e) {}
        });
        /* 홈 화면 앱을 다시 열거나 뒤로 돌아와도 새 배포를 확인한다 */
        window.addEventListener('pageshow', function () {
          try { reg.update(); } catch (e) {}
        });
      }).catch(function () {});
    });
  }

  /* ── 버전 이름 견주기 — '20261124z' 다음이 '20261124aa' 처럼 글자 꼬리가 늘어나도
     "예전 파일이냐"를 맞게 판단하려고 숫자(8자리) + 알파벳 꼬리(26진수)로 본다.
     ('z' = 26 → 'aa' = 27 → 'ab' = 28). 해석이 안 되는 이름은 예전처럼 글자로 견준다. */
  function verKey(s) {
    var m = /^(\d+)([a-z]*)$/.exec(s || '');
    if (!m) return null;
    var tail = 0, t = m[2];
    for (var i = 0; i < t.length; i++) tail = tail * 26 + (t.charCodeAt(i) - 96);
    return [parseInt(m[1], 10), tail];
  }
  function olderVersion(a, b) {            // a 가 b 보다 예전이면 true
    var ka = verKey(a), kb = verKey(b);
    if (!ka || !kb) return a < b;
    if (ka[0] !== kb[0]) return ka[0] < kb[0];
    return ka[1] < kb[1];
  }

  /* ── 예전 화면이 남아 있을 때 스스로 최신 화면으로 ──
     깃허브 페이지 HTML 은 cache-control: max-age=600 이다. 서비스 워커가 없는
     브라우저(카톡·네이버 인앱 등)나 워커가 붙기 전 첫 화면에서는 배포 직후
     10분쯤 예전 화면이 그대로 보인다.
     화면에 실린 ?v= (BUILD) 와 지금 서버의 sw.js VERSION 을 비교해서, 서버가
     더 새 버전이면 새 ?v= 주소로 한 번만 다시 연다. (뒤로는 절대 돌지 않는다) */
  (function cacheHeal() {
    if (!window.fetch || !window.URL) return;
    var BUILD = '';
    try {
      var me = document.currentScript || document.querySelector('script[src*="pwa.js"]');
      var m = /[?&]v=([0-9A-Za-z.]+)/.exec((me && (me.src || me.getAttribute('src'))) || '');
      if (m) BUILD = m[1];
    } catch (e) {}
    if (!BUILD) return;
    var LIVE = '';
    try {
      var u = new URL(location.href);
      var cur = u.searchParams.get('v') || '';
      fetch('sw.js', { cache: 'no-store' }).then(function (r) {
        return r.ok ? r.text() : '';
      }).then(function (txt) {
        var m = /VERSION\s*=\s*'([0-9A-Za-z.]+)'/.exec(txt || '');
        if (!m) return;
        LIVE = m[1];
        if (!LIVE || LIVE === BUILD) return;
        if (olderVersion(LIVE, BUILD)) return;   // 예전 파일이 섞여 와도 되돌리지 않는다 ('z' → 'aa' 도 견준다)
        if (cur === LIVE) return;          // 이미 새 주소로 왔다 — 다시 돌지 않는다
        /* 설치 앱은 주소를 바꾸지 않는다 — 주소가 바뀌면 앱이 사파리·새 창으로 넘어가며 닫힌 것처럼 보인다.
           (서비스 워커가 붙은 설치 앱은 같은 주소 새로 고침만으로 최신 HTML 이 온다 — sw.js 가 no-store) */
        if (isStandalone()) { refreshOnce(); return; }
        u.searchParams.set('v', LIVE);
        refreshOnce(u.toString());
      }).catch(function () {});
    } catch (e) {}
  })();
})();

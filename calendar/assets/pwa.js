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

  function contentFor(kind) {
    if (kind === 'inapp') {
      var where = isKakao() ? '카톡' : '네이버';
      var toBrowser = isIOS() ? '사파리' : '크롬(또는 삼성 인터넷)';
      // 카톡은 메뉴를 거치지 않고 바로 기본 브라우저로 넘기는 길을 먼저 준다 (안드로이드·iOS 둘 다)
      var extBtn = isKakao()
        ? '<button type="button" class="install__copy install__ext" data-install-external>' +
          '<span aria-hidden="true">↗</span> 브라우저에서 열기</button>'
        : '';
      return '<p class="install__eyebrow">INSTALL</p>' +
        '<h2 class="install__t" id="installTitle">' + where + ' 안에선 설치 창이 안 떠요</h2>' +
        '<p class="install__d">우측 메뉴(<b>⋮</b> / <b>···</b>)에서 <b>\'다른 브라우저로 열기\'</b>를 누른 뒤 꺼내 두세요.<br>' +
        '열린 ' + toBrowser + ' 화면에서 한 번 더 누르면 끝이에요.</p>' +
        extBtn +
        '<p class="install__hint">버튼이 안 열리면 아래 주소를 복사해 ' + toBrowser + ' 주소창에 붙여 넣어 주세요.</p>' +
        (extBtn ? COPY_BTN_SUB : COPY_BTN);
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
        ]) + COPY_BTN;
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
    document.body.classList.add('is-modal-open');
    /* 닫기(✕)에 초점을 주면 닫기 버튼에 테두리가 잡혀 '닫으세요'처럼 보인다 — 팝업 자체에 초점 */
    try { dialog.focus({ preventScroll: true }); } catch (e) {}
    dialog.scrollTop = 0;
  }

  function closeModal() {
    if (modal.hidden) return;
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

  /* ── 서비스 워커 (network-first · skipWaiting · claim) ── */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js', { scope: './' }).catch(function () {});
    });
  }
})();

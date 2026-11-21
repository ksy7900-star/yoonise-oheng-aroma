/* ==========================================================
   타이밍달력 · 윤이세사주 — 홈 화면 앱 설치(PWA)
   · 설치 버튼 : 앱으로 열려 있으면 숨김, 브라우저면 상단에 노출
   · beforeinstallprompt 가 잡히면 누르는 즉시 네이티브 설치 창
   · 카톡·네이버 인앱 / iOS / 그 외 브라우저는 각각 맞는 안내 + 주소 복사
   ========================================================== */
(function () {
  'use strict';

  var bar = document.getElementById('installBar');
  var goBtn = document.getElementById('installGo');
  var hideBtn = document.getElementById('installHide');
  var modal = document.getElementById('installModal');
  var dialog = document.getElementById('installDialog');
  var body = document.getElementById('installBody');
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

  function stepsHTML(list) {
    return '<ol class="install__steps">' + list.map(function (s) {
      return '<li class="install__step"><span class="install__n" aria-hidden="true">' + s[0] + '</span>' +
        '<span class="install__st">' + s[1] + '</span></li>';
    }).join('') + '</ol>';
  }

  function contentFor(kind) {
    if (kind === 'inapp') {
      var where = isKakao() ? '카톡' : '네이버';
      var toBrowser = isIOS() ? '사파리' : '크롬이나 삼성 인터넷';
      var openStep = isIOS() ? '<b>다른 브라우저로 열기</b>(사파리)' : '<b>다른 브라우저로 열기</b>';
      return '<p class="install__eyebrow">INSTALL</p>' +
        '<h2 class="install__t" id="installTitle">여기선 설치가 안 돼요</h2>' +
        '<p class="install__d"><b>' + where + ' 안에서는 홈 화면 설치가 막혀 있어요.</b><br>' +
        '오른쪽 위(또는 아래) 메뉴에서 ' + openStep + '를 누른 뒤, ' + toBrowser + '에서 다시 열어 주세요.</p>' +
        stepsHTML([
          ['1', '오른쪽 위 <b>점 세 개</b> 또는 아래 메뉴를 눌러요'],
          ['2', openStep + '를 골라요'],
          ['3', '열린 페이지에서 <b>📲 홈 화면에 설치하기</b>를 다시 눌러요']
        ]) +
        '<p class="install__hint">주소를 복사해 두면 ' + (isIOS() ? '사파리' : '브라우저') + ' 주소창에 붙여 넣기만 하면 돼요.</p>' +
        COPY_BTN;
    }
    if (kind === 'ios') {
      return '<p class="install__eyebrow">INSTALL · iPhone</p>' +
        '<h2 class="install__t" id="installTitle">사파리에선 이렇게 깔아요</h2>' +
        '<p class="install__d">아이폰은 앱스토어가 아니라 <b>사파리 공유 버튼</b>으로 깔아요.<br>한 번 깔면 아이콘만 눌러 바로 열려요.</p>' +
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
      '<h2 class="install__t" id="installTitle">홈 화면에 앱으로 깔기</h2>' +
      '<p class="install__d">크롬이면 주소창 오른쪽 <b>설치 아이콘(⊕)</b> 또는 <b>점 세 개 → 저장 및 공유 → 앱 설치</b>로 깔 수 있어요.</p>' +
      '<p class="install__d">휴대폰에서는 <b>크롬·삼성 인터넷</b>으로 열어야 설치 버튼이 보여요.</p>' +
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
    var focusTarget = dialog.querySelector('.modal__close');
    if (focusTarget) focusTarget.focus({ preventScroll: true });
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
  if (hideBtn) {
    hideBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      try { sessionStorage.setItem(HIDE_KEY, '1'); } catch (err) {}
      hideBar();
    });
  }

  modal.addEventListener('click', function (e) {
    if (e.target.closest('[data-install-close]')) { closeModal(); return; }
    if (e.target.closest('[data-install-copy]')) { copyUrl(); }
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
    toast('📲 홈 화면에 앱이 깔렸어요 — 아이콘을 눌러 바로 열어 보세요');
  });

  /* 앱으로 열린 채로 시작했거나, 설치 뒤 standalone으로 바뀌면 버튼을 숨긴다 */
  try {
    var mq = window.matchMedia('(display-mode: standalone)');
    var onChange = function () { if (mq.matches) hideBar(); else showBar(); };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  } catch (e) {}

  showBar();

  /* ── 서비스 워커 (network-first · skipWaiting · claim) ── */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js', { scope: './' }).catch(function () {});
    });
  }
})();

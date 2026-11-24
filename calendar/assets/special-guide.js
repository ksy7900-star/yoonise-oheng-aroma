/* ==========================================================
   🎁 첫 3일 결제 고객 특별 선물 — 화면 로직 (2026-11-24)
   · 이벤트: 첫 3일 결제 고객 특별 선물
   · 혜택: 윤이세가 직접 전하는 2027년 맞춤 운세 활용 가이드
   · 최초 사주 입력 시각은 서버(client_uid)가 남긴다 — 이 파일은 그 값을 받아 보여 준다.
   · 배너는 두 곳만: ① 달력 맨 위 카드 ② 맨 아래 '1년 전체 바로 열기' 버튼 위.
     달력 중간(#passBar 주변)에는 아무것도 넣지 않는다.
   · 카카오톡 링크를 눌러도 '접수 완료'가 되지 않는다 — 운영자가 확인해야 바뀐다.
   ========================================================== */
(function () {
  'use strict';

  var SB_URL = 'https://fifynkkaeqcjlovesuop.supabase.co';
  var SB_KEY = 'sb_publishable_JzSUlMOH9s38aer6y1BVEg_rHcQLGxF';
  var KAKAO = 'https://pf.kakao.com/_hxfbCG/chat';

  var UID_KEY = 'yoonise.clientUid.v1';
  var FIRST_KEY = 'yoonise.firstSajuAt.v1';       // { at: ISO, deadline_ms: number, source }
  var CLOSED_KEY = 'yoonise.specialGuide.closed.v1';
  var CLAIM_KEY = 'yoonise.specialGuide.claim.v1';

  var EVENT_HOURS = 72;
  /* 이벤트 시작 — 이 시각 전에 이미 사주를 저장해 둔 기기는 대상이 아니다.
     (과거 시각을 임의로 추정해 소급 적용하지 않는다 — 요청서 §2A) */
  var EVENT_START_MS = Date.parse('2026-11-24T09:00:00+09:00');
  var PAID_TIERS = { pass: 1, allinone: 1, diary: 1 };

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var mem = {
    uid: '',
    first: null,          // { at, deadline_ms, source }
    claim: null,          // claim RPC 결과
    claimTried: false,
    claimCode: '',
    busy: false,
    touchTried: false,
    touchBusy: false,
    preexisting: false,
    scrollNext: false,
    pollTimer: 0,
    tickTimer: 0,
    modalOpen: false,
    consentChecked: false    // 동의 체크 상태 — 다시 그려도 체크가 풀리지 않게 기억
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ── 기기 식별용 익명 키 ───────────────────────────────
     로그인 없이 도는 앱이라, 기기마다 무작위 키 하나를 만들어 서버에 최초 입력 시각을 묶는다.
     사주·이름·번호는 이 키에 담지 않는다. */
  function ensureUid() {
    if (mem.uid) return mem.uid;
    var v = '';
    try { v = localStorage.getItem(UID_KEY) || ''; } catch (e) { v = ''; }
    if (!/^[A-Za-z0-9-]{8,80}$/.test(v)) {
      v = newUid();
      try { localStorage.setItem(UID_KEY, v); } catch (e) { }
    }
    mem.uid = v;
    return v;
  }
  function newUid() {
    try {
      if (window.crypto && crypto.randomUUID) return 'g-' + crypto.randomUUID();
      if (window.crypto && crypto.getRandomValues) {
        var a = new Uint8Array(16);
        crypto.getRandomValues(a);
        var s = '';
        for (var i = 0; i < a.length; i++) s += ('0' + a[i].toString(16)).slice(-2);
        return 'g-' + s;
      }
    } catch (e) { }
    return 'g-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
  }

  function loadFirst() {
    if (mem.first) return mem.first;
    try {
      var o = JSON.parse(localStorage.getItem(FIRST_KEY) || 'null');
      if (o && o.at && o.deadline_ms) mem.first = o;
    } catch (e) { }
    return mem.first;
  }
  function saveFirst(o) {
    mem.first = o;
    try { localStorage.setItem(FIRST_KEY, JSON.stringify(o)); } catch (e) { }
  }
  function closedFlag() {
    try { return localStorage.getItem(CLOSED_KEY) === '1'; } catch (e) { return false; }
  }
  function setClosed(v) {
    try { if (v) localStorage.setItem(CLOSED_KEY, '1'); else localStorage.removeItem(CLOSED_KEY); } catch (e) { }
  }

  /* ── 서버 호출 ─────────────────────────────────────── */
  function rpc(name, body) {
    if (!window.fetch) return Promise.reject(new Error('offline'));
    var ctrl = null, opt = {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SB_KEY,
        'Authorization': 'Bearer ' + SB_KEY
      },
      body: JSON.stringify(body || {})
    };
    try {
      if (window.AbortController) { ctrl = new AbortController(); opt.signal = ctrl.signal; }
    } catch (e) { }
    var timer = ctrl ? setTimeout(function () { try { ctrl.abort(); } catch (e) { } }, 12000) : 0;
    return fetch(SB_URL + '/rest/v1/rpc/' + name, opt).then(function (res) {
      return res.text().then(function (t) {
        if (timer) clearTimeout(timer);
        var d = null;
        try { d = t ? JSON.parse(t) : null; } catch (e) { d = null; }
        if (!res.ok) throw new Error((d && (d.message || d.hint)) || ('HTTP ' + res.status));
        return d || {};
      });
    }, function (err) {
      if (timer) clearTimeout(timer);
      throw err;
    });
  }

  /* ── 최초 사주 입력 시각 — 서버가 기준 ─────────────────
     이 기기에 저장된 값이 있으면 참고값으로 함께 보낸다(오프라인에서 먼저 열었던 경우).
     서버는 미래 시각을 받지 않고, 7일보다 오래된 값도 잘라 낸다. */
  function touchFirst(retry) {
    if (mem.touchBusy) return;
    mem.touchBusy = true;
    var uid = ensureUid();
    var local = loadFirst();
    var body = { p_client_uid: uid };
    if (local && local.at) body.p_client_at = local.at;
    mem.touchTried = true;
    rpc('special_guide_touch', body).then(function (d) {
      mem.touchBusy = false;
      if (!d || !d.ok) return;
      var deadlineMs = Date.now() + Math.max(0, Number(d.remaining_seconds || 0)) * 1000;
      saveFirst({ at: d.first_saju_at, deadline_ms: deadlineMs, source: d.first_source || 'server' });
      refresh();
    }, function () {
      mem.touchBusy = false;
      /* 서버에 닿지 않으면 이 기기에 남은 값으로만 보여 준다. 다음 방문에 다시 시도. */
      if (!local) {
        var d2 = Date.now() + EVENT_HOURS * 3600 * 1000;
        saveFirst({ at: new Date().toISOString(), deadline_ms: d2, source: 'local-offline' });
      }
      if (retry) setTimeout(function () { touchFirst(false); }, 8000);
    });
  }

  /* ── 남은 시간 표기 — 빨간 경고·깜빡임 없이 차분하게 ── */
  function fmtLeft(ms) {
    if (ms <= 0) return '';
    var min = Math.floor(ms / 60000);
    var d = Math.floor(min / 1440);
    var h = Math.floor((min - d * 1440) / 60);
    var m = min - d * 1440 - h * 60;
    if (d > 0) return d + '일 ' + h + '시간 남음';
    if (h > 0) return h + '시간 ' + m + '분 남음';
    return Math.max(1, m) + '분 남음';
  }
  function eventActive() {
    var f = loadFirst();
    return !!(f && f.deadline_ms && Date.now() < f.deadline_ms);
  }

  /* ── 결제 팝업 안 특별 선물 카드 — 붙일 자격이 있을 때만 ────────
     · 아직 결제하지 않은 손님 + 첫 사주 입력 72시간 이내일 때만 그린다.
     · 72시간이 지났거나 이미 결제한 기기, 이벤트 시작 전부터 쓰던 기기에는 아무것도 넣지 않는다.
     · 팝업의 결제 흐름(가격·번호·카드 버튼)은 그대로 두고 한 칸만 보탠다. */
  function offerActive() {
    var c = cal();
    if (!c || !c.res) return false;
    if (mem.preexisting) return false;
    if (paidNow(c)) return false;                 // 이미 1년 패스가 열린 기기
    if (c.unlocked || (c.tier && c.tier !== '')) return false;   // 선물 코드·추천 보상
    if (!eventActive()) return false;             // 72시간 만료
    return true;
  }
  function payGiftHTML() {
    if (!offerActive()) return '';
    return '<div class="shopgift" id="shopGift">' +
      '<p class="shopgift__k">🎁 첫 3일 결제 고객 특별 혜택</p>' +
      '<p class="shopgift__t">윤이세가 직접 전하는 2027년 맞춤 운세 활용 가이드</p>' +
      '<p class="shopgift__d">72시간 이내 결제 시 무료 증정 · 카카오톡 개별 전달</p>' +
      '</div>';
  }

  /* ── 화면 ─────────────────────────────────────────── */
  function cal() {
    return (window.YoonCalendar && window.YoonCalendar.get) ? window.YoonCalendar.get() : null;
  }
  function paidNow(c) {
    return !!(c && c.unlocked && PAID_TIERS[c.tier]);
  }
  function hideAll() {
    var card = $('#specialGift'), foot = $('#specialFoot'), tg = $('#specialGiftToggle');
    if (card) card.hidden = true;
    if (foot) foot.hidden = true;
    if (tg) tg.hidden = true;
    document.body.classList.remove('has-sgift', 'has-sgift-claim');
    ctaSync();
  }

  /* ── 🏷️ 구매 유도 버튼 이름표 (2026-11-24 #18672) ───────────────
     특별 선물 카드 안의 구매 버튼도 달력의 다른 구매 버튼과 같은 문구를 쓴다.
     카드 내용·위치·디자인은 그대로이고, 버튼 이름만 맞춘다.
     카드가 떠고 지는 순간마다 calendar.js 가 버튼 아래 안내 한 줄을 다시 맞추게 한다. */
  function ctaBuy(phase) {
    var c = window.YoonCalendar;
    if (c && typeof c.ctaCopy === 'function') {
      var x = c.ctaCopy(phase);
      if (x && x.buy) return x.buy;
    }
    return '특별 선물과 전체 이용권 보기 →';
  }
  function ctaSync() {
    var c = window.YoonCalendar;
    if (c && typeof c.syncCtaCopy === 'function') { try { c.syncCtaCopy(); } catch (e) { } }
  }

  function refresh() {
    var c = cal();
    if (!c || !c.res) { hideAll(); return; }
    if (mem.preexisting) { hideAll(); return; }
    var first = loadFirst();
    if (!first) { hideAll(); return; }   // 최초 입력 기록은 calendarOpened() 가 맡는다

    /* 유료 고객 — 자격이 확인된 경우에만 신청 화면 */
    if (paidNow(c)) {
      hideOfferOnly();
      if (!mem.claimTried || mem.claimCode !== String(c.code && c.code.code || '')) {
        maybeClaim(c);
        return;
      }
      renderClaim();
      return;
    }

    /* 1개월 선물 코드·추천 보상 등 — 특별 선물 대상 아님 */
    if (c.unlocked || (c.tier && c.tier !== '')) { hideAll(); return; }

    if (!eventActive()) { hideAll(); return; }
    renderOffer();
  }

  function hideOfferOnly() {
    var card = $('#specialGift'), foot = $('#specialFoot'), tg = $('#specialGiftToggle');
    if (card) card.hidden = true;
    if (foot) foot.hidden = true;
    if (tg) tg.hidden = true;
    document.body.classList.remove('has-sgift');
    ctaSync();
  }

  function renderOffer() {
    var card = $('#specialGift'), foot = $('#specialFoot'), tg = $('#specialGiftToggle');
    if (!card || !foot) return;
    document.body.classList.add('has-sgift');
    document.body.classList.remove('has-sgift-claim');
    foot.hidden = false;

    var close = closedFlag();
    card.hidden = close;
    if (tg) tg.hidden = !close;
    var body = $('#specialGiftBody');
    if (body && !body.getAttribute('data-mode-offer')) {
      body.setAttribute('data-mode-offer', '1');
      body.innerHTML = offerHTML();
    }
    paintClock();
    startTick();
    ctaSync();
    /* 사주를 막 넣은 직후 — 카드가 위에 끼어들어 화면 밖으로 밀리지 않게 한 번만 내려 준다 */
    if (mem.scrollNext) {
      mem.scrollNext = false;
      setTimeout(function () {
        if (!card.hidden) { try { card.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { } }
      }, 220);
    }
  }

  function offerHTML() {
    return '<p class="sgift__label">🎁 첫 3일 특별 선물</p>' +
      '<h2 class="sgift__title" id="specialGiftTitle">윤이세가 직접 전하는 2027년 맞춤 운세 활용 가이드</h2>' +
      '<p class="sgift__desc">첫 사주 입력 후 72시간 이내에 14,900원 이용권을 구매하시면, 윤이세가 직접 확인한 나만의 맞춤 운세 활용 가이드를 카카오톡으로 선물해 드립니다.</p>' +
      '<p class="sgift__sub">7일 무료 체험은 그대로 이용할 수 있어요.</p>' +
      '<div class="sgift__clock"><span class="sgift__clock-k">특별 선물까지 남은 시간</span>' +
      '<b class="sgift__clock-v" id="specialGiftLeft">—</b></div>' +
      '<div class="sgift__acts">' +
      '<button type="button" class="sgift__buy" data-shop="pass">' + ctaBuy('gift') + '</button>' +
      '<button type="button" class="sgift__more" id="specialGiftMore">혜택 자세히 보기</button>' +
      '</div>';
  }

  function paintClock() {
    var el = $('#specialGiftLeft');
    if (!el) return;
    var f = loadFirst();
    var txt = f ? fmtLeft(f.deadline_ms - Date.now()) : '';
    if (!txt) { hideAll(); return; }
    el.textContent = txt;
  }

  function startTick() {
    if (mem.tickTimer) return;
    mem.tickTimer = setInterval(function () {
      if (!eventActive()) { stopTick(); refresh(); return; }
      paintClock();
    }, 30000);
  }
  function stopTick() { if (mem.tickTimer) { clearInterval(mem.tickTimer); mem.tickTimer = 0; } }

  /* ── 자격 확인 (유료 코드가 확인된 뒤에만) ───────────── */
  function maybeClaim(c) {
    if (mem.busy) return;
    var code = c.code || {};
    if (!code.code && !code.ymd) { hideAll(); return; }
    mem.busy = true;
    mem.claimTried = true;
    mem.claimCode = String(code.code || '');
    var body = {
      p_client_uid: ensureUid(),
      p_code: code.code || '',
      p_phone: code.phone || null,
      p_ymd: code.ymd || null,
      p_gender: code.gender || null,
      p_saju: buildSnapshot(c.res)
    };
    rpc('claim_or_get_special_guide', body).then(function (d) {
      mem.busy = false;
      mem.claim = d || null;
      try { localStorage.setItem(CLAIM_KEY, JSON.stringify(d || null)); } catch (e) { }
      renderClaim();
    }, function () {
      mem.busy = false;
      mem.claim = null;
      hideAll();
    });
  }

  var STATUS_STEP = { eligible: 0, submitted: 1, awaiting_draft: 2, draft_ready: 2, reviewing: 2, delivered: 3 };
  var STEP_LABEL = ['신청하기', '접수 완료', '준비 중', '전달 완료'];

  function renderClaim() {
    var d = mem.claim;
    var card = $('#specialGift'), foot = $('#specialFoot'), tg = $('#specialGiftToggle');
    if (!card) return;
    if (!d || !d.ok || !d.claim_no || d.status === 'cancelled') {
      /* 확인이 필요한 옛 코드 — 고객 화면에는 아무것도 띄우지 않는다(운영자가 판단). */
      hideAll();
      return;
    }
    if (!d.eligible && d.status !== 'delivered' && d.status !== 'submitted' &&
        d.status !== 'reviewing' && d.status !== 'draft_ready' && d.status !== 'awaiting_draft') {
      hideAll();
      return;
    }

    var delivered = d.status === 'delivered';
    document.body.classList.add('has-sgift-claim');
    document.body.classList.remove('has-sgift');
    if (foot) foot.hidden = true;               // 이미 구매 — 하단 구매 유도 숨김
    var close = closedFlag();
    card.hidden = close;
    if (tg) { tg.hidden = !close; tg.textContent = delivered ? '🎁 전달 완료 보기' : '🎁 특별 선물 신청서 보기'; }

    var body = $('#specialGiftBody');
    if (body) {
      body.setAttribute('data-mode-offer', '');
      var step = STATUS_STEP[d.status] == null ? 0 : STATUS_STEP[d.status];
      body.innerHTML = claimHTML(d, step);
    }
    startPoll(d);
    ctaSync();
  }

  function claimHTML(d, step) {
    var delivered = d.status === 'delivered';
    var applied = !!d.apply_clicked_at;
    var no = d.claim_no || '';
    var steps = STEP_LABEL.map(function (label, i) {
      var cls = i < step ? 'is-done' : (i === step ? 'is-now' : '');
      return '<li class="sgift__step ' + cls + '"><span class="sgift__step-n">' + (i + 1) + '</span>' +
        '<span class="sgift__step-t">' + label + '</span></li>';
    }).join('');

    var head = delivered
      ? '<p class="sgift__label">🎁 첫 3일 특별 선물</p>' +
        '<h2 class="sgift__title" id="specialGiftTitle">전달 완료</h2>' +
        '<p class="sgift__desc">윤이세가 직접 전하는 2027년 맞춤 운세 활용 가이드를 카카오톡으로 보내 드렸습니다.</p>' +
        '<p class="sgift__sub">카카오톡 채널 대화를 확인해 주세요.</p>'
      : (step === 2
        ? '<p class="sgift__label">🎁 첫 3일 특별 선물</p>' +
          '<h2 class="sgift__title" id="specialGiftTitle">가이드를 준비하고 있어요</h2>' +
          '<p class="sgift__desc">윤이세가 사주를 직접 읽고 가이드를 고치는 중입니다.</p>' +
          '<p class="sgift__sub">준비가 끝나면 카카오톡으로 개별 전달해 드립니다.</p>'
        : (step === 1
          ? '<p class="sgift__label">🎁 첫 3일 특별 선물</p>' +
            '<h2 class="sgift__title" id="specialGiftTitle">신청이 접수되었습니다</h2>' +
            '<p class="sgift__desc">윤이세가 신청 내용을 확인하고 있어요.</p>' +
            '<p class="sgift__sub">가이드가 준비되면 카카오톡으로 개별 전달해 드립니다.</p>'
          : '<p class="sgift__label">🎁 첫 3일 특별 선물</p>' +
            '<h2 class="sgift__title" id="specialGiftTitle">특별 선물 대상자로 확인되었습니다!</h2>' +
            '<p class="sgift__desc">윤이세가 직접 전하는 2027년 맞춤 운세 활용 가이드를 신청해 주세요.</p>' +
            '<p class="sgift__sub">신청하신 가이드는 윤이세가 직접 검토한 후 카카오톡으로 개별 전달해 드립니다.</p>'));

    var statusLine = '';
    if (d.status === 'submitted') {
      statusLine = '<p class="sgift__state">신청이 접수되었습니다. 윤이세가 확인하고 있어요.</p>';
    } else if (step === 2) {
      statusLine = '<p class="sgift__state">지금 윤이세가 가이드를 준비하고 있어요. 준비되면 카카오톡으로 보내 드립니다.</p>';
    } else if (delivered) {
      statusLine = '<p class="sgift__state">전달이 끝났어요. 더 궁금한 점은 카카오톡 채널로 남겨 주세요.</p>';
    } else if (applied) {
      statusLine = '<p class="sgift__state">카카오톡으로 신청번호를 보내 주세요. 윤이세가 확인한 뒤 <b>접수 완료</b>로 바뀝니다.</p>';
    }

    var noBox = '<div class="sgift__no"><span>신청번호</span><b id="specialClaimNo">' + esc(no) + '</b>' +
      '<button type="button" class="sgift__copy" id="specialCopyNo">복사</button></div>';

    /* ── 개인정보 동의 — 일반 달력('기기에만 저장')과 별개 단계 ────────
       특별 가이드는 이름·생년월일시·성별·사주 분석 데이터를 서버에 저장하고 운영자가 확인해야 만들 수 있다.
       그 사실을 이 단계에서 따로 동의받고, 동의 시각을 서버에 남긴다(consent_at).
       동의하지 않으면 신청 버튼이 진행되지 않고, 서버도 mark_applied 를 거부한다. */
    var canApplyStep = !delivered && d.status === 'eligible';
    var consented = !!d.consent_at || !!mem.consentChecked;
    var consent = canApplyStep
      ? '<label class="sgift__consent" for="sgiftConsent">' +
        '<input type="checkbox" id="sgiftConsent" data-sgift-consent' + (consented ? ' checked' : '') + '>' +
        '<span class="sgift__consent-t"><b>[필수]</b> 특별 가이드 제작·전달을 위해 이름·생년월일시·성별·사주 분석 데이터를 서버에 저장하고 윤이세 운영자가 확인하는 데 동의합니다</span>' +
        '</label>' +
        (d.consent_at ? '<p class="sgift__consent-n">동의한 시각은 서버에 함께 남습니다.</p>' : '')
      : '';

    var btn = delivered
      ? '<a class="sgift__buy" href="' + KAKAO + '" target="_blank" rel="noopener noreferrer">카카오톡 채널 열기</a>'
      : '<button type="button" class="sgift__buy" id="specialApply"' + (canApplyStep && !consented ? ' disabled' : '') + '>' +
        (applied ? '🎁 카카오톡으로 다시 열기' : '🎁 카카오톡으로 특별 가이드 신청하기') + '</button>';

    var hint = delivered ? '' :
      '<p class="sgift__hint">' + (canApplyStep && !consented
        ? '위 동의에 체크하면 신청할 수 있어요.'
        : (applied
          ? '버튼을 누르면 신청 문구가 다시 복사되고 카카오톡 채널이 열려요. 채팅창에 붙여 넣어 보내 주세요.'
          : '버튼을 누르면 신청 문구가 복사되고 카카오톡 채널이 열려요. 채팅창에 붙여 넣어 보내 주세요.')) + '</p>';

    return head +
      '<ol class="sgift__steps">' + steps + '</ol>' +
      noBox + statusLine + consent + btn + hint;
  }

  function startPoll(d) {
    stopPoll();
    if (!d || d.status === 'delivered' || d.status === 'cancelled') return;
    mem.pollTimer = setInterval(function () {
      if (document.hidden || !mem.claim || !mem.claim.claim_no) return;
      rpc('special_guide_status', { p_client_uid: ensureUid(), p_claim_no: mem.claim.claim_no })
        .then(function (s) {
          if (!s || !s.ok) return;
          mem.claim = Object.assign({}, mem.claim, s);
          renderClaim();
        }, function () { });
    }, 60000);
  }
  function stopPoll() { if (mem.pollTimer) { clearInterval(mem.pollTimer); mem.pollTimer = 0; } }

  function applyClaim() {
    var d = mem.claim;
    var c = cal();
    if (!d || !d.claim_no) return;
    /* 동의 없이는 신청이 진행되지 않는다 — 화면(버튼 비활성)과 서버(mark_applied 거부)가 함께 막는다. */
    if (d.status === 'eligible' && !d.consent_at && !mem.consentChecked) {
      var box = $('#sgiftConsent');
      if (box) { try { box.focus({ preventScroll: true }); } catch (e) { } }
      if (window.YoonCalendar && window.YoonCalendar.toast) {
        window.YoonCalendar.toast('아래 동의에 체크해야 신청할 수 있어요');
      }
      return;
    }
    var code = (c && c.code) || {};
    var msg = [
      '[윤이세 특별 가이드 신청]',
      '2027년 맞춤 운세 활용 가이드 신청합니다.',
      '신청번호: ' + d.claim_no,
      '결제 확인 정보: ' + (code.phone ? maskPhone(code.phone) : '휴대폰 번호 확인 완료') + ' / 1년 전체 패스',
      '궁금한 점 또는 요청사항(선택): '
    ].join('\n');

    var go = function (ok) {
      if (!ok && window.YoonCalendar && window.YoonCalendar.toast) {
        window.YoonCalendar.toast('복사가 막혀 있어요 — 신청번호를 길게 눌러 직접 복사해 주세요');
      }
      if (window.YoonCalendar && window.YoonCalendar.openNoRef) window.YoonCalendar.openNoRef(KAKAO);
      else window.open(KAKAO, '_blank', 'noopener');
    };

    var mark = function () {
      rpc('special_guide_mark_applied', { p_client_uid: ensureUid(), p_claim_no: d.claim_no })
        .then(function (r) {
          if (r && r.apply_clicked_at) {
            mem.claim.apply_clicked_at = r.apply_clicked_at;
          }
          if (window.YoonCalendar && window.YoonCalendar.copyText) {
            window.YoonCalendar.copyText(msg, go);
          } else {
            try { navigator.clipboard.writeText(msg).then(function () { go(true); }, function () { go(false); }); }
            catch (e) { go(false); }
          }
          renderClaim();
        }, function () {
          if (window.YoonCalendar && window.YoonCalendar.copyText) window.YoonCalendar.copyText(msg, go);
          else go(false);
        });
    };

    /* 동의 시각을 먼저 남기고 → 신청 표시 → 카톡 열기. 동의 기록이 실패하면 카톡을 열지 않는다. */
    if (d.status === 'eligible' && !d.consent_at) {
      rpc('special_guide_consent', { p_client_uid: ensureUid(), p_claim_no: d.claim_no, p_consent: true })
        .then(function (r) {
          if (!r || !r.ok || !r.consent_at) {
            if (window.YoonCalendar && window.YoonCalendar.toast) window.YoonCalendar.toast('동의 기록을 남기지 못했어요 — 잠시 뒤 다시 눌러 주세요');
            return;
          }
          mem.claim.consent_at = r.consent_at;
          mark();
        }, function () {
          if (window.YoonCalendar && window.YoonCalendar.toast) window.YoonCalendar.toast('연결을 확인한 뒤 다시 눌러 주세요');
        });
      return;
    }
    mark();
  }

  function maskPhone(d) {
    var f = String(d || '').replace(/[^0-9]/g, '');
    if (f.length < 8) return '휴대폰 번호 확인 완료';
    return f.slice(0, 3) + '-****-' + f.slice(-4);
  }

  /* ── 혜택 자세히 보기 팝업 ───────────────────────────── */
  var GUIDE_FIVE = [
    ['2027년 가장 집중해야 할 인생 영역', '한 해의 힘을 어디에 몰아야 남는지 한 곳으로 짚어 드립니다.'],
    ['나에게 기회가 되는 상황과 활용 방법', '어떤 순간이 기회이고, 그때 어떻게 움직이면 좋은지 알려 드립니다.'],
    ['반복적으로 주의해야 할 나의 행동 패턴', '좋은 흐름을 스스로 끊어 왔던 습관을 짚어 드립니다.'],
    ['2027년을 위한 실천 조언 3가지', '생활에서 바로 해 볼 수 있는 세 가지로 마무리합니다.'],
    ['윤이세가 전하는 개인 맞춤 응원 메시지', '사주를 읽은 사람으로서 꼭 전하고 싶은 한 마디를 담습니다.']
  ];

  function openModal() {
    var m = $('#specialModal');
    if (!m) return;
    var body = $('#specialModalBody');
    if (body && !body.innerHTML.trim()) {
      body.innerHTML =
        '<p class="sgiftm__eyebrow">GIFT · FIRST 3 DAYS</p>' +
        '<h2 class="sgiftm__title" id="specialModalTitle">윤이세가 직접 전하는<br><em>2027년 맞춤 운세 활용 가이드</em></h2>' +
        '<p class="sgiftm__sub">첫 사주 입력 후 72시간 이내에 14,900원 이용권을 구매하신 분께, 다섯 가지로 정리한 맞춤 가이드를 카카오톡으로 보내 드립니다.</p>' +
        '<ol class="sgiftm__list">' + GUIDE_FIVE.map(function (x, i) {
          return '<li><span class="sgiftm__n">' + (i + 1) + '</span><span class="sgiftm__b"><b>' + x[0] + '</b><span>' + x[1] + '</span></span></li>';
        }).join('') + '</ol>' +
        '<p class="sgiftm__how"><b>이렇게 전해 드려요</b><span>사주 계산 자료를 바탕으로 초안을 만들고, 윤이세가 직접 읽고 고친 뒤 카카오톡으로 개별 전달합니다. 정해진 미래를 말하는 글이 아니라, 2027년의 흐름을 조금 더 편하게 타기 위한 참고입니다.</span></p>' +
        '<button type="button" class="sgift__buy" id="specialModalBuy">' + ctaBuy('gift') + '</button>' +
        '<p class="sgiftm__note">7일 무료 체험은 그대로 이용할 수 있어요.</p>';
    }
    m.hidden = false;
    mem.modalOpen = true;
    document.body.classList.add('is-sgift-modal');
    try { $('#specialModalDialog').focus({ preventScroll: true }); } catch (e) { }
  }
  function closeModal() {
    var m = $('#specialModal');
    if (!m || m.hidden) return;
    m.hidden = true;
    mem.modalOpen = false;
    document.body.classList.remove('is-sgift-modal');
  }

  /* ── 사주 스냅샷 — 실제 만세력 값만 담는다 ──────────────
     서버 DB(saju_snapshot)에 저장되어 운영자 초안 생성에 쓰인다.
     생년월일시 원문은 넣지 않고, 계산된 여덟 글자·오행·십성·대운·세운만 담는다. */
  function buildSnapshot(res) {
    try {
      var M = window.Manse;
      if (!M || !res || !res.pillars) return null;
      var p = res.pillars, d = p.day;
      var dayGan = d.ganIndex;

      function pil(x) {
        if (!x) return null;
        return {
          gan: x.gan, zhi: x.zhi, gan_el: M.GAN_EL[x.ganIndex], zhi_el: M.ZHI_EL[x.zhiIndex],
          ten_gan: M.tenGodOf(dayGan, x.ganIndex), ten_zhi: M.tenGodOf(dayGan, M.GAN.indexOf(M.HIDDEN[x.zhi][0]))
        };
      }

      /* 대운 — 월주에서 순행/역행. 3일=1년 근사로 시작 나이를 잡는다(참고용). */
      var daeun = null;
      try {
        var yangYear = p.year.ganIndex % 2 === 0;
        var male = res.input && res.input.gender === 'M';
        var forward = (yangYear && male) || (!yangYear && !male);
        var mIdx = 0;
        for (var i = 0; i < 60; i++) if (M.ganZhiOf(i).text === p.month.text) { mIdx = i; break; }
        var birth = Date.parse(String(res.apply && res.apply.correctedText || '').replace(/\./g, '-').replace(' ', 'T') + ':00+09:00');
        var jieAt = forward ? (res.jieqi && res.jieqi.next && res.jieqi.next.at)
                            : (res.jieqi && res.jieqi.prev && res.jieqi.prev.at);
        var jie = jieAt ? Date.parse(String(jieAt).replace(/\./g, '-').replace(' ', 'T') + ':00+09:00') : NaN;
        var startAge = 1;
        if (!isNaN(birth) && !isNaN(jie)) startAge = Math.max(1, Math.round(Math.abs(jie - birth) / 86400000 / 3));
        var list = [];
        for (var k = 1; k <= 8; k++) {
          var gz = M.ganZhiOf(((mIdx + (forward ? k : -k)) % 60 + 60) % 60);
          list.push({
            age: startAge + (k - 1) * 10,
            gan: gz.gan, zhi: gz.zhi,
            ten: M.tenGodOf(dayGan, gz.ganIndex)
          });
        }
        daeun = { direction: forward ? '순행' : '역행', start_age: startAge, list: list };
      } catch (e) { daeun = null; }

      /* 2027 세운 + 달 흐름 */
      var seun = null, months = [];
      try {
        var y2027 = 2023 % 60;                    // 2027 - 4 = 2023 → 丁未
        var sgz = M.ganZhiOf(y2027);
        seun = {
          year: 2027, gan: sgz.gan, zhi: sgz.zhi,
          ten: M.tenGodOf(dayGan, sgz.ganIndex),
          gan_el: M.GAN_EL[sgz.ganIndex], zhi_el: M.ZHI_EL[sgz.zhiIndex],
          chung_day: (sgz.zhiIndex + 6) % 12 === d.zhiIndex,
          hap_day: yukhap(sgz.zhiIndex) === d.zhiIndex,
          hyeong_day: hyeongPair(sgz.zhiIndex, d.zhiIndex)
        };
        for (var mk = 0; mk < 12; mk++) {
          var mi = (y2027 * 12 + (2 + mk)) % 60;   // 寅월부터
          var mgz = M.ganZhiOf(mi);
          var mz = mgz.zhiIndex;                   // 寅=2월 … 亥=11월 · 子=12월 · 丑=1월
          var monthNo = mz === 0 ? 12 : (mz === 1 ? 1 : mz);
          months.push({
            month: monthNo,
            gan: mgz.gan, zhi: mgz.zhi,
            ten: M.tenGodOf(dayGan, mgz.ganIndex),
            chung_day: (mgz.zhiIndex + 6) % 12 === d.zhiIndex,
            hap_day: yukhap(mgz.zhiIndex) === d.zhiIndex
          });
        }
      } catch (e) { }

      var groups = { '비겁': 0, '식상': 0, '재성': 0, '관성': 0, '인성': 0 };
      var groupOf = function (t) {
        if (!t) return '';
        if (/비견|겁재/.test(t)) return '비겁';
        if (/식신|상관/.test(t)) return '식상';
        if (/편재|정재/.test(t)) return '재성';
        if (/편관|정관/.test(t)) return '관성';
        if (/편인|정인|인성/.test(t)) return '인성';
        return '';
      };
      var tenList = [];
      ['year', 'month', 'day', 'time'].forEach(function (k) {
        var x = pil(p[k]);
        if (!x) return;
        tenList.push({ pos: k, gan: x.gan, zhi: x.zhi, ten_gan: x.ten_gan, ten_zhi: x.ten_zhi });
        groups[groupOf(x.ten_gan)] = (groups[groupOf(x.ten_gan)] || 0) + 1;
        groups[groupOf(x.ten_zhi)] = (groups[groupOf(x.ten_zhi)] || 0) + 1;
      });

      var counts = res.counts || {};
      var sorted = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });

      return {
        v: 1,
        built_at: new Date().toISOString(),
        name: (res.input && res.input.name) || '',
        gender: res.input && res.input.gender === 'M' ? '남' : '여',
        time_known: !!(res.input && res.input.timeKnown),
        solar: { y: res.solar.y, m: res.solar.m, d: res.solar.d },
        pillars: { year: pil(p.year), month: pil(p.month), day: pil(p.day), time: pil(p.time) },
        day_master: { gan: d.gan, gan_ko: M.GAN_KO[d.ganIndex], element: M.GAN_EL[d.ganIndex], hun: M.GAN_HUN[d.ganIndex] },
        counts: counts,
        percents: res.percents || {},
        strongest: sorted.slice(0, 2),
        weakest: sorted.slice(-2).reverse(),
        ten_gods: tenList,
        ten_groups: groups,
        daeun: daeun,
        seun: seun,
        months: months,
        jieqi: res.jieqi ? { prev: res.jieqi.prev, next: res.jieqi.next } : null
      };
    } catch (e) {
      return null;
    }
  }
  function yukhap(i) {
    var m = { 0: 1, 1: 0, 2: 11, 11: 2, 3: 10, 10: 3, 4: 9, 9: 4, 5: 8, 8: 5, 6: 7, 7: 6 };
    return m[i];
  }
  function hyeongPair(a, b) {
    /* 丑戌未 · 寅巳申 · 子卯 형 — 방향은 상관없이 짝만 본다 */
    var g = [
      [1, 10], [10, 1], [7, 10], [10, 7], [1, 7], [7, 1],
      [2, 5], [5, 2], [2, 8], [8, 2], [5, 8], [8, 5],
      [0, 3], [3, 0]
    ];
    for (var i = 0; i < g.length; i++) if (g[i][0] === a && g[i][1] === b) return true;
    return false;
  }

  /* ── 이벤트 연결 ───────────────────────────────────── */
  function bind() {
    document.addEventListener('click', function (e) {
      if (!e.target.closest) return;
      var x = e.target.closest('#specialGiftX');
      if (x) {
        e.preventDefault();
        setClosed(true);
        refresh();
        return;
      }
      var tg = e.target.closest('#specialGiftToggle');
      if (tg) {
        e.preventDefault();
        setClosed(false);
        refresh();
        return;
      }
      var more = e.target.closest('#specialGiftMore');
      if (more) { e.preventDefault(); openModal(); return; }
      var ap = e.target.closest('#specialApply');
      if (ap) { e.preventDefault(); applyClaim(); return; }
      var cp = e.target.closest('#specialCopyNo');
      if (cp) {
        e.preventDefault();
        var no = mem.claim && mem.claim.claim_no || '';
        if (!no) return;
        var done = function (ok) {
          if (window.YoonCalendar && window.YoonCalendar.toast) {
            window.YoonCalendar.toast(ok === true ? '📋 신청번호를 복사했어요' : '복사가 막혀 있어요 — 길게 눌러 직접 복사해 주세요');
          }
        };
        if (window.YoonCalendar && window.YoonCalendar.copyText) window.YoonCalendar.copyText(no, done);
        return;
      }
      var mc = e.target.closest('#specialModal [data-sgift-close]');
      if (mc) { e.preventDefault(); closeModal(); return; }
      var mb = e.target.closest('#specialModalBuy');
      if (mb) {
        e.preventDefault();
        closeModal();
        if (window.YoonCalendar && window.YoonCalendar.openShop) window.YoonCalendar.openShop('pass');
        return;
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && mem.modalOpen) { e.preventDefault(); closeModal(); }
    });
    /* [필수] 동의 체크 — 누를 때마다 신청 버튼과 안내 문구가 바뀐다 */
    document.addEventListener('change', function (e) {
      if (!e.target || e.target.id !== 'sgiftConsent') return;
      mem.consentChecked = !!e.target.checked;
      var b = $('#specialApply');
      if (b) {
        if (mem.consentChecked || (mem.claim && mem.claim.consent_at)) b.removeAttribute('disabled');
        else b.setAttribute('disabled', '');
      }
      var h = $('#specialGift .sgift__hint');
      if (h) {
        h.textContent = mem.consentChecked
          ? '버튼을 누르면 신청 문구가 복사되고 카카오톡 채널이 열려요. 채팅창에 붙여 넣어 보내 주세요.'
          : '위 동의에 체크하면 신청할 수 있어요.';
      }
    });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && mem.claim && mem.claim.claim_no) refresh();
    });
  }

  function calendarOpened(opts) {
    ensureUid();
    if (!loadFirst()) {
      /* 이미 사주를 쓰던 기기(이벤트 시작 전 저장) — 소급 적용하지 않고 안내도 띄우지 않는다. */
      var savedAt = opts && opts.savedAt ? Date.parse(opts.savedAt) : NaN;
      if (!isNaN(savedAt) && savedAt < EVENT_START_MS) {
        mem.preexisting = true;
        refresh();
        return;
      }
      if (!opts) mem.scrollNext = true;   // 이 화면에서 사주를 막 넣은 경우
      touchFirst(true);
    } else if (!mem.touchTried) {
      touchFirst(true);   // 방문할 때마다 서버 기준으로 남은 시간을 새로 받는다
    }
    refresh();
  }

  window.SpecialGuide = {
    calendarOpened: calendarOpened,
    refresh: refresh,
    buildSnapshot: buildSnapshot,
    uid: ensureUid,
    offerActive: offerActive,
    payGiftHTML: payGiftHTML,
    /* 🏷️ 구매 유도 단계 — 'gift' = 첫 사주 입력 후 72시간 이내·미결제 (달력 버튼 이름표가 이 값을 먼저 본다) */
    ctaPhase: function () { return offerActive() ? 'gift' : ''; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();

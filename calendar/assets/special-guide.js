/* ==========================================================
   🎁 첫 3일 결제 고객 특별 선물 — 화면 로직 (2026-11-24)
   · 이벤트: 첫 3일 결제 고객 특별 선물
   · 혜택: 윤이세가 직접 전하는 2027년 맞춤 운세 활용 가이드
   · 최초 사주 입력 시각은 서버(client_uid)가 남긴다 — 이 파일은 그 값을 받아 보여 준다.
   · 배너는 두 곳만: ① 달력 맨 위 카드 ② 맨 아래 '1년 전체 바로 열기' 버튼 위.
     달력 중간(#passBar 주변)에는 아무것도 넣지 않는다.
   · 신청 버튼을 누르면 화면 안에서 '접수 완료'로 끝난다 — 카카오톡 채널로 자동 이동하지 않는다.
     (2026-11-28 — 카톡 빈 창으로 튕겨 나가던 흐름을 없앴다. 서버 상태값·운영자 확인 절차는 그대로다.)
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
  /* 도착 안내를 '본' 감정서 — 신청번호를 남긴다. 앱을 다시 열어도 큰 도착 카드가
     또 뜨지 않고, '나의 2027년 맞춤 감정서' 보관 버튼으로만 남는다 (2026-11-26 #21986).
     새 감정서(다른 신청번호)가 오면 그때는 다시 도착 카드가 뜬다. */
  var SEEN_KEY = 'yoonise.specialGuide.seen.v1';

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
    payTick: 0,
    modalOpen: false,
    guideOpen: false,        // 도착한 가이드 팝업이 열려 있는지
    guideSeq: 0,             // 페이지를 그리는 순서 — 늦게 온 그림이 덮어쓰지 않게
    openAfterClaim: false,   // 보관 버튼을 눌렀는데 아직 신청 정보를 못 받아 온 경우
    consentChecked: false,   // 동의 체크 상태 — 다시 그려도 체크가 풀리지 않게 기억
    longTermChecked: false   // [선택] 장기 보관 동의 체크 상태 (2026-11-26)
  };

  function toast(t) {
    if (window.YoonCalendar && window.YoonCalendar.toast) { try { window.YoonCalendar.toast(t); return; } catch (e) { } }
  }

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
    paintPayCmp();      // 결제 팝업이 열려 있으면 남은 시간을 바로 채운다
  }
  function closedFlag() {
    try { return localStorage.getItem(CLOSED_KEY) === '1'; } catch (e) { return false; }
  }
  function setClosed(v) {
    try { if (v) localStorage.setItem(CLOSED_KEY, '1'); else localStorage.removeItem(CLOSED_KEY); } catch (e) { }
  }
  function seenNo() {
    try { return localStorage.getItem(SEEN_KEY) || ''; } catch (e) { return ''; }
  }
  function markSeen(no) {
    if (!no) return;
    try { localStorage.setItem(SEEN_KEY, String(no)); } catch (e) { }
  }
  function isSeen(d) { return !!(d && d.claim_no && seenNo() === String(d.claim_no)); }
  /** 이 감정서의 도착 안내를 이미 접었는가 — 접었다는 표시도 그 신청번호에만 적용한다.
      (새 감정서가 오면 다시 한 번 도착 카드로 알린다) */
  function isDismissed(d) {
    if (!d || !d.claim_no) return closedFlag();
    return isSeen(d) || (closedFlag() && seenNo() === String(d.claim_no));
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
    /* 무료 이용권·친구 초대 보상으로 달력이 열려 있어도 72시간 안이라면 특별 선물 안내를 막지 않는다.
       (2026-11-27 #24504 — 배너를 숨기는 기준은 '유효한 유료 결제 고객' 하나뿐) */
    if (c.expired) return false;                  // 이용권 기간이 끝난 기기 — 종료된 혜택은 다시 열지 않는다
    if (!eventActive()) return false;             // 72시간 만료
    return true;
  }
  function payGiftHTML() {
    if (!offerActive()) return '';
    return '<div class="shopgift" id="shopGift">' +
      '<span class="shopgift__pill">72시간 한정 · 무료 증정</span>' +
      '<p class="shopgift__k">🎁 첫 3일 결제 고객 특별 혜택</p>' +
      '<p class="shopgift__t">윤이세가 직접 전하는 2027년 맞춤 운세 활용 가이드</p>' +
      '<p class="shopgift__d">결제하시면 1년 달력이 바로 열려요. 72시간 맞춤 운세 가이드는 결제 후 화면에서 한 번 동의해 주시면 카카오톡으로 보내드려요. (동의하지 않아도 이용에는 아무 영향이 없어요.)</p>' +
      '</div>';
  }

  /* ── 결제 팝업 2단 비교 — 왼쪽 '첫 3일(72시간) 이내' 칸 (2026-11-26 윤희 님) ───
     결제 팝업은 이제 두 칸(이내 / 경과 후)을 나란히 보여 준다. 값은 둘 다 14,900원이고,
     다른 점은 하나 — 3일 안에 결제하면 맞춤 운세 활용 가이드가 함께 간다.
     · 남은 시간은 이 파일이 가진 72시간 기록(loadFirst)에서 그대로 가져와 20초마다 고친다.
       (서버가 기준이다 — touchFirst 가 받아 둔 deadline_ms)
     · 72시간이 지났거나 대상이 아닌 기기는 칸을 지우지 않고 담담하게 '종료'로 바꿔 둔다.
       오른쪽 칸과 나란히 남아 '그래도 지금 사면 된다'가 한눈에 보이게.
     · 서버 응답 전(기록 없음)에는 '—' 만 두고, 응답이 오면 saveFirst → paintPayCmp 가 바로 채운다. */
  function payCmpState() {
    if (mem.preexisting) return 'over';
    var c = cal();
    if (c && paidNow(c)) return 'over';       // 이미 1년 패스가 열린 기기
    var f = loadFirst();
    if (!f || !f.deadline_ms) return 'wait';
    return (f.deadline_ms - Date.now()) > 0 ? 'live' : 'over';
  }
  /** 1일 08시간 25분 — 두 자리로 맞춰 읽기 쉽게 (남은 시간이 없으면 빈 문자열) */
  function fmtCmp(ms) {
    if (!(ms > 0)) return '';
    var min = Math.max(1, Math.round(ms / 60000));
    var d = Math.floor(min / 1440), h = Math.floor((min - d * 1440) / 60), m = min - d * 1440 - h * 60;
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    if (d > 0) return d + '일 ' + p(h) + '시간 ' + p(m) + '분';
    if (h > 0) return h + '시간 ' + p(m) + '분';
    return m + '분';
  }
  /* 2026-11-28 윤희 님 — "전이면 감정서 준다는것을 강조해야겠지".
     · 이름은 앱의 다른 화면(전달·보관 버튼)이 이미 쓰는 '감정서'로 맞췄다.
     · 남은 시간 위에 '종료까지', 그 아래에 감정서 이름을 두 줄로 크게 — 칸에서 제일 먼저 눈에 들어오게. */
  var PAYCMP_T = '🎁 윤이세 2027 맞춤 감정서 <b>무료 증정</b>';
  var PAYCMP_OVER_T = '지난 혜택이에요 — 지금 결제해도 1년 전체는 그대로 열려요';
  function payCmpHTML() {
    var st = payCmpState(), over = st === 'over';
    var f = loadFirst();
    payCmpStart();
    return '<div class="paycmp__gift' + (over ? ' is-over' : '') + '" id="payCmpGift">' +
      '<p class="paycmp__gift-k" id="payCmpK">' + (over ? '특별 혜택 종료' : '특별 혜택 종료까지') + '</p>' +
      '<p class="paycmp__gift-clock" id="payCmpLeft">' +
      (st === 'live' && f ? fmtCmp(f.deadline_ms - Date.now()) : (over ? '종료' : '—')) + '</p>' +
      '<span class="paycmp__gift-rule" aria-hidden="true"></span>' +
      '<p class="paycmp__gift-t" id="payCmpT">' + (over ? PAYCMP_OVER_T : PAYCMP_T) + '</p>' +
      (over ? '' : '<p class="paycmp__gift-d">결제 후 신청 한 번이면 카카오톡으로 보내드려요</p>') +
      '</div>';
  }
  /** 이 칸 하나만 다시 칠한다 — 20초마다, 그리고 72시간 기록이 새로 들어올 때(saveFirst) */
  function paintPayCmp() {
    var el = $('#payCmpLeft');
    if (!el) { stopPayCmp(); return; }
    var st = payCmpState(), over = st === 'over';
    var gift = $('#payCmpGift');
    if (gift) {
      if (over) gift.classList.add('is-over'); else gift.classList.remove('is-over');
      var col = gift.parentNode;   // 왼쪽 칸(.paycmp__col--now)도 같이 담담해진다
      if (col && col.classList) { if (over) col.classList.add('is-over'); else col.classList.remove('is-over'); }
    }
    var k = $('#payCmpK'); if (k) k.textContent = over ? '특별 혜택 종료' : '특별 혜택 종료까지';
    var t = $('#payCmpT');
    if (t) { if (over) t.textContent = PAYCMP_OVER_T; else t.innerHTML = PAYCMP_T; }
    if (over) el.textContent = '종료';
    else if (st === 'live') el.textContent = fmtCmp(loadFirst().deadline_ms - Date.now());
    else el.textContent = '—';
    if (over) stopPayCmp();
  }
  function payCmpStart() {
    if (mem.payTick) return;
    mem.payTick = setInterval(paintPayCmp, 20000);
  }
  function stopPayCmp() { if (mem.payTick) { clearInterval(mem.payTick); mem.payTick = 0; } }

  /* ── 화면 ─────────────────────────────────────────── */
  function cal() {
    return (window.YoonCalendar && window.YoonCalendar.get) ? window.YoonCalendar.get() : null;
  }
  function paidNow(c) {
    return !!(c && c.unlocked && PAID_TIERS[c.tier]);
  }
  function hideAll() {
    var card = $('#specialGift'), foot = $('#specialFoot');
    if (card) card.hidden = true;
    if (foot) foot.hidden = true;
    showToggle(null);
    document.body.classList.remove('has-sgift', 'has-sgift-claim');
    syncArchive();
    ctaSync();
  }

  /* ── 무료 이용법 배너 바로 위 한 칸의 모습 (2026-11-26 #22789) ──────────────
     mode = 'gift'  ① 72시간 이내 미결제 → 샴페인 골드 카드(누르면 위 특별 선물 카드가 펼쳐진다)
     mode = 'pass'  ② 72시간 경과·이용권 만료 → 작은 이용권 안내(누르면 기존 이용권·결제 화면)
     mode = null    ③ 결제·유효 이용권 보유 → 칸 자체를 숨긴다
     사용자가 카드를 '열어 둔' 동안에는 이 칸이 보이지 않는다(기존과 같은 자리 규칙). */
  function showToggle(mode, label) {
    var tg = $('#specialGiftToggle');
    if (!tg) return;
    tg.classList.toggle('is-pass', mode === 'pass');
    tg.classList.toggle('is-claim', mode === 'claim');
    if (mode === 'claim') {
      var lab = $('#specialGiftToggleLabel');
      if (lab) lab.textContent = label || '특별 선물 신청서 보기';
    }
    tg.hidden = !mode;
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
    refreshCore();
    syncArchive();
  }

  /* 도착 안내를 닫았거나 이미 열어 본 감정서 — 2027 카드 아래 보관 버튼으로만 남긴다.
     실제 감정서(승인된 본문)를 받은 고객에게만 보인다.
     2026-11-28 윤희 님 — 위쪽 한 줄 버튼(🎁 나의 2027 맞춤 감정서 보기)이 계속 서 있어
     같은 감정서를 두 번 보여 주던 중복을 없앤다. 위 버튼이 없는 예외에만 보관 버튼을 남긴다. */
  function syncArchive() {
    var el = $('#sgArchive');
    if (!el) return;
    var tg = $('#specialGiftToggle');
    var topShown = !!(tg && !tg.hidden);          // 위쪽 한 줄 버튼이 서 있으면 아래 보관 버튼은 접는다
    var d = mem.claim || cachedClaim();
    if (topShown || (!guideOf(d) && !guideOf(cachedClaim()))) { el.hidden = true; return; }
    var gone = isDismissed(d) || (cachedClaim() && isDismissed(cachedClaim()));
    el.hidden = !gone;
  }

  function refreshCore() {
    var c = cal();
    if (!c || !c.res) { hideAll(); return; }
    /* 이벤트 시작(2026-11-24 09:00) 전부터 쓰던 기기 — 72시간 선물 대상은 아니지만,
       유효한 유료 결제 고객이 아니라면 무료 이용법 배너 위의 작은 이용권 안내 한 칸은 남긴다.
       (2026-11-26 #23653 → 2026-11-27 #24504 — 무료 이용권·친구 초대 보상 기기도 함께 노출) */
    if (mem.preexisting) {
      if (!paidNow(c)) { renderPassBar(); return; }
      hideAll(); return;
    }
    var first = loadFirst();
    /* 승인된 가이드가 이미 있으면 72시간 기록이 지워져 있어도 계속 보여 준다(며칠 뒤 재방문) */
    if (!first && !guideOf(mem.claim) && !guideOf(cachedClaim())) { hideAll(); return; }   // 최초 입력 기록은 calendarOpened() 가 맡는다

    /* 유료 고객 — 자격이 확인된 경우에만 신청 화면 */
    if (paidNow(c)) {
      hideOfferOnly();
      /* 지난번에 받아 둔 승인 가이드가 있으면 서버 응답을 기다리지 않고 먼저 띄운다 */
      if (!mem.claim) {
        var cc = cachedClaim();
        if (cc && guideOf(cc)) { mem.claim = cc; renderClaim(); }
      }
      if (!mem.claimTried || mem.claimCode !== String(c.code && c.code.code || '')) {
        maybeClaim(c);
        return;
      }
      renderClaim();
      return;
    }

    /* 여기까지 왔다면 아직 유효한 유료 결제 고객이 아니다 — 무료 이용권·친구 초대 보상 기기도
       결제 유도 배너를 숨기지 않는다 (2026-11-27 #24504). 무료 이용 기간과 혜택은 그대로다. */

    /* 이용권 기간이 끝나 다시 잠긴 기기 — 첫 3일 선물 대신 이용권 안내 (종료된 혜택은 다시 열지 않는다) */
    if (c.expired) { renderPassBar(); return; }

    /* 72시간이 지난 기기 — 작은 이용권 안내 한 칸 */
    if (!eventActive()) { renderPassBar(); return; }

    /* 72시간 이내 미결제 — 기존 72시간 특별 혜택 카드 그대로 */
    renderOffer();
  }

  /* 친구 초대 보상 기간이 살아 있는가 — calendar.js bonusActive() 와 같은 판단을 받아 온다.
     2026-11-27 #24504 부터는 이 값으로 배너를 숨기지 않는다(유료 결제 고객만 숨김). 화면·다른 판단용으로 남겨 둔다. */
  function bonusOn(c) {
    if (c && typeof c.bonus === 'boolean') return c.bonus;
    return false;
  }

  /* ② 72시간 경과 · 이용권 만료 — 납색·금색 카드 대신 한 줄 안내 (2026-11-26 #22789) */
  function renderPassBar() {
    var card = $('#specialGift'), foot = $('#specialFoot');
    if (card) card.hidden = true;
    if (foot) foot.hidden = true;
    document.body.classList.remove('has-sgift', 'has-sgift-claim');
    showToggle('pass');
    syncArchive();
    ctaSync();
  }

  function hideOfferOnly() {
    var card = $('#specialGift'), foot = $('#specialFoot');
    if (card) card.hidden = true;
    if (foot) foot.hidden = true;
    showToggle(null);
    document.body.classList.remove('has-sgift');
    ctaSync();
  }

  function renderOffer() {
    var card = $('#specialGift'), foot = $('#specialFoot');
    if (!card || !foot) return;
    document.body.classList.add('has-sgift');
    document.body.classList.remove('has-sgift-claim');
    foot.hidden = false;

    var close = closedFlag();
    card.hidden = close;
    showToggle(close ? 'gift' : null);
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
    return '<p class="sgift__label">🎁 첫 3일(72시간) 특별 선물</p>' +
      '<h2 class="sgift__title" id="specialGiftTitle">윤이세가 직접 전하는 2027년 맞춤 운세 활용 가이드</h2>' +
      '<p class="sgift__desc">첫 사주 입력 후 3일(72시간) 이내에 이용권을 구매하시면, 윤이세가 직접 확인한 나만의 맞춤 운세 활용 가이드를 카카오톡으로 선물해 드립니다.</p>' +
      '<p class="sgift__sub">7일 무료 체험은 그대로 이용할 수 있어요.</p>' +
      '<div class="sgift__clock"><span class="sgift__clock-k">특별 선물까지 남은 시간</span>' +
      '<b class="sgift__clock-v" id="specialGiftLeft">—</b></div>' +
      '<div class="sgift__acts">' +
      '<button type="button" class="sgift__buy" data-shop="pass">' + ctaBuy('gift') + '</button>' +
      '<button type="button" class="sgift__more" id="specialGiftMore">혜택 자세히 보기</button>' +
      '</div>' +
      /* 72시간 안에 결제를 보고 싶은 분 — 같은 혜택 안내 안의 작은 보조 선택지.
         새 팝업 없이 기존 결제 설명창(shopModal · 1년 전체 패스)을 먼저 연다 (2026-11-24y #18925).
         이용권 금액은 이 카드에 적지 않고, 결제 설명창 안에서만 보여 준다. */
      quickBuyHTML();
  }

  /* 72시간 안에 결제 안내를 여는 작은 길 — 혜택 카드 안에만 둔다 (#18832 → #18925) */
  function quickBuyHTML() {
    return '<button type="button" class="sgift__quick" data-shop="pass">' +
      '1년 전체 이용권 보기 <span aria-hidden="true">→</span></button>';
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
      p_gender: code.gender || null
    };
    /* 사주 스냅샷은 여기서 보내지 않는다 — 고객이 동의한 뒤(special_guide_saju)에만 서버에 저장된다. */
    rpc('claim_or_get_special_guide', body).then(function (d) {
      mem.busy = false;
      mem.claim = d || null;
      try { localStorage.setItem(CLAIM_KEY, JSON.stringify(d || null)); } catch (e) { }
      /* 동의는 이미 있는데 사주가 아직 없으면(옛 화면에서 동의한 건·전송 실패) 이 기기 사주로 채운다 */
      if (d && d.ok && d.claim_no && d.consent_at) fillSaju(d);
      renderClaim();
    }, function () {
      mem.busy = false;
      mem.claim = null;
      hideAll();
    });
  }

  /* ── 승인된 가이드 (2026-11-25 #21065) ──────────────────
     윤이세가 /yoon-key/ 에서 '승인'을 누른 건은 고객 달력 앱에서 바로 열린다.
     · 조건: approved_at 이 있고 취소가 아니며 서버가 본문(guide_text)을 내려 준 경우.
     · 한 번 보고 닫아도 사라지지 않는다 — 카드가 접혀도 아래 '다시 열기' 버튼으로
       언제든(며칠 뒤 다시 들어와도) 같은 본문과 직인을 다시 볼 수 있다.
     · 서버가 응답하기 전에도, 지난번에 받아 둔 본문이 있으면 바로 띄운다(기기에 캐시). */
  function guideOf(d) {
    if (!d || !d.approved_at || d.status === 'cancelled') return '';
    return String(d.guide_text || '').trim();
  }
  function cachedClaim() {
    try {
      var o = JSON.parse(localStorage.getItem(CLAIM_KEY) || 'null');
      return (o && o.ok && o.claim_no) ? o : null;
    } catch (e) { return null; }
  }
  function fmtDay(iso) {
    if (!iso) return '';
    var t = Date.parse(iso);
    if (isNaN(t)) return '';
    var p = new Date(t + 9 * 3600 * 1000);
    var z = function (n) { return (n < 10 ? '0' : '') + n; };
    return p.getUTCFullYear() + '.' + z(p.getUTCMonth() + 1) + '.' + z(p.getUTCDate());
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
    if (!d.eligible && !guideOf(d) && d.status !== 'delivered' && d.status !== 'submitted' &&
        d.status !== 'reviewing' && d.status !== 'draft_ready' && d.status !== 'awaiting_draft') {
      hideAll();
      return;
    }

    var delivered = d.status === 'delivered';
    var guide = guideOf(d);
    document.body.classList.add('has-sgift-claim');
    document.body.classList.remove('has-sgift');
    if (foot) foot.hidden = true;               // 이미 구매 — 하단 구매 유도 숨김
    var close = closedFlag();
    /* 감정서가 도착한 건 — 큰 도착 카드는 처음 한 번만 보여 준다.
       한 번 열어 보거나 X 로 닫으면 카드를 통째로 숨기고(여백 0),
       아래 '나의 2027년 맞춤 감정서' 보관 버튼으로 자리를 넘긴다 (#21986). */
    var seen = !!guide && isDismissed(d);
    card.hidden = !!guide ? seen : close;
    if (tg) {
      if (guide) {
        /* 2026-11-28 — 정식 회원 특별 혜택 배너 바로 위 한 줄 버튼은 감정서를 받은 뒤에도 남긴다.
           큰 도착 카드를 한 번 열어 보거나 X 로 닫으면 카드만 접히고, 이 버튼이 '나의 2027 맞춤
           가이드 보기'로 계속 서 있어 다시 열 길이 사라지지 않는다. (카드가 아직 펼쳐져 있을 때만
           자리가 겹치지 않게 숨긴다) */
        if (seen) {
          /* 2026-11-28 윤희 님 — 이 한 줄의 이름을 화면의 감정서와 같은 말로 맞춘다 */
          showToggle('claim', '🎁 나의 2027 맞춤 감정서 보기');
          tg.setAttribute('aria-controls', 'specialGuideModal');   // 이 한 줄은 감정서 팝업을 연다
          tg.setAttribute('aria-haspopup', 'dialog');
        } else {
          showToggle(null);
          tg.setAttribute('aria-controls', 'specialGift');
          tg.removeAttribute('aria-haspopup');
        }
      } else {
        showToggle(close ? 'claim' : null, delivered ? '🎁 전달 완료 보기' : '🎁 특별 선물 신청서 보기');
        tg.setAttribute('aria-controls', 'specialGift');
        tg.removeAttribute('aria-haspopup');
      }
    }

    var body = $('#specialGiftBody');
    if (body) {
      body.setAttribute('data-mode-offer', '');
      var step = STATUS_STEP[d.status] == null ? 0 : STATUS_STEP[d.status];
      body.innerHTML = guide ? guideArrivedHTML(d) : claimHTML(d, step);
    }
    startPoll(d);
    syncArchive();
    ctaSync();
    if (mem.openAfterClaim && guide) { mem.openAfterClaim = false; openGuide(); }
  }

  function claimHTML(d, step) {
    var delivered = d.status === 'delivered';
    var applied = !!d.apply_clicked_at;
    /* 결제와 함께 자동 접수된 건 — 고객이 '신청하기'를 누른 적이 없다.
       화면은 '자동 접수됐어요'로 열고, 신청 버튼 대신 선택형 카톡 채널 링크만 둔다.
       단, 개인정보 동의(consent_at)가 없으면 아직 서버에 저장하지 않은 상태이므로 '동의' 카드로 연다. */
    var auto = !delivered && step <= 1 && !!d.consent_at &&
      (d.eligibility_source === 'payment_auto' || d.auto_applied === true);
    var needConsent = !delivered && !auto && d.status !== 'cancelled' && !d.consent_at;
    /* 손님이 동의하고 신청 버튼을 누른 건(apply_clicked_at) — 운영자가 아직 '접수 확인'을 누르지
       않아도 신청·동의·사주가 서버에 다 들어와 있다. 손님 화면은 카카오톡을 거치지 않고
       바로 '접수 완료'로 보여 준다. 서버 상태값(eligible → submitted)은 운영자 몫 그대로 둔다.
       (2026-11-28 — 캡처 `YG-2027-RSGM47`: 신청을 눌렀는데도 1단계에 머물던 문제) */
    var received = !delivered && !needConsent && !auto && (step === 1 || (step === 0 && applied));
    var shown = received && step === 0 ? 1 : step;
    var no = d.claim_no || '';
    var labels = auto ? ['자동 접수', '접수 완료', '준비 중', '전달 완료'] : STEP_LABEL;
    var steps = labels.map(function (label, i) {
      var cls = i < shown ? 'is-done' : (i === shown ? 'is-now' : '');
      return '<li class="sgift__step ' + cls + '"><span class="sgift__step-n">' + (i + 1) + '</span>' +
        '<span class="sgift__step-t">' + label + '</span></li>';
    }).join('');

    var head = delivered
      ? '<p class="sgift__label">🎁 첫 3일(72시간) 특별 선물</p>' +
        '<h2 class="sgift__title" id="specialGiftTitle">전달 완료</h2>' +
        '<p class="sgift__desc">윤이세가 직접 전하는 2027년 맞춤 운세 활용 가이드를 카카오톡으로 보내 드렸어요.</p>' +
        '<p class="sgift__sub">카카오톡 채널 대화를 확인해 주세요.</p>'
      : (needConsent
        ? '<p class="sgift__label">🎁 첫 3일(72시간) 특별 선물</p>' +
          '<h2 class="sgift__title" id="specialGiftTitle">' + (d.status === 'eligible'
            ? '특별 선물 대상자로 확인되었습니다!'
            : '맞춤 운세 가이드가 접수됐어요') + '</h2>' +
          '<p class="sgift__desc">' + (d.status === 'eligible'
            ? '윤이세가 직접 전하는 2027년 맞춤 운세 활용 가이드를 신청해 주세요.'
            : '한 번만 동의해 주시면 윤이세가 사주를 읽고 가이드를 만들어 카카오톡으로 보내 드려요.') + '</p>' +
          '<p class="sgift__sub">동의하지 않아도 결제와 1년 이용권 사용에는 아무 영향이 없어요.</p>'
        : (received
        ? '<p class="sgift__label">🎁 첫 3일(72시간) 특별 선물</p>' +
          '<h2 class="sgift__title" id="specialGiftTitle">✅ 맞춤 운세 가이드 신청이 접수되었어요</h2>' +
          '<p class="sgift__desc">윤이세 선생님이 사주를 확인해 작성한 뒤, 이 화면과 카카오톡으로 보내드릴게요.</p>'
        : (step === 2
        ? '<p class="sgift__label">🎁 첫 3일(72시간) 특별 선물</p>' +
          '<h2 class="sgift__title" id="specialGiftTitle">가이드를 준비하고 있어요</h2>' +
          '<p class="sgift__desc">윤이세가 사주를 직접 읽고 가이드를 고치는 중이에요.</p>' +
          '<p class="sgift__sub">준비가 끝나면 카카오톡으로 개별 전달해 드려요.</p>'
        : (auto
          ? '<p class="sgift__label">🎁 첫 3일(72시간) 특별 선물</p>' +
            '<h2 class="sgift__title" id="specialGiftTitle">맞춤 운세 가이드가 자동 접수되었어요!</h2>' +
            '<p class="sgift__desc">결제가 확인되어 별도 신청 없이 접수됐어요. 윤이세가 확인 후 카카오톡으로 보내드릴게요.</p>' +
            '<p class="sgift__sub">보내드릴 때 카카오톡으로 연락드려요. 원하지 않으시면 카카오톡으로 알려 주세요.</p>'
          : (step === 1
            ? '<p class="sgift__label">🎁 첫 3일(72시간) 특별 선물</p>' +
              '<h2 class="sgift__title" id="specialGiftTitle">신청이 접수됐어요</h2>' +
              '<p class="sgift__desc">윤이세가 신청 내용을 확인하고 있어요.</p>' +
              '<p class="sgift__sub">가이드가 준비되면 카카오톡으로 개별 전달해 드려요.</p>'
            : '<p class="sgift__label">🎁 첫 3일(72시간) 특별 선물</p>' +
              '<h2 class="sgift__title" id="specialGiftTitle">특별 선물 대상자로 확인되었습니다!</h2>' +
              '<p class="sgift__desc">윤이세가 직접 전하는 2027년 맞춤 운세 활용 가이드를 신청해 주세요.</p>' +
              '<p class="sgift__sub">신청하신 가이드는 윤이세가 직접 검토한 뒤 카카오톡으로 개별 전달해 드려요.</p>')))));

    var statusLine = '';
    if (needConsent) {
      statusLine = '<p class="sgift__state">동의 전에는 사주 자료가 서버에 저장되지 않아요.</p>';
    } else if (auto) {
      statusLine = '<p class="sgift__state">🟢 자동 접수 완료 — 결제와 함께 접수됐어요. 가이드가 준비되면 카카오톡으로 보내 드립니다.</p>';
    } else if (step === 2) {
      statusLine = '<p class="sgift__state">지금 윤이세가 가이드를 준비하고 있어요. 준비되면 카카오톡으로 보내 드립니다.</p>';
    } else if (delivered) {
      statusLine = '<p class="sgift__state">전달이 끝났어요. 더 궁금한 점은 카카오톡 채널로 남겨 주세요.</p>';
    }

    var noBox = '<div class="sgift__no"><span>신청번호</span><b id="specialClaimNo">' + esc(no) + '</b>' +
      '<button type="button" class="sgift__copy" id="specialCopyNo">복사</button></div>';

    /* ── 개인정보 동의 — 일반 달력('기기에만 저장')과 별개 단계 ────────
       특별 가이드는 이름·생년월일시·성별·사주 분석 데이터를 서버에 저장하고 운영자가 확인해야 만들 수 있다.
       동의 시점에 consent_at 과 사주 스냅샷이 함께 저장되고, 동의 전에는 서버에 아무것도 저장되지 않는다.
       동의하지 않으면 진행 버튼이 잠기고, 서버도 동의 없는 기록·전달을 거부한다. */
    var consented = !!d.consent_at || !!mem.consentChecked;
    var ltcChecked = d.long_term_consent === true || (d.long_term_consent === undefined && !!mem.longTermChecked);
    var consent = needConsent
      ? '<label class="sgift__consent" for="sgiftConsent">' +
        '<input type="checkbox" id="sgiftConsent" data-sgift-consent' + (consented ? ' checked' : '') + '>' +
        '<span class="sgift__consent-t"><b>[필수]</b> 특별 가이드 제작·전달을 위해 이름·생년월일시·성별·사주 분석 자료를 서버에 저장하고 윤이세가 확인하는 데 동의합니다 (거래·상담 기록은 5년 보관 · <b>동의하지 않아도 결제와 1년 이용권 사용에는 아무 영향이 없습니다.</b>)</span>' +
        '</label>' +
        '<div class="sgift__ltc">' +
          '<label class="sgift__ltc-row" for="sgiftLongTerm">' +
            '<input type="checkbox" id="sgiftLongTerm" data-sgift-long-term' + (ltcChecked ? ' checked' : '') + '>' +
            '<span class="sgift__ltc-t"><b>[선택]</b> 고객 정보 및 상담 이력 장기 보관 동의 <i>(동의 철회·삭제 요청 시까지, 5년마다 갱신 안내)</i></span>' +
          '</label>' +
          '<button type="button" class="sgift__ltc-more" id="sgiftLongTermMore" aria-expanded="false" aria-controls="sgiftLongTermDetail">상세 보기</button>' +
          '<div class="sgift__ltc-detail" id="sgiftLongTermDetail" hidden><p><b>보관하는 것</b> 이름, 생년월일시·성별, 연락처, 상담 신청 내용과 상담 이력(작명은 자녀·부모 사주)</p><p><b>보관 기간</b> 동의하신 날부터 동의를 철회하거나 삭제를 요청하실 때까지</p><p><b>5년마다 확인</b> 5년이 지날 때마다 계속 보관할지 다시 여쭙고, 답이 없으면 보관을 멈춥니다</p><p><b>쓰는 곳</b> 재상담 때 앞선 상담을 이어서 보기, 이미 받은 감정서·가이드를 다시 확인해 드리기</p><p><b>동의하지 않으면</b> 상담은 그대로 진행되고, 상담 기록은 거래·상담 기록 5년 보관 뒤 파기합니다</p><p><b>철회</b> 카카오톡 채널 ‘윤이세사주’로 알려 주시면 지체 없이 철회하고 보관하던 상담 이력을 삭제합니다</p><p class="sgift__ltc-links"><a href="privacy/" target="_blank" rel="noopener">개인정보처리방침 전문</a> · <a href="terms/" target="_blank" rel="noopener">이용약관</a></p></div>' +
          '<p class="sgift__ltc-note">동의하지 않아도 신청과 가이드 전달에는 아무 영향이 없습니다.</p>' +
        '</div>'
      : '';

    /* 카카오톡은 원할 때만 — 작은 보조 링크 하나. 메인 버튼은 신청 버튼뿐이다 (2026-11-28) */
    var help = '<a class="sgift__more" href="' + KAKAO + '" target="_blank" rel="noopener noreferrer">💬 카톡으로 문의 남기기</a>';
    var btn = delivered
      ? '<a class="sgift__buy" href="' + KAKAO + '" target="_blank" rel="noopener noreferrer">카카오톡 채널 열기</a>'
      : (needConsent
        ? '<button type="button" class="sgift__buy" id="specialApply"' + (consented ? '' : ' disabled') + '>' +
          (d.status === 'eligible' ? '🎁 동의하고 특별 가이드 신청하기' : '🎁 동의하고 특별 가이드 받기') + '</button>'
        : (shown === 0
          ? '<button type="button" class="sgift__buy" id="specialApply">🎁 특별 가이드 신청하기</button>'
          : help));

    var hint = needConsent
      ? (consented
        ? '<p class="sgift__hint">동의하고 버튼을 누르면 신청이 접수돼요. 카카오톡으로 따로 보내지 않으셔도 됩니다.</p>'
        : '<p class="sgift__hint">위 동의에 체크하면 진행할 수 있어요.</p>')
      : (auto
        ? '<p class="sgift__hint">가이드는 윤이세가 확인한 뒤 카카오톡으로 보내드려요. 문의는 카카오톡 채널로 남겨 주세요.</p>'
        : (shown === 0
          ? '<p class="sgift__hint">버튼을 누르면 신청이 접수돼요. 카카오톡으로 따로 보내지 않으셔도 됩니다.</p>'
          : ''));

    return head +
      '<ol class="sgift__steps">' + steps + '</ol>' +
      noBox + statusLine + consent + btn + hint;
  }

  /* ── 도착한 가이드 카드 ─────────────────────────────── */
  function guideArrivedHTML(d) {
    return '<p class="sgift__label">🎁 첫 3일(72시간) 특별 선물</p>' +
      '<h2 class="sgift__title" id="specialGiftTitle">윤이세 선생님의 2027 맞춤 가이드가 도착했어요</h2>' +
      '<p class="sgift__sub">오늘 닫아 두셔도 괜찮아요. 며칠 뒤에 다시 들어와도 같은 가이드를 언제든 다시 열어 볼 수 있습니다.</p>' +
      '<div class="sgift__acts"><button type="button" class="sgift__buy" id="specialGuideOpen">가이드 열기</button></div>';
  }

  function plainText(t) {
    var D = window.SpecialGuideDraft;
    return D && D.plain ? D.plain(t) : String(t || '').replace(/\*\*/g, '');
  }
  /** 본문 첫 줄에서 이름을 읽는다 — 표지에 '○○ 님'으로 들어간다 */
  function nameIn(t) {
    var m = String(t || '').match(/^(.{1,12}?) 님을 위한 개인 맞춤 감정서/m);
    return m ? m[1] : '';
  }

  /* ── 도착한 가이드 열기 — 표지 · 페이지 · PDF (2026-11-26) ─────────
     본문은 윤이세가 승인한 그 글(guide_text)이다. 화면에서 다시 만들지 않고
     그대로 종이에 올린다. 표지·페이지·PDF·공유 파일도 같은 글에서 나온다. */
  var gfiles = null, gfilesNo = '';

  function openGuide() {
    var d = mem.claim;
    var text = guideOf(d);
    if (!text) return;
    markSeen(d.claim_no);              // 열어 본 것으로 남긴다 — 큰 도착 카드는 다시 뜨지 않는다
    var m = $('#specialGuideModal');
    var body = $('#specialGuideBody');
    if (!m || !body) return;
    var when = fmtDay(d.approved_at);
    body.innerHTML =
      '<p class="sgiftm__eyebrow">2027 GUIDE · 윤이세</p>' +
      '<h2 class="sgiftm__title" id="specialGuideTitle">2027년 맞춤 운세 활용 가이드</h2>' +
      '<p class="sgguide__meta">' + esc(d.claim_no || '') + (when ? ' · ' + when + ' 도착' : '') + '</p>' +
      '<div class="sgguide__pages" id="sgPages"><p class="sgguide__loading">가이드를 펼치는 중…</p></div>' +
      '<div class="sgguide__acts" id="sgActs" hidden>' +
      '<button type="button" class="sgift__buy" id="sgPreview">최종 감정서 미리보기</button>' +
      '<div class="sgguide__grid">' +
      '<button type="button" id="sgPdf">PDF 저장</button>' +
      '<button type="button" id="sgPages">페이지별 이미지 저장</button>' +
      '<button type="button" id="sgSend" class="sgguide__send">감정서 보내기</button>' +
      '</div>' +
      '<p class="sgguide__note">표지 1장 + 본문. 본문 1장 위에 사주 원국, 마지막 장에 윤이세 서명·직인과 1:1 상담 안내가 함께 들어 있습니다.</p>' +
      '</div>' +
      '<details class="sgguide__textwrap"><summary>글자로 보기 · 복사하기</summary>' +
      '<div class="sgguide__paper">' + esc(plainText(text)) + '</div>' +
      '<div class="sgguide__sign">' +
      '<img class="sgguide__seal" src="assets/yoonise-seal.png?v=20261126v" alt="윤이세 직인" loading="lazy">' +
      '<p class="sgguide__name">윤이세</p>' +
      '<p class="sgguide__note">가이드는 언제든 다시 열어 보실 수 있어요.</p>' +
      '</div></details>' +
      '<button type="button" class="sgift__buy sgguide__close" data-sgguide-close>가이드 닫기</button>';
    m.hidden = false;
    mem.guideOpen = true;
    if (window.BackNav) window.BackNav.open('sgguide', closeGuide);    // 휴대폰 뒤로가기 → 감정서부터 닫기
    document.body.classList.add('is-sgift-modal');
    try { $('#specialGuideDialog').focus({ preventScroll: true }); } catch (e) { }
    try { body.parentNode.scrollTop = 0; } catch (e) { }
    paintGuide(text);
    syncArchive();
  }

  /* 페이지를 캔버스로 그려 팝업 안에 그대로 보여 준다 — 저장물과 같은 그림.
     표지 전용 장은 없다. 1장 위에 원국, 마지막 장에 서명·직인. */
  function gopts(text, scale) {
    return {
      seal: 'assets/yoonise-seal.png?v=20261126v',
      name: nameIn(text),
      saju: (mem.claim && mem.claim.saju_snapshot) || null,
      scale: scale || 1
    };
  }
  function paintGuide(text) {
    var host = $('#sgPages');
    if (!host) return;
    if (!window.GuidePaper) {
      host.innerHTML = '<div class="sgguide__paper">' + esc(plainText(text)) + '</div>';
      return Promise.resolve(null);
    }
    var seq = ++mem.guideSeq;
    return window.GuidePaper.render(text, gopts(text, 0.6))
      .then(function (r) {
        if (seq !== mem.guideSeq) return null;
        host.innerHTML = '';
        r.all.forEach(function (cv, i) {
          cv.className = 'sgguide__page';
          cv.setAttribute('data-i', String(i));
          if (cv.__cta) {
            /* 마지막 장에 그린 상담 버튼 위에 실제 링크 — 누르면 신청서로 바로 (2026-11-26) */
            var wrap = document.createElement('div');
            wrap.className = 'sgguide__shot';
            wrap.appendChild(cv);
            var a = document.createElement('a');
            a.className = 'sgguide__cta';
            a.href = window.GuidePaper.APPLY_URL;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.setAttribute('aria-label', '윤이세 1:1 맞춤 상담 알아보기');
            a.style.left = (cv.__cta.x / window.GuidePaper.W * 100) + '%';
            a.style.top = (cv.__cta.y / window.GuidePaper.H * 100) + '%';
            a.style.width = (cv.__cta.w / window.GuidePaper.W * 100) + '%';
            a.style.height = (cv.__cta.h / window.GuidePaper.H * 100) + '%';
            wrap.appendChild(a);
            host.appendChild(wrap);
          } else {
            host.appendChild(cv);
          }
          var c2 = document.createElement('p');
          c2.className = 'sgguide__cap';
          c2.textContent = i === 0 ? '표지' : (i + ' / ' + r.pages.length + '장');
          host.appendChild(c2);
        });
        var acts = $('#sgActs');
        if (acts) acts.hidden = false;
        return r;
      }, function () {
        host.innerHTML = '<div class="sgguide__paper">' + esc(plainText(text)) + '</div>';
        return null;
      });
  }

  function guideTextNow() { return guideOf(mem.claim); }
  function guideFiles(text) {
    if (gfiles && gfilesNo === (mem.claim && mem.claim.claim_no)) return gfiles;
    gfilesNo = mem.claim && mem.claim.claim_no;
    gfiles = window.GuidePaper.files(text, gopts(text, 1));
    return gfiles;
  }
  function guideBusy(on) {
    ['sgPreview', 'sgPdf', 'sgPages', 'sgSend'].forEach(function (id) {
      var b = $('#' + id); if (b) b.disabled = !!on;
    });
  }
  function guideRun(make) {
    var text = guideTextNow();
    if (!text) return;
    if (!window.GuidePaper) { toast('이 브라우저에서는 이미지 저장이 어려워요 — 글자로 보기에서 복사해 주세요.'); return; }
    guideBusy(true);
    toast('만드는 중이에요 — 잠시만 기다려 주세요.');
    setTimeout(function () {
      new Promise(function (res) { res(make(text)); }).then(function (msg) {
        guideBusy(false);
        if (msg) toast(msg);
      }, function (e) {
        guideBusy(false);
        toast((e && e.message) ? e.message : '만들지 못했어요 — 다시 시도해 주세요.');
      });
    }, 40);
  }
  /* 미리보기 — 1장부터 끝장까지 크게, 썸네일로 넘겨 보기 */
  function guidePreview(start) {
    var text = guideTextNow();
    if (!text || !window.GuidePaper) return;
    guideBusy(true);
    window.GuidePaper.render(text, gopts(text, 0.62)).then(function (r) {
      guideBusy(false);
      window.GuidePaper.viewer(r.all, {
        title: '최종 감정서 미리보기', start: start || 0,
        actions: [
          { icon: 'PDF', label: 'PDF 저장', desc: '표지 포함 ' + (r.pageCount + 1) + '장을 한 파일로', onClick: guidePdf },
          { icon: 'PNG', label: '페이지별 이미지 저장', desc: '표지 포함 ' + (r.pageCount + 1) + '장을 ZIP으로', onClick: guidePages },
          { icon: '↗', label: '감정서 보내기', desc: 'PDF 또는 페이지별 이미지로 카톡에', onClick: guideSend }
        ]
      });
    }, function () { guideBusy(false); toast('미리보기를 열지 못했어요 — 다시 시도해 주세요.'); });
  }
  function guidePdf() {
    guideRun(function (text) {
      return guideFiles(text).then(function (f) {
        window.GuidePaper.download(f.pdf, f.names.pdf);
        return 'PDF를 저장했어요 — 표지까지 ' + f.pageCount + '장이 한 파일에 들어 있어요.';
      });
    });
  }
  function guidePages() {
    guideRun(function (text) {
      return guideFiles(text).then(function (f) {
        window.GuidePaper.download(f.zip, f.names.pagesZip);
        return '표지까지 ' + f.pageCount + '장을 ZIP 하나로 저장했어요 — 풀면 순서대로 들어 있어요.';
      });
    });
  }
  /* 감정서 보내기 — PDF / 페이지별 이미지 고르고 기기 공유창으로.
     공유창을 열었다고 ‘전달 완료’가 되지는 않는다(그건 윤이세가 직접 누른다). */
  function guideSend() {
    guideRun(function (text) {
      return guideFiles(text).then(function (f) {
        return window.GuidePaper.chooser({ pageCount: f.pageCount }).then(function (pick) {
          if (!pick) return '';
          if (pick === 'pdf') {
            return window.GuidePaper.shareList([{ blob: f.pdf, name: f.names.pdf, type: 'application/pdf' }], '윤이세 감정서')
              .then(function (ok) {
                if (ok) return '공유 창을 열었어요 — 카톡을 고르시면 PDF로 전달돼요.';
                window.GuidePaper.download(f.pdf, f.names.pdf);
                window.GuidePaper.notice({
                  title: '파일 공유가 제한된 브라우저예요', copyUrl: true,
                  html: '<p>지금 브라우저에서는 직접 파일 공유가 제한됩니다. <b>PDF 파일은 방금 저장했어요.</b></p>' +
                    '<p>카카오톡 대화상에서 <b>＋ → 파일</b>을 눌러 방금 저장한 PDF를 보내 주세요.</p>' +
                    '<p>상담 링크: <b>윤이세 1:1 맞춤 상담 알아보기 →</b> ' + window.GuidePaper.APPLY_URL + '</p>'
                });
                return '';
              });
          }
          var items = f.pages.map(function (b, i) { return { blob: b, name: f.names.page(i + 1), type: 'image/png' }; });
          return window.GuidePaper.shareList(items, '윤이세 감정서').then(function (ok) {
            if (ok) return '페이지 ' + f.pageCount + '장을 공유 창으로 넘겼어요 — 순서대로 보내 주세요.';
            window.GuidePaper.download(f.zip, f.names.pagesZip);
            window.GuidePaper.notice({
              title: '여러 장 공유가 제한된 브라우저예요', copyUrl: true,
              html: '<p>지금 브라우저에서는 사진 여러 장을 한 번에 공유할 수 없습니다. <b>페이지 ' + f.pageCount + '장을 ZIP으로 저장했어요.</b></p>' +
                '<p>카카오톡 대화상에서 <b>＋ → 파일</b>로 ZIP을 보내거나, ZIP을 풀어 사진으로 한 장씩 보내 주세요.</p>' +
                '<p>사진에는 링크를 넣을 수 없어요. 함께 보낼 문구: <b>윤이세 1:1 맞춤 상담 알아보기 → ' + window.GuidePaper.APPLY_URL + '</b></p>'
            });
            return '';
          });
        });
      });
    });
  }

  function closeGuide() {
    var m = $('#specialGuideModal');
    if (!m || m.hidden) return;
    if (window.BackNav) window.BackNav.close('sgguide');
    m.hidden = true;
    mem.guideOpen = false;
    if (!mem.modalOpen) document.body.classList.remove('is-sgift-modal');
    /* 다 보고 닫으면 큰 도착 카드는 자리를 비우고, 2027 카드 아래 보관 버튼만 남는다 */
    refresh();
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

  /* ── 동의 → 사주 저장 ───────────────────────────────
     고객이 동의를 누른 시점에만 consent_at 과 사주 스냅샷을 서버에 남긴다.
     (결제·코드 확인만으로는 서버에 사주가 저장되지 않는다) */
  function saveConsent(d, cb) {
    rpc('special_guide_consent', { p_client_uid: ensureUid(), p_claim_no: d.claim_no, p_consent: true })
      .then(function (r) {
        if (!r || !r.ok || !r.consent_at) {
          if (window.YoonCalendar && window.YoonCalendar.toast) window.YoonCalendar.toast('동의 기록을 남기지 못했어요 — 잠시 뒤 다시 눌러 주세요');
          return;
        }
        d.consent_at = r.consent_at;
        if (mem.claim) mem.claim.consent_at = r.consent_at;
        try { localStorage.setItem(CLAIM_KEY, JSON.stringify(mem.claim || d)); } catch (e) { }
        cb();
      }, function () {
        if (window.YoonCalendar && window.YoonCalendar.toast) window.YoonCalendar.toast('연결을 확인한 뒤 다시 눌러 주세요');
      });
  }
  /** 동의가 확인된 뒤, 이 기기의 사주 계산 자료를 서버에 저장한다(동의 전이면 서버가 거부). */
  function fillSaju(d, cb) {
    var c = cal();
    var snap = (c && c.res) ? buildSnapshot(c.res) : null;
    if (!snap) { if (cb) cb(); return; }
    rpc('special_guide_saju', { p_client_uid: ensureUid(), p_claim_no: d.claim_no, p_saju: snap })
      .then(function () { if (cb) cb(); }, function () { if (cb) cb(); });
  }

  /** [선택] 고객 정보·상담 이력 장기 보관 동의 (2026-11-26) — 동의/미동의를 v1.0 기준으로 남긴다 */
  function saveLongTermConsent(d) {
    var on = $('#sgiftLongTerm') ? !!$('#sgiftLongTerm').checked : !!mem.longTermChecked;
    mem.longTermChecked = on;
    rpc('special_guide_long_term_consent', {
      p_client_uid: ensureUid(), p_claim_no: d.claim_no,
      p_consent: on, p_terms_version: 'v1.0'
    }).then(function (r) {
      if (r && r.ok) {
        d.long_term_consent = r.long_term_consent;
        if (mem.claim) mem.claim.long_term_consent = r.long_term_consent;
      }
    }, function () { });
  }

  function applyClaim() {
    var d = mem.claim;
    var c = cal();
    if (!d || !d.claim_no) return;
    /* 동의 없이는 진행되지 않는다 — 화면(버튼 비활성)과 서버(동의 없는 저장·전달 거부)가 함께 막는다. */
    if (!d.consent_at && d.status !== 'delivered' && d.status !== 'cancelled') {
      if (!mem.consentChecked) {
        var box = $('#sgiftConsent');
        if (box) { try { box.focus({ preventScroll: true }); } catch (e) { } }
        if (window.YoonCalendar && window.YoonCalendar.toast) {
          window.YoonCalendar.toast('아래 동의에 체크해야 진행할 수 있어요');
        }
        return;
      }
      saveConsent(d, function () {
        saveLongTermConsent(d);      /* [선택] 장기 보관 동의 — 실패해도 신청은 계속된다 */
        fillSaju(d, function () {
          /* 이미 접수된 건(결제 자동 접수 등)은 동의만 남기면 끝 — 가이드는 윤이세가 준비해 카톡으로 보낸다 */
          if (d.status !== 'eligible') {
            if (window.YoonCalendar && window.YoonCalendar.toast) {
              window.YoonCalendar.toast('동의를 남겼어요 — 가이드가 준비되면 카카오톡으로 보내 드려요');
            }
            renderClaim();
            return;
          }
          sendApply(d);
        });
      });
      return;
    }
    sendApply(d);
  }

  /** 신청 접수 — 화면 안에서 끝난다. 카카오톡 채널로 넘기지 않는다 (2026-11-28)
     동의·사주는 이미 서버에 있고, 이 호출이 apply_clicked_at 을 남긴다.
     성공하면 카드를 다시 그려 '접수 완료'로 보여 주고, 손님은 앱에 그대로 머무른다. */
  function sendApply(d) {
    applyBusy(true);
    var fail = function () {
      renderClaim();                       // 카드 상태를 그대로 되돌린다(버튼 이름·비활성 포함)
      toast('잠시 뒤 다시 눌러 주세요 — 신청을 접수하지 못했어요');
    };
    rpc('special_guide_mark_applied', { p_client_uid: ensureUid(), p_claim_no: d.claim_no })
      .then(function (r) {
        if (!r || r.ok === false) { fail(); return; }
        if (r.apply_clicked_at) {
          d.apply_clicked_at = r.apply_clicked_at;
          if (mem.claim) mem.claim.apply_clicked_at = r.apply_clicked_at;
        }
        try { localStorage.setItem(CLAIM_KEY, JSON.stringify(mem.claim || d)); } catch (e) { }
        renderClaim();
        /* 접수 완료 카드가 화면 밖으로 밀렸을 때만 한 번 끌어올린다 */
        var card = $('#specialGift');
        setTimeout(function () {
          if (!card || card.hidden) return;
          var box = card.getBoundingClientRect();
          if (box.top < 0 || box.bottom > window.innerHeight) { try { card.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { } }
        }, 140);
      }, fail);
  }

  /** 신청 버튼의 '접수하는 중' 표시 — 화면을 다시 그리면(renderClaim) 저절로 돌아온다 */
  function applyBusy(on) {
    var btn = $('#specialApply');
    if (!btn || btn.tagName !== 'BUTTON') return;
    if (on) {
      btn.setAttribute('aria-busy', 'true');
      btn.disabled = true;
      btn.textContent = '신청을 접수하는 중…';
    }
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
        '<p class="sgiftm__sub">첫 사주 입력 후 3일(72시간) 이내에 이용권을 구매하신 분께, 다섯 가지로 정리한 맞춤 가이드를 카카오톡으로 보내 드립니다.</p>' +
        '<ol class="sgiftm__list">' + GUIDE_FIVE.map(function (x, i) {
          return '<li><span class="sgiftm__n">' + (i + 1) + '</span><span class="sgiftm__b"><b>' + x[0] + '</b><span>' + x[1] + '</span></span></li>';
        }).join('') + '</ol>' +
        '<p class="sgiftm__how"><b>이렇게 전해 드려요</b><span>사주 계산 자료를 바탕으로 초안을 만들고, 윤이세가 직접 읽고 고친 뒤 카카오톡으로 개별 전달합니다. 정해진 미래를 말하는 글이 아니라, 2027년의 흐름을 조금 더 편하게 타기 위한 참고입니다.</span></p>' +
        '<button type="button" class="sgift__buy" id="specialModalBuy">' + ctaBuy('gift') + '</button>' +
        '<p class="sgiftm__note">7일 무료 체험은 그대로 이용할 수 있어요.</p>';
    }
    m.hidden = false;
    mem.modalOpen = true;
    if (window.BackNav) window.BackNav.open('sgift', closeModal);       // 휴대폰 뒤로가기 → 이 팝업부터 닫기
    document.body.classList.add('is-sgift-modal');
    try { $('#specialModalDialog').focus({ preventScroll: true }); } catch (e) { }
  }
  function closeModal() {
    var m = $('#specialModal');
    if (!m || m.hidden) return;
    if (window.BackNav) window.BackNav.close('sgift');
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
        /* 입력값 그대로 — 감정서 원국 위 한 줄이 양력/음력/윤달·시각을 입력한 그대로 보여 주게 (#22228) */
        lunar: res.lunar ? { y: res.lunar.y, m: res.lunar.m, d: res.lunar.d, leap: !!res.lunar.leap, text: res.lunar.text || '' } : null,
        input: res.input ? {
          calendar: res.input.calendar, y: res.input.y, m: res.input.m, d: res.input.d,
          leap: !!res.input.leap, timeKnown: !!res.input.timeKnown,
          hh: res.input.timeKnown ? res.input.hh : null,
          mm: res.input.timeKnown ? res.input.mm : null,
          gender: res.input.gender, ziRule: res.input.ziRule,
          trueSolar: !!res.input.trueSolar, dst: !!res.input.dst, region: res.input.region
        } : null,
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
      /* [선택] 장기 보관 동의 상세 보기 — 접기/펼치기 */
      if (e.target && (e.target.id === 'sgiftLongTermMore')) {
        e.preventDefault();
        var more = e.target, det = $('#sgiftLongTermDetail');
        if (det) {
          var open = more.getAttribute('aria-expanded') === 'true';
          more.setAttribute('aria-expanded', open ? 'false' : 'true');
          det.hidden = open;
          more.textContent = open ? '상세 보기' : '상세 접기';
        }
        return;
      }
      if (!e.target.closest) return;
      var x = e.target.closest('#specialGiftX');
      if (x) {
        e.preventDefault();
        setClosed(true);
        if (mem.claim && guideOf(mem.claim)) markSeen(mem.claim.claim_no);
        refresh();
        return;
      }
      var tg = e.target.closest('#specialGiftToggle');
      if (tg) {
        e.preventDefault();
        /* ② 이용권 안내 모습 — 기존 정식 이용권·결제 화면을 그대로 연다 (#22789) */
        if (tg.classList.contains('is-pass')) {
          if (window.YoonCalendar && typeof window.YoonCalendar.openShop === 'function') window.YoonCalendar.openShop('pass');
          return;
        }
        /* 2026-11-28 — 2027 맞춤 가이드가 도착한 정식 회원: 이 한 줄이 곧 감정서 다시 열기.
           (가이드가 없는 일반 신청서 상태에서는 예전처럼 카드를 펼친다) */
        if (!guideOf(mem.claim)) {
          var cg = cachedClaim();
          if (cg && guideOf(cg)) mem.claim = cg;
        }
        if (guideOf(mem.claim)) { openGuide(); return; }
        setClosed(false);
        refresh();
        return;
      }
      var gopen = e.target.closest('#specialGuideOpen');
      if (gopen) { e.preventDefault(); openGuide(); return; }
      /* 2027 카드 아래 보관 버튼 — 받은 그 감정서를 다시 연다 (새로 만들지 않는다) */
      var arch = e.target.closest('#sgArchive');
      if (arch) {
        e.preventDefault();
        if (!guideOf(mem.claim)) {
          var cc = cachedClaim();
          if (cc && guideOf(cc)) { mem.claim = cc; renderClaim(); }
          else {
            var c0 = cal();
            if (c0 && paidNow(c0)) { mem.openAfterClaim = true; mem.claimTried = false; maybeClaim(c0); }
          }
        }
        if (guideOf(mem.claim)) openGuide();
        return;
      }
      var gc = e.target.closest('#sgPreview');
      if (gc) { e.preventDefault(); guidePreview(0); return; }
      var gp = e.target.closest('#sgPdf');
      if (gp) { e.preventDefault(); guidePdf(); return; }
      var gpg = e.target.closest('#sgPages');
      if (gpg) { e.preventDefault(); guidePages(); return; }
      var gsend = e.target.closest('#sgSend');
      if (gsend) { e.preventDefault(); guideSend(); return; }
      /* 팝업 안의 장을 누르면 그 장부터 크게 */
      var gcv = e.target.closest('#sgPages canvas');
      if (gcv) { e.preventDefault(); guidePreview(Number(gcv.getAttribute('data-i') || 0)); return; }
      var gclose = e.target.closest('#specialGuideModal [data-sgguide-close]');
      if (gclose) { e.preventDefault(); closeGuide(); return; }
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
      if (e.key !== 'Escape') return;
      if (mem.guideOpen) { e.preventDefault(); closeGuide(); return; }
      if (mem.modalOpen) { e.preventDefault(); closeModal(); }
    });
    /* [필수] 동의 체크 — 누를 때마다 신청 버튼과 안내 문구가 바뀐다 */
    document.addEventListener('change', function (e) {
      if (e.target && e.target.id === 'sgiftLongTerm') {
        mem.longTermChecked = !!e.target.checked;
        return;
      }
      if (!e.target || e.target.id !== 'sgiftConsent') return;
      mem.consentChecked = !!e.target.checked;
      var b = $('#specialApply');
      if (b) {
        if (mem.consentChecked || (mem.claim && mem.claim.consent_at)) b.removeAttribute('disabled');
        else b.setAttribute('disabled', '');
      }
      var h = $('#specialGift .sgift__hint');
      if (h) {
        var alreadyIn = !!(mem.claim && (mem.claim.status !== 'eligible'));
        h.textContent = mem.consentChecked
          ? (alreadyIn
            ? '동의하면 사주 분석 자료가 서버에 저장되고, 가이드가 준비되는 대로 카카오톡으로 보내 드려요.'
            : '동의하고 버튼을 누르면 신청이 접수돼요. 카카오톡으로 따로 보내지 않으셔도 됩니다.')
          : '위 동의에 체크하면 진행할 수 있어요.';
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
        paintPayCmp();     // 결제 팝업 왼쪽 칸을 '종료'로
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
    payGiftHTML: payGiftHTML,      // 2026-11-26 부터 결제 팝업은 payCmpHTML 을 쓴다 (다른 화면용으로 남겨 둠)
    payCmpHTML: payCmpHTML,
    paintPayCmp: paintPayCmp,
    /** 결제 팝업을 그리는 쪽(calendar.js)이 왼쪽 칸을 처음부터 담담하게 그릴 때 본다 */
    payCmpOver: function () { return payCmpState() === 'over'; },
    /* 🏷️ 구매 유도 단계 — 'gift' = 첫 사주 입력 후 72시간 이내·미결제 (달력 버튼 이름표가 이 값을 먼저 본다) */
    ctaPhase: function () { return offerActive() ? 'gift' : ''; },
    /* 72시간 창이 아직 열려 있는가 — 달력 하단 '첫 3일(72시간) 구매 시 특별 가이드 증정' 한 줄을
       72시간 이내 미결제 화면에서만 보이게 하는 마지막 확인 (#23653-4) */
    eventWindowOpen: function () { return eventActive(); }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();

/*!
 * 윤이세 — 회원 · 4단 추천 사다리 · 2027 케미 (/calendar/member/)
 *
 *  원칙
 *   · 라이브 /calendar/ (index.html · calendar.js · sw.js)는 건드리지 않는다. 이 화면은 별도 경로다.
 *   · 사주 계산은 ../assets/timing.js · manse.js 를 그대로 쓴다(새 계산식 없음). 전부 브라우저 안에서.
 *   · 회원 DB(profiles)가 아직 서버에 없어도 화면이 깨지지 않는다 — 로그인 상태는 세션 정보로 보여 주고,
 *     초대 코드·사다리 숫자는 '준비 중'으로 안내한다.
 *   · 숫자는 지어내지 않는다. 미리보기 숫자는 '미리보기'라고 화면에 적는다.
 */
(function (global) {
  'use strict';

  var T = global.Timing, M = global.Manse;
  var doc = document;
  function $(s, r) { return (r || doc).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /* 받침에 맞춰 조사를 고른다 — 이름에 '나'·'저'처럼 형태가 바뀌는 대명사도 있어서 따로 둔다 */
  var PRONOUN = {
    '나':   { subj: '내가', obj: '나를', top: '나는' },
    '저':   { subj: '제가', obj: '저를', top: '저는' },
    '너':   { subj: '네가', obj: '너를', top: '너는' },
    '누구': { subj: '누가', obj: '누구를', top: '누구는' }
  };
  function hasBatchim(name) {
    var c = String(name || '').trim().slice(-1);
    if (!c) return false;
    var code = c.charCodeAt(0);
    if (code < 0xAC00 || code > 0xD7A3) return false;   // 한글이 아니면 받침 없는 쪽으로
    return (code - 0xAC00) % 28 !== 0;
  }
  function josaFull(name, kind) {
    var n = String(name || '').trim();
    if (PRONOUN[n]) return PRONOUN[n][kind] || n;
    return n + josa(n, kind);
  }
  function josa(name, kind) {
    var n = String(name || '').trim();
    if (PRONOUN[n]) return PRONOUN[n][kind] || '';
    var pair = kind === 'obj' ? ['을', '를']
      : (kind === 'top' ? ['은', '는']
      : (kind === 'with' ? ['이랑', '랑']
      : (kind === 'copula' ? ['이에요', '예요'] : ['이', '가'])));
    return hasBatchim(n) ? pair[0] : pair[1];
  }

  /* ── 고정값 ─────────────────────────────────────── */
  var SB_URL = 'https://fifynkkaeqcjlovesuop.supabase.co';
  var SB_KEY = 'sb_publishable_JzSUlMOH9s38aer6y1BVEg_rHcQLGxF';   // publishable — 비밀키 아님(공개 전제)
  var MEMBER_PATH = '/yoonise-oheng-aroma/calendar/member/';
  var LIVE_BASE = 'https://ksy7900-star.github.io' + MEMBER_PATH;      // 케미·사다리 화면 주소
  var CALENDAR_PATH = '/yoonise-oheng-aroma/calendar/';
  var CALENDAR_LIVE_BASE = 'https://ksy7900-star.github.io' + CALENDAR_PATH;   // 친구 초대 링크는 달력 메인으로 (2026-11-22)
  var KAKAO_CHANNEL_ADD = 'https://pf.kakao.com/_hxfbCG/friend';   // 원터치 카카오 채널 추가 (2026-11-22)
  var REF_KEY = 'yoonise.member.ref.v1';
  var REF_FROM_KEY = 'yoonise.member.reffrom.v1';
  var AUTOLOGIN_KEY = 'yoonise.member.autologin.tried.v1';   // 이 탭에서 카카오로 보낸 적 있는지 (무한 리다이렉트 방지)
  var INVITE_FLOW_KEY = 'yoonise.member.invite.flow.v1';    // 초대 링크의 '카카오 3초 연결'로 넘어온 흐름 (카카오 다녀와도 같은 탭이면 남는다)
  var INVITED_KEY = 'yoonise.invited.v1';   // 초대받은 손님 표시 — /calendar/ 가 액운 +1회를 줄 때 본다 (체험일은 7일 고정)
  var GATE_KEY = 'yoonise.member.chemi.gate.v1';   // 로그인 전에 넣은 사주 — 로그인 돌아오면 이어서 계산
  /* 달력의 '카톡 3초 연결 → 내 수호 부적' 카드로 들어온 손님 (2026-11-23 2차)
     카카오OAuth 는 주소의 ?next= 를 지우고 돌아오므로, 이 탭에 표시를 남겨 두고
     로그인이 끝나면 달력(#talis)으로 바로 돌려보낸다. */
  var NEXT_TALIS_KEY = 'yoonise.member.next.talis.v1';
  var EL_ORDER = ['목', '화', '토', '금', '수'];
  var SAMHAP_EL = ['수', '목', '화', '금'];
  var EL_OVER = { 목: '토', 화: '금', 토: '수', 금: '목', 수: '화' };    // 내가 극하는 오행
  var EL_MOTHER = { 화: '목', 토: '화', 금: '토', 수: '금', 목: '수' };  // 나를 생하는 오행

  /* ── 최종 확정 사다리 (2026-11-23 저녁 김나영 님 확정 · 2026-11-24 적용) — 1 / 3 / 5 / 7 ──
     '1명 +1개월'은 너무 쉬워서 결제 없이 한 달씩만 쓰는 사람이 생긴다 → 한 칸씩 조였다.
       · 1명 내 사주 타이밍 달력 +2주(14일)
       · 3명 내 사주 타이밍 달력 +1개월(30일)
       · 5명 내 사주 타이밍 달력 +3개월(90일) + 1:1 상담 1만원 할인
       · 7명 내 사주 타이밍 달력 +6개월(180일) + 1:1 원포인트 상담 반값(50%)
     Supabase referral_rules 도 같은 숫자(1/3/5/7 · 14/30/90/180일)로 맞춰 두었다. */
  var LADDER = [
    { n: 1, title: '내 사주 타이밍 달력 +2주(14일)', sub: '지금부터 2주를 통째로 열어 드려요' },
    { n: 3, title: '내 사주 타이밍 달력 +1개월(30일)', sub: '한 달을 통째로 열어 드려요' },
    { n: 5, title: '내 사주 타이밍 달력 +3개월(90일) + 1:1 상담 1만원 할인', sub: '석 달을 열고, 상담은 1만원 빼 드려요' },
    { n: 7, title: '내 사주 타이밍 달력 +6개월(180일) + 1:1 원포인트 상담 반값(50%)', sub: '반년을 열고, 원포인트 상담 49,000원 → 24,500원' }
  ];

  /* ── 결제자 안내 (2026-11-23 5차) ─────────────────────────────
     상품은 '내 사주 타이밍 달력' 하나로 통일됐다(예전 1년 패스·올인원·성찰 에디션 이름은 걷어 냈다).
     사다리 자체는 무료·결제자 모두 1/3/5/7 하나로 같다.
     결제자는 달력이 이미 다 열려 있어서 5명·7명 칸의 1:1 상담 할인이 실질 혜택이다. */
  var TIER_RANK = { pass: 1, allinone: 2, diary: 3 };
  var UNLOCK_KEY = 'yoonise.timing.unlock.v2';   // 달력(/calendar/)이 코드를 열 때 쓰는 그 키

  /** 사다리 — 무료·결제자 모두 같은 1/3/5/7 (기간 보상이 겹쳐도 손해가 없다) */
  function ladderFor(tier) {
    return LADDER;
  }

  /** 달력이 이 기기에서 연 상품 등급 — 코드가 실제로 열린 기록이 있을 때만 인정한다 */
  function readLocalTier() {
    try {
      var raw = localStorage.getItem(UNLOCK_KEY) || '';
      var o = raw ? JSON.parse(raw) : null;
      if (!o || typeof o !== 'object') return '';
      if (!o.code && !o.phone && !o.ymd) return '';        // 코드 없이 등급만 심어진 값은 믿지 않는다
      return TIER_RANK[o.tier] ? o.tier : '';
    } catch (e) { return ''; }
  }

  /** 회원 DB 의 등급을 이 기기 달력 기록에도 맞춰 둔다 — 코드·번호는 그대로 두고 등급만
     (코드가 없는 빈 기록에는 심지 않는다 — 달력 잠금은 끝까지 6자리 코드가 판단한다) */
  function syncUnlockTier(tier) {
    if (!TIER_RANK[tier]) return;
    try {
      var raw = localStorage.getItem(UNLOCK_KEY) || '';
      var o = raw ? JSON.parse(raw) : null;
      if (!o || typeof o !== 'object') return;
      if (!o.code && !o.phone && !o.ymd) return;
      if (o.tier === tier) return;
      o.tier = tier;
      o.at = new Date().toISOString();
      localStorage.setItem(UNLOCK_KEY, JSON.stringify(o));
    } catch (e) {}
  }
  var FRIEND_GIFT = '7일 무료 체험과 액운 태우기 1회';
  var HASHTAGS = '#내사주타이밍달력 #2027신년운세 #2027사주 #사주달력 #액운태우기 #윤이세사주 #2027타이밍캘린더 #새해운세';
  var INSTA = 'life.saju_yoonise';
  // 인스타에 그대로 붙여넣는 한 덩어리 — 계정 태그 한 줄 + 짧은 추천 한 줄 + 해시태그 (2026-11-23 6차)
  var REC_LINE = '2027년 조심할 달·밀어붙일 달을 내 사주로 뽑아 봤어요. 친구랑 겹쳐 보면 더 재밌어요 🌙';
  var CAPTION = '@' + INSTA + '\n' + REC_LINE + '\n' + HASHTAGS;
  var INSTA_WEB = 'https://www.instagram.com/';

  var state = {
    user: null, session: null, profile: null,
    db: 'idle',            // idle | live | pending | unavailable | off
    dbMsg: '',
    invited: 0,
    demo: null,            // 미리보기로 고른 숫자 (실제 값 아님)
    refPending: '',
    refFrom: '',
    paidTier: '',           // '' | pass | allinone | diary — 결제자용 사다리 분기 (2026-11-22)
    me: { gender: '' }, you: { gender: '' },
    rel: 'friend',          // 'friend' 우정 · 'love' 사랑 (관계 칩)
    charts: null,          // { me:{...}, you:{...}, pair:{...} }
    busy: false
  };

  /* ── 토스트 ─────────────────────────────────────── */
  var toastTimer = null;
  function toast(msg) {
    var el = $('#toast');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    requestAnimationFrame(function () { el.classList.add('is-on'); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove('is-on');
      setTimeout(function () { el.hidden = true; }, 240);
    }, 2400);
  }

  /* ── 클립보드 ───────────────────────────────────── */
  /* ── 인스타 열기 ─────────────────────────────────
     폰: 앱 스킴(instagram://app) 먼저 → 앱이 없으면 웹으로.
     웹·PC: 새 창. 어느 쪽이든 버튼 누른 흐름 안에서 끝나게 한다. */
  function openInstagram() {
    var ua = (navigator.userAgent || '');
    var mobile = /Android|iPhone|iPad|iPod/i.test(ua);
    if (!mobile) {
      /* 새 창으로 — window.open + noopener 는 null 을 돌려주므로, 현재 창까지 넘어가지 않게 링크 클릭으로 연다 */
      var a = doc.createElement('a');
      a.href = INSTA_WEB; a.target = '_blank'; a.rel = 'noopener noreferrer';
      doc.body.appendChild(a);
      try { a.click(); } catch (e) {}
      a.parentNode && a.parentNode.removeChild(a);
      return;
    }
    var left = false;
    function onLeave() { left = true; }
    doc.addEventListener('visibilitychange', onLeave);
    window.addEventListener('pagehide', onLeave);
    setTimeout(function () {
      doc.removeEventListener('visibilitychange', onLeave);
      window.removeEventListener('pagehide', onLeave);
      if (!left && doc.visibilityState === 'visible') location.href = INSTA_WEB;
    }, 1100);
    try { location.href = 'instagram://app'; } catch (e) { location.href = INSTA_WEB; }
  }

  function copyText(text) {
    return new Promise(function (resolve) {
      if (navigator.clipboard && global.isSecureContext) {
        navigator.clipboard.writeText(text).then(function () { resolve(true); }, function () { resolve(legacyCopy(text)); });
        return;
      }
      resolve(legacyCopy(text));
    });
  }
  function legacyCopy(text) {
    var ta = doc.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    doc.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = doc.execCommand('copy'); } catch (e) { ok = false; }
    doc.body.removeChild(ta);
    return ok;
  }

  /* ── 초대 코드·링크 ─────────────────────────────── */
  function myCode() { return (state.profile && state.profile.invite_code) || ''; }
  /* 친구가 받는 초대 링크는 달력 메인(/calendar/?ref=코드)이다 — 7일 체험·액운 1회가 바로 열린다.
     2026-11-24부터 보내는 링크는 언제나 이 하나(?ref=)뿐 — 케미 사주(?chemi=)는 주소에 싣지 않는다. */
  function myLink(withCode) {
    var code = myCode();
    if (code && withCode !== false) return CALENDAR_LIVE_BASE + '?ref=' + encodeURIComponent(code);
    return CALENDAR_LIVE_BASE;
  }
  function myDisplayLink() {
    return myCode() ? CALENDAR_LIVE_BASE + '?ref=' + encodeURIComponent(myCode()) : CALENDAR_LIVE_BASE + '?ref=내코드';
  }
  function shareLine() {
    return SHARE_TEXT + '\n' + myLink();
  }

  /* ── 로그인 (Supabase) ──────────────────────────── */
  var sb = null;

  /* 주소 파라미터 — ?ref= · ?autologin=1 등 */
  function queryParam(name) {
    try { return new URLSearchParams(location.search).get(name) || ''; } catch (e) { return ''; }
  }
  /* 방금 카카오에서 돌아온 주소인가 (?code= 는 PKCE 교환 직전, #access_token= 은 예전 흐름) */
  function oauthBack() {
    return !!queryParam('code') || !!queryParam('error') || /access_token=|error=/.test(location.hash);
  }
  /* 스크립트를 읽은 순간의 값 — supabase-js 가 주소의 ?code= 를 지워 버리기 전에 잡아 둔다 */
  var OAUTH_BACK = oauthBack();
  /* 달력의 '카톡 3초 연결 → 수호 부적' 카드로 들어왔으면 이 탭에 표시해 둔다
     (카카오는 주소의 ?next= 를 지우고 돌아오니까 — 2026-11-23 2차) */
  try { if (queryParam('next') === 'talis') sessionStorage.setItem(NEXT_TALIS_KEY, '1'); } catch (e) {}
  /** 연결이 끝났으면 달력으로 돌아가 내 수호 부적을 바로 연다 */
  function returnToTalis() {
    var want = false;
    try { want = sessionStorage.getItem(NEXT_TALIS_KEY) === '1'; } catch (e) { want = false; }
    if (!want || !state.user) return false;
    try { sessionStorage.removeItem(NEXT_TALIS_KEY); } catch (e) {}
    location.replace('../#talis');
    return true;
  }
  /** 초대 링크의 원터치 연결로 넘어온 흐름인가 — 카톡/카카오를 다녀와도 같은 탭이면 남는다 */
  function inviteFlow() {
    try { return sessionStorage.getItem(INVITE_FLOW_KEY) === '1'; } catch (e) { return false; }
  }

  /* 초대 링크의 '카카오 3초 연결하기'로 넘어온 손님 — 로그인 화면을 거치지 않고 바로 카카오로 보낸다.
     무한 리다이렉트를 막는 세 가지 문지기:
       ① 이미 로그인된 손님이면 보내지 않는다(연결은 loadProfile→attachPendingRef 가 한다)
       ② 방금 카카오에서 돌아온 참(?code=·?error=)이면 다시 보내지 않는다
       ③ 이 탭에서 한 번 보냈으면 다시 보내지 않는다 — 실패해도 화면에 머물러 수동 버튼을 쓴다 */
  function autoLoginWanted() {
    if (queryParam('autologin') !== '1') return false;
    if (state.user) return false;
    if (OAUTH_BACK) return false;
    try { if (sessionStorage.getItem(AUTOLOGIN_KEY)) return false; } catch (e) {}
    return true;
  }
  function startAutoLogin() {
    try { sessionStorage.setItem(AUTOLOGIN_KEY, String(Date.now())); } catch (e) {}
    var hint = $('#loginHint');
    if (hint) hint.textContent = '카카오로 연결하는 중이에요 — 잠시 뒤 카카오 화면으로 넘어가요.';
    onLogin();
  }

  function waitForSupabase(cb, tries) {
    tries = (tries == null) ? 24 : tries;
    if (global.supabase && global.supabase.createClient) return cb(global.supabase);
    if (tries <= 0) return cb(null);
    setTimeout(function () { waitForSupabase(cb, tries - 1); }, 250);
  }

  function initAuth() {
    waitForSupabase(function (lib) {
      if (!lib) {
        state.db = 'off';
        var hint = $('#loginHint');
        if (hint) hint.textContent = '로그인 연결을 불러오지 못했어요. 잠시 뒤 새로고침해 주세요. (케미 테스트는 그대로 쓸 수 있어요.)';
        var btn = $('#loginBtn');
        if (btn) { btn.classList.add('is-busy'); btn.disabled = true; }
        renderAuth(); renderLadder(); renderInvite();
        return;
      }
      sb = lib.createClient(SB_URL, SB_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
      sb.auth.getSession().then(function (r) {
        var ses = r && r.data ? r.data.session : null;
        applySession(ses);
        /* 초대 링크에서 원터치로 넘어온 손님 — 아직 로그인 전이면 바로 카카오로 (2026-11-22) */
        if (!ses && autoLoginWanted()) setTimeout(startAutoLogin, 120);
      }, function () {
        applySession(null);
        if (autoLoginWanted()) setTimeout(startAutoLogin, 120);
      });
      sb.auth.onAuthStateChange(function (ev, session) {
        if (ev === 'SIGNED_OUT') { applySession(null); return; }
        if (ev === 'SIGNED_IN' || ev === 'TOKEN_REFRESHED' || ev === 'USER_UPDATED') {
          setTimeout(function () { applySession(session); }, 0);
        }
      });
      var bt = $('#loginBtn');
      if (bt) bt.addEventListener('click', onLogin);
      var lo = $('#logoutBtn');
      if (lo) lo.addEventListener('click', onLogout);
    });
  }

  function onLogin(e, el) {
    if (e) e.preventDefault();
    if (!sb) { toast('로그인 연결을 불러오지 못했어요. 잠시 뒤 다시 눌러 주세요.'); return; }
    var btn = el || $('#loginBtn');
    if (btn) { btn.classList.add('is-busy'); btn.innerHTML = '<span class="btn__ic" aria-hidden="true">💬</span><span>카카오로 이동 중…</span>'; }
    /* 로그인 창을 열지 못했을 때 — 버튼 이름을 제자리로 (grow 카드 버튼은 문구가 다르다) */
    function restore() {
      if (!btn) return;
      btn.classList.remove('is-busy');
      if (btn.id === 'growShareBtn') { updateGrow(); return; }
      btn.innerHTML = '<span class="btn__ic" aria-hidden="true">💬</span><span>카카오로 시작하기</span>';
    }
    sb.auth.signInWithOAuth({
      provider: 'kakao',
      options: { redirectTo: location.origin === 'https://ksy7900-star.github.io' ? LIVE_BASE : (location.origin + location.pathname) }
    }).then(function (r) {
      if (r && r.error) {
        restore();
        toast('카카오 로그인을 열지 못했어요: ' + (r.error.message || ''));
      }
    }, function (err) {
      restore();
      toast('카카오 로그인을 열지 못했어요: ' + ((err && err.message) || ''));
    });
  }

  /* ── 로그인 전에 넣은 사주를 세션에 잠깐 쟁여 둔다 ─────────
     카카오 로그인은 페이지를 떠났다 돌아오므로 sessionStorage에 남겨야
     돌아온 직후 같은 탭에서 결과가 바로 열린다. */
  function rawPerson(which) {
    var leap = $('#' + which + 'Leap');
    return {
      name: ($('#' + which + 'Name').value || '').trim(),
      gender: state[which].gender || '',
      calendar: state[which].calendar === 'lunar' ? 'lunar' : 'solar',
      leap: !!(leap && leap.checked),
      timeKnown: state[which].timeKnown !== false,
      hh: $('#' + which + 'Hour').value,
      mm: $('#' + which + 'Minute').value,
      y: $('#' + which + 'Year').value,
      mo: $('#' + which + 'Month').value,
      d: $('#' + which + 'Day').value
    };
  }
  function saveGate() {
    try {
      sessionStorage.setItem(GATE_KEY, JSON.stringify({ me: rawPerson('me'), you: rawPerson('you'), t: Date.now() }));
    } catch (e) {}
  }
  function peekGate() {
    var o = null;
    try { o = JSON.parse(sessionStorage.getItem(GATE_KEY) || 'null'); } catch (e) { o = null; }
    return (o && o.me && o.you) ? o : null;
  }
  function clearGate() {
    try { sessionStorage.removeItem(GATE_KEY); } catch (e) {}
  }
  function restorePerson(which, o) {
    if (!o) return;
    var known = o.timeKnown !== false && o.hh !== '' && o.hh != null;
    applyDate(which, {
      calendar: o.calendar, leap: !!o.leap,
      y: Number(o.y), m: Number(o.mo), d: Number(o.d),
      timeKnown: known, hh: known ? Number(o.hh) : 12, mm: known ? (o.mm === '' ? 0 : Number(o.mm)) : 0,
      name: o.name, gender: o.gender
    });
  }
  /* 로그인돌아온 직후 — 쟁여 둔 사주로 결과를 바로 이어서 연다 */
  function resumeGate() {
    var o = peekGate();
    if (!o) return false;
    restorePerson('me', o.me);
    restorePerson('you', o.you);
    clearGate();
    runChemin(true);
    return true;
  }

  /* ── 케미 결과 로그인 잠금 — 걷어 냄 (2026-11-23 3차 김나영 님) ─────────
     "케미테스트를 로그인으로 먼저 막지 말고, 두 사람 생년월일 입력 → 케미 점수·부적이 먼저 바로"
     → 결과를 막던 화면은 지웠다. 로그인은 결과 아래 초대·사다리 안내에서 권한다.
     (아래 renderGate 는 되돌릴 때를 위해 남겨 두지 않고 함께 삭제했다) */

  function onLogout(e) {
    if (e) e.preventDefault();
    if (!sb) return;
    sb.auth.signOut().then(function () {
      state.profile = null; state.invited = 0; state.demo = null; state.db = 'idle';
      applySession(null);
      toast('로그아웃했어요.');
    }, function () { toast('로그아웃하지 못했어요. 잠시 뒤 다시 눌러 주세요.'); });
  }

  function applySession(session) {
    state.session = session || null;
    state.user = session && session.user ? session.user : null;
    if (!state.user) {
      state.profile = null; state.invited = 0;
      if (state.db !== 'off') state.db = 'idle';
      renderAuth(); renderLadder(); renderInvite(); renderRefBanner();
      return;
    }
    if (returnToTalis()) return;          // 카톡 연결 → 달력 #talis (수호 부적)
    renderAuth(); renderLadder(); renderInvite();
    loadProfile();
    /* 카카오로 돌아왔는데 붙일 초대 코드가 없을 때(코드가 이미 비워졌거나 기억이 지워졌을 때)도
       '연결은 끝났다'를 알린다 — 단, 이미 연결 완료 안내가 떠 있으면 겹쳐 보이지 않는다 */
    if (OAUTH_BACK && inviteFlow()) {
      setTimeout(function () {
        var done = $('#inviteDone');
        if (state.user && !state.refPending && done && done.hidden) showInviteDone('linked');
      }, 1500);
    }
    // 로그인하고 돌아왔으면 쟁여 둔 사주로 케미 결과를 바로 이어서 연다 (2026-11-21)
    setTimeout(function () { if (state.user && peekGate()) resumeGate(); }, 60);
  }

  function loadProfile() {
    if (!sb || !state.user) return;
    var uid = state.user.id;
    var BASE = 'invite_code, nickname, avatar_url, tier, paid_until, burn_credits, referred_by';
    /* paid_tier 컬럼(003 마이그레이션)이 아직 없을 수도 있다 —
       컬럼을 넣어 보고, 없으면 예전 칸만으로 다시 읽어 화면이 깨지지 않게 한다. */
    function run(withPaid) {
      sb.from('profiles')
        .select(withPaid ? BASE + ', paid_tier, paid_updated_at' : BASE)
        .eq('id', uid).maybeSingle()
        .then(function (r) {
          if (withPaid && r.error && isMissingColumn(r.error)) { run(false); return; }
          onProfile(r);
        }, function (err) {
          if (withPaid) { run(false); return; }
          state.db = 'unavailable';
          state.dbMsg = (err && err.message) || 'network';
          renderAuth(); renderLadder(); renderInvite();
        });
    }
    function onProfile(r) {
        if (r.error) {
          // 테이블이 아직 없을 때(PGRST205 / 42P01 / 404) — 화면은 그대로 두고 안내만
          state.db = 'unavailable';
          state.dbMsg = r.error.code || r.error.message || '';
        } else if (!r.data) {
          state.db = 'pending';
          state.dbMsg = '';
        } else {
          state.db = 'live';
          state.dbMsg = '';
          state.profile = r.data;
          /* 회원 DB 의 결제 등급 → 이 화면의 사다리 분기 (2026-11-22)
             다른 브라우저로 열어도 자기 등급에 맞는 사다리 딱 1개만 보이게. */
          var pt = r.data.paid_tier;
          if (TIER_RANK[pt]) {
            state.paidTier = pt;
            syncUnlockTier(pt);
          } else if (!state.paidTier) {
            state.paidTier = readLocalTier();
          }
        }
        renderAuth(); renderLadder(); renderInvite(); renderRefBanner();
        if (state.db === 'live') loadInviteCount();
        attachPendingRef();
    }
    run(true);
  }

  /** paid_tier 컬럼이 아직 없을 때 오는 오류인가 (42703 undefined_column / PGRST204) */
  function isMissingColumn(err) {
    var code = (err && err.code) || '';
    var msg = (err && err.message) || '';
    return code === '42703' || code === 'PGRST204' || /paid_tier|paid_updated_at/.test(msg);
  }

  function loadInviteCount() {
    if (!sb || !state.user) return;
    sb.from('referrals')
      .select('id', { count: 'exact', head: true })
      .eq('referrer_id', state.user.id)
      .then(function (r) {
        if (r.error) return;
        state.invited = r.count || 0;
        renderLadder();
      }, function () {});
  }

  /* 초대 코드 연결 — DB에 attach_referrer RPC가 있으면 그걸로, 없으면 조용히 대기 */
  function attachPendingRef() {
    if (!sb || !state.user || !state.refPending || state.db !== 'live') return;
    var code = state.refPending;
    sb.rpc('attach_referrer', { p_code: code }).then(function (r) {
      if (r.error) return;                       // 함수가 아직 없으면 다음에 다시 시도
      var v = r.data;
      if (v === 'ok' || v === 'attached') {
        clearPendingRef();
        showInviteDone(v === 'ok' ? 'done' : 'again');
        loadInviteCount();
      } else if (v === 'already') {
        /* 이미 다른 사람 코드로 붙은 계정 — 한 계정에 한 번만 붙는다(어뷰징 방지) */
        clearPendingRef();
        showInviteDone('already');
      } else if (v === 'invalid' || v === 'self') {
        clearPendingRef();
        toast(v === 'self' ? '내 코드는 내가 쓸 수 없어요.' : '초대 코드를 찾지 못했어요 — 달력은 그대로 쓰실 수 있어요.');
      }
    }, function () {});
  }

  /* ── ✅ 초대 연결 완료 안내 ────────────────────────────
     달력의 '카카오 3초 연결'을 마치고 돌아온 손님에게, 결과보다 먼저 '연결됐다'를 보여 주고
     달력으로 돌아갈 버튼을 준다. 숫자는 지어내지 않는다 — 보상은 서버(referral)가 준다. */
  function showInviteDone(kind) {
    var el = $('#inviteDone');
    if (!el) return;
    var t = $('#inviteDoneT'), s = $('#inviteDoneS');
    if (kind === 'already') {
      if (t) t.textContent = '이미 다른 초대 코드가 연결된 계정이에요';
      if (s) s.textContent = '한 계정에는 초대 코드가 한 번만 붙어요. 달력 7일 체험은 그대로 쓰실 수 있어요.';
    } else if (kind === 'again') {
      if (t) t.textContent = '✅ 연결 완료!';
      if (s) s.textContent = '이미 연결돼 있던 계정이에요 — 달력으로 돌아가면 7일 무료가 기다리고 있어요.';
    } else if (kind === 'linked') {
      if (t) t.textContent = '✅ 카카오 연결 완료!';
      if (s) s.textContent = '이제 내 초대 코드와 사다리가 이 계정에 쌓여요.';
    } else {
      if (t) t.textContent = '✅ 연결 완료!';
      if (s) s.textContent = '초대해 준 친구에게도 혜택이 쌓였어요 — 달력으로 돌아가면 7일 무료가 열려 있어요.';
    }
    el.hidden = false;
    var rb = $('#refBanner');
    if (rb) rb.hidden = true;                    // 같은 내용을 두 줄로 겹쳐 보이지 않게
    try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
  }

  function pendingRef() {
    var v = '';
    try { v = localStorage.getItem(REF_KEY) || ''; } catch (e) { v = ''; }
    return /^[A-Z0-9]{4,12}$/.test(v) ? v.toUpperCase() : '';
  }
  function clearPendingRef() {
    state.refPending = '';
    try { localStorage.removeItem(REF_KEY); localStorage.removeItem(REF_FROM_KEY); } catch (e) {}
    renderRefBanner();
  }
  function storedRefFrom() {
    var v = '';
    try { v = localStorage.getItem(REF_FROM_KEY) || ''; } catch (e) { v = ''; }
    return v.slice(0, 12);
  }

  /* ── 화면: 로그인 ───────────────────────────────── */
  function renderAuth() {
    var out = $('#authOut'), inn = $('#authIn');
    if (!out || !inn) return;
    var on = !!state.user;
    out.hidden = on;
    inn.hidden = !on;
    if (!on) {
      $('#authTitle').textContent = '카카오로 연결하면 끝나요';
      $('#authSub').textContent = '닉네임과 이메일만 받아요. 두 사람 케미 결과는 이 앱에서만 열 수 있어요.';
      return;
    }
    var u = state.user, meta = u.user_metadata || {};
    var nick = meta.nickname || meta.name || meta.full_name || meta.preferred_username
      || (u.email ? u.email.split('@')[0] : '회원');
    var mail = u.email || (meta.email || '');
    var av = meta.avatar_url || meta.picture || '';

    $('#authTitle').textContent = '로그인됐어요';
    $('#authSub').textContent = '이 계정으로 초대 실적이 쌓입니다.';
    $('#whoName').textContent = nick;
    $('#whoMail').textContent = mail || '카카오 계정';
    var avEl = $('#whoAv');
    if (/^https:\/\//.test(av)) {
      avEl.textContent = '';
      avEl.style.backgroundImage = 'url("' + av.replace(/"/g, '%22') + '")';
    } else {
      avEl.style.backgroundImage = '';
      avEl.textContent = String(nick).slice(0, 1);
    }

    var note = $('#dbNote');
    note.hidden = false;
    if (state.db === 'unavailable') {
      note.textContent = '회원 정보를 지금 불러오지 못했어요. 로그인과 계정 정보는 정상입니다 — 잠시 뒤 새로고침하면 초대 코드와 사다리 숫자가 채워집니다.';
    } else if (state.db === 'pending') {
      note.textContent = '프로필이 아직 만들어지지 않았어요. 잠시 뒤 새로고침하면 자동으로 채워집니다.';
    } else if (state.db === 'idle') {
      note.textContent = '내 기록을 불러오는 중…';
    } else {
      note.hidden = true;
    }
  }

  /* ── 화면: 사다리 ───────────────────────────────── */
  function effCount() {
    if (state.demo !== null) return state.demo;
    return state.invited;
  }
  function renderLadder() {
    var cnt = effCount();
    var LAD = ladderFor(state.paidTier);
    var nm = $('#cntNum'), nx = $('#cntNext');
    if (nm) nm.textContent = String(cnt);
    var next = null;
    for (var i = 0; i < LAD.length; i++) if (cnt < LAD[i].n) { next = LAD[i]; break; }
    if (nx) {
      if (state.demo !== null) nx.innerHTML = '미리보기 숫자예요';
      else if (!state.user) nx.innerHTML = '로그인하면 내 숫자로 바뀌어요';
      else if (state.db === 'unavailable') nx.innerHTML = '실적을 다시 확인하는 중이에요';
      else if (state.db === 'pending') nx.innerHTML = '프로필이 만들어지면 채워져요';
      else if (!next) nx.innerHTML = '사다리 끝까지 왔어요';
      else nx.innerHTML = '다음 칸까지 <b>' + (next.n - cnt) + '명</b>';
    }

    var fill = $('#railFill');
    if (fill) {
      var topN = LAD[LAD.length - 1].n || 7;      /* 마지막 칸(7명)을 100%로 — 10명 고정값을 뺐다 */
      fill.style.width = Math.min(100, (cnt / topN) * 100) + '%';
    }

    var marks = $('#railMarks');
    if (marks && marks.getAttribute('data-kind') !== (state.paidTier || 'free')) {
      marks.setAttribute('data-kind', state.paidTier || 'free');
      var topM = LAD[LAD.length - 1].n || 7;
      marks.innerHTML = LAD.map(function (r) {
        return '<span class="rail__mark" data-n="' + r.n + '" style="left:' + (r.n / topM * 100) + '%">' + r.n + '</span>';
      }).join('');
    }
    if (marks) {
      $$('.rail__mark', marks).forEach(function (el) {
        el.classList.toggle('is-on', cnt >= Number(el.getAttribute('data-n')));
      });
    }

    var ul = $('#rungs');
    if (ul) {
      var targetN = next ? next.n : null;
      ul.innerHTML = LAD.map(function (r) {
        var done = cnt >= r.n;
        var cls = 'rung' + (done ? ' is-done' : (r.n === targetN ? ' is-target' : ' is-locked'));
        var st = done ? '달성' : (r.n === targetN ? (r.n - cnt) + '명 남음' : '잠김');
        return '<li class="' + cls + '">'
          + '<span class="rung__no">' + r.n + '</span>'
          + '<span class="rung__body"><b class="rung__title">' + esc(r.title) + '</b>'
          + '<span class="rung__sub">친구 ' + r.n + '명 · ' + esc(r.sub) + '</span></span>'
          + '<span class="rung__state">' + esc(st) + '</span>'
          + '</li>';
      }).join('');
    }

    /* 지금 어느 사다리를 보고 있는지 한 줄로 — 두 사다리를 동시에 띄우지 않는다 (2026-11-22) */
    var tn = $('#ladderTier');
    if (tn) {
      if (state.paidTier) {
        tn.hidden = false;
        tn.innerHTML = '🎫 <b>내 사주 타이밍 달력</b> 결제자예요 — 달력은 이미 다 열려 있고, 5명·7명 칸의 <b>1:1 상담 할인</b>이 더 붙어요';
      } else {
        tn.hidden = true;
        tn.innerHTML = '';
      }
    }
    var note = $('#ladderNote');
    if (note) {
      note.innerHTML = state.paidTier
        ? '달력은 이미 다 열려 있어요 — 사다리에서는 <b>5명 상담 1만원 할인</b>과 <b>7명 원포인트 반값</b>만 더 챙기면 돼요. 인스타 <b>@' + INSTA + '</b> 인증 <b>+1개월</b>은 사다리와 별개예요.'
        : '사다리는 <b>1 · 3 · 5 · 7명</b> 네 칸 — 친구가 내 링크로 로그인하면 그만큼 <b>내 사주 타이밍 달력</b>이 넓어져요. 인스타 <b>@' + INSTA + '</b> 인증 <b>+1개월</b>은 사다리와 별개예요.';
    }

    var pv = $('#previewRow');
    if (pv) {
      var show = !state.user || state.db === 'unavailable' || state.db === 'pending' || state.db === 'off' || state.demo !== null;
      pv.hidden = !show;
      if (show) {
        var chips = $('#previewChips');
        if (chips) {
          var vals = [null, 0, 1, 3, 5, 7];
          chips.innerHTML = vals.map(function (v) {
            var on = (state.demo === v) || (v === null && state.demo === null);
            return '<button type="button" class="pchip' + (on ? ' is-on' : '') + '" data-v="' + (v === null ? 'real' : v) + '">'
              + (v === null ? '내 숫자' : v + '명') + '</button>';
          }).join('');
          if (!chips.getAttribute('data-bound')) {
            chips.setAttribute('data-bound', '1');
            chips.addEventListener('click', function (e) {
              var b = e.target.closest ? e.target.closest('.pchip') : null;
              if (!b) return;
              var v = b.getAttribute('data-v');
              state.demo = (v === 'real') ? null : Number(v);
              renderLadder();
              if (state.demo !== null) toast('미리보기예요 — 실제 실적 숫자가 아니에요.');
            });
          }
        }
      }
    }
    updateGrow();          // 케미 결과의 grow 카드 — 로그인·추천 숫자가 바뀌면 바로 따라온다
  }

  /* ── 화면: 초대 링크 ────────────────────────────── */
  function renderInvite() {
    var code = myCode();
    var cEl = $('#myCode');
    if (cEl) cEl.textContent = code || '····';
    var lEl = $('#myLink');
    if (lEl) lEl.textContent = myDisplayLink();
    var cBtn = $('#copyLinkBtn'), tBtn = $('#copyTextBtn');
    if (cBtn && !cBtn.getAttribute('data-bound')) {
      cBtn.setAttribute('data-bound', '1');
      cBtn.addEventListener('click', function () { onCopyLink(); });
      tBtn.addEventListener('click', function () { onCopyText(); });
    }
  }

  function onCopyLink() {
    if (!state.user) { toast('로그인하면 내 코드가 담긴 링크가 만들어져요.'); return; }
    if (!myCode()) {
      copyText(myLink(false)).then(function (ok) {
        toast(ok ? '초대 코드 연결 전이라 코드 없이 복사했어요.' : '복사가 안 됐어요. 링크를 길게 눌러 복사해 주세요.');
      });
      return;
    }
    copyText(myLink()).then(function (ok) {
      toast(ok ? '초대 링크를 복사했어요. 친구에게 붙여 넣기만 하세요.' : '복사가 안 됐어요. 링크를 길게 눌러 복사해 주세요.');
    });
  }

  function onCopyText() {
    if (!state.user) { toast('로그인하면 내 링크가 담긴 문구가 만들어져요.'); return; }
    var text = shareLine();
    if (navigator.share) {
      navigator.share({ title: '내 사주 타이밍 달력', text: text }).then(function () {}, function () {
        copyText(text).then(function (ok) { toast(ok ? '공유 문구를 복사했어요.' : '복사가 안 됐어요.'); });
      });
      return;
    }
    copyText(text).then(function (ok) { toast(ok ? '공유 문구를 복사했어요.' : '복사가 안 됐어요.'); });
  }

  function renderRefBanner() {
    var el = $('#refBanner');
    if (!el) return;
    var show = !!state.refPending;
    el.hidden = !show;
    if (show) {
      var t = $('#refBannerTitle');
      if (t) t.textContent = state.refFrom
        ? esc(state.refFrom) + '님이 보낸 초대 링크예요'
        : '초대 링크로 들어오셨어요';
    }
  }

  /* ── 케미: 관계 칩 (👯 우정 · 💘 사랑) ─────────────
     같은 사주라도 결과 카피와 부적이 완전히 달라진다. */
  function renderRelChips() {
    var box = $('#relChips');
    if (!box) return;
    $$('.relchip', box).forEach(function (b) {
      var on = b.getAttribute('data-rel') === relNow();
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    var lb = $('#youLabel');
    if (lb) {
      var peer = state.refFrom || ($('#youName') ? $('#youName').value : '');
      lb.textContent = peer ? peer + ' 님 사주'
        : (relNow() === 'love' ? '그 사람 사주' : '친구 · 동료 사주');
    }
  }
  function bindRelChips() {
    var box = $('#relChips');
    if (!box || box.getAttribute('data-bound')) return;
    box.setAttribute('data-bound', '1');
    box.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.relchip') : null;
      if (!b) return;
      state.rel = b.getAttribute('data-rel') === 'love' ? 'love' : 'friend';
      renderRelChips();
      hideResult();
    });
  }

  /* ── 케미: 입력 ───────────────────────────────────
     라이브 /calendar/ 와 같은 방식 — 양력·음력·윤달 + 년/월/일 + 12지시·시분 + '몰라요'.
     기존 <input type="date"> 는 안드로이드 네이버 앱에서 1979년까지 넘기기 어렵고,
     음력·윤달을 구분할 수 없어 음력 생일을 넣으면 만세력이 틀어졌다. */
  function buildPickers(which) {
    var nowY = new Date().getFullYear();
    var o = '<option value="">년</option>';
    for (var y = nowY; y >= 1940; y--) o += '<option value="' + y + '">' + y + '년</option>';
    $('#' + which + 'Year').innerHTML = o;

    o = '<option value="">월</option>';
    for (var m = 1; m <= 12; m++) o += '<option value="' + m + '">' + m + '월</option>';
    $('#' + which + 'Month').innerHTML = o;

    o = '<option value="">시</option>';
    for (var h = 0; h < 24; h++) o += '<option value="' + h + '">' + pad2(h) + '시</option>';
    $('#' + which + 'Hour').innerHTML = o;

    o = '<option value="">분</option>';
    for (var mi = 0; mi < 60; mi += 30) o += '<option value="' + mi + '">' + pad2(mi) + '분</option>';
    $('#' + which + 'Minute').innerHTML = o;

    $('#' + which + 'Jisi').innerHTML = M.JISI.map(function (j) {
      return '<button type="button" class="jisi__btn" data-idx="' + j.idx + '"' +
        ' data-hour="' + Math.floor(j.rep / 60) + '" data-min="' + (j.rep % 60) + '">' + j.ko +
        '<small>' + j.start + '~' + j.end + '</small></button>';
    }).join('');

    fillDays(which);
  }

  function fillDays(which) {
    var y = $('#' + which + 'Year').value, m = $('#' + which + 'Month').value;
    var max = 31;
    if (y && m) {
      max = new Date(Number(y), Number(m), 0).getDate();
      if (state[which].calendar === 'lunar') max = 30;
    }
    var cur = $('#' + which + 'Day').value;
    var o = '<option value="">일</option>';
    for (var d = 1; d <= max; d++) o += '<option value="' + d + '">' + d + '일</option>';
    var sel = $('#' + which + 'Day');
    sel.innerHTML = o;
    if (cur && Number(cur) <= max) sel.value = cur;
  }

  function syncJisi(which) {
    var h = $('#' + which + 'Hour').value, mi = $('#' + which + 'Minute').value;
    var on = (h !== '' && mi !== '');
    var idx = on ? M.jisiIndex(Number(h), Number(mi)) : -1;
    $$('#' + which + 'Jisi .jisi__btn').forEach(function (b) {
      b.classList.toggle('is-on', Number(b.getAttribute('data-idx')) === idx);
    });
    var hint = $('#' + which + 'TimeHint');
    if (hint) hint.textContent = (on && idx >= 0) ? M.JISI[idx].ko + '시' : '';
  }

  function setCal(which, cal) {
    state[which].calendar = cal === 'lunar' ? 'lunar' : 'solar';
    $$('#' + which + 'Cal .seg').forEach(function (b) {
      var on = b.getAttribute('data-cal') === state[which].calendar;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    var leapRow = $('#' + which + 'LeapRow');
    if (leapRow) leapRow.hidden = state[which].calendar !== 'lunar';
    var lb = $('#' + which + 'DateLabel');
    if (lb) lb.textContent = state[which].calendar === 'lunar' ? '음력 생년월일' : '생년월일';
    fillDays(which);
  }

  function setGender(which, g) {
    state[which].gender = (g === 'M' || g === 'F') ? g : '';
    var box = $('#' + which + 'Gender');
    if (box) $$('.chip', box).forEach(function (c) {
      c.setAttribute('aria-pressed', String(c.getAttribute('data-gender') === state[which].gender));
    });
  }

  function showTimeBox(which) {
    var known = state[which].timeKnown !== false;
    var box = $('#' + which + 'TimeBox');
    if (box) box.hidden = !known;
    var note = $('#' + which + 'TimeNote');
    if (note) note.hidden = !known;
    var unkNote = $('#' + which + 'TimeUnknownNote');
    if (unkNote) unkNote.hidden = known;
  }

  function hideResult() {
    var box = $('#chemiResult');
    if (box && !box.hidden) box.hidden = true;
  }

  /* 저장된 사주·케미 링크의 날짜를 입력 폼에 그대로 앉힌다 */
  function applyDate(which, o) {
    setCal(which, o.calendar === 'lunar' ? 'lunar' : 'solar');
    var leap = $('#' + which + 'Leap');
    if (leap) leap.checked = !!o.leap;
    $('#' + which + 'Year').value = o.y;
    $('#' + which + 'Month').value = o.mo != null ? o.mo : o.m;
    fillDays(which);
    $('#' + which + 'Day').value = o.d;

    var known = o.timeKnown !== false && o.hh != null && o.mm != null;
    state[which].timeKnown = known;
    var unk = $('#' + which + 'TimeUnknown');
    if (unk) unk.checked = !known;
    showTimeBox(which);
    $('#' + which + 'Hour').value = known ? o.hh : '';
    $('#' + which + 'Minute').value = known ? o.mm : '';
    syncJisi(which);

    if (o.name && !$('#' + which + 'Name').value) $('#' + which + 'Name').value = o.name;
    if (o.gender) setGender(which, o.gender);
  }

  function bindPerson(which) {
    buildPickers(which);

    var g = $('#' + which + 'Gender');
    if (g) {
      g.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('.chip') : null;
        if (!b) return;
        var v = b.getAttribute('data-gender');
        state[which].gender = (state[which].gender === v) ? '' : v;
        $$('.chip', g).forEach(function (c) {
          c.setAttribute('aria-pressed', String(c.getAttribute('data-gender') === state[which].gender));
        });
        hideResult();
      });
    }

    var cal = $('#' + which + 'Cal');
    if (cal) cal.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.seg') : null;
      if (!b) return;
      setCal(which, b.getAttribute('data-cal'));
      hideResult();
    });

    var leap = $('#' + which + 'Leap');
    if (leap) leap.addEventListener('change', function () {
      state[which].leap = leap.checked;
      hideResult();
    });

    var unk = $('#' + which + 'TimeUnknown');
    if (unk) unk.addEventListener('change', function () {
      state[which].timeKnown = !unk.checked;
      showTimeBox(which);
      hideResult();
    });

    var jisi = $('#' + which + 'Jisi');
    if (jisi) jisi.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.jisi__btn') : null;
      if (!b) return;
      $('#' + which + 'Hour').value = b.getAttribute('data-hour');
      $('#' + which + 'Minute').value = b.getAttribute('data-min');
      if (unk && unk.checked) {
        unk.checked = false;
        state[which].timeKnown = true;
        showTimeBox(which);
      }
      syncJisi(which);
      hideResult();
    });

    ['Hour', 'Minute'].forEach(function (k) {
      var el = $('#' + which + k);
      if (el) el.addEventListener('change', function () { syncJisi(which); hideResult(); });
    });
    ['Year', 'Month'].forEach(function (k) {
      var el = $('#' + which + k);
      if (el) el.addEventListener('change', function () { fillDays(which); hideResult(); });
    });
    var dayEl = $('#' + which + 'Day');
    if (dayEl) dayEl.addEventListener('change', hideResult);
  }

  function readPerson(which) {
    var p = {
      name: ($('#' + which + 'Name').value || '').trim(),
      gender: state[which].gender,
      calendar: state[which].calendar === 'lunar' ? 'lunar' : 'solar',
      leap: !!(state[which].calendar === 'lunar' && $('#' + which + 'Leap').checked),
      timeKnown: state[which].timeKnown !== false
    };

    var y = $('#' + which + 'Year').value, mo = $('#' + which + 'Month').value, d = $('#' + which + 'Day').value;
    if (!y || !mo || !d) {
      return { error: 'date', msg: (p.calendar === 'lunar' ? '음력 ' : '') + '생년월일을 년·월·일 모두 골라 주세요.' };
    }
    p.y = Number(y); p.mo = Number(mo); p.d = Number(d);
    if (p.y < 1900 || p.y > 2100) return { error: 'date', msg: '출생 연도를 다시 확인해 주세요.' };

    if (p.timeKnown) {
      var hh = $('#' + which + 'Hour').value, mm = $('#' + which + 'Minute').value;
      if (hh === '') {
        return { error: 'time', msg: '태어난 시간을 고르거나, 모르면 시간 옆의 "몰라요"를 켜 주세요.' };
      }
      p.hh = Number(hh);
      p.mm = mm === '' ? 0 : Number(mm);
    } else {
      p.hh = 12; p.mm = 0;
    }

    if (!p.gender) return { error: 'gender', msg: '성별을 골라 주세요 — 사주를 정확히 세우려면 필요해요.' };
    return { p: p };
  }

  /* ── 케미: 계산 ─────────────────────────────────── */
  var termCache = null;
  function terms() {
    if (!termCache) termCache = T.buildTerms('2026-01-01', '2027-12-31');
    return termCache;
  }

  function chartOf(p) {
    var o = {
      name: p.name || '', gender: p.gender,
      calendar: p.calendar === 'lunar' ? 'lunar' : 'solar',
      y: p.y, m: p.mo, d: p.d, leap: !!p.leap,
      timeKnown: !!p.timeKnown, hh: p.timeKnown ? p.hh : 12, mm: p.timeKnown ? p.mm : 0,
      region: 'seoul', longitude: 126.98,
      trueSolar: false, dst: false, ziRule: '23'
    };
    var res = M.compute(o);
    var natal = T.natalOf(res);
    return { p: p, res: res, natal: natal, counts: res.counts, need: natal.need };
  }

  function digestOf(ch) {
    var cache = {};
    var opt = {
      counts: ch.counts,
      info: function (iso) {
        if (!cache[iso]) cache[iso] = T.dayInfo(iso, ch.natal, terms());
        return cache[iso];
      }
    };
    var yd = T.yearDigest(2027, ch.natal, terms(), opt);   // 2027년 1~12월
    ch.yd = yd;
    ch.months = yd.months;
    ch.warnMonths = {};
    yd.warnMonths.forEach(function (n) { ch.warnMonths[n] = 1; });    // 달력과 같은 기준의 '조심할 달' TOP 3
    return ch.months;
  }

  /* 그 사람의 2027년 안에서 '힘이 붙는 달' — 자기 해의 상위 4달(조심할 달 제외). 사람마다 편차가 커서 절대 점수만으론 빈 달이 생긴다. */
  function hotMap(ch) {
    var arr = ch.months.slice().sort(function (x, y) { return y.chance - x.chance; });
    var set = {}, n = 0, i;
    for (i = 0; i < arr.length && n < 4; i++) {
      if (ch.warnMonths && ch.warnMonths[arr[i].m]) continue;
      set[arr[i].m] = 1; n++;
    }
    for (i = 0; i < arr.length && n < 3; i++) {          // 전부 조심할 달로 걸러졌을 때의 앙상방지
      if (!set[arr[i].m]) { set[arr[i].m] = 1; n++; }
    }
    return set;
  }
  function warnMap(ch) {
    var set = {};
    ch.months.forEach(function (m) { if (ch.warnMonths && ch.warnMonths[m.m]) set[m.m] = m; });
    return set;
  }

  /* ── 케미: 관계 · 카피 (2026-11-21 전면 개편) ──────────────
     김나영 님 지시: "케미는 27년 궁합의 다른 말", "육친·겹치는 날 말고
     위트 + 서로 보완할 점 + 챙길 점". 그래서 결과는 네 덩어리만 남긴다.
       ① 2027 한 줄 훅        ② 서로 보완할 점 (2줄)
       ③ 꼭 챙겨줄 점 (2줄)   ④ 딱 맞는 달 · 조심할 달
     오행 막대는 작은 요약 바로만 남기고, 명리 용어·육친·날짜 목록은 화면에서 뺀다. */
  var RELS = {
    friend: { key: 'friend', emoji: '👯', name: '우정 · 동료', word: '우정', card: '우정 부적', hanja: '友', peer: '친구' },
    love:   { key: 'love',   emoji: '💘', name: '사랑 · 썸',   word: '사랑', card: '사랑 부적', hanja: '愛', peer: '그 사람' }
  };
  function relNow() { return RELS[state.rel] ? state.rel : 'friend'; }
  /* 이름 뒤 조사까지 붙여 {aS}·{aO}·{aT} 로 쓴다 — '이지은가' 같은 어색한 말 방지 */
  function namesMap(a, b) {
    return {
      a: a, b: b,
      aS: josaFull(a, 'subj'), aO: josaFull(a, 'obj'), aT: josaFull(a, 'top'),
      bS: josaFull(b, 'subj'), bO: josaFull(b, 'obj'), bT: josaFull(b, 'top')
    };
  }
  function fill(t, m) {
    return String(t == null ? '' : t).replace(/\{(\w+)\}/g, function (_, k) {
      return (m && m[k] != null) ? esc(m[k]) : '';
    });
  }

  /* ── 조합 해시 ─────────────────────────────────────
     두 사람의 일간(10천간) · 일지(12지지) · 월지 · 부족/과다 오행 · 관계를 한 줄로 엮어
     숫자 하나로 접는다. 같은 사주 쌍이면 늘 같은 문구, 다른 사주를 넣으면 다른 문구.
     (2026-11-21 — 일지 관계 7갈래만으로는 사주가 달라도 결과가 겹쳐서 전면 확장) */
  function fnv32(str) {
    var h = 2166136261, i;
    for (i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }
  function mix32(h) {
    h ^= h >>> 16; h = Math.imul(h, 2246822507) >>> 0;
    h ^= h >>> 13; h = Math.imul(h, 3266489909) >>> 0;
    h ^= h >>> 16;
    return h >>> 0;
  }
  function pickFrom(arr, seed, salt) {
    if (typeof arr === 'string') return arr;
    if (!arr || !arr.length) return '';
    return arr[mix32(fnv32(seed + '#' + salt)) % arr.length];
  }
  /* 같은 문장이 두 번 나오지 않게 — 직전에 쓴 문장(avoid)과 같으면 그 풀 안에서 다음 문장으로 넘긴다.
     (2026-11-23 #16887 — 두 사람의 일간·오행이 같아 해시가 같은 자리에 떨어지면
      같은 한 줄이 두 번 나오던 문제. 2026-11-24: 한 풀 안에서 같은 뜻이 겹치지 않도록 문장도 다시 나눴다) */
  function pickAvoid(arr, seed, salt, avoid) {
    if (typeof arr === 'string') return arr;
    if (!arr || !arr.length) return '';
    var i = mix32(fnv32(seed + '#' + salt)) % arr.length;
    if (!avoid || arr[i] !== avoid) return arr[i];
    for (var k = 1; k < arr.length; k++) {
      var cand = arr[(i + k) % arr.length];
      if (cand !== avoid) return cand;
    }
    return arr[i];
  }
  function pairSeed(a, b, rel) {
    var s = [rel];
    [a, b].forEach(function (ch) {
      var n = ch.natal;
      s.push(n.dayGanIndex, n.dayZhiIndex, n.monthZhiIndex, n.yearZhiIndex,
        n.timeZhiIndex == null ? 'x' : n.timeZhiIndex);
      EL_ORDER.forEach(function (e) { s.push(ch.counts[e] || 0); });
    });
    s.push(zhiKeyOf(a, b), masterKeyOf(a, b));
    return s.join('.');
  }
  function personSeed(ch, rel) {
    var n = ch.natal, s = [rel];
    s.push(n.dayGanIndex, n.dayZhiIndex, n.monthZhiIndex, n.yearZhiIndex,
      n.timeZhiIndex == null ? 'x' : n.timeZhiIndex);
    EL_ORDER.forEach(function (e) { s.push(ch.counts[e] || 0); });
    return s.join('.');
  }

  /* ① 한 줄 훅 — 우정 24종 · 사랑 24종. 어느 쪽이 위도 아래도 아닌 문장만. */
  var HOOK = {
    friend: [
      '같이 있으면 일이든 놀든 굴러가는 콤비',
      '둘 다 삐끗해도 웃고 넘어가는 사이',
      '말 안 해도 어디로 갈지 같이 아는 콤비',
      '잘하는 게 달라서 안 부딪히는 조합',
      '같이 붙으면 멈춰 있던 일이 굴러가는 시너지',
      '서로 다른 속도가 만나 빈틈이 채워지는 조합',
      '한쪽이 흥분하면 다른 쪽이 웃어 주는 사이',
      '취향은 다른데 결론은 늘 같은 사이',
      '같이 다니면 왠지 일이 잘 풀리는 콤비',
      '말이 안 통해도 결국 같은 방향을 보는 사이',
      '둘이 모이면 셋 몫은 하는 콤비',
      '돈 얘기까지 편하게 하는 사이',
      '말버릇이 슬슬 옮아 가는 콤비',
      '급한 쪽과 느긋한 쪽이 딱 맞물리는 조합',
      '같은 농담에 같이 터지는 사이',
      '한 명이 계획 세우면 다른 한 명이 현실 챙기는 콤비',
      '아무 말 안 해도 어색하지 않은 사이',
      '부딪혀도 정리는 잘 되는 콤비',
      '이름만 불러도 뭐 할지 아는 사이',
      '모이면 이야기가 끊이지 않는 콤비',
      '같이 뭐든 벌이면 재밌어지는 사이',
      '서로의 빈틈을 귀찮아하지 않는 콤비',
      '험한 얘기도 웃으면서 하는 사이',
      '오래 안 봐도 어제 본 것 같은 사이',
      '한 명이 웃으면 분위기가 확 풀리는 콤비',
      '서로의 말투를 슬며시 흉내 내는 사이',
      '급할 때 서로의 이름부터 부르는 사이',
      '같이 계획만 세워도 신나는 콤비',
      '한 명이 늦으면 다른 한 명이 커피 시켜 두는 사이',
      '오늘 뭐 먹을지만 정하면 나머진 잘 풀리는 콤비'
    ],
    love: [
      '말 안 해도 눈빛으로 통하는 사이',
      '투닥거려도 결국 서로에게 돌아오는 사이',
      '서운한 건 그날 말해야 오래 가는 사이',
      '같은 곳을 보면 마음이 빨리 가까워지는 사이',
      '닮아서 편한데 가끔 둘 다 답답한 사이',
      '설레는 속도는 천천히, 오래 가는 사이',
      '한 명이 웃으면 다른 한 명도 따라 웃는 사이',
      '연락이 뜸해도 마음은 그대로인 사이',
      '같이 있으면 시간이 빨리 가는 사이',
      '서로의 하루를 제일 먼저 궁금해하는 사이',
      '다투고 나서 오히려 더 가까워지는 사이',
      '각자 바쁜데도 결국 같은 방향인 사이',
      '손잡으면 말이 필요 없어지는 사이',
      '한 명이 삐지면 다른 한 명이 먼저 웃기는 사이',
      '취향이 슬금슬금 섞여 가는 사이',
      '같은 꿈을 다른 방식으로 꾸는 사이',
      '편한데 설레는 사이가 제일 오래 가요',
      '하루 끝에 문득 보고 싶어지는 사이',
      '서로의 지도를 조금씩 바꿔 놓는 사이',
      '오래 봐도 새로워 보이는 사이',
      '말 한마디에 하루가 바뀌는 사이',
      '둘이면 어디서든 데이트가 되는 사이',
      '서로의 느린 부분을 기다려 주는 사이',
      '같이 늙어도 재밌을 것 같은 사이',
      '먼저 연락한 쪽이 지는 법이 없는 사이',
      '서로의 버릇을 다 알고도 좋은 사이',
      '같이 있으면 말이 조금 느려지는 사이',
      '한 명이 졸면 다른 한 명이 이불 덮어 주는 사이',
      '사소한 게 오래 기억에 남는 사이',
      '다음 만날 날을 서로 먼저 묻는 사이'
    ]
  };

  /* ② 훅 아래 한 줄 — 두 사람이 같이 있을 때 어떻게 돌아가는지.
     '받쳐 준다·맡아 주세요' 없이 대등하게, '기운이 흐르는 방향' 같은 말 없이. */
  var ROLE = {
    friend: {
      same: [
        '결이 비슷해서 말이 빨라요 — 둘 다 흥분하면 브레이크가 없는 게 유일한 흠이에요.',
        '비슷해서 통하는 게 많아요 — 대신 같이 지칠 땐 둘 다 나란히 늘어져요.',
        '생각하는 방향이 같아요 — 그래서 쉬는 날도 같이 정해 두면 편해요.'
      ],
      iFeedYou: [
        '같이 있으면 억지로 맞출 일이 없어요 — 그냥 편해요.',
        '한쪽 결이 다른 쪽으로 순하게 이어져요 — 편해도 일까지 늘어지지는 말기.',
        '서로 부드럽게 맞물려요 — 편하다는 게 이 조합의 제일 큰 장점이에요.'
      ],
      youFeedMe: [
        '한쪽이 다른 쪽을 편하게 해 줘요 — 받는 쪽은 고맙다고 말해 두면 좋아요.',
        '흐름이 한쪽으로 살짝 기울어요 — 그래서 컨디션이 엇갈리는 날이 있어요.',
        '한쪽이 먼저 챙기고 다른 쪽이 따라가요 — 어느 쪽인지는 그날그날 달라요.'
      ],
      iBeatYou: [
        '서로 누르는 힘이 조금씩 있어요 — 잘 맞으면 추진력, 안 맞으면 고집이 돼요.',
        '둘 다 물러서지 않는 날이 있어요 — 그날은 이기는 것보다 끝내는 게 나아요.',
        '함께하면 힘이 세지는 조합이에요 — 다만 부딪히면 둘 다 안 돌아서요.'
      ],
      youBeatMe: [
        '서로 누르는 힘이 조금씩 있어요 — 잘 맞으면 추진력, 안 맞으면 고집이 돼요.',
        '한쪽이 앞서려는 날이 있어요 — 그날은 다른 쪽도 한 발만 물러서면 풀려요.',
        '부딪히는 자리가 한 군데 있어요 — 그 자리만 피하면 나머지는 잘 맞아요.'
      ]
    },
    love: {
      same: [
        '결이 같아서 편하고, 같이 뜨거워지면 둘 다 타요 — 쉬는 날을 같이 정해 두세요.',
        '닮아서 말이 빨라요 — 대신 서운함도 똑같이 커져요.',
        '온도가 같아서 같이 뜨겁고 같이 식어요 — 중간 온도를 같이 만들어 두면 좋아요.'
      ],
      iFeedYou: [
        '한쪽 결이 다른 쪽에 순하게 닿아요 — 표현하는 쪽도 받는 쪽도 부담이 없어요.',
        '편안함이 이 조합의 힘이에요 — 그래서 다퉈도 금방 풀려요.',
        '서로 부드럽게 맞물려요 — 좋은 게 있으면 그날 말해 두기.'
      ],
      youFeedMe: [
        '한쪽이 다른 쪽을 편하게 해 줘요 — 받는 쪽은 고맙다고 자주 말해 주세요.',
        '흐름이 한쪽으로 살짝 기울어요 — 그 편안함을 당연하게 여기지 않기.',
        '한쪽이 먼저 다가가고 다른 쪽이 열려요 — 같은 날 기분이 반대로 갈 때도 있어요.'
      ],
      iBeatYou: [
        '끌리면서도 부딪히는 조합이에요 — 세게 말할 때 한 톤만 낮추면 달라져요.',
        '밀당이 저절로 생기는 사이예요 — 그만할 때를 둘이 정해 두면 편해요.',
        '부딪히는 자리가 한 군데 있어요 — 그 자리만 피하면 나머지는 잘 맞아요.'
      ],
      youBeatMe: [
        '끌리면서도 부딪히는 조합이에요 — 세게 말할 때 한 톤만 낮추면 달라져요.',
        '한쪽이 앞서려는 날이 있어요 — 그날은 다른 쪽도 한 발만 물러서면 풀려요.',
        '부딪히는 자리가 한 군데 있어요 — 그 자리만 피하면 나머지는 잘 맞아요.'
      ]
    }
  };

  /* ── ③ 각자 보완할 점 — 두 사주를 겹쳐서 고른다 (2026-11-22 전면 교체)
     김나영 님 지시: "다른 사람 넣어도 내 보완점이 똑같이 나온다", "힘이 얇아요 같은 말 말고
     사람이 쓰는 말로." 그래서 '내 사주에서 얇은 오행 하나' 방식을 버리고, 두 사주를 겹친
     결과로 갈래를 먼저 나눈다. 상대가 바뀌면 갈래부터 달라지고, 같은 갈래라도 문장이 다르다.
       ① 상대가 내 빈 곳을 채워 줌      → 기대지 않기
       ② 내가 상대 빈 곳을 채움         → 대신 챙기려 들지 않기
       ③ 둘 다 같은 기운이 과함         → 같이 과해지지 않기
       ④ 부딪히는 자리(충·형·해)        → 한 번 물러서기
       ⑤ 앞서는 힘(극)                  → 말 속도 낮추기
       ⑥ 너무 가까움(합·삼합·같은 기운)  → 선 지키기
       ⑦ 그 밖                          → 상대의 센 기운에 맞춰 내 몫 챙기기
     {pS}·{pO}·{pT}·{pC} 는 상대 이름(없으면 '친구'/'그 사람')에 조사를 붙인 말. */
  function peerWord(name, rel) {
    var n = String(name || '').trim();
    var p = n || ((RELS[rel] || RELS.friend).peer);
    return { p: p, pS: josaFull(p, 'subj'), pO: josaFull(p, 'obj'), pT: josaFull(p, 'top'),
      pC: p + josa(p, 'with'), pE: p + josa(p, 'copula') };
  }
  function pairLens(me, you) {
    var gaps = [], floods = [];
    EL_ORDER.forEach(function (e) {
      var cm = me.counts[e] || 0, cy = you.counts[e] || 0;
      if (cm <= 1 && cy >= 2) gaps.push({ el: e, dir: 'theyFill' });
      if (cy <= 1 && cm >= 2) gaps.push({ el: e, dir: 'iFill' });
      if (cm >= 3 && cy >= 3) floods.push(e);
    });
    return { gaps: gaps, floods: floods };
  }
  /* 그 사주의 가장 센 오행 — 상대를 한 마디로 그릴 때 쓴다 */
  function domElement(ch) {
    var counts = ch.counts || {}, best = EL_ORDER[0], bi = -1;
    EL_ORDER.forEach(function (e) { var c = counts[e] || 0; if (c > bi) { bi = c; best = e; } });
    return best;
  }

  var COMP_PAIR = {
    /* ① 상대가 내 빈 곳을 채워 주는 사이 — 편한 만큼 내 몫이 밀린다 */
    theyFill: {
      friend: {
        목: [
          '같이 벌이면 잘 풀리는데 정작 내 건 안 벌려요 — 내 몫 하나는 내가 정하기.',
          '시작은 늘 {pS} 해요 — 나도 내 손으로 하나는 열어 보기.',
          '판 벌리는 건 {p}가 잘해요 — 따라가기만 하지 말고 하나는 내가 먼저 꺼내기.',
          '내 계획은 잘 안 지켜지는데 {p} 걸 보면 따라 해요 — 내 일정 하나는 끝까지 지키기.'
        ],
        화: [
          '먼저 말하는 건 늘 {pS} 해요 — 좋은 건 나도 먼저 말하기.',
          '웃고 떠드는 건 {p} 몫이라 나는 듣기만 해요 — 내 얘기도 한 줄 꺼내기.',
          '분위기가 좋은 건 {p} 덕이에요 — 내 속 얘기도 한 번씩 꺼내기.',
          '내 좋은 얘기는 자꾸 나중으로 밀려요 — {p} 앞에서 그날 말하기.'
        ],
        토: [
          '약속·일정은 {pS} 다 기억해요 — 내 달력에 내가 직접 적기.',
          '{pS} 챙겨 주니까 나는 손을 놓게 돼요 — 내 몫 하나는 내가 챙기기.',
          '뒷정리는 {pS} 해요 — 내 자리만은 내가 정리하기.',
          '내 일정은 {p} 달력에 있어요 — 내 것도 하나는 따로 적어 두기.'
        ],
        금: [
          '싫은 소리는 {pS} 해 줘요 — 안 되는 건 나도 그 자리에서 짧게.',
          '{pS} 선을 그어 주니까 편해요 — 내 선은 내가 긋기.',
          '정리도 {p} 몫이에요 — 내 서랍은 내가 비우기.',
          '내 몫은 {pS} 알아서 잘라 줘요 — 내 선은 내가 그어 두기.'
        ],
        수: [
          '쉬자고 먼저 말하는 건 늘 {pE} — 혼자 있을 때도 쉬는 날은 정해 두기.',
          '{pC} 있으면 마음이 풀려서 다 늘어져요 — 내 일 하나는 끝내 두기.',
          '쉬는 건 {pS} 챙겨 줘요 — 나 혼자일 때도 그 시간은 지키기.',
          '내 쉼은 {p} 덕에 생겨요 — 혼자 있는 날도 하나는 비워 두기.'
        ]
      },
      love: {
        목: [
          '다음 약속은 {pS} 잡아요 — 나도 한 번씩 먼저 잡아 보기.',
          '새로 하자는 말은 {pS} 먼저 해요 — 좋으면 나도 먼저 말하기.',
          '같이 가자는 건 {p} 쪽에서 나와요 — 나도 가고 싶은 곳 하나는 먼저.',
          '내가 가고 싶은 데가 있는데 {p} 정하는 걸 기다려요 — 한 번은 내가 먼저.'
        ],
        화: [
          '좋다는 말은 {pS} 먼저 해요 — 나도 아끼지 말고 그날 말하기.',
          '내 마음은 {pS} 먼저 알아채요 — 알아채 주길 기다리지 말고 말로 꺼내기.',
          '표현은 {pS} 다 해요 — 나도 좋은 건 한 번씩 말로.',
          '내 서운함은 말 안 해도 {pS} 알아요 — 알아주길 기다리지 말고 말하기.'
        ],
        토: [
          '기념일·약속은 {pS} 챙겨요 — 나도 달력에 직접 넣기.',
          '{pS} 다 알아서 해 주면 고맙고 미안해져요 — 내 몫 하나는 내가.',
          '연락·일정은 {pS} 맞춰요 — 나도 먼저 정해서 말하기.',
          '내 기념일은 {pS} 다 챙겨요 — 다음엔 내가 먼저 챙겨 보기.'
        ],
        금: [
          '서운한 건 {pS} 먼저 말해요 — 나도 그날 안에 꺼내기.',
          '{pS} 정리해 주면 편해서 넘어가요 — 내 마음속 숙제는 내가 비우기.',
          '싫은 건 {pS} 말해 줘요 — 나도 안 되는 건 짧게 말하기.',
          '내 마음 정리는 {pS} 해 줘요 — 내 숙제는 내가 하나씩.'
        ],
        수: [
          '연락은 {pS} 챙겨요 — 나도 하루에 한 번은 먼저.',
          '{pC} 있으면 다 풀려서 내 시간을 다 내줘요 — 내 시간 한 칸은 남기기.',
          '쉬는 날은 {pS} 정해요 — 나도 혼자 쉬는 날 하나는 지키기.',
          '내 시간은 {pS} 맞춰 줘요 — 하루 한 칸은 내가 지키기.'
        ]
      }
    },

    /* ② 내가 상대 빈 곳을 채우는 사이 — 손이 먼저 나간다 */
    iFill: {
      friend: {
        목: [
          '내가 벌이는 쪽이라 {p} 속도를 끌어당겨요 — 한 번씩 물어보고 가기.',
          '내가 시작해 놓고 {pS} 따라오길 기다려요 — 출발점은 같이 정하기.',
          '새 일은 내가 먼저 꺼내요 — {pS} 하고 싶은 것부터 묻기.',
          '내가 앞에서 끌고 {pS} 따라와요 — 한 번은 그 사람 계획으로 가기.'
        ],
        화: [
          '말은 내가 먼저 꺼내요 — {p} 차례는 끝까지 듣기.',
          '내 텐션에 {pS} 맞추느라 지쳐요 — 오늘은 그 사람 속도로 가기.',
          '내가 웃기면 {pS} 웃어 줘요 — 그 사람 얘기도 꺼내 주기.',
          '내가 말로 넘겨 버려요 — {p} 할 말은 끝까지 듣기.'
        ],
        토: [
          '{p} 대신 챙기려고 손이 먼저 나가요 — 물어보고 돕기.',
          '내가 정리해 두면 {pS} 못 찾아요 — 어디에 뒀는지만 알려 주기.',
          '내가 다 챙기면 {pS} 할 게 없어져요 — 하나는 그 사람 몫으로.',
          '내가 챙겨 두면 {pS} 모르고 지나가요 — 먼저 물어보고 정하기.'
        ],
        금: [
          '정리는 내가 하려고 해요 — {p} 물건은 손대지 않기.',
          '내 기준으로 자르려는 편이에요 — {p} 방식은 두기.',
          '정리해 준다고 {p} 물건까지 치우지 않기.',
          '내가 정리해 버려서 {p} 물건이 사라져요 — 손대기 전에 묻기.'
        ],
        수: [
          '내가 비우는 쪽이라 {pS} 답답해 보여요 — 그 사람 속도를 인정하기.',
          '혼자 정리하고 나서 알려 줘요 — {p}한테 먼저 말하기.',
          '내가 느긋한 쪽이라 {pO} 기다리게 해요 — 서두르는 날은 미리 말하기.',
          '내가 비우는 속도가 {p}보다 빨라요 — 그 사람 속도로 같이 가기.'
        ]
      },
      love: {
        목: [
          '내가 앞장서서 끌고 가요 — {pS} 가고 싶은 곳부터 묻기.',
          '새로 하자는 건 내가 먼저예요 — {p} 생각은 기다려 듣기.',
          '내가 시작해 놓고 {pS} 따라오길 바라요 — 시작은 같이 정하기.',
          '내가 먼저 시작해 놓고 {pS} 따라오길 기다려요 — 같이 출발하기.'
        ],
        화: [
          '마음을 내가 먼저 말해요 — {p} 표현은 기다려 주기.',
          '내 기분이 먼저 앞서요 — {p} 하루도 물어보기.',
          '내가 다 표현해 버려서 {pS} 아낄 틈이 없어요 — 그 사람 차례도 남기기.',
          '내가 다 말해 버려요 — {p} 차례를 남겨 두기.'
        ],
        토: [
          '내가 다 챙기려고 해요 — {p}한테 뭐가 편한지 묻기.',
          '내 일정부터 정하고 {pS} 맞추게 해요 — 그 사람 시간도 한 번 물어보기.',
          '내가 정해 버리면 {pS} 따라오기만 해요 — 고르는 건 같이.',
          '내가 고르는 게 빨라서 {p}는 고를 게 없어요 — 하나는 그 사람이.'
        ],
        금: [
          '내가 정리하려고 해요 — {p} 물건은 손대지 않기.',
          '안 되는 건 내가 자르는 편이에요 — {p} 생각은 끝까지 듣기.',
          '내 기준이 세요 — {p} 방식도 맞는지 물어보기.',
          '내가 정리해 버리면 {p} 물건이 없어져요 — 물어보고 치우기.'
        ],
        수: [
          '혼자 있고 싶을 때 말없이 사라져요 — {p}한테 한 줄은 남기기.',
          '내 리듬이 느긋해서 {pO} 기다리게 해요 — 늦을 땐 미리 말하기.',
          '혼자 있는 시간이 필요해요 — {p}한테 미리 말해 두고 그 시간 지키기.',
          '내가 혼자 있고 싶어서 {pO} 기다리게 해요 — 미리 말해 두기.'
        ]
      }
    },

    /* ③ 둘 다 같은 기운이 과한 사이 — 같은 자리에서 같이 넘친다 */
    flood: {
      friend: {
        목: [
          '둘 다 벌이기만 해요 — 하나 끝내고 다음 걸 시작하기.',
          '같이 시작만 하고 끝을 못 봐요 — 끝낼 날부터 정하기.',
          '둘 다 시작만 해요 — 끝낸 일부터 세어 보기.',
          '같이 벌이면 일만 늘어요 — 오늘은 하나만.'
        ],
        화: [
          '둘 다 말이 빨라서 서로 끊어요 — 한 사람 말 끝까지 듣기.',
          '둘이면 텐션이 두 배예요 — 한 명이 쉬는 타이밍 정해 두기.',
          '같이 있으면 말이 빨라져서 서로 놓쳐요 — 한 번씩 천천히.',
          '말이 빠른 둘이라 서로 말이 겹쳐요 — 끝까지 듣기로 하기.'
        ],
        토: [
          '둘 다 챙기다가 서로 간섭해요 — 각자 구역 정해 두기.',
          '둘 다 정리하려고 해요 — 서로 자리는 손대지 않기.',
          '둘 다 남의 일까지 챙겨요 — 내 몫만 하기.',
          '둘 다 남의 일을 떠안아요 — 내 일부터 하기.'
        ],
        금: [
          '둘 다 정리벽이 있어서 서로 손대요 — 각자 자리는 두기.',
          '둘 다 자르는 말을 해요 — 한 번 더 부드럽게.',
          '둘 다 안 맞는 건 바로 정리해요 — 사람은 조금 봐 주기.',
          '둘 다 안 맞으면 바로 끊어요 — 사람은 한 번 더 보기.'
        ],
        수: [
          '둘 다 속으로 삭여서 말이 늦어요 — 그날 한 줄은 꺼내기.',
          '둘 다 말없이 사라져요 — 어디 있는지는 알려 주기.',
          '둘 다 쉬는 쪽이라 일이 밀려요 — 오늘 하나는 하기.'
        ]
      },
      love: {
        목: [
          '둘 다 앞장서려고 해요 — 한 번씩 순서 정하기.',
          '같이 새 일만 벌여요 — 하나는 끝내기.',
          '둘 다 새로 시작하는 걸 좋아해요 — 하나는 끝까지 가기.',
          '같이 벌인 일이 많아요 — 이번 주엔 하나만.'
        ],
        화: [
          '둘 다 표현이 세서 부딪혀요 — 한 톤 낮추기.',
          '같이 뜨거워지면 둘 다 타요 — 쉬는 날 정해 두기.',
          '화가 나면 둘 다 바로 말해요 — 10분 뒤에 말하기.',
          '둘 다 감정이 얼굴에 다 보여요 — 그날 안에 풀기.'
        ],
        토: [
          '둘 다 챙기다가 서로 서운해져요 — 물어보고 돕기.',
          '둘 다 정하려고 해요 — 작은 건 그냥 넘기기.',
          '둘 다 상대를 챙기느라 내 얘기는 안 해요 — 오늘은 내 것부터.',
          '둘 다 상대를 챙기다 지쳐요 — 내 것도 챙기기.'
        ],
        금: [
          '둘 다 말이 칼 같아져요 — 한 박자 늦게 말하기.',
          '둘 다 정리하려고 해요 — 물건은 각자 자리에.',
          '둘 다 서운하면 말이 짧아져요 — 한 줄이라도 길게.',
          '둘 다 정리할 때 서로 지워요 — 각자 자리만.'
        ],
        수: [
          '둘 다 말없이 가라앉아요 — “나 지금” 한 줄은 남기기.',
          '같이 있으면 다 늘어져요 — 하루 한 가지는 하기.',
          '둘 다 삭이다가 나중에 한꺼번에 말해요 — 그날 나눠서.',
          '둘 다 말없이 있는 게 편해요 — 가끔은 말로 꺼내기.'
        ]
      }
    },

    /* ④ 부딪히는 자리 — 충·형·해 */
    clash: {
      friend: [
        '부딪히면 둘 다 안 물러나요 — 한 번은 ‘네 말이 맞다’로 끝내기.',
        '말이 엇갈리면 결론까지 가요 — 그날은 다음 날로 미루기.',
        '세게 말할 때가 있어요 — 한 톤만 낮추면 금방 풀려요.',
        '같은 자리에서 자주 부딪혀요 — 그 얘기는 밥 먹으면서 하기.',
        '같은 자리에서 자꾸 어긋나요 — 그 얘기는 따로 시간 내서 하기.',
        '말이 겹치면 서로 뜨거워져요 — 한 사람이 먼저 멈추기.'
      ],
      love: [
        '부딪히면 둘 다 안 물러나요 — 먼저 손 내미는 쪽이 이기는 거예요.',
        '서운한 게 쌓이면 한 번에 터져요 — 그날그날 꺼내기.',
        '말이 날카로워질 때가 있어요 — 한 박자 늦게 말하기.',
        '같은 얘기로 또 부딪혀요 — 결론은 다음 날로 미루기.',
        '싸우면 둘 다 세게 나가요 — 먼저 웃는 쪽이 이기는 거예요.',
        '같은 자리에서 또 걸려요 — 그 얘기는 다음 날로.'
      ]
    },

    /* ⑤ 앞서는 힘 — 극하는 관계 */
    beat: {
      friend: [
        '내 말이 앞지를 때가 있어요 — 말 끝에 한 박자 두기.',
        '내가 앞서면 {pS} 말을 아껴요 — 그 침묵을 놓치지 않기.',
        '내 결론이 빨라요 — {p} 속도 한 번 확인하기.',
        '내가 앞장서면 {pS} 따라오느라 지쳐요 — 중간에 한 번 쉬기.',
        '내 말이 빨라서 {pS} 끼어들 틈이 없어요 — 한 번 쉬어 주기.',
        '내가 정해 버리면 {pS} 따라와요 — 가끔은 물어보기.'
      ],
      love: [
        '내가 앞서면 {pS} 맞춰 주기만 해요 — 한 번은 물어보기.',
        '내 속도로 끌고 가요 — {p} 페이스도 한 번.',
        '세게 말할 때 {pS} 움츠러들어요 — 한 톤 낮추기.',
        '내가 결정을 서두르면 {pS} 놓쳐요 — 한 번 물어보기.',
        '내가 앞서면 {pS} 눈치를 봐요 — 먼저 묻기.',
        '내 말투가 세질 때가 있어요 — 그날은 한 번 더 부드럽게.'
      ]
    },

    /* ⑥ 너무 가까운 사이 — 합·삼합·같은 자리 */
    close: {
      friend: [
        '너무 편해서 선을 넘기 쉬워요 — 서운한 건 웃으면서 넘기지 않기.',
        '{p}한테 고마운 걸 당연하게 여기게 돼요 — 그날 말로 꺼내기.',
        '같이 있으면 내 일정이 다 바뀌어요 — 하나는 그대로 두기.',
        '말이 짧아도 서운한 건 없는데, 가끔 무뚝뚝해 보여요 — 다정한 말 한 번 더.',
        '가까워서 부탁을 잘 못 거절해요 — 안 되는 건 안 된다고 말하기.',
        '같이 쓰는 돈이 흐지부지돼요 — 밥값은 그 자리에서 정리하기.'
      ],
      love: [
        '가까운 만큼 서운한 걸 웃으면서 넘겨요 — 그날 말하기.',
        '편하다고 표현을 아껴요 — 좋은 건 그날그날 말하기.',
        '{p} 시간에 다 맞춰요 — 내 시간 한 칸은 남기기.',
        '말 안 해도 알 거라고 생각해요 — 짐작 말고 물어보기.',
        '너무 편해서 데이트가 루틴이 돼요 — 새로운 걸 하나씩.',
        '연락이 뜸해도 괜찮은 사이인데, 오래되면 서운해져요 — 하루 한 번은 안부.'
      ]
    }
  };

  /* ⑦ 그 밖 — 상대에서 센 기운 하나를 놓고, 그 사람과 있을 때 내 몫을 챙긴다 */
  var COMP_PLAIN = {
    friend: {
      목: [
        '벌이는 쪽인 {pC} 있으면 내 일은 더 밀려요 — 하나는 끝내 두기.',
        '같이 벌이면 재밌어서 내 건 미뤄져요 — 시작한 건 끝내기.'
      ],
      화: [
        '말이 빠른 {pC} 있으면 나는 더 조용해져요 — 속에 있는 건 그날 꺼내기.',
        '{pS} 먼저 말하는 쪽이라 나는 듣기만 해요 — 내 얘기도 한 줄 보태기.'
      ],
      토: [
        '챙기는 {pC} 있으면 나는 손을 놓게 돼요 — 내 몫 하나는 내가.',
        '{pS} 다 기억해 주니까 편해요 — 내 건 내가 챙기기.'
      ],
      금: [
        '정리하는 {pC} 있으면 내 물건까지 정리돼요 — 내 자리는 내가 두기.',
        '{pS} 자르는 말을 잘해요 — 나도 안 되는 건 짧게 말하기.'
      ],
      수: [
        '비우는 {pC} 있으면 같이 늘어져요 — 내 일 하나는 매듭짓기.',
        '{pC} 있으면 다 내려놓게 돼요 — 쉬는 시간과 일하는 시간은 나눠 두기.'
      ]
    },
    love: {
      목: [
        '먼저 시작하는 {pC} 있으면 내 마음은 따라가요 — 내가 원하는 것도 말하기.',
        '새로 하자는 건 {p} 쪽이에요 — 나도 하고 싶은 거 하나는 꺼내기.'
      ],
      화: [
        '표현이 센 {pC} 있으면 나는 아끼게 돼요 — 좋은 건 나도 말하기.',
        '내 마음은 {pS} 먼저 꺼내요 — 알아채 주길 기다리지 않기.'
      ],
      토: [
        '챙기는 {pC} 있으면 나는 기대게 돼요 — 내 몫 하나는 내가.',
        '{pS} 다 챙겨 줘서 편해요 — 고맙다고 그날 말하기.'
      ],
      금: [
        '정리하는 {pC} 있으면 내 마음속까지 정리돼요 — 내 숙제는 내가.',
        '{pS} 선을 잘 그어요 — 나도 싫은 건 짧게 말하기.'
      ],
      수: [
        '혼자 있는 걸 아는 {pC} 있으면 나도 같이 비워요 — 연락은 한 줄은 남기기.',
        '{pC} 있으면 마음이 놓여서 다 놓아요 — 내 시간 한 칸은 지키기.'
      ]
    }
  };

  /* 이 사람과 있을 때 내가 챙길 점 한 줄 — 갈래를 먼저 고르고, 그 안에서 쌍 해시로 문장을 고른다 */
  function compFor(self, other, rel, side, avoid) {
    var seed = pairSeed(self, other, rel) + '#comp' + side;
    var lens = pairLens(self, other);
    var zk = zhiKeyOf(self, other), mk = masterKeyOf(self, other);
    var branches = [];
    if (lens.floods.length) branches.push({ k: 'flood', el: lens.floods[fnv32(seed + '#fl') % lens.floods.length] });
    lens.gaps.forEach(function (g) { branches.push({ k: g.dir, el: g.el }); });
    if (zk === 'chung' || zk === 'hyeong' || zk === 'hae') branches.push({ k: 'clash' });
    if (mk === 'iBeatYou' || mk === 'youBeatMe') branches.push({ k: 'beat' });
    if (zk === 'hap' || zk === 'samhap' || zk === 'same') branches.push({ k: 'close' });

    if (branches.length) {
      var b = branches[fnv32(seed + '#br') % branches.length];
      var set = (COMP_PAIR[b.k] && (COMP_PAIR[b.k][rel] || COMP_PAIR[b.k].friend)) || null;
      var pool = set ? (b.el ? (set[b.el] || []) : set) : [];
      var line = pool.length ? pickAvoid(pool, seed + '#' + domElement(other) + zk + mk, b.k + (b.el || ''), avoid) : '';
      if (line) return line;
    }
    var set2 = (COMP_PLAIN[rel] || COMP_PLAIN.friend)[domElement(other)] || [];
    return set2.length ? pickAvoid(set2, seed + '#' + zk + mk, 'plain', avoid) : '이 사람과 있을 땐 내 페이스 하나는 남겨 두기.';
  }

  /* ④ 2027년 꼭 챙겨줄 점 — 두 번째 줄은 18가지 행동 팁 풀에서 조합 해시로 */
  var CARE = {
    friend: [
      '돈 얘기·약속은 카톡으로 남겨 두기 — 말로만 하면 기억이 갈려요.',
      '같이 하기로 한 건 3월 전에 첫발 떼기.',
      '같은 목표 하나 정해서 같이 밀어 보기.',
      '한 명이 흥분하면 다른 한 명은 10분 쉬기.',
      '부딪힌 날은 그날 안에 한 번 웃고 끝내기.',
      '중요한 말은 얼굴 보고, 문자로는 짧게.',
      '연락은 짧아도 한 달에 한 번은 얼굴 보기.',
      '생일은 서로 달력에 미리 넣어 두기.',
      '같이 여행 가면 돈은 한 명이 내고 반씩 정산하기.',
      '잘하는 일만 나눠 맡고, 서로 간섭은 줄이기.',
      '힘들 때는 해결책보다 듣기부터.',
      '약속을 미룰 땐 다음 날을 그 자리에서 정하기.',
      '같이 산 물건은 누구 건지 정해 두기.',
      '한 명이 피곤해 보이면 일단 밥부터.',
      '둘만 아는 얘기는 밖에서 하지 않기.',
      '한 달에 한 번은 서로 근황 한 줄씩 보내기.',
      '같이 일할 땐 역할을 종이에 한 번 적어 두기.',
      '고마우면 그 자리에서 말하기 — 미루면 잊어요.'
    ],
    love: [
      '서운한 건 그날 말하고, 다음 날로 넘기지 않기.',
      '싸운 날은 그날 안에 손 잡고 끝내기.',
      '연락은 짧아도 매일 — 말보다 안부 먼저.',
      '같이 가고 싶은 곳 하나 정해 두기.',
      '같은 목표(여행·저축) 하나 정해 두기.',
      '같이 화날 땐 한 명이 먼저 10분 걷기.',
      '중요한 얘기는 속도를 맞춰서, 한 번에 하나씩.',
      '기념일은 서로 달력에 미리 넣어 두기.',
      '고마운 건 그날 말로 꺼내기.',
      '각자 시간 한 칸은 꼭 남겨 두기.',
      '연락 답이 늦어도 이유를 먼저 묻지 않기.',
      '가족·친구 얘기가 나오면 편부터 듣기.',
      '같이 아끼는 물건은 서로 자리를 정해 두기.',
      '다툰 날엔 잠들기 전에 한 줄이라도 보내기.',
      '돈 얘기는 미루지 말고 초반에 한 번에.',
      '속이 상했으면 “나 지금”으로 시작하기.',
      '둘이 정한 규칙은 만날 때 다시 확인하기.',
      '좋았던 일은 적어 두기 — 나중에 꺼내 볼 수 있게.'
    ]
  };

  /* 달 이야기 — 같은 달이라도 조합마다 문장이 달라지게 3가지씩 */
  var MONTH_LINE = {
    friend: {
      both: [
        '{m}엔 둘 다 예민해요 — 큰 결정은 그달 말로 미루기.',
        '{m}은 둘 다 신경이 곤두서요 — 약속은 가볍게, 결정은 다음 달로.',
        '{m}엔 말이 세지기 쉬워요 — 그달은 맛있는 걸로 풀어요.'
      ],
      one: [
        '{m}엔 {n} 쪽이 예민해요 — 먼저 연락하고 결정은 천천히.',
        '{m}은 {n}의 속도가 느려지는 달이에요 — 재촉하지 않기.',
        '{m}엔 {nS} 예민해져요 — 그달엔 함께하는 약속을 가볍게.'
      ],
      good: [
        '{m}에 같이 뭐 하나 시작해 보세요 — 그달이 제일 잘 붙어요.',
        '{m}은 둘 다 힘이 붙는 달이에요 — 미뤄 둔 일을 그때 꺼내기.',
        '{m}에 중요한 얘기를 꺼내면 잘 풀려요 — 그달을 기다려 보세요.'
      ],
      none: [
        '올해는 둘 다 크게 흔들리는 달이 없어요 — 페이스만 맞춰 가요.',
        '올해는 둘 다 무리하는 달이 없어요 — 지금 속도가 제일 좋아요.'
      ]
    },
    love: {
      both: [
        '{m}엔 둘 다 예민해요 — 큰 얘기는 그달 말로 미루기.',
        '{m}은 서로 말이 날카로워지기 쉬워요 — 그달엔 중요한 얘기를 미루기.',
        '{m}엔 둘 다 지쳐요 — 그달은 안부만 주고받기.'
      ],
      one: [
        '{m}엔 {n} 쪽이 예민해요 — 먼저 안아 주고 결정은 천천히.',
        '{m}은 {n}의 마음이 가라앉는 달이에요 — 조급해하지 않기.',
        '{m}엔 {nS} 서운해지기 쉬워요 — 그달엔 표현을 조금 더.'
      ],
      good: [
        '{m}에 마음을 꺼내면 잘 닿아요 — 그달이 제일 잘 붙어요.',
        '{m}은 둘 다 마음이 열리는 달이에요 — 미뤄 둔 약속을 그때.',
        '{m}에 같이 멀리 다녀오면 오래 남아요.'
      ],
      none: [
        '올해는 둘 다 크게 흔들리는 달이 없어요 — 지금 온도가 좋아요.',
        '올해는 둘 다 무리하는 달이 없어요 — 천천히 가도 돼요.'
      ]
    }
  };
  var MONTH_TIP = {
    friend: {
      good: ['그달엔 미뤄 둔 약속을 꺼내 보세요.', '그달에 같이 시작한 일은 오래 갑니다.', '그달에 만나면 얘기가 잘 풀려요.'],
      warn: ['그달엔 돈 얘기를 미루세요.', '그달엔 큰 약속을 잡지 않는 게 좋아요.', '그달엔 연락을 조금 자주.']
    },
    love: {
      good: ['그달엔 같이 여행 계획을 세워 보세요.', '그달에 한 약속은 오래 갑니다.', '그달엔 사진을 많이 남겨 두세요.'],
      warn: ['그달엔 서운한 얘기를 미루세요.', '그달엔 만나는 날짜를 미리 정해 두세요.', '그달엔 문자보다 전화.']
    }
  };

  /* ⑤ 2027 부적 — 금박 문양 14종 × 우정/사랑 = 28종.
     조합 해시로 문양을 고르고, 같은 문양이라도 우정과 사랑의 이름·한 줄은 다르다. */
  var ARTS = ['key', 'flame', 'ring', 'moonwave', 'money', 'butterfly', 'stars', 'lotus', 'compass', 'hourglass', 'crane', 'gourd', 'knot', 'lantern'];
  var AMUL = {
    friend: {
      key:       { name: '찐친 지갑수호 부적',     line: '지갑은 각자, 밥은 같이' },
      flame:     { name: '브레이크 없는 콤비 부적', line: '싸워도 밥은 같이 먹는다' },
      ring:      { name: '두 고리 의리 부적',       line: '한 번 엮이면 안 풀린다' },
      moonwave:  { name: '속마음 텔레파시 부적',   line: '말보다 밥 — 그래도 통한다' },
      money:     { name: '대박 합작 시너지 부적',   line: '같은 쪽 보면 두 배로 벌어요' },
      butterfly: { name: '취향저격 찰떡 부적',     line: '취향 일치, 텐션 조절만' },
      stars:     { name: '야식 동지 부적',         line: '밤 12시엔 같이 배고프다' },
      lotus:     { name: '말 안 해도 편한 부적',   line: '같이 있어도 각자 편한 사이' },
      compass:   { name: '길 잃어도 둘이면 부적',   line: '방향은 달라도 목적지는 같다' },
      hourglass: { name: '오래 가는 우정 부적',     line: '급할수록 천천히, 우정은 길게' },
      crane:     { name: '멀리 가도 다시 오는 부적', line: '연락 뜸해도 안 끊긴다' },
      gourd:     { name: '복 불려 오는 콤비 부적',   line: '같이 다니면 복도 두 배' },
      knot:      { name: '오해 제로 의리 부적',     line: '약속은 문자로, 우정은 길게' },
      lantern:   { name: '밤길 같이 가는 부적',     line: '어두울 때 더 또렷한 사이' }
    },
    love: {
      key:       { name: '밀당 종료 직진 부적',   line: '서운하면 그날 말하기' },
      flame:     { name: '싸워도 5분 화해 부적',    line: '부딪혀도 결국 너에게' },
      ring:      { name: '쌍고리 인연 부적',      line: '고리처럼 다시 돌아온다' },
      moonwave:  { name: '천천히 오래 곁에 부적',   line: '천천히, 그러나 오래' },
      money:     { name: '2027 꿀떨어짐 부적',      line: '같이 있으면 하루가 달다' },
      butterfly: { name: '평생 내 편 수호 부적',    line: '닮아서 편하고, 닮아서 조심' },
      stars:     { name: '눈빛 통하는 자석 부적',   line: '말하지 않아도 통하는 사이' },
      lotus:     { name: '마음 씻는 연꽃 부적',     line: '서운함은 물에 흘려보내기' },
      compass:   { name: '첫눈에 방향 맞은 부적',   line: '어디로 가든 같이 가기' },
      hourglass: { name: '타이밍 맞춤 부적',      line: '이제 그만 망설이기' },
      crane:     { name: '오래 보는 눈 부적',      line: '같이 늙어도 재밌기' },
      gourd:     { name: '액운 털어내는 부적',     line: '나쁜 기운은 둘이서 털기' },
      knot:      { name: '엮인 인연 매듭 부적',    line: '한 번 엮이면 못 놓는다' },
      lantern:   { name: '불 밝혀 두는 부적',      line: '누가 먼저 와도 불 켜 두기' }
    }
  };
  /* 사주 쌍 → 부적 문양. 우정·사랑은 7칸씩 어긋나게 골라 같은 커플이라도 그림이 다르다. */
  function amulOf(a, b, rel) {
    var i = mix32(fnv32(pairSeed(a, b, rel) + '#amul')) % ARTS.length;
    if (rel === 'love') i = (i + 7) % ARTS.length;
    var art = ARTS[i];
    var set = AMUL[rel] || AMUL.friend;
    return { name: (set[art] || set.key).name, line: (set[art] || set.key).line, art: art };
  }

  function zhiKeyOf(chA, chB) {
    var I = T._internal;
    var za = chA.natal.dayZhiIndex, zb = chB.natal.dayZhiIndex;
    if (za === zb) return 'same';
    if (I.yukhapOf(za) === zb) return 'hap';
    if (I.chungOf(za) === zb) return 'chung';
    if (I.isHyeong(za, zb)) return 'hyeong';
    if (I.haeOf(za) === zb) return 'hae';
    var ga = I.samhapGroupOf(za), gb = I.samhapGroupOf(zb);
    if (ga >= 0 && ga === gb) return 'samhap';
    return 'plain';
  }

  function masterKeyOf(chA, chB) {
    var ae = chA.natal.element, be = chB.natal.element;
    if (ae === be) return 'same';
    if (EL_MOTHER[ae] === be) return 'youFeedMe';
    if (EL_MOTHER[be] === ae) return 'iFeedYou';
    if (EL_OVER[ae] === be) return 'iBeatYou';
    if (EL_OVER[be] === ae) return 'youBeatMe';
    return 'same';
  }

  /* 두 사람의 2027년 — 달·빈 기운만 뽑아 둔다(화면에 쓰는 값) */
  function pairInfo(a, b) {
    var hotA = hotMap(a), hotB = hotMap(b);
    var warnA = warnMap(a), warnB = warnMap(b);
    var both = [], warnBoth = [], warnOne = [];
    a.months.forEach(function (m) {
      var n = m.m;
      if (hotA[n] && hotB[n] && !warnA[n] && !warnB[n]) both.push(n);
      if (warnA[n] && warnB[n]) warnBoth.push(n);
      else if (warnA[n] || warnB[n]) warnOne.push({ n: n, who: warnA[n] ? 'me' : 'you' });
    });
    both.sort(function (x, y) { return x - y; });
    warnBoth.sort(function (x, y) { return x - y; });
    warnOne.sort(function (x, y) { return x.n - y.n; });

    /* 겹치는 '좋은 달'이 없을 때 — 둘 다 무리하지 않는 달로 대신 */
    var near = [];
    if (!both.length) {
      var scored = a.months.map(function (m) {
        var n = m.m, s = m.chance + b.months[n - 1].chance;
        if (warnA[n] && warnB[n]) s -= 120;
        else if (warnA[n] || warnB[n]) s -= 30;
        return { n: n, s: s };
      }).sort(function (x, y) { return y.s - x.s; });
      near = scored.slice(0, 2).map(function (x) { return x.n; }).sort(function (x, y) { return x - y; });
    }

    /* 한쪽은 얇고 한쪽은 넉넉한 오행 — '서로 보완할 점'의 재료 */
    var gaps = [];
    EL_ORDER.forEach(function (e) {
      var ca = a.counts[e] || 0, cb = b.counts[e] || 0;
      if (ca <= 1 && cb >= 2) gaps.push({ lean: 'me', el: e });
      if (cb <= 1 && ca >= 2) gaps.push({ lean: 'you', el: e });
    });

    return {
      both: both, near: near, warnBoth: warnBoth, warnOne: warnOne,
      gaps: gaps,
      zhiKey: zhiKeyOf(a, b),
      masterKey: masterKeyOf(a, b)
    };
  }

  /* ── 2027 케미 점수 (2026-11-22 김나영 님 확정) ─────────────────
     결과 맨 위 숫자 하나 — "친구/연인과 2027년 우리 케미 점수는?"의 답.
     같은 두 사주 + 같은 관계면 몇 번을 봐도 같은 점수가 나온다(결정론).
     재료: ① 일간(천간) 합·상생·상극 ② 일지 육합·삼합·충·형·해
           ③ 서로의 빈 오행을 채워 주는가 ④ 정미년(丁未)과 각자 사주
           ⑤ 관계 모드 — 우정은 '채워 줌', 사랑은 '합과 열기'에 무게
     어떤 조합도 기분 상할 만큼 낮게 보이지 않도록 60~95 사이로 접는다.
     2026-11-22 김나영 님 추가 확정: 폭을 60~95로 넓혀 낮은 조합(60~77)과
     높은 조합(78~95)이 실제로 갈리게 한다. */
  var Y2027_GAN_EL = '화';    // 丁
  var Y2027_ZHI = 7;          // 未

  /* 일간끼리 — 천간합(갑기·을경·병신·정임·무계 = 5 차이) · 같은 오행 · 상생 · 상극 */
  function ganKey(a, b) {
    var ga = a.natal.dayGanIndex, gb = b.natal.dayGanIndex;
    if (Math.abs(ga - gb) === 5) return 'hap';
    var ea = a.natal.element, eb = b.natal.element;
    if (ea === eb) return 'same';
    if (EL_MOTHER[ea] === eb || EL_MOTHER[eb] === ea) return 'saeng';
    return 'geuk';
  }

  /* 그 사람 사주와 2027 정미년(丁·未)의 맞물림 — −4 ~ +5 */
  function yearTilt(ch) {
    var I = T._internal;
    var e = ch.natal.element, z = ch.natal.dayZhiIndex;
    var s = 0;
    /* 丁(화) */
    if (e === Y2027_GAN_EL) s += 1.0;                 // 같은 결 — 열기가 겹친다
    else if (EL_MOTHER[e] === Y2027_GAN_EL) s += 1.5; // 화가 나를 살린다 (토)
    else if (EL_MOTHER[Y2027_GAN_EL] === e) s += 0.5; // 내가 화를 살린다 (목) — 쓰는 해
    else if (EL_OVER[e] === Y2027_GAN_EL) s += 0.5;   // 내가 화를 누른다 (수)
    else s -= 1.5;                                    // 화가 나를 누른다 (금)
    /* 未(토) — 일지 관계 */
    if (z === Y2027_ZHI) s += 0.8;
    else if (I.yukhapOf(Y2027_ZHI) === z) s += 2.0;
    else if (I.samhapGroupOf(Y2027_ZHI) === I.samhapGroupOf(z) && I.samhapGroupOf(z) >= 0) s += 1.5;
    else if (I.chungOf(Y2027_ZHI) === z) s -= 2.0;
    else if (I.isHyeong(Y2027_ZHI, z)) s -= 1.5;
    else if (I.haeOf(Y2027_ZHI) === z) s -= 1.0;
    /* 2027이 이 사람의 빈 오행을 채우는가 (정=화 · 미=토) */
    var fills = (ch.need && ch.need.fills) || [];
    if (fills.indexOf('토') >= 0) s += 1.0;
    if (fills.indexOf('화') >= 0) s += 0.5;
    return Math.max(-4, Math.min(5, s));
  }

  function chemiScore(a, b, rel, info) {
    var seed = pairSeed(a, b, rel);
    var love = rel === 'love';
    var s = 75.5;

    /* ① 일간 */
    var gp = { hap: 6, saeng: 4, same: 2, geuk: -4 }[ganKey(a, b)];
    s += gp * (love ? 1.25 : 1);

    /* ② 일지 — 육합·삼합이면 붙고, 충·형이면 부딪힌다 */
    var zp = { hap: 5, samhap: 4, same: 2, plain: 0, hae: -2.5, hyeong: -3.5, chung: -5 }[info.zhiKey];
    s += (zp == null ? 0 : zp) * (love ? 1.1 : 1);

    /* ③ 서로의 빈 오행을 채워 주는가 — 우정은 이쪽에 무게 */
    s += Math.min((info.gaps || []).length, 4) * (love ? 0.7 : 1.15);

    /* ④ 2027 정미년과의 시너지 */
    s += (yearTilt(a) + yearTilt(b)) * (love ? 1.0 : 0.85);

    /* ⑤ 관계 모드 — 같은 사주라도 우정·사랑의 온도는 다르다 (±2, 관계별로 고정) */
    s += (mix32(fnv32(seed + '#score')) % 41) / 10 - 2;

    /* 원점수를 60~95 창으로 옮겨 자른다 — 낮은 조합과 높은 조합이 78점을 경계로 갈린다 */
    return Math.max(60, Math.min(95, Math.round(s - 3)));
  }

  /* 낮은 조합 — 이 구간에만 상담 한 줄을 조용히 붙인다 (78점부터는 안 보임) */
  function scoreIsLow(n) { return n <= 77; }

  /* ── 2027년 둘이 조심할 달 (2026-11-22 김나영 님 추가 확정) ─────────
     丁未년 12개월 월운이 두 사람의 일지와 총·형·해로 부딪히는 달,
     월지끼리 부딪히는 달, 월간이 두 일간을 극하는 달을 세어 가장 센 1~2달.
     점수와 상관없이 모든 결과에 한 줄 나가고, 같은 두 사주면 늘 같은 달이다.
     결과 화면에 이미 '슬쩍 조심할 달' 카드가 있으면 그 달을 그대로 쓰고,
     카드가 비어 있을 때만 이 계산으로 채운다(두 답이 갈리지 않게, 2026-11-22). */
  function pairTenseMonths(a, b) {
    var I = T._internal, rows = [];
    for (var m = 1; m <= 12; m++) {
      var gz = T.monthGzOf('2027-' + pad2(m) + '-15', terms());
      if (!gz) continue;
      var s = 0;
      [a, b].forEach(function (ch) {
        var dz = ch.natal.dayZhiIndex, mz = ch.natal.monthZhiIndex;
        if (I.chungOf(gz.zhiIndex) === dz) s += 3.0;              // 월지가 내 일지와 총
        else if (I.isHyeong(gz.zhiIndex, dz)) s += 2.2;            // 형
        else if (I.haeOf(gz.zhiIndex) === dz) s += 1.4;            // 해
        if (I.chungOf(gz.zhiIndex) === mz) s += 1.2;               // 월지끼리 총
        if (EL_OVER[gz.ganEl] === ch.natal.element) s += 0.8;      // 그 달 천간이 내 일간을 극함
      });
      rows.push({ m: m, s: s });
    }
    rows.sort(function (x, y) { return y.s - x.s || x.m - y.m; });
    var top = rows[0];
    if (!top || top.s <= 0) {
      /* 부딪히는 달이 아예 없으면 — 둘 다 가장 무리 없는 달로 */
      var soft = a.months.map(function (x) {
        return { m: x.m, s: x.chance + (b.months[x.m - 1] ? b.months[x.m - 1].chance : 0) };
      }).sort(function (x, y) { return x.s - y.s || x.m - y.m; });
      return [soft[0].m, soft[1].m].sort(function (x, y) { return x - y; });
    }
    var out = [top.m];
    if (rows[1] && rows[1].s >= Math.max(2, top.s * 0.6)) out.push(rows[1].m);
    return out.sort(function (x, y) { return x - y; });
  }

  /* 점수 막대 길이(%) — 60점도 바닥이 비지 않게 */
  function scorePct(n) { return Math.max(6, Math.min(100, Math.round((n - 57) / 40 * 100))); }

  /* 오행 요약 바 — 작게, 오방색만 지키고 사람은 채움/빗금으로 */
  function elBars(chA, chB, opt) {
    opt = opt || {};
    var mx = 1;
    EL_ORDER.forEach(function (e) {
      mx = Math.max(mx, chA.counts[e] || 0, chB.counts[e] || 0);
    });
    var html = '<div class="els' + (opt.mini ? ' els--mini' : '') + '">' + EL_ORDER.map(function (e) {
      var a = chA.counts[e] || 0, b = chB.counts[e] || 0;
      return '<div class="el el--' + e + '">'
        + '<span class="el__pair">'
        + '<i class="el__bar el__bar--me" style="height:' + Math.max(5, Math.round(a / mx * 100)) + '%"></i>'
        + '<i class="el__bar el__bar--you" style="height:' + Math.max(5, Math.round(b / mx * 100)) + '%"></i>'
        + '</span>'
        + '<span class="el__lb">' + e + '</span>'
        + '</div>';
    }).join('') + '</div>';
    if (opt.legend) {
      html += '<p class="els__lg">'
        + '<i class="els__lg-i is-me" aria-hidden="true"></i>채운 막대 ' + esc(opt.legA || '나')
        + '<i class="els__lg-i is-you" aria-hidden="true" style="margin-left:6px"></i>빗금 막대 ' + esc(opt.legB || '너') + '</p>';
    }
    return html;
  }

  function renderChemin(a, b) {
    var box = $('#chemiResult');
    if (!box) return;
    var rel = relNow(), R = RELS[rel];
    var aName = String(a.p.name || '').trim() || '나';
    var bName = String(b.p.name || '').trim() || R.peer;
    var info = pairInfo(a, b);
    var zk = info.zhiKey, mk = info.masterKey;
    var seed = pairSeed(a, b, rel);

    /* ① 훅 · 훅 아래 한 줄 — 조합 해시로 24가지 훅 중 하나 */
    var hook = pickFrom(HOOK[rel] || HOOK.friend, seed, 'hook');
    var roleSet = (ROLE[rel] || ROLE.friend)[mk] || (ROLE[rel] || ROLE.friend).same;
    var role = pickFrom(roleSet, seed + '#' + domElement(b) + (b.counts[b.natal.element] || 0), 'role');

    /* ② 각자 보완할 점 — 상대가 바뀌면 문장이 바뀐다. 두 사주를 겹친 갈래로 한 줄씩
       (2026-11-23 #16887 — 두 사람 해시가 같은 자리에 떨어져도 같은 문장이 두 번 나오지 않게,
        두 번째 사람은 첫 사람이 쓴 문장을 피해서 고른다) */
    var compRaw = [];
    var comps = [a, b].map(function (ch, i) {
      var other = i === 0 ? b : a;
      var nm = i === 0 ? aName : bName;
      var otherName = i === 0 ? bName : aName;
      var raw = compFor(ch, other, rel, i, i ? compRaw[0] : '');
      compRaw.push(raw);
      var line = fill(raw, peerWord(otherName, rel));
      return '<b>' + esc(nm) + '</b> : ' + line;
    });

    /* ③ 2027년 꼭 챙겨줄 점 — 달 줄 하나 + 행동 팁 하나 */
    var bestMs = info.both.length ? info.both : info.near;
    var care = [];
    var mPool, mVal = '', mName = '';
    if (info.warnBoth.length) {
      mPool = (MONTH_LINE[rel] || MONTH_LINE.friend).both;
      mVal = info.warnBoth[fnv32(seed + '#wb') % info.warnBoth.length];
    } else if (info.warnOne.length) {
      var wo = info.warnOne[fnv32(seed + '#wo') % info.warnOne.length];
      mPool = (MONTH_LINE[rel] || MONTH_LINE.friend).one; mVal = wo.n;
      mName = wo.who === 'me' ? aName : bName;
    } else if (bestMs.length) {
      mPool = (MONTH_LINE[rel] || MONTH_LINE.friend).good; mVal = bestMs[0];
    } else {
      mPool = (MONTH_LINE[rel] || MONTH_LINE.friend).none;
    }
    var mLine = pickFrom(mPool, seed, 'month' + mVal);
    mLine = mLine.replace('{m}', '<b>' + mVal + '월</b>')
      .replace('{nS}', esc(josaFull(mName, 'subj')))
      .replace('{n}', esc(mName));
    care.push(mLine);
    care.push(esc(pickFrom(CARE[rel] || CARE.friend, seed, 'caretip')));
    /* 2027년에 둘이 부딪히기 쉬운 달 — 점수가 높아도 한 줄은 꼭 (2026-11-22)
       아래 '슬쩍 조심할 달' 카드와 다른 달을 말하면 한 화면에서 두 답이 되어 헷갈린다.
       카드와 같은 달을 쓰고, 카드가 '없어요'일 때만 정미년 월운 충돌로 채운다. */
    var warnMs = (info.warnBoth.length ? info.warnBoth : info.warnOne.map(function (x) { return x.n; })).slice(0, 2);
    var tenseMs = warnMs.length ? warnMs : pairTenseMonths(a, b);
    /* 2026-11-23 #16887 — 첫 줄에서 이미 말한 달은 셋째 줄에서 빼고, 겹치면 그 달을 가리키는 말로 합친다
       (예: '1월엔 둘 다 지쳐요 …' 다음에 '단, 1월엔 …'이 또 나오던 문제) */
    var mValNum = mVal ? parseInt(String(mVal), 10) : NaN;
    var otherTense = tenseMs.filter(function (n) { return n !== mValNum; });
    if (otherTense.length) {
      care.push('단, <b>' + otherTense.map(function (n) { return n + '월'; }).join('·')
        + '</b>엔 둘의 기운이 부딪히기 쉬우니 말 한마디만 아끼세요.');
    } else if (tenseMs.length) {
      care.push('그달엔 둘의 기운이 부딪히기 쉬우니 말 한마디만 아끼세요.');
    }

    /* ④ 딱 맞는 달 · 조심할 달 (warnMs 는 위에서 이미 골랐다) */
    var goodMs = bestMs.slice(0, 3);
    var goodTx = goodMs.length ? goodMs.map(function (n) { return n + '월'; }).join(' · ') : '아직 없어요';
    var warnTx = warnMs.length ? warnMs.map(function (n) { return n + '월'; }).join(' · ') : '없어요';
    var tipSet = MONTH_TIP[rel] || MONTH_TIP.friend;
    var goodTip = goodMs.length ? pickFrom(tipSet.good, seed, 'gtip' + goodMs.join('-')) : '';
    var warnTip = warnMs.length ? pickFrom(tipSet.warn, seed, 'wtip' + warnMs.join('-')) : '';

    /* ⑤ 부적 — 조합 해시로 14종 문양 중 하나 */
    var amul = amulOf(a, b, rel);

    /* ⑥ 2027 케미 점수 — 제목 바로 아래, 결과를 여는 숫자 하나 */
    var score = chemiScore(a, b, rel, info);

    var html = '';
    html += '<div class="chemi__hd">'
      + '<span class="chemi__badge">' + R.emoji + ' ' + esc(R.name) + '</span>'
      + '<span class="chemi__year">2027</span>'
      + '</div>';
    html += '<p class="chemi__names">' + esc(aName) + ' <i>·</i> ' + esc(bName) + '</p>';
    html += '<div class="chemi__score" role="group" aria-label="2027 케미 점수 ' + score + '점">'
      + '<span class="chemi__score-lb">2027 케미 점수</span>'
      + '<span class="chemi__score-n"><b>' + score + '</b><i>점</i></span>'
      + '<span class="chemi__score-bar" aria-hidden="true"><i style="width:' + scorePct(score) + '%"></i></span>'
      + '</div>';
    html += '<h2 class="chemi__hook"><span class="chemi__yr">2027년엔</span>' + esc(hook) + '</h2>';
    html += '<p class="chemi__role">' + esc(role) + '</p>';
    html += elBars(a, b, { mini: true, legend: false });

    html += '<div class="csect">'
      + '<p class="csect__lb"><i aria-hidden="true">1</i>이 사람과 있을 때 보완할 점</p>'
      + '<ul class="csect__ul">' + comps.map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ul>'
      + '</div>';
    html += '<div class="csect">'
      + '<p class="csect__lb"><i aria-hidden="true">2</i>2027년 꼭 챙겨줄 점</p>'
      + '<ul class="csect__ul csect__ul--do">' + care.map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ul>'
      + '</div>';
    html += '<div class="cmonths">'
      + '<div class="cm cm--good"><span>' + (rel === 'love' ? '마음이 잘 통하는 달' : '둘이 딱 맞는 달') + '</span><b>' + esc(goodTx) + '</b>'
      + (goodTip ? '<em>' + esc(goodTip) + '</em>' : '') + '</div>'
      + '<div class="cm cm--warn"><span>' + (rel === 'love' ? '말 조심할 달' : '슬쩍 조심할 달') + '</span><b>' + esc(warnTx) + '</b>'
      + (warnTip ? '<em>' + esc(warnTip) + '</em>' : '') + '</div>'
      + '</div>';

    html += '<p class="sect-h">2027 정미년 · ' + esc(amul.name) + ' (' + R.hanja + ')</p>';
    html += '<h3 class="sect-t">저장해서 쓰는 카드</h3>';
    html += '<div class="amulbox" id="amulBox"></div>';
    /* 부적 바로 아래 두 버튼 (2026-11-23 7차 김나영 님)
       '다시'는 걷어 내고 → 맨 아래 작은 '다른 사람과 케미 다시 보기' 글자 링크로만 남긴다.
       [이미지로 저장]은 그림만, [친구에게 보내기](강조)는 그림 없이 통합 링크만 보낸다 (2026-11-23 / #17252). */
    html += '<div class="btn-row">'
      + '<button type="button" class="btn btn--ghost" id="saveAmulBtn">이미지로 저장</button>'
      + '<button type="button" class="btn btn--kakao btn--wide" id="shareAmulBtn">친구에게 보내기</button>'
      + '</div>';
    html += '<p class="story__cap">카드를 길게 눌러 저장해도 돼요.</p>';
    /* 로그인 전 한 줄 (2026-11-23 / #17252) — 보내기를 막지 않으면서 초대 코드가 빠진다는 걸 미리 알린다. */
    if (!state.user) {
      html += '<p class="share-note" id="shareAmulNote">카카오로 연결하면 보내는 링크에 <b>내 초대 코드</b>도 함께 담겨요 — 지금 보내도 우리 둘 케미는 그대로 열려요.</p>';
    }

    /* ── 결과 바로 아래 두 갈래 (2026-11-23 7차 김나영 님) ──────────────
       ① 친구 초대 1/3/5/7 — 로그인했으면 '현재 N명 달성' + [내 링크 바로 보내기]
          (케미 링크 + 내 초대 코드가 한 주소로 합쳐진 링크 1개)
       ② 인스타 피드·릴스에 올리기 → 달력 +1개월 · 버튼 하나로 태그 복사 + 인스타 열기
       결과를 다 본 자리에서 한 장씩 — 가격표·배너는 넣지 않는다. */
    html += '<section class="grow" aria-label="내 사주 타이밍 달력 더 열기">'
      + '<div class="grow__card">'
      + '<p class="grow__lb">🎁 무료로 달력 넓히기</p>'
      + '<p class="grow__t">친구를 초대하면 <b>내 사주 타이밍 달력</b>이 더 열려요</p>'
      + '<p class="grow__stat" id="growStat" hidden></p>'
      + '<ul class="grow__ladder">'
      + LADDER.map(function (r) { return '<li><b>' + r.n + '명</b><span>' + esc(r.title) + '</span></li>'; }).join('')
      + '</ul>'
      + '<button type="button" class="btn btn--gold btn--wide" id="growShareBtn">내 링크 바로 보내기</button>'
      + '</div>'
      + '<div class="grow__card grow__card--insta">'
      + '<p class="grow__lb">📸 인스타 올리기 · +1개월</p>'
      + '<p class="grow__t">인스타 <b>피드·릴스</b>에 결과 화면을 올리면 <b>내 사주 타이밍 달력 +1개월</b>이 열려요</p>'
      + '<button type="button" class="btn btn--gold btn--wide" id="instaGoBtn">📸 태그 복사하고 인스타 올리기</button>'
      + '<p class="grow__d">올린 화면을 카톡 <b>윤이세사주</b>로 보내 주시면 <b>+1개월 코드</b>를 보내 드려요 · 계정당 1회</p>'
      + '</div>'
      + '</section>';

    /* 결과를 본 직후 — 윤이세사주 채널 추가(원터치). 친구 초대는 위 grow 카드가 맡는다.
       7차: '내 2027년 케미 링크 보내기' 버튼은 [친구에게 보내기]·[내 링크 바로 보내기]와 같은 일이라 걷어 냈다. */
    html += '<div class="chemi__more">'
      + '<a class="btn btn--gold" href="' + KAKAO_CHANNEL_ADD + '" target="_blank" rel="noopener">'
      + '<span aria-hidden="true">💬</span> 윤이세사주 채널 추가하기</a>'
      + '</div>';
    /* 낮은 조합(60~77점)에만 — 마지막 채널 추가 아래 조용한 상담 한 줄.
       6차(2026-11-23): ① 초대 ② 인스타 ③ 케미 링크·채널 추가 흐름을 끊지 않게 아래로 내렸다. */
    if (scoreIsLow(score)) {
      html += '<p class="chemi__consult">'
        + '<a href="../../apply/">부딪히는 지점, 내 사주 전체로 딱 한 가지만 짚어 보고 싶다면 '
        + '→ <b>1:1 원포인트 상담 보기</b></a></p>';
    }
    /* 맨 끝 — 결과 아래는 여기서 끝난다(7차). '다시'는 이 작은 글자 링크 하나뿐. */
    html += '<p class="chemi__again"><button type="button" id="againLink">다른 사람과 케미 다시 보기</button></p>';

    box.innerHTML = html;
    box.hidden = false;

    /* 부적 카드는 그림(Canvas)으로 그려 <img>로 앉힌다 — 길게 눌러 저장 + 버튼 저장 둘 다 되게 */
    var cv = doc.createElement('canvas');
    cv.width = 1080; cv.height = 1920;
    drawAmul(cv, { rel: rel, a: aName, b: bName, title: amul.name, art: amul.art, line: amul.line, hanja: R.hanja, word: R.word });
    var dataUrl = '';
    try { dataUrl = cv.toDataURL('image/png'); } catch (e) { dataUrl = ''; }
    var holder = $('#amulBox');
    if (holder) {
      if (dataUrl) {
        var img = doc.createElement('img');
        img.className = 'amulimg';
        img.id = 'amulCard';
        img.alt = '2027 정미년 ' + R.card;
        img.src = dataUrl;
        holder.appendChild(img);
      } else {
        holder.innerHTML = '<p class="story__cap">카드를 그리지 못했어요 — 새로고침 후 다시 시도해 주세요.</p>';
      }
    }

    var saveB = $('#saveAmulBtn');
    if (saveB) saveB.addEventListener('click', function () {
      saveAmul(cv, rel, aName, bName);
    });

    /* [친구에게 보내기] — 그림 없이 통합 링크(케미+내 초대 코드) 하나만 (2026-11-23 / #17252) */
    var sendB = $('#shareAmulBtn');
    if (sendB) sendB.addEventListener('click', function () {
      shareAmul(a);
    });

    /* [내 링크 바로 보내기] — 로그인 전이면 카카오 연결부터 */
    var growB = $('#growShareBtn');
    if (growB) growB.addEventListener('click', function () {
      if (!state.user) { onLogin(null, growB); return; }
      onShareMyLink(a);
    });
    updateGrow();

    /* 📸 태그 복사 + 인스타 열기 — 한 버튼 (2026-11-23 6차) */
    var ig = $('#instaGoBtn');
    if (ig) ig.addEventListener('click', function () {
      copyText(CAPTION).then(function (ok) {
        toast(ok ? '복사됐어요! 인스타 열리면 붙여넣고 올려 주세요' : '복사가 안 됐어요. 문구를 길게 눌러 복사해 주세요');
        setTimeout(openInstagram, ok ? 520 : 0);
      });
    });

    var ag = $('#againLink');
    if (ag) ag.addEventListener('click', function () {
      box.hidden = true;
      $('#chemiCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ── 부적 카드: 1080×1920 실크 + 금박 이중 테두리 + 낙관 ───────── */
  var SERIF_STACK = '"Nanum Myeongjo","NanumMyeongjo","Noto Serif KR","Noto Serif CJK KR","AppleMyungjo","SamsungMyeongjo","Batang",serif';

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function roundPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function goldGrad(ctx, x0, y0, x1, y1, P) {
    var g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0.00, P.goldLow);
    g.addColorStop(0.14, P.goldHi);
    g.addColorStop(0.30, P.gold);
    g.addColorStop(0.46, P.goldHi);
    g.addColorStop(0.60, P.gold);
    g.addColorStop(0.78, P.goldHi);
    g.addColorStop(1.00, P.goldLow);
    return g;
  }

  /* 글자를 한 자씩 가운데 정렬로 — 캔버스엔 letter-spacing 이 없어서 */
  function spacedCenter(ctx, text, cx, y, gap) {
    var chars = Array.from(String(text));
    var ws = [], total = 0, i;
    for (i = 0; i < chars.length; i++) { ws.push(ctx.measureText(chars[i]).width); total += ws[i]; }
    total += gap * Math.max(0, chars.length - 1);
    var x = cx - total / 2;
    for (i = 0; i < chars.length; i++) {
      ctx.fillText(chars[i], x + ws[i] / 2, y);
      x += ws[i] + gap;
    }
  }

  function wrapLines(ctx, text, maxW) {
    var words = String(text).split(' '), lines = [], cur = '';
    words.forEach(function (w) {
      var t = cur ? cur + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; }
      else cur = t;
    });
    if (cur) lines.push(cur);
    return lines;
  }

  function diamond(ctx, cx, cy, r) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy);
    ctx.closePath();
  }

  function drawAmul(cv, o) {
    var W = cv.width, H = cv.height;
    var ctx = cv.getContext('2d');
    if (!ctx) return;
    var love = o.rel === 'love';
    var P = love ? {
      bg1: '#3A0C1B', bg2: '#14060F', bg3: '#050309',
      glow: 'rgba(232,132,120,0.26)', glow2: 'rgba(58,80,138,0.26)',
      goldGlow: 'rgba(238,190,150,0.10)',
      goldHi: '#FFF1E3', gold: '#EFC4AB', goldLow: '#A96C52',
      cream: '#F8EAE0', dim: 'rgba(248,234,224,0.62)', seal: '#A51F35',
      glyphGlow: 'rgba(255,186,158,0.34)'
    } : {
      bg1: '#0B2A34', bg2: '#061420', bg3: '#030B12',
      glow: 'rgba(42,148,120,0.32)', glow2: 'rgba(40,74,128,0.26)',
      goldGlow: 'rgba(226,186,120,0.10)',
      goldHi: '#FFF8E3', gold: '#EED4A4', goldLow: '#A87C42',
      cream: '#F4EBDA', dim: 'rgba(244,235,218,0.62)', seal: '#9C3A2E',
      glyphGlow: 'rgba(255,226,164,0.30)'
    };
    var serif = SERIF_STACK;

    /* 1. 바탕 — 실크 */
    var g = ctx.createLinearGradient(0, 0, W * 0.4, H);
    g.addColorStop(0, P.bg1); g.addColorStop(0.54, P.bg2); g.addColorStop(1, P.bg3);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    var rg = ctx.createRadialGradient(W * 0.5, H * 0.3, 40, W * 0.5, H * 0.32, W * 0.98);
    rg.addColorStop(0, P.glow); rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);

    var rg2 = ctx.createRadialGradient(W * 0.12, H * 0.88, 20, W * 0.12, H * 0.9, W * 0.85);
    rg2.addColorStop(0, P.glow2); rg2.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg2; ctx.fillRect(0, 0, W, H);

    /* 위에서 스며드는 금빛 — 카드가 종이보다 천처럼 보이게 */
    var rg3 = ctx.createRadialGradient(W * 0.5, -H * 0.05, 40, W * 0.5, H * 0.1, W * 0.95);
    rg3.addColorStop(0, P.goldGlow); rg3.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg3; ctx.fillRect(0, 0, W, H);

    var rnd = mulberry32(love ? 20270214 : 20271121);
    ctx.save();
    for (var i = 0; i < 300; i++) {
      var x0 = rnd() * W, y0 = rnd() * H, len = 180 + rnd() * 560, ang = -0.62 + rnd() * 0.26;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(
        x0 + Math.cos(ang) * len * 0.5 + (rnd() - 0.5) * 46,
        y0 + Math.sin(ang) * len * 0.5,
        x0 + Math.cos(ang) * len,
        y0 + Math.sin(ang) * len
      );
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.012 + rnd() * 0.026).toFixed(3) + ')';
      ctx.lineWidth = 0.6 + rnd() * 1.7;
      ctx.stroke();
    }
    ctx.restore();

    /* 넓은 광택 밴드 (실크 결) */
    for (var b2 = 0; b2 < 3; b2++) {
      var by = H * (0.18 + b2 * 0.31);
      var bgGrad = ctx.createLinearGradient(0, by - 260, W, by + 260);
      bgGrad.addColorStop(0, 'rgba(255,255,255,0)');
      bgGrad.addColorStop(0.48, 'rgba(255,255,255,0.038)');
      bgGrad.addColorStop(0.52, 'rgba(255,255,255,0.050)');
      bgGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, by - 300, W, 600);
    }

    /* 비네트 */
    var vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.22, W / 2, H / 2, H * 0.74);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

    /* 2. 금박 이중 테두리 */
    ctx.save();
    roundPath(ctx, 40, 40, W - 80, H - 80, 30);
    ctx.lineWidth = 3.2; ctx.strokeStyle = goldGrad(ctx, 40, 40, W - 40, H - 40, P); ctx.stroke();
    roundPath(ctx, 66, 66, W - 132, H - 132, 22);
    ctx.lineWidth = 1.1; ctx.strokeStyle = 'rgba(238,214,170,0.55)'; ctx.stroke();
    roundPath(ctx, 82, 82, W - 164, H - 164, 15);
    ctx.lineWidth = 0.8; ctx.strokeStyle = 'rgba(238,214,170,0.16)'; ctx.stroke();
    ctx.restore();

    /* 테두리 안쪽 모서리 장식 — 네 귀에 ㄱ자 금선 */
    ctx.save();
    ctx.strokeStyle = 'rgba(238,214,170,0.42)'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    var ci = 104, cl = 54;
    [[ci, ci, 1, 1], [W - ci, ci, -1, 1], [ci, H - ci, 1, -1], [W - ci, H - ci, -1, -1]].forEach(function (c) {
      ctx.beginPath();
      ctx.moveTo(c[0] + c[2] * cl, c[1]);
      ctx.lineTo(c[0], c[1]);
      ctx.lineTo(c[0], c[1] + c[3] * cl);
      ctx.stroke();
    });
    ctx.restore();

    /* 테두리 위 작은 다이아몬드 4개 (상하좌우) */
    ctx.save();
    ctx.fillStyle = goldGrad(ctx, W / 2 - 20, 0, W / 2 + 20, 80, P);
    [[W / 2, 40], [W / 2, H - 40], [40, H / 2], [W - 40, H / 2]].forEach(function (p) {
      diamond(ctx, p[0], p[1], 9); ctx.fill();
    });
    ctx.restore();

    /* 3. 위 — 연도 · 매듭 장식 */
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.font = '500 25px ' + serif;
    ctx.fillStyle = P.dim;
    spacedCenter(ctx, '2027 · 정미년', W / 2, 176, 11);

    ctx.strokeStyle = 'rgba(238,214,170,0.42)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(W / 2 - 168, 214); ctx.lineTo(W / 2 - 42, 214); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W / 2 + 42, 214); ctx.lineTo(W / 2 + 168, 214); ctx.stroke();
    ctx.fillStyle = goldGrad(ctx, W / 2 - 14, 200, W / 2 + 14, 228, P);
    diamond(ctx, W / 2, 214, 10); ctx.fill();
    ctx.beginPath(); ctx.arc(W / 2, 214, 20, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(238,214,170,0.30)'; ctx.lineWidth = 1; ctx.stroke();

    /* 4. 부적 이름 — 조합마다 다르다 */
    var title = o.title || (o.word + ' 부적');
    var tfs = 62;
    ctx.font = '700 ' + tfs + 'px ' + serif;
    var tw = ctx.measureText(title).width + 4 * Math.max(0, title.length - 1);
    if (tw > W - 220) {
      tfs = Math.max(34, Math.floor(tfs * (W - 220) / tw));
      ctx.font = '700 ' + tfs + 'px ' + serif;
    }
    ctx.fillStyle = goldGrad(ctx, 0, 300, 0, 380, P);
    spacedCenter(ctx, title, W / 2, 368, 4);

    /* 5. 부적 문양 — 조합마다 다른 금박 일러스트 14종(열쇠·불꽃·쌍고리·달과 파도·금전수·나비·별·연꽃·나침반·모래시계·쌍학·호리병·매듭·등롱) */
    drawEmblem(ctx, o.art, W / 2, 808, 452, P);

    /* 6. 이름 */
    ctx.textBaseline = 'alphabetic';
    var nmTx = o.a + '  ·  ' + o.b;
    var fs = 48;
    ctx.font = '600 ' + fs + 'px ' + serif;
    var nmW = ctx.measureText(nmTx).width + 2 * Math.max(0, nmTx.length - 1);
    if (nmW > W - 280) { fs = Math.max(28, Math.floor(fs * (W - 280) / nmW)); ctx.font = '600 ' + fs + 'px ' + serif; }
    ctx.fillStyle = P.cream;
    spacedCenter(ctx, nmTx, W / 2, 1196, 2);

    ctx.font = '400 26px ' + serif;
    ctx.fillStyle = P.dim;
    spacedCenter(ctx, '2027 정미년 · ' + o.word + ' 케미', W / 2, 1252, 5);

    /* 7. 부적 한 줄 */
    ctx.font = '600 44px ' + serif;
    var lines = wrapLines(ctx, o.line, 820);
    if (lines.length > 2) { ctx.font = '600 38px ' + serif; lines = wrapLines(ctx, o.line, 860); }
    var ly = lines.length > 1 ? 1336 : 1352;
    ctx.fillStyle = P.cream;
    lines.slice(0, 2).forEach(function (ln, idx) {
      spacedCenter(ctx, ln, W / 2, ly + idx * 64, 2);
    });

    /* 8. 구분선 */
    var dy = 1480;
    ctx.strokeStyle = 'rgba(238,214,170,0.30)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(W / 2 - 210, dy); ctx.lineTo(W / 2 - 40, dy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W / 2 + 40, dy); ctx.lineTo(W / 2 + 210, dy); ctx.stroke();
    ctx.fillStyle = 'rgba(238,214,170,0.55)';
    diamond(ctx, W / 2, dy, 8); ctx.fill();

    /* 9. 낙관 인장 (友 / 愛) */
    drawSeal(ctx, W - 236, 1548, 168, o.hanja, P, serif);
    /* 왼쪽 아래 — 2027 정미년 표식 */
    ctx.save();
    ctx.textAlign = 'left';
    ctx.font = '500 26px ' + serif;
    ctx.fillStyle = 'rgba(238,214,170,0.55)';
    ctx.fillText('丁未', 200, 1620);
    ctx.strokeStyle = 'rgba(238,214,170,0.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(200, 1644); ctx.lineTo(268, 1644); ctx.stroke();
    ctx.restore();

    /* 10. 워터마크 */
    ctx.textAlign = 'center';
    ctx.font = '600 33px ' + serif;
    ctx.fillStyle = 'rgba(240,216,172,0.92)';
    spacedCenter(ctx, '@life.saju_yoonise', W / 2, 1772, 1);
    ctx.font = '400 25px ' + serif;
    ctx.fillStyle = P.dim;
    spacedCenter(ctx, '윤이세사주 · 2027 타이밍 캘린더', W / 2, 1818, 3);

    /* 11. 금가루 */
    ctx.save();
    for (var s = 0; s < 46; s++) {
      var sx = 90 + rnd() * (W - 180), sy = 120 + rnd() * (H - 260), sr = 0.8 + rnd() * 1.9;
      ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,241,214,' + (0.06 + rnd() * 0.22).toFixed(3) + ')';
      ctx.fill();
    }
    ctx.restore();
  }

  /* ── 부적 문양 — 금박 선화(線畵). 조합마다 다른 그림 ──────────
     stars 쌍별 · moonwave 달과 파도 · key 황금열쇠
     butterfly 쌍나비 · money 금전수 · knot 매듭 · flame 쌍불꽃        */
  function starPath(ctx, x, y, r) {
    var k = r * 0.16;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x + k, y - k, x + r, y);
    ctx.quadraticCurveTo(x + k, y + k, x, y + r);
    ctx.quadraticCurveTo(x - k, y + k, x - r, y);
    ctx.quadraticCurveTo(x - k, y - k, x, y - r);
    ctx.closePath();
  }

  function emStars(ctx, cx, cy, S) {
    starPath(ctx, cx - S * 0.26, cy - S * 0.22, S * 0.40); ctx.fill();
    starPath(ctx, cx + S * 0.34, cy + S * 0.26, S * 0.23); ctx.fill();
    /* 작은 별가루 */
    [[-0.60, 0.34, 0.030], [0.58, -0.42, 0.024], [0.12, 0.60, 0.020], [-0.42, -0.58, 0.017]].forEach(function (d) {
      ctx.beginPath();
      ctx.arc(cx + S * d[0], cy + S * d[1], S * d[2], 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function emMoonWave(ctx, cx, cy, S) {
    /* 초승달 — 큰 원에서 작은 원을 빼서 금빛 달 */
    var mR = S * 0.30, mx = cx - S * 0.30, my = cy - S * 0.30;
    ctx.beginPath();
    ctx.arc(mx, my, mR, 0, Math.PI * 2);
    ctx.moveTo(mx + mR * 0.86 + mR * 0.82, my);
    ctx.arc(mx + mR * 0.86, my, mR * 0.82, 0, Math.PI * 2, true);
    ctx.fill('evenodd');
    /* 파도 세 줄 */
    for (var w = 0; w < 3; w++) {
      var wy = cy + S * 0.10 + w * S * 0.155;
      ctx.beginPath();
      ctx.moveTo(cx - S * 0.52, wy);
      ctx.bezierCurveTo(cx - S * 0.26, wy - S * 0.13, cx - S * 0.10, wy + S * 0.13, cx + S * 0.04, wy);
      ctx.bezierCurveTo(cx + S * 0.18, wy - S * 0.13, cx + S * 0.34, wy + S * 0.09, cx + S * 0.50, wy - S * 0.02);
      ctx.stroke();
    }
    /* 물빛 반짝임 */
    [[0.40, -0.34, 0.030], [0.52, -0.16, 0.020]].forEach(function (d) {
      ctx.beginPath();
      ctx.arc(cx + S * d[0], cy + S * d[1], S * d[2], 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function emKey(ctx, cx, cy, S) {
    ctx.beginPath(); ctx.arc(cx, cy - S * 0.40, S * 0.19, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy - S * 0.40, S * 0.095, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - S * 0.21); ctx.lineTo(cx, cy + S * 0.52); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy + S * 0.20); ctx.lineTo(cx + S * 0.26, cy + S * 0.20); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy + S * 0.36); ctx.lineTo(cx + S * 0.20, cy + S * 0.36); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy + S * 0.50); ctx.lineTo(cx + S * 0.14, cy + S * 0.50); ctx.stroke();
    /* 열쇠 구멍 반짝 — 작은 다이아몬드 */
    diamond(ctx, cx + S * 0.44, cy - S * 0.46, S * 0.05); ctx.fill();
    diamond(ctx, cx - S * 0.40, cy + S * 0.30, S * 0.035); ctx.fill();
  }

  function emButterflyOne(ctx, x, y, s, tilt) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt || 0);
    /* 몸통 — 채워서 또렷하게 */
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.62);
    ctx.quadraticCurveTo(s * 0.10, -s * 0.10, s * 0.045, s * 0.30);
    ctx.quadraticCurveTo(s * 0.02, s * 0.56, 0, s * 0.60);
    ctx.quadraticCurveTo(-s * 0.02, s * 0.56, -s * 0.045, s * 0.30);
    ctx.quadraticCurveTo(-s * 0.10, -s * 0.10, 0, -s * 0.62);
    ctx.closePath();
    ctx.fill();
    [-1, 1].forEach(function (d) {
      /* 윗날개 — 크고 뾰족하게 */
      ctx.beginPath();
      ctx.moveTo(d * s * 0.05, -s * 0.52);
      ctx.bezierCurveTo(d * s * 0.40, -s * 1.30, d * s * 1.24, -s * 1.06, d * s * 1.02, -s * 0.54);
      ctx.bezierCurveTo(d * s * 0.90, -s * 0.22, d * s * 0.34, -s * 0.16, d * s * 0.05, -s * 0.20);
      ctx.stroke();
      /* 아랫날개 — 작고 뾰족하게 */
      ctx.beginPath();
      ctx.moveTo(d * s * 0.05, -s * 0.10);
      ctx.bezierCurveTo(d * s * 0.60, -s * 0.02, d * s * 0.86, s * 0.36, d * s * 0.46, s * 0.66);
      ctx.bezierCurveTo(d * s * 0.20, s * 0.84, d * s * 0.06, s * 0.40, d * s * 0.05, s * 0.20);
      ctx.stroke();
      /* 더듬이 */
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.60);
      ctx.quadraticCurveTo(d * s * 0.28, -s * 0.98, d * s * 0.50, -s * 1.02);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(d * s * 0.52, -s * 1.03, s * 0.038, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  function emButterfly(ctx, cx, cy, S) {
    emButterflyOne(ctx, cx - S * 0.26, cy - S * 0.04, S * 0.36, -0.12);
    emButterflyOne(ctx, cx + S * 0.36, cy + S * 0.30, S * 0.22, 0.26);
    diamond(ctx, cx + S * 0.56, cy - S * 0.50, S * 0.038); ctx.fill();
    diamond(ctx, cx - S * 0.58, cy + S * 0.44, S * 0.030); ctx.fill();
  }

  function emMoney(ctx, cx, cy, S) {
    /* 금전수 — 줄기에서 뻗은 가지 끝에 엽전 */
    ctx.lineWidth = Math.max(5, S * 0.030);
    ctx.beginPath();
    ctx.moveTo(cx, cy + S * 0.54);
    ctx.quadraticCurveTo(cx - S * 0.06, cy + S * 0.10, cx + S * 0.02, cy - S * 0.50);
    ctx.stroke();

    var coins = [
      { x: -0.40, y: -0.06, r: 0.115, by: 0.16 },
      { x: 0.38, y: -0.28, r: 0.100, by: -0.06 },
      { x: -0.24, y: -0.46, r: 0.085, by: -0.28 }
    ];
    ctx.lineWidth = Math.max(3.5, S * 0.020);
    coins.forEach(function (c) {
      var px = cx + S * c.x, py = cy + S * c.y;
      ctx.beginPath();
      ctx.moveTo(cx + S * 0.01, cy + S * c.by);
      ctx.quadraticCurveTo((cx + px) / 2, py + S * 0.10, px + (c.x < 0 ? S * c.r * 0.55 : -S * c.r * 0.55), py + S * c.r * 0.45);
      ctx.stroke();
    });
    /* 바닥 */
    ctx.lineWidth = Math.max(4, S * 0.024);
    ctx.beginPath(); ctx.moveTo(cx - S * 0.30, cy + S * 0.58); ctx.lineTo(cx + S * 0.30, cy + S * 0.58); ctx.stroke();

    coins.forEach(function (c) {
      var px = cx + S * c.x, py = cy + S * c.y, r = S * c.r;
      ctx.lineWidth = Math.max(5, S * 0.028);
      ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.stroke();
      var q = r * 0.34;
      ctx.beginPath();
      ctx.moveTo(px - q, py - q); ctx.lineTo(px + q, py - q);
      ctx.lineTo(px + q, py + q); ctx.lineTo(px - q, py + q);
      ctx.closePath(); ctx.stroke();
    });
  }

  function emKnot(ctx, cx, cy, S) {
    /* 금실 매듭 — 돌린 둥근 사각 두 겹에 네 귀 고리 (의리 = 단단히 묶인 매듭) */
    var r = S * 0.30, rr = Math.sqrt(2) * r * 0.80;
    ctx.lineWidth = Math.max(4, S * 0.022);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (d) {
      ctx.beginPath();
      ctx.arc(cx + d[0] * rr, cy + d[1] * rr, r * 0.20, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 4);
    ctx.lineWidth = Math.max(5, S * 0.030);
    roundPath(ctx, -r * 0.80, -r * 0.80, r * 1.60, r * 1.60, r * 0.26);
    ctx.stroke();
    ctx.lineWidth = Math.max(3, S * 0.017);
    roundPath(ctx, -r * 0.44, -r * 0.44, r * 0.88, r * 0.88, r * 0.16);
    ctx.stroke();
    ctx.restore();
    /* 아래 술 세 가닥 */
    ctx.lineWidth = Math.max(3, S * 0.018);
    [-1, 0, 1].forEach(function (t) {
      ctx.beginPath();
      ctx.moveTo(cx + t * S * 0.05, cy + rr + r * 0.14);
      ctx.quadraticCurveTo(cx + t * S * 0.07, cy + rr + r * 0.34, cx + t * S * 0.11, cy + rr + r * 0.48);
      ctx.stroke();
    });
    diamond(ctx, cx + S * 0.52, cy - S * 0.44, S * 0.026); ctx.fill();
  }

  function emFlameShape(ctx, x, yBase, h, w) {
    ctx.beginPath();
    ctx.moveTo(x, yBase);
    ctx.bezierCurveTo(x - w * 1.02, yBase - h * 0.24, x - w * 0.80, yBase - h * 0.66, x - w * 0.02, yBase - h);
    ctx.bezierCurveTo(x + w * 0.14, yBase - h * 0.62, x + w * 0.54, yBase - h * 0.46, x + w * 0.52, yBase - h * 0.20);
    ctx.bezierCurveTo(x + w * 0.50, yBase - h * 0.10, x + w * 0.30, yBase - h * 0.02, x + w * 0.22, yBase - h * 0.16);
    ctx.bezierCurveTo(x + w * 0.16, yBase - h * 0.04, x + w * 0.08, yBase, x, yBase);
    ctx.stroke();
  }

  function emFlame(ctx, cx, cy, S) {
    emFlameShape(ctx, cx - S * 0.18, cy + S * 0.46, S * 0.90, S * 0.30);
    emFlameShape(ctx, cx + S * 0.24, cy + S * 0.46, S * 0.62, S * 0.22);
    ctx.lineWidth = Math.max(2.5, S * 0.013);
    emFlameShape(ctx, cx - S * 0.18, cy + S * 0.42, S * 0.44, S * 0.13);
    ctx.lineWidth = Math.max(4, S * 0.026);
    [[0.46, -0.30, 0.032], [-0.44, -0.44, 0.026]].forEach(function (d) {
      ctx.beginPath();
      ctx.arc(cx + S * d[0], cy + S * d[1], S * d[2], 0, Math.PI * 2);
      ctx.fill();
    });
  }

  /* 쌍고리 — 두 개의 금고리가 맞물린 문양 (인연·의리) */
  function emRing(ctx, cx, cy, S) {
    var r = S * 0.265, off = S * 0.19;
    ctx.lineWidth = Math.max(6, S * 0.044);
    ctx.beginPath(); ctx.arc(cx - off, cy - S * 0.06, r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx + off, cy + S * 0.10, r, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = Math.max(3, S * 0.018);
    ctx.beginPath(); ctx.arc(cx - off, cy - S * 0.06, r * 0.52, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx + off, cy + S * 0.10, r * 0.52, 0, Math.PI * 2); ctx.stroke();
    diamond(ctx, cx - S * 0.02, cy + S * 0.03, S * 0.045); ctx.fill();
    diamond(ctx, cx - S * 0.50, cy - S * 0.42, S * 0.030); ctx.fill();
    diamond(ctx, cx + S * 0.52, cy + S * 0.46, S * 0.026); ctx.fill();
  }

  /* 연꽃 — 다섯 꽃잎이 위로 벌어진 문양 */
  function emLotusPetal(ctx, x, y, h, w, tilt) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-w, -h * 0.30, -w * 0.84, -h * 0.80, 0, -h);
    ctx.bezierCurveTo(w * 0.84, -h * 0.80, w, -h * 0.30, 0, 0);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
  function emLotus(ctx, cx, cy, S) {
    var bx = cx, by = cy + S * 0.38;
    ctx.lineWidth = Math.max(4, S * 0.026);
    [[0, 0.78, 0.145], [-0.40, 0.68, 0.135], [0.40, 0.68, 0.135],
     [-0.76, 0.56, 0.125], [0.76, 0.56, 0.125]].forEach(function (p) {
      emLotusPetal(ctx, bx, by, S * p[1], S * p[2], p[0]);
    });
    /* 물결 바닥 */
    ctx.lineWidth = Math.max(3, S * 0.020);
    ctx.beginPath();
    ctx.moveTo(cx - S * 0.44, cy + S * 0.50);
    ctx.bezierCurveTo(cx - S * 0.20, cy + S * 0.42, cx + S * 0.20, cy + S * 0.58, cx + S * 0.44, cy + S * 0.48);
    ctx.stroke();
    diamond(ctx, cx + S * 0.46, cy - S * 0.30, S * 0.034); ctx.fill();
    diamond(ctx, cx - S * 0.50, cy - S * 0.14, S * 0.024); ctx.fill();
  }

  /* 황금나침반 — 방향을 잡아 주는 문양 */
  function emCompass(ctx, cx, cy, S) {
    var r = S * 0.40;
    ctx.lineWidth = Math.max(5, S * 0.030);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = Math.max(2, S * 0.012);
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.84, 0, Math.PI * 2); ctx.stroke();
    for (var i = 0; i < 8; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 4;
      var r1 = r * (i % 2 ? 0.70 : 0.76), r2 = r * 0.90;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
      ctx.stroke();
    }
    /* 바늘 — 북쪽은 채운 삼각, 남쪽은 선 */
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.62);
    ctx.lineTo(cx - r * 0.15, cy + r * 0.04);
    ctx.lineTo(cx + r * 0.15, cy + r * 0.04);
    ctx.closePath(); ctx.fill();
    ctx.lineWidth = Math.max(4, S * 0.022);
    ctx.beginPath();
    ctx.moveTo(cx, cy + r * 0.60);
    ctx.lineTo(cx - r * 0.15, cy + r * 0.04);
    ctx.lineTo(cx + r * 0.15, cy + r * 0.04);
    ctx.closePath(); ctx.stroke();
    diamond(ctx, cx, cy + r * 0.04, S * 0.036); ctx.fill();
    diamond(ctx, cx - S * 0.52, cy - S * 0.46, S * 0.026); ctx.fill();
  }

  /* 모래시계 — 시간·타이밍 문양 */
  function emHourglass(ctx, cx, cy, S) {
    var w = S * 0.26, h = S * 0.40, y0 = cy - h, y1 = cy + h;
    ctx.lineWidth = Math.max(5, S * 0.030);
    ctx.beginPath(); ctx.moveTo(cx - w * 1.06, y0); ctx.lineTo(cx + w * 1.06, y0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - w * 1.06, y1); ctx.lineTo(cx + w * 1.06, y1); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.86, y0); ctx.lineTo(cx + w * 0.86, y0);
    ctx.lineTo(cx, cy - S * 0.015); ctx.closePath(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.86, y1); ctx.lineTo(cx + w * 0.86, y1);
    ctx.lineTo(cx, cy + S * 0.015); ctx.closePath(); ctx.stroke();
    /* 모래 줄기 */
    ctx.lineWidth = Math.max(2.4, S * 0.013);
    ctx.beginPath(); ctx.moveTo(cx, cy - S * 0.015); ctx.lineTo(cx, cy + S * 0.075); ctx.stroke();
    /* 아래로 쌓인 모래 */
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.60, y1 - S * 0.012);
    ctx.lineTo(cx + w * 0.60, y1 - S * 0.012);
    ctx.lineTo(cx, cy + S * 0.17);
    ctx.closePath(); ctx.fill();
    [[-0.30, -0.20], [0.34, -0.26], [0.16, 0.16], [-0.16, 0.30]].forEach(function (d) {
      ctx.beginPath();
      ctx.arc(cx + S * d[0], cy + S * d[1], S * 0.018, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  /* 쌍학 — 마주 보는 두 마리, 멀리 가도 다시 오는 새 */
  function emCraneOne(ctx, cx, cy, s, dir) {
    function X(v) { return cx + v * s * dir; }
    ctx.lineWidth = Math.max(4, s * 0.055);
    ctx.beginPath();
    if (ctx.ellipse) ctx.ellipse(cx, cy, s * 0.19, s * 0.105, 0, 0, Math.PI * 2);
    else ctx.arc(cx, cy, s * 0.14, 0, Math.PI * 2);
    ctx.stroke();
    /* 목 — S자로 세운 긴 목 */
    ctx.beginPath();
    ctx.moveTo(X(0.13), cy - s * 0.05);
    ctx.bezierCurveTo(X(0.29), cy - s * 0.08, X(0.23), cy - s * 0.34, X(0.35), cy - s * 0.45);
    ctx.stroke();
    /* 머리 · 부리 */
    ctx.beginPath(); ctx.arc(X(0.39), cy - s * 0.48, s * 0.045, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = Math.max(3, s * 0.032);
    ctx.beginPath(); ctx.moveTo(X(0.43), cy - s * 0.485); ctx.lineTo(X(0.60), cy - s * 0.45); ctx.stroke();
    /* 꼬리 깃 */
    ctx.lineWidth = Math.max(3, s * 0.034);
    ctx.beginPath(); ctx.moveTo(X(-0.17), cy - s * 0.04); ctx.lineTo(X(-0.42), cy - s * 0.14); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(X(-0.18), cy + s * 0.01); ctx.lineTo(X(-0.45), cy + s * 0.01); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(X(-0.17), cy + s * 0.05); ctx.lineTo(X(-0.40), cy + s * 0.16); ctx.stroke();
    /* 다리 */
    ctx.lineWidth = Math.max(2.5, s * 0.026);
    ctx.beginPath(); ctx.moveTo(X(0.01), cy + s * 0.09); ctx.lineTo(X(-0.01), cy + s * 0.34); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(X(0.09), cy + s * 0.09); ctx.lineTo(X(0.07), cy + s * 0.34); ctx.stroke();
    /* 접은 날개 */
    ctx.lineWidth = Math.max(4, s * 0.05);
    ctx.beginPath();
    ctx.moveTo(X(-0.09), cy - s * 0.06);
    ctx.bezierCurveTo(X(0.03), cy - s * 0.26, X(0.10), cy - s * 0.10, X(-0.01), cy + s * 0.03);
    ctx.stroke();
  }
  function emCrane(ctx, cx, cy, S) {
    emCraneOne(ctx, cx - S * 0.22, cy + S * 0.03, S * 0.46, 1);
    emCraneOne(ctx, cx + S * 0.24, cy + S * 0.05, S * 0.40, -1);
    /* 물가 */
    ctx.lineWidth = Math.max(3, S * 0.018);
    ctx.beginPath();
    ctx.moveTo(cx - S * 0.46, cy + S * 0.21);
    ctx.bezierCurveTo(cx - S * 0.30, cy + S * 0.17, cx - S * 0.12, cy + S * 0.25, cx - S * 0.02, cy + S * 0.21);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + S * 0.04, cy + S * 0.22);
    ctx.bezierCurveTo(cx + S * 0.22, cy + S * 0.17, cx + S * 0.40, cy + S * 0.25, cx + S * 0.48, cy + S * 0.21);
    ctx.stroke();
    diamond(ctx, cx + S * 0.52, cy - S * 0.44, S * 0.026); ctx.fill();
    diamond(ctx, cx - S * 0.54, cy - S * 0.30, S * 0.022); ctx.fill();
  }

  /* 호리병 — 좁은 목에 복을 담아 두는 병 */
  function emGourd(ctx, cx, cy, S) {
    var rb = S * 0.29, rt = S * 0.125;
    var yb = cy + S * 0.20, yt = cy - S * 0.28;
    ctx.lineWidth = Math.max(5, S * 0.030);
    ctx.beginPath(); ctx.arc(cx, yb, rb, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, yt, rt, 0, Math.PI * 2); ctx.stroke();
    /* 좁은 목 */
    ctx.lineWidth = Math.max(4, S * 0.024);
    [-1, 1].forEach(function (d) {
      ctx.beginPath();
      ctx.moveTo(cx + d * rt * 0.94, yt + rt * 0.34);
      ctx.bezierCurveTo(cx + d * rt * 0.92, yt + rt * 1.5,
        cx + d * rb * 0.30, yb - rb * 1.02, cx + d * rb * 0.28, yb - rb * 0.96);
      ctx.stroke();
    });
    /* 마개 */
    ctx.lineWidth = Math.max(5, S * 0.028);
    ctx.beginPath(); ctx.moveTo(cx - rt * 0.52, yt - rt * 1.02); ctx.lineTo(cx + rt * 0.52, yt - rt * 1.02); ctx.stroke();
    /* 덩굴 · 잎 */
    ctx.lineWidth = Math.max(3, S * 0.018);
    ctx.beginPath();
    ctx.moveTo(cx, yt - rt * 1.14);
    ctx.bezierCurveTo(cx + S * 0.02, cy - S * 0.56, cx + S * 0.10, cy - S * 0.54, cx + S * 0.14, cy - S * 0.50);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + S * 0.13, cy - S * 0.51);
    ctx.bezierCurveTo(cx + S * 0.30, cy - S * 0.58, cx + S * 0.36, cy - S * 0.44, cx + S * 0.22, cy - S * 0.40);
    ctx.bezierCurveTo(cx + S * 0.17, cy - S * 0.44, cx + S * 0.14, cy - S * 0.47, cx + S * 0.13, cy - S * 0.51);
    ctx.stroke();
    /* 허리 매듭 */
    ctx.lineWidth = Math.max(3, S * 0.018);
    ctx.beginPath();
    ctx.moveTo(cx - S * 0.14, cy - S * 0.03);
    ctx.quadraticCurveTo(cx, cy + S * 0.02, cx + S * 0.14, cy - S * 0.03);
    ctx.stroke();
    diamond(ctx, cx + S * 0.40, cy + S * 0.28, S * 0.030); ctx.fill();
    diamond(ctx, cx - S * 0.44, cy + S * 0.14, S * 0.022); ctx.fill();
  }

  /* 쌍등롱 — 밤길을 밝히는 초롱 두 개 */
  function emLanternOne(ctx, cx, cy, w, h) {
    ctx.lineWidth = Math.max(4, w * 0.16);
    ctx.beginPath(); ctx.moveTo(cx, cy - h * 0.86); ctx.lineTo(cx, cy - h * 0.52); ctx.stroke();
    roundPath(ctx, cx - w / 2, cy - h / 2, w, h, w * 0.34);
    ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - w * 0.44, cy - h * 0.5); ctx.lineTo(cx + w * 0.44, cy - h * 0.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - w * 0.44, cy + h * 0.5); ctx.lineTo(cx + w * 0.44, cy + h * 0.5); ctx.stroke();
    ctx.lineWidth = Math.max(2.2, w * 0.075);
    [-0.24, 0, 0.24].forEach(function (dx) {
      ctx.beginPath();
      ctx.moveTo(cx + w * dx, cy - h * 0.40);
      ctx.lineTo(cx + w * dx, cy + h * 0.40);
      ctx.stroke();
    });
    ctx.beginPath(); ctx.moveTo(cx, cy + h * 0.52); ctx.lineTo(cx, cy + h * 0.74); ctx.stroke();
  }
  function emLantern(ctx, cx, cy, S) {
    emLanternOne(ctx, cx - S * 0.22, cy - S * 0.04, S * 0.34, S * 0.46);
    emLanternOne(ctx, cx + S * 0.26, cy + S * 0.16, S * 0.28, S * 0.38);
    diamond(ctx, cx + S * 0.50, cy - S * 0.46, S * 0.026); ctx.fill();
    diamond(ctx, cx - S * 0.46, cy + S * 0.50, S * 0.022); ctx.fill();
  }

  function drawEmblem(ctx, kind, cx, cy, S, P) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    /* 뒤 고리 — 은은한 금빛 */
    ctx.beginPath(); ctx.arc(cx, cy, S * 0.80, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(238,214,170,0.15)'; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, S * 0.93, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(238,214,170,0.07)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.save();
    ctx.fillStyle = 'rgba(238,214,170,0.50)';
    for (var d = 0; d < 4; d++) {
      var ang = Math.PI / 4 + d * Math.PI / 2;
      diamond(ctx, cx + Math.cos(ang) * S * 0.80, cy + Math.sin(ang) * S * 0.80, 6);
      ctx.fill();
    }
    ctx.restore();

    ctx.strokeStyle = goldGrad(ctx, cx - S, cy - S, cx + S, cy + S, P);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = Math.max(4, S * 0.026);
    ctx.shadowColor = P.glyphGlow;
    ctx.shadowBlur = 46;

    if (kind === 'stars') emStars(ctx, cx, cy, S);
    else if (kind === 'moonwave') emMoonWave(ctx, cx, cy, S);
    else if (kind === 'key') emKey(ctx, cx, cy, S);
    else if (kind === 'butterfly') emButterfly(ctx, cx, cy, S);
    else if (kind === 'money') emMoney(ctx, cx, cy, S);
    else if (kind === 'knot') emKnot(ctx, cx, cy, S);
    else if (kind === 'ring') emRing(ctx, cx, cy, S);
    else if (kind === 'lotus') emLotus(ctx, cx, cy, S);
    else if (kind === 'compass') emCompass(ctx, cx, cy, S);
    else if (kind === 'hourglass') emHourglass(ctx, cx, cy, S);
    else if (kind === 'crane') emCrane(ctx, cx, cy, S);
    else if (kind === 'gourd') emGourd(ctx, cx, cy, S);
    else if (kind === 'lantern') emLantern(ctx, cx, cy, S);
    else emFlame(ctx, cx, cy, S);

    ctx.restore();
  }

  function drawSeal(ctx, x, y, size, hanja, P, serif) {
    ctx.save();
    ctx.translate(x + size / 2, y + size / 2);
    ctx.rotate(-4 * Math.PI / 180);
    var h = size / 2;
    roundPath(ctx, -h, -h, size, size, 10);
    ctx.fillStyle = P.seal;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,238,224,0.55)';
    roundPath(ctx, -h + 7, -h + 7, size - 14, size - 14, 6);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FBEEE2';
    ctx.font = '700 ' + Math.round(size * 0.52) + 'px ' + serif;
    ctx.fillText(hanja, 0, -size * 0.04);
    ctx.font = '500 ' + Math.round(size * 0.12) + 'px ' + serif;
    ctx.fillStyle = 'rgba(255,238,224,0.85)';
    ctx.fillText('2027', 0, size * 0.30);
    ctx.restore();
  }

  function amulFname(rel, aName, bName) {
    return '2027-' + (rel === 'love' ? '사랑부적' : '우정부적') + '-' + (aName || '나') + (bName ? '-' + bName : '') + '.png';
  }

  /* PNG 를 내려받기 — quiet: 토스트 없이(공유 안 되는 환경에서 이미지도 함께 떨어뜨릴 때) */
  function saveAmul(cv, rel, aName, bName, quiet) {
    var fname = amulFname(rel, aName, bName);
    function fail() {
      if (!quiet) toast('저장이 막히면 카드를 길게 눌러 저장해 주세요.');
    }
    function done() {
      if (!quiet) toast('이미지로 저장했어요 — 사진첩에서 확인해 주세요.');
    }
    try {
      if (cv.toBlob) {
        cv.toBlob(function (blob) {
          if (!blob) { fail(); return; }
          var url = URL.createObjectURL(blob);
          var aEl = doc.createElement('a');
          aEl.href = url;
          aEl.download = fname;
          aEl.rel = 'noopener';
          doc.body.appendChild(aEl);
          aEl.click();
          doc.body.removeChild(aEl);
          setTimeout(function () { URL.revokeObjectURL(url); }, 6000);
          done();
        }, 'image/png');
        return;
      }
      var url2 = cv.toDataURL('image/png');
      var a2 = doc.createElement('a');
      a2.href = url2; a2.download = fname;
      doc.body.appendChild(a2); a2.click(); doc.body.removeChild(a2);
      done();
    } catch (e) { fail(); }
  }

  /* ══ 카톡 공유 (2026-11-24 김나영 님 확정) ══════════════════════════════════
     · 이름 박힌 개인 케미 부적은 옆의 [이미지로 저장]으로 소장한다.
     · [친구에게 보내기]·[내 링크 바로 보내기]는 **?chemi=(생년월일시) 없이**
       안전한 초대 링크(?ref=내코드) 하나만 보낸다 — 받는 사람 사주가 주소에 남지 않는다.
     · 카카오 SDK 가 있으면 공식 피드(대표 부적 그림 + 문구 + 링크 버튼)로,
       없으면 navigator.share(문구 + 링크 1개), 그것도 없으면 복사로 떨어진다. */
  var KAKAO_JS_KEY = '24485cf462cb3fa08ecc21117bb3b6e4';   // 카카오 디벨로퍼스 앱 1660074 · JavaScript 키
  /* 문구·제목은 김나영 님 확정(2026-11-25) — "내가 봤는데 잘 맞더라 너도 해봐" */
  var SHARE_TITLE = '사주타이밍 · 무료 부적';
  var SHARE_TEXT = '2027 사주타이밍, 내가 봤는데 잘 맞더라 너도 해봐!';
  var SHARE_IMG_BASE = CALENDAR_LIVE_BASE.replace(/\/calendar\/?$/, '/calendar/assets/share/');
  /* 2026-11-25: 옛 연두 대나무 그림이 카톡에 그대로 떠서(카카오 이미지 캐시) 파일 이름과 버전을 함께 바꿨다.
     이름만 같으면 캐시가 남으므로 friend-2027.jpg + ?v= — 둘 중 하나는 반드시 갱신한다. */
  var SHARE_IMG_VER = '?v=20261126b';
  var SHARE_IMG = {
    friend: SHARE_IMG_BASE + 'friend-2027.jpg' + SHARE_IMG_VER,
    love: SHARE_IMG_BASE + 'love-2027.jpg' + SHARE_IMG_VER,
    luck: SHARE_IMG_BASE + 'luck-2027.jpg' + SHARE_IMG_VER
  };

  /** 카카오 SDK 준비 — 없으면 null (일반 공유로 떨어진다) */
  function kakaoSdk() {
    try {
      var K = window.Kakao;
      if (!K || !K.init) return null;
      /* SDK 2.7 은 init 전에는 Kakao.Share 가 아직 안 붙는다 — 먼저 init 하고 나서 확인한다 */
      if (typeof K.isInitialized === 'function' && !K.isInitialized()) K.init(KAKAO_JS_KEY);
      if (!K.Share) return null;
      return K;
    } catch (e) { return null; }
  }

  /** 공유 링크 — 초대 코드만 담은 달력 주소 (케미 사주는 담지 않는다) */
  function inviteShareLink(ch) {
    return myLink();
  }

  /** 카톡/일반 공유 실행 — rel 은 friend·love·luck */
  function shareInvite(rel) {
    var url = myLink();
    var K = kakaoSdk();
    if (K) {
      try {
        K.Share.sendDefault({
          objectType: 'feed',
          content: {
            title: SHARE_TITLE,
            description: SHARE_TEXT,
            imageUrl: SHARE_IMG[rel] || SHARE_IMG.luck,
            link: { mobileWebUrl: url, webUrl: url }
          },
          buttons: [{ title: '내 달력 보기', link: { mobileWebUrl: url, webUrl: url } }]
        });
        return;
      } catch (e) { /* 아래 일반 공유로 */ }
    }
    if (navigator.share) {
      try {
        navigator.share({ title: SHARE_TITLE, text: SHARE_TEXT, url: url })
          .then(function () {}, function (err) {
            if (err && err.name === 'AbortError') return;
            copyShareFallback(url);
          });
        return;
      } catch (e) { }
    }
    copyShareFallback(url);
  }

  function copyShareFallback(url) {
    copyText(SHARE_TEXT + '\n' + url).then(function (ok) {
      toast(ok ? '링크가 복사됐어요 — 카톡에 붙여넣어 보내 주세요.' : '링크를 화면에서 길게 눌러 복사해 주세요.');
    });
  }

  /* ── [친구에게 보내기] — 초대 링크 하나만 (2026-11-24) ──────────────────────
     2026-11-23 실기기 제보(#17252): 예전엔 부적 PNG를 files로 같이 넘겼는데,
     안드로이드·iOS 카톡은 files가 있으면 그림만 받고 text·url을 잘라 버렸다.
     → 그림은 [이미지로 저장] 몫으로 두고, 보내기는 링크 하나만.
     · ?chemi=(생년월일시)는 이제 싣지 않는다 — 받는 사람 사주가 주소에 남지 않게.
     · 로그인 전에도 보내기를 막지 않는다(내 초대 코드만 빠진다). */
  function shareAmul(ch) {
    shareInvite(relNow() === 'love' ? 'love' : 'friend');
  }

  /* ── [내 링크 바로 보내기] — 초대 링크 하나 (2026-11-24) ─────────────────────
     문구는 확정본 한 줄, 링크는 ?ref= 하나. 케미 사주(?chemi=)는 싣지 않는다. */
  function onShareMyLink(ch) {
    if (!state.user) { onLogin(null, $('#growShareBtn')); return; }
    if (!myCode()) {
      loadProfile();
      toast('내 초대 코드를 준비하는 중이에요 — 잠시 뒤 다시 눌러 주세요.');
      return;
    }
    shareInvite('luck');
  }

  /* ── grow 카드의 내 추천 현황 + 버튼 이름 ───────────
     로그인 전: [카카오로 연결하고 내 링크 받기] / 로그인 후: '현재 N명 달성' + [내 링크 바로 보내기]
     숫자는 서버(referrals)가 준 값만 — 지어내지 않는다. */
  function updateGrow() {
    var btn = $('#growShareBtn'), stat = $('#growStat');
    if (btn) btn.textContent = state.user ? '내 링크 바로 보내기' : '카카오로 연결하고 내 링크 받기';
    if (!stat) return;
    if (!state.user) { stat.hidden = true; stat.innerHTML = ''; return; }
    if (state.demo !== null) { stat.hidden = false; stat.innerHTML = '미리보기 숫자예요'; return; }
    if (state.db !== 'live') {
      stat.hidden = false;
      stat.textContent = state.db === 'unavailable'
        ? '내 추천 명수를 다시 확인하는 중이에요'
        : '내 추천 명수를 불러오는 중…';
      return;
    }
    var n = state.invited, LAD = ladderFor(state.paidTier), next = null;
    for (var i = 0; i < LAD.length; i++) if (n < LAD[i].n) { next = LAD[i]; break; }
    stat.hidden = false;
    stat.innerHTML = '현재 <b>' + n + '명</b> 달성'
      + (next ? ' · 다음 칸 ' + next.n + '명까지 <b>' + (next.n - n) + '명</b>' : ' · 사다리 끝까지 왔어요');
  }

  /* ── 케미: 링크 ─────────────────────────────────── */
  function encodeChemin(p) {
    var t = p.timeKnown ? (pad2(p.hh) + pad2(p.mm)) : '0000';
    return '' + p.y + pad2(p.mo) + pad2(p.d) + t + '-' + p.gender + (p.timeKnown ? '1' : '0');
  }
  function decodeChemin(s) {
    var m = /^(\d{4})(\d{2})(\d{2})(\d{4})-([FM])([01])$/.exec(String(s || '').trim().toUpperCase());
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3], hh = +m[4].slice(0, 2), mi = +m[4].slice(2);
    if (y < 1900 || y > 2026 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    var known = m[6] === '1';
    return { y: y, mo: mo, d: d, timeKnown: known, hh: known ? hh : 12, mm: known ? mi : 0, gender: m[5] };
  }

  /* 링크에는 언제나 양력 날짜를 담는다 — 음력으로 넣은 사주도 받는 쪽에서는 같은 날짜로 앉힌다 */
  function shareableOf(ch) {
    var s = ch.res.solar;
    return {
      y: s.y, mo: s.m, d: s.d, gender: ch.p.gender,
      timeKnown: ch.p.timeKnown, hh: ch.p.hh, mm: ch.p.mm, name: ch.p.name
    };
  }

  /* ── 케미: 실행 ─────────────────────────────────── */
  function runChemin(force) {
    if (state.busy) return;
    var msg = $('#chemiMsg');
    msg.hidden = true;

    var rMe = readPerson('me');
    var rYou = readPerson('you');
    if (rMe.error) { showCheminError(rMe); return; }
    if (rYou.error) { showCheminError(rYou); return; }

    /* 로그인 전에도 결과를 그대로 보여 준다 (2026-11-23 3차) — 막던 길은 걷어 냈다.
       넣은 사주는 세션에 쟁여 두어, 나중에 로그인해도 그대로 이어진다. */
    saveGate();

    var btn = $('#chemiBtn'), load = $('#chemiLoading');
    state.busy = true;
    btn.disabled = true;
    btn.classList.add('is-busy');
    load.hidden = false;

    setTimeout(function () {
      try {
        var a = chartOf(rMe.p);
        var b = chartOf(rYou.p);
        digestOf(a); digestOf(b);
        renderChemin(a, b);
        load.hidden = true;
        btn.disabled = false;
        btn.classList.remove('is-busy');
        state.busy = false;
      } catch (err) {
        load.hidden = true;
        btn.disabled = false;
        btn.classList.remove('is-busy');
        state.busy = false;
        showCheminError({ msg: (err && err.message) ? err.message : '사주를 세우지 못했어요. 생년월일을 다시 확인해 주세요.' });
      }
    }, 60);
  }

  function showCheminError(r) {
    var msg = $('#chemiMsg');
    if (!msg) return;
    msg.textContent = r.msg;
    msg.hidden = false;
    msg.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /* ── 내 사주 미리 채우기(기존 달력·오행 앱에 저장된 값) ── */
  function prefillMe() {
    var keys = ['yoonise.timing.v1', 'yoonise.oheng.last.v1'];
    for (var i = 0; i < keys.length; i++) {
      var o = null;
      try { o = JSON.parse(localStorage.getItem(keys[i]) || 'null'); } catch (e) { o = null; }
      if (!o || !o.y || !o.m || !o.d || !o.gender) continue;
      applyDate('me', {
        calendar: o.calendar, leap: o.leap, y: o.y, m: o.m, d: o.d,
        timeKnown: o.timeKnown !== false && o.hh != null && o.mm != null, hh: o.hh, mm: o.mm,
        name: o.name, gender: o.gender
      });
      return true;
    }
    return false;
  }

  /* ── ?ref · ?chemi 파라미터 ─────────────────────── */
  function readParams() {
    var q = new URLSearchParams(location.search);
    var ref = (q.get('ref') || '').trim().toUpperCase();
    var from = (q.get('from') || '').trim().slice(0, 12);
    if (/^[A-Z0-9]{4,12}$/.test(ref)) {
      try {
        localStorage.setItem(REF_KEY, ref);
        if (from) localStorage.setItem(REF_FROM_KEY, from);
        /* /calendar/ 도 이 손님을 '초대받은 손님'으로 볼 수 있게 따로 표시해 둔다.
           로그인이 되면 REF_KEY 는 비워지지만 이 표시는 남는다(액운 +1회 유지). */
        localStorage.setItem(INVITED_KEY, JSON.stringify({ ref: ref, at: new Date().toISOString() }));
      } catch (e) {}
    }
    /* 초대 링크의 '카카오 3초 연결'로 넘어왔을 때 — 카카오를 다녀와도 같은 탭이면 이 흐름을 기억한다
       (그냥 로그인하러 온 손님에게는 '연결 완료' 안내를 띄우지 않는다) */
    if (q.get('autologin') === '1') {
      try { sessionStorage.setItem(INVITE_FLOW_KEY, '1'); } catch (e) {}
    }
    state.refPending = pendingRef();
    state.refFrom = state.refPending ? (storedRefFrom() || from) : from;
    /* 달력(/calendar/?ref=)에서 넘어온 코드 — 주소에 ?ref= 가 없어도 이미 저장돼 있으면 이어 쓴다.
       달력이 '초대받은 손님'으로 보이게 하는 표시(INVITED_KEY)도 함께 남겨 둔다. */
    if (state.refPending) {
      var hadInvited = '';
      try { hadInvited = localStorage.getItem(INVITED_KEY) || ''; } catch (e) { hadInvited = ''; }
      if (!hadInvited) {
        try { localStorage.setItem(INVITED_KEY, JSON.stringify({ ref: state.refPending, at: new Date().toISOString() })); } catch (e) { }
      }
    }
    /* 초대받은 손님이 달력으로 넘어가도 액운 1회가 이어지게 — 링크에도 초대 코드를 실어 둔다 */
    var toCal = $('#toCalendar');
    if (toCal && state.refPending) toCal.href = '../?ref=' + encodeURIComponent(state.refPending);

    var che = q.get('chemi');
    if (che) {
      var p = decodeChemin(che);
      if (p) {
        applyDate('you', {
          calendar: 'solar', leap: false,
          y: p.y, m: p.mo, d: p.d,
          timeKnown: p.timeKnown, hh: p.hh, mm: p.mm
        });
        var lb = $('#youLabel');
        if (lb && state.refFrom) lb.textContent = state.refFrom + ' 님 사주';
        if ($('#youName') && state.refFrom && !$('#youName').value) $('#youName').value = state.refFrom;
        state.fromChemin = true;
      }
    }

    var rl = (q.get('rel') || '').toLowerCase();
    if (rl === 'love' || rl === 'friend') state.rel = rl;

    var pv = q.get('preview');
    if (pv && /^\d+$/.test(pv)) state.demo = Math.min(12, Number(pv));
  }

  /* ── 시작 ───────────────────────────────────────── */
  function boot() {
    if (!T || !M) {
      toast('계산 도구를 불러오지 못했어요. 새로고침해 주세요.');
      return;
    }
    bindPerson('me');
    bindPerson('you');
    readParams();
    if (OAUTH_BACK) {
      var lh = $('#loginHint');
      if (lh) lh.textContent = '카카오 연결을 확인하는 중이에요 — 잠시만 기다려 주세요.';
    }
    renderRelChips();
    bindRelChips();
    prefillMe();
    state.paidTier = readLocalTier();   // 달력에서 코드를 연 기기면 바로 결제자용 사다리로 (2026-11-22)

    var btn = $('#chemiBtn');
    if (btn) btn.addEventListener('click', function (e) { e.preventDefault(); runChemin(); });

    // 입력이 바뀌면 이전 결과는 숨긴다(숫자가 어긋나 보이지 않게)
    ['meName', 'youName'].forEach(function (id) {
      var el = $('#' + id);
      if (el) el.addEventListener('input', hideResult);
    });

    renderAuth(); renderLadder(); renderInvite(); renderRefBanner();
    initAuth();

    if (state.fromChemin) {
      setTimeout(function () {
        var c = $('#chemiCard');
        if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' });
        toast('친구가 보낸 케미예요 — 내 사주를 넣고 눌러 보세요.');
      }, 400);
    }
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);

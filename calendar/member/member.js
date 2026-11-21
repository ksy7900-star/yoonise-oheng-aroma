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
      : (kind === 'copula' ? ['이에요', '예요'] : ['이', '가']));
    return hasBatchim(n) ? pair[0] : pair[1];
  }

  /* ── 고정값 ─────────────────────────────────────── */
  var SB_URL = 'https://fifynkkaeqcjlovesuop.supabase.co';
  var SB_KEY = 'sb_publishable_JzSUlMOH9s38aer6y1BVEg_rHcQLGxF';   // publishable — 비밀키 아님(공개 전제)
  var MEMBER_PATH = '/yoonise-oheng-aroma/calendar/member/';
  var LIVE_BASE = 'https://ksy7900-star.github.io' + MEMBER_PATH;
  var REF_KEY = 'yoonise.member.ref.v1';
  var REF_FROM_KEY = 'yoonise.member.reffrom.v1';
  var INVITED_KEY = 'yoonise.invited.v1';   // 초대받은 손님 표시 — /calendar/ 가 5일 무료·액운 +1회를 줄 때 본다
  var GATE_KEY = 'yoonise.member.chemi.gate.v1';   // 로그인 전에 넣은 사주 — 로그인 돌아오면 이어서 계산
  var EL_ORDER = ['목', '화', '토', '금', '수'];
  var SAMHAP_EL = ['수', '목', '화', '금'];
  var EL_OVER = { 목: '토', 화: '금', 토: '수', 금: '목', 수: '화' };    // 내가 극하는 오행
  var EL_MOTHER = { 화: '목', 토: '화', 금: '토', 수: '금', 목: '수' };  // 나를 생하는 오행

  // 최종 확정된 4단 (2026-11-21 김나영 님 확정) — 날짜 단위를 겹치지 않게 나눠서
  // 1명은 기간이 아니라 '액운 태우기 + 할인 쿠폰'으로, 3명부터 기간(총 1·2·3개월)으로 올라간다.
  var LADDER = [
    { n: 1, title: '액운 태우기 3회 + 전 상품 할인 쿠폰', sub: '1년·올인원 3천원, 성찰 에디션 5천원 할인' },
    { n: 3, title: '1개월 패스 무료', sub: '한 달 전체를 바로 열어요' },
    { n: 5, title: '2개월 패스 무료', sub: '두 달 전체를 열어 드려요' },
    { n: 10, title: '3개월 패스 무료', sub: '석 달을 통째로 열어 드려요' }
  ];
  var FRIEND_GIFT = '5일 체험 + 액운 태우기 1회';
  var HASHTAGS = '#타이밍달력 #2027신년운세 #2027사주 #사주달력 #액운태우기 #윤이세사주 #2027타이밍캘린더 #새해운세';
  var HASHTAG_LIST = ['#타이밍달력', '#2027신년운세', '#2027사주', '#사주달력', '#액운태우기', '#윤이세사주', '#2027타이밍캘린더', '#새해운세'];
  var INSTA = 'life.saju_yoonise';
  var CAPTION = '@' + INSTA + '\n' + HASHTAGS;   // 인스타에 그대로 붙여넣는 한 덩어리

  var state = {
    user: null, session: null, profile: null,
    db: 'idle',            // idle | live | pending | unavailable | off
    dbMsg: '',
    invited: 0,
    demo: null,            // 미리보기로 고른 숫자 (실제 값 아님)
    refPending: '',
    refFrom: '',
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
  function myLink(withCode) {
    var code = myCode();
    if (code && withCode !== false) return LIVE_BASE + '?ref=' + encodeURIComponent(code);
    return LIVE_BASE;
  }
  function myDisplayLink() {
    return myCode() ? LIVE_BASE + '?ref=' + encodeURIComponent(myCode()) : LIVE_BASE + '?ref=내코드';
  }
  function shareLine() {
    return '2027년 사주 달력 같이 보자 🌙\n'
      + '내 링크로 들어오면 ' + FRIEND_GIFT + ' 준대.\n'
      + myLink();
  }

  /* ── 로그인 (Supabase) ──────────────────────────── */
  var sb = null;

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
        applySession(r && r.data ? r.data.session : null);
      }, function () {
        applySession(null);
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
    sb.auth.signInWithOAuth({
      provider: 'kakao',
      options: { redirectTo: location.origin === 'https://ksy7900-star.github.io' ? LIVE_BASE : (location.origin + location.pathname) }
    }).then(function (r) {
      if (r && r.error) {
        if (btn) { btn.classList.remove('is-busy'); btn.innerHTML = '<span class="btn__ic" aria-hidden="true">💬</span><span>카카오로 시작하기</span>'; }
        toast('카카오 로그인을 열지 못했어요: ' + (r.error.message || ''));
      }
    }, function (err) {
      if (btn) { btn.classList.remove('is-busy'); btn.innerHTML = '<span class="btn__ic" aria-hidden="true">💬</span><span>카카오로 시작하기</span>'; }
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

  /* ── 화면: 케미 결과 로그인 잠금 ──────────────────
     사주 입력은 그대로 두고, '2027년 케미 보기' 결과만 로그인하고 보여 준다. */
  function renderGate() {
    var box = $('#chemiResult');
    if (!box) return;
    box.innerHTML = '<p class="card__eyebrow">2027 · 케미 결과</p>'
      + '<h2 class="card__title">한 번만 로그인하면<br>바로 열려요</h2>'
      + '<div class="gate">'
      + '<span class="gate__lock">🔒 결과 직전 한 단계</span>'
      + '<p class="gate__lead">카카오로 3초 로그인하고 <b>케미 결과 + 5일 체험</b> 바로 열기</p>'
      + '<ul class="gate__list">'
      + '<li><i>1</i><span>카카오로 로그인하면 <b>초대 코드</b>가 생겨요</span></li>'
      + '<li><i>2</i><span>친구가 내 링크로 들어오면 <b>5일 체험</b>이 붙어요</span></li>'
      + '<li><i>3</i><span>다시 돌아오면 <b>넣어 둔 사주 그대로</b> 결과가 열려요</span></li>'
      + '</ul>'
      + '<button type="button" class="btn btn--navy" id="gateLoginBtn">'
      + '<span class="btn__ic" aria-hidden="true">💬</span><span>카카오로 시작하기</span></button>'
      + '<p class="gate__note">닉네임과 이메일만 받아요. 두 사람 케미 결과는 이 앱에서만 열 수 있어요.<br>로그인은 초대 코드와 사다리 보상을 위한 거예요.</p>'
      + '</div>';
    box.hidden = false;
    var b = $('#gateLoginBtn');
    if (b) b.addEventListener('click', function (e) { onLogin(e, b); });
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

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
    renderAuth(); renderLadder(); renderInvite();
    loadProfile();
    // 로그인하고 돌아왔으면 쟁여 둔 사주로 케미 결과를 바로 이어서 연다 (2026-11-21)
    setTimeout(function () { if (state.user && peekGate()) resumeGate(); }, 60);
  }

  function loadProfile() {
    if (!sb || !state.user) return;
    var uid = state.user.id;
    sb.from('profiles')
      .select('invite_code, nickname, avatar_url, tier, paid_until, burn_credits, referred_by')
      .eq('id', uid).maybeSingle()
      .then(function (r) {
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
        }
        renderAuth(); renderLadder(); renderInvite(); renderRefBanner();
        if (state.db === 'live') loadInviteCount();
        attachPendingRef();
      }, function (err) {
        state.db = 'unavailable';
        state.dbMsg = (err && err.message) || 'network';
        renderAuth(); renderLadder(); renderInvite();
      });
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
        toast('초대 코드가 내 계정에 연결됐어요.');
        loadInviteCount();
      } else if (v === 'invalid' || v === 'self') {
        clearPendingRef();
        if (v === 'self') toast('내 코드는 내가 쓸 수 없어요.');
      }
    }, function () {});
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
      $('#authTitle').textContent = '카카오로 3초면 끝나요';
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
    var nm = $('#cntNum'), nx = $('#cntNext');
    if (nm) nm.textContent = String(cnt);
    var next = null;
    for (var i = 0; i < LADDER.length; i++) if (cnt < LADDER[i].n) { next = LADDER[i]; break; }
    if (nx) {
      if (state.demo !== null) nx.innerHTML = '미리보기 숫자예요';
      else if (!state.user) nx.innerHTML = '로그인하면 내 숫자로 바뀌어요';
      else if (state.db === 'unavailable') nx.innerHTML = '실적을 다시 확인하는 중이에요';
      else if (state.db === 'pending') nx.innerHTML = '프로필이 만들어지면 채워져요';
      else if (!next) nx.innerHTML = '사다리 끝까지 왔어요';
      else nx.innerHTML = '다음 칸까지 <b>' + (next.n - cnt) + '명</b>';
    }

    var fill = $('#railFill');
    if (fill) fill.style.width = Math.min(100, (cnt / 10) * 100) + '%';

    var marks = $('#railMarks');
    if (marks && !marks.childElementCount) {
      marks.innerHTML = LADDER.map(function (r) {
        return '<span class="rail__mark" data-n="' + r.n + '" style="left:' + (r.n / 10 * 100) + '%">' + r.n + '</span>';
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
      ul.innerHTML = LADDER.map(function (r) {
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

    var pv = $('#previewRow');
    if (pv) {
      var show = !state.user || state.db === 'unavailable' || state.db === 'pending' || state.db === 'off' || state.demo !== null;
      pv.hidden = !show;
      if (show) {
        var chips = $('#previewChips');
        if (chips) {
          var vals = [null, 0, 1, 3, 5, 10];
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
      navigator.share({ title: '윤이세 2027 타이밍 캘린더', text: text }).then(function () {}, function () {
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
    if (lb && !state.refFrom) lb.textContent = relNow() === 'love' ? '그 사람 사주' : '친구 · 동료 사주';
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
  function fill(t, m) {
    return String(t == null ? '' : t).replace(/\{(\w+)\}/g, function (_, k) {
      return (m && m[k] != null) ? esc(m[k]) : '';
    });
  }

  /* ① 한 줄 훅 — 일지 관계(붙는 힘)로 갈래를 잡고, 관계마다 말투를 완전히 다르게 */
  var HOOK = {
    friend: {
      hap:    '서로 지갑 지켜주는 찐친 콤비',
      chung:  '티격태격해도 결국 다시 붙는 콤비',
      hyeong: '약속만 안 미루면 10년은 가는 콤비',
      hae:    '말은 살짝 엇갈려도 밥은 잘 먹는 사이',
      samhap: '같은 쪽을 보면 힘이 두 배 되는 콤비',
      same:   '취향이 겹쳐서 노는 게 제일 재밌는 콤비',
      plain:  '적당한 거리에서 오래 가는 편한 콤비'
    },
    love: {
      hap:    '말 안 해도 눈빛으로 통하는 찰떡궁합',
      chung:  '투닥거려도 결국 서로한테 붙는 자석 케미',
      hyeong: '서운한 건 그날 말해야 오래 가는 사이',
      hae:    '말이 살짝 어긋나도 손은 놓지 않는 사이',
      samhap: '같은 곳을 보면 마음이 빨리 가까워지는 사이',
      same:   '닮아서 편한데, 가끔 둘 다 답답한 사이',
      plain:  '설레는 속도는 천천히, 오래 가는 사이'
    }
  };

  /* 훅 아래 한 줄 — 두 사람 기운이 서로 어떻게 작용하는지를 말로만 */
  var ROLE_LINE = {
    friend: {
      youFeedMe: '{b}가 {a}를 받쳐 주는 조합이에요 — {a}가 급할 때 {b}가 브레이크를 잡아 줘요.',
      iFeedYou: '{a}가 {b}를 챙겨 주는 조합이에요 — 2027년엔 {a}가 먼저 나서면 {b}가 편해져요.',
      iBeatYou: '{a}가 앞서 나가기 쉬운 조합이에요 — {a}가 한 박자만 늦추면 {b}가 훨씬 편해져요.',
      youBeatMe: '{b}의 속도가 빠를 때 {a}가 지칠 수 있어요 — 속도만 미리 맞추면 오래 가요.',
      same: '말이 빨리 통해요 — 대신 같이 흥분하면 둘 다 세지니까 한 명은 쉬어 줘야 해요.'
    },
    love: {
      youFeedMe: '{b}가 {a}를 편안하게 해 주는 조합이에요 — 2027년엔 그 편안함이 오래 가요.',
      iFeedYou: '{a}가 {b}를 챙겨 주는 조합이에요 — 2027년엔 {a}가 먼저 표현해 주세요.',
      iBeatYou: '{a}가 앞서 나가기 쉬운 조합이에요 — {a}가 반 박자만 늦추면 훨씬 부드러워져요.',
      youBeatMe: '{b}의 속도에 {a}가 맞추다 지칠 수 있어요 — 가끔은 {a} 속도로 가도 돼요.',
      same: '닮은 기운끼리라 편한데, 같이 뜨거워지면 둘 다 타요 — 한 명이 쉬는 게 필요해요.'
    }
  };

  var EL_TRAIT = { 목: '새로 시작하는 힘', 화: '먼저 표현하는 힘', 토: '챙기고 정리하는 힘', 금: '끊고 정리하는 힘', 수: '쉬고 비우는 힘' };

  /* ② 보완할 점 — 두 번째 줄은 일지 관계에서 (막대 대신 사람 말로) */
  var COMP_ZHI = {
    friend: {
      chung:  '부딪히면 크게 흔들려요 — 큰 결정은 하루 두고 보기.',
      hyeong: '약속·서류에서 엉키기 쉬워요 — 말 대신 글로 남기기.',
      hae:    '말이 엇갈리기 쉬워요 — 중요한 얘기는 얼굴 보고 하기.',
      hap:    '붙는 힘이 좋은 대신, 같이 늘어지기 쉬워요 — 한 명은 계획을 챙기기.',
      samhap: '같은 방향을 볼 때 힘이 커져요 — 목표는 하나만 정해 두기.',
      same:   '둘 다 같은 기운이라 같이 세져요 — 한 명이 먼저 말리는 역할.',
      plain:  '부딪히진 않아요 — 대신 먼저 손 내미는 쪽이 늘 한 명이에요.'
    },
    love: {
      chung:  '부딪히면 크게 흔들려요 — 큰 얘기는 하루 두고 하기.',
      hyeong: '서운함이 쌓이기 쉬워요 — 그날그날 말해 두기.',
      hae:    '말이 자꾸 어긋나요 — 문자보다 얼굴 보고 얘기하기.',
      hap:    '붙는 힘이 좋은 대신, 서로의 시간을 뺏기 쉬워요 — 각자 시간 남겨 두기.',
      samhap: '같이 보는 게 많아요 — 각자 취미 하나는 꼭 남겨 두기.',
      same:   '닮아서 편한데 같이 늘어져요 — 한 명은 계획을 챙기기.',
      plain:  '온도 차이가 있어요 — 급한 쪽이 한 번만 기다려 주기.'
    }
  };

  /* ③ 꼭 챙겨줄 점 — 두 번째 줄은 일지 관계별 행동 팁 */
  var CARE_ZHI = {
    friend: {
      chung:  '부딪힌 날은 그날 안에 한 번 웃고 끝내기 — 미루면 커져요.',
      hyeong: '돈 얘기·약속은 카톡으로 남겨 두기.',
      hae:    '중요한 말은 얼굴 보고, 문자로는 짧게.',
      hap:    '같이 하기로 한 건 3월 전에 첫발 떼기.',
      samhap: '같은 목표 하나 정해서 같이 밀어 보기.',
      same:   '한 명이 흥분하면 다른 한 명은 10분 쉬기.',
      plain:  '방향만 먼저 맞추고, 속도는 각자.'
    },
    love: {
      chung:  '싸운 날은 그날 안에 손 잡고 끝내기.',
      hyeong: '서운한 건 그날 말하고, 다음 날로 넘기지 않기.',
      hae:    '연락은 짧아도 매일 — 말보다 안부 먼저.',
      hap:    '같이 가고 싶은 곳 하나 정해 두기.',
      samhap: '같은 목표(여행·저축) 하나 정해 두기.',
      same:   '같이 화날 땐 한 명이 먼저 나가서 10분 걷기.',
      plain:  '중요한 얘기는 속도를 맞춰서, 한 번에 하나씩.'
    }
  };

  /* ④ 부적 한 줄 — 카드에 새기는 짧은 위트 (제목·이름과 겹치지 않게) */
  var AMUL_LINE = {
    friend: {
      hap:    '지갑은 각자, 밥은 같이',
      chung:  '싸워도 밥은 같이 먹는다',
      hyeong: '약속은 문자로, 우정은 길게',
      hae:    '말보다 밥 — 그래도 통한다',
      samhap: '같은 쪽 보면 두 배로 벌어요',
      same:   '취향 일치, 텐션 조절만',
      plain:  '적당한 거리가 오래 간다'
    },
    love: {
      hap:    '말하지 않아도 통하는 사이',
      chung:  '부딪혀도 결국 너에게',
      hyeong: '서운하면 그날 말하기',
      hae:    '손은 놓지 않기로 해',
      samhap: '같은 곳을 보면 가까워진다',
      same:   '닮아서 편하고, 닮아서 조심',
      plain:  '천천히, 그러나 오래'
    }
  };

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

  function compLine(rel, lean, rich, el) {
    var trait = EL_TRAIT[el] || el;
    if (rel === 'love') {
      return '<b>' + esc(lean) + '</b>는 ' + esc(trait) + '이 약해요 — 그 부분은 <b>' + esc(rich) + '</b>가 먼저 움직여 주세요.';
    }
    return '<b>' + esc(lean) + '</b>는 ' + esc(trait) + '이 약해요 — 그건 <b>' + esc(rich) + '</b>가 맡아 주세요.';
  }

  function renderChemin(a, b) {
    var box = $('#chemiResult');
    if (!box) return;
    var rel = relNow(), R = RELS[rel];
    var aName = String(a.p.name || '').trim() || '나';
    var bName = String(b.p.name || '').trim() || R.peer;
    var info = pairInfo(a, b);
    var zk = info.zhiKey, mk = info.masterKey;
    var mm = { a: aName, b: bName };

    var hook = fill((HOOK[rel] || HOOK.friend)[zk] || (HOOK[rel] || HOOK.friend).plain, mm);
    var role = fill((ROLE_LINE[rel] || ROLE_LINE.friend)[mk] || (ROLE_LINE[rel] || ROLE_LINE.friend).same, mm);

    /* 서로 보완할 점 — 딱 2줄 */
    var comps = [];
    info.gaps.slice(0, 2).forEach(function (g) {
      var lean = g.lean === 'me' ? aName : bName;
      var rich = g.lean === 'me' ? bName : aName;
      comps.push(compLine(rel, lean, rich, g.el));
    });
    if (comps.length < 2) {
      comps.push(fill((COMP_ZHI[rel] || COMP_ZHI.friend)[zk] || (COMP_ZHI[rel] || COMP_ZHI.friend).plain, mm));
    }
    comps = comps.slice(0, 2);

    /* 2027년 꼭 챙겨줄 점 — 딱 2줄 */
    var bestMs = info.both.length ? info.both : info.near;
    var care = [];
    if (info.warnBoth.length) {
      care.push('<b>' + info.warnBoth[0] + '월</b>엔 둘 다 예민해요 — 그달엔 큰 결정 미루고 맛있는 거 먹기.');
    } else if (info.warnOne.length) {
      var wo = info.warnOne[0];
      var whoName = wo.who === 'me' ? aName : bName;
      care.push('<b>' + wo.n + '월</b>엔 ' + esc(whoName) + '가 예민해요 — 그달엔 먼저 연락하고 결정은 천천히.');
    } else if (bestMs.length) {
      care.push('<b>' + bestMs[0] + '월</b>에 같이 뭐 하나 시작해 보세요 — 올해는 조심할 달이 없어요.');
    } else {
      care.push('올해는 둘 다 크게 흔들리는 달이 없어요 — 페이스만 맞춰 가요.');
    }
    care.push(fill((CARE_ZHI[rel] || CARE_ZHI.friend)[zk] || (CARE_ZHI[rel] || CARE_ZHI.friend).plain, mm));

    /* 딱 맞는 달 · 조심할 달 — 각 한 줄 */
    var goodMs = bestMs.slice(0, 3);
    var warnMs = (info.warnBoth.length ? info.warnBoth : info.warnOne.map(function (x) { return x.n; })).slice(0, 2);
    var goodTx = goodMs.length ? goodMs.map(function (n) { return n + '월'; }).join(' · ') : '아직 없어요';
    var warnTx = warnMs.length ? warnMs.map(function (n) { return n + '월'; }).join(' · ') : '없어요';

    var cardLine = (AMUL_LINE[rel] || AMUL_LINE.friend)[zk] || (AMUL_LINE[rel] || AMUL_LINE.friend).plain;

    var html = '';
    html += '<div class="chemi__hd">'
      + '<span class="chemi__badge">' + R.emoji + ' ' + esc(R.name) + '</span>'
      + '<span class="chemi__year">2027</span>'
      + '</div>';
    html += '<p class="chemi__names">' + esc(aName) + ' <i>·</i> ' + esc(bName) + '</p>';
    html += '<h2 class="chemi__hook"><span class="chemi__yr">2027년엔</span>' + hook + '</h2>';
    html += '<p class="chemi__role">' + role + '</p>';
    html += elBars(a, b, { mini: true, legend: false });

    html += '<div class="csect">'
      + '<p class="csect__lb"><i aria-hidden="true">1</i>서로 보완할 점</p>'
      + '<ul class="csect__ul">' + comps.map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ul>'
      + '</div>';
    html += '<div class="csect">'
      + '<p class="csect__lb"><i aria-hidden="true">2</i>2027년 꼭 챙겨줄 점</p>'
      + '<ul class="csect__ul csect__ul--do">' + care.map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ul>'
      + '</div>';
    html += '<div class="cmonths">'
      + '<div class="cm cm--good"><span>' + (rel === 'love' ? '마음이 잘 통하는 달' : '둘이 딱 맞는 달') + '</span><b>' + esc(goodTx) + '</b></div>'
      + '<div class="cm cm--warn"><span>' + (rel === 'love' ? '말 조심할 달' : '슬쩍 조심할 달') + '</span><b>' + esc(warnTx) + '</b></div>'
      + '</div>';

    html += '<p class="sect-h">2027 정미년 ' + esc(R.card) + ' (' + R.hanja + ')</p>';
    html += '<h3 class="sect-t">저장해서 올리는 카드</h3>';
    html += '<div class="amulbox" id="amulBox"></div>';
    html += '<div class="btn-row">'
      + '<button type="button" class="btn btn--gold btn--wide" id="saveAmulBtn">이미지로 저장</button>'
      + '<button type="button" class="btn btn--ghost" id="againBtn">다시</button>'
      + '</div>';
    html += '<p class="story__cap">카드를 길게 눌러 저장해도 돼요. 이 카드 한 장이면 인스타 인증 사진으로 충분해요.</p>';

    html += '<div class="btn-row">'
      + '<button type="button" class="btn btn--kakao btn--wide" id="shareChemiBtn">내 2027년 케미 링크 보내기</button>'
      + '</div>';
    html += '<p class="note">보내는 링크에는 <b>내 사주 정보만</b>(생년월일·시각·성별) 담겨요. 상대방 사주는 담기지 않아요. '
      + '친구가 링크를 열고 자기 사주를 넣으면 같은 비교가 그쪽 화면에서 만들어집니다.</p>';
    html += '<div class="brandmark brandmark--card">'
      + '<span class="brandmark__ic" aria-hidden="true">🌙</span>'
      + '<span class="brandmark__t">2027 타이밍 캘린더</span>'
      + '<span class="brandmark__sep" aria-hidden="true">·</span>'
      + '<span class="brandmark__b">윤이세사주</span>'
      + '<span class="brandmark__h">(@life.saju_yoonise)</span>'
      + '</div>';

    box.innerHTML = html;
    box.hidden = false;

    /* 부적 카드는 그림(Canvas)으로 그려 <img>로 앉힌다 — 길게 눌러 저장 + 버튼 저장 둘 다 되게 */
    var cv = doc.createElement('canvas');
    cv.width = 1080; cv.height = 1920;
    drawAmul(cv, { rel: rel, a: aName, b: bName, line: cardLine, hanja: R.hanja, word: R.word });
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

    var sh = $('#shareChemiBtn');
    if (sh) sh.addEventListener('click', function () { onShareChemin(a); });

    var ag = $('#againBtn');
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
      bg1: '#3B0E1D', bg2: '#170710', bg3: '#07040E',
      glow: 'rgba(228,132,124,0.22)', glow2: 'rgba(64,86,142,0.22)',
      goldHi: '#FFF1E3', gold: '#EFC4AB', goldLow: '#A96C52',
      cream: '#F8EAE0', dim: 'rgba(248,234,224,0.62)', seal: '#A51F35',
      glyphGlow: 'rgba(255,186,158,0.34)'
    } : {
      bg1: '#0E2B33', bg2: '#081720', bg3: '#040E16',
      glow: 'rgba(48,150,124,0.24)', glow2: 'rgba(44,78,132,0.22)',
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
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.008 + rnd() * 0.020).toFixed(3) + ')';
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

    /* 4. 부적 이름 */
    ctx.font = '700 66px ' + serif;
    ctx.fillStyle = goldGrad(ctx, 0, 280, 0, 372, P);
    spacedCenter(ctx, o.word === '사랑' ? '사랑 부적' : '우정 부적', W / 2, 366, 6);

    /* 5. 큰 한자 — 금박 */
    var gx = W / 2, gy = 810;
    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.beginPath(); ctx.arc(gx, gy, 292, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(238,214,170,0.14)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.beginPath(); ctx.arc(gx, gy, 322, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(238,214,170,0.06)'; ctx.lineWidth = 0.9; ctx.stroke();
    ctx.shadowColor = P.glyphGlow; ctx.shadowBlur = 80;
    ctx.font = '700 430px ' + serif;
    ctx.fillStyle = goldGrad(ctx, 0, gy - 260, 0, gy + 240, P);
    ctx.fillText(o.hanja, gx, gy + 6);
    ctx.restore();

    /* 링 위 작은 다이아몬드 */
    ctx.save();
    ctx.fillStyle = 'rgba(238,214,170,0.55)';
    for (var d = 0; d < 4; d++) {
      var ang2 = Math.PI / 4 + d * Math.PI / 2;
      diamond(ctx, gx + Math.cos(ang2) * 292, gy + Math.sin(ang2) * 292, 7);
      ctx.fill();
    }
    ctx.restore();

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
    ctx.save();
    ctx.font = '500 30px ' + serif;
    ctx.fillStyle = 'rgba(238,214,170,0.55)';
    ctx.textAlign = 'center';
    for (var v = 0; v < 2; v++) {
      ctx.fillText('丁未'[v], 236, 1600 + v * 44);
    }
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

  function saveAmul(cv, rel, aName, bName) {
    var fname = '2027-' + (rel === 'love' ? '사랑부적' : '우정부적') + '-' + (aName || '나') + (bName ? '-' + bName : '') + '.png';
    function fail() {
      toast('저장이 막히면 카드를 길게 눌러 저장해 주세요.');
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
          toast('이미지로 저장했어요 — 사진첩에서 확인해 주세요.');
        }, 'image/png');
        return;
      }
      var url2 = cv.toDataURL('image/png');
      var a2 = doc.createElement('a');
      a2.href = url2; a2.download = fname;
      doc.body.appendChild(a2); a2.click(); doc.body.removeChild(a2);
      toast('이미지로 저장했어요 — 사진첩에서 확인해 주세요.');
    } catch (e) { fail(); }
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

  function chemiLink(ch) {
    var p = shareableOf(ch);
    var q = '?chemi=' + encodeChemin(p) + '&from=' + encodeURIComponent(p.name || '친구')
      + '&rel=' + encodeURIComponent(relNow());
    var code = myCode();
    if (code) q += '&ref=' + encodeURIComponent(code);
    return LIVE_BASE + q;
  }

  function onShareChemin(ch) {
    var url = chemiLink(ch);
    var text = '나랑 2027년 케미 보자 😊 내 사주 넣어 뒀어. 네 사주 넣으면 바로 겹쳐 볼 수 있어.\n' + url;
    if (navigator.share) {
      navigator.share({ title: '2027년 케미', text: text, url: url }).then(function () {}, function () {
        copyText(text).then(function (ok) { toast(ok ? '케미 링크를 복사했어요.' : '복사가 안 됐어요.'); });
      });
      return;
    }
    copyText(text).then(function (ok) {
      toast(ok ? '케미 링크를 복사했어요. 친구에게 붙여 넣기만 하세요.' : '복사가 안 됐어요.');
    });
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

    /* 로그인 전 — 결과 대신 로그인 안내. 넣은 사주는 세션에 남겨 돌아오면 그대로 연다. */
    if (!state.user && !force) {
      saveGate();
      renderGate();
      if (state.db === 'off') toast('로그인 연결을 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.');
      return;
    }

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
           로그인이 되면 REF_KEY 는 비워지지만 이 표시는 남는다(5일 체험 유지). */
        localStorage.setItem(INVITED_KEY, JSON.stringify({ ref: ref, at: new Date().toISOString() }));
      } catch (e) {}
    }
    state.refPending = pendingRef();
    state.refFrom = state.refPending ? (storedRefFrom() || from) : from;
    /* 초대받은 손님이 달력으로 넘어가도 5일·액운 1회가 이어지게 — 링크에도 초대 코드를 실어 둔다 */
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
    renderRelChips();
    bindRelChips();
    prefillMe();

    var btn = $('#chemiBtn');
    if (btn) btn.addEventListener('click', function (e) { e.preventDefault(); runChemin(); });

    var cap = $('#copyCapBtn');
    if (cap) cap.addEventListener('click', function () {
      copyText(CAPTION).then(function (ok) {
        toast(ok ? '인스타 문구를 복사했어요. 그대로 붙여넣으세요.' : '복사가 안 됐어요. 문구를 길게 눌러 복사해 주세요.');
      });
    });

    // 입력이 바뀌면 이전 결과는 숨긴다(숫자가 어긋나 보이지 않게)
    ['meName', 'youName'].forEach(function (id) {
      var el = $('#' + id);
      if (el) el.addEventListener('input', hideResult);
    });

    var ct = $('#capText');
    if (ct) ct.innerHTML = '<b>@' + esc(INSTA) + '</b>' +
      HASHTAG_LIST.map(function (t) { return '<i>' + esc(t) + '</i>'; }).join('');

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

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

  /* ── 고정값 ─────────────────────────────────────── */
  var SB_URL = 'https://fifynkkaeqcjlovesuop.supabase.co';
  var SB_KEY = 'sb_publishable_JzSUlMOH9s38aer6y1BVEg_rHcQLGxF';   // publishable — 비밀키 아님(공개 전제)
  var MEMBER_PATH = '/yoonise-oheng-aroma/calendar/member/';
  var LIVE_BASE = 'https://ksy7900-star.github.io' + MEMBER_PATH;
  var REF_KEY = 'yoonise.member.ref.v1';
  var REF_FROM_KEY = 'yoonise.member.reffrom.v1';
  var EL_ORDER = ['목', '화', '토', '금', '수'];
  var SAMHAP_EL = ['수', '목', '화', '금'];
  var EL_OVER = { 목: '토', 화: '금', 토: '수', 금: '목', 수: '화' };    // 내가 극하는 오행
  var EL_MOTHER = { 화: '목', 토: '화', 금: '토', 수: '금', 목: '수' };  // 나를 생하는 오행

  // 확정된 4단 (2026-11-21)
  var LADDER = [
    { n: 1, title: '모자이크 1달 더 열기', sub: '잠겨 있던 달 하나가 열려요' },
    { n: 3, title: '1개월권 + 액운 태우기 3회', sub: '한 달 전체와 액운 태우기 3회' },
    { n: 5, title: '3개월 패스 무료', sub: '석 달을 통째로' },
    { n: 10, title: '6개월 패스 무료', sub: '반년을 통째로 — 그 뒤는 결제로 이어져요' }
  ];
  var FRIEND_GIFT = '5일 체험 + 액운 태우기 1회';
  var HASHTAGS = '#윤이세사주 #2027타이밍캘린더 #사주달력';
  var INSTA = 'life.saju_yoonise';

  var state = {
    user: null, session: null, profile: null,
    db: 'idle',            // idle | live | pending | unavailable | off
    dbMsg: '',
    invited: 0,
    demo: null,            // 미리보기로 고른 숫자 (실제 값 아님)
    refPending: '',
    refFrom: '',
    me: { gender: '' }, you: { gender: '' },
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
        if (hint) hint.textContent = '로그인 연결을 불러오지 못했어요. 잠시 뒤 새로고침해 주세요. (케미 비교는 그대로 쓸 수 있어요.)';
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

  function onLogin(e) {
    if (e) e.preventDefault();
    if (!sb) { toast('로그인 연결을 불러오지 못했어요. 잠시 뒤 다시 눌러 주세요.'); return; }
    var btn = $('#loginBtn');
    if (btn) { btn.classList.add('is-busy'); btn.textContent = '카카오로 이동 중…'; }
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
      $('#authSub').textContent = '닉네임과 이메일만 받아요. 사주는 여전히 이 기기 안에서만 계산합니다.';
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

  /* ── 케미: 입력 ─────────────────────────────────── */
  function bindPerson(which) {
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
      });
    }
  }

  function readPerson(which) {
    var dateEl = $('#' + which + 'Date');
    var timeEl = $('#' + which + 'Time');
    var nameEl = $('#' + which + 'Name');
    var p = { name: (nameEl && nameEl.value || '').trim(), gender: state[which].gender, timeKnown: false, hh: 12, mm: 0 };

    var dv = (dateEl && dateEl.value) || '';
    if (!dv) return { error: 'date', msg: '생년월일을 넣어 주세요.' };
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dv);
    if (!m) return { error: 'date', msg: '생년월일을 다시 확인해 주세요.' };
    p.y = Number(m[1]); p.mo = Number(m[2]); p.d = Number(m[3]);
    if (p.y < 1900 || p.y > 2026 || p.mo < 1 || p.mo > 12 || p.d < 1 || p.d > 31) {
      return { error: 'date', msg: '생년월일을 다시 확인해 주세요.' };
    }
    var tv = (timeEl && timeEl.value) || '';
    if (tv) {
      var tm = /^(\d{2}):(\d{2})/.exec(tv);
      if (tm) { p.timeKnown = true; p.hh = Number(tm[1]); p.mm = Number(tm[2]); }
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
      name: p.name || '', gender: p.gender, calendar: 'solar',
      y: p.y, m: p.mo, d: p.d, leap: false,
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

  function lineOfMonth(m, want) {
    if (want === 'neutral') return { kind: 'plain', title: '이 달은 무난해요', why: '한쪽만 조심하면 되는 달이에요' };
    if (want === 'good' && m.good) return { kind: 'good', title: m.good.title, why: m.good.why };
    if (want === 'warn' && m.warn) return { kind: 'warn', title: m.warn.title, why: m.warn.why };
    if (m.good) return { kind: 'good', title: m.good.title, why: m.good.why };
    return { kind: 'warn', title: m.warn ? m.warn.title : '잔잔한 달', why: m.warn ? m.warn.why : '급한 결정 없이 흐름을 보기 좋아요' };
  }

  function elRelationText(aEl, bEl, aName, bName) {
    if (aEl === bEl) return { key: 'same', text: '두 사람 다 ' + aEl + ' 기운 — 말이 빨리 통하는 대신, 같이 세지면 둘 다 과열돼요.' };
    if (EL_MOTHER[aEl] === bEl) return { key: 'youFeedMe', text: bName + '의 ' + bEl + ' 기운이 ' + aName + '을 살려요(생) — 기댈 때 힘이 나는 쪽이 ' + aName + '이에요.' };
    if (EL_MOTHER[bEl] === aEl) return { key: 'iFeedYou', text: aName + '의 ' + aEl + ' 기운이 ' + bName + '을 살려요(생) — ' + aName + '이 먼저 밀어 주는 사이예요.' };
    if (EL_OVER[aEl] === bEl) return { key: 'iBeatYou', text: aName + '의 ' + aEl + '이 ' + bName + '의 ' + bEl + '을 누르는 관계(극) — ' + aName + '의 말이 세게 들릴 수 있어요.' };
    if (EL_OVER[bEl] === aEl) return { key: 'youBeatMe', text: bName + '의 ' + bEl + '이 ' + aName + '의 ' + aEl + '을 누르는 관계(극) — ' + bName + '의 속도에 ' + aName + '이 지칠 수 있어요.' };
    return { key: 'plain', text: '서로 세게 당기지도 누르지도 않는 담백한 관계예요.' };
  }

  function zhiRelationText(chA, chB, aName, bName) {
    var I = T._internal;
    var za = chA.natal.dayZhiIndex, zb = chB.natal.dayZhiIndex;
    var a = T.zhiKo(za), b = T.zhiKo(zb);
    if (za === zb) return { key: 'same', text: '일지가 같아요(' + a + ') — 생활 리듬이 비슷해 편하지만, 같이 늘어지기 쉬워요.' };
    if (I.yukhapOf(za) === zb) return { key: 'hap', text: '일지가 육합(' + a + '·' + b + ') — 붙는 힘이 있는 사이예요. 같이 시작한 일이 오래갑니다.' };
    if (I.chungOf(za) === zb) return { key: 'chung', text: '일지가 충(' + a + '·' + b + ') — 부딪히면 크게 흔들려요. 큰 결정은 하루 두고 보세요.' };
    if (I.isHyeong(za, zb)) return { key: 'hyeong', text: '일지가 형(' + a + '·' + b + ') — 서류·절차에서 엉키기 쉬워요. 약속은 글로 남기세요.' };
    if (I.haeOf(za) === zb) return { key: 'hae', text: '일지가 해(' + a + '·' + b + ') — 말이 엇갈리기 쉬워요. 중요한 이야기는 대면으로.' };
    var ga = I.samhapGroupOf(za), gb = I.samhapGroupOf(zb);
    if (ga >= 0 && ga === gb) return { key: 'samhap', text: '같은 삼합국(' + (SAMHAP_EL[ga] || '') + ') — 같은 방향을 보는 사이예요. 같이 밀면 힘이 큽니다.' };
    return { key: 'plain', text: '일지가 서로 부딪히지도 얽히지도 않는 담담한 사이예요.' };
  }

  /* 두 사람 관계에서 '지킬 한 가지' — 명리 관계별로 다르게 */
  function pairAdvice(masterKey, zhiKey) {
    var Z = {
      chung: '큰 결정은 하루 두고 보기',
      hyeong: '약속과 금전은 글로 남기기',
      hae: '중요한 이야기는 대면으로',
      hap: '같이 시작한 일은 오래갑니다',
      samhap: '같이 밀 때 힘이 커져요',
      same: '같이 늘어지지 않게 한 명은 채찍을',
      plain: '속도보다 방향을 먼저 맞추기'
    };
    var M2 = {
      same: '같이 흥분하면 둘 다 세져요 — 한 명은 쉬기',
      youFeedMe: '도움을 청하는 쪽이 유리해요',
      iFeedYou: '내가 먼저 밀어 주되 지치지 않기',
      iBeatYou: '말투를 한 단계 낮추기',
      youBeatMe: '내 속도를 먼저 챙기기'
    };
    return (Z[zhiKey] || Z.plain) + ' · ' + (M2[masterKey] || M2.same);
  }

  function complementList(chA, chB) {
    var out = [];
    EL_ORDER.forEach(function (e) {
      var ca = chA.counts[e] || 0, cb = chB.counts[e] || 0;
      if (ca <= 1 && cb >= 2) out.push({ who: 'you', el: e, mine: ca, theirs: cb });
      if (cb <= 1 && ca >= 2) out.push({ who: 'me', el: e, mine: ca, theirs: cb });
    });
    return out;
  }

  /* ── 케미: 결과 그리기 ──────────────────────────── */
  function birthText(ch) {
    var p = ch.p;
    return p.y + '.' + pad2(p.mo) + '.' + pad2(p.d) + (p.timeKnown ? ' ' + pad2(p.hh) + ':' + pad2(p.mm) : ' 시간 모름');
  }

  function elBars(chA, chB) {
    var mx = 1;
    EL_ORDER.forEach(function (e) {
      mx = Math.max(mx, chA.counts[e] || 0, chB.counts[e] || 0);
    });
    return '<div class="els">' + EL_ORDER.map(function (e) {
      var a = chA.counts[e] || 0, b = chB.counts[e] || 0;
      return '<div class="el">'
        + '<span class="el__pair">'
        + '<i class="el__bar el__bar--me" style="height:' + Math.max(4, Math.round(a / mx * 100)) + '%"></i>'
        + '<i class="el__bar el__bar--you" style="height:' + Math.max(4, Math.round(b / mx * 100)) + '%"></i>'
        + '</span>'
        + '<span class="el__lb">' + e + '</span>'
        + '</div>';
    }).join('') + '</div>';
  }

  function monthGrid(chA, chB, hotA, hotB, warnA, warnB) {
    function cells(set, warnSet, both) {
      return chA.months.map(function (m) {
        var n = m.m;
        var a = !!hotA[n], b = !!hotB[n];
        var cls = 'mc';
        if (both) cls += (a && b) ? ' is-both' : (warnA[n] && warnB[n] ? ' is-warn' : '');
        else cls += set[n] ? ' is-good' : (warnSet[n] ? ' is-warn' : '');
        return '<span class="' + cls + '">' + n + '</span>';
      }).join('');
    }
    return '<div class="mgrid">'
      + '<div class="mrow"><span class="mrow__lb is-me">나</span>' + cells(hotA, warnA, false) + '</div>'
      + '<div class="mrow"><span class="mrow__lb">너</span>' + cells(hotB, warnB, false) + '</div>'
      + '<div class="mrow"><span class="mrow__lb">겹침</span>' + cells(hotA, warnA, true) + '</div>'
      + '</div>'
      + '<div class="legend">'
      + '<span><i style="background:#DCC79A"></i>나</span>'
      + '<span><i style="background:#A9B7A4"></i>너</span>'
      + '<span><i style="background:#F3E6CB"></i>좋은 달</span>'
      + '<span><i style="background:#F7E0DA"></i>조심할 달</span>'
      + '<span><i style="background:#E9E0C6;box-shadow:inset 0 0 0 1px #8E6E3B"></i>둘 다 좋은 달</span>'
      + '</div>';
  }

  function monthCard(m, kind, who, aLine, bLine, aName, bName) {
    return '<div class="mcard mcard--' + kind + '">'
      + '<div class="mcard__hd"><span class="mcard__m">' + m + '<small>월</small></span>'
      + '<span class="mcard__who">' + esc(who) + '</span></div>'
      + '<div class="mcard__line is-me"><b>' + esc(aName) + '</b><span>' + esc(aLine.title) + ' — ' + esc(aLine.why) + '</span></div>'
      + '<div class="mcard__line"><b>' + esc(bName) + '</b><span>' + esc(bLine.title) + ' — ' + esc(bLine.why) + '</span></div>'
      + '</div>';
  }

  function renderChemin(a, b) {
    var box = $('#chemiResult');
    if (!box) return;
    var aName = a.p.name || '나';
    var bName = b.p.name || '상대';

    var hotA = hotMap(a), hotB = hotMap(b);
    var warnA = warnMap(a), warnB = warnMap(b);
    var both = [], near = [], bothWarn = [], oneWarn = [];
    a.months.forEach(function (m) {
      var n = m.m;
      if (hotA[n] && hotB[n] && !warnA[n] && !warnB[n]) both.push(n);
      if (warnA[n] && warnB[n]) bothWarn.push(n);
      else if (warnA[n] || warnB[n]) oneWarn.push(n);
    });
    both.sort(function (x, y) { return x - y; });

    if (!both.length) {
      // 겹치는 '좋은 달'이 없을 때 — 둘 다 나쁘지 않은 달로 대신(한쪽이라도 조심할 달은 빼고)
      var scored = a.months.map(function (m) {
        var n = m.m;
        var s = m.chance + b.months[n - 1].chance;
        if (warnA[n] && warnB[n]) s -= 120;
        else if (warnA[n] || warnB[n]) s -= 30;
        return { n: n, s: s };
      }).sort(function (x, y) { return y.s - x.s; });
      near = scored.slice(0, 2).map(function (x) { return x.n; }).sort(function (x, y) { return x - y; });
    }

    var comp = complementList(a, b);
    var relMaster = elRelationText(a.natal.element, b.natal.element, aName, bName);
    var relZhi = zhiRelationText(a, b, aName, bName);

    var compLines = comp.slice(0, 3).map(function (c) {
      if (c.who === 'you') {
        return '<b>' + esc(bName) + '</b>의 ' + c.el + ' 기운이 ' + c.theirs + '개, <b>' + esc(aName) + '</b>에게는 ' + c.mine + '개 — ' + esc(bName) + '이 ' + esc(aName) + '의 빈 ' + c.el + ' 기운을 채워 줘요.';
      }
      return '<b>' + esc(aName) + '</b>의 ' + c.el + ' 기운이 ' + c.mine + '개, <b>' + esc(bName) + '</b>에게는 ' + c.theirs + '개 — ' + esc(aName) + '이 ' + esc(bName) + '의 빈 ' + c.el + ' 기운을 채워 줘요.';
    });

    var html = '';
    html += '<p class="card__eyebrow">2027 · 케미 결과</p>';
    html += '<h2 class="card__title">' + esc(aName) + ' · ' + esc(bName) + ', 2027년</h2>';

    /* 두 사람 원국 요약 */
    html += '<div class="pair">'
      + '<div class="pair__c"><span class="pair__nm">' + esc(aName) + '</span>'
      + '<span class="pair__gz">' + esc(a.natal.gan) + ' ' + esc(a.natal.zhi) + '</span>'
      + '<span class="pair__el">' + esc(a.natal.element) + ' · ' + birthText(a) + '</span></div>'
      + '<div class="pair__mid">·</div>'
      + '<div class="pair__c"><span class="pair__nm">' + esc(bName) + '</span>'
      + '<span class="pair__gz">' + esc(b.natal.gan) + ' ' + esc(b.natal.zhi) + '</span>'
      + '<span class="pair__el">' + esc(b.natal.element) + ' · ' + birthText(b) + '</span></div>'
      + '</div>';
    html += elBars(a, b);

    /* 서로 채워 주는 기운 */
    html += '<p class="sect-h">오행 · 서로 채우는 것</p>';
    html += '<h3 class="sect-t">' + (comp.length ? '빈자리를 서로 채우는 사이예요' : '둘이 합치면 오행이 고르게 차요') + '</h3>';
    if (compLines.length) {
      html += '<p class="lead">' + compLines.join(' ') + '</p>';
    } else {
      html += '<p class="lead">한쪽이 크게 비어 있거나 넘치는 오행이 없어요. 대신 서로의 기운이 ' + esc(relMaster.key === 'same' ? '같은 방향' : '다른 방향') + '이라, 힘을 합칠 때 시야가 넓어집니다.</p>';
    }
    html += '<p class="lead">' + esc(relMaster.text) + '</p>';
    html += '<p class="lead">' + esc(relZhi.text) + '</p>';
    var needA = (a.need && a.need.scarce || []).join('·');
    var needB = (b.need && b.need.scarce || []).join('·');
    html += '<div class="tags">'
      + (needA ? '<span class="tag">' + esc(aName) + '에게 필요한 기운 · ' + esc(needA) + '</span>' : '')
      + (needB ? '<span class="tag tag--sage">' + esc(bName) + '에게 필요한 기운 · ' + esc(needB) + '</span>' : '')
      + '</div>';

    /* 12달 겹쳐 보기 */
    html += '<p class="sect-h">2027 · 12달 겹쳐 보기</p>';
    html += monthGrid(a, b, hotA, hotB, warnA, warnB);

    /* 같이 치고 나가는 달 */
    html += '<p class="sect-h">같이 치고 나가는 달</p>';
    if (both.length) {
      html += '<h3 class="sect-t">' + both.map(function (n) { return n + '월'; }).join(' · ') + ' — 같이 밀면 힘이 붙어요</h3>';
      html += '<div class="mcards">' + both.slice(0, 4).map(function (n) {
        var ma = a.months[n - 1], mb = b.months[n - 1];
        return monthCard(n, 'good', '둘 다', lineOfMonth(ma, 'good'), lineOfMonth(mb, 'good'), aName, bName);
      }).join('') + '</div>';
    } else {
      html += '<h3 class="sect-t">두 사람의 좋은 달이 겹치지 않아요</h3>';
      html += '<div class="empty">한쪽이 치고 나가는 달에 다른 쪽은 속도를 줄이는 게 맞아요. 아래 달은 둘 다 무리하지 않는 달이에요. '
        + '같이 하는 일은 한 사람이 앞서 끌고, 다른 사람이 받쳐 주는 식으로 나눠 보세요.</div>';
      html += '<div class="mcards">' + near.map(function (n) {
        var ma = a.months[n - 1], mb = b.months[n - 1];
        return monthCard(n, 'good', '무리 없음', lineOfMonth(ma, 'good'), lineOfMonth(mb, 'good'), aName, bName);
      }).join('') + '</div>';
    }

    /* 같이 조심할 달 */
    html += '<p class="sect-h">같이 조심할 달</p>';
    var warnAll = bothWarn.slice().sort(function (x, y) { return x - y; });
    var oneOnly = oneWarn.slice().sort(function (x, y) { return x - y; });
    if (warnAll.length) {
      html += '<h3 class="sect-t">' + warnAll.map(function (n) { return n + '월'; }).join(' · ') + ' — 둘 다 조심</h3>';
      html += '<div class="mcards">' + warnAll.slice(0, 4).map(function (n) {
        var ma = a.months[n - 1], mb = b.months[n - 1];
        return monthCard(n, 'warn', '둘 다', lineOfMonth(ma, 'warn'), lineOfMonth(mb, 'warn'), aName, bName);
      }).join('') + '</div>';
    }
    if (oneOnly.length) {
      html += '<h3 class="sect-t" style="margin-top:16px">' + oneOnly.slice(0, 4).map(function (n) { return n + '월'; }).join(' · ') + ' — 한쪽만 조심</h3>';
      html += '<div class="mcards">' + oneOnly.slice(0, 4).map(function (n) {
        var ma = a.months[n - 1], mb = b.months[n - 1];
        var who = warnA[n] && warnB[n] ? '둘 다' : (warnA[n] ? aName : bName);
        return monthCard(n, 'warn', who + ' 쪽', lineOfMonth(ma, warnA[n] ? 'warn' : 'neutral'), lineOfMonth(mb, warnB[n] ? 'warn' : 'neutral'), aName, bName);
      }).join('') + '</div>';
    }
    if (!warnAll.length && !oneOnly.length) {
      html += '<div class="empty">2027년에 크게 부딪히는 달은 없어요. 잔잔한 해입니다.</div>';
    }

    /* 스토리 카드 — 캡처해서 올리는 9:16 카드 (브랜드 마크 포함) */
    var goodMs = both.length ? both.slice(0, 3) : near;
    var goodLb = both.length ? '같이 치고 나갈 달' : '무리 없이 갈 달';
    var goodTx = goodMs.length ? goodMs.map(function (n) { return n + '월'; }).join(' · ') : '—';
    var warnMs = (warnAll.length ? warnAll : oneOnly).slice(0, 3);
    html += '<p class="sect-h">이 카드로 스토리에 올리면 돼요</p>';
    var oneLine = comp.length
      ? ((comp[0].who === 'you')
        ? bName + '의 ' + comp[0].el + ' 기운이 ' + aName + '의 빈자리를 채워요'
        : aName + '의 ' + comp[0].el + ' 기운이 ' + bName + '의 빈자리를 채워요')
      : '서로 세게 누르지 않는 사이예요';
    var advice = pairAdvice(relMaster.key, relZhi.key);
    html += '<div class="story" id="storyCard">'
      + '<div class="story__top"><span class="story__eyebrow">2027 · CHEMI</span>'
      + '<span class="story__seal">丁未</span></div>'
      + '<div class="story__pair">'
      + '<div><span class="story__nm">' + esc(aName) + '</span><span class="story__gz">' + esc(a.natal.gan) + ' ' + esc(a.natal.zhi) + '</span></div>'
      + '<span class="story__dot">·</span>'
      + '<div><span class="story__nm">' + esc(bName) + '</span><span class="story__gz">' + esc(b.natal.gan) + ' ' + esc(b.natal.zhi) + '</span></div>'
      + '</div>'
      + elBars(a, b)
      + '<div class="story__body">'
      + '<div class="story__row"><span class="story__lb">' + esc(goodLb) + '</span>'
      + '<span class="story__ms">' + esc(goodTx) + '</span></div>'
      + '<div class="story__row story__row--warn"><span class="story__lb">겹쳐서 조심할 달</span>'
      + '<span class="story__ms">' + (warnMs.length ? esc(warnMs.map(function (n) { return n + '월'; }).join(' · ')) : '없음') + '</span></div>'
      + '<p class="story__line">' + esc(oneLine) + '</p>'
      + '<div class="story__advice"><span class="story__lb">두 사람이 지킬 한 가지</span>'
      + '<span class="story__advice-t">' + esc(advice) + '</span></div>'
      + '</div>'
      + '<span class="story__wm" aria-hidden="true">丁未</span>'
      + '<div class="story__foot">2027 정미년 · 2026년 11월부터 하루씩 짚어 주는 사주 달력</div>'
      + '<div class="story__mark">'
      + '<span class="story__mark-row"><span class="story__mark-ic" aria-hidden="true">🌙</span>'
      + '<span class="story__mark-t">2027 타이밍 캘린더 · 윤이세사주</span></span>'
      + '<span class="story__mark-h">@life.saju_yoonise</span></div>'
      + '</div>';
    html += '<p class="story__cap">이 카드를 길게 눌러 저장하거나 화면을 캡처해 주세요.</p>';

    /* 보내기 */
    html += '<div class="btn-row">'
      + '<button type="button" class="btn btn--kakao btn--wide" id="shareChemiBtn">내 2027년 케미 링크 보내기</button>'
      + '<button type="button" class="btn btn--ghost" id="againBtn">다시</button>'
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

    var sh = $('#shareChemiBtn');
    if (sh) sh.addEventListener('click', function () { onShareChemin(a.p); });
    var ag = $('#againBtn');
    if (ag) ag.addEventListener('click', function () {
      box.hidden = true;
      $('#chemiCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  function chemiLink(p) {
    var q = '?chemi=' + encodeChemin(p) + '&from=' + encodeURIComponent(p.name || '친구');
    var code = myCode();
    if (code) q += '&ref=' + encodeURIComponent(code);
    return LIVE_BASE + q;
  }

  function onShareChemin(p) {
    var url = chemiLink(p);
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
  function runChemin() {
    if (state.busy) return;
    var msg = $('#chemiMsg');
    msg.hidden = true;

    var rMe = readPerson('me');
    var rYou = readPerson('you');
    if (rMe.error) { showCheminError(rMe); return; }
    if (rYou.error) { showCheminError(rYou); return; }

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
        showCheminError({ msg: '사주를 세우지 못했어요. 생년월일을 다시 확인해 주세요.' + (err && err.message ? ' (' + err.message + ')' : '') });
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
      var dEl = $('#meDate');
      if (dEl && !dEl.value) dEl.value = o.y + '-' + pad2(o.m) + '-' + pad2(o.d);
      if (o.timeKnown !== false && o.hh != null && o.mm != null) {
        var tEl = $('#meTime');
        if (tEl && !tEl.value) tEl.value = pad2(o.hh) + ':' + pad2(o.mm);
      }
      if (o.name && $('#meName') && !$('#meName').value) $('#meName').value = o.name;
      if (o.gender && !state.me.gender) {
        state.me.gender = o.gender;
        var g = $('#meGender');
        if (g) $$('.chip', g).forEach(function (c) {
          c.setAttribute('aria-pressed', String(c.getAttribute('data-gender') === o.gender));
        });
      }
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
      } catch (e) {}
    }
    state.refPending = pendingRef();
    state.refFrom = state.refPending ? (storedRefFrom() || from) : from;

    var che = q.get('chemi');
    if (che) {
      var p = decodeChemin(che);
      if (p) {
        var dEl = $('#youDate');
        if (dEl) dEl.value = p.y + '-' + pad2(p.mo) + '-' + pad2(p.d);
        var tEl = $('#youTime');
        if (tEl && p.timeKnown) tEl.value = pad2(p.hh) + ':' + pad2(p.mm);
        state.you.gender = p.gender;
        var g = $('#youGender');
        if (g) $$('.chip', g).forEach(function (c) {
          c.setAttribute('aria-pressed', String(c.getAttribute('data-gender') === p.gender));
        });
        var lb = $('#youLabel');
        if (lb && state.refFrom) lb.textContent = state.refFrom + ' 님 사주';
        if ($('#youName') && state.refFrom && !$('#youName').value) $('#youName').value = state.refFrom;
        state.fromChemin = true;
      }
    }

    var pv = q.get('preview');
    if (pv && /^\d+$/.test(pv)) state.demo = Math.min(12, Number(pv));
  }

  /* ── 시작 ───────────────────────────────────────── */
  function boot() {
    if (!T || !M) {
      toast('계산 도구를 불러오지 못했어요. 새로고침해 주세요.');
      return;
    }
    readParams();
    prefillMe();
    bindPerson('me');
    bindPerson('you');

    var btn = $('#chemiBtn');
    if (btn) btn.addEventListener('click', function (e) { e.preventDefault(); runChemin(); });

    var tags = $('#copyTagsBtn');
    if (tags) tags.addEventListener('click', function () {
      copyText(HASHTAGS).then(function (ok) {
        toast(ok ? '필수 해시태그를 복사했어요. 스토리에 붙여 넣으세요.' : '복사가 안 됐어요. 직접 입력해 주세요.');
      });
    });

    // 입력이 바뀌면 이전 결과는 숨긴다(숫자가 어긋나 보이지 않게)
    ['meDate', 'meTime', 'youDate', 'youTime', 'meName', 'youName'].forEach(function (id) {
      var el = $('#' + id);
      if (el) el.addEventListener('input', function () {
        var box = $('#chemiResult');
        if (box && !box.hidden) box.hidden = true;
      });
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

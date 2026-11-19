/*! 윤이세 내 인생 타이밍 캘린더 — 화면 로직 */
(function () {
  'use strict';

  var M = window.Manse, T = window.Timing;
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var STORE_KEY = 'yoonise.timing.v1';
  var MAIN_KEY = 'yoonise.oheng.last.v1';   // 기존 오행 앱에 저장된 사주가 있으면 그대로 이어받는다
  var RANGE_FROM = '2026-11-01';
  var RANGE_TO = '2027-12-31';   // 2027년 1~12월 1년 패스 — 달력은 2026-11 ~ 2027-12까지
  var TERMS_FROM = '2026-01-01';  // 세운(입춘) 기준을 잡기 위해 앞해 입춘부터 절기 표를 만든다
  /* ── 무료 체험 잠금 스위치 (판매 세팅은 이 두 줄만 보면 됩니다) ──────────
     FREE_TRIAL_ENABLED = false → 지금 모드. 2026-11-01 ~ 2027-12-31
        모든 날짜(과거 포함)를 누르면 잠금 카드 없이 부적 팝업·톡톡톡·스티커·처방이 바로 열립니다.
     FREE_TRIAL_ENABLED = true  → 오늘 포함 FREE_DAYS일(D+0 ~ D+(FREE_DAYS-1))만 열리고,
        그 뒤 날짜는 어두운 잠금 카드(정미년 패스 · 1:1 상담 안내)로 바뀝니다.
     → 나중에 "3일 무료 체험" 판매를 다시 켤 때는 FREE_TRIAL_ENABLED 하나만 true 로 바꾸세요.
        무료 일수를 바꾸려면 FREE_DAYS 도 함께 조정합니다. (index.html 문구도 js-trial/js-open 로 자동 전환) */
  var FREE_TRIAL_ENABLED = false;
  var FREE_DAYS = 3;   // FREE_TRIAL_ENABLED = true 일 때 무료 일수 — 오늘 포함 3일(D+0·D+1·D+2)
  var DOW_EN = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  var DOW_KO = ['일', '월', '화', '수', '목', '금', '토'];
  var KAKAO = 'https://pf.kakao.com/_hxfbCG/chat';
  /* ── 결제 설정 (아래 값만 채우면 팝업 버튼이 바로 결제로 연결됩니다) ──────────
     💳 카드결제 (페이앱) — 상품별 페이앱 결제 링크 주소.
        비워 두면('') 버튼을 누를 때 "링크 연결 준비 중" 안내와 함께 카카오톡 채널이 열리고,
        주소를 채우면 곧바로 그 페이앱 결제창으로 이동합니다.
     🏦 계좌이체 — 은행·계좌번호·예금주.
        비워 두면 카카오톡 채널에서 계좌를 안내하고,
        채우면 계좌번호 원클릭 복사 + 입금 확인 카톡 연결이 동작합니다.
     ※ 계좌번호·예금주는 실제로 확인된 값만 넣습니다. 지어내지 않습니다. */
  var PAYAPP_PASS_URL = '';       // 🎟️ 2027 1년 패스 14,900원
  var PAYAPP_ALLINONE_URL = '';   // 👑 2027 올인원 패키지 19,900원
  var PAYAPP_CARE_ONE_URL = '';   // ⚡ 긴급 개운템 낱개 2,900원
  var PAYAPP_CARE_SET_URL = '';   // ⚡ 긴급 개운템 3종 세트 5,900원
  var PAYAPP_CONSULT_URL = '';    // 🔮 윤이세 1:1 상담 49,000원~
  var BANK_NAME = 'SC제일은행';                 // 은행 이름 (통장 사본 확인)
  var BANK_ACCOUNT = '504-20-454146';          // 계좌번호 (통장 사본 확인)
  var BANK_HOLDER = '김나영 (엔와이트레이드)';   // 예금주 (통장 사본 확인)

  /* ── 2027 정미년 대표 수호 부적 · 톡톡톡 리추얼 ────── */
  var STAMP_KEY = 'yoonise.timing.stamp.v1';
  /* 달력 칸에 챱 붙는 '그날의 미니 오행 캐릭터 스티커'
     — 도장(낙관) 대신 그날의 오행 캐릭터를 작게 잘라 붙인다. chars.js 가 그림을 맡는다. */
  function stickerSVG(el) {
    if (!Chars || !Chars.sticker) return '';
    return Chars.sticker(TALIS[el] ? el : '화');
  }
  /* 오행별 기운 색·파티클 — 1타 / 2타 / 3타 완료에서 확확 바뀐다 */
  var EL_THEME = {
    목: { color: '#6FAE5B', badge: '🌱', parts: ['🍃', '🌱', '✦', '💚'], cheer: '새싹이 쑥!' },
    화: { color: '#F0714E', badge: '💖', parts: ['💗', '🔥', '⭐', '✦'], cheer: '불꽃이 활활!' },
    토: { color: '#D9A83C', badge: '🏺', parts: ['⭐', '✨', '💛', '✦'], cheer: '황금빛으로!' },
    금: { color: '#9FB0C0', badge: '💎', parts: ['💎', '✧', '⭐', '❖'], cheer: '크리스탈처럼!' },
    수: { color: '#54A8C6', badge: '💧', parts: ['💧', '🌊', '🫧', '✦'], cheer: '물결이 찰랑!' }
  };
  var Chars = window.Chars || null;
  // 날짜 배지 5개 ↔ 오행 부적 5장 (plan 확정 매칭)
  var BADGE_TO_EL = { '럭키': '목', '입단속': '수', '결정': '화', '머니': '금', '리셋': '토' };
  var EL_ORDER = ['목', '화', '토', '금', '수'];
  // 나를 생하는(인성) / 같은 편(비겁) / 내가 생하는(식상) / 내가 극하는(재성) / 나를 극하는(관성)
  var EL_MOTHER = { 목: '수', 화: '목', 토: '화', 금: '토', 수: '금' };
  var EL_BIRTH = { 목: '화', 화: '토', 토: '금', 금: '수', 수: '목' };
  var EL_OVER = { 목: '토', 화: '금', 토: '수', 금: '목', 수: '화' };
  var EL_PRESS = { 목: '금', 화: '수', 토: '목', 금: '화', 수: '토' };

  /* 오행별 멘트 4종 — 날짜(ISO) 시드로 골라 같은 부적이라도 날마다 다른 대사.
     sets[i] = { taps:[1타, 2타], done: 완료, sub: 완료 아래 한 줄 } */
  var TALIS = {
    목: {
      key: 'wood', label: '목(木)', josa: '이',
      why: '새로 시작하고 뻗어 나가는 기운 — 기회를 붙잡고 사람에게 먼저 다가가는 힘을 채워 줍니다.',
      sets: [
        { taps: ['오늘 운발 부스터 켜는 중...', '눈치 보지 말고 슬쩍 던져 볼까?'],
          done: '✨ 럭키 풀충전! 오늘은 먼저 말 꺼낸 사람이 이기는 날!',
          sub: '먼저 보낸 카톡 한 줄이 오늘의 승부수.' },
        { taps: ['인연 필터 오늘만 꺼 두는 중...', '먼저 아는 척, 그게 오늘의 기술!'],
          done: '✨ 럭키 ON! 오늘은 모르는 척보다 아는 척이 이득!',
          sub: '오늘 새로 인사한 한 명이 다음 달 기회.' },
        { taps: ['기회 문 두드리는 중, 쿵쿵...', '한 발만 더, 문 열리기 직전!'],
          done: '✨ 기회 문 열림! 오늘 안 물어본 건 다음 달에도 안 물어봐요!',
          sub: '물어보는 건 공짜, 안 물어보면 0%.' },
        { taps: ['럭키 게이지 차오르는 중...', '이 타이밍, 그냥 가면 아깝다!'],
          done: '✨ 럭키 만땅! 오늘은 고민 대신 연락 한 통!',
          sub: '망설인 3초가 기회를 놓친다.' }
      ]
    },
    화: {
      key: 'fire', label: '화(火)', josa: '가',
      why: '결정하고 표현하는 기운 — 미루지 않고 밀고 나가는 힘을 채워 줍니다.',
      sets: [
        { taps: ['복잡한 생각 다림질하는 중...', '망설이면 놓친다, 직감 쪽으로!'],
          done: '🔥 결정 불씨 ON! 오늘 정한 결정·메모 한 줄이 한 달 갑니다!',
          sub: '미룬 결정 하나 = 야근 한 스푼.' },
        { taps: ['머릿속 회의실 정리 중...', '찬성 1표, 반대 0표 — 가자!'],
          done: '🔥 결정 완료! 오늘 결정은 오늘 끝내야 내일이 가벼워요!',
          sub: '결정 버튼은 원래 생각보다 가볍다.' },
        { taps: ['고민 상자 뚜껑 닫는 중...', '완벽은 없어, 일단 정하고 다듬기!'],
          done: '🔥 불씨 활활! 오늘 하나 정했으면 오늘 목표는 달성!',
          sub: '완벽한 결정은 없고, 빠른 결정이 있다.' },
        { taps: ['선택지 세 개로 줄이는 중...', '이건 그냥 직감이 맞다!'],
          done: '🔥 결정 스위치 ON! 망설인 시간만큼 야근이 늘어난다!',
          sub: '적어 두면 결정이 두 배 빨라져요.' }
      ]
    },
    토: {
      key: 'earth', label: '토(土)', josa: '가',
      why: '중심을 잡고 버티는 기운 — 일이 흔들릴 때 내 자리를 지키는 힘을 채워 줍니다.',
      sets: [
        { taps: ['지난 기운 먼지 탈탈 털어내는 중...', '마음 책상 깔끔하게 비우는 중...'],
          done: '🌱 리셋 완료! 어제 후회는 어제에 두고 오늘부터 새 판!',
          sub: '책상 위 서류 세 장만 치워도 머리가 리셋돼요.' },
        { taps: ['휴지통 비우는 중, 싹싹...', '안 쓸 약속 하나 접는 중...'],
          done: '🌱 리셋 끝! 안 챙긴 것 하나 버리면 오늘 하루가 가벼워져요!',
          sub: '버리는 용기가 채우는 용기보다 빠르다.' },
        { taps: ['지난달 감정 정리 중...', '이번 달 기준 한 줄 적는 중...'],
          done: '🌱 새 판 준비 완료! 오늘 기준 한 줄이 이번 달 나침반!',
          sub: '기준 한 줄 = 흔들릴 때 돌아올 자리.' },
        { taps: ['머릿속 탭 12개 닫는 중...', '새로 시작할 자리 만들었어요!'],
          done: '🌱 리셋 완료! 어제의 나는 어제의 나, 오늘의 나는 신규!',
          sub: '안 끝난 일 하나만 오늘 끝내 봐요.' }
      ]
    },
    금: {
      key: 'metal', label: '금(金)', josa: '이',
      why: '벌여 둔 일을 매듭짓고 재물을 지키는 기운을 채워 줍니다.',
      sets: [
        { taps: ['장바구니 결제 누르기 전에 잠깐...', '지갑 지퍼 꽉 잡는 중...'],
          done: '💰 머니 그릇 세팅 끝! 들어올 돈은 반기고 충동결제는 로그아웃!',
          sub: '3일 묵힌 장바구니는 오늘 로그아웃.' },
        { taps: ['미수금 명단 훑는 중...', '들어올 돈 문 두드리는 중!'],
          done: '💰 머니 ON! 못 받은 돈 한 건만 챙겨도 오늘 이득!',
          sub: '받을 돈은 미루면 잊힌다.' },
        { taps: ['카드값 계산기 두드리는 중...', '이건 사도 되는 소비인가? 스캔!'],
          done: '💰 지갑 단속 완료! 오늘 안 쓴 돈도 번 돈입니다!',
          sub: '결제 3초 전, 한 번만 더 물어보기.' },
        { taps: ['구독료 명단 점검 중...', '안 쓰는 결제 하나 끊는 중...'],
          done: '💰 머니 그릇 정리 끝! 안 쓰는 구독 하나만 끊어도 월급 인상!',
          sub: '자동결제 목록이 숨은 지출 1순위.' }
      ]
    },
    수: {
      key: 'water', label: '수(水)', josa: '가',
      why: '차분히 흐르며 지켜 내는 기운 — 말과 감정을 다스리는 힘을 채워 줍니다.',
      sets: [
        { taps: ['잠깐, 지금 카톡 보내기 전에 3초만...', '손가락 멈춰! 아직 답장 타이밍 아님!'],
          done: '🛡️ 입단속 방패 ON! 오늘 할 말 반만 줄이면 내일 이불킥 0번!',
          sub: '답장은 초안에 넣어 두고 내일 아침에.' },
        { taps: ['보내기 버튼 위 손가락 대기 중...', '급한 답장은 내일의 나에게 토스!'],
          done: '🛡️ 입단속 성공! 급한 답장은 내일의 나에게 토스!',
          sub: '내일 아침의 내가 더 똑똑하다.' },
        { taps: ['눈치 레이더 켜는 중...', '웃으면서 한 발 물러서기!'],
          done: '🛡️ 눈치 100단 모드! 웃으면서 패스하면 오늘 내가 이김!',
          sub: '한 박자 쉬면 대화가 부드러워져요.' },
        { taps: ['한 마디 참는 근육 쓰는 중...', '이 말, 꼭 해야 하나? 재검토!'],
          done: '🛡️ 참은 한 마디가 내 편 1명 늘리는 날!',
          sub: '오늘 참은 말이 내일의 평판.' }
      ]
    }
  };

  // 날짜 문자열 → 고정된 정수 시드(같은 날 = 같은 멘트, 날마다 다른 멘트)
  function seedOf(iso) {
    var n = 0;
    for (var i = 0; i < iso.length; i++) n = (n * 31 + iso.charCodeAt(i)) % 1000003;
    return n;
  }
  function lotOf(el, iso) {
    var t = TALIS[el];
    if (!t) return null;
    var sets = t.sets || [];
    if (!sets.length) return { taps: ['톡', '톡톡'], done: '톡톡톡!', sub: '' };
    return sets[seedOf(iso) % sets.length];
  }

  var ritual = {};   // { iso: 두드린 횟수 } — 같은 화면 안에서만 기억

  var state = {
    gender: '', calendar: 'solar', res: null, natal: null,
    terms: null, view: null, sel: null, todayISO: '', cache: {},
    stamps: {}, justStamped: null, pendingStamp: null
  };

  /* ── 저장 ──────────────────────────────────────────── */
  function saveInput(o) {
    try {
      var copy = {};
      for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) copy[k] = o[k];
      copy.savedAt = new Date().toISOString();
      localStorage.setItem(STORE_KEY, JSON.stringify(copy));
    } catch (e) { /* 저장이 막혀도 계산은 그대로 */ }
  }
  function loadInput() {
    var keys = [STORE_KEY, MAIN_KEY];
    for (var i = 0; i < keys.length; i++) {
      try {
        var raw = localStorage.getItem(keys[i]);
        if (!raw) continue;
        var o = JSON.parse(raw);
        if (!o || !o.y || !o.m || !o.d || !o.gender) continue;
        return o;
      } catch (e) { /* 다음 후보 */ }
    }
    return null;
  }
  function clearInput() {
    try { localStorage.removeItem(STORE_KEY); } catch (e) {}
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtMD(iso) { var p = T.parseISO(iso); return p.m + '.' + p.d; }
  function fmtKoDate(iso) {
    var p = T.parseISO(iso);
    return p.y + '년 ' + p.m + '월 ' + p.d + '일';
  }

  /* ── 폼 ────────────────────────────────────────────── */
  function initForm() {
    var ySel = $('#year'), mSel = $('#month'), dSel = $('#day'), hSel = $('#hour'), miSel = $('#minute');
    var nowY = new Date().getFullYear();
    var opts = '<option value="">년</option>';
    for (var y = nowY; y >= 1940; y--) opts += '<option value="' + y + '">' + y + '년</option>';
    ySel.innerHTML = opts;

    opts = '<option value="">월</option>';
    for (var m = 1; m <= 12; m++) opts += '<option value="' + m + '">' + m + '월</option>';
    mSel.innerHTML = opts;
    fillDays();
    mSel.addEventListener('change', fillDays);

    opts = '<option value="">시</option>';
    for (var h = 0; h < 24; h++) opts += '<option value="' + h + '">' + (h < 10 ? '0' : '') + h + '시</option>';
    hSel.innerHTML = opts;

    opts = '<option value="">분</option>';
    for (var mi = 0; mi < 60; mi += 30) opts += '<option value="' + mi + '">' + (mi < 10 ? '0' : '') + mi + '분</option>';
    miSel.innerHTML = opts;

    var jisi = '';
    M.JISI.forEach(function (j) {
      var repH = Math.floor(j.rep / 60), repM = j.rep % 60;
      jisi += '<button type="button" class="jisi__btn" data-idx="' + j.idx + '" data-hour="' + repH +
        '" data-min="' + repM + '">' + j.ko +
        '<small>' + j.start + '~' + j.end + '</small></button>';
    });
    $('#jisi').innerHTML = jisi;
    $('#jisi').addEventListener('click', function (e) {
      var b = e.target.closest('.jisi__btn');
      if (!b) return;
      hSel.value = b.dataset.hour;
      miSel.value = b.dataset.min;
      syncJisi();
    });
    hSel.addEventListener('change', syncJisi);
    miSel.addEventListener('change', syncJisi);

    $('#genderChips').addEventListener('click', function (e) {
      var b = e.target.closest('.chip'); if (!b) return;
      state.gender = b.dataset.gender;
      $$('#genderChips .chip').forEach(function (c) {
        var on = c === b;
        c.classList.toggle('is-on', on);
        c.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      setGenderError(false);
      var alertEl = $('#formAlert');
      if (alertEl && !alertEl.hidden) alertEl.hidden = true;
    });

    $('#calendarSeg').addEventListener('click', function (e) {
      var b = e.target.closest('.seg'); if (!b) return;
      state.calendar = b.dataset.cal;
      $$('#calendarSeg .seg').forEach(function (c) {
        var on = c === b;
        c.classList.toggle('is-on', on);
        c.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      $('#leapRow').hidden = state.calendar !== 'lunar';
      $('#dateLabel').textContent = state.calendar === 'lunar' ? '음력 생년월일' : '생년월일';
      fillDays();
    });

    $('#timeUnknown').addEventListener('change', function () {
      var unk = this.checked;
      $('#timeBox').hidden = unk;
      $('#timeUnknownNote').hidden = !unk;
    });

    $('#region').innerHTML = M.REGIONS.map(function (r) {
      return '<option value="' + r.key + '">' + r.name + '</option>';
    }).join('');

    $('#birthForm').addEventListener('submit', onSubmit);
    $('#againBtn').addEventListener('click', openForm);
    $('#editBtn').addEventListener('click', openForm);
    $('#clearBtn').addEventListener('click', function () { clearInput(); location.reload(); });
    $('#prevMonth').addEventListener('click', function () { shiftMonth(-1); });
    $('#nextMonth').addEventListener('click', function () { shiftMonth(1); });
  }

  function fillDays() {
    var y = $('#year').value, m = $('#month').value;
    var max = 31;
    if (y && m) {
      max = new Date(Number(y), Number(m), 0).getDate();
      if (state.calendar === 'lunar') max = 30;
    }
    var cur = $('#day').value;
    var opts = '<option value="">일</option>';
    for (var d = 1; d <= max; d++) opts += '<option value="' + d + '">' + d + '일</option>';
    $('#day').innerHTML = opts;
    if (cur && Number(cur) <= max) $('#day').value = cur;
  }

  function syncJisi() {
    var h = $('#hour').value, mi = $('#minute').value;
    var on = (h !== '' && mi !== '');
    var idx = on ? M.jisiIndex(Number(h), Number(mi)) : -1;
    $$('#jisi .jisi__btn').forEach(function (b) {
      b.classList.toggle('is-on', Number(b.dataset.idx) === idx);
    });
    var hint = $('#timeHint');
    if (hint) hint.textContent = on && idx >= 0 ? M.JISI[idx].ko + '시' : '';
  }

  function setGenderError(on) {
    $('#genderError').hidden = !on;
    $('#genderField').classList.toggle('is-error', on);
  }

  function readForm() {
    var o = {
      name: $('#name').value.trim(),
      gender: state.gender,
      calendar: state.calendar,
      y: Number($('#year').value), m: Number($('#month').value), d: Number($('#day').value),
      leap: $('#leap').checked,
      timeKnown: !$('#timeUnknown').checked,
      hh: Number($('#hour').value || 0), mm: Number($('#minute').value || 0),
      region: $('#region').value,
      trueSolar: $('#trueSolar').checked,
      dst: $('#dst').checked,
      ziRule: $('#ziRule').value
    };
    var r = M.REGIONS.filter(function (x) { return x.key === o.region; })[0];
    o.longitude = r ? r.lon : 126.98;
    return o;
  }

  function onSubmit(e) {
    e.preventDefault();
    var alertEl = $('#formAlert');
    if (!state.gender) {
      setGenderError(true);
      alertEl.hidden = false;
      alertEl.textContent = '성별을 선택해야 사주를 정확히 세울 수 있어요. 여성 / 남성을 골라 주세요.';
      $('#genderField').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setGenderError(false);
    alertEl.hidden = true;

    var o = readForm();
    if (!o.timeKnown) { o.hh = 12; o.mm = 0; }
    $('#submitBtn').classList.add('is-loading');
    $('#submitBtn').textContent = '사주를 세우는 중…';

    setTimeout(function () {
      try {
        var res = M.compute(o);
        saveInput(o);
        state.res = res;
        state.natal = T.natalOf(res);
        state.cache = {};
        state.sel = null;
        state.justStamped = null;
        for (var kd in ritual) if (Object.prototype.hasOwnProperty.call(ritual, kd)) delete ritual[kd];
        var today = new Date();
        state.todayISO = T.isoOf(today.getFullYear(), today.getMonth() + 1, today.getDate());
        state.view = clampView(today.getFullYear(), today.getMonth() + 1);
        $('#formCard').hidden = true;
        $('#result').hidden = false;
        render();
        $('#result').scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (err) {
        alertEl.hidden = false;
        alertEl.textContent = err && err.message ? err.message : '입력을 다시 확인해 주세요.';
        $('#formCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
      } finally {
        $('#submitBtn').classList.remove('is-loading');
        $('#submitBtn').textContent = '내 타이밍 캘린더 열기';
      }
    }, 40);
  }

  function applyInput(o) {
    $('#name').value = o.name || '';
    state.gender = o.gender === 'M' ? 'M' : (o.gender === 'F' ? 'F' : '');
    $$('#genderChips .chip').forEach(function (c) {
      var on = c.dataset.gender === state.gender;
      c.classList.toggle('is-on', on);
      c.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    setGenderError(false);

    state.calendar = o.calendar === 'lunar' ? 'lunar' : 'solar';
    $$('#calendarSeg .seg').forEach(function (b) {
      var on = b.dataset.cal === state.calendar;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    $('#leapRow').hidden = state.calendar !== 'lunar';
    $('#dateLabel').textContent = state.calendar === 'lunar' ? '음력 생년월일' : '생년월일';
    $('#year').value = o.y;
    $('#month').value = o.m;
    fillDays();
    $('#day').value = o.d;
    $('#leap').checked = !!o.leap;

    var known = o.timeKnown !== false;
    $('#timeUnknown').checked = !known;
    $('#timeBox').hidden = !known;
    $('#timeUnknownNote').hidden = known;
    $('#hour').value = known ? o.hh : '';
    $('#minute').value = known ? o.mm : '';
    if (o.region) $('#region').value = o.region;
    $('#trueSolar').checked = !!o.trueSolar;
    $('#dst').checked = !!o.dst;
    $('#ziRule').value = o.ziRule || '23';
    syncJisi();
  }

  function openForm() {
    $('#formCard').hidden = false;
    $('#formCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ── 공통 계산 ─────────────────────────────────────── */
  function clampView(y, m) {
    var v = y * 12 + (m - 1);
    var lo = 2026 * 12 + 10, hi = 2027 * 12 + 11;
    if (v < lo) v = lo;
    if (v > hi) v = hi;
    return { y: Math.floor(v / 12), m: (v % 12) + 1 };
  }
  /** 잠금 판정 — 무료 체험을 끈 동안에는 달력 범위 전체가 열린다. */
  function inFree(iso) {
    if (!FREE_TRIAL_ENABLED) return iso >= RANGE_FROM && iso <= RANGE_TO;
    return iso >= state.todayISO && iso <= T.addDays(state.todayISO, FREE_DAYS - 1);
  }
  /** 무료 체험이 켜져 있을 때만 '지난 날'은 눌리지 않는다. */
  function isOpenDay(iso) {
    return !FREE_TRIAL_ENABLED || iso >= state.todayISO;
  }
  function infoFor(iso) {
    if (!state.natal) return null;
    if (state.cache[iso]) return state.cache[iso];
    var info = T.dayInfo(iso, state.natal, state.terms);
    state.cache[iso] = info;
    return info;
  }

  /* ── 1년 대표 수호 부적 ──────────────────────────── */
  function sigOf() {
    if (!state.res) return '';
    var i = state.res.input;
    return [i.y, i.m, i.d, i.gender, i.calendar, i.timeKnown ? 1 : 0, i.hh || 0, i.mm || 0].join('|');
  }
  function loadStamps() {
    try { state.stamps = JSON.parse(localStorage.getItem(STAMP_KEY)) || {}; } catch (e) { state.stamps = {}; }
    if (!state.stamps || typeof state.stamps !== 'object') state.stamps = {};
  }
  function stampOf(iso) {
    var bag = state.stamps[sigOf()];
    return bag && bag[iso] ? bag[iso] : null;
  }
  function saveStamp(iso, el) {
    var sig = sigOf();
    if (!sig) return;
    if (!state.stamps[sig]) state.stamps[sig] = {};
    state.stamps[sig][iso] = { el: el, at: new Date().toISOString() };
    try { localStorage.setItem(STAMP_KEY, JSON.stringify(state.stamps)); } catch (e) {}
  }

  /** 원국 글자에서 가장 적은 오행 → 1년 대표 부적.
   *  동률이면 나를 도와주는 순서(인성 → 비겁 → 식상 → 재성 → 관성)로 한 가지만 고른다. */
  function repElement() {
    var counts = (state.res && state.res.counts) || {};
    var me = state.res && state.res.dayMaster ? state.res.dayMaster.element : '토';
    var min = Infinity;
    EL_ORDER.forEach(function (e) { var c = counts[e] || 0; if (c < min) min = c; });
    if (min === Infinity) min = 0;
    var ties = EL_ORDER.filter(function (e) { return (counts[e] || 0) === min; });
    var pref = [EL_MOTHER[me], me, EL_BIRTH[me], EL_OVER[me], EL_PRESS[me]];
    var pick = ties[0];
    for (var i = 0; i < pref.length; i++) {
      if (ties.indexOf(pref[i]) >= 0) { pick = pref[i]; break; }
    }
    return { el: pick, count: min, ties: ties.length };
  }

  function renderTalisman() {
    var box = $('#talisBanner');
    if (!box) return;
    if (!state.res) { box.innerHTML = ''; return; }
    var r = repElement(), t = TALIS[r.el];
    var total = state.res.total || 8;
    var who = state.res.input.name ? state.res.input.name + ' 님' : '나';
    var why = (r.count === 0
      ? total + '글자에 ' + r.el + t.josa + ' 하나도 없어요. '
      : total + '글자 중 ' + r.el + t.josa + ' ' + r.count + '개로 가장 적어요. ') + t.why;
    var tname = Chars ? Chars.name(r.el, '', '') : t.label;
    var ticon = Chars ? Chars.icon(r.el, '') : '✨';
    box.innerHTML =
      '<span class="talis-banner__char" aria-hidden="true">' + (Chars ? Chars.svg(r.el) : '') + '</span>' +
      '<div class="talis-banner__body">' +
      '<p class="talis-banner__eyebrow">GUARDIAN TALISMAN · 2027 대표 부적</p>' +
      '<p class="talis-banner__title">' + esc(who) + '의 2027 대표 수호 부적 — <b>' + ticon + ' ' + esc(tname) + '</b></p>' +
      '<p class="talis-banner__why">' + esc(why) + '</p>' +
      '<p class="talis-banner__note">2027년 내내 이 기운이 내 사주를 받쳐 주는 부적이에요.' +
      (r.ties > 1 ? ' 가장 적은 오행이 여럿이라 나를 도와주는 기운부터 골랐어요.' : '') + '</p>' +
      '</div>';
  }

  /* ── 톡·톡·톡 리추얼 ───────────────────────────────── */
  function dayElement(info) {
    var badges = info.badges || [];
    if (badges.length && BADGE_TO_EL[badges[0].text]) return BADGE_TO_EL[badges[0].text];
    return repElement().el;   // 배지 없는 평범한 날은 1년 대표 부적으로
  }

  /** 그날 달력 칸에 붙어 있는 스티커의 오행 — 찍힌 기록이 있으면 그 오행 그대로 */
  function stampElement(info) {
    var st = stampOf(info.iso);
    if (st && st.el && TALIS[st.el]) return st.el;
    return dayElement(info);
  }

  function ritualHTML(info) {
    var st = stampOf(info.iso);
    var auto = dayElement(info);
    var el = (st && st.el && TALIS[st.el]) ? st.el : auto;
    var t = TALIS[el];
    var th = EL_THEME[el] || EL_THEME['화'];
    var lot = lotOf(el, info.iso);            // 날짜 시드로 고른 오늘의 멘트
    var done = !!st;
    var n = done ? 3 : (ritual[info.iso] || 0);
    var b0 = (info.badges || [])[0];
    var tag = b0 ? b0.text : '';
    var lead = info.iso === state.todayISO ? '오늘의 수호 부적' : '이 날의 수호 부적';
    // 무슨 부적인지 한눈에 — 날짜 로테이션으로 이름이 매일 바뀐다
    var tname = Chars ? Chars.name(el, tag, info.iso) : '수호 부적';
    var ticon = Chars ? Chars.icon(el, tag) : th.badge;
    var msg = done
      ? esc(lot.done) + '<small>' + esc(lot.sub) + '</small>'
      : (n > 0 ? lot.taps[n - 1] : '부적을 톡톡톡 세 번 두드리면 ' +
        (info.iso === state.todayISO ? '오늘' : '그날') + ' 기운이 켜져요.');
    return '<div class="ritual ritual--' + el + (done ? ' is-done' : '') + '" data-ritual-wrap="' + info.iso +
      '" data-el="' + el + '" data-stage="' + n + '">' +
      '<p class="ritual__eyebrow">' + lead + ' · ' + esc(t.label) + (tag ? ' · ' + esc(tag) : '') + '</p>' +
      '<p class="ritual__name"><span class="ritual__name-icon">' + ticon + '</span>' + esc(tname) + '</p>' +
      '<div class="ritual__stage">' +
      '<span class="ritual__aura" aria-hidden="true"></span>' +
      '<span class="ritual__ring" aria-hidden="true"></span>' +
      '<button type="button" class="ritual__tap" data-ritual="tap" aria-label="' + esc(tname) + ' — ' + esc(t.label) +
      ' 부적 두드리기 (' + n + '/3)">' +
      '<span class="ritual__char">' + (Chars ? Chars.svg(el, { stage: n }) : '') + '</span>' +
      '<span class="ritual__fx" aria-hidden="true"></span>' +
      '</button>' +
      '<span class="ritual__pop" aria-hidden="true"></span>' +
      '</div>' +
      '<p class="ritual__count">톡 · 톡 · 톡 <b>' + n + '/3</b></p>' +
      '<p class="ritual__msg" aria-live="polite">' + msg + '</p>' +
      '</div>';
  }

  /* ── 손맛: 젤리 바운스 · 파문 · 파티클 폭발 · 화면 흔들림 ────── */
  function jelly(btn, big) {
    var char = btn.querySelector('.ritual__char');
    if (!char) return;
    char.classList.remove('is-jelly', 'is-jelly--big');
    void char.offsetWidth;                       // 애니메이션 재시작
    char.classList.add(big ? 'is-jelly--big' : 'is-jelly');
    // 끝나면 클래스를 풀어 둥실둥실(idle) 애니메이션이 다시 이어지게
    setTimeout(function () { char.classList.remove('is-jelly', 'is-jelly--big'); }, big ? 740 : 620);
  }

  function ripple(btn, ev) {                     // 터치 지점에서 퍼져 나가는 파동 링
    var old = btn.querySelectorAll('.ritual__fx');
    for (var i = 0; i < old.length; i++) { if (old[i].parentNode) old[i].parentNode.removeChild(old[i]); }
    var s = document.createElement('span');
    s.className = 'ritual__fx';
    var r = btn.getBoundingClientRect();
    var x = (ev && ev.clientX) ? ev.clientX - r.left : r.width / 2;
    var y = (ev && ev.clientY) ? ev.clientY - r.top : r.height / 2;
    s.style.left = Math.max(8, Math.min(r.width - 8, x)) + 'px';
    s.style.top = Math.max(8, Math.min(r.height - 8, y)) + 'px';
    btn.appendChild(s);
    setTimeout(function () { if (s.parentNode) s.parentNode.removeChild(s); }, 860);
  }

  function burst(wrap, el, stage) {              // 오행 기운 파티클 폭발
    var st = wrap.querySelector('.ritual__stage');
    if (!st) return;
    var th = EL_THEME[el] || EL_THEME['화'];
    var big = stage >= 3;
    var count = big ? 30 : (stage === 2 ? 17 : 12);
    var box = document.createElement('span');
    box.className = 'ritual__parts';
    for (var i = 0; i < count; i++) {
      var p = document.createElement('span');
      var ang = Math.random() * Math.PI * 2;
      var dist = (big ? 76 : 44) + Math.random() * (big ? 104 : 52);
      p.className = 'ritual__p' + (big ? ' ritual__p--big' : '');
      p.textContent = th.parts[i % th.parts.length];
      p.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
      p.style.setProperty('--dy', (Math.sin(ang) * dist - 12) + 'px');
      p.style.setProperty('--rot', (Math.random() * 260 - 130) + 'deg');
      p.style.setProperty('--dur', ((big ? 1.5 : 1.3) + Math.random() * 0.8) + 's');
      p.style.setProperty('--dl', (Math.random() * 0.16) + 's');
      p.style.setProperty('--sz', (big ? 16 : 13) + Math.round(Math.random() * 8) + 'px');
      box.appendChild(p);
    }
    st.appendChild(box);
    setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 2200);
  }

  function quake(big) {                          // 모달이 덜컹 — 손맛의 절반
    if (!modalDialog) return;
    modalDialog.classList.remove('is-quake', 'is-quake--big');
    void modalDialog.offsetWidth;
    modalDialog.classList.add(big ? 'is-quake--big' : 'is-quake');
    setTimeout(function () {
      if (modalDialog) modalDialog.classList.remove('is-quake', 'is-quake--big');
    }, big ? 640 : 430);
  }

  function setStage(wrap, n) {                   // 0타 → 1타 → 2타 → 3타 표정·기운 교체
    wrap.setAttribute('data-stage', String(n));
    var ch = wrap.querySelector('.ch');
    if (ch) ch.setAttribute('data-stage', String(n));
    if (n >= 3) wrap.classList.add('is-done');
  }

  function onRitualTap(btn, ev) {
    var wrap = btn.closest('[data-ritual-wrap]');
    if (!wrap) return;
    var iso = wrap.getAttribute('data-ritual-wrap');
    var el = wrap.getAttribute('data-el');
    var t = TALIS[el];
    if (!t) return;
    var lot = lotOf(el, iso);
    var n = stampOf(iso) ? 3 : (ritual[iso] || 0);
    if (n >= 3) { jelly(btn, false); sfxTap(1); return; }   // 이미 찍힌 날 — 살짝 튀기기만
    n += 1;
    ritual[iso] = n;

    setStage(wrap, n);
    jelly(btn, n >= 3);
    ripple(btn, ev);
    burst(wrap, el, n);
    quake(n >= 3);
    if (n >= 3) sfxDone(); else sfxTap(n);

    var countEl = wrap.querySelector('.ritual__count b');
    if (countEl) countEl.textContent = n + '/3';
    btn.setAttribute('aria-label', esc(t.label) + ' 부적 두드리기 (' + n + '/3)');

    var msgEl = wrap.querySelector('.ritual__msg');
    if (n >= 3) {
      saveStamp(iso, el);
      if (msgEl) msgEl.innerHTML = esc(lot.done) + '<small>' + esc(lot.sub) + '</small>';
      if (modalEl && !modalEl.hidden) {
        // 팝업이 닫히는 순간 달력 칸에 그날의 부적 스티커가 챱 붙도록 미뤄 둔다
        state.pendingStamp = iso;
        var note = modalBody && modalBody.querySelector('.modal__stamp-note');
        if (note) note.hidden = false;
      } else {
        state.justStamped = iso;
        renderCalendar();                     // 달력 칸에 부적 스티커가 챱
      }
    } else if (msgEl) {
      msgEl.textContent = lot.taps[n - 1] || ('한 번 더 — ' + (3 - n) + '번 남았어요.');
    }
  }

  /* ── 렌더 ──────────────────────────────────────────── */
  function render() {
    renderSavedBar();
    renderNatal();
    renderTalisman();
    renderCalendar();
  }

  function renderSavedBar() {
    var r = state.res;
    var nm = (r.input.name ? r.input.name + ' 님' : '내 사주');
    $('#savedBarName').textContent = nm;
    var lunar = r.lunar ? '음력 ' + (r.lunar.leap ? '윤' : '') + r.lunar.m + '.' + r.lunar.d : '';
    $('#savedBarMeta').textContent = '양력 ' + r.solar.y + '.' + r.solar.m + '.' + r.solar.d +
      (r.input.timeKnown ? ' ' + (r.input.hh < 10 ? '0' : '') + r.input.hh + ':' + (r.input.mm < 10 ? '0' : '') + r.input.mm : ' · 시간 모름') +
      ' · ' + (r.input.gender === 'M' ? '남성' : '여성') + (lunar ? ' · ' + lunar : '');
  }

  function renderNatal() {
    var p = state.res.pillars, t = state.res.tenGod;
    var cols = [
      { key: 'time', pos: '시주', me: false },
      { key: 'day', pos: '일주', me: true },
      { key: 'month', pos: '월주', me: false },
      { key: 'year', pos: '년주', me: false }
    ];

    // 정통 만세력식 4칸 표: [시주 | 일주 | 월주 | 년주]
    //  위 → 아래: 천간 십신 / 천간 타일 / 지지 타일 / 지지 십신
    var row = { pos: [], ganTen: [], gan: [], zhi: [], zhiTen: [] };
    cols.forEach(function (c) {
      var me = c.me ? ' is-me' : '';
      row.pos.push('<span class="natal__pos' + me + '">' + c.pos + '</span>');

      var pil = p[c.key];
      if (!pil) {
        row.ganTen.push('<span class="natal__ten' + me + '">—</span>');
        row.gan.push('<span class="natal__tile natal__tile--none' + me + '">—</span>');
        row.zhi.push('<span class="natal__tile natal__tile--none' + me + '">—</span>');
        row.zhiTen.push('<span class="natal__ten natal__ten--zhi natal__ten--mute' + me + '">시간 모름</span>');
        return;
      }

      var tg = t[c.key] || {};
      row.ganTen.push('<span class="natal__ten natal__ten--gan' + me + '">' +
        (c.me ? '일간<small>나</small>' : esc(tg.gan || '—')) + '</span>');
      row.gan.push('<span class="natal__tile natal__tile--' + esc(M.GAN_EL[pil.ganIndex]) + me + '">' + esc(pil.gan) + '</span>');
      row.zhi.push('<span class="natal__tile natal__tile--' + esc(M.ZHI_EL[pil.zhiIndex]) + me + '">' + esc(pil.zhi) + '</span>');
      row.zhiTen.push('<span class="natal__ten natal__ten--zhi' + me + '">' + esc(tg.zhi || '—') + '</span>');
    });

    $('#natal').innerHTML = row.pos.concat(row.ganTen, row.gan, row.zhi, row.zhiTen).join('');

    var jq = state.res.jieqi;
    $('#natalMeta').textContent = state.res.input.gender === 'M' ? '남성' : '여성';
    $('#natalNote').innerHTML = '연주는 입춘 ' + esc(jq.lichun) + ' 기준, 월주는 ' + esc(jq.prev.name) + ' 절입 ' + esc(jq.prev.at) + ' 이후로 계산했어요.' +
      (state.res.input.timeKnown ? ' 글자 사이의 관계는 각 글자의 대표 기운으로 봤어요.' : ' 시간을 몰라 시주는 비워 두었습니다.');
  }

  function renderCalendar() {
    var v = state.view;
    $('#calYear').textContent = v.y;
    $('#calTitle').textContent = v.m + '월';

    var first = new Date(Date.UTC(v.y, v.m - 1, 1)).getUTCDay();
    var dim = T.daysInMonth(v.y, v.m);
    if (T.isoOf(v.y, v.m, dim) > RANGE_TO) dim = T.parseISO(RANGE_TO).d;   // 마지막 달은 정미년 끝까지만
    var html = '';
    for (var i = 0; i < first; i++) html += '<span aria-hidden="true"></span>';

    var stat = { red: 0, gold: 0, blue: 0, gray: 0 };
    for (var d = 1; d <= dim; d++) {
      var iso = T.isoOf(v.y, v.m, d);
      var info = infoFor(iso);
      if (!info) continue;
      var badges = info.badges || [];
      var cls = ['day'];
      if (info.dow === 0) cls.push('day--sun');
      if (info.dow === 6) cls.push('day--sat');
      if (iso < state.todayISO) cls.push('day--past');
      else if (FREE_TRIAL_ENABLED && inFree(iso)) cls.push('day--free');
      if (iso === state.todayISO) cls.push('is-today');
      if (iso === state.sel) cls.push('is-sel');

      // 셀 배경 틴트는 입단속·럭키에만 — 결정·머니·리셋은 배지로만 표시해 색을 아낀다
      var lead = badges.length ? badges[0].cat : '';
      if (lead === 'red' || lead === 'gold') cls.push('day--t-' + lead);

      badges.forEach(function (b) { if (stat[b.cat] != null) stat[b.cat]++; });

      var badgeHtml = badges.map(function (b) {
        return '<span class="badge badge--' + b.cat + ' day__badge">' + esc(b.text) + '</span>';
      }).join('');

      var open = isOpenDay(iso);
      // 평범한 날(배지 없음)은 눌러도 팝업이 없다 — 잠긴 날은 여는 방법을 알려 주려고 계속 연다
      var pastDay = iso < state.todayISO;
      var clickable = badges.length ? true : (!open && !pastDay);
      var label = v.m + '월 ' + d + '일 ' + DOW_KO[info.dow] + '요일, ' + info.headline;
      if (iso < state.todayISO && !open) label = v.m + '월 ' + d + '일, 지난 날';
      var stamp = stampOf(iso);
      if (stamp && !badges.length) stamp = null;   // 부적은 기운이 서는 날에만 남는다
      if (stamp) {
        cls.push('day--stamped');
        if (iso >= state.todayISO) label += ', 부적 스티커 붙음';
      }
      var stampEl = stamp ? stampElement(info) : '';

      var cellInner = '<span class="day__top">' +
        '<span class="day__num">' + d + '</span>' +
        (stamp
          ? '<span class="day__sticker' + (state.justStamped === iso ? ' is-new' : '') + '" aria-hidden="true">' +
            stickerSVG(stampEl) + '</span>'
          : '') +
        '</span>' +
        '<span class="day__badges">' + badgeHtml + '</span>';

      if (clickable) {
        html += '<button type="button" class="' + cls.join(' ') + '" data-iso="' + iso + '"' +
          (iso === state.sel ? ' aria-current="date"' : '') +
          (open ? '' : ' tabindex="-1"') +
          ' aria-label="' + esc(label) + '">' + cellInner + '</button>';
      } else {
        // 날짜만 보이는 정적인 칸 — 키보드 포커스도 받지 않는다
        cls.push('day--static');
        var plainLabel = v.m + '월 ' + d + '일 ' + DOW_KO[info.dow] + '요일';
        html += '<div class="' + cls.join(' ') + '" data-iso="' + iso + '">' +
          '<span class="sr-only">' + esc(plainLabel) + '</span>' + cellInner + '</div>';
      }
    }
    $('#calGrid').innerHTML = html;
    state.justStamped = null;

    var bits = [];
    if (stat.gold) bits.push('럭키 ' + stat.gold);
    if (stat.red) bits.push('입단속 ' + stat.red);
    if (stat.blue) bits.push('결정·머니 ' + stat.blue);
    if (stat.gray) bits.push('리셋 ' + stat.gray);
    $('#calSummary').textContent = bits.length ? bits.join('  ·  ') : '이 달은 표시할 신호가 적은 달이에요';

    $('#prevMonth').disabled = (v.y === 2026 && v.m === 11);
    $('#nextMonth').disabled = (v.y === 2027 && v.m === 12);

    renderSaeun(v, dim);

    var freeEnd = T.parseISO(T.addDays(state.todayISO, FREE_DAYS - 1));
    var noteText = FREE_TRIAL_ENABLED
      ? freeEnd.m + '월 ' + freeEnd.d + '일까지는 배지가 붙은 날을 눌러 부적을 받아 스티커로 붙일 수 있어요. 그 뒤 날짜는 표시만 보이고, 누르면 여는 방법이 나옵니다.'
      : '지금은 2026년 11월부터 2027년 12월까지 모든 날짜가 보여요. 기운이 서는 날(색 배지가 붙은 날)을 눌러 부적을 톡톡톡 세 번 두드리면, 달력 칸에 그날의 캐릭터 부적 스티커가 챱 붙어요.';
    $('#calNote').textContent = noteText;
  }

  /* ── 세운 줄: 입춘에서 해가 바뀐다 ─────────────────── */
  function renderSaeun(v, dim) {
    var el = $('#calSaeun');
    if (!el) return;
    var s1 = T.saeunOf(T.isoOf(v.y, v.m, 1), state.terms);
    var s2 = T.saeunOf(T.isoOf(v.y, v.m, dim), state.terms);
    if (!s1 || !s2) { el.textContent = ''; el.classList.remove('is-shift'); return; }

    if (s1.year !== s2.year) {
      // 이 달 안에서 입춘을 지나 해가 바뀐다
      var lc = null;
      state.terms.list.forEach(function (t) {
        if (t.ko === '입춘' && t.iso.slice(0, 7) === T.isoOf(v.y, v.m, 1).slice(0, 7)) lc = t;
      });
      var md = lc ? (T.parseISO(lc.iso).m + '.' + T.parseISO(lc.iso).d) : '';
      el.innerHTML = '<b>' + esc(s1.label) + '</b> → <b>' + esc(s2.label) + '</b>' +
        (md ? ' · ' + md + ' 입춘 시작' : '');
      el.classList.add('is-shift');
      return;
    }

    el.classList.remove('is-shift');
    if (T.isoOf(v.y, v.m, dim) === RANGE_TO) {
      el.innerHTML = '<b>' + esc(s1.label) + '</b> · 12.31까지 (2027 1년 패스 끝)'; 
    } else if (s1.year < 2027) {
      el.innerHTML = '<b>' + esc(s1.label) + '</b> · 입춘 전 (참고)';
    } else {
      el.innerHTML = '<b>' + esc(s1.label) + '</b>';
    }
  }

  function shiftMonth(dir) {
    var v = clampView(state.view.y, state.view.m + dir);
    if (v.y === state.view.y && v.m === state.view.m) return;
    state.view = v;
    state.sel = null;
    renderCalendar();
  }

  /* ── 날짜 팝업 모달 ───────────────────────────────── */
  var modalEl = null, modalBody = null, modalDialog = null;
  var lastFocus = null, modalClosing = false;

  function openDayModal(iso) {
    var info = infoFor(iso);
    if (!info || !modalEl) return;
    // 기운 태그(럭키·입단속·결정·머니·리셋)가 하나도 없는 평범한 날은 팝업을 열지 않는다
    if (!info.badges || !info.badges.length) return;
    var lock = FREE_TRIAL_ENABLED && !inFree(iso);
    lastFocus = document.activeElement;
    state.sel = iso;
    renderCalendar();                       // 날짜 칸 선택 표시
    modalBody.innerHTML = lock ? lockModalHTML(info) : briefModalHTML(info);
    modalDialog.classList.toggle('modal__dialog--lock', lock);
    modalEl.hidden = false;
    document.body.classList.add('is-modal-open');
    modalBody.scrollTop = 0;
    sfxOpen();                              // 뿅 — 사용자 클릭 안에서 재생
    try { modalDialog.focus({ preventScroll: true }); } catch (e) { modalDialog.focus(); }
  }

  function closeDayModal() {
    if (!modalEl || modalEl.hidden || modalClosing) return;
    modalClosing = true;
    modalEl.classList.add('is-closing');
    var backIso = state.sel;
    setTimeout(function () {
      modalEl.classList.remove('is-closing');
      modalEl.hidden = true;
      document.body.classList.remove('is-modal-open');
      modalBody.innerHTML = '';
      modalClosing = false;
      if (state.pendingStamp) {
        // 팝업이 사라진 자리에서 달력 칸에 그날의 부적 스티커가 챱
        state.justStamped = state.pendingStamp;
        state.pendingStamp = null;
        renderCalendar();
      }
      var back = backIso ? $('#calGrid .day[data-iso="' + backIso + '"]') : null;
      var target = back || lastFocus;
      if (target && target.focus) { try { target.focus({ preventScroll: true }); } catch (e) {} }
      lastFocus = null;
    }, 180);
  }

  function modalHead(info) {
    var today = info.iso === state.todayISO;
    return '<p class="modal__eyebrow">' + (today ? 'TODAY · 데일리 브리핑' : 'DAILY BRIEFING · 데일리 브리핑') + '</p>' +
      '<p class="modal__date" id="modalTitle">' + fmtMD(info.iso) +
      '<span>' + DOW_KO[info.dow] + '요일 · ' + esc(info.gz.textKo) + '일</span></p>' +
      '<p class="modal__sub">' + esc(fmtKoDate(info.iso)) + ' · 음력 ' + esc(info.lunarText) + '</p>';
  }

  function briefModalHTML(info) {
    var today = info.iso === state.todayISO;
    // 부적 팝업은 캐릭터·이름표·톡톡톡·대사·스티커 완료 안내·닫기만 남긴다.
    // (예전 맨 아래 '+ 이 날의 사주 풀이 보기' 접이식 풀이는 뺐다 — 2026-11-20)
    return modalHead(info) +
      '<p class="modal__headline">' + esc(info.headline) + '</p>' +
      ritualHTML(info) +
      '<p class="modal__stamp-note"' + (stampOf(info.iso) ? '' : ' hidden') + '>' +
      '<span class="sticker-mini" aria-hidden="true">' + stickerSVG(stampElement(info)) + '</span>' +
      '✨ 달력에 ' + (today ? '오늘의' : '이 날의') + ' 부적 스티커를 챱 붙였어요!</p>' +
      '<button type="button" class="btn btn--ghost modal__done-btn" data-modal-close>닫고 달력 보기</button>';
  }

  function lockModalHTML(info) {
    var marks = info.marks.filter(function (m) { return !m.minor && m.cat !== 'gray'; }).slice(0, 2);
    var markHtml = marks.map(function (m) {
      return '<span class="mark"><span class="mark__dot dot dot--' + m.cat + '"></span>' + esc(m.label) + '</span>';
    }).join('');
    var fe = T.parseISO(T.addDays(state.todayISO, FREE_DAYS - 1));
    return '<p class="modal__eyebrow">FREE TRIAL · 3 DAYS</p>' +
      '<p class="modal__date" id="modalTitle">' + fmtMD(info.iso) +
      '<span>' + DOW_KO[info.dow] + '요일 · ' + esc(info.gz.textKo) + '일' +
      (info.saeun ? ' · ' + esc(info.saeun.label) : '') + '</span></p>' +
      (info.term ? '<p class="lock__term">' + esc(info.term.ko) + ' ' + esc(info.term.time) +
        (info.term.isJie ? ' · ' + esc(info.term.monthText) + '월 시작' : '') + '</p>' : '') +
      '<p class="lock__title">🔒 3일 무료 체험 이후<br>2027년 1~12월 전체 열기</p>' +
      '<p class="lock__sub">2027 1년 패스 / 올인원 패키지 / 긴급 개운템</p>' +
      '<p class="lock__early">사전 신청 시 12월 한 달 무료!</p>' +
      (markHtml ? '<div class="lock__marks">' + markHtml + '</div>' : '') +
      '<p class="lock__hint">이 날의 이야기는 무료 구간(' + fe.m + '월 ' + fe.d + '일까지) 밖이에요. ' +
      '지금 사전 신청하면 2026년 12월 한 달을 먼저 열어 드리고, 2027년 1~12월 365일을 이어서 볼 수 있어요.</p>' +
      '<div class="lock__actions">' +
      '<button type="button" class="btn btn--ghost-light shop-btn" data-shop="pass">' +
      '<span class="shop-btn__no">1</span><span class="shop-btn__label">🎟️ 2027 1년 패스 · 14,900원</span></button>' +
      '<button type="button" class="btn btn--cream shop-btn" data-shop="allinone">' +
      '<span class="shop-btn__no">2</span><span class="shop-btn__label">👑 2027 올인원 패키지 · 19,900원</span></button>' +
      '<button type="button" class="btn btn--ghost-light shop-btn" data-shop="care">' +
      '<span class="shop-btn__no">3</span><span class="shop-btn__label">⚡ 긴급 개운템 · 낱개 2,900원</span></button>' +
      '</div>' +
      '<button type="button" class="btn modal__done-btn modal__done-btn--dark" data-modal-close>닫고 달력 보기</button>';
  }

  /* ── 앱 안 구입 팝업 (1년 패스 · 올인원 패키지 · 긴급 개운템) ──────
     버튼을 누르면 리틀리로 튕기지 않고 이 팝업이 열립니다.
     실제 결제 링크가 생기면 위쪽 PASS/ALLINONE/CARE_CHECKOUT_URL 만 바꾸면 됩니다.
     문구 원칙 — 사주를 모르는 고객이 한 번에 알아듣는 말로만 씁니다.
     ('원국', '24절기 월운' 같은 용어는 쓰지 않습니다.)
     100% 디지털 상품입니다. 실물 다이어리·배송은 넣지 않습니다. */
  var PASS_PRICE = '14,900원';
  var ALLINONE_PRICE = '19,900원';
  var CARE_PRICE = '낱개 2,900원 · 3종 세트 5,900원';
  var CONSULT_PRICE = '49,000원~';

  var shopEl = null, shopBody = null, shopDialog = null, shopLastFocus = null, shopClosing = false;

  function priceHTML(label, price) {
    return '<div class="shop__price"><span>' + esc(label) + '</span>' +
      '<b>' + esc(price) + '</b></div>';
  }

  /* ── 결제 두 버튼 — 💳 카드결제 (페이앱) · 🏦 계좌이체 ────────────────────
     item: 'pass' | 'allinone' | 'care-one' | 'care-set' | 'consult'
     위쪽 '결제 설정' 값이 비어 있으면 카카오톡 채널로 안내하고,
     값이 채워지면 그 자리에서 페이앱 결제창 이동 / 계좌번호 복사가 동작합니다. */
  function cardUrlOf(item) {
    var map = {
      'pass': PAYAPP_PASS_URL,
      'allinone': PAYAPP_ALLINONE_URL,
      'care-one': PAYAPP_CARE_ONE_URL,
      'care-set': PAYAPP_CARE_SET_URL,
      'consult': PAYAPP_CONSULT_URL
    };
    var url = map[item];
    return url && String(url).trim() ? String(url).trim() : '';
  }
  function bankReady() {
    return !!(String(BANK_NAME).trim() && String(BANK_ACCOUNT).trim());
  }
  function bankText() {
    return [BANK_NAME, BANK_ACCOUNT, BANK_HOLDER]
      .map(function (v) { return String(v || '').trim(); })
      .filter(function (v) { return !!v; }).join(' ');
  }

  function payActionsHTML(item) {
    var card = !!cardUrlOf(item);
    var bank = bankReady();
    return '<div class="pay" role="group" aria-label="결제 방법">' +
      '<button type="button" class="pay__btn pay__btn--card" data-pay="card" data-item="' + esc(item) + '">' +
      '<span class="pay__ico" aria-hidden="true">💳</span>' +
      '<span class="pay__label"><b>카드결제 (페이앱)</b>' +
      '<span>' + (card ? '카드·간편결제로 바로 결제' : '카카오톡으로 결제 링크 받기') + '</span></span>' +
      '</button>' +
      '<button type="button" class="pay__btn pay__btn--bank" data-pay="bank" data-item="' + esc(item) + '">' +
      '<span class="pay__ico" aria-hidden="true">🏦</span>' +
      '<span class="pay__label"><b>계좌이체</b>' +
      '<span>' + (bank ? esc(String(BANK_NAME).trim()) + ' · 계좌번호 복사' : '카카오톡으로 입금 계좌 안내') + '</span></span>' +
      '</button>' +
      '</div>' +
      '<p class="pay__note" data-pay-note role="status" aria-live="polite" hidden></p>';
  }

  function payNote(html) {
    var n = shopBody ? shopBody.querySelector('[data-pay-note]') : null;
    if (!n) return null;
    n.innerHTML = html;
    n.hidden = false;
    return n;
  }

  function openKakao() {
    try { window.open(KAKAO, '_blank', 'noopener'); } catch (e) { }
  }

  function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)['catch'](function () { });
        return true;
      }
    } catch (e) { }
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }

  function handlePay(kind, item) {
    if (kind === 'kakao') { openKakao(); return; }
    if (kind === 'card') {
      var url = cardUrlOf(item);
      if (url) {
        payNote('페이앱 결제창을 새 창에서 열었어요. 결제를 마치고 돌아오시면 됩니다.');
        try { window.open(url, '_blank', 'noopener'); } catch (e) { window.location.href = url; }
      } else {
        payNote('페이앱 카드결제 링크 연결 준비 중 — 카카오톡으로 결제 링크를 바로 보내드려요.');
        openKakao();
      }
      return;
    }
    if (bankReady()) {
      var text = bankText();
      var copied = copyText(text);
      payNote((copied ? '계좌번호를 복사했어요' : '아래 계좌로 입금해 주세요') +
        ' · <b>' + esc(text) + '</b><br>은행 앱에 붙여넣어 이체하신 뒤, 입금 확인을 보내 주세요.' +
        '<button type="button" class="pay__kakao" data-pay="kakao">입금 확인 카톡 보내기 →</button>');
      vibrate(18);
      sfxTap(2);
      return;
    }
    payNote('입금 계좌는 카카오톡 채널에서 바로 안내해 드려요.');
    openKakao();
  }

  /* 1번 — 2027 1년 패스 (14,900원) */
  function passShopHTML() {
    return '<p class="modal__eyebrow">2027 PASS · 앱 전용 · 사전 신청 시 12월 한 달 무료</p>' +
      '<h2 class="shop__title" id="shopTitle">🎟️ 2027 1년 패스</h2>' +
      '<p class="shop__sub">생년월일만 넣으면 <b>2027년 1월 1일부터 12월 31일까지 365일</b>이 내 달력으로 펼쳐져요. 좋은 날·조심할 날을 미리 보고, 그날의 부적 스티커를 달력에 챱챱 붙이는 앱이에요.</p>' +
      '<ul class="shop__list">' +
      '<li><b>2027년 1~12월 1년 운기 흐름</b><span>1월 1일부터 12월 31일까지, 하루씩 전부</span></li>' +
      '<li><b>사전 신청 시 12월 한 달 서비스</b><span>2026년 12월 달력을 먼저 열어 드려요</span></li>' +
      '<li><b>내 기본 부적 1개</b><span>2027년 내내 나를 받쳐 주는 기본 부적</span></li>' +
      '</ul>' +
      priceHTML('2027 1년 패스', PASS_PRICE) +
      payActionsHTML('pass') +
      '<p class="shop__note">결제가 끝나면 카카오톡 채널로 알려 주세요 — 신청 확인하고 바로 열어 드려요.</p>';
  }

  /* 2번 — 2027 올인원 패키지 (19,900원 · 추천) */
  function allinoneShopHTML() {
    return '<p class="modal__eyebrow">2027 ALL-IN-ONE · 가장 많이 고르는 구성</p>' +
      '<h2 class="shop__title" id="shopTitle">👑 2027 올인원 패키지</h2>' +
      '<p class="shop__sub">1년 패스에 <b>2027년 내 년수호 부적</b>과 <b>매일 일진 부적</b>까지 다 열리는 구성이에요. 14,900원에 <b>5,000원만</b> 보태면 여기까지 와요.</p>' +
      '<ul class="shop__list">' +
      '<li><b>1년 패스 전부</b><span>2027년 1~12월 365일 + 사전 신청 시 12월 한 달 서비스</span></li>' +
      '<li><b>2027년 내 년수호 부적</b><span>2027년 한 해 나를 지켜 주는 수호 부적</span></li>' +
      '<li><b>매일 일진 부적 — 전부</b><span>기운 서는 날마다 튀어나오는 캐릭터 부적 스티커를 하나도 빼놓지 않고</span></li>' +
      '</ul>' +
      '<div class="shop__save"><b>14,900원 + 5,000원 = 19,900원</b><span>년수호 부적 + 매일 일진 부적까지 한 번에</span></div>' +
      priceHTML('2027 올인원 패키지', ALLINONE_PRICE) +
      payActionsHTML('allinone') +
      '<p class="shop__note">결제가 끝나면 카카오톡 채널로 알려 주세요 — 신청 확인하고 바로 열어 드려요.</p>';
  }

  /* ── 3번 — 긴급 개운템 3종 (앱 안에서 그대로 체험) ────────────────
     부적이 아니라 '행동·오브제·소리'로 막힌 날을 뚫는 디지털 아이템.
     팝업 안에서 3종을 모두 체험할 수 있게 실제로 동작한다. */
  var CARE = {
    목: {
      obj: 'sprout', name: '새싹 화분', josa: '을',
      missions: [
        { tag: '색', text: '초록·연두 중 하나를 오늘 몸에 걸쳐 보세요.' },
        { tag: '음식', text: '신맛 한 입 — 레몬물이나 식초 한 방울이면 충분해요.' },
        { tag: '동선', text: '집 앞 나무가 있는 길로 한 바퀴 돌아오세요.' },
        { tag: '말', text: '미뤄 둔 연락 하나, 오늘 먼저 보내 보세요.' },
        { tag: '손', text: '창문을 열고 3분만 바깥 공기를 들이세요.' }
      ]
    },
    화: {
      obj: 'incense', name: '따뜻한 향로', josa: '를',
      missions: [
        { tag: '색', text: '빨강·주황 소품 하나를 눈에 보이는 자리에 두세요.' },
        { tag: '음식', text: '따뜻한 차 한 잔을 식기 전에 천천히 드세요.' },
        { tag: '동선', text: '햇볕 드는 창가에 3분만 서 있어 보세요.' },
        { tag: '말', text: '망설인 결정 하나를 오늘 안에 딱 정하세요.' },
        { tag: '손', text: '미뤄 둔 답장 하나, 지금 3줄로 끝내세요.' }
      ]
    },
    토: {
      obj: 'stone', name: '황금 수호석', josa: '을',
      missions: [
        { tag: '색', text: '베이지·노랑으로 손 닿는 자리부터 정리하세요.' },
        { tag: '음식', text: '단맛 한 조각, 밥은 평소보다 천천히 드세요.' },
        { tag: '동선', text: '책상 위 서류 세 장만 치우고 시작하세요.' },
        { tag: '말', text: '안 쓸 약속 하나를 오늘 정중히 접으세요.' },
        { tag: '손', text: '지갑 속 영수증을 다 꺼내 버리세요.' }
      ]
    },
    금: {
      obj: 'bell', name: '수정 종', josa: '을',
      missions: [
        { tag: '색', text: '흰색·은색으로 지갑이나 가방을 정리하세요.' },
        { tag: '음식', text: '매운맛 한 입으로 막힌 숨을 트여 보세요.' },
        { tag: '동선', text: '안 쓰는 구독 하나를 오늘 확인해서 끊으세요.' },
        { tag: '말', text: '받을 돈 한 건, 오늘 문자로 물어보세요.' },
        { tag: '손', text: '결제 3초 전, 한 번만 더 물어보고 누르세요.' }
      ]
    },
    수: {
      obj: 'orb', name: '행운 물결구슬', josa: '를',
      missions: [
        { tag: '색', text: '파랑·남색 계열로 물 한 잔 옆에 두세요.' },
        { tag: '음식', text: '미지근한 물 한 잔을 한 번에 비우세요.' },
        { tag: '동선', text: '손목을 10초 물에 적시고 돌아오세요.' },
        { tag: '말', text: '보내려던 답장은 초안에만 넣어 두세요.' },
        { tag: '손', text: '눈을 감고 숨을 세 번만 크게 쉬어 보세요.' }
      ]
    }
  };

  var OBJ_SVG = {
    sprout: '<svg viewBox="0 0 120 120" class="obj" aria-hidden="true" focusable="false">' +
      '<ellipse cx="60" cy="108" rx="26" ry="5" fill="#2A2724" opacity=".08"/>' +
      '<path d="M60 78V48" stroke="#5C9A4A" stroke-width="4.4" stroke-linecap="round"/>' +
      '<path d="M60 56C48 54 40 46 39 34c11 0 20 9 21 22z" fill="#7FC25F"/>' +
      '<path d="M60 56c12-2 20-10 21-22-11 0-20 9-21 22z" fill="#9BD67A"/>' +
      '<path d="M38 76h44l-5 24a7 7 0 0 1-7 6H50a7 7 0 0 1-7-6z" fill="#E7C79A"/>' +
      '<path d="M38 76h44l-1.4 6.6H39.4z" fill="#D3AE79"/>' +
      '<circle cx="53" cy="94" r="2.3" fill="#7A5C33" opacity=".55"/>' +
      '<circle cx="67" cy="94" r="2.3" fill="#7A5C33" opacity=".55"/>' +
      '<path d="M55 100q5 4 10 0" fill="none" stroke="#7A5C33" stroke-width="2" stroke-linecap="round" opacity=".55"/>' +
      '</svg>',
    incense: '<svg viewBox="0 0 120 120" class="obj" aria-hidden="true" focusable="false">' +
      '<ellipse cx="60" cy="106" rx="26" ry="5" fill="#2A2724" opacity=".08"/>' +
      '<path d="M58 60c-9-10 9-14 0-26" fill="none" stroke="#B7C2CB" stroke-width="3" stroke-linecap="round" opacity=".8"/>' +
      '<path d="M70 58c-7-9 7-12 0-22" fill="none" stroke="#CFD8DE" stroke-width="2.4" stroke-linecap="round" opacity=".7"/>' +
      '<path d="M34 68h52c0 16-11.6 28-26 28S34 84 34 68z" fill="#C97B5A"/>' +
      '<ellipse cx="60" cy="68" rx="26" ry="6.5" fill="#E39A78"/>' +
      '<path d="M50 96l-3 8M70 96l3 8" stroke="#A9633F" stroke-width="3" stroke-linecap="round"/>' +
      '<ellipse cx="60" cy="68" rx="4" ry="3" fill="#FFD79A"/>' +
      '</svg>',
    stone: '<svg viewBox="0 0 120 120" class="obj" aria-hidden="true" focusable="false">' +
      '<ellipse cx="60" cy="104" rx="28" ry="5" fill="#2A2724" opacity=".08"/>' +
      '<path d="M60 30c16 0 30 16 30 37 0 17-13 27-30 27S30 84 30 67c0-21 14-37 30-37z" fill="#EBC77E"/>' +
      '<path d="M46 44c6-6 14-9 20-9-10 6-15 16-16 30-4-8-6-15-4-21z" fill="#F8E3B4" opacity=".8"/>' +
      '<circle cx="50" cy="70" r="2.6" fill="#8A6B2C"/>' +
      '<circle cx="70" cy="70" r="2.6" fill="#8A6B2C"/>' +
      '<path d="M54 79q6 5 12 0" stroke="#8A6B2C" fill="none" stroke-width="2.2" stroke-linecap="round"/>' +
      '<path d="M92 34l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#FFF3CF"/>' +
      '</svg>',
    bell: '<svg viewBox="0 0 120 120" class="obj" aria-hidden="true" focusable="false">' +
      '<ellipse cx="60" cy="106" rx="24" ry="5" fill="#2A2724" opacity=".08"/>' +
      '<path d="M60 26c14 0 21 16 21 34v18H39V60c0-18 7-34 21-34z" fill="#DCEBF4" stroke="#A9BECE" stroke-width="2"/>' +
      '<path d="M50 36c-4 8-6 16-6 24" stroke="#FFFFFF" stroke-width="4" opacity=".85" stroke-linecap="round"/>' +
      '<path d="M36 78h48l-4 8H40z" fill="#C7D9E4"/>' +
      '<circle cx="60" cy="92" r="5" fill="#9FB4C6"/>' +
      '<path d="M88 38l2.4 6 6 2.4-6 2.4-2.4 6-2.4-6-6-2.4 6-2.4z" fill="#FFF3CF"/>' +
      '</svg>',
    orb: '<svg viewBox="0 0 120 120" class="obj" aria-hidden="true" focusable="false">' +
      '<ellipse cx="60" cy="105" rx="24" ry="5" fill="#2A2724" opacity=".08"/>' +
      '<circle cx="60" cy="62" r="32" fill="#E8F6FC" stroke="#B7DCEA" stroke-width="2"/>' +
      '<path d="M35 68c8-7 15 7 23 0s15 7 23 0" fill="none" stroke="#78C2DC" stroke-width="3" stroke-linecap="round"/>' +
      '<path d="M37 80c8-7 15 7 23 0s15 7 23 0" fill="none" stroke="#9FD5E8" stroke-width="2.4" stroke-linecap="round" opacity=".8"/>' +
      '<ellipse cx="48" cy="45" rx="9" ry="6" fill="#FFFFFF" opacity=".85" transform="rotate(-25 48 45)"/>' +
      '</svg>'
  };

  var care = { draws: 0, charge: 0, lit: false, bowl: null, bowlTimer: null, buy: 'set' };

  function careElement() {
    return state.res ? repElement().el : '화';
  }

  function careMissionHTML(el, idx) {
    var list = (CARE[el] || CARE['화']).missions;
    var m = list[idx % list.length];
    return '<span class="care-flip__tag">' + esc(m.tag) + '</span>' +
      '<b>' + esc(m.text) + '</b>';
  }

  /* 4번 — 윤이세 1:1 상담 (49,000원~) */
  function consultShopHTML() {
    return '<p class="modal__eyebrow">1:1 CONSULT · 윤이세</p>' +
      '<h2 class="shop__title" id="shopTitle">🔮 윤이세 1:1 상담</h2>' +
      '<p class="shop__sub">캘린더로는 안 풀리는 내 상황을 <b>통째로</b> 놓고, 지금 어디서 막혔는지·어디로 움직이면 풀리는지 같이 짚어 드려요.</p>' +
      '<ul class="shop__list">' +
      '<li><b>내 사주·올해 흐름 전체로 보기</b><span>날짜 하나가 아니라 내 판 전체에서 막힌 자리를 찾아요</span></li>' +
      '<li><b>지금 할 일·미룰 일 정리</b><span>바로 움직일 것과 기다릴 것을 갈라 드려요</span></li>' +
      '<li><b>일정은 카카오톡 채널에서</b><span>결제 후 채널로 알려 주시면 가능한 시간을 바로 잡아 드려요</span></li>' +
      '</ul>' +
      priceHTML('윤이세 1:1 상담', CONSULT_PRICE) +
      payActionsHTML('consult') +
      '<p class="shop__note">결제가 끝나면 카카오톡 채널로 알려 주세요 — 상담 일정을 바로 잡아 드립니다.</p>';
  }

  function careShopHTML() {
    var el = careElement();
    var c = CARE[el] || CARE['화'];
    var thr = EL_THEME[el] || EL_THEME['화'];
    var idx = (seedOf(state.todayISO) + care.draws) % c.missions.length;
    return '<p class="modal__eyebrow">QUICK CARE · 긴급 개운템 3종</p>' +
      '<h2 class="shop__title" id="shopTitle">⚡ 극도로 힘들 때<br>긴급 개운템</h2>' +
      '<p class="shop__sub">부적을 붙여도 유독 막히고 안 풀리는 날, 앱에서 바로 꺼내 쓰는 <b>3가지</b>예요. 지금 여기서 그대로 체험해 보세요.</p>' +

      /* ① 행동 카드 */
      '<section class="care">' +
      '<p class="care__no">01</p>' +
      '<p class="care__title">오늘의 긴급 개운 행동 카드</p>' +
      '<p class="care__desc">카드를 뒤집으면 오늘 막힘을 뚫는 행동 <b>한 가지</b>가 나와요.</p>' +
      '<button type="button" class="care-flip' + (care.draws ? ' is-open' : '') + '" data-care="draw" aria-label="오늘의 개운 행동 카드 뽑기">' +
      '<span class="care-flip__inner">' +
      '<span class="care-flip__face care-flip__face--back"><span class="care-flip__star">✦</span><b>탭해서<br>오늘의 카드 뽑기</b></span>' +
      '<span class="care-flip__face care-flip__face--front">' + (care.draws ? careMissionHTML(el, idx) : '') + '</span>' +
      '</span></button>' +
      '<p class="care__hint">' + (care.draws ? '한 번 더 뽑을 수 있어요' : '') + '</p>' +
      '</section>' +

      /* ② 디지털 개운 오브제 */
      '<section class="care">' +
      '<p class="care__no">02</p>' +
      '<p class="care__title">내 디지털 개운 오브제</p>' +
      '<p class="care__desc">내게 부족한 기운은 <b>' + esc(TALIS[el].label) + '</b> — ' + esc(c.name) + esc(c.josa) + ' 문질러 기운을 채워 보세요.</p>' +
      '<button type="button" class="care-obj' + (care.lit ? ' is-lit' : '') + '" data-care="obj" ' +
      'style="--obj-glow:' + thr.color + '" aria-label="' + esc(c.name) + ' 문질러 기운 충전">' +
      '<span class="care-obj__art">' + OBJ_SVG[c.obj] + '</span>' +
      '<span class="care-obj__bar"><i style="width:' + care.charge + '%"></i></span>' +
      '<span class="care-obj__label" data-care-label>' + (care.lit ? '기운 가득! 오늘은 이 기운으로 버텨요' : '문지르면 기운이 차요 · ' + care.charge + '%') + '</span>' +
      '</button>' +
      '</section>' +

      /* ③ 싱잉볼 */
      '<section class="care">' +
      '<p class="care__no">03</p>' +
      '<p class="care__title">1분 오행 싱잉볼 · 기운 리셋</p>' +
      '<p class="care__desc">깊고 맑은 울림에 맞춰 숨을 한 번 크게 — 1분이면 머리가 조용해져요.</p>' +
      '<button type="button" class="care-bowl" data-care="bowl" aria-label="1분 싱잉볼 기운 리셋 시작">' +
      '<span class="care-bowl__ring"></span>' +
      '<span class="care-bowl__art"><svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">' +
      '<path d="M28 58h64c0 17-14 31-32 31S28 75 28 58z" fill="#D9B46A"/>' +
      '<ellipse cx="60" cy="58" rx="32" ry="7" fill="#EFD79E"/>' +
      '<ellipse cx="60" cy="58" rx="22" ry="4.5" fill="#C99C4E"/>' +
      '<path d="M88 30l2.2 5.6 5.6 2.2-5.6 2.2-2.2 5.6-2.2-5.6-5.6-2.2 5.6-2.2z" fill="#FFF3CF" class="care-bowl__spark"/>' +
      '<path d="M32 96h56" stroke="#C9A45E" stroke-width="4" stroke-linecap="round"/>' +
      '</svg></span>' +
      '<span class="care-bowl__text" data-care-bowl-text>탭하면 시작 · 1분</span>' +
      '</button>' +
      '</section>' +

      priceHTML('긴급 개운템', CARE_PRICE) +
      '<div class="pay__pick" role="group" aria-label="개운템 구성 선택">' +
      '<button type="button" class="pay__pick-btn' + (care.buy === 'one' ? ' is-on' : '') + '" data-careitem="one" aria-pressed="' + (care.buy === 'one') + '">' +
      '<b>낱개 1종</b><span>2,900원</span></button>' +
      '<button type="button" class="pay__pick-btn' + (care.buy === 'set' ? ' is-on' : '') + '" data-careitem="set" aria-pressed="' + (care.buy === 'set') + '">' +
      '<b>3종 세트</b><span>5,900원</span></button>' +
      '</div>' +
      payActionsHTML('care-' + care.buy) +
      '<div class="shop__consult">' +
      '<b>윤이세 1:1 상담 ' + CONSULT_PRICE + '</b>' +
      '<span>캘린더·개운템으로도 안 풀리면, 내 상황을 통째로 보고 길을 잡아 드려요.</span>' +
      '<button type="button" class="shop__consult-btn" data-shop="consult">상담 일정 잡기 →</button>' +
      '</div>' +
      '<p class="shop__note">3종은 지금 여기서 그대로 체험할 수 있어요. 결제가 끝나면 카카오톡 채널로 알려 주세요.</p>';
  }

  /* ── 긴급 개운템 동작 ───────────────────────────── */
  function careEl(sel) { return shopBody ? shopBody.querySelector(sel) : null; }

  function drawCareCard(btn) {
    var el = careElement();
    care.draws += 1;
    var list = (CARE[el] || CARE['화']).missions;
    var idx = (seedOf(state.todayISO) + care.draws) % list.length;
    var front = btn.querySelector('.care-flip__face--front');
    if (front) front.innerHTML = careMissionHTML(el, idx);
    btn.classList.add('is-open');
    var hint = btn.parentNode ? btn.parentNode.querySelector('.care__hint') : null;
    if (hint) hint.textContent = '한 번 더 뽑을 수 있어요';
    vibrate([16, 20, 26]);
    sfxTap(1);
  }

  function chargeCareObj(btn) {
    if (care.lit) { vibrate([30, 40, 30]); return; }
    care.charge = Math.min(100, care.charge + 25);
    var bar = btn.querySelector('.care-obj__bar i');
    var label = btn.querySelector('[data-care-label]');
    if (bar) bar.style.width = care.charge + '%';
    btn.classList.remove('is-hit');
    void btn.offsetWidth;
    btn.classList.add('is-hit');
    vibrate(18);
    if (care.charge >= 100) {
      care.lit = true;
      btn.classList.add('is-lit');
      if (label) label.textContent = '기운 가득! 오늘은 이 기운으로 버텨요';
      vibrate([40, 60, 40, 60, 90]);
      sfxDone();
    } else {
      if (label) label.textContent = '문지르면 기운이 차요 · ' + care.charge + '%';
      sfxTap(2);
    }
  }

  /* 싱잉볼 — Web Audio 로 깊은 배음 + 1분 호흡 가이드 */
  function bowlStrike() {
    var ctx = audioCtx(); if (!ctx) return;
    var t0 = ctx.currentTime;
    var base = 196;                                   // G3 — 낮고 편안한 울림
    [1, 2.02, 2.98, 4.07, 5.42].forEach(function (m, i) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = i === 0 ? 'sine' : 'sine';
      o.frequency.setValueAtTime(base * m * (1 + (i % 2 ? 0.0016 : -0.0012)), t0);
      var peak = 0.26 / (i * 0.9 + 1);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012 + i * 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 7.5 - i * 0.6);
      o.connect(g); g.connect(ctx.destination);
      o.start(t0); o.stop(t0 + 8);
    });
    // 살짝 스치는 쇠 소리
    var n = Math.floor(ctx.sampleRate * 0.12);
    if (n > 0) {
      var buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
      for (var k = 0; k < n; k++) d[k] = (Math.random() * 2 - 1) * Math.pow(1 - k / n, 6);
      var src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g2 = ctx.createGain();
      bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 0.8;
      g2.gain.value = 0.05;
      src.buffer = buf; src.connect(bp); bp.connect(g2); g2.connect(ctx.destination);
      src.start(t0);
    }
  }

  function stopBowl() {
    if (care.bowlTimer) { clearInterval(care.bowlTimer); care.bowlTimer = null; }
    care.bowl = null;
    var btn = careEl('[data-care="bowl"]');
    if (btn) {
      btn.classList.remove('is-on', 'is-in', 'is-out');
      var txt = btn.querySelector('[data-care-bowl-text]');
      if (txt) txt.textContent = '탭하면 시작 · 1분';
      var ring = btn.querySelector('.care-bowl__ring');
      if (ring) { ring.style.transition = 'transform .5s ease, opacity .5s ease'; ring.style.transform = 'scale(.92)'; ring.style.opacity = '0'; }
    }
  }

  function startBowl(btn) {
    if (care.bowlTimer) { stopBowl(); vibrate(12); return; }
    bowlStrike();
    vibrate([60, 40, 120]);
    care.bowl = { left: 60, phase: 'in', phaseLeft: 4 };
    btn.classList.add('is-on', 'is-in');
    var txt = btn.querySelector('[data-care-bowl-text]');
    var paint = function () {
      if (!care.bowl) return;
      var b = care.bowl;
      if (txt) {
        txt.textContent = (b.phase === 'in' ? '들이쉬세요' : '내쉬세요') + ' · 남은 ' + b.left + '초';
      }
      var ring = btn.querySelector('.care-bowl__ring');
      if (ring) {
        var dur = b.phase === 'in' ? 4 : 6;
        ring.style.transition = 'transform ' + dur + 's ease-in-out, opacity ' + dur + 's ease-in-out';
        ring.style.transform = 'scale(' + (b.phase === 'in' ? 1.38 : 0.92) + ')';
        ring.style.opacity = b.phase === 'in' ? 0.78 : 0.3;
      }
      btn.classList.toggle('is-in', b.phase === 'in');
      btn.classList.toggle('is-out', b.phase === 'out');
    };
    paint();
    care.bowlTimer = setInterval(function () {
      var b = care.bowl;
      if (!b) return;
      b.left -= 1;
      b.phaseLeft -= 1;
      if (b.phaseLeft <= 0) {
        if (b.phase === 'in') { b.phase = 'out'; b.phaseLeft = 6; }
        else { b.phase = 'in'; b.phaseLeft = 4; }
      }
      if (b.left <= 0) {
        if (txt) txt.textContent = '기운 리셋 완료 · 오늘 하루 수고했어요';
        btn.classList.remove('is-in', 'is-out');
        btn.classList.add('is-done');
        var ring = btn.querySelector('.care-bowl__ring');
        if (ring) { ring.style.transition = 'transform .8s ease, opacity .8s ease'; ring.style.transform = 'scale(.92)'; ring.style.opacity = '0'; }
        sfxDone(); vibrate([30, 50, 30, 50, 120]);
        if (care.bowlTimer) { clearInterval(care.bowlTimer); care.bowlTimer = null; }
        care.bowl = null;
        setTimeout(function () { if (btn) btn.classList.remove('is-done'); }, 2600);
        return;
      }
      paint();
    }, 1000);
  }

  /* 개운템 구성(낱개 / 3종 세트) 고르면 결제 두 버튼이 그 구성으로 바뀐다 */
  function setCareItem(v) {
    if (v !== 'one' && v !== 'set') return;
    care.buy = v;
    if (!shopBody) return;
    $$('[data-careitem]', shopBody).forEach(function (b) {
      var on = b.getAttribute('data-careitem') === v;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    $$('[data-pay]', shopBody).forEach(function (b) {
      if (b.getAttribute('data-item')) b.setAttribute('data-item', 'care-' + v);
    });
    var cardSub = shopBody.querySelector('[data-pay="card"] .pay__label span');
    if (cardSub) cardSub.textContent = cardUrlOf('care-' + v) ? '카드·간편결제로 바로 결제' : '카카오톡으로 결제 링크 받기';
    var note = shopBody.querySelector('[data-pay-note]');
    if (note) { note.hidden = true; note.innerHTML = ''; }
    sfxTap(1);
  }

  function handleCare(kind, btn, ev) {
    if (kind === 'draw') { drawCareCard(btn); return; }
    if (kind === 'obj') { chargeCareObj(btn); return; }
    if (kind === 'bowl') { startBowl(btn); return; }
  }

  function openShop(kind) {
    if (!shopEl) return;
    shopLastFocus = document.activeElement;
    shopBody.innerHTML = kind === 'care' ? careShopHTML()
      : (kind === 'consult' ? consultShopHTML()
        : (kind === 'allinone' ? allinoneShopHTML() : passShopHTML()));
    shopEl.hidden = false;
    document.body.classList.add('is-modal-open');
    shopBody.scrollTop = 0;
    sfxOpen();
    try { shopDialog.focus({ preventScroll: true }); } catch (e) { shopDialog.focus(); }
  }

  function closeShop() {
    if (!shopEl || shopEl.hidden || shopClosing) return;
    if (care.bowlTimer) stopBowl();
    shopClosing = true;
    shopEl.classList.add('is-closing');
    setTimeout(function () {
      shopEl.classList.remove('is-closing');
      shopEl.hidden = true;
      shopBody.innerHTML = '';
      shopClosing = false;
      if (!modalEl || modalEl.hidden) document.body.classList.remove('is-modal-open');
      var target = shopLastFocus;
      if (target && target.focus) { try { target.focus({ preventScroll: true }); } catch (e) {} }
      shopLastFocus = null;
    }, 180);
  }

  /* ── 효과음 · 진동 (Web Audio 합성, 음원 파일 없음) ── */
  var SOUND_KEY = 'yoonise.timing.sound.v1';
  var sound = { on: true, ctx: null };

  function loadSoundPref() {
    try { if (localStorage.getItem(SOUND_KEY) === '0') sound.on = false; } catch (e) {}
  }
  function saveSoundPref() {
    try { localStorage.setItem(SOUND_KEY, sound.on ? '1' : '0'); } catch (e) {}
  }
  function vibrate(p) {
    if (!sound.on || !navigator.vibrate) return;
    try { navigator.vibrate(p); } catch (e) {}
  }
  /* AudioContext는 반드시 사용자 제스처(날짜 클릭·부적 탭) 안에서 만든다
     — 모바일 Safari/Chrome 자동재생 정책 통과용 */
  function audioCtx() {
    if (!sound.on) return null;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      if (!sound.ctx) sound.ctx = new AC();
      if (sound.ctx.state === 'suspended' && sound.ctx.resume) sound.ctx.resume();
      return sound.ctx;
    } catch (e) { return null; }
  }
  function tone(ctx, o) {
    var t0 = ctx.currentTime + (o.at || 0);
    var osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.from, t0);
    if (o.to && o.to !== o.from) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + (o.glide || o.dur));
    var peak = o.gain == null ? 0.14 : o.gain;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + (o.attack || 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(t0); osc.stop(t0 + o.dur + 0.03);
  }
  /* 나무 타격의 '톡' — 아주 짧은 밴드패스 노이즈 */
  function wood(ctx, at, gain) {
    var n = Math.floor(ctx.sampleRate * 0.05);
    if (n <= 0) return;
    var buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3.2);
    var src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 1.0;
    g.gain.value = gain == null ? 0.05 : gain;
    src.buffer = buf; src.connect(bp); bp.connect(g); g.connect(ctx.destination);
    src.start(ctx.currentTime + (at || 0));
  }

  /* 1) 모달이 뿅 튀어나올 때 — 880→1320Hz 맑은 차임 */
  function sfxOpen() {
    vibrate([30, 18, 45]);
    var ctx = audioCtx(); if (!ctx) return;
    tone(ctx, { from: 880, to: 1320, dur: 0.34, glide: 0.13, type: 'sine', gain: 0.13 });
    tone(ctx, { from: 1320, to: 1760, dur: 0.28, type: 'sine', gain: 0.055, at: 0.07, glide: 0.12 });
  }
  /* 2) 부적 두드리기(1/3·2/3) — 420→220Hz 톡, 두 번째는 살짝 높게 */
  function sfxTap(step) {
    vibrate([45, 25, 55]);              // 1·2타 — 손끝까지 오는 톡
    var ctx = audioCtx(); if (!ctx) return;
    var base = 420 + (step - 1) * 45;
    tone(ctx, { from: base, to: base * 0.52, dur: 0.14, glide: 0.05, type: 'triangle', gain: 0.2, attack: 0.004 });
    tone(ctx, { from: base * 2, to: base * 2, dur: 0.06, type: 'sine', gain: 0.045 });
    wood(ctx, 0, 0.05);
  }
  /* 3) 3/3 완료 — 도장 '쾅' 저음 타격 + C5-E5-G5-C6 상승 아르페지오 */
  function sfxDone() {
    vibrate([80, 35, 100, 45, 130]);   // 3타 완료 — 쾅! 하고 길게
    var ctx = audioCtx(); if (!ctx) return;
    // 쾅 — 낮게 떨어지는 타격 + 노이즈 임팩트
    tone(ctx, { from: 150, to: 52, dur: 0.26, glide: 0.16, type: 'sine', gain: 0.42, attack: 0.004 });
    tone(ctx, { from: 96, to: 44, dur: 0.34, glide: 0.22, type: 'triangle', gain: 0.2, attack: 0.006 });
    wood(ctx, 0, 0.12);
    // 반짝 — 상승 화음
    [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) {
      tone(ctx, { from: f, to: f, dur: 0.55, type: 'sine', gain: 0.15, at: 0.09 + i * 0.085, attack: 0.008 });
      tone(ctx, { from: f * 2, to: f * 2, dur: 0.4, type: 'triangle', gain: 0.035, at: 0.09 + i * 0.085 });
    });
  }
  function syncSoundBtn() {
    $$('.js-sound').forEach(function (b) {
      b.textContent = sound.on ? '🔊 소리' : '🔇 무음';
      b.setAttribute('aria-pressed', sound.on ? 'true' : 'false');
      b.setAttribute('aria-label', sound.on ? '효과음과 진동 켜짐 — 끄기' : '효과음과 진동 꺼짐 — 켜기');
      b.title = sound.on ? '효과음·진동 끄기' : '효과음·진동 켜기';
      b.classList.toggle('is-off', !sound.on);
    });
  }

  /* ── 시작 ──────────────────────────────────────────── */
  function boot() {
    // index.html 의 무료 체험 문구(js-trial) / 전체 오픈 문구(js-open)를 스위치에 맞춰 보인다
    document.body.setAttribute('data-trial', FREE_TRIAL_ENABLED ? 'on' : 'off');
    var now = new Date();
    state.todayISO = T.isoOf(now.getFullYear(), now.getMonth() + 1, now.getDate());
    state.terms = T.buildTerms(TERMS_FROM, RANGE_TO);
    loadStamps();
    state.view = clampView(now.getFullYear(), now.getMonth() + 1);
    initForm();

    modalEl = $('#dayModal');
    modalBody = $('#modalBody');
    modalDialog = $('#modalDialog');
    shopEl = $('#shopModal');
    shopBody = $('#shopBody');
    shopDialog = $('#shopDialog');

    loadSoundPref();
    syncSoundBtn();
    $$('.js-sound').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        sound.on = !sound.on;
        saveSoundPref();
        syncSoundBtn();
        if (sound.on) sfxTap(1);            // 켜졌다는 확인음도 제스처 안에서
      });
    });

    // 팝업 안: 부적 두드리기 / X·배경·닫기 버튼
    modalEl.addEventListener('click', function (e) {
      var tap = e.target.closest ? e.target.closest('[data-ritual="tap"]') : null;
      if (tap) { onRitualTap(tap, e); return; }
      if (e.target.closest('[data-modal-close]')) closeDayModal();
    });

    // 구입 팝업 — 맨 아래 카드 3개 버튼과 잠금 카드 버튼
    document.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-shop]') : null;
      if (!b) return;
      e.preventDefault();
      var kind = b.getAttribute('data-shop');
      if (modalEl && !modalEl.hidden) {       // 날짜 팝업에서 열면 그 팝업은 닫고
        closeDayModal();
        setTimeout(function () { openShop(kind); }, 190);
      } else {
        openShop(kind);
      }
    });
    if (shopEl) {
      shopEl.addEventListener('click', function (e) {
        if (e.target.closest('[data-shop-close]')) { closeShop(); return; }
        var pay = e.target.closest ? e.target.closest('[data-pay]') : null;
        if (pay) { e.preventDefault(); handlePay(pay.getAttribute('data-pay'), pay.getAttribute('data-item')); return; }
        var pick = e.target.closest ? e.target.closest('[data-careitem]') : null;
        if (pick) { e.preventDefault(); setCareItem(pick.getAttribute('data-careitem')); return; }
        var c = e.target.closest ? e.target.closest('[data-care]') : null;
        if (c) { e.preventDefault(); handleCare(c.getAttribute('data-care'), c, e); }
      });
    }

    // ESC 닫기 + Tab 포커스가 팝업 밖으로 나가지 않게
    document.addEventListener('keydown', function (e) {
      if (shopEl && !shopEl.hidden) {
        if (e.key === 'Escape') { e.preventDefault(); closeShop(); }
        return;
      }
      if (!modalEl || modalEl.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); closeDayModal(); return; }
      if (e.key !== 'Tab') return;
      var f = $$('a[href], button:not([disabled])', modalDialog).filter(function (el) {
        return el.offsetParent !== null;
      });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === modalDialog)) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    });

    $('#calGrid').addEventListener('click', function (e) {
      var b = e.target.closest('.day[data-iso]');
      if (!b) return;
      var iso = b.dataset.iso;
      if (!isOpenDay(iso)) return;
      openDayModal(iso);
    });

    var saved = loadInput();
    if (saved) {
      applyInput(saved);
      try {
        var o = readForm();
        o.y = saved.y; o.m = saved.m; o.d = saved.d; o.leap = !!saved.leap;
        o.calendar = saved.calendar || 'solar';
        o.timeKnown = saved.timeKnown !== false;
        o.hh = saved.hh; o.mm = saved.mm;
        o.region = saved.region || 'seoul';
        o.trueSolar = !!saved.trueSolar; o.dst = !!saved.dst; o.ziRule = saved.ziRule || '23';
        var r = M.REGIONS.filter(function (x) { return x.key === o.region; })[0];
        o.longitude = r ? r.lon : 126.98;
        o.gender = saved.gender;
        state.res = M.compute(o);
        state.natal = T.natalOf(state.res);
        state.cache = {};
        $('#formCard').hidden = true;
        $('#result').hidden = false;
        render();
      } catch (err) {
        $('#formCard').hidden = false;
      }
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

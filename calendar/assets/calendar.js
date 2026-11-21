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
     FREE_TRIAL_ENABLED = true  → 판매 모드(2026-11-20부터). **첫 방문일(달력을 처음 연 날)부터 딱 FREE_DAYS일**만 열리고,
        그 뒤로는 오늘 날짜까지 전부 잠겨 어두운 잠금 카드(정미년 패스 · 1:1 원포인트 리딩 안내)가 뜹니다.
        (매일 '오늘~모레'로 굴러가면 결제 없이 계속 무료로 쓸 수 있어서 2026-11-21 첫 방문일 고정으로 바꿨습니다.)
     FREE_TRIAL_ENABLED = false → 모든 날짜(과거 포함)를 누르면 잠금 카드 없이 부적 팝업·톡톡톡·스티커·처방이 바로 열립니다(테스트용).
     → 무료 일수를 바꾸려면 FREE_DAYS 도 함께 조정합니다. (index.html 문구도 js-trial/js-trial-over/js-open 로 자동 전환) */
  var FREE_TRIAL_ENABLED = true;
  var FREE_DAYS_BASE = 3;   // 그냥 들어온 손님 — 첫 방문일 포함 3일(D+0·D+1·D+2)
  /* ── 친구 초대(?ref=) 보너스 ───────────────────────────────────────────────
     /calendar/member/ 의 초대 링크(?ref=코드)로 들어온 손님은 '초대받은 손님'으로 보고
     무료 체험을 3일 → 5일, 액운 태우기를 무료 5회 → 6회로 늘린다. (2026-11-21)
     · 코드는 member.js 와 같은 칸(REF_KEY)에 적고, 로그인으로 그 칸이 비워져도
       INVITED_KEY 가 남아 다음 방문에도 5일이 이어진다.
     · ?ref= 없이 들어온 손님은 지금까지처럼 3일 그대로. */
  var INVITE_DAYS_BONUS = 2;
  var INVITE_BURN_BONUS = 1;
  var REF_KEY = 'yoonise.member.ref.v1';    // member.js 가 ?ref= 를 적어 두는 칸 (같은 오리진)
  var INVITED_KEY = 'yoonise.invited.v1';   // 초대받은 손님 표시 { ref, at }
  var inviteRef = readInviteRef();
  var invited = !!inviteRef;
  var FREE_DAYS = FREE_DAYS_BASE + (invited ? INVITE_DAYS_BONUS : 0);   // 초대 손님 5일 · 그냥 들어오면 3일

  /** 초대 코드 모양인가 — member.js 와 같은 규칙(영문·숫자 4~12자) */
  function validRef(v) { return /^[A-Z0-9]{4,12}$/.test(String(v || '').trim().toUpperCase()); }
  /** 이 손님이 초대 링크로 왔는가 — 지금 주소의 ?ref= → 저장된 초대 표시 → member.js 의 대기 코드 순서 */
  function readInviteRef() {
    var q = '';
    try { q = new URLSearchParams(location.search).get('ref') || ''; } catch (e) { q = ''; }
    q = String(q).trim().toUpperCase();
    if (validRef(q)) {                      // 이 화면에 ?ref= 로 들어옴 — member.js 칸에도 같이 적어 둔다
      try {
        localStorage.setItem(REF_KEY, q);
        localStorage.setItem(INVITED_KEY, JSON.stringify({ ref: q, at: new Date().toISOString() }));
      } catch (e) { }
      return q;
    }
    var saved = '';
    try { saved = (JSON.parse(localStorage.getItem(INVITED_KEY) || 'null') || {}).ref || ''; } catch (e) { saved = ''; }
    if (validRef(saved)) return String(saved).trim().toUpperCase();
    var pend = '';
    try { pend = localStorage.getItem(REF_KEY) || ''; } catch (e) { pend = ''; }
    if (validRef(pend)) {
      pend = String(pend).trim().toUpperCase();
      try { localStorage.setItem(INVITED_KEY, JSON.stringify({ ref: pend, at: new Date().toISOString() })); } catch (e) { }
      return pend;
    }
    return '';
  }

  /* ── 개인 전용 입장 코드 (1결제 = 1번호, 2026-11-21부터) ──────────────────
     결제한 손님의 **휴대폰 번호**(결제할 때 넣은 번호)에 비밀 salt 서명을 묶은 코드입니다.
     기본은 **6자리 간단 코드** — 등급 글자 1 + 숫자 5자리.

       D21744
         P/A/D    상품 등급 — P 1년 패스 · A 올인원 · D 성찰 에디션
         21744    서명 5자리 — 결제하신 휴대폰 번호(숫자만) + 상품 + 아래 CODE_SALT 로 계산
                  → 사주를 넣지 않아도 되고, 사장님이 번호만 발급기에 넣으면 3초에 코드가 나온다

     → 손님은 [휴대폰 번호 + 6자리 코드]를 함께 넣는다. 번호와 코드가 맞으면 바로 열린다.
       번호가 다르면 숫자가 맞지 않아 열리지 않는다. (코드를 남에게 옮겨도 번호를 모르면 못 연다)
     → 예전(사주 기반) 6자리 코드와 18자리 코드(YS-P-791025F-K7QM3)도 계속 열린다(호환).
     → 나영 님 전용 발급기: calendar/yoon-key/ (비밀번호 4자리로 잠금).
     ★ 아래 CODE_SALT·서명 함수는 그 발급기와 반드시 똑같이 맞춰야 한다(발급기를 고치면 여기도 같이). */
  var CODE_SALT = 'yoonise-2027-timing-9f3a';
  var CODE_ALPHA = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';   // 0·1·I·L·O 를 뺀 31자 (손으로 옮겨도 덜 틀리게)
  var CODE_TIER_OF_LETTER = { P: 'pass', A: 'allinone', D: 'diary' };
  var CODE_LETTER_OF_TIER = { pass: 'P', allinone: 'A', diary: 'D' };
  var TIER_NAME = { pass: '1년 패스', allinone: '올인원', diary: '성찰 에디션' };
  var TIER_RANK = { pass: 1, allinone: 2, diary: 3 };   // 위 티어가 아래 티어의 기능을 모두 포함한다
  var UNLOCK_KEY = 'yoonise.timing.unlock.v2';          // { code, tier, ymd, gender } JSON
  var LEGACY_UNLOCK_KEY = 'yoonise.timing.unlock.v1';   // 예전 고정 코드 시절 값 ('pass' | 'allinone' | 'diary' | '1')
  var TRIAL_KEY = 'yoonise.timing.trialStart.v1';       // 첫 방문일(YYYY-MM-DD) — 무료 3일은 이 날부터 고정
  var trialStartMemo = '';
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
  var PAYAPP_PASS_URL = 'https://www.payapp.kr/L/z4otyE';       // 🎟️ 1년 패스 14,900원 (페이앱 페이지에서 금액 확인)
  var PAYAPP_ALLINONE_URL = 'https://www.payapp.kr/L/z4otzE';   // 👑 올인원 19,900원 (페이앱 페이지에서 금액 확인)
  var PAYAPP_DIARY_URL = 'https://www.payapp.kr/L/z4ovHA'; // ✨ 성찰 에디션 24,900원 — 비어 있으면 계좌이체 + 노란 카톡 버튼으로 안내
  var PAYAPP_CARE_ONE_URL = '';   // ⚡ 긴급 개운템 낱개 2,900원
  var PAYAPP_CARE_SET_URL = '';   // ⚡ 긴급 개운템 3종 세트 5,900원
  var PAYAPP_CONSULT_URL = 'https://www.payapp.kr/L/z4ovI1'; // 🔎 윤이세 1:1 원포인트 리딩 49,000원 (질문 1가지)
  var PAYAPP_SIGNATURE_URL = 'https://www.payapp.kr/L/z4ovJ1'; // 🌿 윤이세 1:1 시그니처 리딩 100,000원 (전체 흐름)
  var BANK_NAME = 'SC제일은행';                 // 은행 이름 (통장 사본 확인)
  var BANK_ACCOUNT = '504-20-454146';          // 계좌번호 (통장 사본 확인)
  var BANK_HOLDER = '김나영 (엔와이트레이드)';   // 예금주 (통장 사본 확인)

  /* ── 2027 정미년 대표 수호 부적 · 톡톡톡 리추얼 ────── */
  var STAMP_KEY = 'yoonise.timing.stamp.v1';
  /* 달력 칸에 착 붙는 '그날의 미니 오행 캐릭터 스티커'
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
  var BADGE_TO_EL = { '소통': '목', '입단속': '수', '결정': '화', '머니': '금', '리셋': '토' };
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
        { taps: ['오늘 말문 트는 중...', '눈치 보지 말고 슬쩍 던져 볼까?'],
          done: '✨ 말문 활짝! 오늘은 먼저 말 건넨 사람이 이기는 날!',
          sub: '먼저 보낸 카톡 한 줄이 오늘의 승부수.' },
        { taps: ['인연 필터 오늘만 꺼 두는 중...', '먼저 아는 척, 그게 오늘의 기술!'],
          done: '✨ 소통 순조! 오늘은 모르는 척보다 아는 척이 이득!',
          sub: '오늘 새로 인사한 한 명이 다음 달 기회.' },
        { taps: ['기회 문 두드리는 중, 쿵쿵...', '한 발만 더, 문 열리기 직전!'],
          done: '✨ 대화 문 열림! 오늘 안 물어본 건 다음 달에도 안 물어봐요!',
          sub: '물어보는 건 공짜, 안 물어보면 0%.' },
        { taps: ['말 한마디 고르는 중...', '이 타이밍, 그냥 가면 아깝다!'],
          done: '✨ 소통 만땅! 오늘은 고민 대신 연락 한 통!',
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
    stamps: {}, justStamped: null, pendingStamp: null,
    unlocked: false,      // 개인 전용 입장 코드로 잠금 해제됨(localStorage) — FREE_TRIAL_ENABLED 와 별개
    tier: '',             // '' | 'pass'(1년 패스) | 'allinone'(올인원 패키지) | 'diary'(성찰 에디션)
    code: null,           // 지금 이 기기에 넣어 둔 코드 { code, tier, ymd, gender }
    mismatch: null,       // 코드 주인과 지금 사주가 다를 때 { code, id } — 이때는 잠금 상태
    hintOff: false,       // 첫 부적 말풍선 힌트를 이 화면에서 접었는지 (한 번 누르거나 부적을 붙이면 끝)
    filter: 'all',        // all | bad | good — 달력의 '조심할 날만 / 좋은 날만' 보기
    yearDigest: null,     // 2027 한 해 요약(조심할 달·좋은 달). 사주가 바뀌면 다시 계산
    mDigest: {}           // 달별 주의 날·좋은 날 목록 캐시
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
        var codeOk = syncCodeBinding();      // 코드 주인과 다른 사주면 여기서 곧바로 다시 잠근다 (#9247)
        state.cache = {};
        state.yearDigest = null;
        state.mDigest = {};
        state.filter = 'all';
        state.sel = null;
        state.justStamped = null;
        for (var kd in ritual) if (Object.prototype.hasOwnProperty.call(ritual, kd)) delete ritual[kd];
        var today = new Date();
        state.todayISO = T.isoOf(today.getFullYear(), today.getMonth() + 1, today.getDate());
        state.view = clampView(today.getFullYear(), today.getMonth() + 1);
        $('#formCard').hidden = true;
        $('#result').hidden = false;
        document.body.classList.add('is-result');   // 달력이 열리면 히어로는 얇은 브랜드 줄로 접힌다
        render();
        payBackCheck();      // 결제하고 돌아온 기기라면 사주를 넣자마자 맨 위에 '카톡으로 코드 받기' 한 줄
        if (!codeOk && state.mismatch) {
          toast('🔒 이 코드는 ' + codeOwnerLabel(state.mismatch.code) + ' 전용이에요 — ' +
            (trialOver() ? '무료 체험도 끝나 지금은 잠겨 있어요' : '지금 사주로는 ' + FREE_DAYS + '일 무료 체험만 열려요'));
        }
        $('#result').scrollIntoView({ behavior: 'smooth', block: 'start' });
        maybeAutoGuide();     // 달력이 처음 열린 기기라면 사용법 팝업 한 번
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
    /* 코드로 열린 캘린더는 그 1명의 사주에 묶여 있다 — 다른 사람 사주를 넣는 길을 열지 않는다 (#9247) */
    if (state.unlocked) {
      var id = currentIdentity();
      toast('🔒 ' + (id ? id.label : '이') + ' 전용 캘린더예요 — 다른 사주는 새 코드가 필요해요');
      var b = $('#editBtn');
      if (b) { b.classList.remove('is-refuse'); void b.offsetWidth; b.classList.add('is-refuse'); }
      return;
    }
    document.body.classList.remove('is-result');
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
  /* ── 무료 체험 기간 — '오늘~모레'로 굴러가지 않고 첫 방문일에 못 박는다 ──────────
     달력이 처음 열린 날(첫 방문일)을 localStorage 에 남기고, 그 날부터 FREE_DAYS일만 무료.
     4일째부터는 오늘 날짜까지 전부 잠겨서, 눌러도 부적 대신 결제 안내가 나온다. */
  function trialStartISO() {
    if (!FREE_TRIAL_ENABLED || state.unlocked || !state.todayISO || !state.res) return '';
    if (trialStartMemo) return trialStartMemo;
    var v = '';
    try { v = localStorage.getItem(TRIAL_KEY) || ''; } catch (e) { v = ''; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      v = state.todayISO;                     // 달력을 처음 연 날 = 첫 방문일 (이미 있으면 그대로 둔다)
      try { localStorage.setItem(TRIAL_KEY, v); } catch (e) {}
    }
    trialStartMemo = v;
    return v;
  }
  /** 무료 구간 { start, end } — 기기 시계가 뒤로 가 첫 방문일이 미래로 보이면 오늘부터로 본다 */
  function trialWindow() {
    var start = trialStartISO();
    if (!start) return null;
    if (start > state.todayISO) start = state.todayISO;
    return { start: start, end: T.addDays(start, FREE_DAYS - 1) };
  }
  /** 무료 3일을 다 썼는가 — 코드를 넣지 않은 채 4일째가 되면 참 */
  function trialOver() {
    if (!FREE_TRIAL_ENABLED || state.unlocked) return false;
    var w = trialWindow();
    return !!w && state.todayISO > w.end;
  }
  /** 'M/D' 짧은 표기 */
  function mdOf(iso) {
    var p = String(iso).split('-');
    return parseInt(p[1], 10) + '/' + parseInt(p[2], 10);
  }
  /** index.html 의 무료 체험 문구(js-trial) / 전체 오픈 문구(js-open) / 체험 종료 문구(js-trial-over) 전환 */
  function syncTrialState() {
    var mode = (!FREE_TRIAL_ENABLED || state.unlocked) ? 'off' : (trialOver() ? 'over' : 'on');
    document.body.setAttribute('data-trial', mode);
    var strip = $('#calTrialOver');
    if (strip) strip.hidden = mode !== 'over';      // 달력 위 잠금 안내 한 줄
  }
  /** 친구 초대(?ref=)로 온 손님 — 화면에 박혀 있는 '3일' 문구도 5일로 바꾸고 웰컴 팝업에 보너스 한 줄을 붙인다 */
  function syncInviteCopy() {
    if (!invited) return;
    var nodes = $$('.js-trial, .js-trial-over, .cal__trialover-t, #guideTrialH, #guideTrialSub');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.innerHTML.indexOf(FREE_DAYS_BASE + '일') >= 0) {
        el.innerHTML = el.innerHTML.split(FREE_DAYS_BASE + '일').join(FREE_DAYS + '일');
      }
    }
    var wr = $('#welcomeInvite');
    if (wr) {
      wr.innerHTML = '🎁 친구 초대 링크로 오셨어요 · <b>' + FREE_DAYS + '일</b> 무료 + 액운 태우기 <b>' +
        INVITE_BURN_BONUS + '회</b> 더';
      wr.hidden = false;
    }
  }
  /** 잠금 판정 — 입장 코드로 열었거나 무료 체험을 끈 동안에는 달력 범위 전체가 열린다. */
  function inFree(iso) {
    if (state.unlocked) return iso >= RANGE_FROM && iso <= RANGE_TO;
    if (!FREE_TRIAL_ENABLED) return iso >= RANGE_FROM && iso <= RANGE_TO;
    var w = trialWindow();
    return !!w && iso >= w.start && iso <= w.end;
  }
  /** 무료 체험이 켜져 있을 때만 '지난 날'은 눌리지 않는다. (입장 코드를 넣으면 지난 날도 열린다)
      무료 3일을 다 쓴 뒤에는 오늘도 포함해 전부 잠긴다. */
  function isOpenDay(iso) {
    if (state.unlocked) return true;
    if (!FREE_TRIAL_ENABLED) return true;
    if (trialOver()) return false;
    return iso >= state.todayISO;
  }
  function infoFor(iso) {
    if (!state.natal) return null;
    if (state.cache[iso]) return state.cache[iso];
    var info = T.dayInfo(iso, state.natal, state.terms);
    state.cache[iso] = info;
    return info;
  }

  /* ── 2027 한눈에 — 조심할 달 · 치고 나갈 달 ────────────────
     12개월을 넘겨 보지 않아도 '어느 달을 조심하고 어느 달을 밟아야 하는지'가 먼저 보이게. */
  function digestOpt() {
    return { counts: state.res ? state.res.counts : null, info: infoFor };
  }
  function yearInfo() {
    if (!state.natal) return null;
    if (!state.yearDigest) {
      state.yearDigest = T.yearDigest(2027, state.natal, state.terms, digestOpt());
      state.yearDigest.months.forEach(function (mm) {
        state.mDigest[mm.y + '-' + mm.m] = mm;      // 달을 넘길 때 다시 계산하지 않게
      });
    }
    return state.yearDigest;
  }
  function monthInfo(y, mm) {
    var k = y + '-' + mm;
    if (state.mDigest[k]) return state.mDigest[k];
    var d = T.monthDigest(y, mm, state.natal, state.terms, digestOpt());
    state.mDigest[k] = d;
    return d;
  }

  function renderYearSummary() {
    var box = $('#yearAlertSummary');
    if (!box) return;
    if (!state.res) { box.hidden = true; return; }
    var d = yearInfo();
    if (!d) { box.hidden = true; return; }
    box.hidden = false;

    /* 무료 체험 중에는 '몇 월을 조심하라'는 결론을 캡처해 가는 사람이 있다(#9098).
       3일 체험 + 코드 미입력 상태에서는 개수만 보이고, 카드 안의 월 이름은 가린다. */
    var locked = FREE_TRIAL_ENABLED && !state.unlocked;
    box.classList.toggle('yearfold--locked', locked);

    /* 무료 체험 잠금 맛보기 — 핵심(1·2순위) 조심할 달은 잠그고, 3순위 딱 한 달만 선명하게 보여 준다.
       전부 모자이크하면 "내 사주에 뭐가 잡혔는지" 감이 안 와서 결제로 이어지지 않는다(2026-11-20 김나영 님 결정 #9172). */
    var teaserIdx = -1;
    if (locked && d.warn.length >= 2) teaserIdx = d.warn.length - 1;          // 가장 약한 조심할 달 1달
    else if (locked && d.warn.length === 1 && d.good.length >= 1) teaserIdx = 0; // 잠글 카드가 따로 있을 때만
    var teaserCount = teaserIdx >= 0 ? 1 : 0;

    /* 일수 카운트는 쓰지 않는다 — 조심할 날이 많아 보이면 오히려 기가 빠진다는 피드백(2026-11-20).
       '어느 달을 조심하고 어느 달을 밝을지'만 남긴다. */
    var firstWarn = d.warn[0] ? d.warn[0].m + '월' : '';
    var firstGood = d.good[0] ? d.good[0].m + '월' : '';
    $('#yearLead').innerHTML = locked
      ? (teaserCount
        ? '2027년에 가장 조심해야 할 달 <b class="y-bad">' + d.warn.length + '달</b>, 치고 나갈 달 <b class="y-good">' +
          d.good.length + '달</b>이 잡혔어요. 그중 <b class="y-bad">' + teaserCount + '달만</b> 먼저 열어 드렸어요.' +
          '<span class="year__lead-lock">🔒 나머지 ' + (d.warn.length + d.good.length - teaserCount) + '달은 1년 패스부터 확인</span>'
        : '2027년에 가장 조심해야 할 달 <b class="y-bad">' + d.warn.length + '달</b>, 치고 나갈 달 <b class="y-good">' +
          d.good.length + '달</b>이 잡혔어요. <span class="year__lead-lock">🔒 몇 월인지는 1년 패스부터 보여 드려요</span>')
      : (firstWarn && firstGood
        ? '2027년에 가장 조심해야 할 달은 <b class="y-bad">' + firstWarn + '</b>, 치고 나가기 좋은 달은 <b class="y-good">' + firstGood + '</b>이에요.'
        : (firstWarn
          ? '2027년에 가장 조심해야 할 달은 <b class="y-bad">' + firstWarn + '</b>이에요.'
          : (firstGood
            ? '2027년에 치고 나가기 좋은 달은 <b class="y-good">' + firstGood + '</b>이에요.'
            : '2027년은 어느 달도 유난히 치우치지 않고 고르게 열려 있어요.')));

    /* 달 칩은 읽기만 하는 표시 — 누를 수 있는 것처럼 보이지 않게 정적 div로 둔다.
       (예전에는 누르면 그 달로 달력이 점프해서, 보던 이번 달을 다시 손으로 찾아야 했다는 피드백 2026-11-20) */
    function chip(m, isBad, teaser) {
      var ln1 = isBad ? m.warn : m.good;
      var inner = '<span class="ychip__no">' + m.m + '월</span>' +
        '<span class="ychip__body">' +
        '<span class="ychip__title">' + esc(ln1.title) + '</span>' +
        '<span class="ychip__why">' + esc(ln1.why) + '</span>' +
        '</span>';
      if (!locked) {
        return '<div class="ychip ychip--' + (isBad ? 'warn' : 'good') + '">' + inner + '</div>';
      }
      if (teaser) {
        return '<div class="ychip ychip--' + (isBad ? 'warn' : 'good') + ' ychip--teaser">' + inner +
          '<span class="ychip__preview">맛보기</span></div>';
      }
      /* 잠금 카드 — 내용은 블러, 위에 잠금 버튼. 카드 아무 데나 눌러도 앱 안 결제 안내 팝업(1년 패스) */
      return '<div class="ychip ychip--' + (isBad ? 'warn' : 'good') + ' ychip--locked" data-shop="pass">' +
        '<div class="ychip__inner" aria-hidden="true">' + inner + '</div>' +
        '<button type="button" class="ychip__lock" data-shop="pass" ' +
        'aria-label="1년 패스로 ' + (isBad ? '조심할 달' : '좋은 달') + '이 몇 월인지 확인하기">' +
        '🔒 1년 패스(14,900원) 열고 확인</button>' +
        '</div>';
    }

    $('#yearWarnChips').innerHTML = d.warn.length
      ? d.warn.map(function (m, i) { return chip(m, true, i === teaserIdx); }).join('')
      : '<p class="year__none">2027년에는 유난히 부딪히는 달이 없어요. 흐름이 고른 한 해입니다.</p>';
    var meta = $('#yearMeta');
    if (meta) {
      if (locked) {
        meta.textContent = '조심 ' + d.warn.length + '달 · 좋은 ' + d.good.length + '달' +
          (teaserCount ? ' · 1달 맛보기' : '') + ' 🔒';
      } else {
        var wm = d.warn.map(function (m) { return m.m + '월'; }).join('·');
        var gm = d.good.map(function (m) { return m.m + '월'; }).join('·');
        meta.textContent = (wm ? '조심 ' + wm : '') + (wm && gm ? ' · ' : '') + (gm ? '좋은 ' + gm : '');
      }
    }

    var yInvite = $('#yearInvite');
    if (yInvite) yInvite.hidden = !locked;

    $('#yearGoodChips').innerHTML = d.good.length
      ? d.good.map(function (m) { return chip(m, false, false); }).join('')
      : '<p class="year__none">좋은 달이 따로 없이 고르게 열려 있어요.</p>';
  }

  function setFilter(f) {
    if (['all', 'bad', 'good'].indexOf(f) < 0) return;
    if (state.filter === f) return;
    state.filter = f;
    renderCalendar();
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

  /* ── 개인 코드 서명 — 발급기와 똑같은 계산 ───────────────────────── */
  function fnv1a(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }
  /** 서명 5자 — 상품 등급 · 생년월일(YYMMDD) · 성별 + 비밀 SALT (예전 18자리 코드용) */
  function codeSign(letter, ymd, gender) {
    var base = CODE_SALT + '|' + letter + '|' + ymd + '|' + gender;
    var h1 = fnv1a(base), h2 = fnv1a(base + '#2');
    var n = h1 % 28629151;          // 31^5 — 다섯 자리에 담을 수 있는 경우의 수
    var out = '';
    for (var i = 0; i < 5; i++) {
      out += CODE_ALPHA.charAt((n % 31 + ((h2 >>> (i * 3)) & 31)) % 31);
      n = Math.floor(n / 31);
    }
    return out;
  }
  /** 32비트 마무리 섞기 — 숫자 5자리 서명이 고르게 퍼지도록 */
  function mix32(h) {
    h = h >>> 0;
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return h >>> 0;
  }
  /** 6자리 간단 코드의 숫자 5자리 — 결제하신 휴대폰 번호(숫자만) + 상품 + SALT. 10000~99999 */
  function codeDigits(letter, phone) {
    var base = CODE_SALT + '|p|' + letter + '|' + phone;
    return String(10000 + mix32(fnv1a(base) ^ fnv1a(base + '#pd')) % 90000);
  }
  /** 예전(2026-11-21 이전) 사주 기반 6자리의 숫자 5자리 — 테스트로 발급한 코드를 계속 열기 위한 호환 계산.
      지금은 쓰지 않지만 지우면 그때 코드가 잠긴다. */
  function codeDigitsSaju(letter, ymd, gender) {
    var base = CODE_SALT + '|6|' + letter + '|' + ymd + '|' + gender;
    return String(10000 + mix32(fnv1a(base) ^ fnv1a(base + '#6d')) % 90000);
  }
  function formatCode(letter, ymd, gender, sign) {
    return 'YS-' + letter + '-' + ymd + gender + '-' + sign;
  }
  /** 코드 문자열 → { status, ... } · status 로 무엇이 잘못됐는지 구분한다
     ok        번호(또는 예전 사주)와 코드가 맞음 → 열 수 있다
     empty     아무것도 안 넣음
     format    6자리도 예전 18자리도 아닌 모양
     bad       예전 18자리 모양이지만 서명이 틀림
     needphone 6자리 코드인데 휴대폰 번호를 안 넣음 (번호 + 코드가 한 쌍)
     mismatch  6자리 코드인데 그 번호로 계산한 숫자와 다름 (다른 번호이거나 잘못 옮긴 코드)
     ※ ctx = { phone, ymd, gender } — phone 은 결제하신 휴대폰 번호(숫자만),
        ymd·gender 는 예전 사주 기반 코드를 계속 열기 위한 지금 사주 값 */
  function parseCode(v, ctx) {
    ctx = ctx || {};
    var n = normCode(v);
    if (!n) return { status: 'empty' };
    var legacy = /^YS([PAD])(\d{6})([MF])([2-9A-Z]{5})$/.exec(n);
    if (legacy) {
      if (codeSign(legacy[1], legacy[2], legacy[3]) !== legacy[4]) return { status: 'bad' };
      return {
        status: 'ok', legacy: true,
        code: formatCode(legacy[1], legacy[2], legacy[3], legacy[4]),
        tier: CODE_TIER_OF_LETTER[legacy[1]], letter: legacy[1],
        ymd: legacy[2], gender: legacy[3]
      };
    }
    var simple = /^([PAD])(\d{5})$/.exec(n);
    if (!simple) return { status: 'format' };
    var letter = simple[1];
    var phone = ctx.phone || '';
    if (phone) {
      if (codeDigits(letter, phone) === simple[2]) {
        return {
          status: 'ok', legacy: false,
          code: letter + simple[2], tier: CODE_TIER_OF_LETTER[letter], letter: letter,
          phone: phone
        };
      }
      /* 예전 사주 기반 6자리 — 그때 사주와 지금 사주가 같으면 계속 열어 준다 */
      if (ctx.ymd && codeDigitsSaju(letter, ctx.ymd, ctx.gender) === simple[2]) {
        return {
          status: 'ok', legacy: false,
          code: letter + simple[2], tier: CODE_TIER_OF_LETTER[letter], letter: letter,
          ymd: ctx.ymd, gender: ctx.gender
        };
      }
      return { status: 'mismatch', letter: letter, phone: phone };
    }
    if (!ctx.ymd) return { status: 'needphone', letter: letter };
    if (codeDigitsSaju(letter, ctx.ymd, ctx.gender) === simple[2]) {
      return {
        status: 'ok', legacy: false,
        code: letter + simple[2], tier: CODE_TIER_OF_LETTER[letter], letter: letter,
        ymd: ctx.ymd, gender: ctx.gender
      };
    }
    return { status: 'mismatch', letter: letter };
  }
  /** 코드가 맞지 않을 때 — 무엇이 문제인지에 맞춰 한 줄로 알려 준다 */
  function codeErrorText(p) {
    if (p.status === 'needphone') return '결제하신 휴대폰 번호도 함께 넣어 주세요 — 번호와 6자리 코드가 맞아야 열려요.';
    if (p.status === 'mismatch') {
      return p.phone
        ? '번호와 코드가 맞지 않아요. 결제하실 때 넣은 번호와 카톡으로 받은 6자리를 다시 확인해 주세요.'
        : '코드가 지금 사주(' + (p.id ? p.id.label : '') + ')와 맞지 않아요. 코드를 받으신 분의 생년월일·성별을 그대로 넣어야 열려요.';
    }
    if (p.status === 'format') return '6자리 코드를 넣어 주세요 — 카톡으로 받은 코드를 그대로 넣으면 돼요. (예: A73914)';
    if (p.status === 'empty') return '카톡으로 받은 입장 코드를 넣어 주세요. (예: A73914)';
    return '코드가 맞지 않아요. 카톡으로 받은 코드를 다시 확인해 주세요.';
  }
  function pad2(v) { var n = Number(v) || 0; return (n < 10 ? '0' : '') + n; }
  /** 지금 넣어 둔 사주를 코드와 맞춰 볼 열쇠 — 양력 생년월일(YYMMDD) + 성별 */
  function currentIdentity() {
    var r = state.res;
    if (!r || !r.solar) return null;
    var s = r.solar;
    var g = (r.input && r.input.gender === 'M') ? 'M' : 'F';
    return {
      ymd: String(s.y).slice(-2) + pad2(s.m) + pad2(s.d),
      gender: g,
      label: s.y + '.' + pad2(s.m) + '.' + pad2(s.d) + ' (' + (g === 'M' ? '남' : '여') + ')'
    };
  }
  /** 코드 주인 표기 — 번호 기반이면 '010-****-5678', 예전 사주 기반이면 '1979년 10월 25일 · 여성' */
  function codeOwnerLabel(code) {
    if (code && code.phone) return maskPhone(code.phone);
    if (!code || !code.ymd) return '이 코드의 주인';
    var yy = Number(code.ymd.slice(0, 2)), mm = Number(code.ymd.slice(2, 4)), dd = Number(code.ymd.slice(4, 6));
    var thisYY = new Date().getFullYear() % 100;
    var year = yy <= thisYY ? 2000 + yy : 1900 + yy;
    return year + '년 ' + mm + '월 ' + dd + '일 · ' + (code.gender === 'M' ? '남성' : '여성');
  }
  /** 이 코드로 무엇이 열렸는지 — '010-****-5678 번호' / '1979년 10월 25일 · 여성 사주' / '이 기기' */
  function unlockTargetLabel(code) {
    if (!code) return '이 기기';
    if (code.phone) return maskPhone(code.phone) + ' 번호';
    if (code.ymd) return codeOwnerLabel(code) + ' 사주';
    return '이 기기';
  }
  /** '01012345678' → '010-****-5678' (화면·안내에 번호를 그대로 다 적지 않는다) */
  function maskPhone(d) {
    var f = fmtPhone(String(d || '').replace(/\D/g, ''));
    return f.replace(/^(\d{3})-(\d{3,4})-(\d{4})$/, function (_, a, b, c) {
      return a + '-' + new Array(b.length + 1).join('*') + '-' + c;
    });
  }

  /* ── 입장 코드 잠금 해제 ─────────────────────────────────────
     결제 후 카톡으로 받은 6자리 코드 + 결제하신 휴대폰 번호를 넣으면 2026-11 ~ 2027-12 전체가 열린다.
     지금은 번호 기반(2026-11-21~)이라 사주와 묶지 않고 이 기기에 저장한다.
     예전에 저장된 사주 기반 코드(v2: ymd·gender)는 그 사주에만 계속 묶어 둔다. */
  function loadUnlock() {
    state.code = null; state.tier = ''; state.unlocked = false; state.mismatch = null;
    var raw = '', old = '';
    try { raw = localStorage.getItem(UNLOCK_KEY) || ''; old = localStorage.getItem(LEGACY_UNLOCK_KEY) || ''; } catch (e) { raw = ''; old = ''; }
    var o = null;
    try { o = raw ? JSON.parse(raw) : null; } catch (e) { o = null; }
    if (o && TIER_NAME[o.tier] && (o.code || o.ymd || o.phone)) {
      state.code = { code: o.code || '', tier: o.tier, ymd: o.ymd || '', gender: o.gender || '', phone: o.phone || '' };
      state.tier = o.tier;
      state.unlocked = true;
      return;
    }
    /* 예전 공용 코드(YOON2027 등)로 열어 둔 기기 — 그때 저장된 사주 1명에게만 묶어 이어 준다. */
    var legacy = old === '1' ? 'pass' : (TIER_NAME[old] ? old : '');
    if (legacy) {
      state.code = { code: '', tier: legacy, ymd: '', gender: '', legacy: true };
      state.tier = legacy;
      state.unlocked = true;
    }
  }
  /** 코드 저장 — o 가 없으면 잠금. { code, tier, phone, ymd, gender } */
  function saveUnlock(o) {
    var tier = o && TIER_NAME[o.tier] ? o.tier : '';
    state.tier = tier;
    state.code = tier ? {
      code: o.code || '', tier: tier, phone: o.phone || '',
      ymd: o.ymd || '', gender: o.gender || '', legacy: !!o.legacy
    } : null;
    state.unlocked = !!tier;
    try {
      if (tier) {
        localStorage.setItem(UNLOCK_KEY, JSON.stringify({
          v: 3, code: o.code || '', tier: tier, phone: o.phone || '',
          ymd: o.ymd || '', gender: o.gender || '',
          at: new Date().toISOString()
        }));
      } else {
        localStorage.removeItem(UNLOCK_KEY);
      }
      if (tier) localStorage.removeItem(LEGACY_UNLOCK_KEY);
    } catch (e) {}
  }
  /** 코드가 지금 이 기기에서 살아 있는지 확인 —
     번호 기반 코드는 이 기기에 그대로 열려 있고(사주와 무관),
     예전 사주 기반 코드는 그 사주를 넣었을 때만 열린다. */
  function syncCodeBinding() {
    state.mismatch = null;
    if (!state.tier || !state.code) { state.unlocked = false; return false; }
    if (state.code.phone) { state.unlocked = true; return true; }
    var id = currentIdentity();
    if (!state.code.ymd) {                     // 예전 고정 코드 — 지금 사주 1명에게 묶는다
      if (!id) { state.unlocked = false; return false; }
      saveUnlock({ code: state.code.code, tier: state.tier, ymd: id.ymd, gender: id.gender });
      return true;
    }
    if (!id) { state.unlocked = false; return false; }
    if (id.ymd !== state.code.ymd || id.gender !== state.code.gender) {
      state.unlocked = false;
      state.mismatch = { code: state.code, id: id };
      return false;
    }
    state.unlocked = true;
    return true;
  }
  /** 코드 비교 — 대소문자·띄어쓰기·하이픈은 버리고 비교한다 */
  function normCode(s) { return String(s == null ? '' : s).replace(/[\s\-_]/g, '').toUpperCase(); }
  /** 이 기기에 적용된 티어가 t 이상인가 (pass < allinone < diary) */
  /** 이 기기에 코드가 살아 있는가 — 코드 주인과 지금 사주가 같을 때만 '열림' */
  function tierAtLeast(t) { return !!state.unlocked && (TIER_RANK[state.tier] || 0) >= (TIER_RANK[t] || 99); }

  /* ══ Supabase 등급 연동 (2026-11-22) ══════════════════════════════════
     목적: 달력에서 코드를 열면 회원 DB(profiles.paid_tier)에도 그 상품을 적어 두어,
           다른 브라우저로 /calendar/member/ 를 열어도 결제자용 사다리가 뜨게 한다.
     원칙:
       · 로그인한 적이 없는 손님(로컬에 세션 없음)은 스크립트도 받지 않고 조용히 넘어간다.
       · 네트워크·권한·표가 없어 실패해도 화면은 localStorage 만으로 그대로 돌아간다.
       · paid_tier 는 어디까지나 '표시용 등급'이다 — 달력 잠금 해제는 지금처럼 6자리 코드가 판단한다.
         (RLS 가 본인 update 를 허용하므로, 이 값만으로 유료 기능을 열면 결제 우회가 된다) */
  var SB_URL = 'https://fifynkkaeqcjlovesuop.supabase.co';
  var SB_KEY = 'sb_publishable_JzSUlMOH9s38aer6y1BVEg_rHcQLGxF';   // publishable — 공개 전제 키
  var sbLib = null, sbClient = null, sbLoading = false, sbWaiters = [];

  /** 이 도메인에 Supabase 로그인 세션이 남아 있는가 (member 화면에서 카카오 로그인한 적) */
  function hasSbSession() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (/^sb-.*-auth-token$/.test(k)) {
          var v = localStorage.getItem(k) || '';
          if (v && v.length > 20) return true;
        }
      }
    } catch (e) {}
    return false;
  }

  /** supabase-js 는 필요할 때만 한 번 받는다 (로그인한 손님만 — 본문 무게에 영향 없게) */
  function loadSbLib(cb) {
    if (sbLib) { cb(sbLib); return; }
    sbWaiters.push(cb);
    if (sbLoading) return;
    sbLoading = true;
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    s.async = true;
    s.onload = function () {
      sbLib = window.supabase || null;
      sbLoading = false;
      var q = sbWaiters; sbWaiters = [];
      q.forEach(function (f) { try { f(sbLib); } catch (e) {} });
    };
    s.onerror = function () {
      sbLoading = false;
      var q = sbWaiters; sbWaiters = [];
      q.forEach(function (f) { try { f(null); } catch (e) {} });
    };
    document.head.appendChild(s);
  }

  /** 코드 해제 값을 회원 DB 에도 적어 둔다 — 실패하면 아무 일도 없다 */
  function syncPaidTier(tier) {
    if (!tier || !TIER_NAME[tier]) return;
    if (!hasSbSession()) return;
    loadSbLib(function (lib) {
      if (!lib || !lib.createClient) return;
      try {
        if (!sbClient) {
          sbClient = lib.createClient(SB_URL, SB_KEY, {
            auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
          });
        }
        sbClient.auth.getSession().then(function (r) {
          var u = r && r.data && r.data.session && r.data.session.user;
          if (!u) return;                 // 로그인 세션이 없으면 조용히
          sbClient.from('profiles')
            .update({ paid_tier: tier, paid_updated_at: new Date().toISOString() })
            .eq('id', u.id)
            .then(function () {}, function () {});
        }, function () {});
      } catch (e) {}
    });
  }

  /* ══ ✨ 365일 1줄 성찰 다이어리 ═══════════════════════════════════════
     · 날짜마다 다른 질문 — 5가지 기운(소통·입단속·결정·머니·리셋)별 10개, 모두 50개.
       기운 배지가 없는 잔잔한 날은 날짜 순서로 다섯 결을 돌아가며 물어본다(365일 모두 질문이 있다).
     · 같은 날짜는 언제 열어도 같은 질문 — 날짜 숫자(ordinal)로만 고른다.
     · 저장은 이 기기(브라우저)에만. 서버로 보내지 않는다. 키: yoonise.timing.diary.v1
     · 정적 웹이라 브라우저 기록을 지우면 사라지므로 '📖 내 성찰 기록 보기'에서 .txt 백업을 둔다. */
  var DIARY_KEY = 'yoonise.timing.diary.v1';
  var DIARY_MAX = 120;
  /* 무료 체험 손님도 1줄 성찰 다이어리를 **3회**까지 써 볼 수 있다 (2026-11-21 김나영 님 확정).
     3회를 다 쓰면 성찰 에디션 안내로 바뀌고, 이미 쓴 기록은 계속 열어 볼 수 있다. */
  var DIARY_TRY_KEY = 'yoonise.timing.diary.try.v1';
  var DIARY_FREE_TRIES = 3;
  var DIARY_CATS = ['소통', '입단속', '결정', '머니', '리셋'];
  var DIARY_CAT_CLASS = { '소통': 'gold', '럭키': 'gold', '입단속': 'red', '결정': 'blue', '머니': 'blue', '리셋': 'gray' };
  var DIARY_Q = {
    '소통': [
      '오늘 누군가에게 먼저 건넨 말 중, 가장 따뜻했던 한마디는?',
      '오늘 대화에서 내 말이 잘 통했다고 느낀 순간은 언제였나요?',
      '오늘 나를 웃게 한 사람은 누구였고, 그 사람에게 뭐라고 말해 주고 싶나요?',
      '칭찬을 들었을 때 나는 뭐라고 대답했나요? 다음엔 이렇게 말해 보고 싶어요.',
      '부탁을 해야 했는데 망설인 일이 있나요? 다음번엔 이렇게 꺼내 볼래요.',
      '붙잡고 싶은 인연 하나, 이번 주에 먼저 보낼 한마디는?',
      '오늘 도움을 받은 일 하나, 고맙다는 말은 전했나요?',
      '오늘의 나를 축하해 줄 사람에게 들려주고 싶은 이야기는?',
      '어색했던 대화 하나를 골라, 다음엔 이렇게 말해 볼 수 있겠다 싶은 문장은?',
      '오늘 편하게 이야기 나눈 사람은 누구였고, 그 사람과 나는 어떤 사이인가요?'
    ],
    '입단속': [
      '오늘 삼킨 말 중, 내일 다시 꺼낸다면 어떤 말투로 말하겠나요?',
      '답장하기 전에 잠깐 멈춘 순간, 그 몇 초 동안 무슨 생각이 들었나요?',
      '오늘 서운했던 일, 상대 입장에서 한 줄로 적어 본다면?',
      '지금 가장 보내고 싶지 않은 카톡은 무엇이고, 왜인가요?',
      '“네 말이 맞아”라고 먼저 말할 수 있었던 순간이 있었나요?',
      '오늘 화가 난 이유를 “사실은 ~이 서운해서”로 다시 써 보세요.',
      '기분이 상했을 때 내 몸은 어디가 먼저 아팠나요?',
      '오늘 참은 말 한마디, 내일 아침에도 여전히 하고 싶은가요?',
      '누군가와 부딪힌 뒤, 내가 지키고 싶었던 것은 무엇이었나요?',
      '오늘의 감정을 날씨에 비유하면? 그 날씨에 우산을 하나 준다면 어떤 우산인가요?'
    ],
    '결정': [
      '오늘 미뤄 둔 결정 하나, 작은 버전으로라면 무엇부터 할 수 있나요?',
      '지금 정해야 할 일을 “하기 / 안 하기” 둘로만 적는다면?',
      '이번 주에 꼭 끝내고 싶은 일 하나는 무엇인가요?',
      '결정을 못 내리는 이유는 정보가 부족해서인가요, 두려워서인가요?',
      '3년 뒤의 내가 오늘의 이 결정을 본다면 뭐라고 할까요?',
      '오늘 정리한 것 중, 내일도 그대로 두고 싶은 것은?',
      '“일단 보류”도 결정이라면, 오늘 무엇을 보류할까요?',
      '오늘의 결정에서 내가 가장 아끼는 가치는 무엇인가요?',
      '누군가에게 물어보고 싶은 결정 하나, 그 질문을 한 줄로 적어 보세요.',
      '결정을 내린 뒤, 나에게 해 주고 싶은 한마디는?'
    ],
    '머니': [
      '오늘 쓴 돈 중, 하나도 아깝지 않았던 지출은?',
      '오늘 들어온 돈(또는 들어올 돈)의 쓸 곳을 한 줄로 정해 보세요.',
      '이번 달에 줄이고 싶은 지출 하나는 무엇인가요?',
      '받을 돈이 있다면, 오늘 한 줄로 물어볼 수 있는 문장을 적어 보세요.',
      '돈 걱정이 올라올 때, 나를 안심시키는 한마디는?',
      '오늘 산 것 중 한 달 뒤에도 고마울 것 하나는?',
      '내가 돈을 쓸 때 가장 편안한 순간은 언제인가요?',
      '저축하고 싶은 이유를 “누구를 위해서”로 한 줄 적어 보세요.',
      '오늘의 지출을 세 단어로 요약한다면? (예: 필요·기분·사람)',
      '다음 달의 나에게 써 주고 싶은 돈 한 가지는?'
    ],
    '리셋': [
      '이번 달에 내려놓고 싶은 습관 하나는?',
      '새로 시작하고 싶은 일 하나, 첫 10분은 무엇인가요?',
      '지난달의 나에게 고맙다고 말한다면, 어떤 일 때문에인가요?',
      '이번 달의 나를 한 단어로 정한다면?',
      '지금 정리하고 싶은 공간 하나는 어디인가요?',
      '이번 달에 꼭 비워 둘 하루는 언제인가요?',
      '새 마음으로 정리하고 싶은 약속 하나는?',
      '이번 달 나를 지켜 줄 한 가지 규칙은?',
      '지난달에 배운 것 중, 이번 달에도 들고 갈 것은?',
      '이번 달 마지막 날의 나에게 미리 한 줄 남긴다면?'
    ]
  };
  var diary = { entries: {} };
  var diaryTry = { used: 0 };     // 무료 체험으로 남긴 횟수 (성찰 에디션은 세지 않는다)

  /** 성찰 에디션(또는 테스트 모드) — 다이어리를 제한 없이 쓴다 */
  function diaryTierOpen() {
    if (!FREE_TRIAL_ENABLED) return true;
    return tierAtLeast('diary');
  }
  /** 3회 무료 체험 대상 — 코드 없이 무료 체험 중인 손님만 (1년 패스·올인원은 성찰 에디션에서) */
  function diaryTryEligible() {
    return FREE_TRIAL_ENABLED && !diaryTierOpen() && !state.unlocked;
  }
  /** 무료로 남은 성찰 횟수 — 유료면 의미 없음(3으로 표시) */
  function diaryTryLeft() {
    if (diaryTierOpen()) return DIARY_FREE_TRIES;
    if (!diaryTryEligible()) return 0;
    return Math.max(0, DIARY_FREE_TRIES - diaryTry.used);
  }
  /** 성찰 섹션을 열지 — 무료 3회가 남았거나, 이미 쓴 기록이 있으면(보기) 연다 */
  function diaryAllowed() {
    if (diaryTierOpen()) return true;
    return diaryTryLeft() > 0 || diaryCount() > 0;
  }
  function loadDiary() {
    var o = null, t = null;
    try { o = JSON.parse(localStorage.getItem(DIARY_KEY)); } catch (e) { o = null; }
    try { t = JSON.parse(localStorage.getItem(DIARY_TRY_KEY)); } catch (e) { t = null; }
    diary.entries = (o && o.entries && typeof o.entries === 'object') ? o.entries : {};
    diaryTry.used = (t && typeof t.used === 'number' && t.used >= 0) ? Math.min(DIARY_FREE_TRIES, t.used) : 0;
  }
  function saveDiaryTry() {
    try { localStorage.setItem(DIARY_TRY_KEY, JSON.stringify({ v: 1, used: diaryTry.used })); } catch (e) {}
  }
  function saveDiary() {
    try { localStorage.setItem(DIARY_KEY, JSON.stringify({ v: 1, entries: diary.entries })); } catch (e) {}
  }
  function diaryOf(iso) { return diary.entries[iso] || null; }
  function diaryCount() {
    var n = 0;
    for (var k in diary.entries) if (Object.prototype.hasOwnProperty.call(diary.entries, k)) n++;
    return n;
  }
  /** 날짜 → 며칠째인지(1970-01-01 기준 일수) — 같은 날짜는 항상 같은 질문이 되게 하는 숫자 */
  function diaryOrd(iso) {
    var p = T.parseISO(iso);
    return Math.floor(Date.UTC(p.y, p.m - 1, p.d) / 86400000);
  }
  /** 그날의 결 — 배지가 있으면 그 기운, 잔잔한 날은 날짜 순서로 다섯 결을 돌아가며 */
  function diaryCatFor(iso, info) {
    var bs = (info && info.badges) || [];
    for (var i = 0; i < bs.length; i++) if (DIARY_Q[bs[i].text]) return bs[i].text;
    return DIARY_CATS[Math.abs(diaryOrd(iso)) % DIARY_CATS.length];
  }
  function diaryAsk(iso, info) {
    var cat = diaryCatFor(iso, info);
    var pool = DIARY_Q[cat];
    var idx = Math.abs(diaryOrd(iso) * 3 + cat.length) % pool.length;
    return { cat: cat, q: pool[idx] };
  }
  function diaryStampOf(iso) {
    var rec = diaryOf(iso);
    if (!rec || !rec.at) return '';
    var d = new Date(rec.at);
    if (isNaN(d.getTime())) return '';
    return (d.getMonth() + 1) + '.' + d.getDate();
  }
  function diaryDotHTML() {
    return '<span class="day__pen" aria-hidden="true"></span>';
  }

  /** 날짜 팝업 안 성찰 섹션 — 부적 톡톡톡 완료 영역 아래
      무료 손님: 3회까지 쓸 수 있고, 다 쓰면 성찰 에디션 안내로 바뀐다. */
  function diarySectionHTML(info) {
    if (!diaryAllowed()) {
      var out = diaryTryEligible() && diaryTry.used >= DIARY_FREE_TRIES;
      return '<section class="diary diary--locked" aria-label="365일 1줄 성찰 다이어리">' +
        '<p class="diary__eyebrow">✨ 365일 1줄 성찰 다이어리</p>' +
        '<p class="diary__q">' + (out
          ? '무료 <b>3회</b>를 다 썼어요. 매일 다른 질문 한 줄이 1년 쌓이면 내 기록이 돼요.'
          : '매일 다른 질문 한 줄이, 1년이 쌓이면 내 기록이 돼요.') + '</p>' +
        (out ? '<p class="diary__try-note">성찰 에디션에서 <b>365일 내내</b> 이어서 쓸 수 있어요 · 오늘까지 남긴 기록은 그대로 남아 있어요.</p>' : '') +
        '<button type="button" class="diary__unlock" data-shop="diary">✨ 성찰 에디션 24,900원에서 ' +
        (out ? '계속 쓰기' : '열기') + '</button>' +
        '</section>';
    }
    return '<section class="diary" data-diary="' + info.iso + '" aria-labelledby="diaryTitle">' +
      '<div class="diary__head">' +
      '<p class="diary__eyebrow" id="diaryTitle">✨ 오늘의 1줄 성찰</p>' +
      '<span class="diary__day">365일 다이어리</span>' +
      '</div>' +
      '<div class="diary__body" data-diary-body>' + diaryBodyHTML(info) + '</div>' +
      '</section>';
  }
  function diaryBodyHTML(info, draft) {
    var ask = diaryAsk(info.iso, info);
    var rec = diaryOf(info.iso);
    var editing = typeof draft === 'string';
    var hasBadge = !!((info.badges || []).length);
    var cat = (rec && !editing) ? (rec.cat || ask.cat) : ask.cat;
    var q = (rec && !editing && rec.q) ? rec.q : ask.q;
    var plainDay = (rec && !editing) ? !!rec.plain : !hasBadge;
    var tryStrip = !diaryTryEligible() ? '' :
      '<p class="diary__try">✨ 1줄 성찰 다이어리 <b>3회 무료 체험</b> · 남은 <b>' + diaryTryLeft() + '회</b>' +
      (diaryTryLeft() > 0 ? '' : ' — 성찰 에디션에서 계속 쓸 수 있어요') + '</p>';
    var head = tryStrip +
      '<div class="diary__meta">' +
      (plainDay
        ? '<span class="badge badge--gray">잔잔한 날</span><span class="diary__tag">오늘의 결</span>'
        : '<span class="badge badge--' + (DIARY_CAT_CLASS[cat] || 'gray') + '">' + esc(cat) + '</span><span class="diary__tag">그날의 결</span>') +
      '</div>' +
      '<p class="diary__q">' + esc(q) + '</p>';

    if (rec && !editing) {
      return head +
        '<div class="diary__saved">' +
        '<p class="diary__saved-label"><span aria-hidden="true">✍️</span> 내가 남긴 한 줄</p>' +
        '<p class="diary__saved-text">' + esc(rec.text) + '</p>' +
        '<div class="diary__saved-row">' +
        '<span class="diary__saved-at">' + (diaryStampOf(info.iso) ? diaryStampOf(info.iso) + ' 기록' : '기록됨') + ' · 이 기기에 저장</span>' +
        '<span class="diary__saved-btns">' +
        '<button type="button" class="diary__mini" data-diary-edit>고치기</button>' +
        '<button type="button" class="diary__mini" data-diary-del>지우기</button>' +
        '</span>' +
        '</div>' +
        '</div>';
    }

    var val = editing ? draft : '';
    return head +
      '<div class="diary__form">' +
      '<textarea class="diary__input" id="diaryText" rows="2" maxlength="' + DIARY_MAX + '" ' +
      'placeholder="한 줄이면 충분해요" aria-label="오늘의 1줄 성찰">' + esc(val) + '</textarea>' +
      '<div class="diary__foot">' +
      '<span class="diary__count" data-diary-count>' + String(val.length) + '/' + DIARY_MAX + '</span>' +
      '<button type="button" class="diary__save" data-diary-save>기록 남기기</button>' +
      '</div>' +
      '</div>' +
      '<p class="diary__hint">이 기기에만 저장돼요 · 📖 내 성찰 기록 보기에서 .txt로 백업할 수 있어요</p>';
  }

  /** 성찰 섹션만 다시 그린다 (팝업 스크롤·부적 상태를 건드리지 않게) */
  function paintDiary(iso, draft) {
    var info = infoFor(iso);
    var box = modalBody ? modalBody.querySelector('[data-diary-body]') : null;
    if (!info || !box) return;
    box.innerHTML = diaryBodyHTML(info, draft);
    // 위쪽 점프 버튼 문구도 함께 맞춘다 — 남긴 날은 '고치기', 아직 안 쓴 날은 '쓰기'
    var jb = modalBody.querySelector('[data-diary-jump]');
    if (jb) {
      var txt = jb.querySelector('.diaryjump__txt');
      var editing = typeof draft === 'string';
      var label = (!!diaryOf(iso) && !editing) ? '오늘 1줄 성찰 고치기' : '오늘 1줄 성찰 쓰기';
      if (txt) txt.textContent = label;
      jb.setAttribute('aria-label', label + ' — 입력칸으로 이동');
    }
    var ta = box.querySelector('#diaryText');
    if (ta) { try { ta.focus({ preventScroll: true }); } catch (e) { ta.focus(); } }
  }
  function saveDiaryFromModal() {
    if (!modalBody) return;
    var wrap = modalBody.querySelector('[data-diary]');
    if (!wrap) return;
    var iso = wrap.getAttribute('data-diary');
    var info = infoFor(iso);
    var ta = wrap.querySelector('#diaryText');
    if (!info || !ta) return;
    var text = String(ta.value || '').replace(/\s+$/g, '').replace(/^\s+/, '');
    if (!text) {
      ta.classList.remove('is-shake');
      void ta.offsetWidth;
      ta.classList.add('is-shake');
      try { ta.focus({ preventScroll: true }); } catch (e) {}
      toast('한 줄을 적어 주세요');
      return;
    }
    if (text.length > DIARY_MAX) text = text.slice(0, DIARY_MAX);
    var ask = diaryAsk(iso, info);
    var isNew = !diary.entries[iso];
    /* 무료 체험 손님은 '새 기록'만 횟수를 센다 — 이미 쓴 날의 고치기는 세지 않는다 */
    if (isNew && !diaryTierOpen() && diaryTryLeft() <= 0) {
      toast('무료 3회를 다 썼어요 — 성찰 에디션에서 계속 쓸 수 있어요');
      return;
    }
    diary.entries[iso] = { cat: ask.cat, q: ask.q, text: text, plain: !((info.badges || []).length), at: new Date().toISOString() };
    saveDiary();
    if (isNew && !diaryTierOpen()) { diaryTry.used = Math.min(DIARY_FREE_TRIES, diaryTry.used + 1); saveDiaryTry(); }
    paintDiary(iso);
    renderCalendar();
    sfxDone();
    vibrate(18);
    if (!diaryTierOpen() && diaryTryLeft() <= 0) {
      toast('✍️ ' + fmtMD(iso) + ' 남겼어요 — 무료 3회를 다 썼어요. 기록은 그대로 남아 있어요');
    } else if (!diaryTierOpen()) {
      toast('✍️ ' + fmtMD(iso) + ' 남겼어요 · 무료 ' + diaryTryLeft() + '회 남았어요');
    } else {
      toast('✍️ ' + fmtMD(iso) + ' 성찰 한 줄을 남겼어요 — 달력에 펜 점이 찍혔어요');
    }
  }
  function deleteDiaryFromModal() {
    var wrap = modalBody ? modalBody.querySelector('[data-diary]') : null;
    if (!wrap) return;
    var iso = wrap.getAttribute('data-diary');
    if (!diary.entries[iso]) return;
    delete diary.entries[iso];
    saveDiary();
    paintDiary(iso);
    renderCalendar();
    sfxTap(1);
    toast('이 날의 기록을 지웠어요');
  }

  /* ── 📖 내 성찰 기록 모아보기 · 백업 ───────────────────── */
  function diaryKeys() {
    var keys = [];
    for (var k in diary.entries) {
      if (!Object.prototype.hasOwnProperty.call(diary.entries, k)) continue;
      if (!diary.entries[k] || !diary.entries[k].text) continue;
      keys.push(k);
    }
    keys.sort();
    return keys;
  }
  function diaryAllText() {
    var keys = diaryKeys();
    var out = ['윤이세 · 2027 내 인생 타이밍 캘린더 — 내 성찰 기록',
      '남긴 날 ' + keys.length + '일 · 내려받은 날 ' + fmtKoDate(state.todayISO), ''];
    keys.forEach(function (k) {
      var r = diary.entries[k];
      var p = T.parseISO(k);
      var dow = DOW_KO[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()];
      out.push('[' + p.y + '.' + p.m + '.' + p.d + ' (' + dow + ') · ' + (r.plain ? '잔잔한 날' : (r.cat || '')) + ']');
      out.push('Q. ' + (r.q || ''));
      out.push('A. ' + (r.text || ''));
      out.push('');
    });
    if (!keys.length) out.push('아직 남긴 기록이 없어요.');
    return out.join('\n');
  }
  function downloadDiary() {
    var text = diaryAllText();
    var name = '윤이세_성찰기록_' + state.todayISO.replace(/-/g, '') + '.txt';
    try {
      var blob = new Blob(['\uFEFF' + text], { type: 'text/plain;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { try { URL.revokeObjectURL(url); } catch (e) {} }, 3000);
      toast('📄 성찰 기록을 .txt 파일로 내려받았어요');
    } catch (e) {
      copyText(text, function (copied) {
        toast(copied === true ? '파일 저장이 막혀 .txt 내용을 복사했어요' : '파일 저장·복사가 막혀 있어요');
      });
    }
  }

  var dbookEl = null, dbookBody = null, dbookDialog = null, dbookLastFocus = null, dbookClosing = false;

  function diaryBookHTML() {
    var keys = diaryKeys();
    var body = keys.length
      ? '<div class="dbook__list">' + keys.map(function (k) {
        var r = diary.entries[k];
        var p = T.parseISO(k);
        var dow = DOW_KO[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()];
        return '<button type="button" class="dbook__item" data-dbook-day="' + k + '" aria-label="' +
          p.m + '월 ' + p.d + '일 성찰 기록 — 그날 열기">' +
          '<span class="dbook__date">' + p.y + '.' + p.m + '.' + p.d +
          '<em>(' + dow + ')</em></span>' +
          '<span class="badge badge--' + (r.plain ? 'gray' : (DIARY_CAT_CLASS[r.cat] || 'gray')) + '">' + esc(r.plain ? '잔잔한 날' : (r.cat || '성찰')) + '</span>' +
          '<span class="dbook__q">' + esc(r.q || '') + '</span>' +
          '<span class="dbook__a">' + esc(r.text || '') + '</span>' +
          '</button>';
      }).join('') + '</div>'
      : '<div class="dbook__empty">' +
        '<p class="dbook__empty-title">아직 남긴 한 줄이 없어요</p>' +
        '<p class="dbook__empty-sub">달력에서 날짜를 눌러 오늘의 질문에 한 줄만 남겨 보세요.<br>한 줄이 쌓이면 1년 뒤 내 기록이 됩니다.</p>' +
        '</div>';

    return '<p class="modal__eyebrow">MY REFLECTIONS · 성찰 기록</p>' +
      '<h2 class="dbook__title" id="dbookTitle">📖 내 성찰 기록</h2>' +
      '<p class="dbook__sub">' + (keys.length
        ? '<b>' + keys.length + '일</b>의 한 줄이 쌓였어요. 날짜를 누르면 그날 팝업이 열려요.'
        : '아직 남긴 기록이 없어요.') + '</p>' +
      '<button type="button" class="dbook__today" data-dbook-today>+ 오늘 성찰 바로 쓰기</button>' +
      (keys.length
        ? '<div class="dbook__acts">' +
          '<button type="button" class="dbook__act" data-diary-copy>전체 복사</button>' +
          '<button type="button" class="dbook__act dbook__act--gold" data-diary-dl>.txt로 내려받기</button>' +
          '</div>'
        : '') +
      body +
      '<p class="dbook__note">성찰 기록은 <b>이 브라우저에만</b> 저장돼요. 기기를 바꾸거나 브라우저 기록을 지우면 사라지니, 가끔 .txt로 내려받아 두세요.</p>'; 
  }
  function openDiaryBook() {
    if (!dbookEl) return;
    dbookLastFocus = document.activeElement;
    dbookBody.innerHTML = diaryBookHTML();
    dbookEl.hidden = false;
    document.body.classList.add('is-modal-open');
    dbookBody.scrollTop = 0;
    sfxOpen();
    try { dbookDialog.focus({ preventScroll: true }); } catch (e) { dbookDialog.focus(); }
  }
  function closeDiaryBook() {
    if (!dbookEl || dbookEl.hidden || dbookClosing) return;
    dbookClosing = true;
    dbookEl.classList.add('is-closing');
    setTimeout(function () {
      dbookEl.classList.remove('is-closing');
      dbookEl.hidden = true;
      dbookBody.innerHTML = '';
      dbookClosing = false;
      if ((!modalEl || modalEl.hidden) && (!shopEl || shopEl.hidden)) document.body.classList.remove('is-modal-open');
      var target = dbookLastFocus;
      if (target && target.focus) { try { target.focus({ preventScroll: true }); } catch (e) {} }
      dbookLastFocus = null;
    }, 180);
  }

  /* ── 1차 · 첫 접속 웰컴 팝업 (2026-11-21j) ─────────────────────
     사주를 넣기 전, 이 기기에서 **처음** 사이트를 열었을 때만 뜨는 콤팩트 소개.
     '내 사주 입력하기'를 누르면 닫히고 welcome.v1='1' 저장 + 사주 입력 폼(#formCard)으로.
     1~4단계 사용법은 여기서 말하지 않는다 — 사주를 넣어 달력이 처음 열릴 때
     아래 2차 사용법 팝업(#guideModal)이 맡는다. */
  var WELCOME_KEY = 'yoonise.timing.welcome.v1';
  var welcomeEl = null, welcomeDialog = null, welcomeLastFocus = null, welcomeClosing = false;
  var welcomeShown = false;   // 이번 페이지 로드에서 이미 띄웠는가 — 자동 오픈은 한 번만

  function welcomeSeen() {
    try { return localStorage.getItem(WELCOME_KEY) === '1'; } catch (e) { return true; }  // 저장이 막힌 환경에서는 자동 팝업을 띄우지 않는다
  }
  function markWelcomeSeen() {
    try { localStorage.setItem(WELCOME_KEY, '1'); } catch (e) {}
  }
  function openWelcome(quiet) {
    if (!welcomeEl || !welcomeEl.hidden) return;
    welcomeShown = true;
    welcomeLastFocus = document.activeElement;
    welcomeEl.hidden = false;
    document.body.classList.add('is-modal-open');
    if (!quiet) sfxOpen();      // 자동으로 뜰 때는 소리 없이 (손가락 없이 오디오를 열지 않는다)
    try { welcomeDialog.focus({ preventScroll: true }); } catch (e) { welcomeDialog.focus(); }
  }
  function closeWelcome() {
    if (!welcomeEl || welcomeEl.hidden || welcomeClosing) return;
    welcomeClosing = true;
    markWelcomeSeen();          // 닫는 방법과 상관없이 '한 번 봤다'로 기록 — 다음 방문부터는 조용히
    welcomeEl.classList.add('is-closing');
    setTimeout(function () {
      welcomeEl.classList.remove('is-closing');
      welcomeEl.hidden = true;
      welcomeClosing = false;
      if (!anyModalOpen()) document.body.classList.remove('is-modal-open');
      var target = welcomeLastFocus;
      if (target && target.focus) { try { target.focus({ preventScroll: true }); } catch (e) {} }
      welcomeLastFocus = null;
      /* 웰컴 팝업을 닫으면 바로 사주 입력 칸으로 — 한 번 더 찾아 헤매지 않게 */
      var fc = $('#formCard');
      if (fc && !fc.hidden) {
        try { fc.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { fc.scrollIntoView(); }
      }
    }, 180);
  }
  /** 첫 접속 한 번 — 사주를 넣기 전(달력이 아직 안 열린 상태)에만. 이미 본 기기면 조용히. */
  function maybeAutoWelcome(delay) {
    if (welcomeShown || welcomeSeen() || state.res) return;
    welcomeShown = true;
    setTimeout(function () { openWelcome(true); }, typeof delay === 'number' ? delay : 360);
  }

  /* ── 2차 · 달력 사용법 팝업 (2026-11-21i → 21j 분리) ────
     사주를 넣어 **달력이 처음 열릴 때** 딱 한 번 자동으로 뜨는 사용법 팝업(1~4단계).
     닫으면(바로 해보기·✕·배경·Esc 어느 쪽이든) 그 사실을 localStorage 에 남기고,
     이후에는 달력 위 `? 사용법` 버튼(.cal__help)으로만 다시 연다.
     사주를 넣기 전(입력 화면)에는 뜨지 않는다 — 그 자리는 1차 웰컴 팝업의 몫이다. */
  var GUIDE_KEY = 'yoonise.timing.guide.v1';
  var guideEl = null, guideDialog = null, guideLastFocus = null, guideClosing = false;
  var guideShown = false;   // 이번 페이지 로드에서 이미 띄웠는가 — 자동 오픈은 한 번만

  function guideSeen() {
    try { return localStorage.getItem(GUIDE_KEY) === '1'; } catch (e) { return true; }  // 저장이 막힌 환경에서는 자동 팝업을 띄우지 않는다
  }
  function markGuideSeen() {
    try { localStorage.setItem(GUIDE_KEY, '1'); } catch (e) {}
  }
  /** 사주를 넣기 전(입력 화면)인지 — 이때는 팝업을 닫으면 입력 폼으로 데려간다 */
  function guideAtEntry() { return !state.res; }
  /** 열려 있는 팝업이 하나라도 있으면 body 스크롤 잠금을 유지한다 */
  function anyModalOpen() {
    var els = [modalEl, shopEl, dbookEl, talisEl, burnEl, welcomeEl];
    for (var i = 0; i < els.length; i++) if (els[i] && !els[i].hidden) return true;
    return false;
  }
  function openGuide(quiet) {
    if (!guideEl || !guideEl.hidden) return;
    guideShown = true;
    syncGuideTrial();
    guideLastFocus = document.activeElement;
    guideEl.hidden = false;
    document.body.classList.add('is-modal-open');
    if (!quiet) sfxOpen();      // 자동으로 뜰 때는 소리 없이 (손가락 없이 오디오를 열지 않는다)
    try { guideDialog.focus({ preventScroll: true }); } catch (e) { guideDialog.focus(); }
  }
  function closeGuide() {
    if (!guideEl || guideEl.hidden || guideClosing) return;
    guideClosing = true;
    markGuideSeen();          // 닫는 방법과 상관없이 '한 번 봤다'로 기록 — 다음 방문부터는 조용히
    var toForm = guideAtEntry();
    guideEl.classList.add('is-closing');
    setTimeout(function () {
      guideEl.classList.remove('is-closing');
      guideEl.hidden = true;
      guideClosing = false;
      if (!anyModalOpen()) document.body.classList.remove('is-modal-open');
      var target = guideLastFocus;
      if (target && target.focus) { try { target.focus({ preventScroll: true }); } catch (e) {} }
      guideLastFocus = null;
      /* 첫 접속 팝업을 닫았으면 바로 사주 입력 칸으로 — 한 번 더 찾아 헤매지 않게 */
      var fc = toForm ? $('#formCard') : null;
      if (fc && !fc.hidden) {
        try { fc.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { fc.scrollIntoView(); }
      }
    }, 180);
  }
  /** 사용법 팝업 맨 위 '3일 무료 체험' 배지 — 판매 모드이고 아직 코드를 넣지 않았을 때만.
      날짜는 첫 방문일~첫 방문일+2(FREE_DAYS=3)로 고정. 체험이 끝났으면 종료 안내로 바꾼다. */
  function syncGuideTrial() {
    syncGuideCopy();
    var el = $('#guideTrial');
    if (!el) return;
    var on = FREE_TRIAL_ENABLED && !state.unlocked;
    el.hidden = !on;
    if (!on) return;
    var head = $('#guideTrialH'), sub = $('#guideTrialSub');
    if (guideAtEntry()) {
      /* 달력을 아직 열기 전 — 체험은 사주를 넣는 날부터 시작된다 */
      el.classList.remove('is-over');
      if (head) head.innerHTML = '🎁 사주를 넣는 날부터 <b>' + FREE_DAYS + '일 무료</b>';
      if (sub) sub.textContent = invited
        ? '친구 초대 보너스 · 액운 태우기 ' + INVITE_BURN_BONUS + '회 더'
        : '부담 없이 먼저 써 보고, 마음에 들면 코드로 열어요';
      return;
    }
    var w = trialWindow();
    if (trialOver()) {
      el.classList.add('is-over');
      if (head) head.innerHTML = '🎁 무료 ' + FREE_DAYS + '일 체험이 끝났어요';
      if (sub) sub.textContent = '입장 코드를 넣으면 전체가 열려요 · 카톡으로 보내 드려요';
      return;
    }
    el.classList.remove('is-over');
    if (head) head.innerHTML = '🎁 지금 <b>' + FREE_DAYS + '일 무료 체험</b> 중';
    if (!sub || !w) return;
    sub.textContent = mdOf(w.start) + '~' + mdOf(w.end) + ' 무료 · ' + (invited
      ? '액운 태우기 ' + INVITE_BURN_BONUS + '회 더'
      : '부담 없이 먼저 써 보세요');
  }
  /** 팝업 부제 — 사주를 넣기 전에는 '넣는 칸으로 간다'를, 달력이 열린 뒤에는 사용법을 말한다 */
  function syncGuideCopy() {
    var sub = $('#guideSub');
    if (!sub) return;
    sub.textContent = guideAtEntry()
      ? '생년월일만 넣으면 시작 — 내 사주 달력을 열어 드려요'
      : '네 번만 따라 하면 오늘 바로 쓸 수 있어요';
  }
  /** 달력이 열린 뒤 한 번 — 사주를 넣기 전에는 띄우지 않는다(그 자리는 1차 웰컴 팝업).
      이미 본 기기면 아무 것도 하지 않는다. delay 는 화면이 한 번 그려진 뒤 뜨게 하는 여유. */
  function maybeAutoGuide(delay) {
    if (guideShown || guideSeen() || !state.res) return;
    guideShown = true;
    setTimeout(function () { openGuide(true); }, typeof delay === 'number' ? delay : 520);
  }

  /* ── 토스트 (복사 완료·입장 코드 안내) ───────────────────── */
  var toastEl = null, toastTimer = 0;
  function toast(msg) {
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
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-on'); }, 2800);
  }

  /** 원국 글자에서 가장 적은 오행 → 1년 대표 부적.
   *  동률이면 나를 도와주는 순서(인성 → 비겁 → 식상 → 재성 → 관성)로 한 가지만 고른다. */
  function repElement() {
    var counts = (state.res && state.res.counts) || {};
    var me = state.res && state.res.dayMaster ? state.res.dayMaster.element : '토';
    var gan = state.res && state.res.dayMaster ? state.res.dayMaster.gan : '甲';
    var min = Infinity;
    EL_ORDER.forEach(function (e) { var c = counts[e] || 0; if (c < min) min = c; });
    if (min === Infinity) min = 0;
    var ties = EL_ORDER.filter(function (e) { return (counts[e] || 0) === min; });
    var pref = [EL_MOTHER[me], me, EL_BIRTH[me], EL_OVER[me], EL_PRESS[me]];
    var pick = ties[0];
    for (var i = 0; i < pref.length; i++) {
      if (ties.indexOf(pref[i]) >= 0) { pick = pref[i]; break; }
    }
    return { el: pick, count: min, ties: ties.length, gan: gan };
  }

  /** 그 사람만의 대표 부적 — 일간(천간) × 부족한 오행 = 50종 */
  function repType(el, gan) {
    var g = gan || (state.res && state.res.dayMaster ? state.res.dayMaster.gan : '甲');
    if (Chars && Chars.rep) return Chars.rep(g, el);
    return null;
  }

  /* ── 부적 패(牌) 아트 ──────────────────────────────────
     진짜 부적의 상징 — 금색 매듭 고리 · 오행 인장 · 금박 이중 테두리와 네 귀퉁이
     뇌문 · 구름문/별자리/태극 워터마크 · 주홍 낙관. 한지 질감은 feTurbulence 로.
     글자 크기는 .talis-plaque 의 font-size 하나로 비례해 커진다(배너 ↔ 확대 모달). */
  var EL_GLYPH = { 목: '木', 화: '火', 토: '土', 금: '金', 수: '水' };
  var EL_PAPER = {
    목: { a: '#143026', b: '#08180F', gold: '#C9A968', halo: '#8FD9B4' },
    화: { a: '#3A1418', b: '#1A0709', gold: '#CE9F62', halo: '#F0845C' },
    토: { a: '#35270F', b: '#171006', gold: '#D5B06C', halo: '#E2B45E' },
    금: { a: '#232830', b: '#0D1015', gold: '#D2C8A8', halo: '#C3D2E0' },
    수: { a: '#122438', b: '#060E1B', gold: '#CDBE93', halo: '#6FC0DA' }
  };
  var pseq = 0;

  /** 고리 · 매듭 · 노리개 끈 (부적 패 위에 거는 부분) */
  function plaqueLoopArt() {
    var u = 'tl' + (++pseq) + '_';
    return '<svg viewBox="0 0 48 54" aria-hidden="true" focusable="false">' +
      '<defs><linearGradient id="' + u + 'g" x1="0" y1="0" x2=".4" y2="1">' +
      '<stop offset="0" stop-color="#F2DCA6"/><stop offset=".45" stop-color="#C9A265"/>' +
      '<stop offset="1" stop-color="#8E6C34"/></linearGradient>' +
      '<radialGradient id="' + u + 'b" cx=".38" cy=".3" r=".72">' +
      '<stop offset="0" stop-color="#FFF3D2" stop-opacity=".85"/>' +
      '<stop offset="1" stop-color="#C9A265" stop-opacity="0"/></radialGradient></defs>' +
      /* 끈 */
      '<path d="M24 0v4.2" stroke="#B2433A" stroke-width="1.5" stroke-linecap="round"/>' +
      /* 고리 */
      '<ellipse cx="24" cy="12" rx="5.9" ry="6.9" fill="none" stroke="url(#' + u + 'g)" stroke-width="2.1"/>' +
      '<ellipse cx="24" cy="11.6" rx="3.9" ry="4.5" fill="url(#' + u + 'b)" stroke="rgba(255,246,222,.45)" stroke-width=".7"/>' +
      /* 매듭 — 마름모 매듭과 늘어뜨린 끈 */
      '<path d="M24 19.4v3" stroke="url(#' + u + 'g)" stroke-width="1.4"/>' +
      '<path d="M24 22.6l4.8 4.6-4.8 4.6-4.8-4.6z" fill="url(#' + u + 'g)" stroke="rgba(120,86,36,.5)" stroke-width=".5"/>' +
      '<circle cx="24" cy="27.2" r="1.7" fill="#F6E7BE" stroke="rgba(120,86,36,.45)" stroke-width=".4"/>' +
      '<g stroke="#B2433A" stroke-width="1.05" stroke-linecap="round" opacity=".9">' +
      '<path d="M20.2 32.6 18.2 44"/><path d="M24 33v11"/><path d="M27.8 32.6l2 11.4"/></g>' +
      /* 부적머리 — 종이를 접어 끈에 건 삼각 장식 */
      '<path d="M14.4 54 24 36.8 33.6 54Z" fill="url(#' + u + 'g)" stroke="rgba(120,86,36,.55)" stroke-width=".6"/>' +
      '<path d="M18.6 54 24 43.4 29.4 54Z" style="fill:var(--tp-a)" opacity=".85"/>' +
      '</svg>';
  }

  /** 부적 패 바탕 — 한지 질감 · 금박 테두리 · 워터마크 */
  function plaqueSheetArt(el) {
    var c = EL_PAPER[el] || EL_PAPER['화'], u = 'tp' + (++pseq) + '_';
    var cloud =
      '<g fill="none" stroke="' + c.gold + '" stroke-width=".8" stroke-linecap="round">' +
      '<path d="M0 9.2a4.2 4.2 0 0 1 8.4 0 4.2 4.2 0 0 1 8.4 0 4.2 4.2 0 0 1 8.4 0"/>' +
      '<path d="M0 12.6h25.2"/></g>';
    function clouds(x, y, s, o, r) {
      return '<g transform="translate(' + x + ' ' + y + ') scale(' + s + ') rotate(' + (r || 0) + ')" opacity="' + o + '">' +
        cloud + '</g>';
    }
    /* 별자리 — 캐릭터를 감싸는 점선 별자리 */
    var starPts = [[32, 40], [22, 50], [19, 63], [24, 76], [34, 85]];
    var starLines = '', starDots = '';
    for (var i = 0; i < starPts.length; i++) {
      starDots += '<circle cx="' + starPts[i][0] + '" cy="' + starPts[i][1] + '" r="' + (i % 2 ? 1.1 : .8) + '"/>';
      if (i) starLines += 'M' + starPts[i - 1][0] + ' ' + starPts[i - 1][1] + 'L' + starPts[i][0] + ' ' + starPts[i][1];
    }
    var starPts2 = [[68, 38], [76, 46], [79, 58], [75, 70], [66, 80]];
    var starLines2 = '', starDots2 = '';
    for (var j = 0; j < starPts2.length; j++) {
      starDots2 += '<circle cx="' + starPts2[j][0] + '" cy="' + starPts2[j][1] + '" r="' + (j % 2 ? .8 : 1.1) + '"/>';
      if (j) starLines2 += 'M' + starPts2[j - 1][0] + ' ' + starPts2[j - 1][1] + 'L' + starPts2[j][0] + ' ' + starPts2[j][1];
    }
    var meander = '<g fill="none" stroke="url(#' + u + 'g)" stroke-width=".85" opacity=".55" stroke-linecap="square">' +
      '<path d="M7.6 16.4V7.6h8.8"/><path d="M10.6 16.4v-6h5.8"/></g>';
    return '<svg class="talis-plaque__svg" viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden="true" focusable="false">' +
      '<defs>' +
      '<linearGradient id="' + u + 'bg" x1=".1" y1="0" x2=".55" y2="1">' +
      '<stop offset="0" stop-color="' + c.a + '"/><stop offset=".62" stop-color="' + c.b + '"/>' +
      '<stop offset="1" stop-color="' + c.b + '"/></linearGradient>' +
      '<linearGradient id="' + u + 'g" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#EFD9A6"/><stop offset=".38" stop-color="' + c.gold + '"/>' +
      '<stop offset=".62" stop-color="#8F6E36"/><stop offset="1" stop-color="#E4CB94"/></linearGradient>' +
      '<radialGradient id="' + u + 'h" cx=".5" cy=".46" r=".5">' +
      '<stop offset="0" stop-color="' + c.halo + '" stop-opacity=".30"/>' +
      '<stop offset=".55" stop-color="' + c.halo + '" stop-opacity=".10"/>' +
      '<stop offset="1" stop-color="' + c.halo + '" stop-opacity="0"/></radialGradient>' +
      '<filter id="' + u + 't" x="0" y="0" width="100%" height="100%">' +
      '<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="4" seed="11" result="n"/>' +
      '<feColorMatrix type="saturate" values="0"/></filter>' +
      '</defs>' +
      '<rect width="100" height="140" fill="url(#' + u + 'bg)"/>' +
      '<rect width="100" height="140" fill="url(#' + u + 'h)"/>' +
      /* 한지 섬유 질감 */
      '<rect width="100" height="140" filter="url(#' + u + 't)" opacity=".16" style="mix-blend-mode:overlay"/>' +
      /* 구름문 워터마크 */
      clouds(8, 33, 1, '.13', -2) + clouds(63, 28, .78, '.10', 4) +
      clouds(7, 96, .88, '.11', 2) + clouds(61, 106, .8, '.09', -3) +
      clouds(26, 122, .66, '.10', 0) +
      /* 별자리 워터마크 */
      '<g stroke="' + c.gold + '" stroke-width=".45" opacity=".26"><path d="' + starLines + '"/><path d="' + starLines2 + '"/></g>' +
      '<g fill="' + c.gold + '" opacity=".34">' + starDots + starDots2 + '</g>' +
      /* 태극 워터마크 */
      '<g transform="translate(50 121)" opacity=".24"><circle r="6.2" fill="none" stroke="' + c.gold + '" stroke-width=".7"/>' +
      '<path d="M0-6.2A6.2 6.2 0 0 1 0 6.2 3.1 3.1 0 0 1 0 0 3.1 3.1 0 0 0 0-6.2Z" fill="' + c.gold + '"/></g>' +
      /* 캐릭터 뒤 광륜 */
      '<circle cx="46" cy="72" r="30" fill="none" stroke="' + c.gold + '" stroke-width=".55" opacity=".35"/>' +
      '<circle cx="46" cy="72" r="34" fill="none" stroke="' + c.gold + '" stroke-width=".35" opacity=".18"/>' +
      /* 금박 이중 테두리 */
      '<rect x="3.4" y="3.4" width="93.2" height="133.2" rx="3" fill="none" stroke="url(#' + u + 'g)" stroke-width="1.5" opacity=".92"/>' +
      '<rect x="7.1" y="7.1" width="85.8" height="125.8" rx="1.6" fill="none" stroke="url(#' + u + 'g)" stroke-width=".6" opacity=".6"/>' +
      /* 네 귀퉁이 뇌문 */
      '<g transform="translate(100 0) scale(-1 1)">' + meander + '</g>' +
      '<g transform="translate(0 140) scale(1 -1)">' + meander + '</g>' +
      '<g transform="translate(100 140) scale(-1 -1)">' + meander + '</g>' +
      meander +
      /* 머리 장식 — 작은 삼각 부적머리 */
      '<g fill="none" stroke="url(#' + u + 'g)" stroke-width=".8" opacity=".5">' +
      '<path d="M38 9.5h24"/><path d="M43 12.4h14"/></g>' +
      '</svg>';
  }

  /** 부적 패 전체 — 고리 + 패 + 글자/인장 오버레이
      opt.type: 50종 대표 부적(Chars.rep) — 세로 새김·기운 표기가 이 타입을 따른다 */
  function plaqueHTML(el, opt) {
    opt = opt || {};
    var type = opt.type || repType(el);
    var name = type ? type.n : (Chars ? Chars.name(el, '', '') : (TALIS[el] ? TALIS[el].label : '수호 부적'));
    /* 세로 새김 — 50종은 한자 4자(부적답게), 날짜 부적 이름은 한글 그대로 */
    var inscription = type ? type.h : String(name).replace(/\s*부적$/, '').replace(/\s+/g, '·');
    var vfs = type ? '.82em' : (inscription.length > 6 ? '.63em' : '.7em');
    var vls = type ? '.1em' : '.08em';
    var sealTxt = type ? ('補' + (EL_GLYPH[el] || '木')) : '';
    var tag = opt.tag ? 'button' : 'div';
    var tapLabel = opt.action === 'talis-bless' ? ' — 오늘 기운 받기'
      : (opt.action === 'talis-tap' ? ' — 톡 눌러 기운 받기' : ' 크게 보기');
    var attrs = opt.tag
      ? ' type="button" data-' + (opt.action || 'talis-open') + ' aria-label="' + esc(name) + tapLabel + '"'
      : '';
    /* 2026-11-22 · 부적 에너지 — 부족한 오행 색 오라 · 금박 홀로그램 · 피어오르는 기운 입자
       2026-11-22 3차 — 톡 누르면 바깥 링 두 겹과 금박 입자가 부적 안쪽으로 모여든다 */
    var fx = opt.fx
      ? '<span class="talis-plaque__aura" aria-hidden="true"></span>' +
        '<span class="talis-plaque__rings" aria-hidden="true"><i></i><i></i></span>' +
        '<span class="talis-plaque__dust" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>' +
        '<span class="talis-plaque__warm" aria-hidden="true"></span>' +
        '<span class="talis-plaque__motes" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>'
      : '';
    return '<' + tag + ' class="talis-plaque talis-plaque--' + el + (opt.lg ? ' talis-plaque--lg' : '') + '"' + attrs + '>' +
      fx +
      '<span class="talis-plaque__loop" aria-hidden="true">' + plaqueLoopArt() + '</span>' +
      '<span class="talis-plaque__sheet">' +
      plaqueSheetArt(el) +
      '<span class="talis-plaque__glyph" aria-hidden="true">' + (EL_GLYPH[el] || '木') + '</span>' +
      '<span class="talis-plaque__char" aria-hidden="true">' + (Chars ? Chars.svg(el) : '') + '</span>' +
      '<span class="talis-plaque__vname" aria-hidden="true"><span style="font-size:' + vfs +
        ';letter-spacing:' + vls + '">' + esc(inscription) + '</span></span>' +
      '<span class="talis-plaque__seal" aria-hidden="true">' +
        (sealTxt
          ? '<i style="font-size:.66em;letter-spacing:0">' + esc(sealTxt) + '</i>'
          : '<i>守</i><i>護</i>') + '</span>' +
      '<span class="talis-plaque__year" aria-hidden="true"><i>丁未</i></span>' +
      (type ? '<span class="talis-plaque__mantra" aria-hidden="true"><i>' + esc(type.m) + '</i></span>' : '') +
      '<span class="talis-plaque__shine" aria-hidden="true"></span>' +
      '</span>' +
      (opt.fx ? '<span class="talis-plaque__holo" aria-hidden="true"></span>' : '') +
      '</' + tag + '>';
  }

  function renderTalisman() {
    var box = $('#talisBanner');
    if (!box) return;
    if (!state.res) { box.className = 'talis-banner'; box.innerHTML = ''; return; }
    var r = repElement(), t = TALIS[r.el], type = repType(r.el, r.gan);
    var total = state.res.total || 8;
    var who = state.res.input.name ? state.res.input.name + ' 님' : '나';
    var lack = (r.count === 0
      ? total + '글자에 ' + t.label + ' 기운이 하나도 없어요.'
      : total + '글자 중 ' + t.label + ' 기운이 ' + r.count + '개로 가장 적어요.');
    var why = lack + ' ' + t.why;
    var tname = type ? type.n : (Chars ? Chars.name(r.el, '', '') : t.label);
    var ticon = type ? type.icon : (Chars ? Chars.icon(r.el, '') : '✨');
    state.repTalis = {
      el: r.el, gan: r.gan, name: tname, icon: ticon, who: who, why: why, ties: r.ties,
      hanja: type ? type.h : '', mantra: type ? type.m : '', line: type ? type.d : ''
    };
    /* 대문 히어로 — 부적이 배너 한가운데, 글은 위아래로만 (2026-11-22 개편)
       2026-11-22 2차: 톡 눌렀을 때 뜨는 문구를 **부적 위(타이틀 아래 예약 자리)**로 올린다.
       · 예약 자리는 늘 같은 높이로 비어 있어서 배너가 들썩이지 않는다.
       · 부적 아래 힌트는 자리 그대로 — 문구가 바뀌어도 힌트가 밀리지 않는다. */
    box.className = 'talis-banner talis-banner--' + r.el;
    box.setAttribute('aria-label', who + '의 2027 수호 부적 — ' + tname);
    box.innerHTML =
      '<div class="talis-hero">' +
      '<p class="talis-banner__eyebrow">GUARDIAN TALISMAN · 2027 丁未</p>' +
      '<p class="talis-banner__title">' + esc(who) + '의 2027 수호 부적</p>' +
      '<p class="talis-banner__reveal" id="talisReveal" role="status" aria-live="polite"></p>' +
      '<div class="talis-banner__stage">' +
      '<span class="talis-banner__halo" aria-hidden="true"></span>' +
      plaqueHTML(r.el, { tag: true, action: 'talis-tap', fx: true, type: type }) +
      '</div>' +
      '<p class="talis-banner__name"><span aria-hidden="true">' + ticon + '</span> ' + esc(tname) + '</p>' +
      '<p class="talis-banner__hint">부적을 톡 눌러 기운을 깨우세요</p>' +
      '<button type="button" class="talis-banner__more" data-talis-open aria-hidden="true">부적 크게 보기 <span aria-hidden="true">↗</span></button>' +
      '</div>';
  }

  /* ── 부적 에너지 — 톡 누르면 빛이 안쪽으로 모이고 문구가 천천히 뜬다 (2026-11-22) ── */
  var TALIS_PHRASE = '지금 이 순간, 흩어졌던 기운이 제자리를 찾습니다';
  var TALIS_CHARGE_MS = 2800;   /* 링·오라 수렴 → 내부 발광까지 */
  var TALIS_TEXT_MS = 6000;     /* 문구 한 호흡: 0.3s 뒤 등장 → 1.7s 페이드인 → 2s 머묾 → 1.8s 페이드아웃 */
  var TALIS_LINK_MS = 2000;     /* 문구가 다 나타난 뒤 '부적 크게 보기'가 조용히 */

  /** 오라 수렴 클래스만 (소리는 따로) — 다시 눌러도 처음부터 */
  function talisBurst(plaque) {
    if (!plaque) return;
    clearTimeout(plaque._chargeT);
    plaque.classList.remove('is-charged');
    void plaque.offsetWidth;
    plaque.classList.add('is-charged');
    plaque._chargeT = setTimeout(function () { plaque.classList.remove('is-charged'); }, TALIS_CHARGE_MS);
  }
  function talisCharge(plaque) {
    talisBurst(plaque);
    sfxBless();                       /* 6초 싱잉볼 여운 + 묵직한 진동 */
  }

  /** 문구 한 호흡 — 6초 뒤 스스로 조용한 기본 상태로 돌아간다 */
  function talisRevealText(el, text) {
    if (!el) return;
    clearTimeout(el._breathT);
    el.textContent = text;
    el.classList.remove('is-on');
    void el.offsetWidth;
    el.classList.add('is-on');
    el._breathT = setTimeout(function () {
      el.classList.remove('is-on');
      el.textContent = '';
    }, TALIS_TEXT_MS);
  }

  /** 배너 부적 톡 — 빛이 모이고 문구가 한 호흡, 이어서 확대 팝업 가는 길이 조용히 열린다 */
  function onTalisTap(btn) {
    talisCharge(btn);
    talisRevealText($('#talisReveal'), TALIS_PHRASE);
    var more = $('.talis-banner__more');
    if (more && !more.classList.contains('is-on')) {
      clearTimeout(more._linkT);
      more._linkT = setTimeout(function () {
        more.classList.add('is-on');
        more.removeAttribute('aria-hidden');
      }, TALIS_LINK_MS);
    }
  }

  /* ── 대표 부적 확대 모달 ───────────────────────────── */
  var talisEl = null, talisBody = null, talisDialog = null, talisLastFocus = null, talisClosing = false;

  function openTalisModal() {
    var d = state.repTalis;
    if (!talisEl || !d) return;
    talisLastFocus = document.activeElement;
    talisBody.innerHTML =
      '<p class="modal__eyebrow">GUARDIAN TALISMAN · 2027 丁未</p>' +
      '<p class="modal__date" id="talisModalTitle">' + esc(d.who) + '의<br>2027 수호 부적</p>' +
      '<p class="modal__sub">한 해 내내 내 사주를 받쳐 주는 대표 부적이에요.</p>' +
      '<div class="talis-showcase talis-showcase--' + d.el + '"><div class="talis-showcase__obj">' +
      plaqueHTML(d.el, { tag: true, action: 'talis-bless', lg: true, fx: true, type: null }) +
      '<span class="talis-showcase__waves" aria-hidden="true"><i></i><i></i></span>' +
      '</div></div>' +
      '<p class="talis-modal__name"><span aria-hidden="true">' + d.icon + '</span>' + esc(d.name) + '</p>' +
      (d.mantra
        ? '<p class="talis-modal__mantra"><b>' + esc(d.hanja) + '</b> · ' + esc(d.mantra) + '</p>'
        : '') +
      '<p class="talis-modal__why">' + esc(d.line || '') +
        '<small>' + esc(d.why) + '</small></p>' +
      '<button type="button" class="btn talis-bless-btn" data-talis-bless>오늘 기운 받기</button>' +
      '<p class="talis-phrase" id="talisPhrase" role="status" aria-live="polite"></p>' +
      '<p class="talis-bless__note">부적을 톡 두드리면 오늘 하루 기운이 켜져요.</p>' +
      '<button type="button" class="btn btn--ghost modal__done-btn" data-talis-close>닫기</button>';
    talisEl.hidden = false;
    document.body.classList.add('is-modal-open');
    talisBody.scrollTop = 0;
    sfxOpen();                              // 뿅 — 사용자 클릭 안에서 재생
    try { talisDialog.focus({ preventScroll: true }); } catch (e) { talisDialog.focus(); }
  }

  function closeTalisModal() {
    if (!talisEl || talisEl.hidden || talisClosing) return;
    talisClosing = true;
    talisEl.classList.add('is-closing');
    setTimeout(function () {
      talisEl.classList.remove('is-closing');
      talisEl.hidden = true;
      if ((!modalEl || modalEl.hidden) && (!shopEl || shopEl.hidden)) {
        document.body.classList.remove('is-modal-open');
      }
      talisBody.innerHTML = '';
      talisClosing = false;
      var t = talisLastFocus;
      talisLastFocus = null;
      if (t && t.focus) { try { t.focus({ preventScroll: true }); } catch (e) {} }
    }, 180);
  }

  /** 오늘 기운 받기 — 빛 파동 + 진동 + 차임 + 오라 번쩍 */
  function onTalisBless(e) {
    if (!talisBody) return;
    var sc = talisBody.querySelector('.talis-showcase');
    var note = talisBody.querySelector('.talis-bless__note');
    var phrase = talisBody.querySelector('.talis-phrase');
    if (!sc) return;
    clearTimeout(sc._blessT);
    sc.classList.remove('is-blessed');
    void sc.offsetWidth;
    sc.classList.add('is-blessed');
    sc._blessT = setTimeout(function () { sc.classList.remove('is-blessed'); }, TALIS_CHARGE_MS);
    var plaque = sc.querySelector('.talis-plaque');
    talisBurst(plaque);              /* 부적을 눌러도, 아래 버튼을 눌러도 빛이 안으로 모인다 */
    sfxBless();
    if (note) {                       // 문구가 뜨면 예전 안내 한 줄은 비켜 준다 (겹쳐 보이지 않게)
      note.classList.remove('is-on');
      note.textContent = '';
    }
    talisRevealText(phrase, TALIS_PHRASE);
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

  /* ── 날짜 팝업 부적 패(牌) — 한지 · 금박 이중 테두리 · 구름문 ─────────────
     chars.js 의 5종 캐릭터는 그대로 두고, 그 둘레를 진짜 부적처럼 감싼다.
     (배너·확대 팝업의 부적 패와 같은 결: 금박선 · 구름문 · 노리개 · 주홍 낙관)
     완료(3타) 상태는 CSS(.ritual.is-done)가 금빛 테두리와 낙관을 맡는다. */
  var padSeq = 0;

  /** 부적 패 위에 다는 노리개 — 금고리 · 매듭 · 주홍 끈 세 줄과 구슬.
      (배너 부적 패의 고리와 같은 결을 쓰되, 날짜 팝업에는 더 작고 단정하게) */
  function padNorigaeArt() {
    var u = 'pn' + (++padSeq) + '_';
    return '<svg viewBox="0 0 40 54" aria-hidden="true" focusable="false">' +
      '<defs><linearGradient id="' + u + 'g" x1="0" y1="0" x2=".4" y2="1">' +
      '<stop offset="0" stop-color="#F5E3B4"/><stop offset=".45" stop-color="#C9A265"/>' +
      '<stop offset="1" stop-color="#8E6C34"/></linearGradient></defs>' +
      /* 매다는 끈 */
      '<path d="M20 0v5.4" stroke="#B2433A" stroke-width="1.6" stroke-linecap="round"/>' +
      /* 금고리 */
      '<ellipse cx="20" cy="13.2" rx="5.6" ry="6.4" fill="none" stroke="url(#' + u + 'g)" stroke-width="2.2"/>' +
      '<ellipse cx="20" cy="12.9" rx="3.3" ry="3.8" fill="rgba(255,247,226,.6)" ' +
      'stroke="rgba(140,104,48,.35)" stroke-width=".6"/>' +
      /* 매듭 */
      '<path d="M20 19.9v2.6" stroke="url(#' + u + 'g)" stroke-width="1.5"/>' +
      '<path d="M20 22.6l4.3 4.1-4.3 4.1-4.3-4.1z" fill="url(#' + u + 'g)" ' +
      'stroke="rgba(120,86,36,.5)" stroke-width=".5"/>' +
      '<circle cx="20" cy="26.7" r="1.55" fill="#F8EAC4" stroke="rgba(120,86,36,.45)" stroke-width=".4"/>' +
      /* 늘어뜨린 끈 세 줄 */
      '<g stroke="#B2433A" stroke-width="1.15" stroke-linecap="round" opacity=".92">' +
      '<path d="M16.7 31.8 15 45.4"/><path d="M20 32.4v13"/><path d="M23.3 31.8l1.7 13.6"/></g>' +
      /* 끈 끝 구슬 */
      '<g fill="url(#' + u + 'g)"><circle cx="14.9" cy="47.1" r="1.7"/>' +
      '<circle cx="20" cy="47.6" r="1.9"/><circle cx="25.1" cy="47.1" r="1.7"/></g>' +
      '</svg>';
  }
  function padFrameArt(el) {
    var color = (EL_THEME[el] || EL_THEME['화']).color;
    var u = 'pd' + (++padSeq) + '_';
    var gold = '#C79A4E';
    var cloudPath = '<path d="M0 9.2a4.2 4.2 0 0 1 8.4 0 4.2 4.2 0 0 1 8.4 0 4.2 4.2 0 0 1 8.4 0"/>' +
      '<path d="M0 12.6h25.2"/>';
    function clouds(x, y, s, o, r) {
      return '<g transform="translate(' + x + ' ' + y + ') scale(' + s + ') rotate(' + (r || 0) + ')"' +
        ' fill="none" stroke="' + gold + '" stroke-width="1" stroke-linecap="round" opacity="' + o + '">' +
        cloudPath + '</g>';
    }
    var meander = '<g fill="none" stroke="url(#' + u + 'g)" stroke-width="1.4" opacity=".5" stroke-linecap="square">' +
      '<path d="M13 27V13h14"/><path d="M18 27V18h9"/></g>';
    return '<svg class="talis-pad__art" viewBox="0 0 320 400" preserveAspectRatio="none" aria-hidden="true" focusable="false">' +
      '<defs>' +
      '<linearGradient id="' + u + 'bg" x1=".1" y1="0" x2=".75" y2="1">' +
      '<stop offset="0" stop-color="#FFFDF7"/><stop offset=".42" stop-color="#FBF5E7"/>' +
      '<stop offset="1" stop-color="#F3E8D0"/></linearGradient>' +
      '<linearGradient id="' + u + 'g" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#F3E0B0"/><stop offset=".34" stop-color="#D3AA67"/>' +
      '<stop offset=".62" stop-color="#9E7838"/><stop offset="1" stop-color="#EBD3A0"/></linearGradient>' +
      '<radialGradient id="' + u + 'h" cx=".5" cy=".46" r=".55">' +
      '<stop offset="0" stop-color="' + color + '" stop-opacity=".20"/>' +
      '<stop offset=".58" stop-color="' + color + '" stop-opacity=".06"/>' +
      '<stop offset="1" stop-color="' + color + '" stop-opacity="0"/></radialGradient>' +
      '<filter id="' + u + 't" x="0" y="0" width="100%" height="100%">' +
      '<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" seed="7" result="n"/>' +
      '<feColorMatrix type="saturate" values="0"/></filter>' +
      '</defs>' +
      '<rect width="320" height="400" fill="url(#' + u + 'bg)"/>' +
      '<rect width="320" height="400" fill="url(#' + u + 'h)"/>' +
      /* 한지 섬유 질감 */
      '<rect width="320" height="400" filter="url(#' + u + 't)" opacity=".15" style="mix-blend-mode:multiply"/>' +
      /* 위·아래 구름문 */
      clouds(12, 24, 1.05, '.30', -1) + clouds(96, 16, .78, '.22', 2) +
      clouds(150, 26, .92, '.18', 0) + clouds(208, 16, .78, '.22', -2) + clouds(272, 24, 1.05, '.30', 1) +
      clouds(14, 342, 1.05, '.26', 1) + clouds(272, 340, 1.05, '.26', -1) +
      /* 금박 이중 테두리 */
      '<rect x="5" y="5" width="310" height="390" rx="7" fill="none" stroke="url(#' + u + 'g)" stroke-width="2.6" opacity=".92"/>' +
      '<rect x="12.5" y="12.5" width="295" height="375" rx="3" fill="none" stroke="url(#' + u + 'g)" stroke-width="1" opacity=".55"/>' +
      /* 네 귀퉁이 뇌문 */
      meander +
      '<g transform="translate(320 0) scale(-1 1)">' + meander + '</g>' +
      '<g transform="translate(0 400) scale(1 -1)">' + meander + '</g>' +
      '<g transform="translate(320 400) scale(-1 -1)">' + meander + '</g>' +
      '</svg>';
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
    // (배지 없는 잔잔한 날은 그 사람의 대표 부적 → 일간×오행 50종 이름 그대로)
    var tname = tag ? (Chars ? Chars.name(el, tag, info.iso) : '수호 부적')
      : ((repType(el) || {}).n || (Chars ? Chars.name(el, '', '') : '수호 부적'));
    var ticon = Chars ? Chars.icon(el, tag) : th.badge;
    var seal = tag === '소통' ? '吉' : '護';   // 완료(3타)에 찍히는 주홍 낙관
    var msg = done
      ? esc(lot.done) + '<small>' + esc(lot.sub) + '</small>'
      : (n > 0 ? lot.taps[n - 1] : '부적을 톡톡톡 세 번 두드리면 ' +
        (info.iso === state.todayISO ? '오늘' : '그날') + ' 기운이 켜져요.');
    return '<div class="ritual ritual--' + el + (done ? ' is-done' : '') + '" data-ritual-wrap="' + info.iso +
      '" data-el="' + el + '" data-stage="' + n + '">' +
      '<p class="ritual__eyebrow">' + lead + ' · ' + esc(t.label) + (tag ? ' · ' + esc(tag) : '') + '</p>' +
      '<div class="talis-pad">' +
      '<span class="talis-pad__norigae" aria-hidden="true">' + padNorigaeArt() + '</span>' +
      '<div class="talis-pad__sheet">' +
      padFrameArt(el) +
      '<div class="talis-pad__namewrap">' +
      '<span class="ritual__name"><span class="ritual__name-icon">' + ticon + '</span>' + esc(tname) + '</span>' +
      '</div>' +
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
      '<span class="talis-pad__seal" aria-hidden="true">' + seal + '</span>' +
      '<span class="talis-pad__shine" aria-hidden="true"></span>' +
      '</div>' +
      '</div>' +
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
        // 팝업이 닫히는 순간 달력 칸에 그날의 부적 스티커가 착 붙도록 미뤄 둔다
        state.pendingStamp = iso;
        var note = modalBody && modalBody.querySelector('.modal__stamp-note');
        if (note) note.hidden = false;
      } else {
        state.justStamped = iso;
        renderCalendar();                     // 달력 칸에 부적 스티커가 착
      }
    } else if (msgEl) {
      msgEl.textContent = lot.taps[n - 1] || ('한 번 더 — ' + (3 - n) + '번 남았어요.');
    }
  }

  /* ── 렌더 ──────────────────────────────────────────── */
  function render() {
    syncLockUI();          // 🔒 전용 배지·입력 잠금은 사주가 정해진 뒤에야 맞춰진다
    renderSavedBar();
    renderNatal();
    renderTalisman();
    renderYearSummary();
    renderCalendar();
    renderBurnCard();
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

  /* ── 첫 부적 말풍선 힌트 (2026-11-21) ──────────────────────────
     · 3단계 사용법은 첫 방문 팝업(#guideModal)과 달력 위 `? 사용법`
       버튼(.cal__help)이 맡고(2026-11-21c),
     · 말풍선은 부적을 아직 한 번도 붙이지 않은 사람에게만 이번 달 '오늘 칸'
       (오늘이 부적 없는 잔잔한 날이면 가장 가까운 부적 있는 날) 위에 뜬다.
       부적을 하나라도 붙이거나 그 칸을 누르면 사라진다. */
  function stampCount() {
    var bag = state.stamps[sigOf()];
    if (!bag) return 0;
    var n = 0;
    for (var k in bag) if (Object.prototype.hasOwnProperty.call(bag, k)) n++;
    return n;
  }
  /** 이 날이 눌리는 칸인가 — 예전 renderCalendar 안의 판단을 그대로 함수로 뺐다 */
  function dayClickable(iso, info) {
    var badges = (info && info.badges) || [];
    var open = isOpenDay(iso);
    var pastDay = iso < state.todayISO;
    var trialLocked = FREE_TRIAL_ENABLED && !state.unlocked;
    if (badges.length) return true;                 // 부적 팝업·톡톡톡
    if (trialLocked) return true;                   // 잠긴 날은 여는 방법을 알려 준다
    if (diaryAllowed()) return open;                // 성찰 다이어리는 열린 날만
    /* 코드로 열린 기기 — 딱지 없는 평범한 날도 눌러 '잔잔한 날' 한 줄 안내를 받는다 (2026-11-21) */
    return open ? true : !pastDay;
  }
  /** 말풍선을 띄울 날 — 이번 달 안에서만. 없으면 '' */
  function hintIsoFor(v, dim) {
    if (state.hintOff || !state.res) return '';
    if (trialOver()) return '';                        // 체험이 끝나면 붙일 수 있는 날이 없다
    if (stampCount()) return '';                       // 부적을 한 번이라도 붙였으면 안내 끝
    var t = T.parseISO(state.todayISO);
    if (t.y !== v.y || t.m !== v.m) return '';         // 지금 보고 있는 달에 오늘이 있을 때만
    var best = '', bestDist = 99;
    for (var d = 1; d <= dim; d++) {
      var iso = T.isoOf(v.y, v.m, d);
      if (iso < state.todayISO) continue;              // 지난 날에는 말풍선을 걸지 않는다 (붙일 수 없는 날)
      var info = infoFor(iso);
      if (!info || !(info.badges || []).length) continue;   // 부적이 나오는 날에만
      if (!dayClickable(iso, info)) continue;
      var dist = Math.abs(d - t.d);
      if (dist < bestDist) { bestDist = dist; best = iso; }
    }
    return best;
  }
  /** 말풍선 — 칸 가장자리에서 잘리지 않게 좌우/아래로 뒤집어 단다 */
  function hintHTML(dow, row) {
    var cls = 'day__hint';
    if (row === 0) cls += ' day__hint--down';
    if (dow === 0) cls += ' day__hint--l';        // 일요일 칸 — 왼쪽 끝에 붙여 잘리지 않게
    else if (dow === 6) cls += ' day__hint--r';   // 토요일 칸 — 오른쪽 끝에 붙여서
    return '<span class="' + cls + '" aria-hidden="true">눌러서 부적 붙이기 <b>👆</b></span>';
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
    var hintIso = hintIsoFor(v, dim);
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
      else if (FREE_TRIAL_ENABLED && !state.unlocked && trialOver()) cls.push('day--locked');   // 체험 종료 — 오늘도 잠금
      if (iso === state.todayISO) cls.push('is-today');
      if (iso === state.sel) cls.push('is-sel');

      // 다섯 기운 모두 은은한 파스텔 바탕으로 구분한다 (2026-11-20 여백 개편)
      var lead = badges.length ? badges[0].cat : '';
      if (lead) cls.push('day--t-' + lead);

      badges.forEach(function (b) { if (stat[b.cat] != null) stat[b.cat]++; });

      var badgeHtml = badges.map(function (b) {
        return '<span class="badge badge--' + b.cat + ' day__badge">' + esc(b.text) + '</span>';
      }).join('');

      // 모아보기 — 조심할 날(입단속) / 좋은 날(소통·결정·머니)
      //  리셋(12절)은 달의 기준만 바꾸는 중립 신호라 어느 쪽에도 넣지 않는다(#9029 새 기준)
      var isBad = badges.some(function (b) { return b.cat === 'red'; });
      var isGood = badges.some(function (b) { return b.cat === 'gold' || b.cat === 'blue'; });
      var pick = '';
      if (state.filter === 'bad' && isBad) {
        pick = 'red';
      } else if (state.filter === 'good' && isGood) {
        pick = badges.some(function (b) { return b.cat === 'gold'; }) ? 'gold' : 'blue';
      }
      if (state.filter !== 'all') cls.push(pick ? 'day--pick day--pick--' + pick : 'day--dim');

      var open = isOpenDay(iso);
      // 평범한 날(배지 없음)은 눌러도 팝업이 없다 — 잠긴 날은 여는 방법을 알려 주려고 계속 연다
      // 체험 중에는 잔잔한 날·지난 날도 눌러 안내를 받는다 (2026-11-21 QA M3)
      var clickable = dayClickable(iso, info);
      var label = v.m + '월 ' + d + '일 ' + DOW_KO[info.dow] + '요일, ' + info.headline;
      if (iso < state.todayISO && !open) label = v.m + '월 ' + d + '일, 지난 날';
      var stamp = stampOf(iso);
      if (stamp && !badges.length) stamp = null;   // 부적은 기운이 흔들리는 날·경고등 켜진 날에만 남는다
      if (stamp) {
        cls.push('day--stamped');
        if (iso >= state.todayISO) label += ', 부적 스티커 붙음';
      }
      var stampEl = stamp ? stampElement(info) : '';
      // 내가 성찰 한 줄을 남긴 날 — 달력 칸에 작은 잉크 펜 점
      var noted = !!diaryOf(iso);
      if (noted) {
        cls.push('day--noted');
        label += ', 성찰 기록 있음';
      }

      var cellInner = '<span class="day__top">' +
        '<span class="day__num">' + d + '</span>' +
        (stamp
          ? '<span class="day__sticker' + (state.justStamped === iso ? ' is-new' : '') + '" aria-hidden="true">' +
            stickerSVG(stampEl) + '</span>'
          : '') +
        '</span>' +
        '<span class="day__badges">' + badgeHtml + '</span>' +
        (noted ? diaryDotHTML() : '');

      /* 첫 부적 말풍선 — 이 칸 위로 '눌러서 부적 붙이기 👆' */
      if (hintIso && iso === hintIso) {
        cls.push('day--hint');
        cellInner += hintHTML(info.dow, Math.floor((first + d - 1) / 7));
        label += ', 눌러서 부적 붙이기';
      }

      if (clickable) {
        html += '<button type="button" class="' + cls.join(' ') + '" data-iso="' + iso + '"' +
          (iso === state.sel ? ' aria-current="date"' : '') +
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
    $('#calGrid').classList.toggle('is-filtering', state.filter !== 'all');
    state.justStamped = null;

    renderFilter();
    renderFocusList(v);

    var bits = [];
    if (stat.gold) bits.push('소통 ' + stat.gold);
    if (stat.red) bits.push('입단속 ' + stat.red);
    if (stat.blue) bits.push('결정·머니 ' + stat.blue);
    if (stat.gray) bits.push('리셋 ' + stat.gray);
    $('#calSummary').textContent = bits.length ? bits.join('  ·  ') : '이 달은 표시할 신호가 적은 달이에요';

    $('#prevMonth').disabled = (v.y === 2026 && v.m === 11);
    $('#nextMonth').disabled = (v.y === 2027 && v.m === 12);

    renderSaeun(v, dim);

    syncTrialState();                     // 첫 방문일 기록이 끝난 뒤 문구 상태(체험 중/종료)를 맞춘다
    var tw = trialWindow();
    var freeEnd = tw ? T.parseISO(tw.end) : null;
    var noteText;
    if (!FREE_TRIAL_ENABLED || state.unlocked) {
      noteText = '날짜를 누르면 그날의 부적과 ✨ 오늘의 1줄 성찰이 함께 나와요. 기운이 있는 날만 눌려요.';
    } else if (trialOver() || !freeEnd) {
      noteText = '무료 ' + FREE_DAYS + '일 체험이 끝났어요 — 입장 코드를 넣으면 2026년 11월부터 2027년 12월까지 전체가 열려요.';
    } else {
      noteText = freeEnd.m + '월 ' + freeEnd.d + '일까지는 딱지가 붙은 날을 눌러 부적을 받아 스티커로 붙일 수 있어요. 그 뒤 날짜는 표시만 보이고, 누르면 여는 방법이 나옵니다.';
    }
    $('#calNote').textContent = noteText;

    // 📖 내 성찰 기록 보기 버튼의 일수
    var bk = $('#diaryBookCount');
    if (bk) {
      var nNote = diaryCount();
      bk.textContent = nNote ? nNote + '일' : '';
      bk.hidden = !nNote;
    }
    var bookBtn = $('#diaryBookBtn');
    if (bookBtn) bookBtn.hidden = !diaryAllowed();
  }

  /* ── 달력 아래: 이 달 조심할 날 · 좋은 날 목록 ─────────── */
  function renderFilter() {
    $$('#calFilter .calfilter__btn').forEach(function (b) {
      var on = b.getAttribute('data-filter') === state.filter;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    if ($('#calFilter')) $('#calFilter').classList.toggle('is-on', state.filter !== 'all');
  }

  function renderFocusList(v) {
    var box = $('#calFocus');
    if (!box) return;
    if (!state.res || state.filter === 'all') {
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    var isBad = state.filter === 'bad';
    var d = monthInfo(v.y, v.m);
    var list = isBad ? d.badDays : d.goodDays;
    box.hidden = false;

    if (!list.length) {
      box.innerHTML = '<p class="calfocus__empty">' +
        (isBad ? '이 달은 조심할 날이 따로 없어요. 흐름이 고른 달입니다.' : '이 달은 유난히 좋은 날이 적어요.') +
        '</p>';
      return;
    }

    var TAG_CAT = { '입단속': 'red', '리셋': 'gray', '소통': 'gold', '결정': 'blue', '머니': 'blue' };
    box.innerHTML =
      '<div class="calfocus__head">' +
        '<p class="calfocus__title">' + (isBad ? '⚠️ 이 달 챙겨둘 조심할 날' : '🍀 이 달 기분 좋은 날') + '</p>' +
      '</div>' +
      '<div class="calfocus__list">' +
        list.map(function (x) {
          return '<button type="button" class="fday' + (x.iso === state.todayISO ? ' is-today' : '') + '"' +
            ' data-iso="' + x.iso + '" aria-label="' + v.m + '월 ' + x.d + '일 ' + DOW_KO[x.dow] + '요일 ' +
            esc(x.tags.join(' ')) + ' — 이 날 부적 보기">' +
            '<span class="fday__date">' + v.m + '월 ' + x.d + '일<em>(' + DOW_KO[x.dow] + ')</em></span>' +
            x.tags.map(function (tg) {
              return '<span class="badge badge--' + (TAG_CAT[tg] || 'gray') + '">' + esc(tg) + '</span>';
            }).join('') +
            '</button>';
        }).join('') +
      '</div>' +
      '<p class="calfocus__hint">날짜를 누르면 그날의 부적이 바로 열려요.</p>';
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
    var hasBadges = !!(info.badges && info.badges.length);
    var lock = FREE_TRIAL_ENABLED && !inFree(iso);
    /* 체험 중 지난 날 — '지난 날'이라고 알려 주고 여는 방법을 보여 준다 (2026-11-21 QA M3) */
    var pastLock = lock && iso < state.todayISO;
    // 기운 태그가 없는 잔잔한 날은 원래 팝업을 열지 않는다.
    // 단, 성찰 다이어리가 열려 있는 동안은 365일 매일 한 줄을 남길 수 있게 팝업을 열고,
    // 잠긴 날(지난 날·체험 범위 밖)은 누르면 여는 방법을 알려 준다.
    if (!hasBadges && !diaryAllowed() && !lock) {
      toast(state.unlocked || !FREE_TRIAL_ENABLED
        ? '이 날은 특별히 피할 일 없이 잔잔하게 흘러가는 날이에요.'
        : '이 날은 딱지가 붙지 않은 잔잔한 날이에요 — 부적은 기운이 흔들리는 날에만 나와요');
      return;
    }
    lastFocus = document.activeElement;
    state.sel = iso;
    renderCalendar();                       // 날짜 칸 선택 표시
    modalBody.innerHTML = pastLock ? pastDayModalHTML(info)
      : (lock ? lockModalHTML(info) : (hasBadges ? briefModalHTML(info) : plainModalHTML(info)));
    modalDialog.classList.toggle('modal__dialog--lock', lock);
    modalDialog.classList.remove('is-lock-scrolled');
    modalEl.hidden = false;
    document.body.classList.add('is-modal-open');
    modalBody.scrollTop = 0;
    sfxOpen();                              // 뿅 — 사용자 클릭 안에서 재생
    try { modalDialog.focus({ preventScroll: true }); } catch (e) { modalDialog.focus(); }
    // 브라우저가 포커스·스크롤 복원으로 내용을 살짝 내려 두는 경우가 있어 한 번 더 0으로 되돌린다 (2026-11-21)
    requestAnimationFrame(function () { if (!modalEl.hidden) modalBody.scrollTop = 0; });
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
        // 팝업이 사라진 자리에서 달력 칸에 그날의 부적 스티커가 착
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

  /** 날짜 팝업 안 상단 점프 버튼 — 모바일에서 성찰 입력칸이 화면 밖으로 밀려"어떻게 작성하니" 하던 문제
     부적 패 바로 위, 첫 화면 안에 두어 누르면 성찰 카드로 내려가며 입력칸에 커서가 간다. */
  function diaryJumpHTML(info) {
    if (!diaryAllowed()) return '';
    var saved = !!diaryOf(info.iso);
    return '<button type="button" class="diaryjump" data-diary-jump ' +
      'aria-label="' + (saved ? '오늘 1줄 성찰 고치기 — 입력칸으로 이동' : '오늘 1줄 성찰 쓰기 — 입력칸으로 이동') + '">' +
      '<span class="diaryjump__ico" aria-hidden="true">✍️</span>' +
      '<span class="diaryjump__txt">' + (saved ? '오늘 1줄 성찰 고치기' : '오늘 1줄 성찰 쓰기') + '</span>' +
      '<span class="diaryjump__arw" aria-hidden="true">↓</span>' +
      '</button>';
  }

  /** 점프 — 성찰 카드로 부드럽게 내려가 바로 쓸 수 있게 (이미 남긴 날은 고치기 상태로) */
  function jumpToDiary() {
    if (!modalBody) return;
    var wrap = modalBody.querySelector('[data-diary]');
    if (!wrap) return;
    var editBtn = wrap.querySelector('[data-diary-edit]');
    if (editBtn) {                              // 이미 남긴 날 — 고치기 화면으로
      var iso = wrap.getAttribute('data-diary');
      var rec = iso ? diaryOf(iso) : null;
      if (rec) paintDiary(iso, rec.text || '');
      wrap = modalBody.querySelector('[data-diary]');
    }
    var ta = wrap ? wrap.querySelector('#diaryText') : null;
    if (wrap) {
      try { wrap.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { try { wrap.scrollIntoView(); } catch (e2) {} }
      wrap.classList.remove('is-jump');
      void wrap.offsetWidth;
      wrap.classList.add('is-jump');
      setTimeout(function () { if (wrap) wrap.classList.remove('is-jump'); }, 1500);
    }
    if (ta) { try { ta.focus({ preventScroll: true }); } catch (e) { try { ta.focus(); } catch (e2) {} } }
    sfxTap(1);
  }

  function briefModalHTML(info) {
    var today = info.iso === state.todayISO;
    // 부적 팝업은 캐릭터·이름표·톡톡톡·대사·스티커 완료 안내 → 그 아래 ✨ 오늘의 1줄 성찰 → 닫기 순서
    // (예전 맨 아래 '+ 이 날의 사주 풀이 보기' 접이식 풀이는 뺐다 — 2026-11-20)
    // ✍️ 오늘 1줄 성찰 쓰기 점프 버튼은 부적 패 위 — 모바일 첫 화면에 보이게 (2026-11-20 #8519)
    return modalHead(info) +
      '<p class="modal__headline">' + esc(info.headline) + '</p>' +
      diaryJumpHTML(info) +
      ritualHTML(info) +
      '<p class="modal__stamp-note"' + (stampOf(info.iso) ? '' : ' hidden') + '>' +
      '<span class="sticker-mini" aria-hidden="true">' + stickerSVG(stampElement(info)) + '</span>' +
      '✨ 달력에 ' + (today ? '오늘의' : '이 날의') + ' 부적 스티커를 착 붙였어요!</p>' +
      diarySectionHTML(info) +
      '<button type="button" class="btn btn--ghost modal__done-btn" data-modal-close>닫고 달력 보기</button>';
  }

  /** 기운 배지가 없는 잔잔한 날 — 부적 없이 오늘의 성찰만 남기는 팝업 */
  function plainModalHTML(info) {
    return modalHead(info) +
      '<p class="modal__headline">' + esc(info.headline) + '</p>' +
      '<p class="modal__calm">이 날은 부적이 나오는 날은 아니에요. 잔잔한 날일수록 한 줄 적어 두기 좋아요.</p>' +
      diarySectionHTML(info) +
      '<button type="button" class="btn btn--ghost modal__done-btn" data-modal-close>닫고 달력 보기</button>';
  }

  /** 잠금 카드·지난 날 안내에 같이 쓰는 상품 3개 버튼 — 제목 아래 한 줄로 '무엇이 들어 있는지'까지 (2026-11-21) */
  function lockShopButtonsHTML() {
    return '<button type="button" class="btn btn--ghost-light shop-btn" data-shop="pass">' +
      '<span class="shop-btn__no">1</span>' +
      '<span class="shop-btn__text">' +
      '<span class="shop-btn__label">🎟️ 1년 패스 · 14,900원</span>' +
      '<span class="shop-btn__desc">2027 타이밍 맵 · 1년 수호 부적 · 액운 태우기 5회</span>' +
      '</span></button>' +
      '<button type="button" class="btn btn--ghost-light shop-btn" data-shop="allinone">' +
      '<span class="shop-btn__no">2</span>' +
      '<span class="shop-btn__text">' +
      '<span class="shop-btn__label">👑 올인원 · 19,900원</span>' +
      '<span class="shop-btn__desc">1년 패스 전부 + 매일 일진 부적 · 매일 1회 액운 태우기</span>' +
      '</span></button>' +
      '<button type="button" class="btn btn--cream shop-btn" data-shop="diary">' +
      '<span class="shop-btn__no">3</span>' +
      '<span class="shop-btn__text">' +
      '<span class="shop-btn__label">✨ 성찰 에디션 · 24,900원 <span class="shop-btn__tag">추천</span></span>' +
      '<span class="shop-btn__desc">올인원 전부 + 365일 1줄 성찰 다이어리</span>' +
      '</span></button>';
  }

  /** 🎁 친구 초대 혜택 카드 — 결제를 망설이는 손님을 바로 초대 루프로 (2026-11-21 김나영 님 확정)
      사다리: 1명 액운 태우기 3회 + 전 상품 할인 쿠폰 · 3명 1개월 · 5명 2개월 · 10명 3개월 패스 */
  function inviteCardHTML(cls) {
    return '<div class="invitecard' + (cls ? ' ' + cls : '') + '">' +
      '<p class="invitecard__t">🎁 친구 초대하면 무료로 열려요</p>' +
      '<p class="invitecard__d"><b>1명</b> 액운3회+할인 · <b>3명</b> 1개월 · <b>5명</b> 2개월 · <b>10명</b> 3개월</p>' +
      '<a class="invitecard__go" href="./member/">친구 초대·케미로 열기 →</a>' +
      '</div>';
  }
  /** 잠금 팝업 하단 — 결제 버튼 아래, 부담 없는 친구 초대 링크 (2026-11-21) */
  function lockInviteHTML() {
    return inviteCardHTML('invitecard--lock');
  }

  /** 잠금 팝업 머리 — 스크롤이 생겨도 날짜가 상단 버튼 아래에서 잘리지 않게
     한 덩어리로 묶어 sticky 로 붙인다 (2026-11-21) */
  function lockHeadHTML(info, eyebrow) {
    return '<div class="lock__head">' +
      '<p class="modal__eyebrow">' + eyebrow + '</p>' +
      '<p class="modal__date" id="modalTitle">' + fmtMD(info.iso) +
      '<span>' + DOW_KO[info.dow] + '요일 · ' + esc(info.gz.textKo) + '일' +
      (info.saeun ? ' · ' + esc(info.saeun.label) : '') + '</span></p>' +
      (info.term ? '<p class="lock__term">' + esc(info.term.ko) + ' ' + esc(info.term.time) +
        (info.term.isJie ? ' · ' + esc(info.term.monthText) + '월 시작' : '') + '</p>' : '') +
      '</div>';
  }

  /** 무료 체험 중 '지난 날'을 눌렀을 때 — 왜 안 열리는지와 여는 방법 (2026-11-21 QA M3) */
  function pastDayModalHTML(info) {
    var tw = trialWindow();
    var fe = tw ? T.parseISO(tw.end) : T.parseISO(state.todayISO);
    var ws = tw ? T.parseISO(tw.start) : T.parseISO(state.todayISO);
    var marks = info.marks.filter(function (m) { return !m.minor && m.cat !== 'gray'; }).slice(0, 2);
    var markHtml = marks.map(function (m) {
      return '<span class="mark"><span class="mark__dot dot dot--' + m.cat + '"></span>' + esc(m.label) + '</span>';
    }).join('');
    return lockHeadHTML(info, trialOver() ? 'FREE TRIAL · ENDED' : 'FREE TRIAL · 지난 날') +
      '<p class="lock__title">🕘 지난 날이에요</p>' +
      '<p class="lock__sub">' + (trialOver()
        ? '무료 ' + FREE_DAYS + '일 체험(' + ws.m + '월 ' + ws.d + '일~' + fe.m + '월 ' + fe.d +
          '일)이 끝났어요. 입장 코드를 넣으면 <b>2026년 11월부터 2027년 12월까지</b> 지난 날도 모두 열립니다.'
        : '무료 체험은 ' + ws.m + '월 ' + ws.d + '일부터 ' + FREE_DAYS + '일(' + fe.m + '월 ' + fe.d +
          '일까지)만 열려요. 입장 코드를 넣으면 <b>2026년 11월부터 2027년 12월까지</b> 지난 날도 모두 열립니다.') + '</p>' +
      diaryTrialLine() +
      (markHtml ? '<div class="lock__marks">' + markHtml + '</div>' : '') +
      '<div class="lock__actions">' + lockShopButtonsHTML() + '</div>' +
      lockInviteHTML() +
      '<button type="button" class="btn modal__done-btn modal__done-btn--dark" data-modal-close>닫고 달력 보기</button>' +
      '<button type="button" class="lock__code" data-lock-open>🔑 입장 코드가 있어요</button>';
  }

  /** 잠금·결제 팝업에 붙는 '성찰 다이어리 3회 무료 체험' 한 줄 (2026-11-21) */
  function diaryTrialLine() {
    if (!diaryTryEligible()) return '';
    var left = diaryTryLeft();
    return '<p class="lock__diary">✨ 1줄 성찰 다이어리도 ' + (left > 0
      ? '<b>3회 무료 체험</b> 중 — ' + left + '회 남았어요'
      : '<b>3회 무료 체험</b>을 다 썼어요 — 성찰 에디션에서 계속') + '</p>';
  }
  function lockModalHTML(info) {
    var marks = info.marks.filter(function (m) { return !m.minor && m.cat !== 'gray'; }).slice(0, 2);
    var markHtml = marks.map(function (m) {
      return '<span class="mark"><span class="mark__dot dot dot--' + m.cat + '"></span>' + esc(m.label) + '</span>';
    }).join('');
    var tw = trialWindow();
    var fe = tw ? T.parseISO(tw.end) : T.parseISO(state.todayISO);
    var ws = tw ? T.parseISO(tw.start) : null;
    var over = trialOver();
    return lockHeadHTML(info, over ? 'FREE TRIAL · ENDED' : 'FREE TRIAL · 3 DAYS') +
      (over
        ? '<p class="lock__title">🔒 무료 ' + FREE_DAYS + '일 체험이 끝났어요<br>입장 코드를 넣으면 전체가 열려요</p>'
        : '<p class="lock__title">🔒 ' + FREE_DAYS + '일 무료 체험 이후<br>2026년 11월 ~ 2027년 12월 전체 열기</p>') +
      '<p class="lock__sub">1년 패스 / 올인원 / 성찰 에디션 — 결제하시면 <b>결제하신 휴대폰 번호 + 6자리 코드</b>를 카톡으로 보내 드려요</p>' +
      diaryTrialLine() +
      '<p class="lock__early">지금 열면 2026년 11월부터 2027년 12월까지 14개월이 한 번에 열려요!</p>' +
      (markHtml ? '<div class="lock__marks">' + markHtml + '</div>' : '') +
      '<p class="lock__hint">' + (over
        ? '무료 체험은 ' + (ws ? ws.m + '월 ' + ws.d + '일~' : '') + fe.m + '월 ' + fe.d +
          '일이었어요. 입장 코드를 넣으면 이 사주로 2026년 11월부터 2027년 12월까지 전부 열려요.'
        : '이 날의 이야기는 무료 구간(' + fe.m + '월 ' + fe.d + '일까지) 밖이에요. ' +
          '입장 코드를 넣으면 이 사주로 지난 날까지 전부 열려요.') + '</p>' +
      '<div class="lock__actions">' +
      lockShopButtonsHTML() +
      '</div>' +
      lockInviteHTML() +
      '<button type="button" class="btn modal__done-btn modal__done-btn--dark" data-modal-close>닫고 달력 보기</button>' +
      '<button type="button" class="lock__code" data-lock-open>🔑 입장 코드가 있어요</button>';
  }

  /* ── 결제가 끝난 고객의 CTA (2026-11-21 QA M2) ──────────────────────────
     이미 열려 있는 등급의 상품은 '적용 중'으로 바꿔 같은 상품을 또 팔지 않는다.
     더 높은 등급만 차액 업그레이드로 안내한다. 무료 체험 상태에서는 원래 문구 그대로. */
  var TIER_PRICE_NUM = { pass: 14900, allinone: 19900, diary: 24900 };
  /* 업그레이드 금액 — 앱 안에서 이미 안내하던 1년 패스 → 올인원 7,900원 그대로.
     성찰 에디션은 정해진 차액이 없어 카톡으로 안내한다 (diaryShopHTML 과 같은 기준). */
  var TIER_UP_PRICE = { 'pass>allinone': 7900 };
  var OWNED_DESC = {
    pass: '이미 갖고 있는 상품이에요 — 다시 결제하실 필요 없어요',
    allinone: '1년 패스 전부 + 매일 일진 부적 + 매일 1회 액운 태우기',
    diary: '1년 패스 전부 + 매일 부적 + 매일 1회 액운 태우기 + 성찰 다이어리'
  };
  var UPGRADE_GAIN = {
    allinone: '매일 일진 부적 · 매일 1회 액운 태우기까지',
    diary: '365일 1줄 성찰 다이어리 · 내 기록 저장까지'
  };
  function wonNum(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '원'; }
  function upPrice(from, to) { return TIER_UP_PRICE[from + '>' + to] || 0; }

  /** 맨 아래 카드(1년 패스 · 올인원 · 성찰)를 지금 적용된 티어에 맞춰 바꿔 그린다
      2026-11-22 개편 — 이미 산 등급과 그 아래 등급 카드는 **아예 숨긴다**.
      (성찰 에디션 보유 시 '✅ 성찰 에디션 적용 중' 박스가 3칸 중복으로 뜨던 문제)
      · 1년 패스 → 올인원 · 성찰 업그레이드 + ⚡ 개운템 + 상담 + 초대 할인
      · 올인원 → 성찰 업그레이드 + ⚡ 개운템 + 상담 + 초대 할인
      · 성찰 → 티어 카드 전부 숨김 + ⚡ 개운템 + 상담 + 초대 할인만 콤팩트하게 */
  function renderCtaSteps() {
    var box = $('#ctaSteps');
    if (!box) return;
    var tier = state.unlocked && TIER_NAME[state.tier] ? state.tier : '';
    var rank = tier ? (TIER_RANK[tier] || 0) : 0;
    $$('.shop-btn[data-shop]', box).forEach(function (b) {
      var kind = b.getAttribute('data-shop');
      var no = b.querySelector('.shop-btn__no');
      var label = b.querySelector('.shop-btn__label');
      var desc = b.querySelector('.shop-btn__desc');
      if (!b.getAttribute('data-cta-base')) {          // 처음 문구를 기억해 두었다가 해제하면 그대로 되돌린다
        b.setAttribute('data-cta-base', '1');
        b.setAttribute('data-cta-no', no ? no.textContent : '');
        b.setAttribute('data-cta-label', label ? label.innerHTML : '');
        b.setAttribute('data-cta-desc', desc ? desc.textContent : '');
      }
      /* 먼저 처음 그대로 되돌린 뒤 다시 그린다 — 티어가 바뀌어도 기준이 흔들리지 않게 */
      b.hidden = false;
      b.classList.remove('shop-btn--owned', 'shop-btn--up');
      b.removeAttribute('aria-disabled');
      b.removeAttribute('aria-label');
      if (no) no.textContent = b.getAttribute('data-cta-no') || '';
      if (label) label.innerHTML = b.getAttribute('data-cta-label') || '';
      if (desc) desc.textContent = b.getAttribute('data-cta-desc') || '';

      if (!TIER_NAME[kind]) {                           // ⚡ 긴급 개운템 — 늘 그대로 남는다
        if (no && rank) no.textContent = '⚡';            // 티어 카드가 하나도 없을 땐 번호 대신 ⚡
        return;
      }
      if (!rank) return;                               // 미결제·무료 체험 — 네 칸 그대로
      var k = TIER_RANK[kind] || 0;
      if (k <= rank) { b.hidden = true; return; }      // 이미 산 등급과 그 아래 등급은 숨긴다
      var fee = upPrice(tier, kind);
      b.classList.add('shop-btn--up');
      if (no) no.textContent = '↑';
      if (label) label.innerHTML = '⬆️ ' + esc(TIER_NAME[kind]) + ' 업그레이드' + (fee ? ' <b>' + wonNum(fee) + '</b>' : '');
      if (desc) desc.textContent = (fee ? '차액 ' + wonNum(fee) + '만 더 내면 돼요' : '차액은 카톡으로 안내드려요') +
        ' · ' + (UPGRADE_GAIN[kind] || '');
      b.setAttribute('aria-label', TIER_NAME[kind] + ' 업그레이드' + (fee ? ' — 차액 ' + wonNum(fee) : ' — 차액은 카톡으로 안내'));
    });

    /* 결제자 — 초대 할인 한 줄 · 제목도 '네 가지 방법'에서 다음 걸음으로 */
    var paid = !!rank;
    var paidBox = $('#ctaPaid'), paidD = $('#ctaPaidD'), paidT = $('#ctaPaidT');
    if (paidBox) paidBox.hidden = !paid;
    if (paidT) paidT.innerHTML = INVITE_PAID_TITLE;          /* 1안 — 부제는 단계 요약 대신 한 줄 */
    if (paid && paidD) paidD.textContent = INVITE_PAID_SUB;
    var title = $('#ctaTitle');
    if (title) {
      if (!title.getAttribute('data-base')) title.setAttribute('data-base', title.innerHTML);
      title.innerHTML = paid ? '이미 다 열려 있어요<br>다음 한 걸음만' : title.getAttribute('data-base');
    }
    var consult = $('#ctaConsult');
    if (consult) {
      if (!consult.getAttribute('data-base')) consult.setAttribute('data-base', consult.innerHTML);
      consult.innerHTML = paid
        ? '더 깊이 보고 싶으면 <button type="button" class="cta__consult-btn" data-shop="consult">🔎 <b>1:1 상담</b> · 원포인트 49,000 · 시그니처 100,000 →</button>'
        : consult.getAttribute('data-base');
    }
    box.classList.toggle('is-compact', paid);
  }

  /* ── 초대 사다리 문구 — 미결제 / 결제자 (2026‑11‑22 김나영 님 확정) ── */
  var LADDER_TEXT_FREE = '1명 액운3회+할인 · 3명 1개월 · 5명 2개월 · 10명 3개월';
  var LADDER_TEXT_PAID = {
    pass: '1명 상담 5천원 · 3명 올인원 무료 · 5명 원포인트 반값 · 10명 시그니처 반값',
    allinone: '1명 상담 5천원 · 3명 성찰 에디션 무료 · 5명 원포인트 반값 · 10명 시그니처 반값',
    diary: '1명 상담 5천원 · 3명 상담 1만원 · 5명 원포인트 반값 · 10명 시그니처 반값'
  };
  /* 결제자 초대 문구 1안 (2026-11-22 김나영 님 확정)
     — 시작값('5,000원~50%')으로 약해 보이던 표현을 빼고, 첫 단계 혜택을 앞세운다.
       1명~10명 세부 단계는 /calendar/member/ 사다리에서 그대로 보여 준다. */
  var INVITE_PAID_TITLE = '🎁 친구 초대하면 <b>1:1 상담 최대 반값(50%)</b>';
  var INVITE_PAID_SUB = '1명만 초대해도 바로 5천원 할인 · 단계별 혜택 보기';

  /** ✨ 케미·초대 배너 — 결제자에겐 '상담 최대 반값' 1안 문구, 미결제자는 지금 그대로 */
  function renderChemiBanner() {
    var tier = state.unlocked && TIER_NAME[state.tier] ? state.tier : '';
    var t = $('#chemiBannerT'), d = $('#chemiBannerD');
    if (t) {
      t.innerHTML = tier
        ? INVITE_PAID_TITLE
        : '✨ 친구·연인과 2027년 케미 보고,<br>친구 초대하면 한 칸씩 열려요';
    }
    if (d) d.textContent = tier ? INVITE_PAID_SUB : LADDER_TEXT_FREE;
  }

  /* ── 🧭 4칸 바로가기 — 누르면 그 자리로 부드럽게 (2026‑11‑22) ── */
  function jumpToSection(kind) {
    var target = kind === 'burn' ? $('#burnCard')
      : (kind === 'care' ? $('#careCard') : null);
    if (!target && kind === 'cal') {
      var grid = $('#calGrid');
      target = (grid && grid.closest) ? (grid.closest('.card--cal') || grid) : grid;
    }
    if (!target) return;
    var reduce = false;
    try { reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) {}
    try { target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }); }
    catch (e) { try { target.scrollIntoView(); } catch (e2) {} }
    target.classList.remove('is-jump-flash');
    void target.offsetWidth;
    target.classList.add('is-jump-flash');
    setTimeout(function () { target.classList.remove('is-jump-flash'); }, 1300);
  }

  /* ── 앱 안 구입 팝업 (1년 패스 · 올인원 패키지 · 긴급 개운템) ──────
     버튼을 누르면 리틀리로 튕기지 않고 이 팝업이 열립니다.
     실제 결제 링크가 생기면 위쪽 PASS/ALLINONE/CARE_CHECKOUT_URL 만 바꾸면 됩니다.
     문구 원칙 — 사주를 모르는 고객이 한 번에 알아듣는 말로만 씁니다.
     ('원국', '24절기 월운' 같은 용어는 쓰지 않습니다.)
     100% 디지털 상품입니다. 실물 다이어리·배송은 넣지 않습니다. */
  var PASS_PRICE = '14,900원';
  var ALLINONE_PRICE = '19,900원';
  var DIARY_PRICE = '24,900원';
  var CARE_PRICE = '1종 2,900원 · 3종 풀세트 5,900원';
  var CONSULT_PRICE = '49,000원';

  /* ── 1:1 상담 두 상품 (2026-11-22 개편) ────────────────────────────
     원포인트·시그니처를 팝업 맨 위에서 고르고, 고른 상품 그대로 결제한다.
       · 원포인트 리딩 49,000원 — 지금 걸리는 고민 1가지
       · 시그니처 리딩 100,000원 — 기질부터 대운·세운까지 전체 흐름
     페이앱 링크는 /apply/ 와 같은 것을 쓴다(원포인트 z4ovI1 · 시그니처 z4ovJ1). */
  var CONSULT_SIG_PRICE = '100,000원';
  var CONSULT_PRODUCTS = {
    onepoint: {
      key: 'onepoint', item: 'consult', ic: '🔎', name: '원포인트 리딩', price: CONSULT_PRICE, df: '고민 1가지',
      sub: '캘린더로도 계속 걸리는 <b>딱 1가지 고민</b>만 놓고, 지금 움직일지 기다릴지 명쾌하게 짚어 드려요.',
      list: [
        ['딱 1가지 핵심 질문 집중', '이직·계약·관계·시기 중 지금 가장 급한 문제 하나만 깊게 봅니다'],
        ['지금 할 일 · 미룰 일 정리', '바로 움직일 때인지, 한 템포 쉴 때인지 방향을 딱 갈라 드려요'],
        ['일정은 카카오톡 채널에서', '결제한 뒤 아래 신청서를 채워 보내 주시면 일정을 바로 잡아 드려요']
      ],
      priceLabel: '윤이세 1:1 원포인트 리딩',
      qLb: '⑥ 궁금한 점', qHint: '1가지면 충분해요', qPh: '예: 지금 이직을 해도 될까요?',
      order: '[윤이세 1:1 원포인트 리딩 신청] ' + CONSULT_PRICE
    },
    signature: {
      key: 'signature', item: 'consult-sig', ic: '🌿', name: '시그니처 리딩', price: CONSULT_SIG_PRICE, df: '전체 흐름',
      sub: '타고난 기질부터 재물·관계·일의 흐름, <b>대운의 큰 방향</b>까지 한 번에 보는 대표 상담이에요.',
      list: [
        ['타고난 기질과 강점', '명식 전체를 놓고 어떤 사람인지, 어디서 힘이 나는지부터'],
        ['재물 · 관계 · 일의 흐름', '돈이 붙는 자리와 새는 자리, 사람과 일에서의 결을 짚어 드려요'],
        ['대운·세운으로 보는 방향', '앞으로 몇 해를 크게 보고, 지금 무엇을 해야 할지 정리합니다']
      ],
      priceLabel: '윤이세 1:1 시그니처 리딩',
      qLb: '⑥ 가장 궁금한 점', qHint: '전체 흐름을 보되 이건 꼭', qPh: '예: 올해 이직과 돈 흐름이 궁금해요',
      order: '[윤이세 1:1 시그니처 리딩 신청] ' + CONSULT_SIG_PRICE
    }
  };
  function consultProduct(item) {
    return String(item || '') === 'consult-sig' ? CONSULT_PRODUCTS.signature : CONSULT_PRODUCTS.onepoint;
  }

  var shopEl = null, shopBody = null, shopDialog = null, shopLastFocus = null, shopClosing = false;

  function priceHTML(label, price) {
    return '<div class="shop__price"><span>' + esc(label) + '</span>' +
      '<b>' + esc(price) + '</b></div>';
  }

  /* ── 결제 팝업 맨 위 3단 상품 비교·전환 (2026-11-21) ────────────────
     1년 패스 버튼으로 팝업을 열면 다른 두 상품(올인원·성찰 에디션)이
     아예 보이지 않던 문제를 없앤다. 지금 보는 구성은 금테+금색 배지로
     강조하고, 나머지를 누르면 팝업 내용과 페이앱 결제 링크가 그 자리에서
     바뀐다 (data-shop-switch="pass|allinone|diary"). */
  var TIERSW = [
    { k: 'pass', ic: '🎟️', nm: '1년 패스', pr: PASS_PRICE, df: '달력·1년 부적·태우기 5회', tag: '' },
    { k: 'allinone', ic: '👑', nm: '올인원', pr: ALLINONE_PRICE, df: '매일 일진부적·매일 1회 태우기', tag: '인기' },
    { k: 'diary', ic: '✨', nm: '성찰 에디션', pr: DIARY_PRICE, df: '365일 1줄 다이어리 · 지금 3회 무료', tag: '추천' }
  ];
  function tierswHTML(active) {
    return '<div class="tiersw" role="group" aria-label="2027 상품 세 가지 — 눌러서 비교하고 바꿔 보세요">' +
      TIERSW.map(function (t) {
        var on = t.k === active;
        return '<button type="button" class="tiersw__b' + (on ? ' is-on' : '') + '"' +
          ' data-shop-switch="' + t.k + '" aria-pressed="' + (on ? 'true' : 'false') + '"' +
          ' aria-label="' + esc(t.nm + ' ' + t.pr + (t.tag ? ' ' + t.tag : '') + (on ? ' — 지금 보고 있는 구성' : ' — 이 구성 보기')) + '">' +
          (t.tag ? '<span class="tiersw__tag">' + esc(t.tag) + '</span>' : '') +
          '<span class="tiersw__nm"><span class="tiersw__ic" aria-hidden="true">' + t.ic + '</span> ' + esc(t.nm) + '</span>' +
          '<span class="tiersw__pr">' + esc(t.pr) + '</span>' +
          '<span class="tiersw__df">' + esc(t.df) + '</span>' +
          '</button>';
      }).join('') +
      '</div>' +
      '<p class="tiersw__hint">다른 구성을 누르면 그 자리에서 바로 바뀌어요 · ✨ 1줄 성찰 다이어리는 <b>3회 무료 체험</b> 중</p>';
  }

  /* ── 결제 두 버튼 — 💳 카드결제 (페이앱) · 🏦 계좌이체 ────────────────────
     item: 'pass' | 'allinone' | 'care-one' | 'care-set' | 'consult'
     위쪽 '결제 설정' 값이 비어 있으면 카카오톡 채널로 안내하고,
     값이 채워지면 그 자리에서 페이앱 결제창 이동 / 계좌번호 복사가 동작합니다. */
  /* ── 페이앱 JS 직행 결제 (2026-11-21) ──────────────────────────────────
     페이앱 '상품 링크'(www.payapp.kr/L/…)를 그냥 열면 **연락처를 받는 화면**이 먼저 나옵니다.
     payapp-lite.js 로 상점명·상품명·금액·받는 번호를 실어 보내면 그 화면을 건너뛰고
     바로 결제수단(카드·간편결제) 선택 화면으로 들어갑니다 — /apply/ 와 같은 방식입니다.
       · payapp-lite.js 가 안 실렸거나(차단·오프라인) 실패하면 지금까지처럼 링크로 엽니다.
       · 받는 번호(recvphone)는 **숫자만** 넘겨야 합니다('010-…' 는 페이앱이 거부).
       · returnurl 로 결제 직후 이 달력에 스스로 돌아옵니다(2026-11-21) — 뒤로가기를 누를 필요가 없다.
       · 적은 번호는 코드 확인용으로 이 기기(localStorage)에만 남깁니다 — 서버로 보내지 않습니다. */
  var PAYAPP = { userid: 'yoonise', shopname: '윤이세사주' };
  /* 결제창에 찍히는 상품명 — 기존 결제 링크(z4otyE·z4otzE·z4ovHA·z4ovI1)와 같은 이름으로 맞춘다.
     차액 업그레이드(7,900원)는 링크가 없어도 JS 로 금액을 실어 보낼 수 있다. */
  var PAYINFO = {
    'pass': { name: '2027년 1년 타이밍패스', price: 14900 },
    'allinone': { name: '2027 올인원패키지', price: 19900 },
    'diary': { name: '성찰에디션', price: 24900 },
    'consult': { name: '원포인트 고민해결', price: 49000 },
    'consult-sig': { name: '시그니처 리딩', price: 100000 },
    'up-allinone': { name: '2027 올인원 업그레이드', price: 7900 }
  };
  function payInfoOf(item) {
    var it = String(item || '');
    var m = /^up-(allinone|diary)$/.exec(it);
    if (m) {                                  // 업그레이드 금액은 위 티어 차액표에서 가져온다
      var from = state.unlocked && TIER_NAME[state.tier] ? state.tier : 'pass';
      var fee = upPrice(from, m[1]);
      if (PAYINFO[it]) return fee ? { name: PAYINFO[it].name, price: fee } : null;
      return null;
    }
    return PAYINFO[it] || null;
  }
  /* '010-1234-5678' · '01012345678' · '010 1234 5678' → '01012345678' (휴대폰만) */
  function mobileOf(v) {
    var m = String(v || '').replace(/[^0-9]/g, '').match(/^01([016789])([0-9]{3,4})([0-9]{4})$/);
    return m ? '01' + m[1] + m[2] + m[3] : '';
  }
  /* '01012345678' → '010-1234-5678' (적어 둔 번호를 카톡 접수 문구에 그대로 쓸 때) */
  function fmtPhone(d) {
    return String(d || '').replace(/^(01[016789])([0-9]{3,4})([0-9]{4})$/, '$1-$2-$3');
  }
  /* 결제 팝업에 적어 둔 번호 — 팝업을 다시 그려도(티어 전환) 그대로 남긴다 */
  var payPhone = '';
  var lastPayPhoneMirror = '';   // 결제 확인용 번호를 신청서 ⑤칸에 그대로 채웠는지 기억
  /* ── 결제창을 **이 창에서** 열기 때문에, 결제를 마치고 돌아오면 달력이 새로 열립니다.
        그때 '결제 완료 → 카톡으로 코드 받기' 한 걸음을 잃지 않게, 방금 결제하러 간 상품을
        3시간 동안 세션에 기억해 두고 돌아오면 결과 맨 위에 한 줄로 다시 내밉니다. (2026-11-21) */
  var PAYWAIT_KEY = 'yoonise.timing.paywait.v1';
  var PAYWAIT_MS = 3 * 60 * 60 * 1000;
  /* 결제하며 적은 휴대폰 번호 — 결제창을 다녀와도 입장 코드 칸에 그대로 채워 두려고 이 기기에만 남긴다.
     (이 번호 + 6자리 코드가 한 쌍이라, 번호를 다시 찾지 않아도 되게) */
  var PHONE_KEY = 'yoonise.timing.phone.v1';
  function rememberPhone(phone) {
    var d = mobileOf(phone);
    if (!d) return;
    payPhone = d;
    try { localStorage.setItem(PHONE_KEY, d); } catch (e) { }
  }
  function rememberedPhone() {
    var d = '';
    try { d = localStorage.getItem(PHONE_KEY) || ''; } catch (e) { d = ''; }
    return mobileOf(d) || mobileOf(payPhone) || '';
  }
  function payWaitSave(item, phone) {
    try { sessionStorage.setItem(PAYWAIT_KEY, JSON.stringify({ item: String(item), phone: String(phone || ''), t: Date.now() })); } catch (e) { }
  }
  function payWaitRead() {
    var o = null;
    try { o = JSON.parse(sessionStorage.getItem(PAYWAIT_KEY) || 'null'); } catch (e) { o = null; }
    if (!o || !o.item || !o.t || (Date.now() - o.t) > PAYWAIT_MS) return null;
    return o;
  }
  function payWaitClear() { try { sessionStorage.removeItem(PAYWAIT_KEY); } catch (e) { } }
  var payBackItem = '';
  function payBackCheck() {
    var bar = $('#payBack');
    if (!bar) return;
    var o = payWaitRead();
    if (!o) { bar.hidden = true; return; }
    payBackItem = o.item;
    /* 결제창으로 넘어가기 전에 적어 둔 번호를 그대로 살려 — 카톡 접수 문구에 바로 채워지고,
       입장 코드 칸에도 미리 들어간다 */
    if (o.phone) { rememberPhone(o.phone); payChoice[String(o.item)] = 'card'; }
    var what = $('#payBackWhat');
    if (what) what.textContent = orderLabel(o.item) + ' · 결제를 마치셨다면 한 번만 눌러 주세요.';
    /* 1:1 상담(원포인트·시그니처)은 코드가 아니라 신청서로 이어진다 — 버튼 문구도 그에 맞춰 */
    var consultPay = /^consult/.test(String(o.item));
    var go = $('#payBackGo');
    if (go) go.textContent = consultPay ? '📝 신청서 적고 접수하기' : '💬 카톡으로 입장 코드 받기';
    var codeBtn = $('#payBackCode');
    if (codeBtn) codeBtn.hidden = consultPay;     // 상담은 입장 코드가 없어요
    bar.hidden = false;
  }
  /* 페이앱이 결제 완료 후 returnurl 로 되돌려 보낸 경우(?paid=1) —
     결제하러 간 상품을 주소에 실어 두었으니, 세션이 끊겼어도 복귀 배너를 띄운다.
     띄운 뒤에는 주소에서 paid=1 을 지워(새로고침해도 다시 뜨지 않게) 깔끔한 달력 주소로 되돌린다. */
  function payReturnCheck() {
    var q = '';
    try { q = String(location.search || ''); } catch (e) { return; }
    if (!/[?&]paid=1(&|$)/.test(q)) return;
    var m = /[?&]o=([A-Za-z0-9-]+)/.exec(q);
    var item = m ? decodeURIComponent(m[1]) : '';
    if (!payWaitRead() && item && (payInfoOf(item) || /^care-/.test(item))) payWaitSave(item, '');
    try {
      if (history.replaceState) history.replaceState(null, '', location.pathname + location.hash);
    } catch (e) { }
  }
  function payappGo(item, phone) {
    if (typeof PayApp === 'undefined' || !PayApp || typeof PayApp.payrequest !== 'function') return false;
    var info = payInfoOf(item);
    if (!info || !info.price || !phone) return false;
    payWaitSave(item, phone);
    rememberPhone(phone);
    PayApp.setTarget('_self');            /* 팝업 대신 이 창 — 카톡 인앱 브라우저에서도 막히지 않게 */
    PayApp.setDefault({ userid: PAYAPP.userid, shopname: PAYAPP.shopname });
    PayApp.setParam({
      goodname: info.name,
      price: String(info.price),
      recvphone: phone,                   /* 숫자만 — 코드를 받으실 번호 */
      redirectpay: '1',                   /* 연락처 입력 화면 없이 결제수단 선택으로 직행 */
      smsuse: 'n',                        /* 결제요청 문자는 보내지 않는다 */
      charset: 'utf-8',
      returnurl: payReturnUrl(item),      /* 결제 완료 후 이 달력으로 스스로 돌아온다 (뒤로가기 불필요) */
      var1: String(item)                  /* 결제내역에서 상품 구분용 */
    });
    /* skip_cstpage 는 넣지 않는다 — GitHub Pages 가 POST 를 405 로 막아 흰 화면이 된다 */
    PayApp.payrequest();
    return true;
  }
  /** 페이앱 returnurl — 결제를 마치면 매출전표의 '확인'을 누를 때 이 달력으로 되돌아온다.
     돌아온 주소(?paid=1)를 보면 결과 맨 위에 '카톡으로 입장 코드 받기' 배너를 바로 띄운다. */
  function payReturnUrl(item) {
    var base = '';
    try { base = location.origin + location.pathname; } catch (e) { base = ''; }
    return base + '?paid=1&o=' + encodeURIComponent(String(item || ''));
  }
  /* 번호 입력칸 — 결제 버튼 바로 위 한 칸. 이 번호로 페이앱이 결제를 받고, 코드도 이 번호로 간다. */
  function phoneFieldHTML(item) {
    var consult = /^consult/.test(String(item || ''));
    return '<label class="payphone" for="payPhone-' + esc(item) + '">' +
      '<span class="payphone__lb"><b>' + (consult ? '📱 결제 확인용 휴대폰 번호' : '📱 입장 코드 받으실 휴대폰 번호') + '</b>' +
      '<span>적으면 결제창이 한 단계 줄어요</span></span>' +
      '<input class="payphone__inp" id="payPhone-' + esc(item) + '" type="tel" inputmode="numeric"' +
      ' autocomplete="tel" maxlength="13" placeholder="010-1234-5678"' +
      ' value="' + esc(payPhone) + '" data-pay-phone="' + esc(item) + '">' +
      '<span class="payphone__hint">' + (consult
        ? '결제 확인에만 써요 · 이 기기에만 기억해요'
        : '결제 확인과 코드 발송에만 써요 · 이 기기에만 기억해요') + '</span>' +
      '</label>';
  }
  function payPhoneVal() {
    var inp = shopBody ? shopBody.querySelector('[data-pay-phone]') : null;
    return inp ? inp.value : payPhone;
  }
  function payPhoneFocus() {
    var inp = shopBody ? shopBody.querySelector('[data-pay-phone]') : null;
    if (!inp) return;
    try { inp.focus({ preventScroll: false }); } catch (e) { try { inp.focus(); } catch (e2) { } }
    inp.classList.remove('is-shake');
    void inp.offsetWidth;
    inp.classList.add('is-shake');
  }

  function cardUrlOf(item) {
    var map = {
      'pass': PAYAPP_PASS_URL,
      'allinone': PAYAPP_ALLINONE_URL,
      'diary': PAYAPP_DIARY_URL,
      'care-one': PAYAPP_CARE_ONE_URL,
      'care-set': PAYAPP_CARE_SET_URL,
      'consult': PAYAPP_CONSULT_URL,
      'consult-sig': PAYAPP_SIGNATURE_URL
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

  /* opts.card === false 이면 카드 버튼 없이 계좌이체 하나만 (1만 원 미만 소액 상품)
     opts.bankSub 로 계좌이체 버튼 아래 문구를 바꿀 수 있다 (선택한 구성·금액 표시) */
  function payActionsHTML(item, opts) {
    opts = opts || {};
    var withCard = opts.card !== false;
    var cardUrl = cardUrlOf(item);
    var payInfo = payInfoOf(item);
    var card = !!(cardUrl || payInfo);
    var bank = bankReady();
    var bankSub = opts.bankSub || (bank ? esc(String(BANK_NAME).trim()) + ' · 계좌번호 복사' : '카카오톡으로 입금 계좌 안내');
    var cardInner = '<span class="pay__ico" aria-hidden="true">💳</span>' +
      '<span class="pay__label"><b>카드결제</b>' +
      '<span>' + (card ? '카드·간편결제로 바로 결제' : '카카오톡으로 결제 링크 받기') + '</span></span>';
    /* 카드결제 — 페이앱 결제 링크가 있는 상품은 **진짜 링크**로 만든다(#8847).
       인앱 브라우저는 스크립트가 여는 새 창(window.open)을 팝업으로 막지만,
       사용자가 누르는 <a target="_blank"> 이동은 막지 않는다.
       (번호를 적었으면 클릭 순간 JS 직행으로 가로챈다 — 아래 shopEl click 핸들러)
       링크 없이 금액만 있는 차액 업그레이드는 버튼으로 그린다. */
    var cardBtn = cardUrl
      ? '<a class="pay__btn pay__btn--card" href="' + esc(cardUrl) + '" target="_blank" rel="noopener" data-pay="card" data-item="' + esc(item) + '" data-pay-link="1">' + cardInner + '</a>'
      : '<button type="button" class="pay__btn pay__btn--card" data-pay="card" data-item="' + esc(item) + '">' + cardInner + '</button>';
    return (withCard && card ? phoneFieldHTML(item) : '') +
      '<div class="pay' + (withCard ? '' : ' pay--single') + '" role="group" aria-label="결제 방법">' +
      (withCard ? cardBtn : '') +
      '<button type="button" class="pay__btn pay__btn--bank" data-pay="bank" data-item="' + esc(item) + '">' +
      '<span class="pay__ico" aria-hidden="true">🏦</span>' +
      '<span class="pay__label"><b>계좌이체</b>' +
      '<span>' + bankSub + '</span></span>' +
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

  /* ── 카톡 채널로 넘어갈 때 '- 이전 페이지: https://...' 자동 문구가 붙지 않게 (#8618) ──
     카카오톡 채널 채팅 링크는 referrer 를 받으면 대화창에
     "안녕하세요. 무엇을 도와드릴까요? - 이전 페이지: https://..." 를 자동으로 붙인다.
     그래서 referrer 를 아예 보내지 않는다(noreferrer).
     · window.open(url, '_blank', 'noopener,noreferrer') 은 referrer 는 지워지지만
       noopener 때문에 돌려주는 창이 항상 null 이라 '차단됐는지'를 알 수 없다.
     · 그래서 noreferrer 앵커를 만들어 누른다 — 새 창으로 열리고(사용자 클릭 안이면 차단되지 않음)
       referrer 는 전송되지 않는다. 앵커 클릭이 막히는 환경에서만 window.open → 같은 창 순서로 넘어간다. */
  function openNoRef(url) {
    try {
      var a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0';
      a.setAttribute('aria-hidden', 'true');
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { if (a.parentNode) a.parentNode.removeChild(a); }, 1000);
      return true;
    } catch (e) { }
    try { window.open(url, '_blank', 'noopener,noreferrer'); return true; } catch (e2) { }
    try {
      var b = document.createElement('a');
      b.href = url; b.target = '_self'; b.rel = 'noreferrer';
      document.body.appendChild(b); b.click();
    } catch (e3) { window.location.href = url; }
    return false;
  }

  function openKakao() { openNoRef(KAKAO); }

  /* ── 페이앱 결제창 열기 (#8847) ───────────────────────────────────
     네이버·카카오 인앱 브라우저는 window.open(url, '_blank', 'noopener') 을
     팝업으로 보고 막는 일이 있는데, noopener 를 주면 돌려주는 창이 없어
     막혔는지를 알 수 없다(막혀도 null 로 조용히 끝나 버린다).
     그래서 ① window.open 결과를 실제로 확인 → ② 막혔으면 <a target="_blank"> 클릭
     → ③ 그것도 안 되면 현재 창을 결제 페이지로 이동, 순서로 열어
     어떤 인앱 브라우저에서도 결제창이 반드시 뜨게 한다. */
  function openPayApp(url) {
    var w = null;
    try { w = window.open(url, '_blank'); } catch (e1) { w = null; }
    if (w) {
      try { w.opener = null; } catch (e2) { }
      return true;
    }
    try {
      var a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0';
      a.setAttribute('aria-hidden', 'true');
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { if (a.parentNode) a.parentNode.removeChild(a); }, 1000);
      return true;
    } catch (e3) { }
    try { window.location.href = url; } catch (e4) { window.location.assign(url); }
    return false;
  }

  /* ── 결제 완료 → 카톡으로 신청 내용 보내기 (노란 카카오 버튼) ─────────────
     누르면 ① 신청 내용을 클립보드에 복사하고(토스트로 알려 줌)
             ② 카카오톡 채널 채팅방으로 이동한다.

     신청 내용 양식 — 한 줄에 하나씩:
       [윤이세 2027 캘린더 신청] 상품명 금액
       결제 확인 — 카드결제 연락처(또는 계좌 입금자명):   ← 고객이 뒤에 적어 보낸다
       내 생년월일시 1990-01-01 12:34 (사주를 넣었을 때만)

     결제 확인은 '무엇으로 찾을 수 있는지'가 결제 방법마다 다르다.
       · 페이앱 카드결제(z4otyE·z4otzE) — 구매자 이름 칸이 없고 **연락처(휴대폰 번호)만** 받는다
         → 결제할 때 넣은 번호로 대조
       · 계좌이체 — 통장에 찍히는 **입금자명**으로 대조
     그래서 방금 누른 결제 버튼(handlePay)을 payChoice 에 기억해 두고 그 방법의 항목을 앞세운다.
     (결제 버튼을 누르지 않았거나 새로고침으로 기억이 없으면 두 방법을 함께 적어 준다) */
  var payChoice = {};   // { item: 'card' | 'bank' } — 이 화면에서 마지막으로 누른 결제 방법
  function orderLabel(item) {
    var it = String(item || '');
    if (it === 'pass') return '2027 1년 패스 ' + PASS_PRICE;
    if (it === 'allinone') return '2027 올인원 ' + ALLINONE_PRICE;
    if (it === 'diary') return '2027 성찰 에디션 ' + DIARY_PRICE;
    if (it === 'consult') return '윤이세 1:1 원포인트 리딩 ' + CONSULT_PRICE;
    if (it === 'consult-sig') return '윤이세 1:1 시그니처 리딩 ' + CONSULT_SIG_PRICE;
    if (/^up-/.test(it) && TIER_NAME[it.slice(3)]) {
      var upinfo = payInfoOf(it);
      return '2027 ' + TIER_NAME[it.slice(3)] + ' 업그레이드' + (upinfo ? ' ' + wonNum(upinfo.price) : '');
    }
    var m = /^care-(card|objet|bowl|set)$/.exec(it);
    if (m) return '긴급 개운템 — ' + careItemLabel(m[1]);
    return it;
  }

  /* ── '코드 받기' 한 줄 문구 (2026-11-22) ───────────────────────────
     고객이 방금 고른 상품만 담는다:
       [3번 성찰 에디션 24,900원] 결제했어요! 휴대폰 번호: 010-
     · 번호를 이미 적어 두었으면 그 번호까지 채워서 복사한다.
     · 카톡에 붙여넣고 번호만 확인하면 사장님이 바로 코드를 발급할 수 있다.
     · 계좌이체 개운템은 입금자명도 있어야 짝이 맞아 뒤에 한 칸 더 둔다. */
  var ORDER_NO = { pass: '1번', allinone: '2번', diary: '3번', consult: '4번' };
  function shortOrderLabel(item) {
    var it = String(item || '');
    if (it === 'pass') return '1번 1년 패스 ' + PASS_PRICE;
    if (it === 'allinone') return '2번 올인원 ' + ALLINONE_PRICE;
    if (it === 'diary') return '3번 성찰 에디션 ' + DIARY_PRICE;
    if (it === 'consult') return '4번 원포인트 리딩 ' + CONSULT_PRICE;
    if (it === 'consult-sig') return '4번 시그니처 리딩 ' + CONSULT_SIG_PRICE;
    if (/^up-/.test(it) && TIER_NAME[it.slice(3)]) {
      var to = it.slice(3), up = payInfoOf(it);
      return (ORDER_NO[to] ? ORDER_NO[to] + ' ' : '') + TIER_NAME[to] + ' 업그레이드' + (up ? ' ' + wonNum(up.price) : '');
    }
    var m = /^care-(card|objet|bowl|set)$/.exec(it);
    if (m) return '긴급 개운템 ' + careItemLabel(m[1]);
    return orderLabel(it);
  }
  function codeOrderPhone() {
    return mobileOf(payPhoneVal()) || rememberedPhone();
  }
  function codeOrderText(item) {
    var it = String(item || '');
    var ph = codeOrderPhone();
    var tail = kakaoCareItem(it)
      ? '휴대폰 번호: ' + (ph ? fmtPhone(ph) : '010-') + ' · 입금자명: '
      : '휴대폰 번호: ' + (ph ? fmtPhone(ph) : '010-');
    return '[' + shortOrderLabel(it) + '] 결제했어요! ' + tail;
  }
  /** 내 생년월일시·성별 — 사주를 넣었을 때만. 시간을 모르면 날짜만. 코드는 이 값에 묶여 발급된다. */
  function birthLine() {
    var r = state.res;
    if (!r || !r.solar) return '';
    var p = function (v) { return (v < 10 ? '0' : '') + v; };
    var s = '내 생년월일시 ' + r.solar.y + '-' + p(r.solar.m) + '-' + p(r.solar.d);
    s += (r.input && r.input.timeKnown) ? ' ' + p(r.input.hh) + ':' + p(r.input.mm) : ' (시간 모름)';
    s += ' · ' + (r.input && r.input.gender === 'M' ? '남성' : '여성');
    if (r.input && r.input.calendar === 'lunar' && r.lunar) {
      s += ' (음력 ' + r.lunar.m + '.' + r.lunar.d + (r.lunar.leap ? ' 윤달' : '') + ')';
    }
    return s;
  }
  /** 결제 확인용 한 줄 — 코드가 번호 기반(2026-11-21~)이면 그 번호, 예전 사주 기반이면 생년월일시·성별 */
  function ownerMatchLine() {
    if (state.code && state.code.phone) return '결제 확인 — 휴대폰 번호: ' + fmtPhone(state.code.phone);
    return birthLine();
  }
  /** 긴급 개운템은 계좌이체 전용(payActionsHTML card:false) — 확인 항목도 입금자명 하나 */
  function kakaoCareItem(item) { return /^care(-|$)/.test(String(item || '')); }
  /* 2026-11-22부터 '노란 카톡 버튼'은 신청 양식 대신 **상품명 + 휴대폰 번호 한 줄**만 복사한다
     (codeOrderText) — 사장님이 번호 한 줄만 복사해 발급기에 넣으면 코드가 나가기 때문. */
  /** 노란 카카오 버튼 — 결제 카드·계좌이체 바로 아래.
      부제는 버튼을 그릴 때 굳으므로 짧게 한 줄로 적는다. */
  function kakaoSubText(item) {
    if (/^consult/.test(String(item || ''))) return '누르면 신청서가 복사돼요 — 카톡에 붙여넣기만 하면 접수 끝';
    return kakaoCareItem(item)
      ? '누르면 상품명이 복사돼요 — 카톡에 붙여넣고 입금자명·번호만 적어 주세요'
      : '누르면 상품명이 복사돼요 — 카톡에 붙여넣고 휴대폰 번호만 적어 주세요';
  }
  function kakaoOrderHTML(item, label) {
    return '<div class="kakaobar">' +
      '<button type="button" class="kakaobar__btn" data-kakao-order="' + esc(item) + '">' +
      '<b>' + label + '</b>' +
      '<span>' + kakaoSubText(item) + '</span>' +
      '</button>' +
      '</div>';
  }
  /* ── 1:1 원포인트 리딩 신청 양식 (#8729) ──────────────────────────────
     결제 팝업 안에서 고객이 바로 채우는 여섯 칸 — 성함 · 생년월일시 · 양력/음력/윤달 · 성별 · 연락처(입금자명) · 궁금한 점(#8891).
     노란 카톡 버튼 한 번이면 여섯 칸이 한 통의 신청 메시지로 정리돼 클립보드에 담기고,
     referrer 없이 카톡 채널이 열려 붙여넣기만 하면 접수가 끝난다.
     · 생년월일시·성별은 캘린더에 이미 넣어 둔 사주가 있으면 그대로 채워 두고, 고객이 고칠 수 있다.
     · 입력값은 이 화면(메모리)에만 둔다 — 저장소에 남기지 않는다. */
  var consultForm = null;   // { name, birth, cal, gender, who, q, sig }
  var consultTier = 'onepoint';   // 팝업에서 고른 상담 상품 — ① 원포인트 ② 시그니처
  function consultTierItem() { return CONSULT_PRODUCTS[consultTier] ? CONSULT_PRODUCTS[consultTier].item : 'consult'; }
  /* 생년월일시는 날짜·시간만 적는다 — 양력/음력은 아래 '양력·음력·윤달' 칩이 따로 받는다(#8891) */
  function consultBirthValue() {
    var r = state.res;
    if (!r || !r.solar) return '';
    var p = function (v) { return (v < 10 ? '0' : '') + v; };
    var s = r.solar.y + '-' + p(r.solar.m) + '-' + p(r.solar.d);
    if (r.input && r.input.timeKnown) s += ' ' + p(r.input.hh) + ':' + p(r.input.mm);
    return s;
  }
  /* 달력 종류 — 사주를 음력(윤달)로 넣었으면 그대로 골라 둔다 */
  function consultCalValue() {
    var r = state.res;
    if (r && r.input && r.input.calendar === 'lunar') return (r.lunar && r.lunar.leap) ? 'leap' : 'lunar';
    return 'solar';
  }
  function calLabel(v) {
    if (v === 'lunar') return '음력';
    if (v === 'leap') return '음력 윤달';
    return '양력';
  }
  function consultFormState() {
    var sig = sigOf();
    var g = (state.res && state.res.input && state.res.input.gender) || state.gender || '';
    if (!consultForm) {
      consultForm = { name: '', birth: consultBirthValue(), cal: consultCalValue(), gender: g, who: '', q: '', sig: sig };
    } else if (sig !== consultForm.sig) {   // 사주를 새로 넣었으면 빈 칸만 최신 값으로 (고객이 고친 값은 그대로)
      consultForm.sig = sig;
      if (!String(consultForm.birth || '').trim()) consultForm.birth = consultBirthValue();
      if (!consultForm.cal) consultForm.cal = consultCalValue();
      if (!consultForm.gender) consultForm.gender = g;
    }
    if (!consultForm.cal) consultForm.cal = 'solar';
    return consultForm;
  }
  function consultMissing() {
    var f = consultFormState();
    if (!String(f.name || '').trim()) return { key: 'name', msg: '성함을 적어 주세요 — 부르기 편한 이름이면 돼요.' };
    if (!String(f.birth || '').trim()) return { key: 'birth', msg: '생년월일시를 적어 주세요 — 시간을 모르면 날짜만 적어도 돼요.' };
    if (!f.gender) return { key: 'gender', msg: '성별을 골라 주세요 — 사주를 세울 때 꼭 필요해요.' };
    if (!String(f.who || '').trim()) return { key: 'who', msg: '결제 확인을 위해 연락처(카드결제)나 입금자명(계좌이체)을 적어 주세요.' };
    if (!String(f.q || '').trim()) return { key: 'q', msg: '가장 궁금한 고민을 한 줄로 적어 주세요 — 그게 상담의 중심이에요.' };
    return null;
  }
  /* 결제창에 적은 번호를 신청서 ⑤칸에도 — 두 번 적지 않게.
     (⑤칸에 이미 다른 값이 있으면 건드리지 않는다) */
  function mirrorPayPhone() {
    var v = String(payPhone || '').trim();
    var f = consultFormState();
    if (String(f.who || '').trim() && String(f.who) !== lastPayPhoneMirror) return;
    f.who = v;
    lastPayPhoneMirror = v;
    var inp = shopBody ? shopBody.querySelector('[data-cf="who"]') : null;
    if (inp) inp.value = v;
  }
  function setConsultCal(v) {
    var f = consultFormState();
    f.cal = (v === 'lunar' || v === 'leap') ? v : 'solar';
    if (shopBody) {
      $$('[data-cf-cal]', shopBody).forEach(function (b) {
        var on = b.getAttribute('data-cf-cal') === f.cal;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      clearConsultMsg();
    }
    sfxTap(1);
  }
  function clearConsultMsg() {
    if (!shopBody) return;
    var msg = shopBody.querySelector('[data-cf-msg]');
    if (msg) { msg.hidden = true; msg.textContent = ''; }
  }
  function consultWarn(miss) {
    if (!shopBody || !miss) return;
    var msg = shopBody.querySelector('[data-cf-msg]');
    if (msg) { msg.textContent = miss.msg; msg.hidden = false; }
    $$('.cform__row', shopBody).forEach(function (r) { r.classList.remove('is-error'); });
    var anchorEl = miss.key === 'gender' ? shopBody.querySelector('[data-cf-gender]') : shopBody.querySelector('[data-cf="' + miss.key + '"]');
    var row = anchorEl && anchorEl.closest ? anchorEl.closest('.cform__row') : null;
    if (row) row.classList.add('is-error');
    if (miss.key !== 'gender' && anchorEl) {
      anchorEl.classList.remove('is-shake');
      void anchorEl.offsetWidth;
      anchorEl.classList.add('is-shake');
      try { anchorEl.focus({ preventScroll: false }); } catch (e) {}
    }
    if (msg) { try { msg.scrollIntoView({ block: 'nearest' }); } catch (e) {} }
    vibrate([25, 40]);
  }
  function setConsultGender(g) {
    var f = consultFormState();
    f.gender = g === 'M' ? 'M' : 'F';
    if (shopBody) {
      $$('[data-cf-gender]', shopBody).forEach(function (b) {
        var on = b.getAttribute('data-cf-gender') === f.gender;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        if (on) {
          var r = b.closest ? b.closest('.cform__row') : null;
          if (r) r.classList.remove('is-error');
        }
      });
      clearConsultMsg();
    }
    sfxTap(1);
  }
  /* 신청 메시지 — 양식에 적은 그대로, 한 줄에 하나씩 */
  function consultOrderText(item) {
    var f = consultFormState();
    var p = consultProduct(item);
    return [
      p.order,
      '성함: ' + String(f.name || '').trim(),
      '연락처(카드결제) 또는 입금자명(계좌이체): ' + String(f.who || '').trim(),
      '생년월일시: ' + String(f.birth || '').trim(),
      '양력·음력·윤달: ' + calLabel(f.cal),
      '성별(남·여): ' + (f.gender === 'M' ? '남' : '여'),
      '궁금한 점: ' + String(f.q || '').trim()
    ].join('\n');
  }
  /* 노란 카톡 버튼 — 1:1 상담은 양식 여섯 칸을 먼저 확인한다 */
  function goConsultOrder(item) {
    var miss = consultMissing();
    if (miss) { consultWarn(miss); return; }
    var text = consultOrderText(item);
    copyText(text, function (copied) {
      toast(copied === true
        ? '✅ 신청서를 복사했어요 — 카톡에 붙여넣고 보내 주세요'
        : '카톡 채널로 이동해요 — 양식에 적은 내용을 붙여 보내 주세요');
    });
    vibrate(18);
    openNoRef(KAKAO);
  }
  function goKakaoOrder(item) {
    if (String(item) === 'care') item = 'care-' + (care && care.buy ? care.buy : 'set');
    if (String(item) === 'consult') { goConsultOrder(item); return; }
    if (String(item) === 'consult-sig') { goConsultOrder(item); return; }
    var text = codeOrderText(item);
    var hasPhone = !!codeOrderPhone();
    var isCare = kakaoCareItem(item);
    copyText(text, function (copied) {
      toast(copied === true
        ? (hasPhone
          ? (isCare
            ? '✅ 상품명과 휴대폰 번호가 복사됐어요! 카톡에 붙여넣고 입금자명만 적어 주세요'
            : '✅ 상품명과 휴대폰 번호가 복사됐어요! 카톡에 붙여넣고 보내 주세요')
          : '✅ 상품명이 복사됐어요! 카톡에 붙여넣고 휴대폰 번호' + (isCare ? '·입금자명' : '') + '만 적어 주세요')
        : '카톡으로 이동해요 — 상품명과 휴대폰 번호' + (isCare ? '·입금자명' : '') + '를 함께 적어 보내 주세요');
    });
    vibrate(18);
    // 카카오톡 채널 채팅방으로 이동 — referrer 없이(noreferrer) 새 창으로
    openNoRef(KAKAO);
  }
  /* 새 탭이 차단될 수 있으니 안내 안에 한 번 더 누를 수 있는 링크를 함께 둔다 */
  function kakaoLinkHTML(label) {
    return '<a class="pay__kakao" href="' + KAKAO + '" target="_blank" rel="noopener noreferrer">' + label + '</a>';
  }

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
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }
  /* 복사 성공 여부를 실제 결과로 돌려준다 — 안내 문구가 사실과 어긋나지 않게 */
  function copyText(text, cb) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { cb(true); }, function () { cb(legacyCopy(text)); });
        return;
      }
    } catch (e) { }
    cb(legacyCopy(text));
  }

  /* 결제창을 연 니 발에 남기는 안내 — 안 보이면 직접 누를 수 있는 링크까지
     opts.direct: 번호를 적어 JS 로 바로 넘어간 경우 · opts.phone: 번호를 받았는지 */
  function cardNote(url, opts) {
    opts = opts || {};
    payNote((opts.direct
      ? '카드결제 창으로 바로 넘어가요 — 결제를 마치면 이 화면으로 스스로 돌아와요.'
      : '카드결제 창을 열었어요. 결제를 마치고 이 화면으로 돌아오시면 됩니다.') +
      (opts.phone
        ? ' 결제 확인과 코드 발송은 적어 주신 번호로 해요.'
        : ' 휴대폰 번호를 적으면 결제수단 선택 화면으로 바로 들어가요.') +
      (url ? ' <a class="pay__kakao" href="' + esc(url) + '" target="_blank" rel="noopener">결제창이 안 보이면 여기 누르기 →</a>' : ''));
  }
  /* 카드 버튼이 진짜 링크(<a target="_blank">)라 새 창을 여는 건 팝업차단 대상이 아니다(#8847).
     그런데 target=_blank 를 무시하거나 링크 이동마저 막는 인앱 브라우저도 있다.
     그래서 0.9초 뒤에도 이 화면이 그대로 보이고(새 창이 안 열렸고) 초점도 여기 있으면
     현재 창을 결제 페이지로 넘긴다 — 어떤 환경에서든 결제창은 뜨게. */
  function payLinkGuard(url) {
    setTimeout(function () {
      try {
        if (document.visibilityState === 'visible' && document.hasFocus()) window.location.href = url;
      } catch (e) { }
    }, 900);
  }

  function handlePay(kind, item) {
    if (kind === 'card' || kind === 'bank') payChoice[String(item)] = kind;   // 카톡 확인 항목을 이 방법으로
    if (kind === 'card') {
      var url = cardUrlOf(item);
      var phone = mobileOf(payPhoneVal());
      if (phone) {
        var went = false;
        try { went = payappGo(item, phone); } catch (err) { went = false; }
        if (went) { cardNote(url, { direct: true, phone: true }); return; }    // 이 창이 결제창으로 넘어간다
      }
      if (url) {
        /* 번호를 비워 둔 채 링크로 결제창을 열어도, 돌아왔을 때 복귀 배너가 뜨도록 상품을 기억해 둘다 */
        payWaitSave(item, phone);
        cardNote(url, { phone: !!phone });
        openPayApp(url);
      } else if (payInfoOf(item)) {
        /* 링크 없이 금액만 있는 상품(7,900원 차액 업그레이드) — 번호가 없으면 JS 도 못 쓰니 번호를 받는다 */
        payNote('휴대폰 번호를 적으면 결제창이 바로 열려요 — 결제 확인과 코드 발송에 쓰는 번호예요.');
        payPhoneFocus();
      } else {
        payNote('카드결제 링크 연결 준비 중 — 카카오톡으로 결제 링크를 바로 보내드려요.' +
          kakaoLinkHTML('카카오톡 채널 열기 →'));
        openKakao();
      }
      return;
    }
    if (bankReady()) {
      var text = bankText();
      var label = itemLabel(item);
      var bankNote = function (copied) {
        payNote((label ? '<b>' + esc(label) + '</b> 결제 · ' : '') +
          (copied === true ? '계좌번호를 복사했어요' : (copied === false ? '아래 계좌로 입금해 주세요' : '입금 계좌는 여기예요')) +
          ' · <b>' + esc(text) + '</b><br>은행 앱에 붙여넣어 이체하신 뒤, <b>입금자명</b>을 카톡으로 보내 주세요.' +
          kakaoLinkHTML('입금 확인 카톡 보내기 →'));
      };
      bankNote(null);
      copyText(text, bankNote);
      vibrate(18);
      sfxTap(2);
      return;
    }
    payNote('입금 계좌는 카카오톡 채널에서 바로 안내해 드려요.' + kakaoLinkHTML('카카오톡 채널 열기 →'));
    openKakao();
  }

  /* 1번 — 🎟️ 1년 패스 (14,900원) */
  /** 무료 체험 중이면 결제 팝업 상단에 '먼저 3일 무료' 안내 한 줄 — 결제 전에 체험부터 */
  function trialShopNote() {
    if (!FREE_TRIAL_ENABLED || state.unlocked) return '';
    if (trialOver()) return '<p class="shop__trial">무료 ' + FREE_DAYS + '일 체험은 끝났어요 — 결제하시면 결제하신 번호에 묶인 <b>입장 코드</b>를 카톡으로 보내 드려요.</p>';
    return '<p class="shop__trial">먼저 <b>' + FREE_DAYS + '일 무료 체험</b>으로 충분히 써 보세요. 결제하시면 결제하신 번호에 묶인 <b>입장 코드</b>를 카톡으로 보내 드려요.</p>';
  }
  function passShopHTML() {
    return '<p class="modal__eyebrow">2027 PASS · 앱 전용 · 2026년 11월 ~ 2027년 12월 14개월</p>' +
      '<h2 class="shop__title" id="shopTitle">🎟️ 1년 패스</h2>' +
      tierswHTML('pass') +
      trialShopNote() +
      '<p class="shop__sub">생년월일과 성별을 넣으면 <b>2026년 11월부터 2027년 12월까지 14개월</b>(2027년 1~12월 전체 포함)이 내 달력으로 펼쳐져요. 좋은 날·조심할 날을 미리 보고, 그날의 부적 스티커를 달력에 착착 붙이는 앱이에요.</p>' +
      '<ul class="shop__list">' +
      '<li><b>2026~2027 내 사주 타이밍 맵</b><span>2026년 11월부터 2027년 12월까지, 하루씩 전부</span></li>' +
      '<li><b>1년 수호 부적</b><span>2026년 11월부터 2027년 12월까지 내내 나를 받쳐 주는 부적</span></li>' +
      '<li><b>액운 태우기 5회 무료</b><span>적고 · 구기고 · 태워 보내기, 다섯 장</span></li>' +
      '</ul>' +
      priceHTML('2027 1년 패스', PASS_PRICE) +
      payActionsHTML('pass') +
      kakaoOrderHTML('pass', '💬 결제 완료 · 카톡으로 입장 코드 받기');
  }

  /* 2번 — 👑 올인원 (19,900원) */
  function allinoneShopHTML() {
    return '<p class="modal__eyebrow">2027 ALL-IN-ONE · 가장 많이 고르는 구성</p>' +
      '<h2 class="shop__title" id="shopTitle">👑 올인원</h2>' +
      tierswHTML('allinone') +
      trialShopNote() +
      '<p class="shop__sub">1년 패스에 <b>매일 일진 부적</b>과 <b>매일 1회 액운 태우기</b>까지 다 열리는 구성이에요. 매일 부적을 붙이고, 매일 한 번 마음을 비우고 싶다면 여기서 시작하세요.</p>' +
      '<ul class="shop__list">' +
      '<li><b>1년 패스 전부</b><span>타이밍 맵 · 1년 수호 부적 · 액운 태우기 5회</span></li>' +
      '<li><b>매일 일진 부적</b><span>특별한 날·경고등 켜진 날마다 나오는 캐릭터 부적 스티커를 하나도 빼놓지 않고</span></li>' +
      '<li><b>매일 1회 액운 태우기</b><span>매일 한 번 — 적고, 구기고, 태워 보내기</span></li>' +
      '</ul>' +
      '<div class="shop__save"><b>처음부터 올인원으로 시작하시면 업그레이드 대비 2,900원 더 유리해요</b>' +
      '<span>1년 패스 14,900원 + 업그레이드 7,900원 = 22,800원 → 올인원 ' + ALLINONE_PRICE + '</span></div>' +
      priceHTML('2027 올인원', ALLINONE_PRICE) +
      payActionsHTML('allinone') +
      kakaoOrderHTML('allinone', '💬 결제 완료 · 카톡으로 입장 코드 받기');
  }

  /* 3번 — ✨ 성찰 에디션 (24,900원) — 올인원 전부 + 365일 1줄 성찰 다이어리
     PAYAPP_DIARY_URL 이 비어 있으면 카드 버튼은 '카톡으로 결제 링크 받기', 계좌이체 + 노란 카톡 버튼으로 안내한다. */
  function diaryShopHTML() {
    return '<p class="modal__eyebrow">REFLECTION EDITION · 365일 1줄 성찰 다이어리</p>' +
      '<h2 class="shop__title" id="shopTitle">✨ 성찰 에디션</h2>' +
      tierswHTML('diary') +
      trialShopNote() +
      '<p class="shop__sub">올인원 전부에 <b>365일 1줄 성찰 다이어리</b>까지. 매일 다른 질문 한 줄이 1년 뒤 내 기록이 돼요.' +
      (diaryTryEligible() ? '<br><b>지금은 3회 무료 체험 중</b> — 무료 ' + diaryTryLeft() + '회가 남았어요. 다 쓰면 이 상품에서 365일 내내 이어집니다.' : '') + '</p>' +
      '<ul class="shop__list">' +
      '<li><b>올인원 전부</b><span>타이밍 맵 · 1년 수호 부적 · 매일 일진 부적 · 매일 1회 액운 태우기</span></li>' +
      '<li><b>365일 1줄 성찰 다이어리</b><span>날마다 다른 맞춤 질문 하나, 부담 없는 한 줄</span></li>' +
      '<li><b>내 기록 저장</b><span>달력 펜 점 · 📖 내 성찰 기록 보기 · .txt 백업</span></li>' +
      '</ul>' +
      priceHTML('2027 성찰 에디션', DIARY_PRICE) +
      payActionsHTML('diary') +
      kakaoOrderHTML('diary', '💬 결제 완료 · 카톡으로 성찰 에디션 코드 받기') +
      '<p class="shop__note">이미 올인원을 쓰고 계시면 카톡으로 알려 주시면 차액을 안내해 드려요.</p>';
  }

  /* ── 3번 — 긴급 개운템 3종 (앱 안에서 그대로 체험) ────────────────
     ① 주역 대나무 산가지 — 부채꼴 6개 중 '딱 1개'만 뽑는 의식
        · 오행마다 처방 8개, 뽑을 때마다 한 바퀴 돌기 전엔 같은 처방이 다시 나오지 않는다
     ② 디지털 개운 오브제 — 손가락으로 문지르면 기운이 차오르는 촉감(pointermove)
     ③ 1분 오행 싱잉볼 — 60초 지속 공명 + 4·2·6 복식호흡(12초)마다 재타종 + 수동 타종 */
  var CARE = {
    목: {
      obj: 'sprout', name: '새싹 화분', josa: '을',
      missions: [
        { tag: '색', text: '초록 잎이나 화분을 30초만 가만히 바라보세요. 눈이 먼저 쉬어요.' },
        { tag: '동선', text: '창문을 열고 3분만 바깥 공기를 들이세요.' },
        { tag: '손', text: '가까운 화분 잎을 손끝으로 쓸어 주고 물 한 모금 주세요.' },
        { tag: '음식', text: '레몬 물 한 모금이나 신맛 한 입으로 입 안을 새로 고르세요.' },
        { tag: '말', text: '미뤄 둔 안부 하나, 세 줄이면 충분해요. 지금 보내세요.' },
        { tag: '몸', text: '목을 길게 빼고 어깨를 천천히 세 번 돌려 보세요.' },
        { tag: '마음', text: '지금 뻗어 보고 싶은 일 하나를 메모에 한 줄로 적으세요.' },
        { tag: '시간', text: '새로 시작할 일 하나를 5분짜리 한 걸음으로 쪼개 적으세요.' }
      ]
    },
    화: {
      obj: 'incense', name: '따뜻한 향로', josa: '를',
      missions: [
        { tag: '음식', text: '따뜻한 차 한 잔을 양손으로 감싸고 천천히 드세요.' },
        { tag: '동선', text: '햇볕 드는 창가에 5분만 서 있어 보세요.' },
        { tag: '색', text: '빨강·주황 소품 하나를 눈에 띄는 자리로 옮기세요.' },
        { tag: '손', text: '손바닥을 10초 비벼 따뜻해지면 눈 위에 살짝 얹어 보세요.' },
        { tag: '말', text: '망설인 결정 하나를 오늘 안에 한 줄로 정해 적으세요.' },
        { tag: '마음', text: '오늘 고마웠던 사람 한 명을 떠올리고 이름만 적어 두세요.' },
        { tag: '정리', text: '안 쓰는 알림 세 개를 지금 꺼 두세요.' },
        { tag: '몸', text: '일어나 팔을 위로 쭉 뻗고 숨을 크게 한 번 들이세요.' }
      ]
    },
    토: {
      obj: 'stone', name: '황금 수호석', josa: '을',
      missions: [
        { tag: '손', text: '책상 위 어지러운 물건 세 개만 제자리에 두세요.' },
        { tag: '몸', text: '맨발로 바닥을 딛고 1분 서서 발바닥 감각을 느껴 보세요.' },
        { tag: '음식', text: '단맛 한 조각을 물 한 모금과 함께 천천히 드세요.' },
        { tag: '색', text: '베이지·노랑 계열 소품 하나를 손 닿는 자리에 두세요.' },
        { tag: '정리', text: '지갑 속 영수증과 쿠폰을 다 꺼내 버리세요.' },
        { tag: '말', text: '안 쓸 약속 하나를 오늘 정중히 정리해 두세요.' },
        { tag: '마음', text: '앉은 자리에서 발바닥과 엉덩이 감각을 30초 느껴 보세요.' },
        { tag: '손', text: '서랍 하나만 열어 안 쓰는 것 한 개를 덜어 내세요.' }
      ]
    },
    금: {
      obj: 'bell', name: '수정 종', josa: '을',
      missions: [
        { tag: '손', text: '안 쓰는 사진이나 카톡방 세 개를 정리하세요.' },
        { tag: '손', text: '은색이나 흰색 소품 하나를 반짝이게 닦아 주세요.' },
        { tag: '정리', text: '안 쓰는 결제·구독 하나를 확인해서 끊으세요.' },
        { tag: '음식', text: '물 한 모금으로 입 안을 헹구고 숨을 길게 한 번 내쉬세요.' },
        { tag: '색', text: '흰 손수건이나 은색 소품 하나를 눈에 보이게 두세요.' },
        { tag: '말', text: '받을 돈 한 건, 오늘 문자 한 줄로 물어보세요.' },
        { tag: '마음', text: '정리 안 된 생각 세 개를 한 줄씩 적고 하나만 남기세요.' },
        { tag: '손', text: '장바구니에 담아 둔 것 하나를 지금 지우세요.' }
      ]
    },
    수: {
      obj: 'orb', name: '행운 물결구슬', josa: '를',
      missions: [
        { tag: '음식', text: '미지근한 물 한 컵을 천천히 끝까지 마셔 보세요.' },
        { tag: '손', text: '세수나 손 씻기로 얼굴의 열기를 먼저 식히세요.' },
        { tag: '손', text: '손을 10초 씻고 물기를 톡 털어 내세요.' },
        { tag: '말', text: '보내려던 답장은 오늘 초안에만 넣어 두세요.' },
        { tag: '마음', text: '눈을 감고 숨을 세 번만 크게 쉬어 보세요.' },
        { tag: '동선', text: '물소리나 빗소리 하나를 골라 1분만 가만히 들어 보세요.' },
        { tag: '마음', text: '지금 드는 감정을 한 단어로 적어 보세요. 그걸로 충분해요.' },
        { tag: '말', text: '급한 말은 "조금 있다 말할게요"로 한 번만 미뤄 보세요.' }
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

  /* 뽑기·문지르기·싱잉볼의 화면 상태 (팝업을 닫으면 초기화) */
  var PICK_KEY = 'yoonise.timing.carepick.v2';
  var STICK_NUM = ['一', '二', '三', '四', '五', '六'];
  var care = { pick: -1, mi: -1, lastMi: -1, bag: {}, charge: 0, lit: false, chargeStep: 0, dustAcc: 0, buy: 'set' };

  function loadCarePick(el) {
    try {
      var o = JSON.parse(localStorage.getItem(PICK_KEY) || 'null');
      if (o && o.iso === state.todayISO && (!o.el || o.el === el) &&
          typeof o.stick === 'number' && o.stick >= 0 && o.stick < 6 &&
          typeof o.mi === 'number' && o.mi >= 0) {
        care.bag = (o.bag && typeof o.bag === 'object') ? o.bag : {};
        return { stick: o.stick, mi: o.mi };
      }
    } catch (e) {}
    care.bag = {};
    return null;
  }
  function saveCarePick(o, el) {
    try {
      if (!o) localStorage.removeItem(PICK_KEY);
      else localStorage.setItem(PICK_KEY, JSON.stringify({ iso: state.todayISO, el: el, stick: o.stick, mi: o.mi, bag: care.bag }));
    } catch (e) {}
  }

  /* 오늘의 처방 고르기 — 한 바퀴(8개)를 다 쓸 때까지는 같은 처방이 다시 나오지 않는다.
     산가지 번호와 처방은 따로 뽑기 때문에, 같은 대나무를 다시 뽑아도 내용은 달라진다. */
  function shuffleIdx(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function drawMission(el, avoid) {
    var list = (CARE[el] || CARE['화']).missions;
    var bag = care.bag[el];
    if (!bag || !bag.length) {
      bag = shuffleIdx(list.map(function (m, i) { return i; }));
      care.bag[el] = bag;
      if (bag.length > 1 && bag[0] === avoid) { bag[0] = bag[1]; bag[1] = avoid; }
    }
    var idx = bag.shift();
    if (idx === avoid && bag.length) { bag.push(idx); idx = bag.shift(); }
    return idx;
  }

  /* 1만 원 미만 소액은 페이앱 결제링크를 만들 수 없어 계좌이체 전용 — 낱개 3종 + 3종 풀세트
     ⚠️ 상품 이름은 체험 화면과 그대로 맞춘다 (2026-11-22 상품 문구 전수점검):
        ① 대나무 뽑기 ② 개운 오브제 ③ 1분 싱잉볼 — 예전 이름 '행동 카드'는 남아 있던 오기라 지웠다. */
  var CARE_ITEMS = {
    card: { ico: '🎋', name: '대나무 뽑기', price: '2,900원' },
    objet: { ico: '🪷', name: '개운 오브제', price: '2,900원' },
    bowl: { ico: '🔔', name: '1분 싱잉볼', price: '2,900원' },
    set: { ico: '⚡', name: '3종 풀세트', price: '5,900원', rec: true }
  };
  var CARE_ITEM_ORDER = ['card', 'objet', 'bowl', 'set'];

  /* ── 1회 무료 체험 기록 (2026-11-22) ──────────────────────────────
     산가지·오브제·싱잉볼은 **각각 처음 1회**만 무료로 체험한다.
     체험을 마치면 이 기기(localStorage)에 남기고, 그 뒤 다시 실행하려 하면
     체험을 막은 뒤 팝업 아래 결제 영역(1종 2,900원 · 3종 5,900원)으로 데려간다.
     · 이미 뽑아 둔 결과를 보는 것(오늘의 처방)은 그대로 둔다 — 막는 것은 '추가 실행'뿐.
     · 기록은 기기별로 남는다(로그인·서버 없이 도는 앱이라 localStorage 하나로 충분). */
  var CARE_TRIAL_KEY = 'yoonise.care.trial.v1';   /* ⚠️ 이름 주의 — 위쪽 TRIAL_KEY 는 '첫 방문일'(무료 3일)이라
                                                     같은 var 이름을 쓰면 무료 체험 기록까지 덮어쓴다 (2026-11-22) */
  var trialDone = { card: false, objet: false, bowl: false };
  var trialLoaded = false;
  function loadTrial() {
    if (trialLoaded) return trialDone;
    trialLoaded = true;
    try {
      var o = JSON.parse(localStorage.getItem(CARE_TRIAL_KEY) || 'null');
      if (o && typeof o === 'object') {
        trialDone.card = !!o.card;
        trialDone.objet = !!o.objet;
        trialDone.bowl = !!o.bowl;
      }
    } catch (e) {}
    return trialDone;
  }
  function saveTrial() {
    try {
      localStorage.setItem(CARE_TRIAL_KEY, JSON.stringify({
        card: !!trialDone.card, objet: !!trialDone.objet, bowl: !!trialDone.bowl, at: Date.now()
      }));
    } catch (e) {}
  }
  function trialUsed(k) { return !!(loadTrial()[k]); }
  function markTrial(k) {
    loadTrial();
    if (trialDone[k]) return false;
    trialDone[k] = true;
    saveTrial();
    paintTrialChips();
    return true;
  }
  function trialChipHTML(k) {
    return trialUsed(k)
      ? '<span class="care__trial is-done" data-trial-chip="' + k + '">1회 체험 완료</span>'
      : '<span class="care__trial" data-trial-chip="' + k + '">무료 1회 체험</span>';
  }
  function paintTrialChips() {
    if (!shopBody) return;
    $$('[data-trial-chip]', shopBody).forEach(function (el) {
      var done = trialUsed(el.getAttribute('data-trial-chip'));
      el.classList.toggle('is-done', done);
      el.textContent = done ? '1회 체험 완료' : '무료 1회 체험';
    });
  }
  /* 1회 체험을 마친 항목을 또 실행하려 할 때 — 안내 + 결제 영역으로 부드럽게 */
  var CARE_LOCK_TEXT = '1회 체험을 완료했어요 · 소장하고 매일 꺼내 쓰기';
  function careLock(kind) {
    var note = careEl('[data-care-lock]');
    var it = CARE_ITEMS[kind];
    if (note) {
      note.innerHTML = '<b>' + CARE_LOCK_TEXT + '</b>' +
        '<span>' + (it ? esc(it.name + ' ' + it.price) + ' · ' : '') + '3종 풀세트 ' + CARE_ITEMS.set.price + '</span>';
      note.hidden = false;
      note.classList.remove('is-show');
      void note.offsetWidth;
      note.classList.add('is-show');
    }
    toast(CARE_LOCK_TEXT);
    vibrate([18, 40, 18]);
    sfxTap(1);
    var pay = careEl('[data-care-pay]');
    if (pay) {
      try { pay.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      catch (e) { try { pay.scrollIntoView(); } catch (e2) {} }
      pay.classList.remove('is-flash');
      void pay.offsetWidth;
      pay.classList.add('is-flash');
      clearTimeout(careLock._t);
      careLock._t = setTimeout(function () { if (pay) pay.classList.remove('is-flash'); }, 2600);
    }
  }

  function careItemLabel(v) {
    var it = CARE_ITEMS[v];
    return it ? it.name + ' ' + it.price : '';
  }
  function itemLabel(item) {
    var it = String(item || '');
    if (it === 'consult') return '윤이세 1:1 원포인트 리딩';
    if (it === 'consult-sig') return '윤이세 1:1 시그니처 리딩';
    if (TIER_NAME[it]) return '2027 ' + TIER_NAME[it];
    if (/^up-/.test(it) && TIER_NAME[it.slice(3)]) return '2027 ' + TIER_NAME[it.slice(3)] + ' 업그레이드';
    var m = /^care-(card|objet|bowl|set)$/.exec(it);
    return m ? careItemLabel(m[1]) : '';
  }

  /* 부족한 오행별 추천 자연·장소 */
  var CARE_PLACE = {
    목: '공원 · 나무 아래 · 식물 옆이나 동쪽 창가',
    화: '햇볕 드는 남향 창가 · 따뜻한 조명 아래 · 활기찬 카페',
    토: '흙 밟는 산책로 · 집 중심 거실 · 차분한 돌/도자기 옆',
    금: '깨끗이 비운 책상 · 서쪽 창가 · 시원한 바람 부는 곳',
    수: '물가(강·바다·분수) · 조용한 밤 공간 · 샤워 후 차분한 방'
  };

  function careElement() {
    return state.res ? repElement().el : '화';
  }

  /* ① 대나무 산가지 6개 — 나란히 부채처럼 세워 두고 한 개만 뽑는다 */
  var STICK_SPREAD = 30;                            // 산가지 사이 간격(px)
  function bambooSticksHTML() {
    var locked = trialUsed('card');
    var out = '';
    for (var i = 0; i < 6; i++) {
      var off = (i - 2.5) * STICK_SPREAD;            // 가운데 기준 ±85px
      var rot = -9 + i * 3.6;                        // −9° ~ +9° 부챗살
      var shift = -off;                              // 뽑히면 가운데로
      var cls = 'bamboo__stick';
      if (locked) cls += ' is-locked';
      if (care.pick === i) cls += ' is-chosen';
      if (care.pick >= 0 && care.pick !== i) cls += ' is-away';
      out += '<button type="button" class="' + cls + '" data-care="stick" data-stick="' + i + '" ' +
        'style="left:calc(50% + ' + off.toFixed(1) + 'px); --rot:' + rot.toFixed(2) + 'deg; --i:' + i +
        '; --shift:' + shift.toFixed(1) + 'px" ' +
        'aria-label="' + (i + 1) + '번째 대나무 산가지 뽑기"' +
        (care.pick >= 0 ? ' aria-disabled="true"' : '') + '>' +
        '<span class="bamboo__shaft">' +
        '<span class="bamboo__cap"></span>' +
        '<span class="bamboo__glyph">' + STICK_NUM[i] + '</span>' +
        '<span class="bamboo__node"></span><span class="bamboo__node"></span>' +
        '<span class="bamboo__band"></span>' +
        '</span></button>';
    }
    return out;
  }

  function bambooResultHTML(el, stick, mi) {
    var list = (CARE[el] || CARE['화']).missions;
    var m = list[((mi % list.length) + list.length) % list.length];
    return '<span class="bamboo__drawn-no">' + STICK_NUM[stick % 6] + '</span>' +
      '<span class="bamboo__tag">' + esc(m.tag) + '</span>' +
      '<b class="bamboo__text">' + esc(m.text) + '</b>';
  }

  /* 신청 양식 마크업 — ② 단계, 결제 다음에 놓는다 */
  function consultFormHTML(p) {
    p = p || consultProduct(consultTierItem());
    var f = consultFormState();
    var calChip = function (v, label) {
      return '<button type="button" class="chip' + (f.cal === v ? ' is-on' : '') + '" data-cf-cal="' + v + '" aria-pressed="' + (f.cal === v ? 'true' : 'false') + '">' + label + '</button>';
    };
    return '<div class="cform" data-consult-form>' +
      '<p class="cform__head">📝 상담 신청서 <span>여섯 칸을 채우고, 맨 아래 노란 버튼을 누르면 접수 끝이에요</span></p>' +
      '<label class="cform__row"><span class="cform__lb">① 성함</span>' +
      '<input type="text" class="cform__input" data-cf="name" value="' + esc(f.name) + '" ' +
      'placeholder="예: 김나영" autocomplete="name"></label>' +
      '<label class="cform__row"><span class="cform__lb">② 생년월일시</span>' +
      '<input type="text" class="cform__input" data-cf="birth" value="' + esc(f.birth) + '" ' +
      'placeholder="예: 1979-10-25 09:30 (시간을 모르면 날짜만)" autocomplete="off" inputmode="text"></label>' +
      '<div class="cform__row cform__row--chips"><span class="cform__lb">③ 양력·음력·윤달</span>' +
      '<span class="chips">' + calChip('solar', '양력') + calChip('lunar', '음력') + calChip('leap', '음력 윤달') + '</span></div>' +
      '<div class="cform__row cform__row--chips"><span class="cform__lb">④ 성별</span>' +
      '<span class="chips">' +
      '<button type="button" class="chip' + (f.gender === 'F' ? ' is-on' : '') + '" data-cf-gender="F" aria-pressed="' + (f.gender === 'F' ? 'true' : 'false') + '">여성</button>' +
      '<button type="button" class="chip' + (f.gender === 'M' ? ' is-on' : '') + '" data-cf-gender="M" aria-pressed="' + (f.gender === 'M' ? 'true' : 'false') + '">남성</button>' +
      '</span></div>' +
      '<label class="cform__row"><span class="cform__lb">⑤ 연락처 또는 입금자명 <i>결제 확인용</i></span>' +
      '<input type="text" class="cform__input" data-cf="who" value="' + esc(f.who) + '" ' +
      'placeholder="카드결제는 휴대폰 번호 · 계좌이체는 입금자명" autocomplete="off"></label>' +
      '<label class="cform__row"><span class="cform__lb">' + p.qLb + ' <i>' + p.qHint + '</i></span>' +
      '<input type="text" class="cform__input" data-cf="q" value="' + esc(f.q) + '" ' +
      'placeholder="' + esc(p.qPh) + '" autocomplete="off"></label>' +
      '<p class="cform__msg" data-cf-msg role="alert" hidden></p>' +
      '</div>';
  }

  /* 4번 — 윤이세 1:1 상담 (원포인트 49,000 · 시그니처 100,000)
     2026-11-22 개편:
       · 팝업 맨 위에서 두 상품 중 하나를 고른다 — 누르면 설명·금액·결제 링크가 그 자리에서 바뀐다
       · ① 상품 고르고 결제(카드·계좌이체) → ② 신청서 적고 카톡 접수  (결제가 먼저)
     ※ 개명·작명은 이 팝업이 아니라 카톡 채널에서 따로 안내한다. */
  function consultStepHTML(no, title, sub, sep) {
    return '<p class="shop__step' + (sep ? ' shop__step--sep' : '') + '">' +
      '<i aria-hidden="true">' + no + '</i><b>' + title + '</b><span>' + sub + '</span></p>';
  }
  function consultPickHTML() {
    return '<div class="tiersw tiersw--2" role="group" aria-label="1:1 상담 상품 — 하나를 고르고 결제하세요">' +
      ['onepoint', 'signature'].map(function (k) {
        var p = CONSULT_PRODUCTS[k], on = k === consultTier;
        return '<button type="button" class="tiersw__b' + (on ? ' is-on' : '') + '"' +
          ' data-consult-tier="' + k + '" aria-pressed="' + (on ? 'true' : 'false') + '"' +
          ' aria-label="' + esc(p.name + ' ' + p.price + ' · ' + p.df + (on ? ' — 지금 고른 상품' : ' — 이 상품 고르기')) + '">' +
          '<span class="tiersw__nm"><span class="tiersw__ic" aria-hidden="true">' + p.ic + '</span> ' + esc(p.name) + '</span>' +
          '<span class="tiersw__pr">' + esc(p.price) + '</span>' +
          '<span class="tiersw__df">' + esc(p.df) + '</span></button>';
      }).join('') + '</div>';
  }
  function consultShopHTML() {
    var p = consultProduct(consultTierItem());
    return '<p class="modal__eyebrow">1:1 READING · 윤이세</p>' +
      '<h2 class="shop__title" id="shopTitle">🔎 윤이세 1:1 상담</h2>' +
      consultStepHTML('1', '상품 고르고 결제', '카드 · 계좌이체', false) +
      consultPickHTML() +
      '<p class="shop__sub">' + p.sub + '</p>' +
      '<ul class="shop__list shop__list--tight">' +
      p.list.map(function (row) { return '<li><b>' + row[0] + '</b><span>' + row[1] + '</span></li>'; }).join('') +
      '</ul>' +
      priceHTML(p.priceLabel, p.price) +
      payActionsHTML(p.item) +
      consultStepHTML('2', '신청서 적고 카톡 접수', '결제한 상품 그대로 접수', true) +
      consultFormHTML(p) +
      kakaoOrderHTML(p.item, '💬 신청서 완료 · 카톡으로 접수하기') +
      '<p class="shop__note">결제를 마치고 신청서를 채워 노란 버튼을 누르면 신청 내용이 복사되고 카톡 채널이 열려요. 채팅창에 붙여넣기만 하면 접수 끝.<br>개명·작명(200,000원)은 카톡 채널에서 따로 안내해 드려요.</p>';
  }
  /* 상품을 바꿔도 신청서에 적던 값은 그대로 — 값은 이미 consultForm 메모리에 있다 */
  function switchConsultTier(k) {
    if (!shopBody || !CONSULT_PRODUCTS[k] || k === consultTier) return;
    consultTier = k;
    shopBody.innerHTML = consultShopHTML() + shopCodeLinkHTML('consult') + (state.unlocked ? '' : inviteCardHTML('invitecard--shop'));
    shopBody.scrollTop = 0;
    var nb = shopBody.querySelector('[data-consult-tier="' + k + '"]');
    if (nb) { try { nb.focus({ preventScroll: true }); } catch (e) { nb.focus(); } }
    vibrate(12);
    sfxTap(1);
  }

  function careShopHTML() {
    var el = careElement();
    var c = CARE[el] || CARE['화'];
    var thr = EL_THEME[el] || EL_THEME['화'];
    loadTrial();
    var saved = loadCarePick(el);
    care.pick = saved ? saved.stick : -1;
    care.mi = saved ? saved.mi : -1;
    care.lastMi = saved ? saved.mi : -1;
    var picked = care.pick >= 0 && care.mi >= 0;
    /* 1회 체험을 마친 항목 — 결과는 그대로 보여 주고, 새 실행만 잠근다 */
    var lockedCard = trialUsed('card');
    var lockedObjet = trialUsed('objet');
    var lockedBowl = trialUsed('bowl');
    if (lockedObjet) { care.charge = 0; care.lit = false; care.chargeStep = 0; }
    return '<p class="modal__eyebrow">QUICK CARE · 긴급 개운템 3종</p>' +
      '<h2 class="shop__title" id="shopTitle">⚡ 극도로 힘들 때<br>긴급 개운템</h2>' +
      '<p class="care__place"><b>📍 추천 공간:</b> ' + esc(CARE_PLACE[el] || CARE_PLACE['화']) + '</p>' +
      '<p class="shop__sub">부적을 붙여도 유독 막히고 안 풀리는 날, 앱에서 바로 꺼내 쓰는 <b>3가지</b>예요. 지금 여기서 그대로 체험해 보세요.</p>' +

      /* ⓿ 오늘 액운 태우기 — 긴급 개운템의 맨 앞 */
      '<button type="button" class="burn__entry" data-burn-open="1">' +
      '<span>🔥 오늘 액운 태우기<br><i>적고 · 구기고 · 태워 보내기</i></span>' +
      '<b>' + esc(burnLeftText()) + '</b>' +
      '</button>' +

      /* ① 대나무 산가지 뽑기 */
      '<section class="care care--bamboo' + (lockedCard ? ' is-locked' : '') + '">' +
      '<p class="care__no">01</p>' +
      '<div class="care__head"><p class="care__title">오늘의 긴급 개운 처방</p>' + trialChipHTML('card') + '</div>' +
      '<p class="care__desc">마음이 끌리는 <b>대나무 1개</b>를 직접 뽑아 주세요. 뽑은 하나가 오늘의 처방이에요.</p>' +
      '<div class="bamboo' + (picked ? ' is-picked' : '') + '" data-bamboo>' +
      '<span class="bamboo__tray"></span>' +
      '<span class="bamboo__burst" aria-hidden="true"></span>' +
      '<div class="bamboo__fan">' + bambooSticksHTML() + '</div>' +
      '</div>' +
      '<div class="bamboo__result' + (picked ? ' is-show' : '') + '" data-bamboo-result' + (picked ? '' : ' hidden') + '>' +
      (picked ? bambooResultHTML(el, care.pick, care.mi) : '') + '</div>' +
      '<p class="care__hint" data-bamboo-hint>' + (lockedCard
        ? (picked
          ? '뽑은 하나가 오늘의 처방이에요. 소장하면 내일도 새로 뽑을 수 있어요. '
          : '무료 체험은 1회예요 — 소장하면 매일 새로 뽑을 수 있어요. ')
        : (picked
          ? '뽑은 하나가 오늘의 처방이에요. 다시 뽑으면 다른 처방이 나와요. '
          : '여섯 개 중 마음이 끌리는 하나만 — 한 번에 하나씩 뽑아요.')) +
      (picked ? '<button type="button" class="care__reset" data-care="pickReset">다시 뽑기</button>' : '') + '</p>' +
      '</section>' +

      /* ② 디지털 개운 오브제 — 손가락으로 문지르기 */
      '<section class="care care--obj' + (lockedObjet ? ' is-locked' : '') + '">' +
      '<p class="care__no">02</p>' +
      '<div class="care__head"><p class="care__title">내 디지털 개운 오브제</p>' + trialChipHTML('objet') + '</div>' +
      '<p class="care__desc">내게 부족한 기운은 <b>' + esc(TALIS[el].label) + '</b> — ' + esc(c.name) + esc(c.josa) + ' 손가락으로 문질러 기운을 채워 보세요.</p>' +
      '<div class="care-obj' + (care.lit ? ' is-awake' : '') + (lockedObjet ? ' is-locked' : '') + '" data-care="obj" role="button" tabindex="0" ' +
      'style="--obj-glow:' + thr.color + '; --charge:' + care.charge + '" ' +
      'aria-label="' + esc(c.name) + ' 문질러 기운 충전">' +
      '<span class="care-obj__stage">' +
      '<span class="care-obj__glow"></span>' +
      '<span class="care-obj__beam"></span>' +
      '<span class="care-obj__ring is-r1"></span>' +
      '<span class="care-obj__ring is-r2"></span>' +
      '<span class="care-obj__art">' + OBJ_SVG[c.obj] + '</span>' +
      '<span class="care-obj__dust" data-dust></span>' +
      '<span class="care-obj__pct" data-care-pct>' + Math.round(care.charge) + '%</span>' +
      '</span>' +
      '</div>' +
      '<span class="care-obj__bar"><i style="width:' + care.charge + '%" data-care-bar></i></span>' +
      '<span class="care-obj__label" data-care-label>' + (lockedObjet
        ? '1회 체험 완료 · 소장하면 매일 다시 채울 수 있어요'
        : (care.lit
          ? '✨ 기운 충전 100% 완료!'
          : (care.charge < 1 ? '손가락으로 문지르면 기운이 차요 · 0%' : '문지르는 만큼 기운이 올라와요 · ' + Math.round(care.charge) + '%'))) + '</span>' +
      (care.lit ? '<button type="button" class="care__reset" data-care="objReset">처음부터 다시 채우기</button>' : '') +
      '</section>' +

      /* ③ 1분 오행 싱잉볼 */
      '<section class="care care--bowl' + (lockedBowl ? ' is-locked' : '') + '">' +
      '<p class="care__no">03</p>' +
      '<div class="care__head"><p class="care__title">1분 오행 싱잉볼 · 기운 리셋</p>' + trialChipHTML('bowl') + '</div>' +
      '<p class="care__desc">코로 4초 · 멈춤 2초 · 입으로 6초, <b>12초 복식호흡</b>을 다섯 번 하는 동안 낮게 공명해요. 숨이 바뀔 때마다 다시 울려요.</p>' +
      '<div class="bowl' + (careBowl.on && !careBowl.paused ? ' is-on' : '') + '" data-bowl>' +
      '<button type="button" class="bowl__art" data-care="bowlTap" aria-label="싱잉볼 치기 — 1분 공명 시작">' +
      '<span class="bowl__halo"></span>' +
      '<span class="bowl__ring" data-bowl-ring></span>' +
      '<span class="bowl__ring" data-bowl-ring></span>' +
      '<span class="bowl__ring" data-bowl-ring></span>' +
      '<svg class="bowl__svg" viewBox="0 0 120 120" aria-hidden="true" focusable="false">' +
      '<ellipse cx="60" cy="105" rx="30" ry="6" fill="#2A2724" opacity=".09"/>' +
      '<path d="M28 58h64c0 17-14 31-32 31S28 75 28 58z" fill="#D9B46A"/>' +
      '<path d="M28 58h64c0 17-14 31-32 31S28 75 28 58z" fill="none" stroke="#B98F4A" stroke-width="1.2" opacity=".55"/>' +
      '<ellipse cx="60" cy="58" rx="32" ry="7" fill="#EFD79E"/>' +
      '<ellipse cx="60" cy="58" rx="22" ry="4.5" fill="#C99C4E"/>' +
      '<path d="M46 64c4 3 9 4 14 4s10-1 14-4" fill="none" stroke="#FFF3CF" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>' +
      '<path d="M89 30l2.2 5.6 5.6 2.2-5.6 2.2-2.2 5.6-2.2-5.6-5.6-2.2 5.6-2.2z" fill="#FFF3CF" class="bowl__spark"/>' +
      '<path d="M101 24L88 39" stroke="#B98F4A" stroke-width="3.6" stroke-linecap="round"/>' +
      '<rect x="72" y="43" width="18" height="10" rx="5" fill="#C9A45E" stroke="#A87F3F" stroke-width="1" transform="rotate(-36 81 48)"/>' +
      '<path d="M32 96h56" stroke="#C9A45E" stroke-width="4" stroke-linecap="round"/>' +
      '</svg>' +
      '</button>' +
      '<p class="bowl__phase" data-bowl-phase>' + (careBowl.on
        ? (careBowl.paused ? '잠시 멈춤' : '공명 중')
        : '탭하면 시작 · 60초 복식호흡') + '</p>' +
      '<div class="bowl__bar"><i data-bowl-bar></i></div>' +
      '<p class="bowl__time"><span data-bowl-clock>00:00</span> / 01:00</p>' +
      '</div>' +
      '<div class="bowl__ctrl">' +
      '<button type="button" class="bowl__btn bowl__btn--go" data-care="bowlToggle" data-bowl-go>' +
      '<span data-bowl-golabel>' + (careBowl.on ? (careBowl.paused ? '이어서 듣기' : '일시정지') : '1분 시작') + '</span></button>' +
      '<button type="button" class="bowl__btn bowl__btn--stop" data-care="bowlStop" data-bowl-stop' + (careBowl.on ? '' : ' hidden') + '>그만</button>' +
      '</div>' +
      '<p class="care__hint">' + (lockedBowl
        ? '무료 체험은 1회예요 — 소장하면 매일 다시 들을 수 있어요.'
        : '진행 중에 싱잉볼을 터치해도 언제든 다시 <b>댕~</b> 울려요.') + '</p>' +
      '</section>' +

      /* 결제 영역 — 1회 체험을 마친 항목을 또 누르면 이 자리로 부드럽게 데려온다 */
      '<div class="care__pay" data-care-pay>' +
      '<p class="care__lock" data-care-lock role="status" aria-live="polite" hidden></p>' +
      priceHTML('긴급 개운템', CARE_PRICE) +
      '<div class="pay__pick pay__pick--4" role="group" aria-label="개운템 구성 선택">' +
      CARE_ITEM_ORDER.map(function (k) {
        var it = CARE_ITEMS[k], on = care.buy === k;
        return '<button type="button" class="pay__pick-btn' + (on ? ' is-on' : '') + '" data-careitem="' + k + '" aria-pressed="' + on + '">' +
          '<b>' + it.ico + ' ' + esc(it.name) + '</b><span>' + esc(it.price) + (it.rec ? ' · 추천' : '') + '</span></button>';
      }).join('') +
      '</div>' +
      '<p class="pay__guide">소액(1만 원 미만) 상품은 계좌이체 전용이에요 · <b>' + esc(String(BANK_NAME).trim()) + ' ' + esc(String(BANK_ACCOUNT).trim()) + '</b></p>' +
      payActionsHTML('care-' + care.buy, { card: false, bankSub: esc(careItemLabel(care.buy)) + ' · 계좌번호 복사' }) +
      kakaoOrderHTML('care', '💬 결제 완료 · 카톡으로 알려 주기') +
      '</div>' +
      '<div class="shop__consult">' +
      '<b>🔎 윤이세 1:1 상담</b>' +
      '<span>원포인트 49,000원(고민 1가지) · 시그니처 100,000원(전체 흐름) — 캘린더로도 계속 걸리는 것을 사람이 짚어 드려요.</span>' +
      '<button type="button" class="shop__consult-btn" data-shop="consult">1:1 상담 보기 →</button>' +
      '</div>' +
      '<p class="shop__note">3종은 각각 <b>처음 1회 무료</b>로 체험할 수 있어요 — 다 쓰면 소장하고 매일 꺼내 쓰세요.</p>';
  }

  /* ── 긴급 개운템 동작 ───────────────────────────── */
  function careEl(sel) { return shopBody ? shopBody.querySelector(sel) : null; }

  /* ① 대나무 — 딱 1개 뽑기 */
  function sfxBambooDraw() {
    vibrate([18, 22, 30]);
    var ctx = audioCtx(); if (!ctx) return;
    wood(ctx, 0, 0.11);
    tone(ctx, { from: 660, to: 340, dur: 0.18, glide: 0.1, type: 'triangle', gain: 0.14, attack: 0.004 });
  }
  function sfxBambooReveal() {
    var ctx = audioCtx(); if (!ctx) return;
    [659.25, 783.99, 987.77, 1318.5].forEach(function (f, i) {
      tone(ctx, { from: f, to: f, dur: 0.85, type: 'sine', gain: 0.11, at: 0.04 + i * 0.09, attack: 0.012 });
      tone(ctx, { from: f * 2, to: f * 2, dur: 0.5, type: 'sine', gain: 0.028, at: 0.04 + i * 0.09 });
    });
    wood(ctx, 0.02, 0.05);
  }

  function pickBamboo(i) {
    if (care.pick === i && care.mi >= 0) { vibrate(12); return; }   // 같은 산가지 다시 누름 — 그대로
    if (trialUsed('card')) { careLock('card'); return; }            // 1회 체험 완료 — 새로 뽑기만 잠금
    var el = careElement();
    var mi = drawMission(el, care.lastMi >= 0 ? care.lastMi : care.mi);
    care.pick = i;
    care.mi = mi;
    care.lastMi = mi;
    saveCarePick({ stick: i, mi: mi }, el);
    markTrial('card');                                             // 첫 뽑기 = 무료 체험 1회
    var wrap = careEl('[data-bamboo]');
    if (wrap) wrap.classList.add('is-picked');
    $$('.bamboo__stick', wrap || shopBody).forEach(function (b) {
      var k = parseInt(b.getAttribute('data-stick'), 10);
      b.classList.toggle('is-chosen', k === i);
      b.classList.toggle('is-away', k !== i);
      b.setAttribute('aria-disabled', 'true');
    });
    sfxBambooDraw();
    var panel = careEl('[data-bamboo-result]');
    var hint = careEl('[data-bamboo-hint]');
    if (hint) hint.innerHTML = (trialUsed('card')
      ? '뽑은 하나가 오늘의 처방이에요. 소장하면 내일도 새로 뽑을 수 있어요. '
      : '뽑은 하나가 오늘의 처방이에요. 다시 뽑으면 다른 처방이 나와요. ') +
      '<button type="button" class="care__reset" data-care="pickReset">다시 뽑기</button>';
    if (panel) panel.classList.remove('is-show');
    setTimeout(function () {
      if (!panel) return;
      panel.innerHTML = bambooResultHTML(el, i, mi);
      panel.hidden = false;
      panel.classList.add('is-show');
      sfxBambooReveal();
      vibrate([24, 30, 60]);
    }, 420);
  }

  function resetBamboo() {
    if (trialUsed('card')) { careLock('card'); return; }             // 다시 뽑기는 소장한 뒤에
    care.pick = -1;
    care.mi = -1;                      // lastMi 는 남겨 둔다 — 다시 뽑을 때 바로 앞 처방이 또 나오지 않게
    saveCarePick(null);
    var wrap = careEl('[data-bamboo]');
    if (wrap) wrap.classList.remove('is-picked');
    $$('.bamboo__stick', wrap || shopBody).forEach(function (b) {
      b.classList.remove('is-chosen', 'is-away');
      b.removeAttribute('aria-disabled');
    });
    var panel = careEl('[data-bamboo-result]');
    if (panel) { panel.classList.remove('is-show'); panel.hidden = true; panel.innerHTML = ''; }
    var hint = careEl('[data-bamboo-hint]');
    if (hint) hint.textContent = '여섯 개 중 마음이 끌리는 하나만 뽑아 보세요.';
    sfxTap(1);
  }

  /* ② 오브제 — 손가락 문지르기(pointermove)로 게이지·빛가루·진동 */
  function spawnDust(x, y, n) {
    var layer = careEl('[data-dust]'); if (!layer) return;
    var theme = EL_THEME[careElement()] || EL_THEME['화'];
    var cols = ['#E8BA60', '#FFF0C4', theme.color, '#FFFFFF'];
    for (var i = 0; i < n; i++) {
      while (layer.childElementCount > 46 && layer.firstElementChild) {
        layer.removeChild(layer.firstElementChild);
      }
      var s = document.createElement('i');
      var ang = Math.random() * Math.PI * 2;
      var dist = 18 + Math.random() * 52;
      s.style.left = (x - 3 + (Math.random() - 0.5) * 18).toFixed(1) + 'px';
      s.style.top = (y - 3 + (Math.random() - 0.5) * 18).toFixed(1) + 'px';
      s.style.setProperty('--dx', (Math.cos(ang) * dist).toFixed(1) + 'px');
      s.style.setProperty('--dy', (Math.sin(ang) * dist - 16).toFixed(1) + 'px');
      s.style.setProperty('--p', cols[i % cols.length]);
      s.style.animationDuration = (0.6 + Math.random() * 0.55).toFixed(2) + 's';
      layer.appendChild(s);
      (function (node) {
        setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 1400);
      })(s);
    }
  }

  function paintCharge() {
    var obj = careEl('[data-care="obj"]'); if (!obj) return;
    obj.style.setProperty('--charge', care.charge.toFixed(1));
    var bar = careEl('[data-care-bar]');
    if (bar) bar.style.width = care.charge.toFixed(1) + '%';
    var pct = obj.querySelector('[data-care-pct]');
    if (pct) pct.textContent = Math.round(care.charge) + '%';
    if (care.lit) return;
    var art = obj.querySelector('.care-obj__art');
    if (art) {
      var s = 1 + care.charge / 100 * 0.17;
      var w = Math.sin(care.charge * 0.75) * 2.1;
      art.style.transform = 'scale(' + s.toFixed(3) + ') rotate(' + w.toFixed(2) + 'deg)';
    }
    var label = careEl('[data-care-label]');
    if (label) {
      var c = care.charge;
      label.textContent = c < 1 ? '손가락으로 문지르면 기운이 차요 · 0%'
        : (c < 35 ? '문지르는 만큼 기운이 올라와요 · ' + Math.round(c) + '%'
          : (c < 70 ? '좋아요, 빛이 돌기 시작해요 · ' + Math.round(c) + '%'
            : (c < 100 ? '거의 다 왔어요, 조금만 더 · ' + Math.round(c) + '%' : '✨ 기운 충전 100% 완료!')));
    }
  }

  function sfxAwaken() {
    vibrate([40, 50, 40, 50, 130]);
    var ctx = audioCtx(); if (!ctx) return;
    [392, 523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) {
      tone(ctx, { from: f, to: f, dur: 1.0, type: 'sine', gain: 0.15, at: i * 0.075, attack: 0.012 });
      tone(ctx, { from: f * 2, to: f * 2, dur: 0.55, type: 'sine', gain: 0.03, at: i * 0.075 });
    });
    tone(ctx, { from: 220, to: 720, dur: 0.55, glide: 0.42, type: 'triangle', gain: 0.07 });
    wood(ctx, 0, 0.07);
  }

  function awakenObj() {
    care.charge = 100;
    care.lit = true;
    markTrial('objet');                                            // 100% 충전 = 무료 체험 1회
    paintCharge();
    var obj = careEl('[data-care="obj"]'); if (!obj) return;
    obj.classList.remove('is-rub');
    obj.classList.add('is-awake');
    var art = obj.querySelector('.care-obj__art');
    if (art) art.style.transform = '';
    var label = careEl('[data-care-label]');
    if (label) label.textContent = '✨ 기운 충전 100% 완료!';
    var pct = obj.querySelector('[data-care-pct]');
    if (pct) pct.textContent = '100%';
    spawnDust(75, 78, 16);
    setTimeout(function () { spawnDust(75, 78, 14); }, 180);
    setTimeout(function () { spawnDust(75, 78, 12); }, 380);
    sfxAwaken();
    setTimeout(function () {
      var me = careEl('[data-care="obj"]');
      if (!me || careEl('[data-care="objReset"]')) return;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'care__reset';
      b.setAttribute('data-care', 'objReset');
      b.textContent = '처음부터 다시 채우기';
      (me.closest('.care') || me.parentNode).appendChild(b);
    }, 900);
  }

  function addCharge(amount, px, py) {
    if (care.lit || !(amount > 0)) return;
    care.charge = Math.min(100, care.charge + amount);
    paintCharge();
    care.dustAcc += amount;
    if (care.dustAcc >= 2.4) {
      care.dustAcc = 0;
      spawnDust(px, py, 1);
    }
    var step = Math.floor(care.charge / 20);
    if (step > care.chargeStep) {
      care.chargeStep = step;
      spawnDust(px, py, 5);
      vibrate(16);
      var ctx = audioCtx();
      if (ctx) tone(ctx, { from: 520 + step * 90, to: 520 + step * 90, dur: 0.18, type: 'sine', gain: 0.05 });
    }
    if (care.charge >= 100) awakenObj();
  }

  function resetObj() {
    if (trialUsed('objet')) { careLock('objet'); return; }          // 처음부터 다시 채우기는 소장한 뒤에
    care.charge = 0; care.lit = false; care.chargeStep = 0; care.dustAcc = 0;
    var obj = careEl('[data-care="obj"]');
    if (obj) {
      obj.classList.remove('is-awake', 'is-rub');
      var art = obj.querySelector('.care-obj__art');
      if (art) art.style.transform = '';
      var dust = obj.querySelector('[data-dust]');
      if (dust) dust.innerHTML = '';
      var pct = obj.querySelector('[data-care-pct]');
      if (pct) pct.textContent = '0%';
    }
    paintCharge();
    var rs = careEl('[data-care="objReset"]');
    if (rs && rs.parentNode) rs.parentNode.removeChild(rs);
    sfxTap(1);
  }

  /* pointer/touch 로 문지르는 감각 — 오브제 위에서만, 이동 거리만큼 차오른다 */
  function initCare() {
    var obj = careEl('[data-care="obj"]');
    if (!obj) return;
    var rub = { on: false, id: null, x: 0, y: 0, moved: 0 };
    function stageBox() {
      var st = obj.querySelector('.care-obj__stage');
      return (st || obj).getBoundingClientRect();
    }

    function onDown(e) {
      if (care.lit) return;
      if (trialUsed('objet')) { careLock('objet'); return; }        // 1회 체험 완료 — 다시 채우기 잠금
      rub.on = true; rub.id = e.pointerId;
      rub.x = e.clientX; rub.y = e.clientY; rub.moved = 0;
      obj.classList.add('is-rub');
      try { obj.setPointerCapture(e.pointerId); } catch (err) {}
      if (e.cancelable) e.preventDefault();
      var r = stageBox();
      spawnDust(e.clientX - r.left, e.clientY - r.top, 3);
    }
    function onMove(e) {
      if (!rub.on || e.pointerId !== rub.id || care.lit) return;
      if (e.cancelable) e.preventDefault();
      var r = stageBox();
      var inside = e.clientX > r.left - 30 && e.clientX < r.right + 30 &&
        e.clientY > r.top - 30 && e.clientY < r.bottom + 30;
      var dx = e.clientX - rub.x, dy = e.clientY - rub.y;
      rub.x = e.clientX; rub.y = e.clientY;
      if (!inside) return;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < 0.5) return;
      rub.moved += d;
      addCharge(Math.min(d, 28) * 0.05, e.clientX - r.left, e.clientY - r.top);
    }
    function onUp(e) {
      if (!rub.on) return;
      rub.on = false;
      obj.classList.remove('is-rub');
      try {
        if (obj.hasPointerCapture && obj.hasPointerCapture(e.pointerId)) obj.releasePointerCapture(e.pointerId);
      } catch (err) {}
      if (rub.moved < 6 && !care.lit) {
        var r = stageBox();
        addCharge(6, r.width / 2, r.height / 2);
      }
    }
    obj.addEventListener('pointerdown', onDown);
    obj.addEventListener('pointermove', onMove);
    obj.addEventListener('pointerup', onUp);
    obj.addEventListener('pointercancel', onUp);
    obj.addEventListener('touchmove', function (e) { if (e.cancelable) e.preventDefault(); }, { passive: false });
    obj.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
      e.preventDefault();
      if (care.lit) return;
      if (trialUsed('objet')) { careLock('objet'); return; }
      var r = stageBox();
      addCharge(12, r.width / 2, r.height / 2);
    });
  }

  /* ③ 싱잉볼 — 60초 지속 공명 + 12초 복식호흡(4·2·6) 재타종 + 수동 타종 */
  var BOWL = {
    base: 196,                                        // G3 — 낮고 편안한 울림
    total: 60,
    inSec: 4, holdSec: 2, outSec: 6,                  // 들이쉬기 4초 · 멈춤 2초 · 내쉬기 6초 = 12초 한 호흡
    cycle: 12
  };
  /* 타종 시각 — 숨이 시작되는 자리(12초마다)와 내쉬기로 넘어가는 자리(6초 뒤)에 맞춘다 */
  BOWL.beats = (function () {
    var out = [];
    for (var c = 0; c < BOWL.total; c += BOWL.cycle) {
      out.push({ at: c, gain: c === 0 ? 0.95 : 0.55 });
      var ex = c + BOWL.inSec + BOWL.holdSec;
      if (ex < BOWL.total) out.push({ at: ex, gain: 0.3 });
    }
    return out;
  })();
  BOWL.strikeAt = BOWL.beats.map(function (b) { return b.at; });
  var careBowl = {
    on: false, paused: false, elapsed: 0, resumedAt: 0,
    timer: null, ctx: null, master: null, nodes: [], ringIdx: 0, lastBeat: -1
  };

  /* 타종 하나 — 배음 5개가 7초 넘게 남는다 */
  function bowlStrikeAt(ctx, dest, t0, o) {
    if (!ctx || !dest) return;
    o = o || {};
    var scale = o.gain == null ? 1 : o.gain;
    var base = BOWL.base;
    var parts = [[1, 1], [2.02, 0.42], [2.98, 0.26], [4.07, 0.15], [5.42, 0.1]];
    parts.forEach(function (p, i) {
      var osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(base * p[0] * (1 + (i % 2 ? 0.0017 : -0.0013)), t0);
      var peak = 0.22 * p[1] * scale;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + 0.01 + i * 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 7.6 - i * 0.55);
      osc.connect(g); g.connect(dest);
      osc.start(t0); osc.stop(t0 + 8);
    });
    // 말렛이 스치는 쇠 소리
    var n = Math.floor(ctx.sampleRate * 0.1);
    if (n > 0) {
      var buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
      for (var k = 0; k < n; k++) d[k] = (Math.random() * 2 - 1) * Math.pow(1 - k / n, 7);
      var src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g2 = ctx.createGain();
      bp.type = 'bandpass'; bp.frequency.value = 2800; bp.Q.value = 0.7;
      g2.gain.value = 0.045 * scale;
      src.buffer = buf; src.connect(bp); bp.connect(g2); g2.connect(dest);
      src.start(t0);
    }
  }

  /* 60초 내내 살아 숨 쉬는 낮은 공명 드론 */
  function bowlDrone(ctx) {
    var master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, ctx.currentTime);
    master.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 1.6);
    master.connect(ctx.destination);

    var nodes = [];
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 640; lp.Q.value = 0.6;
    lp.connect(master); nodes.push(lp);

    var droneGain = ctx.createGain();
    droneGain.gain.value = 0.5;
    droneGain.connect(lp); nodes.push(droneGain);

    [[1, 'sine', 0.20], [0.5, 'sine', 0.13], [2, 'triangle', 0.05], [3.01, 'sine', 0.028]].forEach(function (v, idx) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = v[1];
      o.frequency.value = BOWL.base * v[0] * (1 + (idx === 3 ? 0.0025 : 0));
      g.gain.value = v[2];
      o.connect(g); g.connect(droneGain);
      o.start(); nodes.push(o, g);
    });

    // 아주 느린 숨쉬기 LFO — 소리가 살아 있는 느낌
    var lfo = ctx.createOscillator(), lfoGain = ctx.createGain();
    lfo.type = 'sine'; lfo.frequency.value = 0.085;
    lfoGain.gain.value = 0.16;
    lfo.connect(lfoGain); lfoGain.connect(droneGain.gain);
    lfo.start(); nodes.push(lfo, lfoGain);

    // 은은한 쇠 잔향
    var nb = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2), ctx.sampleRate);
    var nd = nb.getChannelData(0);
    for (var i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    var ns = ctx.createBufferSource(); ns.buffer = nb; ns.loop = true;
    var nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 2400; nf.Q.value = 1.2;
    var ng = ctx.createGain(); ng.gain.value = 0.012;
    ns.connect(nf); nf.connect(ng); ng.connect(master);
    ns.start(); nodes.push(ns, nf, ng);

    return { master: master, nodes: nodes };
  }

  function bowlAudioOff(sec) {
    var ctx = careBowl.ctx, master = careBowl.master, nodes = careBowl.nodes || [];
    careBowl.master = null; careBowl.nodes = []; careBowl.ctx = null;
    if (!ctx || !master) return;
    var t = ctx.currentTime;
    try {
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), t);
      master.gain.exponentialRampToValueAtTime(0.0001, t + sec);
    } catch (e) {}
    setTimeout(function () {
      nodes.forEach(function (n) {
        try { if (n.stop) n.stop(); } catch (e) {}
        try { n.disconnect(); } catch (e) {}
      });
      try { master.disconnect(); } catch (e) {}
    }, (sec + 0.25) * 1000);
  }

  function bowlRing() {
    var rings = $$('[data-bowl-ring]', shopBody || document);
    if (!rings.length) return;
    var r = rings[careBowl.ringIdx++ % rings.length];
    r.classList.remove('is-hit');
    void r.offsetWidth;
    r.classList.add('is-hit');
  }

  function bowlUI() {
    var wrap = careEl('[data-bowl]');
    var lbl = careEl('[data-bowl-golabel]');
    var stop = careEl('[data-bowl-stop]');
    if (wrap) {
      wrap.classList.toggle('is-on', careBowl.on && !careBowl.paused);
      wrap.classList.toggle('is-paused', careBowl.paused);
    }
    if (lbl) lbl.textContent = !careBowl.on ? '1분 시작' : (careBowl.paused ? '이어서 듣기' : '일시정지');
    if (stop) stop.hidden = !careBowl.on;
  }

  function paintBowl(el) {
    var left = Math.max(0, Math.ceil(BOWL.total - el));
    var cyc = el % BOWL.cycle;
    var inhale = cyc < BOWL.inSec;
    var hold = !inhale && cyc < BOWL.inSec + BOWL.holdSec;
    var p, scale;
    if (inhale) {
      p = cyc / BOWL.inSec;
      scale = 1 + p * 0.28;                          // 들이마시면 배가 볼록 — 천천히 부풀어 오른다
    } else if (hold) {
      scale = 1.28;                                  // 잠깐 머무는 2초 동안 그대로
    } else {
      p = (cyc - BOWL.inSec - BOWL.holdSec) / BOWL.outSec;
      scale = 1.28 - p * 0.28;                       // 내쉬면 배가 쏙 들어간다
    }
    var wrap = careEl('[data-bowl]');
    if (wrap) {
      wrap.style.setProperty('--bs', scale.toFixed(3));
      wrap.classList.toggle('is-in', inhale);
      wrap.classList.toggle('is-hold', hold);
      wrap.classList.toggle('is-out', !inhale && !hold);
    }
    var phase = careEl('[data-bowl-phase]');
    if (phase) phase.textContent = inhale
      ? '코로 들이마시기 · 배가 볼록 나와요'
      : (hold ? '잠깐 멈춤 · 배는 그대로' : '입으로 내쉬기 · 배가 쏙 들어가요');
    var bar = careEl('[data-bowl-bar]');
    if (bar) bar.style.width = (el / BOWL.total * 100).toFixed(1) + '%';
    var clock = careEl('[data-bowl-clock]');
    if (clock) {
      var mm = Math.floor(left / 60), ss = left % 60;
      clock.textContent = (mm < 10 ? '0' + mm : mm) + ':' + (ss < 10 ? '0' + ss : ss);
    }

    var beat = -1;
    for (var i = 0; i < BOWL.strikeAt.length; i++) if (el >= BOWL.strikeAt[i] - 0.05) beat = i;
    if (beat > careBowl.lastBeat) {
      careBowl.lastBeat = beat;
      bowlRing();
      vibrate(14);
    }
  }

  function bowlTick() {
    if (!careBowl.on || careBowl.paused) return;
    var el = careBowl.elapsed + (performance.now() - careBowl.resumedAt) / 1000;
    if (el >= BOWL.total) { bowlFinish(); return; }
    paintBowl(el);
  }

  function bowlBegin(fromElapsed) {
    var from = fromElapsed || 0;
    markTrial('bowl');                                            // 1분 시작 = 무료 체험 1회
    careBowl.on = true;
    careBowl.paused = false;
    careBowl.elapsed = from;
    careBowl.resumedAt = performance.now();
    careBowl.lastBeat = -1;
    for (var j = 0; j < BOWL.strikeAt.length; j++) if (from + 0.05 >= BOWL.strikeAt[j]) careBowl.lastBeat = j;
    if (careBowl.timer) { clearInterval(careBowl.timer); careBowl.timer = null; }

    var ctx = audioCtx();
    if (ctx) {
      var d = bowlDrone(ctx);
      careBowl.ctx = ctx; careBowl.master = d.master; careBowl.nodes = d.nodes;
      bowlStrikeAt(ctx, d.master, ctx.currentTime + 0.03, { gain: 0.95 });
      BOWL.beats.forEach(function (b) {
        var off = b.at - from;
        if (off > 0.4) bowlStrikeAt(ctx, d.master, ctx.currentTime + off, { gain: b.gain });
      });
    }
    bowlRing();
    vibrate([60, 40, 120]);
    careBowl.timer = setInterval(bowlTick, 180);
    bowlUI();
    bowlTick();
  }

  function bowlPause() {
    if (!careBowl.on || careBowl.paused) return;
    careBowl.elapsed = Math.min(BOWL.total, careBowl.elapsed + (performance.now() - careBowl.resumedAt) / 1000);
    careBowl.paused = true;
    if (careBowl.timer) { clearInterval(careBowl.timer); careBowl.timer = null; }
    bowlAudioOff(0.45);
    var left = Math.max(0, Math.ceil(BOWL.total - careBowl.elapsed));
    var phase = careEl('[data-bowl-phase]');
    if (phase) phase.textContent = '잠시 멈춤 · 남은 ' + left + '초';
    var wrap = careEl('[data-bowl]');
    if (wrap) { wrap.classList.remove('is-in', 'is-out', 'is-hold'); wrap.style.setProperty('--bs', '1'); }
    bowlUI();
    vibrate(10);
  }

  /* closeShop 에서도 부르는 전체 정리 — 오디오 노드를 깨끗하게 끊는다 */
  function stopBowl() {
    if (careBowl.on && !careBowl.paused) {
      careBowl.elapsed = Math.min(BOWL.total, careBowl.elapsed + (performance.now() - careBowl.resumedAt) / 1000);
    }
    var was = careBowl.on || !!careBowl.master;
    careBowl.on = false; careBowl.paused = false; careBowl.elapsed = 0; careBowl.lastBeat = -1;
    if (careBowl.timer) { clearInterval(careBowl.timer); careBowl.timer = null; }
    bowlAudioOff(0.5);
    var phase = careEl('[data-bowl-phase]');
    if (phase) phase.textContent = '탭하면 시작 · 60초 복식호흡';
    var bar = careEl('[data-bowl-bar]'); if (bar) bar.style.width = '0%';
    var clock = careEl('[data-bowl-clock]'); if (clock) clock.textContent = '00:00';
    var wrap = careEl('[data-bowl]');
    if (wrap) { wrap.classList.remove('is-in', 'is-out', 'is-hold'); wrap.style.setProperty('--bs', '1'); }
    bowlUI();
    if (was) vibrate(12);
  }

  function sfxBowlDone() {
    var ctx = audioCtx(); if (!ctx) return;
    [523.25, 659.25, 783.99].forEach(function (f, i) {
      tone(ctx, { from: f, to: f, dur: 1.1, type: 'sine', gain: 0.1, at: i * 0.16, attack: 0.02 });
    });
  }

  function bowlFinish() {
    if (careBowl.timer) { clearInterval(careBowl.timer); careBowl.timer = null; }
    var ctx = careBowl.ctx, master = careBowl.master;
    if (ctx && master) bowlStrikeAt(ctx, master, ctx.currentTime + 0.02, { gain: 0.75 });
    bowlAudioOff(3.2);
    careBowl.on = false; careBowl.paused = false; careBowl.elapsed = 0; careBowl.lastBeat = -1;
    var phase = careEl('[data-bowl-phase]');
    if (phase) phase.textContent = '기운 리셋 완료 · 오늘 하루 수고했어요';
    var bar = careEl('[data-bowl-bar]'); if (bar) bar.style.width = '100%';
    var clock = careEl('[data-bowl-clock]'); if (clock) clock.textContent = '00:00';
    var wrap = careEl('[data-bowl]');
    if (wrap) { wrap.classList.remove('is-on', 'is-in', 'is-out', 'is-hold', 'is-paused'); wrap.style.setProperty('--bs', '1'); }
    bowlRing();
    sfxBowlDone();
    vibrate([30, 50, 30, 50, 120]);
    bowlUI();
  }

  function bowlTap() {
    if (!careBowl.on && trialUsed('bowl')) { careLock('bowl'); return; }   // 1회 체험 완료 — 다시 시작 잠금
    if (!careBowl.on) { bowlBegin(0); return; }
    if (careBowl.paused) { bowlBegin(careBowl.elapsed); return; }
    if (careBowl.ctx && careBowl.master) {
      bowlStrikeAt(careBowl.ctx, careBowl.master, careBowl.ctx.currentTime + 0.01, { gain: 0.8 });
    }
    bowlRing();
    vibrate([45, 30, 70]);
  }

  function bowlToggle() {
    if (!careBowl.on) {
      if (trialUsed('bowl')) { careLock('bowl'); return; }
      bowlBegin(0); return;
    }
    if (careBowl.paused) { bowlBegin(careBowl.elapsed); return; }
    bowlPause();
  }

  /* 개운템 구성(낱개 3종 / 3종 풀세트) 고르면 계좌이체 버튼 문구가 그 구성으로 바뀐다 */
  function setCareItem(v) {
    if (!CARE_ITEMS[v]) return;
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
    var bankSub = shopBody.querySelector('[data-pay="bank"] .pay__label span');
    if (bankSub) bankSub.textContent = careItemLabel(v) + ' · 계좌번호 복사';
    var cardSub = shopBody.querySelector('[data-pay="card"] .pay__label span');
    if (cardSub) cardSub.textContent = cardUrlOf('care-' + v) ? '카드·간편결제로 바로 결제' : '카카오톡으로 결제 링크 받기';
    var note = shopBody.querySelector('[data-pay-note]');
    if (note) { note.hidden = true; note.innerHTML = ''; }
    sfxTap(1);
  }

  function handleCare(kind, btn, ev) {
    if (kind === 'stick') { pickBamboo(parseInt(btn.getAttribute('data-stick'), 10) || 0); return; }
    if (kind === 'pickReset') { resetBamboo(); return; }
    if (kind === 'obj') { return; }             // 문지르기는 initCare 의 pointer 이벤트가 맡는다
    if (kind === 'objReset') { resetObj(); return; }
    if (kind === 'bowlTap') { bowlTap(); return; }
    if (kind === 'bowlToggle') { bowlToggle(); return; }
    if (kind === 'bowlStop') { stopBowl(); return; }
  }

  /* ── 결제가 끝난 고객에게 또 결제창을 띄우지 않는다 (2026-11-21 QA M2) ── */
  function ownedShopHTML(tier) {
    var rank = TIER_RANK[tier] || 0;
    var ups = ['allinone', 'diary'].filter(function (k) { return (TIER_RANK[k] || 0) > rank; });
    return '<p class="modal__eyebrow">ALREADY OPEN · 결제 완료</p>' +
      '<h2 class="shop__title" id="shopTitle">✅ ' + esc(TIER_NAME[tier]) + ' 적용 중</h2>' +
      '<p class="shop__sub">이미 <b>' + esc(TIER_NAME[tier]) + '</b> 코드로 이 사주가 열려 있어요. 같은 상품을 다시 결제하실 필요는 없어요.</p>' +
      '<ul class="shop__list">' +
      '<li><b>지금 열려 있는 것</b><span>' + esc(OWNED_DESC[tier] || '') + '</span></li>' +
      '<li><b>기간</b><span>2026년 11월부터 2027년 12월까지 14개월</span></li>' +
      '</ul>' +
      (ups.length
        ? '<p class="shop__note">더 위 구성으로 올라가실 때는 차액만 내시면 돼요.</p>' +
          ups.map(function (k) {
            return '<button type="button" class="btn btn--ghost-light shop-btn" data-shop="' + k + '">' +
              '<span class="shop-btn__no">↑</span>' +
              '<span class="shop-btn__text"><span class="shop-btn__label">⬆️ ' + esc(TIER_NAME[k]) +
              ' 업그레이드' + (upPrice(tier, k) ? ' <b>' + wonNum(upPrice(tier, k)) + '</b>' : '') + '</span>' +
              '<span class="shop-btn__desc">' + esc(UPGRADE_GAIN[k] || '') + '</span></span></button>';
          }).join('')
        : '') +
      '<button type="button" class="btn modal__done-btn modal__done-btn--dark" data-shop-close>닫기</button>';
  }

  /** ↔ 상위 티어 — 이미 낸 금액은 두고 차액만 안내한다 */
  function upgradeShopHTML(from, to) {
    var fee = upPrice(from, to);
    return '<p class="modal__eyebrow">UPGRADE · 차액만 결제</p>' +
      '<h2 class="shop__title" id="shopTitle">⬆️ ' + esc(TIER_NAME[to]) + ' 업그레이드</h2>' +
      '<p class="shop__sub">지금 쓰고 계신 상품은 <b>' + esc(TIER_NAME[from]) + '</b>이에요. 이미 내신 금액은 그대로 두고 ' +
      (fee ? '<b>차액 ' + wonNum(fee) + '</b>만' : '차액만') + ' 더 내시면 ' + esc(TIER_NAME[to]) + ' 코드로 바꿔 드려요.</p>' +
      '<ul class="shop__list">' +
      '<li><b>' + esc(TIER_NAME[to]) + '에 더해지는 것</b><span>' + esc(UPGRADE_GAIN[to] || '') + '</span></li>' +
      '<li><b>지금 쓰는 사주 그대로</b><span>생년월일·성별은 바꾸지 않고 그대로 올려 드려요</span></li>' +
      '</ul>' +
      '<div class="shop__save"><b>' + esc(TIER_NAME[from]) + ' → ' + esc(TIER_NAME[to]) +
      (fee ? ' · ' + wonNum(fee) : '') + '</b><span>' +
      (fee ? '이미 내신 금액은 그대로 인정되고, 차액만 더 내시면 돼요'
        : '이미 내신 금액만큼 빼고 차액은 카톡으로 정확히 안내해 드려요') + '</span></div>' +
      (fee
        /* 차액이 정해진 업그레이드(1년 패스 → 올인원 7,900원)는 카톡 신청만 있으면
           손님이 한 번 더 기다려야 해서, 카드결제도 그 자리에서 바로 되게 붙였다(2026-11-21). */
        ? priceHTML(TIER_NAME[to] + ' 업그레이드', wonNum(fee)) +
          payActionsHTML('up-' + to) +
          kakaoOrderHTML('up-' + to, '💬 결제 완료 · 카톡으로 ' + esc(TIER_NAME[to]) + ' 코드 받기') +
          '<p class="shop__note">카드로 결제하셨으면 노란 버튼으로 카톡에 알려 주세요. 차액을 확인한 뒤 ' + esc(TIER_NAME[to]) + ' 코드를 보내 드려요.</p>'
        : '<button type="button" class="btn btn--primary burn__upgrade" data-tier-upgrade="' + to + '">💬 카톡으로 업그레이드 신청</button>' +
          '<p class="shop__note">누르면 신청 내용이 복사되고 카카오톡 채널이 열려요. 입금을 확인한 뒤 ' + esc(TIER_NAME[to]) + ' 코드를 보내 드려요.</p>') +
      '<button type="button" class="btn modal__done-btn" data-shop-close>닫기</button>';
  }

  /** 차액 업그레이드 신청 — 신청 내용을 복사하고 카톡 채널로 (1년 패스 → 올인원 · 성찰) */
  function goTierUpgrade(to) {
    var from = state.unlocked && TIER_NAME[state.tier] ? state.tier : '';
    if (!from || !TIER_NAME[to] || (TIER_RANK[to] || 0) <= (TIER_RANK[from] || 0)) return;
    var fee = upPrice(from, to);
    var parts = ['[윤이세 2027 캘린더 신청] ' + TIER_NAME[to] + ' 업그레이드 (' + TIER_NAME[from] + ' → ' +
      TIER_NAME[to] + ') ' + (fee ? '추가 ' + wonNum(fee) : '차액 안내 요청')];
    var b = ownerMatchLine();
    if (b) parts.push(b);
    copyText(parts.join(' / '), function (copied) {
      toast(copied === true
        ? '✅ 업그레이드 신청 내용을 복사했어요 — 카톡에 붙여 보내 주세요'
        : '카톡 채널로 이동해요 — ' + TIER_NAME[to] + ' 업그레이드' + (fee ? '(' + wonNum(fee) + ')' : '') + '라고 알려 주세요');
    });
    vibrate(18);
    openNoRef(KAKAO);
  }

  /** 구입 팝업 내용 — 이미 갖고 있는 상품이면 '적용 중', 더 높은 상품이면 차액 업그레이드 */
  function shopHTMLFor(kind) {
    if (TIER_NAME[kind] && state.unlocked && TIER_NAME[state.tier]) {
      var own = TIER_RANK[state.tier] || 0, want = TIER_RANK[kind] || 0;
      return want <= own ? ownedShopHTML(state.tier) : upgradeShopHTML(state.tier, kind);
    }
    return kind === 'burn' ? burnShopHTML()
      : (kind === 'care' ? careShopHTML()
        : (kind === 'consult' ? consultShopHTML()
          : (kind === 'diary' ? diaryShopHTML()
            : (kind === 'allinone' ? allinoneShopHTML() : passShopHTML()))));
  }

  /* 상품 팝업을 닫지 않고 1년 패스 ↔ 올인원 ↔ 성찰 에디션으로 갈아탄다.
     이미 가진 등급이면 shopHTMLFor() 가 '적용 중'·'차액 업그레이드'로 그린다. */
  /* 어느 상품 팝업 맨 아래에나 — 코드를 이미 받은 사람이 결제창을 다시 거치지 않고
     달력 아래 **그 하나의 입력창**을 바로 여는 줄 (2026-11-21) */
  function codeEntryHTML() {
    return '<button type="button" class="shop__code" data-lock-open>🔑 입장 코드가 있어요 · 바로 입력</button>';
  }
  function shopCodeLinkHTML(kind) {
    return (TIER_NAME[kind] || kind === 'burn') ? codeEntryHTML() : '';
  }
  var shopKind = '';
  function switchShop(kind) {
    if (!shopBody || !TIER_NAME[kind] || kind === shopKind) return;
    shopKind = kind;
    shopBody.innerHTML = shopHTMLFor(kind) + shopCodeLinkHTML(kind) + (state.unlocked ? '' : inviteCardHTML('invitecard--shop'));
    shopBody.scrollTop = 0;
    vibrate(12);
    sfxTap(1);
    var nb = shopBody.querySelector('[data-shop-switch="' + kind + '"]');
    if (nb) { try { nb.focus({ preventScroll: true }); } catch (e) { nb.focus(); } }
  }

  function openShop(kind) {
    if (!shopEl) return;
    if (!shopEl.hidden) stopBowl();            // 앞 팝업의 싱잉볼 잔향을 남기지 않는다
    shopLastFocus = document.activeElement;
    shopKind = kind;
    shopBody.innerHTML = shopHTMLFor(kind) + shopCodeLinkHTML(kind) + (state.unlocked ? '' : inviteCardHTML('invitecard--shop'));
    shopEl.hidden = false;
    document.body.classList.add('is-modal-open');
    shopBody.scrollTop = 0;
    if (kind === 'care') initCare();
    sfxOpen();
    try { shopDialog.focus({ preventScroll: true }); } catch (e) { shopDialog.focus(); }
  }

  function closeShop() {
    if (!shopEl || shopEl.hidden || shopClosing) return;
    stopBowl();
    shopClosing = true;
    shopEl.classList.add('is-closing');
    setTimeout(function () {
      shopEl.classList.remove('is-closing');
      shopEl.hidden = true;
      shopBody.innerHTML = '';
      shopClosing = false;
      shopKind = '';
      if ((!modalEl || modalEl.hidden) && (!burnEl || burnEl.hidden)) document.body.classList.remove('is-modal-open');
      var target = shopLastFocus;
      if (target && target.focus) { try { target.focus({ preventScroll: true }); } catch (e) {} }
      shopLastFocus = null;
    }, 180);
  }

  /* ══ 🔥 오늘 액운 태우기 ═════════════════════════════════════════
     무료 5회(1년 패스·체험) / 올인원·성찰 에디션은 날마다 계속.
     **어느 등급이든 하루에 딱 1회** — localStorage 에 마지막으로 태운 날짜(YYYY-MM-DD)를 남긴다.
     · 사람 이름은 묻지도 받지도 않는다 — '일'과 '걱정'만 적는 한 줄.
     · 적은 글은 메모리(burn.text)에만 있고, 팝업을 닫으면 즉시 사라진다.
       localStorage 에는 '쓴 횟수'와 '마지막으로 태운 날짜'만 남는다.
     · 4단계: ⓿ 촛불 앞에서 숨 고르기 ① 한 줄 적기 ② 구기기·태우기(불꽃·진동·재)
              ③ 내 사주로 빈자리 채우기 */
  var BURN_KEY = 'yoonise.timing.burn.v1';
  var BURN_FREE_BASE = 5;
  var BURN_FREE = BURN_FREE_BASE + (invited ? INVITE_BURN_BONUS : 0);   // 친구 초대 링크로 온 손님은 +1회
  var BURN_UPGRADE_PRICE = '7,900원';   // 1년 패스(14,900원) → 올인원(19,900원) 추가 금액
  var BURN_CHIPS = ['오늘 실수한 일', '답답한 연락', '지우고 싶은 걱정', '미뤄 둔 부탁'];

  /* 내 원국에서 가장 적은 오행의 '빈자리 처방' — 맑고 시원한 쪽으로만 쓴다 */
  var BURN_PURIFY = {
    목: {
      name: '새 바람', hanja: '木',
      why: '뻗어 나가는 기운이 비면, 벌여 놓은 일만 늘고 시작은 자꾸 밀려요.',
      line: '창문을 열고 3분만 바깥 공기를 들이세요. 멈춰 있던 자리가 조금씩 풀립니다.'
    },
    화: {
      name: '따뜻한 햇살', hanja: '火',
      why: '표현하고 결정하는 기운이 비면, 해야 할 말이 목까지 올라와도 삼키게 돼요.',
      line: '햇볕 드는 자리에서 따뜻한 차 한 잔. 미뤄 둔 결정은 그다음에 하세요.'
    },
    토: {
      name: '고른 황금빛 흙', hanja: '土',
      why: '버티는 기운이 비면, 사소한 일에도 하루가 통째로 흔들려요.',
      line: '발바닥으로 흙을 3분 밟아 보세요. 흔들리던 중심이 제자리로 돌아옵니다.'
    },
    금: {
      name: '서늘한 크리스탈', hanja: '金',
      why: '끊고 정리하는 기운이 비면, 안 해도 될 일까지 붙잡고 늘어져요.',
      line: '책상을 한 번 비우고 숨을 길게 내쉬세요. 머릿속이 맑게 정리됩니다.'
    },
    수: {
      name: '시원한 소나기', hanja: '水',
      why: '가라앉히는 기운이 비면, 생각이 마르고 자꾸 조급해져요.',
      line: '미지근한 물 한 모금, 손을 씻어 보세요. 타는 마음이 한 칸 내려갑니다.'
    }
  };

  var burnEl = null, burnBody = null, burnDialog = null, burnLastFocus = null, burnClosing = false;
  var burn = { used: 0, day: '', text: '', stage: 'prep', timer: 0, holdTimer: 0, sparkTimer: 0, sparkTimer2: 0, prepTimers: [] };
  var BURN_BURN_MS = 7800;        // 불이 붙은 뒤 재가 될 때까지 — 7.8초, 느리고 묵직하게
  var BURN_HOLD_MS = 1000;        // 구겨진 덩어리를 보는 한 박자
  var BURN_PRESS_MS = 800;        // 성냥을 종이 아래에 꾹 눌러 불을 붙이는 시간(0.8초)

  /** 기기 기준 오늘 날짜 — 자정을 넘겨도 새 날로 센다 */
  function burnISODate(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function burnTodayKey() { return burnISODate(new Date()); }

  function loadBurn() {
    var o = null;
    try { o = JSON.parse(localStorage.getItem(BURN_KEY)); } catch (e) { o = null; }
    var n = o && typeof o.used === 'number' && isFinite(o.used) ? Math.floor(o.used) : 0;
    burn.used = Math.max(0, Math.min(BURN_FREE, n));
    burn.day = o && typeof o.day === 'string' ? o.day : '';
    /* 2026-11-21h 이전 저장값 — day 없이 at(마지막으로 태운 시각)만 있다. 그 날을 마지막 날로 본다 */
    if (!burn.day && o && o.at) {
      var at = new Date(o.at);
      if (!isNaN(at.getTime())) burn.day = burnISODate(at);
    }
  }
  function saveBurn() {
    try { localStorage.setItem(BURN_KEY, JSON.stringify({ used: burn.used, day: burn.day, at: new Date().toISOString() })); } catch (e) {}
  }
  /** 오늘 이미 1회 태웠는가 — 등급과 무관하게 하루 1회 */
  function burnBurnedToday() { return !!burn.day && burn.day === burnTodayKey(); }
  function burnUnlimited() { return tierAtLeast('allinone'); }  function burnLeft() { return Math.max(0, BURN_FREE - burn.used); }
  function burnTierName() { return state.tier === 'diary' ? '성찰 에디션' : '올인원'; }
  function burnLeftText() {
    var done = burnBurnedToday();
    if (burnUnlimited()) return burnTierName() + (done ? ' · 오늘 마침' : ' · 매일 1회');
    var l = burnLeft();
    if (done) return l > 0 ? '오늘 마침 · 무료 ' + l + '회 남음' : '오늘 마침 · 무료 ' + BURN_FREE + '회 모두 사용';
    return l > 0 ? '남은 무료 ' + l + '회' : '무료 ' + BURN_FREE + '회를 다 썼어요';
  }
  /** 달력 위 카드의 오늘 상태 배지와 버튼 문구 */
  function renderBurnCard() {
    var el = $('#burnLeft'), card = $('#burnCard');
    if (!el) return;
    var un = burnUnlimited(), done = burnBurnedToday(), out = !un && burnLeft() <= 0;
    el.textContent = done ? '오늘의 의식 마침'
      : (un ? '매일 1회' : (out ? '무료 ' + BURN_FREE + '회 모두 사용' : '남은 무료 ' + burnLeft() + '회'));
    el.classList.toggle('is-unlimited', un && !done);
    el.classList.toggle('is-out', out && !done);
    el.classList.toggle('is-done', done);
    if (card) {
      card.classList.toggle('is-out', out && !done);
      card.classList.toggle('is-done', done);
    }
    var sub = $('#burnCtaSub'), main = $('#burnCtaMain');
    if (sub) sub.textContent = done ? '하루에 단 한 번, 진심을 담아 비워내는 의식입니다'
      : (un ? '매일 한 번, 적고 · 구기고 · 태우면 끝' : '한 장에 적고 · 구기고 · 태우면 끝');
    if (main) main.textContent = done ? '오늘의 의식을 마쳤습니다 · 내일 다시' : '🔥 지금 한 장 태우기';
  }
  function burnElement() {
    try { return (state.res && repElement().el) || '수'; } catch (e) { return '수'; }
  }

  /* 재·정화 파티클 — 위치와 시간만 흔들고, 글은 담지 않는다
     o 없이 부르면 기존 기본값(정화 파티클용), o 로 지연·지속·크기를 늘려 소각용으로 쓴다 */
  function burnDustHTML(n, o) {
    o = o || {};
    var d0 = o.d0 == null ? 0 : o.d0, d1 = o.d1 == null ? 1.5 : o.d1;
    var u0 = o.u0 == null ? 1.5 : o.u0, u1 = o.u1 == null ? 2.8 : o.u1;
    var s0 = o.s0 == null ? 3 : o.s0, s1 = o.s1 == null ? 7 : o.s1;
    var sp = o.dx == null ? 35 : o.dx;
    var out = '';
    for (var i = 0; i < n; i++) {
      var sway = Math.round((Math.random() * 2 - 1) * (6 + Math.random() * 14));
      out += '<i style="--x:' + (4 + Math.random() * 92).toFixed(1) + '%;--dx:' +
        (Math.random() * sp * 2 - sp).toFixed(0) + ';--dl:' + (d0 + Math.random() * (d1 - d0)).toFixed(2) +
        's;--du:' + (u0 + Math.random() * (u1 - u0)).toFixed(2) + 's;--sz:' + (s0 + Math.random() * (s1 - s0)).toFixed(1) +
        'px;--h:' + (0.42 + Math.random() * 0.86).toFixed(2) + ';--rot:' + Math.round(160 + Math.random() * 520) +
        'deg;--sway:' + sway + 'px"></i>';
    }
    return out;
  }

  /* ⓿ 어둑한 한옥 방의 은은한 호박빛 촛불 (2026-11-21)
     딱딱한 도형 SVG 대신 생성한 사진을 깔고, 그 위에 CSS로 아주 천천히 숨 쉬는 빛을 얹는다.
     '예쁘고 편안한 의식'이 되도록 — 불꽃을 깜빡이지 않고 온기만 은은하게 오르내린다. */
  var CANDLE_HTML =
    '<div class="candle" aria-hidden="true">' +
      '<img class="candle__photo" src="assets/candle-warm.jpg?v=20261121ab" alt="" decoding="async">' +
      '<span class="candle__glow"></span>' +
      '<span class="candle__breath"></span>' +
      '<span class="candle__smoke"></span>' +
    '</div>';

  /* ⓿ 촛불 앞에서 숨 고르기 — 3·2·1 뒤에 '의식 시작하기'가 살아난다 */
  function burnPrepHTML() {
    return '<p class="modal__eyebrow">BEFORE THE RITUAL · 준비</p>' +
      '<h2 class="burn__prep-title" id="burnModalTitle">하루에 단 한 번, 진심을 담아 비워내는 의식입니다.</h2>' +
      '<div class="burn__altar" data-burn-altar>' + CANDLE_HTML + '</div>' +
      '<p class="burn__prep-sub">잠시 숨을 고른 뒤, 오늘 내려놓고 싶은 한 가지를 적어 주세요.</p>' +
      '<p class="burn__breath" data-burn-breath aria-live="polite">3…</p>' +
      '<button type="button" class="burn__go burn__go--start" data-burn="start" disabled>의식 시작하기</button>' +
      '<p class="burn__foot">' + esc(burnLeftText()) + '</p>';
  }

  /* 오늘 이미 한 번 태웠을 때 — 꺼진 촛불과 함께 내일 다시 오라는 안내 */
  function burnTodayDoneHTML() {
    var un = burnUnlimited(), l = burnLeft();
    var leftLine = un
      ? burnTierName() + '은 매일 한 번씩 — 내일 다시 마음을 비우러 오세요.'
      : (l > 0 ? '무료 ' + BURN_FREE + '회 중 ' + l + '회 남았어요. 내일 다시 마음을 비우러 오세요.'
               : '무료 ' + BURN_FREE + '회를 모두 썼어요. 내일도 이어 가시려면 올인원을 살펴보세요.');
    return '<p class="modal__eyebrow">RITUAL DONE · 오늘의 의식</p>' +
      '<h2 class="burn__prep-title" id="burnModalTitle">오늘의 의식을 마쳤습니다. 내일 다시 마음을 비우러 오세요.</h2>' +
      '<div class="burn__altar is-out" data-burn-altar>' + CANDLE_HTML + '</div>' +
      '<p class="burn__prep-sub">' + esc(leftLine) + '</p>' +
      '<p class="burn__foot">하루에 단 한 번, 진심을 담아 비워내는 의식입니다. 적은 글은 어디에도 남지 않았어요.</p>' +
      (!un && l <= 0 ? '<button type="button" class="burn__go burn__go--start" data-burn="upgrade">올인원 살펴보기</button>' : '') +
      '<button type="button" class="btn btn--ghost modal__done-btn" data-burn-close>닫기</button>';
  }

  function clearPrepTimers() {
    (burn.prepTimers || []).forEach(function (t) { clearTimeout(t); });
    burn.prepTimers = [];
  }
  /** 3… 2… 1… — 3초가 지나면 버튼이 켜진다 */
  function runBurnPrep() {
    clearPrepTimers();
    var num = burnBody ? burnBody.querySelector('[data-burn-breath]') : null;
    var btn = burnBody ? burnBody.querySelector('[data-burn="start"]') : null;
    if (!num || !btn) return;
    ['3…', '2…', '1…'].forEach(function (t, i) {
      burn.prepTimers.push(setTimeout(function () {
        if (burn.stage !== 'prep') return;
        num.textContent = t;
        num.classList.remove('is-pop'); void num.offsetWidth; num.classList.add('is-pop');
        vibrate(10);
      }, i * 1000));
    });
    burn.prepTimers.push(setTimeout(function () {
      if (burn.stage !== 'prep') return;
      num.textContent = '이제, 마음을 열어도 좋아요';
      num.classList.add('is-ready');
      btn.disabled = false;
      btn.classList.add('is-on');
      vibrate([16, 30, 18]);
    }, 3000));
  }

  /* ① 한 줄 적기 */
  function burnWriteHTML() {
    return '<p class="modal__eyebrow">BURN &amp; RESET · 액운 태우기</p>' +
      '<h2 class="burn__title" id="burnModalTitle">오늘의 탁한 기운을<br>한 장에 적어 거두어 냅니다</h2>' +
      '<p class="burn__guide">오늘 두고 갈 일, 잊고 싶은 일, 털어낼 걱정을 적어 보세요<br>(어디에도 저장되지 않고 바로 사라져요)</p>' +
      '<p class="burn__count">' + esc(burnLeftText()) + '</p>' +
      '<input class="burn__input" id="burnInput" type="text" maxlength="60" autocomplete="off" ' +
      'aria-label="오늘 태워 보낼 한 줄" placeholder="한 줄이면 충분합니다">' +
      '<div class="burn__chips">' + BURN_CHIPS.map(function (c) {
        return '<button type="button" class="burn__chip" data-burn-chip="' + esc(c) + '">' + esc(c) + '</button>';
      }).join('') + '</div>' +
      '<button type="button" class="burn__go" data-burn="write">이 한 장에 적었습니다</button>' +
      '<p class="burn__hint">적은 글은 이 화면 안에서만 살다가, 다 타면 흔적 없이 사라집니다.</p>';
  }

  /* ② 구기기 · 태우기 — 소각대를 크게 열어 두고, 불이 붙으면 먹빛·금빛으로 바뀐다 */
  /* 성냥 아이콘 — 나무 개비 + 머리 + 빨강·주황·노랑 3중 불꽃 (--fl 로 불꽃 크기를 조절) */
  var MATCH_SVG =
    '<svg class="burn__match" viewBox="0 0 40 64" aria-hidden="true" focusable="false">' +
      '<defs>' +
        '<radialGradient id="mtGlow" cx="50%" cy="50%" r="50%">' +
          '<stop offset="0%" stop-color="#FFB24A" stop-opacity=".8"/>' +
          '<stop offset="58%" stop-color="#FF7A18" stop-opacity=".22"/>' +
          '<stop offset="100%" stop-color="#FF6A10" stop-opacity="0"/>' +
        '</radialGradient>' +
        '<radialGradient id="mtFlame" cx="50%" cy="80%" r="66%">' +
          '<stop offset="0%" stop-color="#FFF8DC"/>' +
          '<stop offset="30%" stop-color="#FFCE55"/>' +
          '<stop offset="62%" stop-color="#FF8A1E"/>' +
          '<stop offset="100%" stop-color="#E23F0C" stop-opacity=".18"/>' +
        '</radialGradient>' +
        '<linearGradient id="mtWood" x1="0" y1="0" x2="1" y2="0">' +
          '<stop offset="0%" stop-color="#9A6C39"/>' +
          '<stop offset="42%" stop-color="#E7C894"/>' +
          '<stop offset="100%" stop-color="#8E6231"/>' +
        '</linearGradient>' +
      '</defs>' +
      '<ellipse class="match-glow" cx="20" cy="24" rx="17" ry="19" fill="url(#mtGlow)"/>' +
      '<rect x="17.7" y="31" width="4.6" height="32" rx="2" fill="url(#mtWood)"/>' +
      '<path d="M17.7 59.6h4.6v1.5a2.3 2.3 0 0 1-4.6 0z" fill="#6E4A22" opacity=".55"/>' +
      '<ellipse cx="20" cy="32.6" rx="5.5" ry="6.6" fill="#7C2A11"/>' +
      '<ellipse cx="18.2" cy="30.2" rx="2.2" ry="2.6" fill="#C24C22" opacity=".5"/>' +
      '<g class="match-flame"><g class="match-flick">' +
        '<path d="M20 1c4.7 8.3 8.5 13.6 8.5 19.8a8.5 8.5 0 0 1-17 0C11.5 14.6 15.3 9.3 20 1z" fill="url(#mtFlame)"/>' +
        '<path d="M20 11.6c2.7 4.7 4.7 7.6 4.7 10.8a4.7 4.7 0 0 1-9.4 0c0-3.2 2-6.1 4.7-10.8z" fill="#FFD962"/>' +
        '<path d="M20 18.6c1.4 2.3 2.2 3.5 2.2 5a2.2 2.2 0 0 1-4.4 0c0-1.5.8-2.7 2.2-5z" fill="#FFFBE8"/>' +
      '</g></g>' +
    '</svg>';

  function burnPaperHTML() {
    return '<p class="modal__eyebrow">STEP 2 · 구기고 태우기</p>' +
      '<h2 class="sr-only" id="burnModalTitle">액운 태우기 — 구기고 태우기</h2>' +
      '<p class="burn__rite">오늘의 탁한 기운을,<br>불로 거두어 들입니다</p>' +
      '<div class="burn__stage" data-burn-stage>' +
      '<span class="burn__pyre" data-burn-pyre aria-hidden="true"><span class="burn__glow"></span><i></i><i></i><i></i><i></i><i></i></span>' +
      '<span class="burn__flame" aria-hidden="true"></span>' +
      '<div class="burn__paper" data-burn-paper aria-label="구겨진 한지 — 0.8초 꾹 누르면 불이 붙습니다">' +
      '<span class="burn__paper-text">' + esc(burn.text) + '</span>' +
      '</div>' +
      '<span class="burn__ember" data-burn-ember tabindex="0" role="button" aria-disabled="true" aria-label="불 붙은 성냥 — 손가락으로 종이까지 끌어 올리거나, 종이 아래를 0.8초 꾹 누르면 불이 붙습니다">' + MATCH_SVG + '</span>' +
      '<span class="burn__gauge" data-burn-gauge aria-hidden="true"><i></i></span>' +
      '<span class="burn__ash" data-burn-ash aria-hidden="true"></span></div>' +
      '<p class="burn__hint" data-burn-hint>한지를 <b>꾹 눌러</b> 구기세요. 톡 눌러도 괜찮습니다.</p>' +
      '<button type="button" class="burn__go burn__go--squeeze" data-burn="crumple"><b>꾹 눌러 구기기</b></button>' +
      '<p class="burn__foot">' + esc(burnLeftText()) + '</p>';
  }

  /* ③ 내 사주로 빈자리 채우기 */
  function burnDoneHTML() {
    var el = burnElement();
    var p = BURN_PURIFY[el] || BURN_PURIFY['수'];
    var tal = TALIS[el] || TALIS['수'];
    return '<p class="modal__eyebrow">STEP 3 · 내 사주로 빈자리 채우기</p>' +
      '<h2 class="sr-only" id="burnModalTitle">액운 태우기 — 다 탔습니다</h2>' +
      '<p class="burn__done-title">재가 되어 흩어졌으니,<br>이제 맑은 기운만 남았습니다</p>' +
      '<div class="burn__purify burn__purify--' + el + '" data-burn-purify>' +
      '<span class="burn__hanja" aria-hidden="true">' + p.hanja + '</span>' +
      '<span class="burn__wave" aria-hidden="true"></span>' +
      '<span class="burn__sky" aria-hidden="true">' + burnDustHTML(16) + '</span>' +
      '<p class="burn__purify-name">' + esc(p.name) + '</p>' +
      '<p class="burn__purify-el">내 원국에서 가장 적은 기운 · ' + esc(tal.label) + '</p>' +
      '</div>' +
      '<p class="burn__done-sub">' + esc(p.why) + '<br>그 빈자리는 <b>' + esc(p.name) + '</b> 기운으로 채웠습니다.</p>' +
      '<p class="burn__rx"><b>오늘의 한 줄 처방</b>' + esc(p.line) + '</p>' +
      '<p class="burn__foot">' + esc(burnLeftText()) + '</p>' +
      '<p class="burn__done-day">오늘의 의식을 마쳤습니다. 내일 다시 마음을 비우러 오세요.</p>' +
      '<button type="button" class="btn btn--ghost modal__done-btn" data-burn-close>닫기</button>';
  }

  function openBurnModal() {
    if (!burnEl) return;
    clearTimeout(burn.timer);
    clearPrepTimers();
    burn.text = '';
    burnLastFocus = document.activeElement;
    // 오늘 이미 한 번 태웠으면 — 꺼진 촛불과 함께 내일 다시 오라는 안내만 (추가 소각 금지)
    if (burnBurnedToday()) {
      burnEl.hidden = false;
      burn.stage = 'done';
      burnBody.innerHTML = burnTodayDoneHTML();
      burnDialog.classList.add('is-dark');
      document.body.classList.add('is-modal-open');
      burnBody.scrollTop = 0;
      sfxBurnOpen();
      try { burnDialog.focus({ preventScroll: true }); } catch (e) { try { burnDialog.focus(); } catch (e2) {} }
      return;
    }
    // 무료 5회를 다 썼으면 리추얼 대신 올인원 안내 팝업으로 자연스럽게 넘긴다
    if (!burnUnlimited() && burnLeft() <= 0) { openShop('burn'); return; }
    burnEl.hidden = false;
    burn.stage = 'prep';
    burnBody.innerHTML = burnPrepHTML();
    burnDialog.classList.add('is-dark');       // 어두운 제단 위 촛불
    document.body.classList.add('is-modal-open');
    burnBody.scrollTop = 0;
    sfxBurnOpen();
    try { burnDialog.focus({ preventScroll: true }); } catch (e) { try { burnDialog.focus(); } catch (e2) {} }
    runBurnPrep();
  }

  /** 0단계 → 1단계 : 촛불 앞에서 종이로 */
  function burnBeginWrite() {
    if (burn.stage !== 'prep') return;
    if (burnBurnedToday()) { showBurnTodayDone(); return; }
    clearPrepTimers();
    burn.stage = 'write';
    if (burnDialog) burnDialog.classList.remove('is-dark');
    burnBody.innerHTML = burnWriteHTML();
    burnBody.scrollTop = 0;
    sfxTap(1);
  }

  function showBurnTodayDone() {
    clearPrepTimers();
    burn.stage = 'done';
    burn.text = '';
    if (burnDialog) burnDialog.classList.add('is-dark');
    burnBody.innerHTML = burnTodayDoneHTML();
    burnBody.scrollTop = 0;
  }

  function closeBurnModal() {
    if (!burnEl || burnEl.hidden || burnClosing) return;
    burnClosing = true;
    clearTimeout(burn.timer);
    clearTimeout(burn.holdTimer);
    clearTimeout(burn.sparkTimer);
    clearTimeout(burn.sparkTimer2);
    clearPrepTimers();
    stopHold();
    flick.dragging = false; flick.drag = null; flick.src = null; flick.holdLock = false;
    unbindGestures();
    burn.text = '';                       // 적은 글은 여기서 바로 지운다 — 어디에도 남기지 않는다
    burnEl.classList.add('is-closing');
    setTimeout(function () {
      burnEl.classList.remove('is-closing');
      burnEl.hidden = true;
      burnBody.innerHTML = '';
      burnClosing = false;
      burn.stage = 'prep';
      if (burnDialog) burnDialog.classList.remove('is-dark');
      if ((!modalEl || modalEl.hidden) && (!shopEl || shopEl.hidden)) document.body.classList.remove('is-modal-open');
      var t = burnLastFocus;
      if (t && t.focus) { try { t.focus({ preventScroll: true }); } catch (e) {} }
      burnLastFocus = null;
    }, 180);
  }

  function burnWrite() {
    var inp = burnEl ? burnEl.querySelector('#burnInput') : null;
    var v = inp ? String(inp.value || '').trim() : '';
    if (!v) {
      toast('한 줄만 적어 주세요 — 짧아도 괜찮아요');
      vibrate([30, 20, 30]);
      if (inp) {
        inp.classList.remove('is-shake'); void inp.offsetWidth; inp.classList.add('is-shake');
        try { inp.focus(); } catch (e) {}
      }
      return;
    }
    burn.text = v.slice(0, 60);
    burn.stage = 'paper';
    burnBody.innerHTML = burnPaperHTML();
    burnBody.scrollTop = 0;
    initIgniteGestures();
    sfxTap(1);
  }

  /* 구기기 — 묵직하게 꽉 뭉친 뒤, 덩어리를 한 박자 보여 주고 나서 불 붙이기 버튼이 살아난다 */
  function burnCrumple() {
    if (burn.stage !== 'paper') return;
    burn.stage = 'crumpled';
    var paper = burnEl.querySelector('[data-burn-paper]');
    if (paper) paper.classList.add('is-crumpled');
    sfxCrumple();
    vibrate([70, 40, 120, 30, 90]);
    var btn = burnEl.querySelector('[data-burn="crumple"]');
    if (btn) {
      btn.disabled = true;
      btn.classList.add('is-waiting');
      btn.innerHTML = '<b>꾹… 단단하게 뭉치는 중</b>';
    }
    var hint = burnEl.querySelector('[data-burn-hint]');
    if (hint) hint.innerHTML = '손끝에 힘이 들어가고, 적은 글은 <b>단단한 한 덩어리</b>로 뭉칩니다…';
    clearTimeout(burn.holdTimer);
    burn.holdTimer = setTimeout(function () {
      if (burn.stage !== 'crumpled') return;
      /* 버튼 대신 — 손으로 직접 불을 붙이는 의식 (성냥 끌어 올리기 / 0.8초 꾹 누르기) */
      if (btn && btn.parentNode) btn.hidden = true;
      var stage = burnEl.querySelector('[data-burn-stage]');
      if (stage) stage.classList.add('is-ready');
      var emberEl = burnEl.querySelector('[data-burn-ember]');
      if (emberEl) {
        emberEl.setAttribute('aria-disabled', 'false');
        try { emberEl.focus({ preventScroll: true }); } catch (e) {}
      }
      if (hint) hint.innerHTML = '이제 <b>성냥을 종이까지 끌어 올리거나</b>, 종이 아래를 <b>0.8초 꾹</b> 눌러 불을 붙이세요.';
      vibrate(24);
    }, BURN_HOLD_MS);
  }

  /* ── 손으로 불을 붙이는 의식: 성냥 끌어 올리기 · 0.8초 꾹 누르기 ──
     안드로이드 네이버 인앱 브라우저는 롱프레스 뒤 pointermove·setPointerCapture 가 끊기는
     경우가 있어, 터치(touchstart·touchmove·touchend)를 window 레벨 passive:false 로 먼저 잡고
     pointer 이벤트는 마우스·펜 보조로만 쓴다. */
  var flick = { dragging: false, holding: false, raf: 0, t0: 0, drag: null, src: null, pid: null,
                holdX: 0, holdY: 0, holdLock: false, lastTouch: 0, unbind: [] };
  var FLICK_LIFT = 36;      // 위로 36px만 끌어 올리면 종이에 불이 옮겨붙는다
  var FLICK_GROW = 52;      // 이 거리에서 성냥 불꽃이 최대로 피어오른다
  var FLICK_SLOP = 16;      // 꾹 누르다 이만큼 흔들리면 스크롤로 보고 게이지를 멈춘다

  function unbindGestures() {
    (flick.unbind || []).forEach(function (fn) { try { fn(); } catch (e) {} });
    flick.unbind = [];
  }

  function nowMs() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
  function firstTouch(e) {
    return (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || null;
  }
  function burnStageEl() { return burnEl ? burnEl.querySelector('[data-burn-stage]') : null; }
  function burnEmberEl() { return burnEl ? burnEl.querySelector('[data-burn-ember]') : null; }
  function setFlame(p) {
    var e = burnEmberEl();
    if (!e) return;
    e.style.setProperty('--fl', Math.max(0, Math.min(1, p)).toFixed(2));
  }

  function stopHold() {
    if (flick.raf) { cancelAnimationFrame(flick.raf); flick.raf = 0; }
    flick.holding = false;
    var stage = burnStageEl();
    if (stage) { stage.classList.remove('is-holding'); stage.style.removeProperty('--hold'); }
    if (burn.stage === 'crumpled') setFlame(0);
  }

  function startHold(x, y, withDrag) {
    if (burn.stage !== 'crumpled' || flick.holding || flick.holdLock) return;
    if (flick.dragging && !withDrag) return;      // 성냥을 끄는 중이면 게이지는 그쪽이 맡는다
    var stage = burnStageEl();
    if (!stage) return;
    flick.holding = true;
    flick.holdX = x; flick.holdY = y;
    flick.t0 = nowMs();
    stage.classList.add('is-holding');
    stage.style.setProperty('--hold', '0');
    vibrate(12);
    var tick = function () {
      if (!flick.holding) return;
      var p = Math.min(1, (nowMs() - flick.t0) / BURN_PRESS_MS);
      stage.style.setProperty('--hold', p.toFixed(3));
      setFlame(p * 0.9);
      if (p >= 1) {
        flick.holding = false;
        stage.style.removeProperty('--hold');
        stage.classList.remove('is-holding');
        igniteByHand();
        return;
      }
      flick.raf = requestAnimationFrame(tick);
    };
    flick.raf = requestAnimationFrame(tick);
  }

  function holdMoved(x, y) {
    if (!flick.holding) return;
    if (Math.abs(x - flick.holdX) > FLICK_SLOP || Math.abs(y - flick.holdY) > FLICK_SLOP) stopHold();
  }

  function igniteByHand() {
    if (burn.stage !== 'crumpled') return;
    var stage = burnStageEl();
    var emberEl = burnEmberEl();
    var spot = null;
    var paperEl = burnEl && burnEl.querySelector('[data-burn-paper]');
    if (stage && emberEl && paperEl) {            // 성냥이 닿은 자리 — is-ready 를 떼기 전에 잰다
      var sr = stage.getBoundingClientRect(), er = emberEl.getBoundingClientRect(), pr = paperEl.getBoundingClientRect();
      if (er.width) spot = { x: er.left + er.width / 2 - sr.left, y: Math.max(pr.bottom, er.top) - sr.top };
    }
    if (stage) { stage.classList.remove('is-ready', 'is-holding'); stage.style.removeProperty('--hold'); }
    flick.dragging = false; flick.drag = null; flick.src = null; flick.holdLock = false;
    burnIgnite(spot);
  }

  /* 성냥을 든다 → 옮긴다(불꽃이 피어오른다) → 종이에 닿으면 옮겨붙는다 */
  function dragStart(x, y, src) {
    if (burn.stage !== 'crumpled' || flick.dragging) return false;
    if (!burnEmberEl()) return false;
    stopHold();
    flick.dragging = true; flick.src = src; flick.drag = { x: x, y: y }; flick.holdLock = false;
    burnEmberEl().classList.add('is-grab');
    setFlame(0.08);
    vibrate(14);
    return true;
  }

  function dragMove(x, y, emberOnPaper) {
    if (!flick.dragging || !flick.drag || burn.stage !== 'crumpled') return;
    var emberEl = burnEmberEl();
    if (!emberEl) return;
    var dx = x - flick.drag.x;
    var dy = Math.min(0, y - flick.drag.y);            // 위로 끌어 올린다
    var lift = -dy;
    if (lift > 6 || Math.abs(dx) > 6) {            // 손가락이 움직이면 '꾹'은 취소, 끌기만 본다
      flick.holdLock = true;
      if (flick.holding) stopHold();
    }
    emberEl.style.transform = 'translate(' + Math.round(dx) + 'px,' + Math.round(dy) + 'px)';
    setFlame(Math.max(0.08, lift / FLICK_GROW));        // 손가락이 올라간 만큼 불꽃이 커진다
    if (lift >= FLICK_LIFT || (emberOnPaper && emberOnPaper())) igniteByHand();
  }

  function dragEnd() {
    var emberEl = burnEmberEl();
    if (emberEl) emberEl.classList.remove('is-grab');
    if (!flick.dragging) return;
    flick.dragging = false; flick.src = null; flick.pid = null; flick.drag = null; flick.holdLock = false;
    if (burn.stage === 'crumpled' && emberEl) {
      emberEl.style.transform = '';
      setFlame(0);
      vibrate(8);
    }
  }

  function initIgniteGestures() {
    if (!burnEl) return;
    var stage = burnEl.querySelector('[data-burn-stage]');
    var paper = burnEl.querySelector('[data-burn-paper]');
    var emberEl = burnEl.querySelector('[data-burn-ember]');
    if (!stage || !paper || !emberEl) return;

    /* 다시 그릴 때마다 이전 리스너를 깨끗이 걷어낸다 */
    unbindGestures();
    function on(target, type, fn, opts) {
      if (!target || !target.addEventListener) return;
      target.addEventListener(type, fn, opts);
      flick.unbind.push(function () { target.removeEventListener(type, fn, opts); });
    }
    function inEmber(node) { return node === emberEl || emberEl.contains(node); }
    function ready() { return burn.stage === 'crumpled' && stage.classList.contains('is-ready'); }

    function emberOnPaper() {
      var pb = paper.getBoundingClientRect();
      var eb = emberEl.getBoundingClientRect();
      var cx = eb.left + eb.width / 2, cy = eb.top + eb.height / 2;
      return cx > pb.left - 26 && cx < pb.right + 26 && cy > pb.top - 26 && cy < pb.bottom + 34;
    }

    /* ── ① 터치 (모바일 주 경로) — 롱프레스·스크롤·선택메뉴를 preventDefault 로 막는다 ── */
    on(emberEl, 'touchstart', function (e) {
      if (burn.stage !== 'crumpled') return;
      if (e.cancelable) e.preventDefault();
      flick.lastTouch = nowMs();
      var t = firstTouch(e);
      if (t && dragStart(t.clientX, t.clientY, 'touch')) startHold(t.clientX, t.clientY, true);
    }, { passive: false });

    on(stage, 'touchstart', function (e) {
      if (!ready() || inEmber(e.target)) return;      // 성냥은 dragStart 가 맡는다
      if (e.cancelable) e.preventDefault();           // 롱프레스 복사창·스크롤 차단
      flick.lastTouch = nowMs();
      var t = firstTouch(e);
      if (t) startHold(t.clientX, t.clientY);
    }, { passive: false });

    on(window, 'touchmove', function (e) {
      if (!flick.dragging && !flick.holding) return;
      if (e.cancelable) e.preventDefault();
      var t = firstTouch(e);
      if (!t) return;
      flick.lastTouch = nowMs();
      if (flick.dragging) { dragMove(t.clientX, t.clientY, emberOnPaper); return; }
      holdMoved(t.clientX, t.clientY);
    }, { passive: false });

    on(window, 'touchend', function () {
      flick.lastTouch = nowMs();
      if (flick.dragging) dragEnd();
      if (flick.holding) stopHold();
    }, { passive: true });
    on(window, 'touchcancel', function () {
      if (flick.dragging) dragEnd();
      if (flick.holding) stopHold();
    }, { passive: true });

    /* ── ② pointer (마우스·펜 보조 경로) ── */
    on(emberEl, 'pointerdown', function (e) {
      if (burn.stage !== 'crumpled') return;
      if (nowMs() - flick.lastTouch < 900) return;     // 방금 터치 경로가 잡았다
      if (e.cancelable) e.preventDefault();
      if (!dragStart(e.clientX, e.clientY, 'pointer')) return;
      startHold(e.clientX, e.clientY, true);
      flick.pid = e.pointerId;
      try { emberEl.setPointerCapture(e.pointerId); } catch (err) {}
    });
    on(window, 'pointermove', function (e) {
      if (!flick.dragging || flick.src !== 'pointer') return;
      if (e.cancelable) e.preventDefault();
      dragMove(e.clientX, e.clientY, emberOnPaper);
    });
    function pointerEnd(e) {
      try { if (emberEl.hasPointerCapture && emberEl.hasPointerCapture(e.pointerId)) emberEl.releasePointerCapture(e.pointerId); } catch (err) {}
      if (flick.src === 'pointer' && flick.dragging) dragEnd();
      if (flick.holding) stopHold();
    }
    on(window, 'pointerup', pointerEnd);
    on(window, 'pointercancel', pointerEnd);

    on(stage, 'pointerdown', function (e) {
      if (inEmber(e.target) || !ready()) return;
      if (nowMs() - flick.lastTouch < 900) return;
      if (e.cancelable) e.preventDefault();
      startHold(e.clientX, e.clientY);
    });

    /* ── ③ 복사하기·텍스트 선택 메뉴 차단 (성냥을 쓰는 순간부터) ── */
    on(stage, 'contextmenu', function (e) { e.preventDefault(); });
    on(stage, 'selectstart', function (e) { e.preventDefault(); });
    on(document, 'selectionchange', function () {
      if (burn.stage !== 'crumpled') return;
      var sel = window.getSelection && window.getSelection();
      if (sel && String(sel).length) { try { sel.removeAllRanges(); } catch (err) {} }
    });

    /* ── ④ 키보드 ── */
    on(emberEl, 'keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
      e.preventDefault();
      if (burn.stage !== 'crumpled') return;
      startHold(0, 0);
    });
  }

  function burnIgnite(flashSpot) {
    if (burn.stage !== 'crumpled') return;
    burn.stage = 'burning';
    clearTimeout(burn.holdTimer);
    var paper = burnEl.querySelector('[data-burn-paper]');
    if (paper) paper.classList.add('is-burning');
    var stage = burnEl.querySelector('[data-burn-stage]');
    if (stage) stage.classList.add('is-dark', 'is-burning');
    if (stage && flashSpot) {
      var flashEl = document.createElement('span');
      flashEl.className = 'burn__flash';
      flashEl.setAttribute('aria-hidden', 'true');
      flashEl.style.left = Math.round(flashSpot.x) + 'px';
      flashEl.style.top = Math.round(flashSpot.y) + 'px';
      stage.appendChild(flashEl);
      setTimeout(function () { if (flashEl.parentNode) flashEl.parentNode.removeChild(flashEl); }, 1000);
    }
    var pyre = burnEl.querySelector('[data-burn-pyre]');
    if (pyre) pyre.classList.add('is-lit');
    if (burnDialog) burnDialog.classList.add('is-dark');
    var ash = burnEl.querySelector('[data-burn-ash]');
    if (ash) ash.innerHTML = burnDustHTML(24, { d0: 0.4, d1: 3.6, u0: 2.8, u1: 4.0, s0: 3.5, s1: 9 });
    var hint = burnEl.querySelector('[data-burn-hint]');
    if (hint) hint.innerHTML = '탁한 기운이 천천히 타들어 가고 있습니다…';
    var btn = burnEl.querySelector('[data-burn="ignite"]');
    if (btn) btn.hidden = true;          // 타오르는 동안에는 글자 대신 불만 보이게
    sfxIgnite();
    /* 하루 1회 — 등급과 무관하게 마지막으로 태운 날짜를 남긴다 */
    if (!burnUnlimited()) burn.used = Math.min(BURN_FREE, burn.used + 1);
    burn.day = burnTodayKey();
    saveBurn();
    renderBurnCard();
    /* 중반·후반 — 굵은 재와 금빛 불티가 2·3차 물결로 화면 가득 올라간다 */
    clearTimeout(burn.sparkTimer);
    clearTimeout(burn.sparkTimer2);
    function ashWave(n, o) {
      if (burn.stage !== 'burning' || !stage || !stage.parentNode) return;
      var extra = document.createElement('span');
      extra.className = 'burn__ash';
      extra.setAttribute('aria-hidden', 'true');
      extra.innerHTML = burnDustHTML(n, o);
      stage.appendChild(extra);
    }
    if (stage) {
      burn.sparkTimer = setTimeout(function () {
        ashWave(28, { d0: 0, d1: 2.0, u0: 2.4, u1: 3.4, s0: 4, s1: 10.5, dx: 48 });
        var h = burnEl && burnEl.querySelector('[data-burn-hint]');
        if (h) h.innerHTML = '재가 되어 흩어지고 있습니다…';
      }, Math.round(BURN_BURN_MS * 0.42));
      burn.sparkTimer2 = setTimeout(function () {
        ashWave(24, { d0: 0, d1: 1.8, u0: 2.2, u1: 3.2, s0: 3, s1: 8, dx: 56 });
      }, Math.round(BURN_BURN_MS * 0.72));
    }
    clearTimeout(burn.timer);
    var reduce = false;
    try { reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) {}
    burn.timer = setTimeout(burnFinish, reduce ? 1400 : BURN_BURN_MS);
  }

  function burnFinish() {
    burn.stage = 'done';
    clearTimeout(burn.sparkTimer);
    clearTimeout(burn.sparkTimer2);
    if (burnDialog) burnDialog.classList.remove('is-dark');
    burnBody.innerHTML = burnDoneHTML();
    burnBody.scrollTop = 0;
    sfxPurify(burnElement());
    vibrate([18, 26, 42]);
  }

  /* 예전 '한 장 더 태우기' 자리 — 이제는 하루 1회라 오늘은 더 태울 수 없다 */
  function burnAgain() {
    if (burnBurnedToday()) { showBurnTodayDone(); return; }
    if (!burnUnlimited() && burnLeft() <= 0) {
      closeBurnModal();
      setTimeout(function () { openShop('burn'); }, 210);
      return;
    }
    burn.text = '';
    burn.stage = 'prep';
    burnBody.innerHTML = burnPrepHTML();
    burnDialog.classList.add('is-dark');
    burnBody.scrollTop = 0;
    runBurnPrep();
  }

  /* 5장을 다 쓴 뒤 — 올인원 안내(1년 패스 사용자는 7,900원 업그레이드) */
  function burnShopHTML() {
    var pass = !!state.unlocked && state.tier === 'pass';
    return '<p class="modal__eyebrow">ALL-IN-ONE · 매일 1회 액운 태우기</p>' +
      '<h2 class="shop__title" id="shopTitle">🔥 무료 5회를 다 쓰셨어요</h2>' +
      '<p class="shop__sub">오늘의 액운은 <b>올인원</b>에서 <b>매일 한 번씩, 날마다</b> 계속 태울 수 있어요. 1년 달력 전체에 매일 1회 액운 태우기까지 <b>' + ALLINONE_PRICE + '</b>이에요.</p>' +
      (pass
        ? '<div class="shop__save"><b>이미 1년 패스(14,900원)를 이용 중이세요</b>' +
          '<span>차액 ' + BURN_UPGRADE_PRICE + '만 더 내면 올인원 코드로 바로 바꿔 드려요</span></div>' +
          priceHTML('올인원 업그레이드', BURN_UPGRADE_PRICE) +
          payActionsHTML('up-allinone') +
          kakaoOrderHTML('up-allinone', '💬 결제 완료 · 카톡으로 올인원 코드 받기') +
          '<p class="shop__note">카드로 결제하셨으면 노란 버튼으로 카톡에 알려 주세요. 차액을 확인한 뒤 올인원 입장 코드를 보내 드려요.</p>'
        : '<ul class="shop__list">' +
          '<li><b>1년 패스 전부</b><span>타이밍 맵 · 1년 수호 부적 · 액운 태우기 5회</span></li>' +
          '<li><b>매일 일진 부적 — 전부</b><span>특별한 날·경고등 켜진 날마다 나오는 캐릭터 부적 스티커를 하나도 빼놓지 않고</span></li>' +
          '<li><b>🔥 매일 1회 액운 태우기</b><span>매일 한 번 — 구워서 재로 날려 버리기</span></li>' +
          '</ul>' +
          '<div class="shop__save"><b>처음부터 올인원으로 시작하시면 업그레이드 대비 2,900원 더 유리해요</b>' +
          '<span>1년 패스 14,900원 + 업그레이드 7,900원 = 22,800원 → 올인원 ' + ALLINONE_PRICE + '</span></div>' +
          priceHTML('2027 올인원', ALLINONE_PRICE) +
          payActionsHTML('allinone') +
          kakaoOrderHTML('allinone', '💬 결제 완료 · 카톡으로 입장 코드 받기')) +
      '<p class="burn__foot">' + esc(burnLeftText()) + ' · 다음에 또 태우고 싶어지면 언제든 다시 오세요.</p>';
  }

  /** 1년 패스 사용자의 차액 업그레이드 — 신청 내용을 복사하고 카톡 채널로 */
  function goBurnUpgrade() {
    var parts = ['[윤이세 2027 캘린더 신청] 올인원 업그레이드 (1년 패스 → 올인원) 추가 ' + BURN_UPGRADE_PRICE];
    var b = ownerMatchLine();
    if (b) parts.push(b);
    copyText(parts.join(' / '), function (copied) {
      toast(copied === true
        ? '✅ 업그레이드 신청 내용을 복사했어요 — 카톡에 붙여 보내 주세요'
        : '카톡 채널로 이동해요 — 올인원 업그레이드(' + BURN_UPGRADE_PRICE + ')라고 알려 주세요');
    });
    vibrate(18);
    openNoRef(KAKAO);
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
  /* 싱잉볼 한 음 — 부드러운 어택(0.06~0.16s) 뒤 6초 가까이 잦아드는 곡선 (2026-11-22)
     · 지수 램프 하나로는 꼬리가 금방 죽어 '짧은 소리'가 되고, 선형 램프는 종의 울림 같지 않다.
     · setValueCurveAtTime 으로 몸통(τ) + 긴 잔향(τ×2.6) 두 단계 감쇠를 직접 그린다.
     · 마지막 0.3s 는 0 으로 마감 — 끊긴 소리 없이 사라진다. */
  function bowlTone(ctx, f, o) {
    o = o || {};
    var t0 = ctx.currentTime + (o.at || 0);
    var dur = o.dur || 6;
    var atk = o.attack == null ? 0.12 : o.attack;
    var peak = o.gain == null ? 0.12 : o.gain;
    var tau = o.tau || 1.9;
    var osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(f, t0);
    if (o.bend) osc.frequency.exponentialRampToValueAtTime(o.bend, t0 + dur);
    var N = 200, curve = new Float32Array(N);
    for (var i = 0; i < N; i++) {
      var t = (i / (N - 1)) * dur;
      var rise = t < atk ? Math.sin((t / atk) * Math.PI / 2) : 1;
      var tail = 0.78 * Math.exp(-t / tau) + 0.22 * Math.exp(-t / (tau * 2.6));
      var close = t > dur - 0.3 ? Math.max(0, (dur - t) / 0.3) : 1;
      curve[i] = peak * rise * tail * close;
    }
    g.gain.setValueCurveAtTime(curve, t0, dur);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
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

  /* ── 2026-11-22 · 화면 전환·버튼 클릭의 효과음은 걷어 냈다 ──────────────────
     소리는 **의식**에만 남긴다: 대표 수호부적 톡(sfxBless) · 긴급 개운템 체험
     (대나무 뽑기·오브제 완료·싱잉볼) · 액운 태우기(구기기·불붙이기·정화).
     팝업 열기·날짜 팝업·톡톡톡 두드림·탭 전환은 무음 — 진동으로만 조용히 알린다. */
  function sfxOpen() { }                     // 팝업·화면 전환 — 무음
  function sfxBurnOpen() { }                 // 액운 태우기 팝업 열기 — 무음
  function sfxTap(step) { vibrate([45, 25, 55]); }          // 두드림 — 진동만
  function sfxDone() { vibrate([80, 35, 100, 45, 130]); }   // 3타 완료 — 진동만
  /* 4) 대문 부적 · 확대 부적 톡 — **6초짜리 따뜻한 싱잉볼** (2026-11-22 3차)
     · 2~3초로 끊기던 소리를 걷어 내고, 0.12s 부드러운 어택 뒤 6초까지 잦아드는 공명.
     · C3–G3–C4 열린 화음 + 살짝 어긋난 쌍(0.45Hz 맥놀이)으로 명상 싱잉볼의 미세한 떨림.
     · 종을 친 순간은 낮은 대역 노이즈 '웅—'으로만 받쳐 맑은 '톡'이 튀지 않게. */
  function sfxBless() {
    vibrate([60, 90, 120]);           // 차분하고 묵직하게 — 세 번, 점점 길게
    var ctx = audioCtx(); if (!ctx) return;
    bowlTone(ctx, 130.81, { gain: .15, dur: 6.0, attack: .12, tau: 2.15 });          // 몸통 C3
    bowlTone(ctx, 131.26, { gain: .05, dur: 5.7, attack: .16, tau: 2.0, at: .004 }); // 어긋난 쌍 → 맥놀이
    bowlTone(ctx, 196.00, { gain: .105, dur: 5.9, attack: .11, tau: 2.0 });          // G3 — 따뜻한 5도
    bowlTone(ctx, 196.48, { gain: .032, dur: 5.5, attack: .15, tau: 1.9, at: .006 });
    bowlTone(ctx, 261.63, { gain: .05, dur: 4.9, attack: .09, tau: 1.7 });           // C4 옥타브
    bowlTone(ctx, 392.44, { gain: .016, dur: 3.4, attack: .07, tau: 1.3, at: .03 });  // 3배 배음
    bowlTone(ctx, 588.66, { gain: .009, dur: 2.6, attack: .06, tau: 1.0, at: .05 });  // 5배 — 은은한 금속감
    /* 부드러운 '웅' — 620Hz→170Hz 저역, 어택 0.07s, 짧고 낮게 */
    noise(ctx, { dur: .62, filter: 'lowpass', f0: 620, f1: 170, q: 0.6, gain: .028, attack: .07 });
  }
  /* 노이즈원 — 바스락·불꽃·바람을 만드는 기본 재료 (음원 파일 없음) */
  function noise(ctx, o) {
    var dur = o.dur || 0.2;
    var n = Math.floor(ctx.sampleRate * dur);
    if (n <= 0) return;
    var buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    var src = ctx.createBufferSource(); src.buffer = buf;
    var f = ctx.createBiquadFilter();
    f.type = o.filter || 'bandpass';
    var t0 = ctx.currentTime + (o.at || 0);
    f.frequency.setValueAtTime(o.f0 || 1200, t0);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t0 + dur);
    f.Q.value = o.q == null ? 0.9 : o.q;
    var g = ctx.createGain();
    var peak = o.gain == null ? 0.08 : o.gain;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + (o.attack || 0.02));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(ctx.destination);
    src.start(t0); src.stop(t0 + dur + 0.03);
  }

  /* 5) 한지 구기기 — 1.5초 동안 바스락·꾸깃이 여러 겹 이어지는 종이 구김 소리
     · 2~45ms 짜리 아주 짧은 알갱이 수십 개를 불규칙하게 흩뿌려 종이 섬유가
       꺾이는 질감을 만들고, 저역의 '꾹'과 넓은 대역의 바스락 깔개를 겹친다.
     · 알갱이는 앞쪽에 촘촘히, 뒤로 갈수록 성기게 — 손에서 종이가 뭉쳐 가는 결.
     · 🔊 토글이 꺼져 있으면 audioCtx() 가 null 이라 아무 소리도 나지 않는다. */
  function sfxCrumple() {
    var ctx = audioCtx(); if (!ctx) return;
    var DUR = 1.5;
    var t = ctx.currentTime;

    /* 여러 알갱이가 겹쳐도 찢어지지 않게 살짝 눌러 주는 버스 */
    var bus = ctx.createDynamicsCompressor();
    bus.threshold.value = -20; bus.knee.value = 22; bus.ratio.value = 3.5;
    bus.attack.value = 0.002; bus.release.value = 0.14;
    bus.connect(ctx.destination);

    /* 손에 힘이 들어가는 몸통 — 낮게 깔리는 '꾹' */
    tone(ctx, { from: 132, to: 52, dur: 0.5, glide: 0.36, type: 'sine', gain: 0.19, attack: 0.008 });
    tone(ctx, { from: 78, to: 42, dur: 0.72, glide: 0.46, type: 'triangle', gain: 0.085, attack: 0.02 });

    /* 종이 전체가 흔들리는 바스락 깔개 */
    function bed(o) {
      var n = Math.floor(ctx.sampleRate * o.dur);
      if (n <= 0) return;
      var buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      var src = ctx.createBufferSource(); src.buffer = buf;
      var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = o.q;
      var t0 = t + o.at;
      bp.frequency.setValueAtTime(o.f0, t0);
      bp.frequency.linearRampToValueAtTime(o.f1, t0 + o.dur);
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(o.gain, t0 + 0.12);
      g.gain.setValueAtTime(o.gain, t0 + o.dur * 0.42);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
      src.connect(bp); bp.connect(g); g.connect(bus);
      src.start(t0); src.stop(t0 + o.dur + 0.02);
    }
    bed({ at: 0.02, dur: 1.46, f0: 1100, f1: 2600, q: 0.6, gain: 0.042 });
    bed({ at: 0.14, dur: 1.30, f0: 3400, f1: 1800, q: 0.45, gain: 0.026 });

    /* 꾸깃꾸깃 — 종이가 접히는 순간마다 터지는 짧은 알갱이 */
    function grain(at, dur, freq, q, gain) {
      var n = Math.max(2, Math.floor(ctx.sampleRate * dur));
      var buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6);
      var src = ctx.createBufferSource(); src.buffer = buf;
      var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
      var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 620;
      var g = ctx.createGain();
      var t0 = t + at;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(0.006, dur * 0.4));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(bp); bp.connect(hp); hp.connect(g); g.connect(bus);
      src.start(t0); src.stop(t0 + dur + 0.01);
    }

    /* 세 덩어리로 몰아 준다 — 앞은 촘촘하게, 뒤로 갈수록 성기게 */
    [
      { start: 0.05, span: 0.44, n: 16, pow: 1.0, lo: 0.010, hi: 0.038, gLo: 0.034, gHi: 0.082 },
      { start: 0.52, span: 0.40, n: 14, pow: 0.9, lo: 0.008, hi: 0.030, gLo: 0.026, gHi: 0.068 },
      { start: 1.02, span: 0.40, n: 9, pow: 1.2, lo: 0.006, hi: 0.022, gLo: 0.016, gHi: 0.042 }
    ].forEach(function (f) {
      for (var i = 0; i < f.n; i++) {
        var p = Math.pow(Math.random(), f.pow);
        grain(f.start + p * f.span,
          f.lo + Math.random() * (f.hi - f.lo),
          1200 + Math.random() * 4600,
          0.7 + Math.random() * 1.8,
          f.gLo + Math.random() * (f.gHi - f.gLo));
      }
    });

    /* 큰 접힘 — 낮게 '뽀득' 하고 꺾이는 순간 */
    [[0.20, 0.075], [0.66, 0.065], [1.16, 0.05]].forEach(function (f) {
      grain(f[0], f[1], 700 + Math.random() * 500, 0.8, 0.072);
      grain(f[0] + 0.004, f[1] * 0.7, 2400 + Math.random() * 900, 1.1, 0.046);
    });
  }

  /* 6) 불을 붙이는 순간 — 낮고 깊은 범종 한 번(68Hz)과 잔잔한 모닥불.
     북 세 번·높은 징·밝은 차임은 걷어 냈습니다. 경건한 의식의 소리만. */
  function sfxIgnite() {
    vibrate([280]);
    var ctx = audioCtx(); if (!ctx) return;
    /* 범종 — 68Hz 기음에서 내려가는 배음만. 서로 다른 길이로 잦아들며 긴 여운을 만든다 */
    [
      { f: 34, dur: 7.2, gain: 0.12 },
      { f: 68, dur: 7.6, gain: 0.32 },
      { f: 102, dur: 6.2, gain: 0.14 },
      { f: 136, dur: 4.8, gain: 0.07 },
      { f: 204, dur: 3.0, gain: 0.028 }
    ].forEach(function (b) {
      tone(ctx, { from: b.f, to: b.f * 0.997, dur: b.dur, type: 'sine', gain: b.gain, attack: 0.025 });
    });
    /* 모닥불 — 로우패스로 부드럽게 깔리는 숨결. 터지는 소리 없이 천천히 오르내린다 */
    noise(ctx, { filter: 'lowpass', f0: 420, f1: 210, q: 0.5, dur: 7.6, at: 0.15, gain: 0.1, attack: 1.2 });
    noise(ctx, { filter: 'lowpass', f0: 300, f1: 170, q: 0.6, dur: 4.6, at: 1.8, gain: 0.062, attack: 1.5 });
    noise(ctx, { filter: 'lowpass', f0: 260, f1: 150, q: 0.6, dur: 3.6, at: 4.6, gain: 0.05, attack: 1.3 });
  }

  /* 7) 다 탄 뒤 — 낮게 깔리는 정화음. 밝은 차임 없이 조용하게 (오행마타 음높이만 다르게) */
  function sfxPurify(el) {
    var ctx = audioCtx(); if (!ctx) return;
    var base = { 목: 261.63, 화: 293.66, 토: 246.94, 금: 329.63, 수: 220 }[el] || 261.63;
    tone(ctx, { from: base / 2, to: base / 2, dur: 4.4, type: 'sine', gain: 0.07, attack: 0.3 });
    tone(ctx, { from: base, to: base, dur: 3.6, type: 'sine', gain: 0.085, attack: 0.16 });
    tone(ctx, { from: base * 1.5, to: base * 1.5, dur: 2.6, type: 'sine', gain: 0.04, attack: 0.24, at: 0.12 });
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

  /* ── ⚡ 긴급 개운템 바로가기의 자리 (2026-11-22) ──────────────────
     달력 바로 아래 첫 자리를 누가 차지하느냐는 결제 여부로 갈린다.
       · 결제로 열린 기기 : #careJump 가 달력 바로 아래 첫 자리.
         '성찰 에디션 적용됨' 박스(#lockBtn)와 010-****-7373 안내(#codeBindNote)는
         cal__note 아래로 내려 '내 성찰 기록 보기' 바로 위에 둔다.
       · 미결제·잠금     : 🔑 입장 코드 입력(#lockBtn)이 먼저 눈에 들어와야 하므로
         #careJump 는 그 바로 아래("이 캘린더 보는 법" 위).
     DOM 노드를 옮겨도 각 버튼에 걸린 클릭 리스너는 노드를 따라 그대로 살아 있다. */
  function arrangeCareJump() {
    var care = $('#careJump'), lockBtn = $('#lockBtn');
    if (!care || !lockBtn) return;
    var parent = care.parentNode;
    if (!parent || lockBtn.parentNode !== parent) return;
    var panel = $('#lockPanel'), tie = $('#codeBindNote');
    var note = $('#calNote');

    if (state.unlocked) {
      /* 1) 바로가기를 달력 바로 아래로 — 모아보기 목록(#calFocus)이 열려 있으면 그 아래 */
      var anchor = $('#calFocus');
      if (!anchor || anchor.parentNode !== parent) anchor = $('#calGrid');
      if (anchor && anchor.parentNode === parent && anchor.nextSibling !== care) {
        parent.insertBefore(care, anchor.nextSibling);
      }
      /* 2) '적용됨' 박스·번호 안내는 cal__note 아래로 (내 성찰 기록 보기 위) */
      if (note && note.parentNode === parent) {
        var ref = note;
        [lockBtn, panel, tie].forEach(function (el) {
          if (!el || el.parentNode !== parent) return;
          parent.insertBefore(el, ref.nextSibling);
          ref = el;
        });
      }
    } else {
      /* 미결제 — 🔑 입장 코드 입력 맨 위, 그 바로 아래에 바로가기, 그 아래에 입력칸 */
      parent.insertBefore(lockBtn, care);
      var after = care;
      [panel, tie].forEach(function (el) {
        if (!el || el.parentNode !== parent) return;
        parent.insertBefore(el, after.nextSibling);
        after = el;
      });
    }
  }

  /* ── 입장 코드 UI (달력 카드의 🔑 입장 코드 입력) ─────────────────
     코드가 맞으면 localStorage 에 저장 — 새로고침해도 그 기기에서는 계속 열린다. */
  function syncLockUI() {
    var btn = $('#lockBtn'), msg = $('#lockMsg'), reset = $('#lockReset');
    if (btn) {
      /* 큰 버튼(2026-11-21) — 열려 있으면 금빛에서 차분한 초록으로, 문구는 두 줄(제목·설명)로 나뉜다 */
      var tierLabel = TIER_NAME[state.tier] || '입장 코드';
      var tEl = $('#lockBtnT'), sEl = $('#lockBtnS'), icEl = $('#lockBtnIc');
      if (tEl) tEl.textContent = state.unlocked ? tierLabel + ' 적용됨' : '입장 코드 입력';
      if (sEl) sEl.textContent = state.unlocked
        ? '이 기기에서 달력 전체가 열려 있어요 · 눌러서 확인'
        : '카톡으로 받은 6자리 코드로 열어요';
      if (icEl) icEl.textContent = state.unlocked ? '🔓' : '🔑';
      /* 이미 코드가 열려 있어도 — 다른 상품 코드를 넣으면 그 상품으로 바뀌는 걸 알려 준다 */
      var swapEl = $('#lockSwap');
      if (swapEl) swapEl.hidden = !state.unlocked;
      btn.classList.toggle('is-on', !!state.unlocked);
      btn.setAttribute('aria-pressed', state.unlocked ? 'true' : 'false');
      btn.setAttribute('aria-label', state.unlocked
        ? tierLabel + ' 적용됨 — 이 사주 전체 열림 (눌러서 확인·해제)'
        : '입장 코드 입력 — 결제하신 번호와 카톡으로 받은 6자리 코드로 열기');
    }
    // 지금 이 기기에 적용된 티어를 패널 안에 그대로 보여 준다
    var tierEl = $('#lockTier');
    if (tierEl) {
      if (state.tier && state.unlocked) {
        tierEl.hidden = false;
        tierEl.innerHTML = '지금 적용된 티어 · <b>' + esc(TIER_NAME[state.tier]) + '</b>' +
          (state.tier === 'diary' ? ' — 이 사주 달력 전체 + 성찰 다이어리 + 매일 1회 액운 태우기'
            : (state.tier === 'allinone' ? ' — 이 사주 달력 전체 + 매일 1회 액운 태우기' : ' — 이 사주 달력 전체'));
        tierEl.classList.toggle('is-allinone', state.tier === 'allinone' || state.tier === 'diary');
      } else if (state.tier && state.mismatch) {
        tierEl.hidden = false;
        tierEl.innerHTML = '저장된 코드 · <b>' + esc(TIER_NAME[state.tier]) + '</b> (' + esc(codeOwnerLabel(state.mismatch.code)) +
          ') — 지금 사주와 달라 <b>잠겨 있어요</b>.';
        tierEl.classList.remove('is-allinone');
      } else {
        tierEl.hidden = true;
        tierEl.textContent = '';
        tierEl.classList.remove('is-allinone');
      }
    }

    /* 🔒 전용 배지 — 코드로 열린 사주를 상단에 고정 표시하고, '수정' 버튼을 잠근다 (#9247)
       · 예전 사주 기반 코드: 그 사주 1명에게 묶여 있어 사주를 바꿀 수 없다(수정 잠금).
       · 지금의 번호 기반 코드: 이 기기에 열린 것이라 사주는 그대로 바꿔 쓸 수 있다. */
    var id = currentIdentity();
    var sajuBound = !!(state.unlocked && state.code && !state.code.phone && state.code.ymd);
    var badge = $('#savedBarLock');
    if (badge) {
      var btxt = '';
      if (state.unlocked) {
        btxt = '🔒 ' + (sajuBound && id ? id.label
          : (state.code && state.code.phone ? maskPhone(state.code.phone) + ' 번호' : '입장 코드')) + ' 전용';
      }
      badge.hidden = !btxt;
      badge.textContent = btxt;
    }
    var ebtn = $('#editBtn');
    if (ebtn) {
      ebtn.classList.toggle('is-locked', sajuBound);
      ebtn.textContent = sajuBound ? '🔒 전용' : '수정';
      ebtn.setAttribute('aria-label', sajuBound
        ? '이 사주 전용으로 잠겨 있어 생년월일·성별을 바꿀 수 없어요'
        : '내 사주 수정');
    }

    /* 코드로 열렸거나, 다른 사주로 코드를 넣었을 때의 안내 한 줄 */
    var bindNote = $('#codeBindNote');
    if (bindNote) {
      if (state.mismatch) {
        bindNote.hidden = false;
        bindNote.innerHTML = (state.mismatch.code && state.mismatch.code.code ? '🔒 이 코드는 <b>' : '🔒 이 기기에 저장된 이용권은 <b>') +
          esc(codeOwnerLabel(state.mismatch.code)) + '</b> 사주 전용이에요.' +
          (state.mismatch.id
            ? ' 지금 넣으신 사주(<b>' + esc(state.mismatch.id.label) + '</b>)로는 열리지 않아 ' +
              (trialOver() ? '<b>지금은 잠겨 있어요</b>.' : '<b>' + FREE_DAYS + '일 무료 체험</b>으로 보여 드려요.')
            : ' 코드 주인의 사주를 넣어야 열려요.');
      } else if (state.unlocked) {
        bindNote.hidden = false;
        bindNote.innerHTML = sajuBound && id
          ? '🔒 <b>' + esc(id.label) + '</b> 사주 1명 전용으로 열렸어요. 생년월일·성별을 바꿔 다른 사주를 보는 건 열리지 않아요.'
          : '🔒 <b>' + esc(state.code && state.code.phone ? maskPhone(state.code.phone) : '입장 코드') +
            '</b> 번호로 확인된 입장 코드예요 — 이 기기에서 달력 전체가 열려 있어요.';
      } else {
        bindNote.hidden = true;
        bindNote.textContent = '';
      }
    }
    if (reset) reset.hidden = !state.unlocked;
    if (msg && state.unlocked && !msg.textContent) msg.textContent = '이 기기에서는 이미 열려 있어요.';
    renderCtaSteps();      // 결제가 끝난 상품은 맨 아래 카드에서 '적용 중'으로 (M2)
    renderChemiBanner();   // 케미·초대 배너 문구도 결제자/미결제자로 갈린다 (2026-11-22)
    syncTrialState();      // 무료 체험 중 / 체험 종료 / 전체 오픈 — index.html 문구 전환
    arrangeCareJump();     // ⚡ 긴급 개운템 바로가기 자리 — 결제 전엔 코드 입력 바로 아래, 결제 후엔 달력 바로 아래 (2026-11-22)
  }
  /** 숫자 → '010-1234-5678' — 입력칸에서 부드럽게 끊어 보여 준다 */
  function phoneDisplay(v) {
    var d = String(v || '').replace(/\D/g, '').slice(0, 11);
    if (d.length < 4) return d;
    if (d.length < 8) return d.slice(0, 3) + '-' + d.slice(3);
    if (d.length < 11) return d.slice(0, 3) + '-' + d.slice(3, d.length - 4) + '-' + d.slice(-4);
    return d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7);
  }
  /** 🔑 입장 코드 칸의 번호 — 결제하며 적어 둔 번호(또는 지금 열린 코드의 번호)를 미리 채운다 */
  function fillLockPhone() {
    var inp = $('#lockPhone');
    if (!inp) return;
    var d = mobileOf(inp.value) || (state.code && state.code.phone) || rememberedPhone();
    if (!d) return;
    inp.value = phoneDisplay(d);
  }
  function openLockPanel() {
    var p = $('#lockPanel'), btn = $('#lockBtn');
    if (!p) return;
    p.hidden = false;
    if (btn) btn.setAttribute('aria-expanded', 'true');
    syncLockUI();
    fillLockPhone();       // 결제할 때 넣은 번호를 손님이 다시 찾지 않아도 되게
    try { p.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
    /* 열자마자 칸으로 — 번호가 비어 있으면 번호칸, 이미 채워져 있으면 코드칸 */
    var ph = $('#lockPhone'), inp = $('#lockCode');
    var target = (ph && !mobileOf(ph.value)) ? ph : inp;
    if (!target) return;
    var focusIt = function () {
      if (document.activeElement === target) return;
      try { target.focus({ preventScroll: true }); } catch (e) { try { target.focus(); } catch (e2) {} }
    };
    focusIt();
    /* 팝업을 닫은 직후엔 브라우저가 포커스를 되돌리므로 한 번 더 — 손님이 이미 다른 칸을 만졌으면 그대로 둔다 */
    setTimeout(focusIt, 240);
  }
  function closeLockPanel() {
    var p = $('#lockPanel'), btn = $('#lockBtn');
    if (!p || p.hidden) return;
    p.hidden = true;
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }
  /** 코드 주인과 다른 사주 — 열어 주지 않고 안내만 (지금 사주에 맞는 코드가 이미 있으면 그건 그대로 둔다)
     ※ 지금은 번호 기반 코드라 이 길로 오는 건 예전 사주 기반 코드뿐이다. */
  function cannotUseCode(code) {
    var stillOpen = syncCodeBinding();
    var id = currentIdentity();
    var msg = $('#lockMsg');
    if (msg) {
      msg.textContent = '이 코드는 ' + codeOwnerLabel(code) + ' 사주 전용이에요.' +
        (id ? ' 지금 넣으신 사주(' + id.label + ')로는 열리지 않아요.' : ' 코드 주인의 사주를 넣어야 열려요.') +
        (stillOpen ? '' : (trialOver() ? ' 무료 체험도 끝나 지금은 잠겨 있어요.' : ' 지금은 ' + FREE_DAYS + '일 무료 체험으로만 열려 있어요.'));
      msg.classList.remove('is-ok');
    }
    var panel = $('#lockPanel');
    if (panel) { panel.classList.remove('is-shake'); void panel.offsetWidth; panel.classList.add('is-shake'); }
    vibrate([40, 30, 60]);
    syncLockUI();
    renderCalendar();
    renderYearSummary();
    renderBurnCard();
  }
  function tryUnlock() {
    var inp = $('#lockCode'), msg = $('#lockMsg'), panel = $('#lockPanel');
    var v = inp ? inp.value : '';
    /* 이미 열려 있는 기기에서 빈 칸으로 '열기'만 누른 경우 — 빈칸 오류가 아니라 상태를 알려 준다 */
    if (!String(v || '').trim() && state.unlocked) {
      if (msg) {
        msg.innerHTML = '이 기기에서는 이미 <b>' + esc(TIER_NAME[state.tier] || '입장 코드') +
          '</b> 코드가 열려 있어요 — 다른 상품 코드를 넣으면 그 상품으로 바뀝니다.';
        msg.classList.add('is-ok');
      }
      return;
    }
    var phoneInp = $('#lockPhone');
    var phone = mobileOf(phoneInp ? phoneInp.value : '');
    var id = currentIdentity();
    /* 6자리 코드는 [결제하신 휴대폰 번호 + 상품] 서명 — 번호와 코드가 맞으면 바로 열린다.
       (예전 사주 기반 6자리·18자리 코드도 계속 열린다) */
    var p = parseCode(v, { phone: phone, ymd: id && id.ymd, gender: id && id.gender });
    if (p.status !== 'ok') {
      if (msg) { msg.textContent = codeErrorText(p); msg.classList.remove('is-ok'); }
      if (panel) { panel.classList.remove('is-shake'); void panel.offsetWidth; panel.classList.add('is-shake'); }
      vibrate([40, 30, 60]);
      if (inp) { try { inp.focus(); inp.select(); } catch (e) {} }
      return;
    }
    /* 예전 사주 기반 코드 — 코드에 적힌 생년월일·성별이 지금 사주와 다르면 열지 않고 그대로 잠가 둔다 */
    if (!p.phone && p.ymd && (!id || id.ymd !== p.ymd || id.gender !== p.gender)) {
      cannotUseCode(p);
      return;
    }
    saveUnlock({ code: p.code, tier: p.tier, phone: p.phone || '', ymd: p.ymd || '', gender: p.gender || '' });
    syncPaidTier(p.tier);          // 로그인한 회원이면 DB 등급도 같이 (실패는 조용히 무시)
    if (p.phone) rememberPhone(p.phone);
    state.mismatch = null;
    var who = unlockTargetLabel(p);
    if (msg) {
      msg.textContent = p.tier === 'diary'
        ? '🔓 성찰 에디션 확인됐어요 — ' + who + '로 달력 전체 + 365일 성찰 다이어리까지 열렸습니다.'
        : (p.tier === 'allinone'
          ? '🔓 올인원 확인됐어요 — ' + who + '로 달력 전체 + 매일 1회 액운 태우기가 열렸습니다.'
          : '🔓 1년 패스 확인됐어요 — ' + who + '로 2026년 11월부터 2027년 12월까지 열렸습니다.');
      msg.classList.add('is-ok');
    }
    if (inp) inp.value = '';
    syncLockUI();
    render();
    toast(p.tier === 'diary'
      ? '🔓 성찰 에디션 — ' + who + '로 다이어리까지 열렸어요'
      : (p.tier === 'allinone'
        ? '🔓 올인원 — ' + who + '로 달력 전체 + 매일 1회 액운 태우기'
        : '🔓 1년 패스 확인 — ' + who + '로 전체 날짜가 열렸어요'));
    sfxOpen();
    /* 열렸으면 잠시 뒤 패널을 접어 달력이 드러나게 — 배지는 초록으로 남는다 */
    setTimeout(function () {
      if (!state.unlocked) return;
      var nowPanel = $('#lockPanel');
      if (nowPanel && !nowPanel.hidden) closeLockPanel();
    }, 1500);
  }
  function lockAgain() {
    saveUnlock(null);
    state.mismatch = null;
    syncLockUI();
    render();
    var msg = $('#lockMsg');
    if (msg) { msg.textContent = '다시 잠갔어요. 코드를 넣으면 또 열립니다.'; msg.classList.remove('is-ok'); }
    toast('다시 잠갔어요 — 입장 코드를 넣으면 또 열립니다');
  }

  /* ── 시작 ──────────────────────────────────────────── */
  function boot() {
    // index.html 의 무료 체험 문구(js-trial) / 전체 오픈 문구(js-open) / 체험 종료 문구(js-trial-over)를 스위치에 맞춰 보인다
    syncTrialState();
    syncInviteCopy();      // 친구 초대 링크(?ref=)로 온 손님 — '3일' 문구를 5일로, 웰컴 팝업에 보너스 한 줄 (2026-11-21)
    var now = new Date();
    state.todayISO = T.isoOf(now.getFullYear(), now.getMonth() + 1, now.getDate());
    state.terms = T.buildTerms(TERMS_FROM, RANGE_TO);
    loadStamps();
    loadUnlock();
    loadDiary();
    syncLockUI();
    if (state.unlocked) syncPaidTier(state.tier);   // 이미 열린 기기 — 로그인한 회원이면 등급만 맞춰 둔다 (조용히)
    state.view = clampView(now.getFullYear(), now.getMonth() + 1);
    initForm();

    modalEl = $('#dayModal');
    modalBody = $('#modalBody');
    modalDialog = $('#modalDialog');
    // 내용이 안에서 스크롤될 때만 머리(날짜) 아래에 옅은 그림자를 준다 (2026-11-21)
    modalBody.addEventListener('scroll', function () {
      modalDialog.classList.toggle('is-lock-scrolled', modalBody.scrollTop > 2);
    }, { passive: true });
    talisEl = $('#talisModal');
    talisBody = $('#talisBody');
    talisDialog = $('#talisDialog');
    shopEl = $('#shopModal');
    shopBody = $('#shopBody');
    shopDialog = $('#shopDialog');
    burnEl = $('#burnModal');
    burnBody = $('#burnBody');
    burnDialog = $('#burnDialog');
    dbookEl = $('#diaryBookModal');
    dbookBody = $('#diaryBookBody');
    dbookDialog = $('#diaryBookDialog');
    guideEl = $('#guideModal');
    guideDialog = $('#guideDialog');
    welcomeEl = $('#welcomeModal');
    welcomeDialog = $('#welcomeDialog');

    loadBurn();
    renderBurnCard();
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

    // 입장 코드 — 🔑 버튼으로 열고, 코드를 넣으면 이 기기에서 전체 날짜가 열린다
    var lockBtn = $('#lockBtn');
    if (lockBtn) lockBtn.addEventListener('click', function () {
      var p = $('#lockPanel');
      if (p && !p.hidden) { closeLockPanel(); return; }
      openLockPanel();
    });
    var lockGo = $('#lockGo');
    if (lockGo) lockGo.addEventListener('click', function (e) { e.preventDefault(); tryUnlock(); });
    // 달력 위 '무료 3일 체험이 끝났어요' 줄 — 누르면 코드 입력 패널을 바로 연다
    var trialStrip = $('#calTrialOver');
    if (trialStrip) trialStrip.addEventListener('click', function (e) { e.preventDefault(); openLockPanel(); });
    var lockInput = $('#lockCode');
    if (lockInput) lockInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); tryUnlock(); }
    });
    /* 🔑 입장 코드 — 휴대폰 번호 + 6자리. 둘 다 차면 '열기'를 누르지 않아도 바로 열린다. */
    var lockPhoneInput = $('#lockPhone');
    if (lockPhoneInput) {
      lockPhoneInput.addEventListener('input', function () {
        var pos = lockPhoneInput.value.length;
        var d = lockPhoneInput.value.replace(/\D/g, '').slice(0, 11);
        lockPhoneInput.value = phoneDisplay(d);
        if (pos <= lockPhoneInput.value.length) { try { lockPhoneInput.setSelectionRange(lockPhoneInput.value.length, lockPhoneInput.value.length); } catch (e) { } }
        if (mobileOf(lockPhoneInput.value) && lockInput && /^[PAD]\d{5}$/i.test(normCode(lockInput.value))) tryUnlock();
      });
      lockPhoneInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); tryUnlock(); }
      });
    }
    if (lockInput) lockInput.addEventListener('input', function () {
      if (mobileOf(lockPhoneInput ? lockPhoneInput.value : '') && /^[PAD]\d{5}$/i.test(normCode(lockInput.value))) tryUnlock();
    });
    var lockReset = $('#lockReset');
    if (lockReset) lockReset.addEventListener('click', function (e) { e.preventDefault(); lockAgain(); });

    // ? 사용법 — 첫 방문 팝업을 닫은 뒤에도 언제든 다시 열기
    var calHelp = $('#calHelp');
    if (calHelp) calHelp.addEventListener('click', function (e) { e.preventDefault(); openGuide(); });
    if (guideEl) {
      guideEl.addEventListener('click', function (e) {
        if (e.target.closest && e.target.closest('[data-guide-close]')) { closeGuide(); }
      });
    }
    // 1차 웰컴 팝업 — '내 사주 입력하기'·✕·배경 어느 쪽이든 닫으면 입력 폼으로
    if (welcomeEl) {
      welcomeEl.addEventListener('click', function (e) {
        if (e.target.closest && e.target.closest('[data-welcome-close]')) { closeWelcome(); }
      });
    }

    // 📖 내 성찰 기록 보기 — 달력 아래 버튼
    var dbookBtn = $('#diaryBookBtn');
    if (dbookBtn) dbookBtn.addEventListener('click', function (e) { e.preventDefault(); openDiaryBook(); });
    if (dbookEl) {
      dbookEl.addEventListener('click', function (e) {
        if (!e.target.closest) return;
        if (e.target.closest('[data-dbook-close]')) { closeDiaryBook(); return; }
        if (e.target.closest('[data-diary-copy]')) {
          copyText(diaryAllText(), function (copied) {
            toast(copied === true ? '📋 성찰 기록 전체를 복사했어요' : '복사가 막혀 있어요 — .txt 내려받기를 써 주세요');
          });
          return;
        }
        if (e.target.closest('[data-diary-dl]')) { downloadDiary(); return; }
        if (e.target.closest('[data-dbook-today]')) {
          // 기록 보기에서 바로 오늘 성찰칸으로 — 보기 팝업을 닫고 오늘 날짜 팝업을 연 뒤 성찰 카드로 내려간다
          closeDiaryBook();
          setTimeout(function () {
            openDayModal(state.todayISO);
            setTimeout(jumpToDiary, 420);
          }, 200);
          return;
        }
        var day = e.target.closest('[data-dbook-day]');
        if (day) {
          var iso = day.getAttribute('data-dbook-day');
          closeDiaryBook();
          setTimeout(function () { openDayModal(iso); }, 200);
        }
      });
    }

    // ✨ 성찰 다이어리 — 기록 남기기 · 고치기 · 지우기 · 글자 수
    if (modalEl) {
      modalEl.addEventListener('input', function (e) {
        if (!e.target || e.target.id !== 'diaryText') return;
        var wrap = e.target.closest('[data-diary]');
        var cnt = wrap ? wrap.querySelector('[data-diary-count]') : null;
        if (cnt) cnt.textContent = String(e.target.value || '').length + '/' + DIARY_MAX;
      });
    }

    // 🧭 4칸 바로가기 — 달력 · 액운 태우기 · 긴급 개운템 (케미·초대는 링크)
    document.addEventListener('click', function (e) {
      if (!e.target.closest) return;
      var jb = e.target.closest('[data-jump]');
      if (!jb) return;
      e.preventDefault();
      jumpToSection(jb.getAttribute('data-jump'));
    });

    // 대표 부적 — 배너 부적 톡 → 오라 번쩍 + 문구 / 크게 보기 버튼·배너 빈곳 → 모달 / 모달 안 부적·버튼 → 오늘 기운 받기
    document.addEventListener('click', function (e) {
      if (!e.target.closest) return;
      var tapPlaque = e.target.closest('[data-talis-tap]');
      if (tapPlaque) { e.preventDefault(); onTalisTap(tapPlaque); return; }
      if (e.target.closest('[data-talis-open]')) { e.preventDefault(); openTalisModal(); return; }
      if (e.target.closest('[data-talis-close]')) { e.preventDefault(); closeTalisModal(); return; }
      if (e.target.closest('[data-talis-bless]')) { e.preventDefault(); onTalisBless(e); }
    });

    // 팝업 안: 부적 두드리기 / X·배경·닫기 버튼
    modalEl.addEventListener('click', function (e) {
      var tap = e.target.closest ? e.target.closest('[data-ritual="tap"]') : null;
      if (tap) { onRitualTap(tap, e); return; }
      if (!e.target.closest) return;
      if (e.target.closest('[data-diary-jump]')) { e.preventDefault(); jumpToDiary(); return; }
      if (e.target.closest('[data-diary-save]')) { e.preventDefault(); saveDiaryFromModal(); return; }
      var editBtn = e.target.closest('[data-diary-edit]');
      if (editBtn) {
        e.preventDefault();
        var wrapE = editBtn.closest('[data-diary]');
        var isoE = wrapE ? wrapE.getAttribute('data-diary') : '';
        var recE = isoE ? diaryOf(isoE) : null;
        if (recE) paintDiary(isoE, recE.text || '');
        return;
      }
      if (e.target.closest('[data-diary-del]')) { e.preventDefault(); deleteDiaryFromModal(); return; }
      if (e.target.closest('[data-modal-close]')) closeDayModal();
    });

    // 구입 팝업 — 맨 아래 카드 3개 버튼과 잠금 카드의 입장 코드 버튼
    document.addEventListener('click', function (e) {
      if (!e.target.closest) return;
      var lc = e.target.closest('[data-lock-open]');
      if (lc) {
        e.preventDefault();
        /* 어느 팝업에서 눌렀든 — 달력 아래 그 '하나의 입력창'으로 (2026-11-21)
           날짜 팝업·상품 팝업·액운 태우기 팝업 어디서든 같은 곳으로 열린다. */
        var closed = false;
        if (modalEl && !modalEl.hidden) { closeDayModal(); closed = true; }
        if (shopEl && !shopEl.hidden) { closeShop(); closed = true; }
        if (burnEl && !burnEl.hidden) { closeBurnModal(); closed = true; }
        if (talisEl && !talisEl.hidden) { closeTalisModal(); closed = true; }
        if (closed) setTimeout(openLockPanel, 210);
        else openLockPanel();
        return;
      }
      var b = e.target.closest('[data-shop]');
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
        var sw = e.target.closest ? e.target.closest('[data-shop-switch]') : null;
        if (sw) { e.preventDefault(); switchShop(sw.getAttribute('data-shop-switch')); return; }
        var gb = e.target.closest ? e.target.closest('[data-cf-gender]') : null;
        if (gb) { e.preventDefault(); setConsultGender(gb.getAttribute('data-cf-gender')); return; }
        var cb = e.target.closest ? e.target.closest('[data-cf-cal]') : null;
        if (cb) { e.preventDefault(); setConsultCal(cb.getAttribute('data-cf-cal')); return; }
        var ct = e.target.closest ? e.target.closest('[data-consult-tier]') : null;
        if (ct) { e.preventDefault(); switchConsultTier(ct.getAttribute('data-consult-tier')); return; }
        var ko = e.target.closest ? e.target.closest('[data-kakao-order]') : null;
        if (ko) { e.preventDefault(); goKakaoOrder(ko.getAttribute('data-kakao-order')); return; }
        var pay = e.target.closest ? e.target.closest('[data-pay]') : null;
        if (pay) {
          /* 카드 버튼이 진짜 링크면(#8847) 기본 이동을 막지 않는다 — 브라우저가 직접 새 장을 열어
             인앱 브라우저의 팝업차단을 피한다. 스크립트로 여는 길은 링크가 없을 때만 남는다. */
          if (pay.getAttribute('data-pay-link')) {
            var pitem = pay.getAttribute('data-item');
            payChoice[String(pitem)] = 'card';
            /* 번호를 적었으면 링크 이동을 가로채 페이앱 JS 로 직행 — 연락처 화면을 건너뛴다 */
            var phone = mobileOf(payPhoneVal());
            if (phone) {
              var went = false;
              try { went = payappGo(pitem, phone); } catch (err) { went = false; }
              if (went) {
                e.preventDefault();
                cardNote(pay.getAttribute('href'), { direct: true, phone: true });
                return;
              }
            }
            cardNote(pay.getAttribute('href'), { phone: !!phone });
            payWaitSave(pitem, phone);      /* 돌아왔을 때 '결제하고 돌아오셨나요?' 배너를 위해 */
            payLinkGuard(pay.getAttribute('href'));
            return;
          }
          e.preventDefault(); handlePay(pay.getAttribute('data-pay'), pay.getAttribute('data-item')); return;
        }
        var pick = e.target.closest ? e.target.closest('[data-careitem]') : null;
        if (pick) { e.preventDefault(); setCareItem(pick.getAttribute('data-careitem')); return; }
        var up = e.target.closest ? e.target.closest('[data-burn-upgrade]') : null;
        if (up) { e.preventDefault(); goBurnUpgrade(); return; }
        var tu = e.target.closest ? e.target.closest('[data-tier-upgrade]') : null;
        if (tu) { e.preventDefault(); goTierUpgrade(tu.getAttribute('data-tier-upgrade')); return; }
        var bo = e.target.closest ? e.target.closest('[data-burn-open]') : null;
        if (bo) { e.preventDefault(); closeShop(); setTimeout(openBurnModal, 210); return; }
        var c = e.target.closest ? e.target.closest('[data-care]') : null;
        if (c) { e.preventDefault(); handleCare(c.getAttribute('data-care'), c, e); }
      });
      /* 신청 양식 입력 — 팝업을 다시 그려도 값이 남게 메모리에 담고, 안내 문구를 지진다 */
      shopEl.addEventListener('input', function (e) {
        var ph = e.target.closest ? e.target.closest('[data-pay-phone]') : null;
        if (ph) { payPhone = ph.value; mirrorPayPhone(); return; }   // 결제용 번호 — 화면 메모리에만 둔다
        var inp = e.target.closest ? e.target.closest('[data-cf]') : null;
        if (!inp) return;
        var k = inp.getAttribute('data-cf');
        var f = consultFormState();
        if (k === 'name' || k === 'birth' || k === 'who' || k === 'q') f[k] = inp.value;
        var row = inp.closest ? inp.closest('.cform__row') : null;
        if (row) row.classList.remove('is-error');
        clearConsultMsg();
      });
    }

    // 🔥 오늘 액운 태우기 — 달력 위 카드·긴급 개운템 팝업 어디서든 같은 리추얼로
    var burnOpen = $('#burnOpen');
    if (burnOpen) burnOpen.addEventListener('click', function (e) { e.preventDefault(); openBurnModal(); });
    if (burnEl) {
      burnEl.addEventListener('click', function (e) {
        if (!e.target.closest) return;
        if (e.target.closest('[data-burn-close]')) { closeBurnModal(); return; }
        var chip = e.target.closest('[data-burn-chip]');
        if (chip) {
          var inp = burnEl.querySelector('#burnInput');
          if (inp) {
            inp.value = chip.getAttribute('data-burn-chip');
            inp.classList.remove('is-shake');
            try { inp.focus({ preventScroll: true }); } catch (er) {}
          }
          sfxTap(1);
          return;
        }
        var b = e.target.closest('[data-burn]');
        if (!b) return;
        var k = b.getAttribute('data-burn');
        if (k === 'start') { e.preventDefault(); burnBeginWrite(); return; }
        if (k === 'upgrade') { e.preventDefault(); closeBurnModal(); setTimeout(function () { openShop('burn'); }, 210); return; }
        if (k === 'write') { e.preventDefault(); burnWrite(); return; }
        if (k === 'crumple') { e.preventDefault(); burnCrumple(); return; }
        if (k === 'ignite') { e.preventDefault(); burnIgnite(); return; }
        if (k === 'again') { e.preventDefault(); burnAgain(); }
      });
      // 한 줄 적고 Enter → 바로 종이로
      burnEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && e.target && e.target.id === 'burnInput') { e.preventDefault(); burnWrite(); }
      });
      // 꾸욱 누르는 동안 종이가 미리 눌린다
      burnEl.addEventListener('pointerdown', function (e) {
        var b = e.target.closest && e.target.closest('[data-burn="crumple"]');
        if (!b) return;
        var paper = burnEl.querySelector('[data-burn-paper]');
        if (paper) paper.classList.add('is-pressing');
      });
      ['pointerup', 'pointercancel'].forEach(function (t) {
        burnEl.addEventListener(t, function () {
          var paper = burnEl.querySelector('[data-burn-paper]');
          if (paper) paper.classList.remove('is-pressing');
        });
      });
    }

    // ESC 닫기 + Tab 포커스가 팝업 밖으로 나가지 않게
    document.addEventListener('keydown', function (e) {
      if (welcomeEl && !welcomeEl.hidden) {
        if (e.key === 'Escape') { e.preventDefault(); closeWelcome(); return; }
        if (e.key !== 'Tab') return;
        var wf = $$('a[href], button:not([disabled])', welcomeDialog).filter(function (el) {
          return el.offsetParent !== null;
        });
        if (!wf.length) return;
        var wFirst = wf[0], wLast = wf[wf.length - 1];
        if (e.shiftKey && (document.activeElement === wFirst || document.activeElement === welcomeDialog)) {
          e.preventDefault(); wLast.focus();
        } else if (!e.shiftKey && document.activeElement === wLast) {
          e.preventDefault(); wFirst.focus();
        }
        return;
      }
      if (guideEl && !guideEl.hidden) {
        if (e.key === 'Escape') { e.preventDefault(); closeGuide(); return; }
        if (e.key !== 'Tab') return;
        var gf = $$('a[href], button:not([disabled])', guideDialog).filter(function (el) {
          return el.offsetParent !== null;
        });
        if (!gf.length) return;
        var gFirst = gf[0], gLast = gf[gf.length - 1];
        if (e.shiftKey && (document.activeElement === gFirst || document.activeElement === guideDialog)) {
          e.preventDefault(); gLast.focus();
        } else if (!e.shiftKey && document.activeElement === gLast) {
          e.preventDefault(); gFirst.focus();
        }
        return;
      }
      if (dbookEl && !dbookEl.hidden) {
        if (e.key === 'Escape') { e.preventDefault(); closeDiaryBook(); return; }
        if (e.key !== 'Tab') return;
        var df = $$('a[href], button:not([disabled])', dbookDialog).filter(function (el) {
          return el.offsetParent !== null;
        });
        if (!df.length) return;
        var dFirst = df[0], dLast = df[df.length - 1];
        if (e.shiftKey && (document.activeElement === dFirst || document.activeElement === dbookDialog)) {
          e.preventDefault(); dLast.focus();
        } else if (!e.shiftKey && document.activeElement === dLast) {
          e.preventDefault(); dFirst.focus();
        }
        return;
      }
      if (talisEl && !talisEl.hidden) {
        if (e.key === 'Escape') { e.preventDefault(); closeTalisModal(); return; }
        if (e.key !== 'Tab') return;
        var tf = $$('a[href], button:not([disabled])', talisDialog).filter(function (el) {
          return el.offsetParent !== null;
        });
        if (!tf.length) return;
        var tFirst = tf[0], tLast = tf[tf.length - 1];
        if (e.shiftKey && (document.activeElement === tFirst || document.activeElement === talisDialog)) {
          e.preventDefault(); tLast.focus();
        } else if (!e.shiftKey && document.activeElement === tLast) {
          e.preventDefault(); tFirst.focus();
        }
        return;
      }
      if (burnEl && !burnEl.hidden) {
        if (e.key === 'Escape') { e.preventDefault(); closeBurnModal(); }
        return;
      }
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
      /* 첫 부적 말풍선이 붙은 칸이면 — 눌렀으니 힌트는 접는다 */
      if (b.classList.contains('day--hint')) state.hintOff = true;
      /* 무료 체험 중에는 잠긴 날도 누르면 안내가 나오도록 그대로 넘긴다 (2026-11-21 QA M3) */
      if (!isOpenDay(iso) && !(FREE_TRIAL_ENABLED && !state.unlocked)) return;
      openDayModal(iso);
    });

    // 모아보기 탭 (2027 한눈에 카드의 달 칩은 눌러도 달력이 움직이지 않는 정적 표시)
    $('#calFilter').addEventListener('click', function (e) {
      var b = e.target.closest('[data-filter]');
      if (!b) return;
      e.preventDefault();
      setFilter(b.getAttribute('data-filter'));
    });
    $('#calFocus').addEventListener('click', function (e) {
      var b = e.target.closest('.fday[data-iso]');
      if (!b) return;
      e.preventDefault();
      openDayModal(b.getAttribute('data-iso'));
    });

    var saved = loadInput();
    var openedFromSaved = false;
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
        syncCodeBinding();     // 저장된 사주가 코드 주인과 같을 때만 계속 열린다
        state.cache = {};
        state.yearDigest = null;
        state.mDigest = {};
        $('#formCard').hidden = true;
        $('#result').hidden = false;
        document.body.classList.add('is-result');
        render();
        openedFromSaved = true;
      } catch (err) {
        document.body.classList.remove('is-result');
        $('#formCard').hidden = false;
      }
    }
    /* 달력이 바로 열린 기기(저장된 사주·오행 앱에서 이어받은 사주) —
       1차 웰컴은 건너뛰고 2차 사용법 팝업만 1회. 웰컴은 앞으로도 뜨지 않게 표시. */
    if (openedFromSaved) {
      markWelcomeSeen();
      maybeAutoGuide();
    } else {
      /* 첫 접속 — 사주를 넣기 전이므로 콤팩트한 1차 웰컴 팝업을 한 번 띄운다 */
      maybeAutoWelcome(60);
    }

    /* 💳 결제하러 다녀온 손님 — 결과 맨 위에 '카톡으로 코드 받기' 한 줄 (2026-11-21)
       페이앱이 returnurl 로 돌려보낸 경우(?paid=1)는 주소를 보고 먼저 표시해 둔다. */
    payReturnCheck();
    var pb = $('#payBack');
    if (pb) {
      pb.addEventListener('click', function (e) {
        if (e.target.closest('#payBackGo')) {
          var it = payBackItem || 'pass';
          payWaitClear();
          pb.hidden = true;
          /* 1:1 상담 — 신청서를 적을 수 있게 결제한 그 상품으로 팝업을 다시 연다 */
          if (/^consult/.test(String(it))) {
            consultTier = String(it) === 'consult-sig' ? 'signature' : 'onepoint';
            openShop('consult');
            return;
          }
          goKakaoOrder(it);
          return;
        }
        if (e.target.closest('#payBackX')) { payWaitClear(); pb.hidden = true; }
        /* 🔑 코드 받았어요 · 바로 입력 — 배너는 그대로 두고 입력칸만 연다 */
        if (e.target.closest('#payBackCode')) { openLockPanel(); }
      });
      payBackCheck();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

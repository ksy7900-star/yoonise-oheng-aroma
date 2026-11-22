/*! 윤이세 타이밍 캘린더 — 노프레임 SVG 오행 캐릭터
 *  사각 액자·배경 박스 없이 공중에 둥실 떠 있는 캐릭터 5종.
 *  0타(대기) / 1타(놀람) / 2타(초집중) / 3타(완료)에서 눈·입·볼터치·팔·오라가
 *  SVG 안에서 실제로 바뀐다. 표정 교체는 .ch-face--N (CSS) 이 담당하고,
 *  팔은 data-stage 에 따라 CSS transform 으로 움직인다.
 */
(function (global) {
  'use strict';

  var seq = 0;
  var INK = '#332F2A';

  function star(x, y, s, cls, fill, op) {
    return '<path class="' + (cls || '') + '" d="M0 -1l.3 .7 .7 .3 -.7 .3 -.3 .7 -.3 -.7 -.7 -.3 .7 -.3z" ' +
      'transform="translate(' + x + ' ' + y + ') scale(' + s + ')" fill="' + (fill || '#fff') + '"' +
      (op == null ? '' : ' opacity="' + op + '"') + '/>';
  }

  /* ── 표정 4단 (모든 캐릭터 공통) ───────────────────────────── */
  function faces() {
    var s = '';
    // 0타 — 둥실 숨 쉬며 눈 깜빡, 부드러운 미소
    s += '<g class="ch-face ch-face--0">' +
      '<g class="ch-eye ch-eye--l"><ellipse cx="79" cy="109" rx="6.6" ry="8.2" fill="' + INK + '"/>' +
      '<circle cx="81.4" cy="105.7" r="2.2" fill="#fff" opacity=".92"/></g>' +
      '<g class="ch-eye ch-eye--r"><ellipse cx="121" cy="109" rx="6.6" ry="8.2" fill="' + INK + '"/>' +
      '<circle cx="123.4" cy="105.7" r="2.2" fill="#fff" opacity=".92"/></g>' +
      '<path d="M92 131.5q8 6.4 16 0" fill="none" stroke="' + INK + '" stroke-width="3.6" stroke-linecap="round"/>' +
      '</g>';

    // 1타 — 놀라며 반짝이는 큰 눈 ◉ ▽ ◉
    s += '<g class="ch-face ch-face--1">' +
      '<circle cx="79" cy="108" r="13.6" fill="#fff" opacity=".96"/>' +
      '<circle cx="121" cy="108" r="13.6" fill="#fff" opacity=".96"/>' +
      '<circle cx="79" cy="108" r="9.8" fill="' + INK + '"/>' +
      '<circle cx="121" cy="108" r="9.8" fill="' + INK + '"/>' +
      '<circle cx="75.4" cy="103.6" r="3.5" fill="#fff"/>' +
      '<circle cx="117.4" cy="103.6" r="3.5" fill="#fff"/>' +
      star(92, 88, 6, 'ch-spark', '#fff', '.95') +
      star(108, 86, 4.2, 'ch-spark ch-spark--b', '#fff', '.8') +
      '<path d="M93 126.5q7 11.5 14 0z" fill="' + INK + '"/>' +
      '</g>';

    // 2타 — 기 모으는 초집중 > ◡ <
    s += '<g class="ch-face ch-face--2">' +
      '<path d="M70 100l9.6 8.6-9.6 8.6" fill="none" stroke="' + INK + '" stroke-width="5.8" ' +
      'stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M130 100l-9.6 8.6 9.6 8.6" fill="none" stroke="' + INK + '" stroke-width="5.8" ' +
      'stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M93 130.5q7 5.6 14 0" fill="none" stroke="' + INK + '" stroke-width="3.4" stroke-linecap="round"/>' +
      '</g>';

    // 3타 — 활짝 ^ ᗜ ^
    s += '<g class="ch-face ch-face--3">' +
      '<path d="M69 111q10-13.5 20 0" fill="none" stroke="' + INK + '" stroke-width="5.6" stroke-linecap="round"/>' +
      '<path d="M111 111q10-13.5 20 0" fill="none" stroke="' + INK + '" stroke-width="5.6" stroke-linecap="round"/>' +
      '<path d="M86.5 125q13.5 21 27 0z" fill="' + INK + '"/>' +
      '<path d="M94 137q6 6.4 12 0q-6 3-12 0z" fill="#F08A86"/>' +
      star(60, 96, 5, 'ch-spark ch-spark--happy', '#fff', '.85') +
      star(140, 94, 4, 'ch-spark ch-spark--happy', '#fff', '.7') +
      '</g>';

    return s;
  }

  function blush() {
    return '<g class="ch-blush">' +
      '<ellipse cx="63" cy="124" rx="10" ry="5.6" fill="#F2768C"/>' +
      '<ellipse cx="137" cy="124" rx="10" ry="5.6" fill="#F2768C"/>' +
      '</g>';
  }

  /* ── 오행 캐릭터 5종 ──────────────────────────────────────── */
  var BODY = {
    목: function (u) {
      return '<path d="M100 62V38" fill="none" stroke="#6DAF52" stroke-width="6.4" stroke-linecap="round"/>' +
        '<path d="M100 46C86 44 74.5 34 73.5 20c14 0 25.5 10 26.5 26z" fill="#7FC25F"/>' +
        '<path d="M100 46c14-2 25.5-12 26.5-26-14 0-25.5 10-26.5 26z" fill="#9BD67A"/>' +
        '<path d="M100 54c33 0 57 26 57 60 0 33-25.5 54-57 54s-57-21-57-54c0-34 24-60 57-60z" fill="url(#' + u + 'b)"/>' +
        '<ellipse cx="100" cy="131" rx="35" ry="28" fill="#D8EFC6" opacity=".5"/>' +
        '<ellipse cx="75" cy="83" rx="15" ry="10" fill="#fff" opacity=".26" transform="rotate(-24 75 83)"/>';
    },
    화: function (u) {
      return '<path d="M100 36c7 17 23 27 33 41 9 13 14.5 25 14.5 38 0 28-21.5 49-47.5 49S52.5 143 52.5 115c0-13 5.5-25 14.5-38 10-14 26-24 33-41z" fill="url(#' + u + 'b)"/>' +
        '<ellipse cx="74" cy="84" rx="13" ry="9" fill="#fff" opacity=".26" transform="rotate(-24 74 84)"/>' +
        '<ellipse cx="88" cy="58" rx="7" ry="11" fill="#fff" opacity=".18" transform="rotate(14 88 58)"/>';
    },
    토: function (u) {
      return '<path d="M100 58c-12 0-21 5-22 13-16 12-27 30-27 51 0 25 22 41 49 41s49-16 49-41c0-21-11-39-27-51-1-8-10-13-22-13z" fill="url(#' + u + 'b)"/>' +
        '<path d="M78 72h44" stroke="#C08A3E" stroke-width="8" stroke-linecap="round"/>' +
        '<path d="M100 64l-8-10 8 4 8-4z" fill="#D9A25A"/>' +
        '<ellipse cx="60" cy="90" rx="10" ry="14" fill="#fff" opacity=".22" transform="rotate(-16 60 90)"/>' +
        '<path d="M64 148q36 20 72 0" fill="none" stroke="#C08A3E" stroke-width="2.4" opacity=".35" ' +
        'stroke-linecap="round" stroke-dasharray="1 6"/>';
    },
    금: function (u) {
      return '<path d="M100 42l29 17 18 35-18 47-29 12-29-12-18-47 18-35z" fill="url(#' + u + 'b)" ' +
        'stroke="#93A9BA" stroke-width="2.2" stroke-linejoin="round"/>' +
        '<path d="M100 44l16 51-16 58-16-58z" fill="#fff" opacity=".3"/>' +
        '<path d="M100 44l-28 15-18 35 28-6z" fill="#fff" opacity=".18"/>' +
        '<path d="M129 60l17 34-17 46-4-50z" fill="#2F4A5E" opacity=".09"/>' +
        '<path d="M144 52a16 16 0 1 0 0 26 13 13 0 1 1 0-26z" fill="#F6E7BC" opacity=".95"/>';
    },
    수: function (u) {
      return '<path d="M100 32c0 0 52 60 52 88 0 29-23 50-52 50s-52-21-52-50c0-28 52-88 52-88z" fill="url(#' + u + 'b)"/>' +
        '<ellipse cx="60" cy="84" rx="10" ry="14" fill="#fff" opacity=".22" transform="rotate(-20 60 84)"/>';
    }
  };

  var ARMS = {
    목: '<path class="ch-arm ch-arm--l" d="M44 106c-11 4-17 13-17 25 11-2 17-12 17-25z" fill="#7FC25F"/>' +
      '<path class="ch-arm ch-arm--r" d="M156 106c11 4 17 13 17 25-11-2-17-12-17-25z" fill="#9BD67A"/>',
    화: '<path class="ch-arm ch-arm--l" d="M51 108c-13 5-19 15-19 28 12-3 19-14 19-28z" fill="#FFB55C"/>' +
      '<path class="ch-arm ch-arm--r" d="M149 108c13 5 19 15 19 28-12-3-19-14-19-28z" fill="#FFCF86"/>',
    토: '<path class="ch-arm ch-arm--l" d="M50 110c-12 4-18 13-18 25 11-2 18-12 18-25z" fill="#EFD79E"/>' +
      '<path class="ch-arm ch-arm--r" d="M150 110c12 4 18 13 18 25-11-2-18-12-18-25z" fill="#F7E7BD"/>',
    금: '<path class="ch-arm ch-arm--l" d="M50 106l-17 10 15 13 6-15z" fill="#C6D6E2"/>' +
      '<path class="ch-arm ch-arm--r" d="M150 106l17 10-15 13-6-15z" fill="#DFEAF2"/>',
    수: '<path class="ch-arm ch-arm--l" d="M51 112c-10 7-14 14-13 23 10-5 15-14 13-23z" fill="#8FD3E8"/>' +
      '<path class="ch-arm ch-arm--r" d="M149 112c10 7 14 14 13 23-10-5-15-14-13-23z" fill="#B7E8F5"/>'
  };

  var DEFS = {
    목: '<linearGradient id="%b" x1="0" y1="0" x2=".15" y2="1"><stop offset="0" stop-color="#B2DF96"/>' +
      '<stop offset=".5" stop-color="#88C66E"/><stop offset="1" stop-color="#5C9A4A"/></linearGradient>',
    화: '<linearGradient id="%b" x1=".1" y1="0" x2=".2" y2="1"><stop offset="0" stop-color="#FFC97A"/>' +
      '<stop offset=".46" stop-color="#F58A5C"/><stop offset="1" stop-color="#DE5439"/></linearGradient>',
    토: '<linearGradient id="%b" x1=".1" y1="0" x2=".2" y2="1"><stop offset="0" stop-color="#FBEDCB"/>' +
      '<stop offset=".5" stop-color="#F0D79E"/><stop offset="1" stop-color="#D9A94F"/></linearGradient>',
    금: '<linearGradient id="%b" x1=".1" y1="0" x2=".3" y2="1"><stop offset="0" stop-color="#F4FAFF"/>' +
      '<stop offset=".5" stop-color="#C7D8E6"/><stop offset="1" stop-color="#8FA6B8"/></linearGradient>',
    수: '<linearGradient id="%b" x1=".15" y1="0" x2=".2" y2="1"><stop offset="0" stop-color="#BEEAF7"/>' +
      '<stop offset=".5" stop-color="#6FBFD9"/><stop offset="1" stop-color="#3A87A6"/></linearGradient>'
  };

  var GLOW = {
    목: '#7FC25F', 화: '#F58A5C', 토: '#E9C878', 금: '#B9CEDD', 수: '#63BBD6'
  };

  var DECOR = {
    목: star(38, 74, 5, 'ch-tw', '#fff', '.75') + star(162, 96, 4, 'ch-tw ch-tw--b', '#fff', '.6'),
    화: star(40, 62, 5, 'ch-tw', '#FFE3A6', '.9') + star(160, 84, 4, 'ch-tw ch-tw--b', '#FFE3A6', '.7'),
    토: star(158, 70, 5, 'ch-tw', '#FFF3D6', '.85') + star(42, 92, 4, 'ch-tw ch-tw--b', '#FFF3D6', '.65'),
    금: star(44, 66, 5, 'ch-tw', '#FFF6DC', '.9') + star(154, 96, 4, 'ch-tw ch-tw--b', '#FFF6DC', '.75'),
    수: star(42, 70, 5, 'ch-tw', '#DFF6FF', '.8') + star(158, 92, 4, 'ch-tw ch-tw--b', '#DFF6FF', '.65')
  };

  /**
   * 노프레임 오행 캐릭터 SVG 문자열
   * @param {string} el   '목' | '화' | '토' | '금' | '수'
   * @param {object} opt  { stage: 0~3, cls: 추가 클래스 }
   */
  function svg(el, opt) {
    opt = opt || {};
    if (!BODY[el]) el = '화';
    var u = 'ch' + (++seq) + '_';
    var stage = Math.max(0, Math.min(3, opt.stage == null ? 0 : Number(opt.stage)));
    var box = opt.box || '0 0 200 200';
    var defs = '<defs>' +
      DEFS[el].replace(/%b/g, u + 'b') +
      '<radialGradient id="' + u + 'g" cx=".5" cy=".5" r=".5">' +
      '<stop offset="0" stop-color="' + GLOW[el] + '" stop-opacity=".42"/>' +
      '<stop offset=".62" stop-color="' + GLOW[el] + '" stop-opacity=".14"/>' +
      '<stop offset="1" stop-color="' + GLOW[el] + '" stop-opacity="0"/>' +
      '</radialGradient>' +
      '</defs>';

    return '<svg class="ch ch--' + el + (opt.cls ? ' ' + opt.cls : '') + '" data-stage="' + stage + '" ' +
      'viewBox="' + box + '" role="img" aria-hidden="true" focusable="false">' +
      defs +
      '<circle class="ch-glow" cx="100" cy="108" r="88" fill="url(#' + u + 'g)"/>' +
      '<ellipse class="ch-shadow" cx="100" cy="185" rx="42" ry="6.5" fill="#2A2724" opacity=".10"/>' +
      '<g class="ch-body">' + BODY[el](u) + '</g>' +
      '<g class="ch-arms">' + ARMS[el] + '</g>' +
      blush() + faces() +
      '<g class="ch-decor">' + DECOR[el] + '</g>' +
      '<circle class="ch-aura-wave" cx="100" cy="108" r="62" fill="none" stroke="' + GLOW[el] + '" stroke-width="3" opacity="0"/>' +
      '</svg>';
  }

  /**
   * 달력 칸에 착 붙는 '미니 캐릭터 스티커'
   *  — 캐릭터 그림을 작게 잘라(크롭) 쓴다. 얼굴 아래로 잘리지 않게 캐릭터 몸 전체가
   *    들어오는 상자만 남기고, 달력 칸에서는 흰 테두리(다이컷 느낌)를 CSS 로 얹는다.
   * @param {string} el '목'|'화'|'토'|'금'|'수'
   */
  function sticker(el) {
    if (!BODY[el]) el = '화';
    return svg(el, { stage: 3, cls: 'ch--sticker', box: '24 8 152 168' });
  }

  /* ── 부적 이름표 ──────────────────────────────────────────────
     날짜 로테이션 — 같은 날은 같은 이름, 날마다 다른 이름. */
  var NAMES = {
    '소통': ['말문 트이는 부적', '먼저 건네는 말 부적', '순조로운 소통 부적', '대화 풀리는 부적'],
    '입단속': ['입단속·수호 부적', '말조심 방패 부적', '한 박자 참기 부적', '눈치 백단 부적'],
    '결정': ['도장·결정 부적', '오늘 결론 부적', '미루지 않기 부적', '직감 결정 부적'],
    '머니': ['머니·지갑지킴 부적', '수금 성공 부적', '충동결제 방지 부적', '지갑 단속 부적'],
    '리셋': ['멘탈 리셋 부적', '머리 비우기 부적', '새 판 부적', '리셋·새출발 부적']
  };
  var ICON = { '소통': '🗣️', '입단속': '🛡️', '결정': '✍️', '머니': '💰', '리셋': '🫧' };
  var REP = { 목: '새싹 성장 부적', 화: '불꽃 결정 부적', 토: '달항아리 리셋 부적', 금: '수정 머니 부적', 수: '물방울 수호 부적' };
  var REP_ICON = { 목: '🌱', 화: '🔥', 토: '🏺', 금: '💎', 수: '💧' };

  /* ── 2027 대표 수호 부적 50종 ────────────────────────────────
     내 일간(10천간) × 내 사주에 부족한 오행(5) = 50가지.
     같은 金이 부족해도 丙화와 庚금은 다른 부적이 나온다.
       n: 화면에 보이는 이름 · h: 부적 안에 세로로 새기는 한자 4자
       m: 부적 안 기운 표기(주문 4자) · d: 한 줄 기운 설명 */
  var REP50 = {
    '甲': {
      '목': { n: '쌍림(雙林) 자립 부적', h: '雙林自生', m: '木氣自立', d: '혼자 다 짊어지던 짐을 나눠 들 동료가 곁에 서게 합니다.' },
      '화': { n: '개화(開花) 발산 부적', h: '開花發彩', m: '火氣發彩', d: '속에만 쌓아 둔 재주가 밖에서 꽃처럼 드러나게 합니다.' },
      '토': { n: '옥토(沃土) 결실 부적', h: '沃土結實', m: '土氣結實', d: '애쓴 만큼 남는 땅이 생겨 수고가 성과로 맺히게 합니다.' },
      '금': { n: '청송(靑松) 기개 부적', h: '靑松立節', m: '金氣立節', d: '흐트러진 가지를 다듬어 반듯한 이름을 세우게 합니다.' },
      '수': { n: '수원(水源) 기반 부적', h: '水源潤根', m: '水氣潤根', d: '메마른 뿌리에 물길이 돌아 배움과 후원이 채워지게 합니다.' }
    },
    '乙': {
      '목': { n: '덩굴(蔓木) 연결 부적', h: '蔓木相扶', m: '木氣相扶', d: '휘감아 오르는 줄기처럼 옆의 힘을 빌려 더 높이 오르게 합니다.' },
      '화': { n: '나비(花蝶) 발산 부적', h: '花蝶引光', m: '火氣引光', d: '숨겨 둔 매력을 먼저 알아보는 사람이 나타나게 합니다.' },
      '토': { n: '녹음(綠陰) 결실 부적', h: '綠陰成實', m: '土氣成實', d: '유연하게 뻗은 가지가 그늘과 열매를 함께 남기게 합니다.' },
      '금': { n: '등나무(藤木) 품위 부적', h: '藤木整儀', m: '金氣整儀', d: '휘어진 채로도 반듯한 격을 갖추게 합니다.' },
      '수': { n: '청류(淸流) 윤택 부적', h: '淸流潤澤', m: '水氣潤澤', d: '마른 넝쿨에 맑은 물이 흘러 말과 감성이 촉촉해지게 합니다.' }
    },
    '丙': {
      '목': { n: '정원(庭園) 후원 부적', h: '庭園添薪', m: '木氣添薪', d: '타오르는 열기에 땔감이 되어 줄 뿌리가 생기게 합니다.' },
      '화': { n: '양지(陽地) 동행 부적', h: '陽地同照', m: '火氣同照', d: '혼자 타오르지 않게 같은 열기의 동지가 곁에 서게 합니다.' },
      '토': { n: '도자(陶磁) 성과 부적', h: '陶磁成器', m: '土氣成器', d: '타오르던 열기가 그릇으로 남아 한 해의 공이 손에 쥐어지게 합니다.' },
      '금': { n: '제련(製鍊) 성취 부적', h: '製鍊成金', m: '金氣成金', d: '불로 다스려 애쓴 시간이 쓸 만한 값으로 바뀌게 합니다.' },
      '수': { n: '수화기제(水火旣濟) 조율 부적', h: '水火旣濟', m: '水火調均', d: '타는 마음과 식는 마음 사이에 균형이 잡히게 합니다.' }
    },
    '丁': {
      '목': { n: '등잔(燈盞) 심지 부적', h: '燈心續油', m: '木氣續油', d: '꺼지지 않게 받쳐 줄 심지와 기름이 채워지게 합니다.' },
      '화': { n: '연등(連燈) 동행 부적', h: '連燈長夜', m: '火氣長明', d: '작은 불빛이 여럿 모여 긴 밤을 함께 견디게 합니다.' },
      '토': { n: '향로(香爐) 결실 부적', h: '香爐留香', m: '土氣留香', d: '사그라지기 전에 향기로 남아 수고가 흔적으로 남게 합니다.' },
      '금': { n: '촛대(燭臺) 재물 부적', h: '燭臺生輝', m: '金氣生輝', d: '밤새 밝힌 정성이 값으로 돌아오게 합니다.' },
      '수': { n: '감로(甘露) 보호 부적', h: '甘露護焰', m: '水氣護焰', d: '마른 불빛에 단 이슬이 내려 꺼지지 않게 감싸 주게 합니다.' }
    },
    '戊': {
      '목': { n: '산림(山林) 터전 부적', h: '山林有序', m: '木氣有序', d: '큰 산에 나무가 자라듯 반듯한 질서가 자리 잡게 합니다.' },
      '화': { n: '온산(溫山) 후원 부적', h: '溫山生煙', m: '火氣生煙', d: '굳은 흙에 온기가 스며들어 배움과 위로가 채워지게 합니다.' },
      '토': { n: '봉우리(重峯) 동행 부적', h: '重峯並立', m: '土氣並立', d: '홀로 버티지 않게 나란한 봉우리가 곁에 서게 합니다.' },
      '금': { n: '광맥(鑛脈) 발산 부적', h: '鑛脈露天', m: '金氣露天', d: '품고 있던 값어치가 세상 밖으로 드러나게 합니다.' },
      '수': { n: '계곡(溪谷) 물길 부적', h: '溪谷通流', m: '水氣通流', d: '막힌 산에 물길이 트여 재물과 흐름이 통하게 합니다.' }
    },
    '己': {
      '목': { n: '화원(花園) 질서 부적', h: '花園整畦', m: '木氣整畦', d: '잘 가꾼 밭에 이랑이 생기듯 하루에 질서가 잡히게 합니다.' },
      '화': { n: '온실(溫室) 온기 부적', h: '溫室向陽', m: '火氣向陽', d: '찬 흙을 데워 줄 볕이 들어 배움과 위로가 자라게 합니다.' },
      '토': { n: '이랑(層田) 동행 부적', h: '層田共耕', m: '土氣共耕', d: '혼자 일구지 않게 함께 밭을 나눌 손이 생기게 합니다.' },
      '금': { n: '이삭(結穀) 수확 부적', h: '結穀歸倉', m: '金氣歸倉', d: '뿌린 만큼 여무는 곡식처럼 수고가 눈에 보이게 합니다.' },
      '수': { n: '단비(甘雨) 물길 부적', h: '甘雨潤田', m: '水氣潤田', d: '마른 밭에 단비가 내려 애써 일군 것이 마르지 않게 합니다.' }
    },
    '庚': {
      '목': { n: '원목(原木) 재물 부적', h: '原木成材', m: '木氣成材', d: '단단한 쇠가 쓸 만한 나무를 만나 수고가 값이 되게 합니다.' },
      '화': { n: '명검(名劍) 명예 부적', h: '名劍正名', m: '火氣正名', d: '불에 달궈 벼릴수록 이름이 반듯해지게 합니다.' },
      '토': { n: '바위산(石山) 후원 부적', h: '石山載鐵', m: '土氣載鐵', d: '쇠를 낳는 산처럼 기대고 배울 뿌리가 생기게 합니다.' },
      '금': { n: '쌍검(雙劍) 동행 부적', h: '雙劍並利', m: '金氣並利', d: '혼자 벼리지 않게 견줄 동료가 곁에 서게 합니다.' },
      '수': { n: '샘물(淸泉) 발산 부적', h: '淸泉出金', m: '水氣出金', d: '벼린 재주가 맑은 물처럼 밖으로 흐르게 합니다.' }
    },
    '辛': {
      '목': { n: '분재(盆栽) 결실 부적', h: '盆栽藏玉', m: '木氣藏玉', d: '고운 손끝에 값진 나무가 놓여 섬세함이 재물이 되게 합니다.' },
      '화': { n: '옥빛(玉華) 명예 부적', h: '玉華映光', m: '火氣映光', d: '빛을 받아야 보석이 보이듯 반듯한 자리가 품위를 세우게 합니다.' },
      '토': { n: '원석(原石) 기반 부적', h: '原石含輝', m: '土氣含輝', d: '원석을 품은 흙처럼 받쳐 줄 기반이 생기게 합니다.' },
      '금': { n: '옥구슬(玉珠) 동행 부적', h: '玉珠雙照', m: '金氣雙照', d: '나란히 빛날 보석이 곁에 놓이게 합니다.' },
      '수': { n: '수정(水晶) 발산 부적', h: '水晶流彩', m: '水氣流彩', d: '간직한 재주가 맑은 빛으로 드러나게 합니다.' }
    },
    '壬': {
      '목': { n: '강가(江岸) 발산 부적', h: '江岸生林', m: '木氣生林', d: '큰 물이 기슭의 나무를 살리듯 재주가 밖으로 뻗게 합니다.' },
      '화': { n: '뱃불(漁火) 재물 부적', h: '漁火點江', m: '火氣點江', d: '넓은 물 위에 작은 불빛처럼 재물이 또렷하게 잡히게 합니다.' },
      '토': { n: '제방(堤防) 질서 부적', h: '堤防定流', m: '土氣定流', d: '넘실대는 물에 둑이 생겨 기세가 길을 잃지 않게 합니다.' },
      '금': { n: '금샘(金井) 후원 부적', h: '金井不竭', m: '金氣不竭', d: '마르지 않는 샘처럼 배움과 후원이 솟게 합니다.' },
      '수': { n: '바다(萬頃) 동행 부적', h: '萬頃同波', m: '水氣同波', d: '넓은 바다에 함께할 물결이 생기게 합니다.' }
    },
    '癸': {
      '목': { n: '춘우(春雨) 발산 부적', h: '春雨催芽', m: '木氣催芽', d: '봄비가 새싹을 깨우듯 재주가 하나둘 피어나게 합니다.' },
      '화': { n: '서광(曙光) 재물 부적', h: '曙光化露', m: '火氣化露', d: '이슬이 빛을 받아 보석이 되듯 재물이 모습을 드러내게 합니다.' },
      '토': { n: '연못(蓮池) 질서 부적', h: '蓮池聚水', m: '土氣聚水', d: '흩어지던 물이 못에 모이듯 하루에 중심이 잡히게 합니다.' },
      '금': { n: '이슬(玉露) 뿌리 부적', h: '玉露凝根', m: '金氣凝根', d: '이슬을 맺어 주는 차가운 쇠처럼 기댈 뿌리가 생기게 합니다.' },
      '수': { n: '보슬비(細雨) 동행 부적', h: '細雨同潤', m: '水氣同潤', d: '혼자 내리지 않게 함께 젖을 빗줄기가 생기게 합니다.' }
    }
  };

  /** 일간(천간) × 부족한 오행 → 그 사람만의 대표 부적 */
  function rep(gan, el) {
    var byGan = REP50[gan] || REP50['甲'];
    var t = byGan[el] || byGan['목'];
    return {
      gan: REP50[gan] ? gan : '甲', el: byGan[el] ? el : '목',
      n: t.n, h: t.h, m: t.m, d: t.d,
      icon: REP_ICON[el] || '✨'
    };
  }

  function seedOf(iso) {
    var n = 0;
    for (var i = 0; i < String(iso).length; i++) n = (n * 31 + String(iso).charCodeAt(i)) % 1000003;
    return n;
  }
  /** tag: '소통'|'입단속'|'결정'|'머니'|'리셋' (없으면 대표 부적) */
  function name(el, tag, iso) {
    var arr = NAMES[tag];
    if (!arr) return REP[el] || '수호 부적';
    return arr[seedOf(iso) % arr.length];
  }
  function icon(el, tag) {
    return ICON[tag] || REP_ICON[el] || '✨';
  }

  global.Chars = { svg: svg, sticker: sticker, name: name, icon: icon, rep: rep, REP: REP, REP_ICON: REP_ICON };
})(typeof window !== 'undefined' ? window : globalThis);

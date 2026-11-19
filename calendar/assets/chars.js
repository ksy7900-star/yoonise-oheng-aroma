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
    var defs = '<defs>' +
      DEFS[el].replace(/%b/g, u + 'b') +
      '<radialGradient id="' + u + 'g" cx=".5" cy=".5" r=".5">' +
      '<stop offset="0" stop-color="' + GLOW[el] + '" stop-opacity=".42"/>' +
      '<stop offset=".62" stop-color="' + GLOW[el] + '" stop-opacity=".14"/>' +
      '<stop offset="1" stop-color="' + GLOW[el] + '" stop-opacity="0"/>' +
      '</radialGradient>' +
      '</defs>';

    return '<svg class="ch ch--' + el + (opt.cls ? ' ' + opt.cls : '') + '" data-stage="' + stage + '" ' +
      'viewBox="0 0 200 200" role="img" aria-hidden="true" focusable="false">' +
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

  /* ── 부적 이름표 ──────────────────────────────────────────────
     날짜 로테이션 — 같은 날은 같은 이름, 날마다 다른 이름. */
  var NAMES = {
    '럭키': ['칼퇴·럭키 부적', '기회 포착 부적', '인연 럭키 부적', '한 방 럭키 부적'],
    '입단속': ['입단속·수호 부적', '말조심 방패 부적', '한 박자 참기 부적', '눈치 백단 부적'],
    '결정': ['도장·결정 부적', '오늘 결론 부적', '미루지 않기 부적', '직감 결정 부적'],
    '머니': ['머니·지갑지킴 부적', '수금 성공 부적', '충동결제 방지 부적', '지갑 단속 부적'],
    '리셋': ['멘탈 리셋 부적', '머리 비우기 부적', '새 판 부적', '리셋·새출발 부적']
  };
  var ICON = { '럭키': '🍀', '입단속': '🛡️', '결정': '✍️', '머니': '💰', '리셋': '🫧' };
  var REP = { 목: '새싹 성장 부적', 화: '불꽃 결정 부적', 토: '달항아리 리셋 부적', 금: '수정 머니 부적', 수: '물방울 수호 부적' };
  var REP_ICON = { 목: '🌱', 화: '🔥', 토: '🏺', 금: '💎', 수: '💧' };

  function seedOf(iso) {
    var n = 0;
    for (var i = 0; i < String(iso).length; i++) n = (n * 31 + String(iso).charCodeAt(i)) % 1000003;
    return n;
  }
  /** tag: '럭키'|'입단속'|'결정'|'머니'|'리셋' (없으면 대표 부적) */
  function name(el, tag, iso) {
    var arr = NAMES[tag];
    if (!arr) return REP[el] || '수호 부적';
    return arr[seedOf(iso) % arr.length];
  }
  function icon(el, tag) {
    return ICON[tag] || REP_ICON[el] || '✨';
  }

  global.Chars = { svg: svg, name: name, icon: icon, REP: REP, REP_ICON: REP_ICON };
})(typeof window !== 'undefined' ? window : globalThis);

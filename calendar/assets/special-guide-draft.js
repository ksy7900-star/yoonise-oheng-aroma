/* ==========================================================
   ✍️ 감정서 문장 엔진 (2026-11-26, v7 — 전체 명식 종합)
   · 윤이세가 고객 한 사람을 앞에 두고 직접 상담하듯 쓰는 감정서.
   · 바뀐 것 (v6 → v7)
     1. 일간 하나로 성향을 설명하지 않는다. 년·월·일·시 네 기둥, 월령(계절),
        지장간, 오행의 실질 강약, 십성의 분포와 투간·통근, 합·충·형·파·해,
        신강·신약과 균형, 격국과 용신, 현재 대운과 2027년 세운을 함께 놓고
        영역·기회·주의점·실천을 고른다.
     2. 문체를 전문 상담의 합니다체로 바꿨다. (v6 의 해요체·비유 도입 폐기)
     3. 도입은 인생의 흐름·살아가는 방식·대운과 2027년의 초점 세 단락.
     4. 1~5번 주제와 제목은 그대로. 단, 같은 해석을 두 번 쓰지 않는다.
     5. 분량 1,200~1,800자(공백 포함, 굵게 표시 제외). 단락은 2~3문장.
     6. 굵게 표시는 **…** 하나만 쓴다 — 화면 편집기와 PNG 내보내기가 이 표시를
        읽어 굵은 글씨로 그린다. 고객에게 글자로 나갈 때는 plain() 으로 지운다.
   · 지키는 선
     - 확인되지 않은 과거 사건·심리를 사실처럼 단정하지 않는다.
     - 일간·오행 하나, 개수만으로 판단하지 않는다. (계산값은 문장 선택에만)
     - 십성 이름·오행 이름·한자 용어를 본문에 내보내지 않는다.
     - 「결」 자를 사주 기운의 뜻으로 쓰지 않는다.
   · 입력은 사주 스냅샷(special-guide.js · yoon-key buildSnapshot 산출물).
     시각을 모르면 time 기둥이 없고, 그때는 세 기둥만으로 판단한다.
   ========================================================== */
(function (global) {
  'use strict';

  var GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
  var ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  var GAN_EL = ['목', '목', '화', '화', '토', '토', '금', '금', '수', '수'];
  var ZHI_EL = ['수', '토', '목', '목', '토', '화', '화', '토', '금', '금', '토', '수'];
  var GAN_KO = { '甲': '갑', '乙': '을', '丙': '병', '丁': '정', '戊': '무', '己': '기', '庚': '경', '辛': '신', '壬': '임', '癸': '계' };
  var HIDDEN = {
    '子': ['癸'], '丑': ['己', '癸', '辛'], '寅': ['甲', '丙', '戊'], '卯': ['乙'],
    '辰': ['戊', '乙', '癸'], '巳': ['丙', '戊', '庚'], '午': ['丁', '己'], '未': ['己', '丁', '乙'],
    '申': ['庚', '壬', '戊'], '酉': ['辛'], '戌': ['戊', '辛', '丁'], '亥': ['壬', '甲']
  };
  var EL_BIRTH = { 목: '화', 화: '토', 토: '금', 금: '수', 수: '목' };
  var EL_OVER = { 목: '토', 화: '금', 토: '수', 금: '목', 수: '화' };
  var EL_MOTHER = { 화: '목', 토: '화', 금: '토', 수: '금', 목: '수' };
  var ELS = ['목', '화', '토', '금', '수'];

  /* 고객에게 보내면 안 되는 표현 — 검수 화면에서 이 목록을 그대로 보여 준다 */
  var FORBIDDEN = [
    '그 눈이 값을 해요', '판이 흔들리지 않아요', '사주에서 이 자리가 제일 커요',
    '일지가 그대로라 쌓은 게 안 흐트러져요', '그해는', '내 편을 늘리는',
    '논밭은 눈에 안 띄는 동안에도 자라요', '그 눈이 값', '내 편이에요',
    '반드시 성공한다', '무조건 돈이', '큰 사고가 발생', '질병이 발생한다',
    '실패할 수밖에 없다', '운명입니다', '100%'
  ];

  /* ── 기본 계산 ─────────────────────────────────────── */
  function ganIdx(g) { return GAN.indexOf(g); }
  function zhiIdx(z) { return ZHI.indexOf(z); }
  function tenGodOf(dayGan, g) {
    var other = GAN_EL[ganIdx(g)];
    var me = GAN_EL[dayGan];
    if (!other || !me) return '';
    var same = (dayGan % 2) === (ganIdx(g) % 2);
    if (me === other) return same ? '비견' : '겁재';
    if (EL_BIRTH[me] === other) return same ? '식신' : '상관';
    if (EL_OVER[me] === other) return same ? '편재' : '정재';
    if (EL_OVER[other] === me) return same ? '편관' : '정관';
    if (EL_MOTHER[me] === other) return same ? '편인' : '정인';
    return '';
  }
  function groupOfTen(t) {
    if (!t) return '';
    if (/비견|겁재/.test(t)) return '비겁';
    if (/식신|상관/.test(t)) return '식상';
    if (/편재|정재/.test(t)) return '재성';
    if (/편관|정관/.test(t)) return '관성';
    if (/편인|정인/.test(t)) return '인성';
    return '';
  }
  function groupOfEl(el, me) {
    if (!el || !me) return '';
    if (el === me || el === EL_MOTHER[me]) return el === me ? '비겁' : '인성';
    if (EL_BIRTH[me] === el) return '식상';
    if (EL_OVER[me] === el) return '재성';
    if (EL_OVER[el] === me) return '관성';
    return '';
  }

  var CHUNG = { 0: 6, 6: 0, 1: 7, 7: 1, 2: 8, 8: 2, 3: 9, 9: 3, 4: 10, 10: 4, 5: 11, 11: 5 };
  var HAP = { 0: 1, 1: 0, 2: 11, 11: 2, 3: 10, 10: 3, 4: 9, 9: 4, 5: 8, 8: 5, 6: 7, 7: 6 };
  var PO = { 0: 9, 9: 0, 3: 6, 6: 3, 4: 1, 1: 4, 7: 10, 10: 7, 2: 11, 11: 2, 5: 8, 8: 5 };
  var HAI = { 0: 7, 7: 0, 1: 6, 6: 1, 2: 5, 5: 2, 3: 4, 4: 3, 8: 11, 11: 8, 9: 10, 10: 9 };
  var HYEONG = {};
  (function () {
    var pairs = [[2, 5], [5, 8], [2, 8], [1, 10], [10, 7], [1, 7], [0, 3]];
    pairs.forEach(function (p) { HYEONG[p[0] + '-' + p[1]] = 1; HYEONG[p[1] + '-' + p[0]] = 1; });
    [4, 6, 9, 11].forEach(function (i) { HYEONG[i + '-' + i] = 1; });
  })();
  var SAMHAP = { '8-0': ['수', 4], '0-8': ['수', 4], '0-4': ['수', 8], '4-0': ['수', 8], '4-8': ['수', 0], '8-4': ['수', 0],
    '11-3': ['목', 7], '3-11': ['목', 7], '3-7': ['목', 11], '7-3': ['목', 11], '7-11': ['목', 3], '11-7': ['목', 3],
    '2-6': ['화', 10], '6-2': ['화', 10], '6-10': ['화', 2], '10-6': ['화', 2], '10-2': ['화', 6], '2-10': ['화', 6],
    '5-9': ['금', 1], '9-5': ['금', 1], '9-1': ['금', 5], '1-9': ['금', 5], '1-5': ['금', 9], '5-1': ['금', 9] };

  /* ── 명식 분석 ─────────────────────────────────────── */
  function analyze(s) {
    var dm = (s && s.day_master) || {};
    var dgi = ganIdx(dm.gan);
    if (dgi < 0) return null;
    var dEl = GAN_EL[dgi];

    var P = (s && s.pillars) || {};
    var order = ['year', 'month', 'day', 'time'];
    var pil = [];
    order.forEach(function (k) {
      var p = P[k];
      if (!p || !p.gan || !p.zhi) return;
      var gi = ganIdx(p.gan), zi = zhiIdx(p.zhi);
      if (gi < 0 || zi < 0) return;
      var hid = (HIDDEN[p.zhi] || []).map(function (h) {
        var hi = ganIdx(h);
        return { g: h, el: GAN_EL[hi], ten: tenGodOf(dgi, h) };
      });
      pil.push({
        pos: k, gi: gi, zi: zi, gan: p.gan, zhi: p.zhi,
        ganEl: GAN_EL[gi], zhiEl: ZHI_EL[zi],
        tenGan: tenGodOf(dgi, p.gan),
        hidden: hid
      });
    });
    if (!pil.length) return null;
    var has = {};
    pil.forEach(function (p) { has[p.pos] = p; });

    /* 오행의 실질 강약 — 월지 3.0 · 일지 2.0 · 년·시지 1.6 · 천간 0.9~1.2,
       지지는 지장간 비율(본기 0.6 · 중기 0.25 · 여기 0.15)로 나눠 담는다. */
    var W_S = { year: 0.9, month: 1.2, time: 0.9 };
    var W_B = { year: 1.6, month: 3.0, day: 2.0, time: 1.6 };
    var el = { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 };
    var ten = { 비겁: 0, 식상: 0, 재성: 0, 관성: 0, 인성: 0 };
    var selfW = 1.25;
    el[dEl] += selfW; ten['비겁'] += selfW;

    pil.forEach(function (p) {
      if (p.pos !== 'day') {
        var ws = W_S[p.pos] || 0.9;
        el[p.ganEl] += ws;
        ten[groupOfTen(p.tenGan)] += ws;
      }
      var wb = W_B[p.pos] || 1.2;
      var ratio = p.hidden.length >= 3 ? [0.6, 0.25, 0.15] : (p.hidden.length === 2 ? [0.7, 0.3] : [1]);
      p.hidden.forEach(function (h, i) {
        var w = wb * ratio[i];
        el[h.el] += w;
        ten[groupOfTen(h.ten)] += w;
      });
    });

    var total = 0;
    ELS.forEach(function (e) { total += el[e]; });
    var support = el[dEl] + el[EL_MOTHER[dEl]];
    var ratioS = total ? support / total : 0.5;

    var level;
    if (ratioS >= 0.62) level = '태강';
    else if (ratioS >= 0.53) level = '신강';
    else if (ratioS >= 0.45) level = '중화';
    else if (ratioS >= 0.36) level = '신약';
    else level = '태약';

    /* 득령·득지 — 월지와 일지가 나를 도와주는 자리인가 */
    var mP = has.month, dP = has.day;
    function helpsSupport(p) {
      if (!p) return false;
      if (p.zhiEl === dEl || p.zhiEl === EL_MOTHER[dEl]) return true;
      return p.hidden.some(function (h) { return h.el === dEl || h.el === EL_MOTHER[dEl]; });
    }
    var deukRyeong = helpsSupport(mP);
    var deukJi = helpsSupport(dP);
    var supportChars = 0;
    pil.forEach(function (p) {
      if (p.ganEl === dEl || p.ganEl === EL_MOTHER[dEl]) supportChars += 1;
      if (p.zhiEl === dEl || p.zhiEl === EL_MOTHER[dEl]) supportChars += 1;
    });
    var deukSe = supportChars >= 3;

    /* 계절 · 조후 */
    var SEASON = { 2: '봄', 3: '봄', 4: '환절기', 5: '여름', 6: '여름', 7: '환절기', 8: '가을', 9: '가을', 10: '환절기', 11: '겨울', 0: '겨울', 1: '환절기' };
    var season = mP ? SEASON[mP.zi] : '';
    var heat = el['화'] + (mP && (mP.zi === 6 || mP.zi === 7) ? 1.6 : 0) + (mP && mP.zi === 10 ? 0.8 : 0);
    var cold = el['수'] + (mP && (mP.zi === 0 || mP.zi === 1) ? 1.6 : 0) + (mP && mP.zi === 11 ? 0.8 : 0);
    var temp = (heat - cold) > 2.6 ? '조열' : ((cold - heat) > 2.6 ? '한랭' : '온화');

    /* 십성 분포 — 가장 두터운 자리와 가장 얇은 자리 */
    var groups = ['비겁', '식상', '재성', '관성', '인성'];
    var sorted = groups.slice().sort(function (a, b) { return ten[b] - ten[a]; });
    var domGroup = sorted[0], dom2 = sorted[1], weakGroup = sorted[sorted.length - 1];

    /* 투간 · 통근 — 그 자리가 하늘에 드러났고 땅에 뿌리를 내렸는가 */
    var rooted = {};
    groups.forEach(function (g) {
      var above = 0, below = 0;
      pil.forEach(function (p) {
        if (p.pos !== 'day' && groupOfTen(p.tenGan) === g) above += 1;
        p.hidden.forEach(function (h) { if (groupOfTen(h.ten) === g) below += 1; });
      });
      rooted[g] = { above: above, below: below, root: below > 0, expose: above > 0, solid: above > 0 && below > 0 };
    });

    /* 격국 — 월지 본기의 십성, 양인은 따로 */
    var gyeok = '', gyeokGroup = '';
    if (mP) {
      var mg = groupOfTen(mP.hidden[0].ten);
      gyeokGroup = mg;
      if (mg === '비겁') {
        var yang = dgi % 2 === 0;
        var wangZhi = { 목: 3, 화: 6, 토: 6, 금: 9, 수: 0 }[dEl];
        gyeok = (yang && mP.zi === wangZhi) ? '양인격' : '건록격';
      } else gyeok = mP.hidden[0].ten + '격';
    }

    /* 용신 · 희신 — 강하면 덜어내고, 약하면 채운다. 중화는 조후로 잡는다. */
    var strong = (level === '신강' || level === '태강');
    var weak = (level === '신약' || level === '태약');
    var yong = '', hee = '';
    if (strong) {
      if (ten['식상'] >= 2.6) yong = '식상';
      else if (ten['재성'] >= 2.2) yong = '재성';
      else if (ten['관성'] >= 2.0) yong = '관성';
      else yong = '식상';
      hee = (yong === '식상') ? '재성' : (yong === '재성' ? '관성' : '식상');
    } else if (weak) {
      yong = ten['인성'] >= 2.0 ? '인성' : (ten['비겁'] >= 2.6 ? '비겁' : '인성');
      hee = (yong === '인성') ? '비겁' : '인성';
    } else if (temp === '조열') {
      yong = groupOfEl('수', dEl) || '식상';
      hee = groupOfEl('금', dEl) || '재성';
    } else if (temp === '한랭') {
      yong = groupOfEl('화', dEl) || '식상';
      hee = groupOfEl('목', dEl) || '인성';
    } else {
      /* 고르면 가장 얇은 자리를 채운다 */
      yong = weakGroup;
      hee = sorted[sorted.length - 2];
    }
    if (!yong) yong = '식상';
    if (!hee || hee === yong) hee = (yong === '재성' ? '관성' : '재성');

    /* 용신에 해당하는 오행 */
    var yongEl = '';
    ELS.forEach(function (e) {
      if (groupOfEl(e, dEl) === yong && !yongEl) yongEl = e;
    });

    /* 합·충·형·파·해 — 일지·월지를 먼저 본다 */
    var rels = [];
    for (var i = 0; i < pil.length; i++) {
      for (var j = i + 1; j < pil.length; j++) {
        var a = pil[i], b = pil[j];
        var t = '';
        if (CHUNG[a.zi] === b.zi) t = '충';
        else if (HAP[a.zi] === b.zi) t = '합';
        else if (HYEONG[a.zi + '-' + b.zi]) t = '형';
        else if (PO[a.zi] === b.zi) t = '파';
        else if (HAI[a.zi] === b.zi) t = '해';
        var sh = SAMHAP[a.zi + '-' + b.zi];
        if (sh) t = t ? t : '반합';
        if (!t) continue;
        var weight = 0;
        if (a.pos === 'day' || b.pos === 'day') weight += 3;
        if (a.pos === 'month' || b.pos === 'month') weight += 2;
        rels.push({ type: t, a: a, b: b, w: weight });
      }
    }
    rels.sort(function (x, y) { return y.w - x.w; });

    /* 일지 관계 요약 — 2027년 세운(未)과 대운까지 */
    function relWith(zi, other) {
      if (CHUNG[zi] === other) return '충';
      if (HAP[zi] === other) return '합';
      if (HYEONG[zi + '-' + other]) return '형';
      if (PO[zi] === other) return '파';
      if (HAI[zi] === other) return '해';
      return '';
    }
    var dayRel = dP ? relWith(dP.zi, 7) : '';
    var dayRelOther = '';
    if (!dayRel && dP) dayRelOther = relWith(dP.zi, 7);

    /* 2027 세운 — 정미년. 세운 천간의 십성은 스냅샷 값을 쓰고, 없으면 계산한다. */
    var seunTen = (s.seun && s.seun.ten) ? s.seun.ten : tenGodOf(dgi, '丁');
    var seunGroup = groupOfTen(seunTen) || '인성';

    /* 현재 대운 — 2027년(한국 나이)이 들어 있는 10년 */
    var solar = s.solar || {};
    var yBirth = Number(solar.y) || 0;
    var kAge = yBirth ? 2027 - yBirth + 1 : 0;
    var iAge = yBirth ? 2027 - yBirth : 0;
    var du = null;
    var list = (s.daeun && s.daeun.list) || [];
    list.forEach(function (x) {
      if (x && x.age != null && kAge && x.age <= kAge && kAge < x.age + 10) du = x;
    });
    var duGroup = du ? groupOfTen(du.ten) : '';
    var duZi = du ? zhiIdx(du.zhi) : -1;
    var duRel = (duZi >= 0 && dP) ? relWith(dP.zi, duZi) : '';

    /* 월별 흐름 — 2027년 안에서 힘이 실리는 달 */
    var goodMonths = [];
    (s.months || []).forEach(function (m) {
      var gr = groupOfTen(m.ten);
      if ((gr === yong || gr === hee) && !m.chung_day && m.month) goodMonths.push(m.month);
    });
    goodMonths = goodMonths.filter(function (m, i, arr) { return arr.indexOf(m) === i && m !== 1; }).sort(function (x, y) { return x - y; });
    if (goodMonths.length > 2) goodMonths = [goodMonths[0], goodMonths[goodMonths.length - 1]];

    /* 생애 단계 */
    var stage;
    if (iAge < 20) stage = 'teen';
    else if (iAge < 30) stage = 'twenties';
    else if (iAge < 40) stage = 'thirties';
    else if (iAge < 50) stage = 'forties';
    else if (iAge < 60) stage = 'fifties';
    else if (iAge < 70) stage = 'sixties';
    else stage = 'elder';

    return {
      dgi: dgi, dEl: dEl, yang: dgi % 2 === 0,
      pil: pil, hasTime: !!has.time, has: has,
      el: el, ten: ten, total: total, ratioS: ratioS, level: level,
      deukRyeong: deukRyeong, deukJi: deukJi, deukSe: deukSe,
      season: season, temp: temp, monthZi: mP ? mP.zi : -1,
      domGroup: domGroup, dom2: dom2, weakGroup: weakGroup,
      rooted: rooted, gyeok: gyeok, gyeokGroup: gyeokGroup,
      yong: yong, hee: hee, yongEl: yongEl,
      rels: rels, dayRel: dayRel, duRel: duRel,
      seunTen: seunTen, seunGroup: seunGroup,
      du: du, duGroup: duGroup,
      goodMonths: goodMonths, stage: stage, iAge: iAge, kAge: kAge,
      name: (s.name || '').trim(),
      key: pil.map(function (p) { return p.gan + p.zhi; }).join('') + '|' + (s.name || '')
    };
  }

  /* ── 문장 재료 ─────────────────────────────────────── */

  var LEV = {
    태강: '기운의 중심이 매우 단단하게 서 있는 편입니다',
    신강: '기운의 중심이 또렷하고 안쪽으로 단단히 모여 있습니다',
    중화: '기운이 한쪽으로 치우치지 않고 고르게 잡혀 있습니다',
    신약: '주변의 기운을 받아들이며 움직이는 쪽에 힘이 실린 구조입니다',
    태약: '여건이 갖춰질 때 힘을 내는 유연한 구조입니다'
  };

  var DOM_LINE = {
    비겁: [
      '무엇을 하든 자기 판단으로 시작하고, 한번 세운 뜻은 남이 흔들어도 쉽게 꺾이지 않습니다.',
      '일을 맡으면 끝까지 붙잡고, 남이 손대는 것보다 직접 매듭짓는 쪽을 편하게 여깁니다.'
    ],
    식상: [
      '생각한 것을 말과 결과물로 꺼내는 힘이 좋아, 만들어 내는 자리에서 존재감이 살아납니다.',
      '머릿속에 담아 두기보다 밖으로 꺼내야 정리가 되는 쪽이라, 표현할 자리가 있어야 힘이 납니다.'
    ],
    재성: [
      '현실의 조건을 먼저 보는 감각이 있어, 되는 일과 안 되는 일을 일찍 가려냅니다.',
      '말보다 실제로 남는 것을 보는 편이라, 계획이 구체적이고 숫자에 강합니다.'
    ],
    관성: [
      '자기 역할과 책임을 분명히 여기고, 맡은 자리를 지키는 힘이 있습니다.',
      '한번 맡은 일은 끝까지 책임지는 쪽이라, 사람들이 중요한 자리에 먼저 떠올립니다.'
    ],
    인성: [
      '이해하고 정리한 뒤에 움직이며, 한번 자기 것으로 만든 것은 오래 갑니다.',
      '배운 것을 곧바로 쓰기보다 한 번 소화해 자기 방식으로 바꾸는 편입니다.'
    ]
  };

  var FIELD = {
    비겁: '사람과 몫', 식상: '표현과 결과물', 재성: '돈과 조건', 관성: '일과 책임', 인성: '배움과 정리'
  };

  var STAGE = {
    teen: '지금은 무엇을 오래 할지 정하는 일이 성과보다 중요한 시기입니다.',
    twenties: '지금은 경력을 쌓는 시기라, 자리를 넓히기보다 한 가지를 깊게 파는 쪽이 남습니다.',
    thirties: '지금은 일과 가정이 함께 자리를 잡는 시기라, 속도보다 오래 갈 구조를 만드는 쪽이 중요합니다.',
    forties: '지금은 해 온 일이 결과로 드러나는 시기라, 새로 벌이기보다 쌓인 것을 정리해 값으로 바꾸는 일이 중요합니다.',
    fifties: '지금은 자기 자리를 다지는 시기라, 넓히기보다 깊이를 더하는 쪽이 오래 갑니다.',
    sixties: '지금은 하던 일의 속도를 조금 늦추고, 남길 것을 고르는 시기입니다.',
    elder: '지금은 하던 일을 조금씩 내려놓고 남길 것을 고르는 시기입니다.'
  };

  var DAEUN_LINE = {
    비겁: '내 몫과 내 사람을 다시 세우는, 내 기준이 분명해지는 시기입니다',
    식상: '만들어 온 것을 밖으로 꺼내 보이는 시기입니다',
    재성: '수입과 지출의 구조가 현실로 드러나는 시기입니다',
    관성: '맡은 자리와 책임이 커지는 시기입니다',
    인성: '배우고 정리하며 안을 채우는 시기입니다'
  };

  var TEEN_DAEUN = {
    비겁: '친구와 자기 자리를 만들어 가는, 내 기준이 분명해지는 시기입니다',
    식상: '하고 싶은 것을 밖으로 꺼내 보는 시기입니다',
    재성: '쓰는 것과 남기는 것의 차이를 배우는 시기입니다',
    관성: '맡은 자리와 책임이 늘어나는 시기입니다',
    인성: '배우고 정리하는 힘이 자라는 시기입니다'
  };

  var SEUN_LINE = {
    비겁: '사람을 새로 들이고 몫을 나누는 일이 늘어납니다',
    식상: '안에 두었던 것을 밖으로 꺼내야 하는 해입니다',
    재성: '들어오고 나가는 돈을 다루는 일이 늘어납니다',
    관성: '맡는 일이 무거워지는 해입니다',
    인성: '배운 것이 힘이 되는 해입니다'
  };

  /* 2027년 정미년 천간이 주는 십성 — 기회의 장면 */
  var SEUN_SCENE = {
    비견: '내년에는 비슷한 일을 하는 사람이 먼저 손을 내미는 자리에서 기회가 열립니다. 함께 하자는 제안이 오면 그 자리가 신호입니다.',
    겁재: '내년의 기회는 나란히 서는 자리에 있습니다. 같은 분야의 사람과 견주어지는 순간, 그동안 쌓은 실력이 드러납니다.',
    식신: '만들어 둔 것을 평가받는 자리에서 기회가 열립니다. “그거 좀 해 줄 수 있어요”라는 연락이 그 신호입니다.',
    상관: '답답했던 규칙을 바꾸자는 이야기가 나오면, 그 자리가 내년의 기회입니다. 말을 아끼지 않을 때 자리가 열립니다.',
    편재: '새로운 거래나 예상하지 못한 수입의 제안이 들어옵니다. 돈이 한 방향으로만 흐르지 않는 해입니다.',
    정재: '해 온 일이 열매로 바뀌는 자리입니다. 이어지는 계약이나 정기적인 의뢰가 그 신호입니다.',
    편관: '책임이 갑자기 커지는 자리가 기회입니다. 어려운 일을 맡는 순간이 다음 자리로 가는 문이 됩니다.',
    정관: '자격, 계약, 직함처럼 문서로 남는 일이 들어옵니다. 공식적인 자리에서 인정받는 해입니다.',
    편인: '낯선 분야에서 답이 보입니다. 우연히 본 자료나 오래 미뤄 둔 공부가 실마리가 됩니다.',
    정인: '도움을 받아들이는 것이 실력이 되는 해입니다. 배움, 자격, 멘토의 조언이 곧 힘이 됩니다.'
  };

  var AREA = {
    work: {
      title: '일과 수입의 기반', focus: '일의 기반부터', group: '관성',
      how: '일의 범위를 넓히기보다, 이미 맡고 있는 일에서 확실한 결과를 남기는 쪽이 좋습니다. 2027년에는 구두로 정한 일이 실제 수입으로 이어지는 자리라, 약속은 그날 안에 글로 남겨 두시기 바랍니다.',
      advice: '새로 벌일 일은 하나로 제한하시고, 그 하나의 마감을 지키는 데 힘을 모으시면 좋겠습니다.'
    },
    money: {
      title: '돈의 흐름과 지출 구조', focus: '돈의 흐름부터', group: '재성',
      how: '버는 방법을 늘리기보다 나가는 돈의 구조를 먼저 정리하는 쪽이 실속 있습니다. 정기적으로 빠져나가는 돈을 한 번에 훑어보고, 남길 것과 끊을 것을 나눠 두시면 흐름이 훨씬 가벼워집니다.',
      advice: '큰 지출은 수입이 확인된 뒤로 미루시는 편이 좋겠습니다.'
    },
    relation: {
      title: '관계의 거리와 경계', focus: '사람과의 거리부터', group: '비겁',
      how: '사람을 더 만나는 일보다, 이미 인연이 닿은 사람과의 거리를 다시 정하는 쪽이 중요합니다. 부탁을 받았을 때 바로 답하지 않고 하루를 두면, 지킬 수 있는 약속만 남습니다.',
      advice: '지킬 수 있는 부탁만 받으시고, 무리한 약속은 그 자리에서 정중히 미루시기 바랍니다.'
    },
    family: {
      title: '가까운 사람과의 시간', focus: '가까운 사람과의 시간부터', group: '인성',
      how: '바깥 성과보다 가까운 사람과의 시간을 먼저 챙기는 쪽이 좋습니다. 함께 있는 시간의 길이보다, 그 시간에 무엇을 나누는지가 오래 남습니다.',
      advice: '한 주에 한 번은 마음을 나누는 자리를 정해 두시기 바랍니다.'
    },
    health: {
      title: '건강과 생활 리듬', focus: '몸의 리듬부터', group: '',
      how: '일을 더 잘하기 위한 조건을 만드는 쪽, 곧 잠과 식사와 몸의 리듬을 먼저 세우는 일입니다. 리듬이 잡히면 판단이 흔들리는 폭도 함께 줄어듭니다.',
      advice: '잠드는 시각을 먼저 고정하시고, 늦은 일은 다음 날로 넘기시기 바랍니다.'
    },
    study: {
      title: '배움과 정리의 시간', focus: '배움과 정리부터', group: '인성',
      how: '새로 배우기보다 이미 아는 것을 정리해 자기 것으로 만드는 쪽이 좋습니다. 배운 것을 한 편의 글로 남기면, 그것이 다음 자리에서 바로 쓰입니다.',
      advice: '2027년 안에 아는 것 하나를 남에게 보여 줄 수 있는 형태로 정리해 두시기 바랍니다.'
    },
    express: {
      title: '표현과 결과물', focus: '꺼내 놓는 일부터', group: '식상',
      how: '완성도를 높이는 것보다 지금 가진 것을 먼저 내놓는 쪽이 유리합니다. 반응을 받아야 다음이 보이기 때문입니다.',
      advice: '2027년 안에 하나를 세상에 꺼내 놓으시기 바랍니다.'
    }
  };

  /* 강점이 지나칠 때의 모습 + 조절법 + 실천을 한 묶음으로 둔다 —
     셋이 서로 다른 이야기를 하면 글이 흔들린다. */
  var SHADOW = {
    비겁: [
      { bad: '혼자 결론을 내고 나서 주변에 알리는 쪽으로 기웁니다', fix: '결정하기 전에 한 사람에게 먼저 말해 두시면 충분합니다.', act: '중요한 결정을 내리기 전에 신뢰하는 사람 한 명에게 먼저 의견을 물어보시기 바랍니다.' },
      { bad: '도움을 청하기보다 끝까지 혼자 해내려는 쪽으로 기웁니다', fix: '“같이 봐 줄 수 있나” 한마디를 먼저 꺼내 보시기 바랍니다.', act: '도움을 청할 사람 한 명을 정해, 구체적인 부탁을 한 번 해 보시기 바랍니다.' }
    ],
    식상: [
      { bad: '하고 싶은 말이 먼저 나와, 관계가 상한 뒤에 후회하는 자리가 생깁니다', fix: '말을 꺼내기 전에 한 번 다듬어, 근거 한 줄과 함께 전하시기 바랍니다.', act: '말로 할 일과 글로 남길 일을 나누고, 감정이 실린 말은 하루 뒤에 전하시기 바랍니다.' },
      { bad: '시작은 빠른데 마무리가 늦어, 벌여 둔 일이 겹칠 때가 있습니다', fix: '벌여 둔 일에는 끝낼 날을 먼저 정해 두시기 바랍니다.', act: '하고 싶은 일이 생기면 시작 전에 끝낼 날을 달력에 먼저 적어 두시기 바랍니다.' }
    ],
    재성: [
      { bad: '성과를 먼저 보다 사람의 마음을 놓치는 자리가 생깁니다', fix: '결과를 말하기 전에 과정을 한 번 물어보시기 바랍니다.', act: '일이 끝나면 함께한 사람에게 먼저 고맙다는 말을 전하시기 바랍니다.' },
      { bad: '실속을 따지다 보면 정작 필요한 사람을 놓칠 때가 있습니다', fix: '실속을 따지기 전에 상대의 형편을 한 번 짚어 보시기 바랍니다.', act: '큰돈이 오갈 때는 들어오는 날과 나가는 날을 함께 적어 두시기 바랍니다.' }
    ],
    관성: [
      { bad: '책임을 먼저 떠안고 정작 자기 몫은 뒤로 미루게 됩니다', fix: '맡을 일과 맡기지 않을 일을 종이에 나눠 적어 두시기 바랍니다.', act: '맡은 일의 마감을 달력에 먼저 표시하고, 하나가 끝나면 다음을 시작하시기 바랍니다.' },
      { bad: '쉬어야 할 때도 몸이 먼저 움직입니다', fix: '하루 중 아무것도 하지 않는 시간을 먼저 정해 두시기 바랍니다.', act: '하루 일정에 아무 일도 넣지 않는 시간을 먼저 넣어 두시기 바랍니다.' }
    ],
    인성: [
      { bad: '준비가 끝날 때까지 결정을 미루는 쪽으로 기웁니다', fix: '완성되지 않아도 초안을 먼저 꺼내 놓으시기 바랍니다.', act: '배운 것을 한 장으로 요약해 누군가에게 설명해 보시기 바랍니다.' },
      { bad: '생각이 길어져, 시작할 때쯤에는 때가 지나 있기도 합니다', fix: '결정할 시한을 먼저 정해 두고, 그 날짜에는 정하시기 바랍니다.', act: '결정할 일이 생기면 그날 안에 답을 정해 두시기 바랍니다.' }
    ]
  };

  var ACT2 = {
    목: '아침에 15분 정도 밖을 걸으며 그날의 순서를 정하시기 바랍니다.',
    화: '햇빛을 보고, 고마운 일 하나를 그날 안에 말로 전하시기 바랍니다.',
    토: '자는 시간과 먹는 시간을 한 주만 같은 시각으로 맞춰 보시기 바랍니다.',
    금: '안 쓰는 물건이나 정기 결제 하나를 정리하고 끝을 표시해 두시기 바랍니다.',
    수: '잠들기 전 10분, 화면을 내려놓고 오늘을 한 줄로 적어 보시기 바랍니다.'
  };

  var ACT3 = {
    비겁: '도움을 청할 사람을 한 명 정해, 구체적인 부탁을 한 번 해 보시기 바랍니다.',
    식상: '만들어 둔 것 하나를 정해, 상반기 안에 누군가에게 보여 주시기 바랍니다.',
    재성: '한 해 동안 들어오고 나가는 돈을 한 장에 적어, 남는 구조를 눈으로 확인해 보시기 바랍니다.',
    관성: '2027년에 맡은 일 하나를 문서로 정리해, 다음 사람이 이어받을 수 있게 남기시기 바랍니다.',
    인성: '미뤄 둔 공부나 자격 하나를 다시 펴서 이번 해에 끝내시기 바랍니다.'
  };

  var CORE = {
    비겁: ['한번 마음먹은 일을 오래 끌고 가는 힘', '여럿이 흔들릴 때 중심을 잡는 힘'],
    식상: ['자기 생각을 자기 말로 풀어내는 힘', '보고 느낀 것을 자기 언어로 바꾸는 힘'],
    재성: ['현실의 형편을 읽고 결정하는 감각', '조건을 따져 현실적인 답을 찾는 감각'],
    관성: ['맡은 자리를 끝까지 지키는 힘', '한번 맡은 일을 끝까지 매듭짓는 힘'],
    인성: ['이해한 것을 오래 자기 것으로 만드는 힘', '깊이 이해하고 정리하는 힘']
  };

  var SEUN_GIFT = {
    비겁: '사람과 몫을 다시 나누는 해입니다',
    식상: '안에 두었던 것을 밖으로 꺼내는 해입니다',
    재성: '해 오신 일이 값으로 바뀌는 해입니다',
    관성: '맡은 자리를 단단히 하는 해입니다',
    인성: '배운 것을 정리해 남기는 해입니다'
  };

  var S5_LINE = {
    비겁: ['그 힘은 사람이 여럿 모인 자리에서 더 분명해집니다.', '그 힘은 한번 신뢰를 얻으면 오래가는 데서 드러납니다.'],
    식상: ['그 힘은 만들어 낸 것을 통해 사람과 이어지는 데서 드러납니다.', '그 힘은 말로 사람의 마음을 움직이는 자리에서 드러납니다.'],
    재성: ['그 힘은 현실의 숫자를 다루는 자리에서 드러납니다.', '그 힘은 복잡한 조건을 정리하는 데서 드러납니다.'],
    관성: ['그 힘은 어려운 자리를 맡아 끝내는 데서 드러납니다.', '그 힘은 끝까지 책임지는 사람 곁에 사람이 모이는 데서 드러납니다.'],
    인성: ['그 힘은 서두르지 않고 깊이 만드는 데서 드러납니다.', '그 힘은 한 번 이해한 것을 오래 꺼내 쓰는 데서 드러납니다.']
  };

  function hasJong(w) {
    var s = String(w || '');
    if (!s) return false;
    var c = s.charCodeAt(s.length - 1);
    if (c < 0xAC00 || c > 0xD7A3) return false;
    return (c - 0xAC00) % 28 !== 0;
  }
  function withJosa(w, yes, no) { return w + (hasJong(w) ? yes : no); }
  function hashOf(str) {
    var h = 5381;
    str = String(str || '');
    for (var i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
    return h;
  }
  function pick(arr, a, salt) {
    if (!arr || !arr.length) return '';
    return arr[(hashOf((a && a.key || '') + '|' + salt) >>> 6) % arr.length];
  }

  /* ── 영역 고르기 ───────────────────────────────────── */
  function pickArea(a) {
    var g = a.ten, y = a.yong, se = a.seunGroup, du = a.duGroup, age = a.iAge;
    var S = {
      work: g['관성'] * 1.1 + g['재성'] * 0.45 + (y === '관성' ? 2.4 : 0) + (se === '관성' ? 2.2 : 0) + (du === '관성' ? 1.5 : 0) + (age >= 30 && age < 65 ? 1.0 : 0),
      money: g['재성'] * 1.25 + (y === '재성' ? 2.4 : 0) + (se === '재성' ? 2.2 : 0) + (du === '재성' ? 1.4 : 0) + (a.rooted['재성'] && a.rooted['재성'].solid ? 0.8 : -0.6) + (age >= 35 ? 0.6 : 0),
      relation: g['비겁'] * 0.85 + (y === '비겁' ? 2.0 : 0) + (se === '비겁' ? 2.0 : 0) + (du === '비겁' ? 1.2 : 0) + (a.dayRel === '충' ? 1.1 : 0) + (a.dayRel === '합' ? 0.7 : 0),
      family: g['인성'] * 0.7 + (y === '인성' ? 1.4 : 0) + (age >= 55 ? 1.5 : 0) + (a.temp === '한랭' ? 0.4 : 0),
      health: (a.temp === '조열' || a.temp === '한랭' ? 1.8 : 0) + (g['비겁'] > g['식상'] + g['재성'] ? 0.8 : 0) + (age >= 60 ? 2.2 : 0) + (age >= 68 ? 2.0 : 0) + (a.ratioS < 0.42 || a.ratioS > 0.66 ? 0.9 : 0),
      study: g['인성'] * 1.1 + (y === '인성' ? 2.2 : 0) + (se === '인성' ? 2.0 : 0) + (du === '인성' ? 1.2 : 0) + (age < 30 ? 1.2 : 0),
      express: g['식상'] * 1.2 + (y === '식상' ? 2.2 : 0) + (se === '식상' ? 2.0 : 0) + (du === '식상' ? 1.2 : 0)
    };
    /* 태어난 달의 자리와 같은 영역은 한 번 더 본다 — 해석의 근거가 서도록 */
    var mg = a.has.month ? groupOfTen(a.has.month.hidden[0].ten) : '';
    var areaGroup = { work: '관성', money: '재성', relation: '비겁', family: '인성', health: '', study: '인성', express: '식상' };
    ['work', 'money', 'relation', 'family', 'health', 'study', 'express'].forEach(function (k) {
      if (mg && areaGroup[k] && areaGroup[k] === mg) S[k] += 1.4;
    });
    /* 나이가 많을수록 건강·가족을 조금 더 본다 */
    if (age >= 70) { S.health += 1.0; S.family += 0.6; S.work -= 1.2; }
    if (age >= 75) { S.health += 2.0; S.family += 0.8; S.relation -= 1.0; S.work -= 1.0; }
    if (age < 20) { S.work -= 3.0; S.money -= 3.0; S.study += 2.5; S.express += 1.0; S.family += 0.5; }
    if (age >= 20 && age < 24) { S.work -= 1.0; S.money -= 0.8; S.study += 1.0; }
    var best = 'work', bv = -99;
    ['work', 'money', 'relation', 'family', 'health', 'study', 'express'].forEach(function (k) {
      if (S[k] > bv) { bv = S[k]; best = k; }
    });
    return best;
  }

  /* 영역을 고른 이유 — 두 문단으로 나눠 읽기 쉽게 돌려준다 */
  function whyArea(key, a) {
    var A = AREA[key];
    var mGroup = a.has.month ? groupOfTen(a.has.month.hidden[0].ten) : '';
    var mField = mGroup ? FIELD[mGroup] : '';
    var dField = a.duGroup ? FIELD[a.duGroup] : '';
    var sField = FIELD[a.seunGroup] || '새로운 일';
    var base = mField
      ? '태어난 달이 ' + mField + ' 쪽에 서 있어, 삶의 중심이 늘 그 자리에 놓여 있었습니다.'
      : '사주에서 가장 두터운 자리가 ' + FIELD[a.domGroup] + ' 쪽입니다.';
    var same = (A.group && mGroup === A.group);
    var now;
    if (dField && sField === dField) now = '지금의 10년과 2027년이 모두 ' + sField + ' 쪽으로 흐릅니다. ';
    else if (dField) now = '지금의 10년은 ' + dField + ' 쪽으로 가고, 2027년에는 ' + withJosa(sField, '이', '가') + ' 들어옵니다. ';
    else now = '2027년에는 ' + withJosa(sField, '이', '가') + ' 들어옵니다. ';

    if (key === 'health') {
      var t = a.temp === '조열' ? '열이 많고 마르기 쉬운 사주' : (a.temp === '한랭' ? '차고 가라앉기 쉬운 사주' : '기운이 안으로 모이는 사주');
      return [t + '라, 몸의 리듬이 모든 일의 바탕이 되어야 하는 구조입니다.',
        now + '2027년에는 몸을 먼저 세우는 쪽이 다른 일을 앞당깁니다.'];
    }
    if (key === 'family') {
      return ['가까운 사람을 챙기는 자리가 사주 안에 늘 있었습니다.',
        now + '2027년에는 바깥보다 안을 먼저 보실 때입니다.'];
    }
    if (same) {
      return [base, now + pick([
        '그 가운데 2027년에는 이 자리를 한 번 정리해 두시면 좋겠습니다.',
        '그래도 2027년에는 이 자리를 한 번 매듭지어 두실 때입니다.',
        '그 가운데 이 자리를 2027년에 한 번 정리해 두시면 다음이 가벼워집니다.'
      ], a, 'same')];
    }
    var need = (A.group && A.group === a.yong);
    return [base, now + (need
      ? '무엇보다 이 자리가 지금 사주에 힘을 보태는 곳이라, 2027년에는 그 중심을 ' + A.title + ' 쪽으로 옮겨 잡으실 때입니다.'
      : '그래서 2027년에는 그 중심을 ' + A.title + ' 쪽으로 옮겨 잡으실 때입니다.')];
  }

  function monthLine(a) {
    var m = a.goodMonths;
    if (!m.length) return '';
    var tail = pick(['그 무렵에 맞춰 준비해 두시면 훨씬 수월합니다.', '그때를 기준으로 일정을 잡아 두시면 마음이 덜 급합니다.', '그 무렵에 미뤄 둔 일을 꺼내 놓으시면 속도가 붙습니다.'], a, 'mt' + m.join('-'));
    if (m.length === 1) return '흐름을 보면 ' + m[0] + '월에 힘이 실리는 자리가 있습니다. ' + tail;
    return '흐름을 보면 ' + m[0] + '월과 ' + m[1] + '월에 힘이 실리는 자리가 있습니다. ' + tail;
  }

  function relLine(a) {
    var r = a.dayRel;
    if (r === '충') return pick([
      '삶의 중심이 되는 자리가 내년의 기운과 부딪히는 해라, 사람과 일이 한 번 정리되는 순간이 옵니다. 그때는 **큰 결정을 그날 하지 마시고 하루를 두고 다시 보시기 바랍니다.**',
      '내년에는 살던 자리가 한 번 흘어지는 때가 있습니다. 사람이 정리되거나 하던 일이 바뀌는 자리에서는 **서두르지 마시고 하루를 두고 다시 보시기 바랍니다.**'
    ], a, 'rel');
    if (r === '합') return pick([
      '삶의 중심이 되는 자리가 내년의 기운과 합을 이루는 해라, 사람을 통해 일이 풀립니다. **미뤄 둔 연락 한 통을 먼저 보내 보시기 바랍니다.**',
      '내년에는 사람을 통해 일이 풀리는 자리가 열립니다. **먼저 손 내미는 쪽이 유리하니, 미뤄 둔 연락을 한 통 보내 보시기 바랍니다.**'
    ], a, 'rel');
    if (r === '형') return pick([
      '삶의 중심이 되는 자리가 내년의 기운과 형을 이루는 해라, 익숙한 방식이 통하지 않는 순간이 옵니다. **중요한 일은 한 번 더 확인하고 진행하시기 바랍니다.**',
      '내년에는 늘 하던 방식이 어긋나는 순간이 생깁니다. **같은 일을 한 번 더 확인하고, 달라진 조건을 먼저 살피시기 바랍니다.**'
    ], a, 'rel');
    if (a.duRel === '충') {
      return '10년의 흐름이 삶의 중심과 부딪히는 자리라, 버티기보다 정리하는 쪽이 편합니다. **오래 미뤄 둔 일 하나를 2027년에 마무리하시기 바랍니다.**';
    }
    return pick([
      '삶의 중심이 되는 자리는 내년의 기운과 크게 부딪히지 않아, 기회가 저절로 찾아오기보다는 만들어 가는 쪽입니다. **한 해 동안 하나를 꾸준히 이어 가시는 쪽이 좋겠습니다.**',
      '2027년은 크게 흔들리는 해가 아니라, 쌓은 것을 이어 가기 좋은 해입니다. **한 해 동안 하나를 정해 꾸준히 이어 가시기 바랍니다.**'
    ], a, 'rel');
  }

  function situationLine(a) {
    var r = a.dayRel;
    if (r === '충') return pick([
      '일과 사람이 정리되는 해에는 마음이 급해져, 이 방식이 더 세게 나옵니다.',
      '사람이 바뀌고 일이 바뀌는 자리에서, 이 방식이 먼저 드러납니다.'
    ], a, 'sit');
    if (r === '합') return pick([
      '가까운 사람과의 일이 늘어나는 해에는, 이 방식이 관계에서 드러납니다.',
      '사람과 가까워질수록, 이 방식이 더 분명해집니다.'
    ], a, 'sit');
    if (r === '형') return pick([
      '방식이 어긋나는 해에는, 이 방식이 오히려 더 굳습니다.',
      '익숙한 방법이 통하지 않을 때, 이 방식으로 돌아가게 됩니다.'
    ], a, 'sit');
    return pick([
      '일이 무리 없이 풀리는 해에는, 이 방식이 더 편해져 굳어지기 쉽습니다.',
      '일이 술술 풀릴 때일수록, 이 방식을 바꿀 이유를 느끼지 못합니다.'
    ], a, 'sit');
  }

  function act3Of(a) {
    if (a.iAge >= 68) return '무리한 일정은 미리 비워 두고, 몸이 회복할 시간을 먼저 확보하시기 바랍니다.';
    if (a.iAge < 20) return '2027년에 남길 결과물 하나를 정해, 끝까지 마무리해 보시기 바랍니다.';
    return ACT3[a.seunGroup] || '2027년 안에 하나를 정해 끝까지 마무리하시기 바랍니다.';
  }

  /* ── 감정서 조립 ───────────────────────────────────── */
  function make(s) {
    var a = analyze(s);
    if (!a) return '';
    var nm = a.name || '고객';
    var nim = nm + ' 님';
    var L = [];

    L.push('『윤이세가 직접 전하는 2027년 맞춤 운세 활용 가이드』');
    L.push('');
    L.push(nim + '을 위한 개인 맞춤 감정서');
    L.push('');
    L.push('안녕하세요, ' + nim + '. 윤이세입니다.');
    L.push('');

    /* ── 도입 1 — 전체 흐름과 강점 ── */
    var strong = (a.level === '신강' || a.level === '태강');
    var fact = '';
    if (strong && a.rooted['재성'] && a.rooted['재성'].solid) fact = '재물을 보는 눈이 실제 결과로 이어지는 구조도 함께 있습니다.';
    else if (a.rooted['관성'] && a.rooted['관성'].expose) fact = '책임지는 자리가 삶의 중심에 놓여 있습니다.';
    else if (a.gyeokGroup === '식상') fact = '표현이 곧 생활의 통로가 되는 흐름입니다.';
    else if (a.ten['인성'] >= 2.6) fact = '배운 것이 오래 남아 뒤로 갈수록 힘이 되는 구조입니다.';
    else if (a.dayRel === '충') fact = '다만 안쪽이 자주 흔들리는 자리가 있어, 결정을 서두를 때 손해를 보기 쉽습니다.';
    else if (a.dayRel === '합') fact = '사람과의 인연이 일의 통로가 되는 구조입니다.';
    else fact = '크게 튀는 자리 없이 자기 몫을 고르게 쓰는 구조입니다.';
    L.push(nim + '의 사주를 ' + (a.hasTime ? '여덟 글자 전체로' : '세 기둥으로') + ' 놓고 살펴보면, ' + LEV[a.level] + '. ' +
      pick(DOM_LINE[a.domGroup], a, 'dom') + ' ' + fact);

    /* ── 도입 2 — 살아가는 방식과 생애 단계 ── */
    var approach;
    if (strong) {
      approach = pick([
        '살아가는 방식도 그 흐름을 닮아, 결정을 남에게 미루기보다 스스로 정하고 결과까지 감당하는 쪽을 택하십니다. 그래서 맡은 일이 늘어나도 쉽게 내려놓지 못합니다.',
        '혼자 판단하고 혼자 책임지는 쪽이 편한 분입니다. 그래서 힘든 일도 말없이 넘기고, 나중에야 주변에서 알게 됩니다.'
      ], a, 'app');
    } else if (a.level === '중화') {
      approach = pick([
        '상황을 읽고 균형을 잡는 감각이 좋아, 급한 자리에서도 크게 흔들리지 않습니다. 다만 스스로를 앞세우는 일이 적어, 실력에 비해 이름이 늦게 붙는 경우가 있습니다.',
        '주변과 자기 사이에서 균형을 잡는 감각이 좋습니다. 다만 양쪽을 다 보려다 정작 자기 몫을 뒤로 미룰 때가 있습니다.'
      ], a, 'app');
    } else {
      approach = pick([
        '주변의 흐름과 사람을 살핀 뒤에 움직이는 편입니다. 그래서 준비가 길어지고, 마음이 정해져도 말이 늦어질 때가 있습니다.',
        '여건과 사람을 먼저 살피고, 준비가 갖춰졌을 때 움직이는 편입니다. 그래서 시작이 늦어 보여도 한번 시작하면 오래 갑니다.'
      ], a, 'app');
    }
    L.push(approach + ' ' + (STAGE[a.stage] || ''));

    /* ── 도입 3 — 지금의 10년과 2027년의 초점 ── */
    var areaKey = pickArea(a);
    var A = AREA[areaKey];
    var p3 = '';
    if (a.du && a.duGroup) {
      var duLine = (a.stage === 'teen' ? (TEEN_DAEUN[a.duGroup] || DAEUN_LINE[a.duGroup]) : DAEUN_LINE[a.duGroup]);
      p3 = pick([
        a.kAge + '세에 열린 10년은 ' + duLine + '. ',
        a.kAge + '세에 들어선 10년을 보면, ' + duLine + '. '
      ], a, 'du');
    } else {
      p3 = '지금은 10년의 흐름이 한 번 바뀌는 자리에 서 있습니다. ';
    }
    p3 += pick([
      '그 위에 2027년 정미년이 ' + FIELD[a.seunGroup] + '의 자리로 들어오면서, ' + SEUN_LINE[a.seunGroup] + '.',
      '2027년 정미년은 ' + FIELD[a.seunGroup] + '의 자리라, ' + SEUN_LINE[a.seunGroup] + '.'
    ], a, 'seun');
    p3 += ' 그래서 내년에는 ' + A.focus + ' 살펴보시면 좋겠습니다.';
    L.push(p3);
    L.push('');

    /* ── 1. 영역 ── */
    L.push('1. 2027년 가장 집중해야 할 인생 영역 1가지');
    L.push('');
    var wy = whyArea(areaKey, a);
    L.push('2027년에 가장 힘을 모으실 곳은 **' + A.title + '**입니다. ' + wy[0]);
    L.push(wy[1]);
    L.push(A.how + ' **' + A.advice + '**');
    L.push('');

    /* ── 2. 기회 ── */
    L.push('2. 나에게 기회가 되는 상황과 활용 방법');
    L.push('');
    var scene = SEUN_SCENE[a.seunTen] || SEUN_SCENE['정인'];
    if (!/^(내년|2027년)/.test(scene)) scene = '2027년에는 ' + scene;
    L.push(scene);
    L.push(relLine(a));
    var ml = monthLine(a);
    if (ml) L.push(ml);
    L.push('');

    /* ── 3. 주의할 행동 패턴 ── */
    L.push('3. 반복적으로 주의해야 할 나의 행동 패턴');
    L.push('');
    var sh = pick(SHADOW[a.domGroup] || SHADOW['인성'], a, 'shadow');
    L.push(pick([
      '강점이 지나칠 때 나타나는 방식부터 짚어 보겠습니다. ',
      '한 사람의 장점은 때로 같은 자리에서 걸림돌이 됩니다. ',
      '같은 방식이 해가 되는 순간이 있습니다. '
    ], a, 'ovopen') + nim + '은 ' + sh.bad + '.');
    L.push(situationLine(a) + ' 이때는 **' + sh.fix + '**');
    L.push('');

    /* ── 4. 실천 3가지 ── */
    L.push('4. 2027년을 위한 실천 조언 3가지');
    L.push('');
    var el2 = a.yongEl || '';
    L.push('① ' + sh.act);
    L.push('② ' + (ACT2[el2] || ACT2['토']));
    var act3 = act3Of(a);
    if (act3 === sh.act) act3 = '2027년에 미뤄 둔 일 하나를 정해, 그 일만은 끝까지 마무리하시기 바랍니다.';
    L.push('③ ' + act3);
    L.push('');

    /* ── 5. 응원 메시지 ── */
    L.push('5. 윤이세가 전하는 개인 맞춤 응원 메시지');
    L.push('');
    L.push(nim + '에게는 ' + pick(CORE[a.domGroup] || CORE['인성'], a, 'core') + '이 있습니다. ' + pick(S5_LINE[a.domGroup] || S5_LINE['인성'], a, 's5'));
    var tail = pick(['제가 지켜보겠습니다.', '제가 함께 보겠습니다.', '제가 옆에서 지켜보고 있겠습니다.'], a, 'tail');
    var close;
    if (a.iAge >= 60) {
      close = pick([
        '무리하지 않는 선에서, 하실 수 있는 만큼만 하셔도 충분합니다.',
        '이제는 넓히기보다 남기는 쪽이 편안하니, 하실 수 있는 만큼만 하셔도 됩니다.'
      ], a, 'close') + ' ' + tail;
    } else if (a.stage === 'twenties' || a.stage === 'thirties') {
      close = pick([
        '한 가지만 정해 끝까지 해 보시면, 그 하나가 다음 자리를 열어 줄 것입니다.',
        '벌이기보다 하나를 끝내는 쪽으로 잡으시면 좋겠습니다.'
      ], a, 'close') + ' ' + tail;
    } else {
      close = pick([
        '한 가지만 정해 끝까지 해 보시면 좋겠습니다.',
        '새로 시작하는 것보다 하나를 끝내는 쪽이 남습니다.'
      ], a, 'close') + ' ' + tail;
    }
    L.push('2027년은 ' + SEUN_GIFT[a.seunGroup] + '. ' + close);
    L.push('');
    L.push('— 윤이세');

    return L.join('\n');
  }

  /* 굵게 표시(**)를 지운 고객 전달용 글 */
  function plain(t) {
    return String(t || '')
      .replace(/\*\*/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function check(text) {
    var t = String(text || '');
    return FORBIDDEN.filter(function (w) { return t.indexOf(w) >= 0; });
  }

  global.SpecialGuideDraft = {
    make: make, plain: plain, check: check, FORBIDDEN: FORBIDDEN,
    analyze: analyze,
    TITLES: [
      '1. 2027년 가장 집중해야 할 인생 영역 1가지',
      '2. 나에게 기회가 되는 상황과 활용 방법',
      '3. 반복적으로 주의해야 할 나의 행동 패턴',
      '4. 2027년을 위한 실천 조언 3가지',
      '5. 윤이세가 전하는 개인 맞춤 응원 메시지'
    ]
  };
})(typeof window !== 'undefined' ? window : globalThis);

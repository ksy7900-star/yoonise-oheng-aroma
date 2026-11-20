/*!
 * 윤이세 타이밍 캘린더 — 명리 관계·처방 코어
 * 기반: assets/manse.js (KASI 대조 완료 만세력 엔진) + vendor/lunar.js
 *
 * 원칙
 *  - 모든 판정은 내 원국(일간·일지·월지)과 그날 일진의 실제 관계로만 계산한다.
 *  - 색 배지 4색 5단어: 럭키(금) / 입단속(적) / 결정·머니(청) / 리셋(회)
 *  - 배지는 '진짜 강한 날·내게 반가운 날'에만 붙인다(2026-11-20 김나영 님 지시 #9029 #9057 #9069).
 *    한 달의 절반 이상은 배지 없는 잔잔한 날로 남기는 것이 목표.
 *    · 입단속 = 일지 충 · 일지 형 · 월지 충  (일지 해·월지 형·월지 해는 기록만)
 *    · 럭키 = 천을귀인(충·형 날 제외) · 합화 오행이 내 원국에 부족한 육합·삼합 (천간합·반합은 기록만)
 *    · 결정·머니 = 원국에 1개 이하로 모자란 인성·재성이 일진 천간·지지로 채워질 때만 (인성·재성 무조건 배지 금지)
 *    · 리셋 = 월건이 바뀌는 12절만 (중기는 기록만)
 *  - 처방 문구는 미리 써 둔 표에서 고른다(즉석 생성하지 않음). 같은 날은 항상 같은 문구.
 *  - 계산은 브라우저 안에서만. 어디로도 전송하지 않는다.
 */
(function (global) {
  'use strict';

  var M = global.Manse;
  if (!M) throw new Error('manse.js가 먼저 로드되어야 합니다.');

  var GAN = M.GAN, ZHI = M.ZHI, HIDDEN = M.HIDDEN, TEN = M.tenGodOf;

  /* ── 명리 상수 ─────────────────────────────────────── */
  // 천을귀인(天乙貴人): 일간 → 귀인 지지 (三命通會)
  var CHEONEUL = [
    [1, 7],   // 甲 → 丑未
    [0, 8],   // 乙 → 子申
    [11, 9],  // 丙 → 亥酉
    [11, 9],  // 丁 → 亥酉
    [1, 7],   // 戊 → 丑未
    [0, 8],   // 己 → 子申
    [1, 7],   // 庚 → 丑未
    [2, 6],   // 辛 → 寅午
    [3, 5],   // 壬 → 卯巳
    [3, 5]    // 癸 → 卯巳
  ];
  // 삼합국
  var SAMHAP = [[8, 0, 4], [11, 3, 7], [2, 6, 10], [5, 9, 1]];
  var SAMHAP_KO = ['신자진 수국', '해묘미 목국', '인오술 화국', '사유축 금국'];
  // 형(刑)
  var HYEONG_G = [[2, 5, 8], [1, 10, 7], [0, 3]];
  var HYEONG_SELF = [4, 6, 9, 11];

  /* ── 내 사주에 필요한 오행 ──────────────────────────
   * 합이든 인성·재성이든 '들어오면 무조건 좋다'가 아니다(2026-11-20 김나영 님 지시 #9057 #9069).
   * 원국 오행 개수를 세어 (1) 아주 적은 오행(scarce)과 (2) 부족한 편인 오행(fills)을 가린다.
   *  - scarce: 원국에서 가장 적은 오행(보통 0~1개) — 기록·설명에 쓸 기준
   *  - fills : 1개 이하로 모자란 오행 — '결정·머니'와 합(육합·삼합)이 이쪽으로 바뀔 때만 '럭키'
   */
  var EL_ORDER = ['목', '화', '토', '금', '수'];
  var EL_OVER = { 목: '토', 화: '금', 토: '수', 금: '목', 수: '화' };     // 내가 극하는 오행 = 재성
  var EL_MOTHER = { 화: '목', 토: '화', 금: '토', 수: '금', 목: '수' };   // 나를 생하는 오행 = 인성

  // 육합(六合) — 짝이 합해서 바뀌는 오행. 자축→토 · 인해→목 · 묘술→화 · 진유→금 · 사신→수 · 오미→화(토)
  var YUKHAP_ELS = {
    0: ['토'], 1: ['토'], 2: ['목'], 3: ['화'], 4: ['금'], 5: ['수'],
    6: ['화', '토'], 7: ['화', '토'], 8: ['수'], 9: ['금'], 10: ['화'], 11: ['목']
  };
  // 삼합국이 완성될 때 바뀌는 오행 (SAMHAP 순서와 같다)
  var SAMHAP_EL = ['수', '목', '화', '금'];

  var CAT = {
    red:  { label: '입단속',   color: '#C0563F', icon: '🔴', order: 0 },
    gold: { label: '럭키',     color: '#C08B32', icon: '🟡', order: 1 },
    blue: { label: '결정·머니', color: '#5C7E9E', icon: '🔵', order: 2 },
    gray: { label: '리셋',     color: '#A9A296', icon: '⚪', order: 3 }
  };

  /* ── 작은 도우미 ───────────────────────────────────── */
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function isoOf(y, m, d) { return y + '-' + pad2(m) + '-' + pad2(d); }
  function parseISO(s) { var p = String(s).split('-'); return { y: +p[0], m: +p[1], d: +p[2] }; }
  function addDays(iso, n) {
    var p = parseISO(iso);
    var t = Date.UTC(p.y, p.m - 1, p.d);
    t += n * 86400000;
    var d = new Date(t);
    return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
  }
  function dowOf(iso) { var p = parseISO(iso); return new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay(); }
  function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
  function zhiFull(i) { return ZHI[i] + '(' + M.ZHI_KO[i] + ')'; }
  function zhiKo(i) { return M.ZHI_KO[i]; }

  function yukhapOf(i) { return (13 - i) % 12; }
  function chungOf(i) { return (i + 6) % 12; }
  function haeOf(i) { return (7 - i + 12) % 12; }
  function isHyeong(a, b) {
    if (a === b && HYEONG_SELF.indexOf(a) >= 0) return true;
    for (var i = 0; i < HYEONG_G.length; i++) {
      var g = HYEONG_G[i];
      if (g.indexOf(a) >= 0 && g.indexOf(b) >= 0 && a !== b) return true;
    }
    return false;
  }
  function samhapGroupOf(i) {
    for (var k = 0; k < SAMHAP.length; k++) if (SAMHAP[k].indexOf(i) >= 0) return k;
    return -1;
  }

  /** 원국 오행 분포에서 '필요한 오행'을 가린다. res.counts = {목·화·토·금·수} */
  function needOf(res) {
    var counts = (res && res.counts) || null;
    if (!counts) return null;
    var me = M.GAN_EL[res.pillars.day.ganIndex];
    var min = 99;
    EL_ORDER.forEach(function (e) { var c = counts[e] || 0; if (c < min) min = c; });
    var scarce = EL_ORDER.filter(function (e) { return (counts[e] || 0) === min; });
    var fills = EL_ORDER.filter(function (e) { return (counts[e] || 0) <= 1; });
    return {
      counts: counts, min: min, scarce: scarce, fills: fills,
      wealthEl: EL_OVER[me], docEl: EL_MOTHER[me]
    };
  }

  /* ── 24절기 ────────────────────────────────────────── */
  // [한자(라이브러리 표기), 한글, 12절 인덱스(월을 여는 절) 또는 -1]
  var TERMS = [
    ['立春', '입춘', 0], ['雨水', '우수', -1],
    ['惊蛰', '경칩', 1], ['春分', '춘분', -1],
    ['清明', '청명', 2], ['谷雨', '곡우', -1],
    ['立夏', '입하', 3], ['小满', '소만', -1],
    ['芒种', '망종', 4], ['夏至', '하지', -1],
    ['小暑', '소서', 5], ['大暑', '대서', -1],
    ['立秋', '입추', 6], ['处暑', '처서', -1],
    ['白露', '백로', 7], ['秋分', '추분', -1],
    ['寒露', '한로', 8], ['霜降', '상강', -1],
    ['立冬', '입동', 9], ['小雪', '소설', -1],
    ['大雪', '대설', 10], ['冬至', '동지', -1],
    ['小寒', '소한', 11], ['大寒', '대한', -1]
  ];

  /** 절기 표: 라이브러리(중국 표준시) → 절대시각 → 한국 표준시 */
  function buildTerms(fromISO, toISO) {
    var byZh = {}, fy = parseISO(fromISO).y, ty = parseISO(toISO).y;
    TERMS.forEach(function (t) { byZh[t[0]] = t; });

    var raw = [], seen = {};
    for (var ly = fy - 1; ly <= ty + 1; ly++) {
      var table;
      try { table = global.Lunar.fromYmd(ly, 6, 1).getJieQiTable(); } catch (e) { continue; }
      for (var zh in byZh) {
        if (!Object.prototype.hasOwnProperty.call(byZh, zh)) continue;
        var s = table[zh];
        if (!s || typeof s.getYear !== 'function') continue;
        var epoch = Date.UTC(s.getYear(), s.getMonth() - 1, s.getDay(), s.getHour() - 8, s.getMinute(), 0);
        var key = zh + '@' + epoch;
        if (seen[key]) continue;
        seen[key] = 1;
        raw.push({ zh: zh, ko: byZh[zh][1], jie: byZh[zh][2], epoch: epoch });
      }
    }
    raw.sort(function (a, b) { return a.epoch - b.epoch; });

    var lichuns = raw.filter(function (t) { return t.zh === '立春'; });
    var byDate = {}, list = [];
    raw.forEach(function (t) {
      var kst = new Date(t.epoch + 9 * 3600 * 1000);
      var y = kst.getUTCFullYear(), mo = kst.getUTCMonth() + 1, d = kst.getUTCDate();
      var iso = isoOf(y, mo, d);
      if (iso < fromISO || iso > toISO) return;
      if (byDate[iso]) return; // 같은 날 두 절기는 없다
      var rec = {
        iso: iso, ko: t.ko, zh: t.zh, jie: t.jie, epoch: t.epoch,
        time: pad2(kst.getUTCHours()) + ':' + pad2(kst.getUTCMinutes()),
        isJie: t.jie >= 0, monthText: '', yearText: ''
      };
      if (t.jie >= 0) {
        var lc = null;
        for (var i = lichuns.length - 1; i >= 0; i--) {
          if (lichuns[i].epoch <= t.epoch + 1000) { lc = lichuns[i]; break; }
        }
        if (lc) {
          var ly2 = new Date(lc.epoch + 9 * 3600 * 1000).getUTCFullYear();
          var yg = ((ly2 - 4) % 10 + 10) % 10;
          var mg = (yg * 2 + 2 + t.jie) % 10;
          var mz = (2 + t.jie) % 12;
          rec.monthText = GAN[mg] + ZHI[mz];
          rec.yearText = M.ganZhiOf(ly2 - 4).text;
        }
      }
      byDate[iso] = rec;
      list.push(rec);
    });
    return { byDate: byDate, list: list };
  }

  /* ── 세운(歲運): 입춘 기준 ───────────────────────────
   * 사주년은 1월 1일이 아니라 입춘 절입 시각에 바뀐다.
   * 2026-02-04 입춘 ~ 2027-02-03 = 병오년, 2027-02-04 입춘 ~ 2028-02-03 = 정미년.
   */
  function saeunOf(iso, terms) {
    if (!terms || !terms.list) return null;
    var lc = null;
    for (var i = 0; i < terms.list.length; i++) {
      var t = terms.list[i];
      if (t.ko === '입춘' && t.iso <= iso) lc = t;   // list 는 날짜 오름차순
    }
    if (!lc) return null;
    var y = parseISO(lc.iso).y;
    var gz = M.ganZhiOf(y - 4);
    return {
      iso: lc.iso, time: lc.time, year: y,
      text: gz.text, textKo: gz.textKo,
      label: gz.textKo + '년(' + gz.text + ')',
      isLichunDay: lc.iso === iso
    };
  }

  /* ── 원국 요약 ─────────────────────────────────────── */
  function natalOf(res) {
    var d = res.pillars.day, mo = res.pillars.month, y = res.pillars.year, t = res.pillars.time;
    var natal = {
      dayGanIndex: d.ganIndex, dayZhiIndex: d.zhiIndex,
      monthZhiIndex: mo.zhiIndex, yearZhiIndex: y.zhiIndex,
      timeZhiIndex: t ? t.zhiIndex : null,
      gan: d.gan, zhi: d.zhi, ganKo: d.ganKo, zhiKo: d.zhiKo,
      element: M.GAN_EL[d.ganIndex],
      pillars: res.pillars, tenGod: res.tenGod, res: res,
      need: null
    };
    natal.need = needOf(res);
    return natal;
  }

  /* ── 그날의 일진·관계·처방 ─────────────────────────── */
  function gzIndexOf(y, m, d) {
    var text = M.dayGanZhiOf(y, m, d);
    for (var i = 0; i < 60; i++) if (M.ganZhiOf(i).text === text) return i;
    return 0;
  }

  function dayInfo(iso, natal, terms) {
    var p = parseISO(iso), y = p.y, m = p.m, d = p.d;
    var idx = gzIndexOf(y, m, d);
    var gz = M.ganZhiOf(idx);
    var lunar = global.Solar.fromYmd(y, m, d).getLunar();
    var lunarText = (lunar.getMonth() < 0 ? '윤' : '') + Math.abs(lunar.getMonth()) + '월 ' + lunar.getDay() + '일';

    var dg = natal.dayGanIndex, dz = natal.dayZhiIndex, mz = natal.monthZhiIndex;
    var tg = gz.ganIndex, tz = gz.zhiIndex;
    var marks = [];
    function add(cat, kind, weight, label, detail, minor) {
      marks.push({ cat: cat, kind: kind, weight: weight, label: label, detail: detail, minor: !!minor });
    }

    var need = natal.need || needOf(natal.res);

    // ── 입단속: 충격이 큰 날만 배지로 ──
    //  배지: 일지 충 · 일지 형 · 월지 충   (2026-11-20 김나영 님 지시 #9057)
    //  배지 없이 기록만: 일지 해 · 월지 형 · 월지 해 — 자리가 살짝 어긋나는 약한 신호
    if (chungOf(tz) === dz) {
      add('red', 'chung', 60, '일지 충', '내 일지 ' + zhiFull(dz) + ' ↔ 일진 ' + zhiFull(tz) + ' — 충(沖), 자리와 관계가 흔들리는 날');
    } else if (chungOf(tz) === mz) {
      add('red', 'chung', 35, '월지 충', '내 월지 ' + zhiFull(mz) + ' ↔ 일진 ' + zhiFull(tz) + ' — 충(沖), 일의 판이 흔들리는 날');
    }
    if (isHyeong(tz, dz)) {
      add('red', 'hyeong', 50, '일지 형', '내 일지 ' + zhiFull(dz) + ' ↔ 일진 ' + zhiFull(tz) + ' — 형(刑), 마찰과 서류의 엉킴');
    } else if (isHyeong(tz, mz)) {
      add('red', 'hyeong', 25, '월지 형', '내 월지 ' + zhiFull(mz) + ' ↔ 일진 ' + zhiFull(tz) + ' — 형(刑), 절차가 꼬이기 쉬운 날 (약한 신호라 배지 없음)', true);
    }
    if (haeOf(tz) === dz) {
      add('red', 'hae', 40, '일지 해', '내 일지 ' + zhiFull(dz) + ' ↔ 일진 ' + zhiFull(tz) + ' — 해(害), 말과 뜻이 엇갈리는 날 (약한 신호라 배지 없음)', true);
    } else if (haeOf(tz) === mz) {
      add('red', 'hae', 20, '월지 해', '내 월지 ' + zhiFull(mz) + ' ↔ 일진 ' + zhiFull(tz) + ' — 해(害), 전달이 어긋나기 쉬운 날 (약한 신호라 배지 없음)', true);
    }
    // 충·형이 걸린 날에는 귀인도 힘을 쓰기 어렵다 — 아래 럭키 판정에서 쓴다
    var hardRed = marks.some(function (mk) { return mk.cat === 'red' && !mk.minor; });

    /* ── 럭키: 내 사주에 반가운 날만 ──
     *  합이 된다고 다 좋은 게 아니다(김나영 님 지시 #9057 #9069).
     *  - 천을귀인: 살리되 일지 충·형이 걸린 날은 띄우지 않는다.
     *  - 천간합: 배지에서 뺀다(기록만).
     *  - 일지 육합·삼합 완성: 합화 오행이 내 원국에 부족한 쪽일 때만. 반합은 기록만.
     */
    function fillsNeed(els) {
      if (!need) return false;
      for (var i = 0; i < els.length; i++) if (need.fills.indexOf(els[i]) >= 0) return true;
      return false;
    }
    if (CHEONEUL[dg].indexOf(tz) >= 0) {
      var gwiyinWhere = '천을귀인(天乙貴人) — 일간 ' + GAN[dg] + '의 귀인 자리 ' +
        CHEONEUL[dg].map(function (i) { return ZHI[i]; }).join('·') + ' 중 ' + zhiFull(tz) + '이 온 날';
      if (hardRed) add('gold', 'gwiyin', 65, '천을귀인', gwiyinWhere + ' — 다만 충·형이 걸려 귀인이 힘을 쓰기 어렵습니다', true);
      else add('gold', 'gwiyin', 65, '천을귀인', gwiyinWhere);
    }
    if ((tg + 5) % 10 === dg) {
      add('gold', 'hap', 45, '천간합',
        '일간 ' + GAN[dg] + ' ↔ 일진 ' + GAN[tg] + ' — 천간합(合), 사람과 일이 붙는 날이지만 합이 늘 좋은 건 아니라 배지로는 띄우지 않습니다', true);
    }
    if (yukhapOf(tz) === dz) {
      var yels = YUKHAP_ELS[tz] || [];
      if (fillsNeed(yels)) {
        add('gold', 'hap', 55, '일지 육합', '내 일지 ' + zhiFull(dz) + ' ↔ 일진 ' + zhiFull(tz) + ' — 육합(六合), ' +
          yels.join('·') + ' 기운으로 합해 내 사주에 모자란 곳을 보태는 날');
      } else {
        add('gold', 'hap', 55, '일지 육합', '내 일지 ' + zhiFull(dz) + ' ↔ 일진 ' + zhiFull(tz) + ' — 육합(六合)이지만 ' +
          yels.join('·') + ' 기운은 내 사주에 이미 넉넉해 배지로 띄우지 않습니다', true);
      }
    } else if (yukhapOf(tz) === mz) {
      add('gold', 'hap', 22, '월지 육합', '내 월지 ' + zhiFull(mz) + ' ↔ 일진 ' + zhiFull(tz) + ' — 육합(六合), 일이 풀리는 날 (약한 신호라 배지 없음)', true);
    }
    var sg = samhapGroupOf(tz);
    if (sg >= 0) {
      var natalZhis = [dz, mz, natal.yearZhiIndex, natal.timeZhiIndex];
      var two = [];
      for (var zi = 0; zi < natalZhis.length; zi++) {
        var z = natalZhis[zi];
        if (z == null || z === tz) continue;
        if (SAMHAP[sg].indexOf(z) >= 0 && two.indexOf(z) < 0) two.push(z);
      }
      if (two.length >= 2) {
        var sEl = SAMHAP_EL[sg];
        if (fillsNeed([sEl])) {
          add('gold', 'hap', 50, '삼합 완성',
            '일진 ' + zhiFull(tz) + ' + 내 ' + two.slice(0, 2).map(zhiFull).join('·') + ' — ' + SAMHAP_KO[sg] +
            ' 삼합이 완성되고 ' + sEl + ' 기운이 내 사주에 모자란 곳을 채우는 날');
        } else {
          add('gold', 'hap', 50, '삼합 완성',
            '일진 ' + zhiFull(tz) + ' + 내 ' + two.slice(0, 2).map(zhiFull).join('·') + ' — ' + SAMHAP_KO[sg] +
            ' 삼합이 완성되지만 ' + sEl + ' 기운은 내 사주에 이미 넉넉해 배지로 띄우지 않습니다', true);
        }
      } else if (two.length === 1) {
        var where = two[0] === dz ? '내 일지 ' : (two[0] === mz ? '내 월지 ' : '내 원국 ');
        add('gold', 'hap', 22, '반합',
          where + zhiFull(two[0]) + ' ↔ 일진 ' + zhiFull(tz) + ' — ' + SAMHAP_KO[sg] + '의 반합 (약한 신호라 배지 없음)', true);
      }
    }

    /* ── 결정·머니: 내 사주에 모자란 인성·재성만 ──
     *  인성·재성이 들어오는 날을 다 '결정·머니'로 띄우면 인성이 이미 넘치는 사주까지 파란 날이 된다(#9057).
     *  원국에 1개 이하로 모자란 오행(fills)이 일진 천간으로 오고, 일진 지지가 그것을 받쳐 줄 때만 배지.
     *  → 인성·재성이 이미 2개 이상 넉넉한 사주엔 그 기운의 날이 배지로 뜨지 않는다.
     */
    var tgName = TEN(dg, tg);
    var tgEl = M.GAN_EL[tg];
    var zEl = M.ZHI_EL[tz];
    var zMainEl = M.GAN_EL[GAN.indexOf(HIDDEN[gz.zhi][0])];
    var isWealth = tgName === '정재' || tgName === '편재';
    var isDoc = tgName === '정인' || tgName === '편인';
    var tgThin = !!(need && need.fills.indexOf(tgEl) >= 0);
    if ((isWealth || isDoc) && tgThin) {
      var whoKo = isDoc ? '인성' : '재성';
      var label = isDoc ? '결정' : '머니';
      var kind = isDoc ? 'doc' : 'wealth';
      var thinCnt = need.counts[tgEl] || 0;
      var thinKo = thinCnt === 0 ? '아예 없던 ' : thinCnt + '개뿐인 ';
      if (zEl === tgEl || zMainEl === tgEl) {
        add('blue', kind, 40, label, '일진 ' + zhiFull(tz) + '의 천간 ' + GAN[tg] + '가 내 사주에 ' + thinKo +
          tgEl + ' 기운을 ' + whoKo + '으로 채우고, 지지도 같은 기운으로 받쳐 주는 날');
      } else {
        add('blue', kind, 25, label, '일진 천간 ' + GAN[tg] + '가 내 사주에 ' + thinKo + tgEl + ' 기운을 ' + whoKo +
          '으로 채우지만 지지가 받쳐 주지 않아 배지로는 띄우지 않습니다', true);
      }
    }

    // ── 리셋: 월건이 실제로 바뀌는 12절(입춘·경칩·청명…)만 ──
    var term = terms && terms.byDate ? terms.byDate[iso] : null;
    var isReset = !!(term && term.isJie);
    if (term) {
      add('gray', 'jie', isReset ? 12 : 6, term.ko,
        term.isJie
          ? term.ko + ' 절입 ' + term.time + ' — ' + (term.monthText ? term.monthText + '월' : '월건') + '이 바뀝니다'
          : term.ko + ' ' + term.time + ' — 24절기의 중기, 달의 기준은 그대로 (배지 없음)',
        !term.isJie);
    }

    // 점: 하루에 1~2개. 강한 신호만 점이 된다(약한 신호는 상세 설명에만)
    var strongRed = marks.some(function (mk) { return mk.cat === 'red' && !mk.minor; });
    var strongGold = marks.some(function (mk) { return mk.cat === 'gold' && !mk.minor; });
    var strongBlue = marks.some(function (mk) { return mk.cat === 'blue' && !mk.minor; });
    var dots = [];
    if (strongRed) dots.push({ cat: 'red' });
    if (strongGold) dots.push({ cat: 'gold' });
    if (!strongRed && !strongGold && strongBlue) dots.push({ cat: 'blue' });

    // 배지: 달력 셀에 바로 보이는 짧은 한글 (하루 최대 2개)
    //  입단속 = 일지 충·형, 월지 충이 걸린 날 / 럭키 = 귀인·내게 맞는 합이 들어온 날
    //  결정·머니 = 비어 있던 인성·재성이 채워지는 날 / 리셋 = 월건이 바뀌는 12절
    var maxWeight = function (cat) {
      var w = 0;
      marks.forEach(function (mk) { if (mk.cat === cat && !mk.minor && mk.weight > w) w = mk.weight; });
      return w;
    };
    var badges = [];
    if (strongRed) badges.push({ cat: 'red', text: '입단속', weight: maxWeight('red') });
    if (strongGold) badges.push({ cat: 'gold', text: '럭키', weight: maxWeight('gold') });
    if (!strongRed && !strongGold && strongBlue) {
      var isDoc = marks.some(function (mk) { return mk.cat === 'blue' && mk.kind === 'doc' && !mk.minor; });
      badges.push({ cat: 'blue', text: isDoc ? '결정' : '머니', weight: maxWeight('blue') });
    }
    if (isReset) badges.push({ cat: 'gray', text: '리셋', weight: 14 });
    var BADGE_ORDER = { red: 0, gold: 1, blue: 2, gray: 3 };
    badges.sort(function (a, b) { return BADGE_ORDER[a.cat] - BADGE_ORDER[b.cat]; });
    if (badges.length > 2) badges = badges.slice(0, 2);

    var headline, tone;
    if (strongRed && strongGold) { headline = '럭키와 입단속이 함께 · 조건 확인하고 움직이기'; tone = 'red'; }
    else if (strongRed) { headline = '입단속 · 결정은 하루 뒤로'; tone = 'red'; }
    else if (strongGold) { headline = '럭키한 날 · 먼저 손 내밀기'; tone = 'gold'; }
    else if (strongBlue) { headline = '결정·문서 체크 · 기록으로 남기기'; tone = 'blue'; }
    else if (isReset) { headline = '리셋 · 새 달의 기준이 서는 날'; tone = 'gray'; }
    else { headline = '잔잔한 날 · 흐름 정리'; tone = 'none'; }

    var lines = prescribe(marks, isReset ? term : null, gz);
    var saeun = saeunOf(iso, terms);

    return {
      iso: iso, y: y, m: m, d: d, dow: dowOf(iso),
      gz: gz, ganEl: M.GAN_EL[gz.ganIndex], zhiEl: M.ZHI_EL[gz.zhiIndex],
      lunarText: lunarText, term: term, saeun: saeun, marks: marks, dots: dots, badges: badges,
      tone: tone, headline: headline, lines: lines,
      tenGod: tgName
    };
  }

  /* ── 월운(月運) 한눈에 — 2027년에 조심할 달 · 치고 나갈 달 ────────────
   * 화면의 '1월'과 사주의 '축월'은 겹쳐 있다. 2027-01-01~01-05는 아직 자월(子月),
   * 01-06 소한부터 축월(丑月). 그래서 달마다 '가장 많은 날을 덮는 월건'을 그 달의 월운으로 본다.
   * 판정은 월건 지지 ↔ 내 일지·월지의 실제 관계(충·형·해·복음·귀인·육합)와
   * 그 달에 깔린 일진 신호(입단속·리셋·럭키·결정·머니)의 빈도만 쓴다.
   * 문장은 미리 써 둔 표에서 고른다 — 같은 사주면 같은 달은 항상 같은 말.
   */
  var MONTH_WARN = {
    chung:   { key: 'chung',   title: '판이 흔들리는 달',      why: '부딪히기 쉬워요 · 계약·이사는 신중히' },
    hyeong:  { key: 'hyeong',  title: '서류·절차가 엉키는 달', why: '확인 또 확인 · 잔금과 약속 정리' },
    bokkeum: { key: 'bokkeum', title: '같은 자리가 겹치는 달', why: '일이 두 번 돌아가요 · 서두르지 말기' },
    hae:     { key: 'hae',     title: '말이 엇갈리는 달',      why: '문자보다 대면 · 부탁은 분명하게' },
    over:    { key: 'over',    title: '기운이 과열되는 달',    why: '지르지 말고 속도 조절' },
    hot:     { key: 'hot',     title: '예민·구설 수 높은 달',  why: '말과 계약 조심 · 감정적 대화 피하기' },
    soft:    { key: 'soft',    title: '잔잔히 흔들리는 달',    why: '중요한 결정은 하루 두고 보기' }
  };
  var MONTH_GOOD = {
    gwiyin: { key: 'gwiyin', title: '귀인이 붙는 달',        why: '먼저 연락하고 부탁하기 좋아요' },
    hap:    { key: 'hap',    title: '사람·일이 붙는 달',      why: '미팅·제안 밀어붙이기 좋아요' },
    fill:   { key: 'fill',   title: '비어 있던 기운이 오는 달', why: '새 시작·새 사람에게 열려 있기' },
    doc:    { key: 'doc',    title: '문서·돈이 트이는 달',    why: '계약·정산·지원서에 힘이 실려요' },
    flow:   { key: 'flow',   title: '럭키가 넉넉한 달',      why: '먼저 손 내밀면 붙는 달' }
  };

  /** 그날이 속한 월건(月建) — 12절기가 달을 연다. */
  function monthGzOf(iso, terms) {
    if (!terms || !terms.list) return null;
    var best = null;
    for (var i = 0; i < terms.list.length; i++) {
      var t = terms.list[i];
      if (!t.isJie || !t.monthText) continue;
      if (t.iso <= iso) best = t;
      else break;                       // list 는 날짜 오름차순
    }
    if (!best) return null;
    var g = GAN.indexOf(best.monthText.charAt(0));
    var z = ZHI.indexOf(best.monthText.charAt(1));
    if (g < 0 || z < 0) return null;
    return {
      text: best.monthText, ganIndex: g, zhiIndex: z, from: best.iso, ko: best.ko,
      gan: GAN[g], zhi: ZHI[z], ganKo: M.GAN_KO[g], zhiKo: M.ZHI_KO[z],
      ganEl: M.GAN_EL[g], zhiEl: M.ZHI_EL[z]
    };
  }

  /** 한 달치 — 주의 날·좋은 날 목록과 월운 관계, 점수, 한 줄 이유 */
  function monthDigest(year, month, natal, terms, opt) {
    opt = opt || {};
    var infoFn = opt.info || function (iso) { return dayInfo(iso, natal, terms); };
    var counts = opt.counts || null;
    var dim = daysInMonth(year, month);
    var dz = natal.dayZhiIndex, mz = natal.monthZhiIndex, dg = natal.dayGanIndex;

    var m = {
      y: year, m: month, days: dim,
      red: 0, gold: 0, blue: 0, gray: 0, redStrong: 0, goldStrong: 0,
      badDays: [], goodDays: [],
      mzText: '', mzKo: '', mzZhi: -1, mzEl: '', elCount: 0,
      chungDay: false, hyeongDay: false, haeDay: false, bokkeum: false,
      chungMonth: false, hyeongMonth: false, haeMonth: false,
      gwiyin: false, yukhapDay: false, over: false, lack: false,
      caution: 0, chance: 0, warn: null, good: null
    };
    var zBag = {};

    for (var d = 1; d <= dim; d++) {
      var iso = isoOf(year, month, d);
      var info = infoFn(iso);
      if (!info) continue;

      var gz = monthGzOf(iso, terms);
      if (gz) {
        var bag = zBag[gz.text] || (zBag[gz.text] = { n: 0, rec: gz });
        bag.n++;
      }

      var badges = info.badges || [];
      var isRed = false, isGray = false, isGold = false, isBlue = false;
      var badTags = [], goodTags = [];
      badges.forEach(function (b) {
        if (b.cat === 'red') { isRed = true; badTags.push('입단속'); }
        else if (b.cat === 'gray') { isGray = true; }        // 리셋(12절)은 중립 — '조심할 날' 목록에는 넣지 않는다
        else if (b.cat === 'gold') { isGold = true; goodTags.push('럭키'); }
        else if (b.cat === 'blue') { isBlue = true; goodTags.push(b.text); }
      });
      if (isRed) m.red++;
      if (isGold) m.gold++;
      if (isBlue) m.blue++;
      if (isGray) m.gray++;

      var strongRed = false, strongGold = false;
      (info.marks || []).forEach(function (k) {
        if (k.minor) return;
        if (k.cat === 'red' && k.weight >= 30) strongRed = true;
        if (k.cat === 'gold' && k.weight >= 40) strongGold = true;
      });
      if (strongRed) m.redStrong++;
      if (strongGold) m.goldStrong++;

      if (badTags.length) m.badDays.push({ iso: iso, d: d, dow: info.dow, tags: badTags });
      if (goodTags.length) m.goodDays.push({ iso: iso, d: d, dow: info.dow, tags: goodTags });
    }

    // 이 달을 가장 많이 덮는 월건
    var top = null;
    for (var k in zBag) {
      if (!Object.prototype.hasOwnProperty.call(zBag, k)) continue;
      if (!top || zBag[k].n > top.n) top = zBag[k];
    }
    var rec = top ? top.rec : null;
    if (rec) {
      m.mzText = rec.text;
      m.mzKo = rec.zhiKo + '월(' + rec.zhi + ')';
      m.mzZhi = rec.zhiIndex;
      m.mzEl = rec.zhiEl;
      m.chungDay = chungOf(rec.zhiIndex) === dz;
      m.hyeongDay = isHyeong(rec.zhiIndex, dz);
      m.haeDay = haeOf(rec.zhiIndex) === dz;
      m.bokkeum = rec.zhiIndex === dz;
      m.chungMonth = chungOf(rec.zhiIndex) === mz;
      m.hyeongMonth = isHyeong(rec.zhiIndex, mz);
      m.haeMonth = haeOf(rec.zhiIndex) === mz;
      m.gwiyin = CHEONEUL[dg].indexOf(rec.zhiIndex) >= 0;
      m.yukhapDay = yukhapOf(rec.zhiIndex) === dz;
      if (counts) {
        m.elCount = counts[rec.zhiEl] || 0;
        m.over = m.elCount >= 3;          // 내 원국에 이미 넘치는 기운이 또 오는 달
        m.lack = m.elCount === 0;         // 비어 있던 기운이 채워지는 달
      }
    }

    m.caution = m.red * 6 + m.redStrong * 5 + m.gray * 2 +
      (m.chungDay ? 36 : 0) + (m.hyeongDay ? 26 : 0) + (m.bokkeum ? 18 : 0) + (m.haeDay ? 14 : 0) +
      (m.chungMonth ? 16 : 0) + (m.hyeongMonth ? 12 : 0) + (m.haeMonth ? 8 : 0) +
      (m.over ? 14 : 0) - (m.gwiyin ? 12 : 0) - (m.yukhapDay ? 8 : 0);
    m.chance = m.gold * 6 + m.goldStrong * 5 + m.blue * 4 +
      (m.gwiyin ? 30 : 0) + (m.yukhapDay ? 22 : 0) + (m.lack ? 9 : 0) -
      (m.chungDay ? 18 : 0) - (m.over ? 10 : 0);

    m.warn = m.chungDay ? MONTH_WARN.chung
      : (m.hyeongDay ? MONTH_WARN.hyeong
      : (m.bokkeum ? MONTH_WARN.bokkeum
      : (m.haeDay ? MONTH_WARN.hae
      : (m.over ? MONTH_WARN.over
      : (m.red >= 9 ? MONTH_WARN.hot : MONTH_WARN.soft)))));
    m.good = m.gwiyin ? MONTH_GOOD.gwiyin
      : (m.yukhapDay ? MONTH_GOOD.hap
      : (m.lack ? MONTH_GOOD.fill
      : (m.blue >= 2 ? MONTH_GOOD.doc : MONTH_GOOD.flow)));

    // 그 달에 해당하는 이유를 순서대로 모아 둠 — 이웃 달과 같은 이유가 겹치지 않게 고를 때 쓴다
    m.warnAll = [];
    if (m.chungDay) m.warnAll.push(MONTH_WARN.chung);
    if (m.hyeongDay) m.warnAll.push(MONTH_WARN.hyeong);
    if (m.bokkeum) m.warnAll.push(MONTH_WARN.bokkeum);
    if (m.haeDay) m.warnAll.push(MONTH_WARN.hae);
    if (m.over) m.warnAll.push(MONTH_WARN.over);
    if (m.red >= 9) m.warnAll.push(MONTH_WARN.hot);
    m.warnAll.push(MONTH_WARN.hot);        // 앞 달과 이유가 겹칠 때의 마지막 안전판
    m.goodAll = [];
    if (m.gwiyin) m.goodAll.push(MONTH_GOOD.gwiyin);
    if (m.yukhapDay) m.goodAll.push(MONTH_GOOD.hap);
    if (m.lack) m.goodAll.push(MONTH_GOOD.fill);
    if (m.blue >= 2) m.goodAll.push(MONTH_GOOD.doc);
    m.goodAll.push(MONTH_GOOD.flow);        // 앞 달과 이유가 겹칠 때의 마지막 안전판

    return m;
  }

  /** 고른 달에 한 줄 이유를 매긴다 — 앞 달에서 쓴 이유면 그 달의 다음 이유로 */
  function pickReason(list, allKey, outKey) {
    var used = {};
    list.forEach(function (x) {
      var arr = x[allKey] || [];
      var pick = null;
      for (var i = 0; i < arr.length; i++) {
        if (!used[arr[i].key]) { pick = arr[i]; break; }
      }
      if (!pick) pick = x[outKey];
      used[pick.key] = 1;
      x[outKey] = pick;
    });
  }

  /** 1년치 — 조심할 달 TOP 3 · 좋은 달 TOP 2 */
  function yearDigest(year, natal, terms, opt) {
    opt = opt || {};
    var months = [], totals = { red: 0, gold: 0, blue: 0, gray: 0, days: 0, badDays: 0, goodDays: 0 };
    for (var m = 1; m <= 12; m++) {
      var d = monthDigest(year, m, natal, terms, opt);
      months.push(d);
      totals.red += d.red; totals.gold += d.gold; totals.blue += d.blue; totals.gray += d.gray;
      totals.days += d.days; totals.badDays += d.badDays.length; totals.goodDays += d.goodDays.length;
    }
    var byCaution = months.slice().sort(function (a, b) { return b.caution - a.caution; });
    var topC = byCaution.length ? byCaution[0].caution : 0;
    var warn = byCaution.filter(function (x) { return x.caution >= Math.max(60, topC * 0.6); }).slice(0, 3);
    pickReason(warn, 'warnAll', 'warn');

    var byChance = months.slice().sort(function (a, b) { return b.chance - a.chance; });
    var topG = byChance.length ? byChance[0].chance : 0;
    var good = byChance.filter(function (x) {
      if (warn.indexOf(x) >= 0) return false;                 // 조심할 달이 좋은 달로 겹치지 않게
      return x.chance >= Math.max(60, topG * 0.75);
    }).slice(0, 2);
    pickReason(good, 'goodAll', 'good');

    return {
      y: year, months: months, totals: totals, warn: warn, good: good,
      warnMonths: warn.map(function (x) { return x.m; }),
      goodMonths: good.map(function (x) { return x.m; })
    };
  }

  /* ── 처방 문구 (미리 써 둔 표) ─────────────────────── */
  var ACT = {
    chung: [
      '오늘은 확정하지 말고 확인만. 서명은 내일이 낫습니다.',
      '일정이 흔들리기 쉬운 날 — 이동 시간을 넉넉히 잡으세요.',
      '답장은 한 번 접어 두고 보내세요. 오늘은 말이 세집니다.',
      '결정은 내일로. 오늘은 사실 확인과 정리에 쓰세요.',
      '몸이 먼저 지칠 수 있어요. 일정은 절반만 잡으세요.'
    ],
    hyeong: [
      '서류·계좌·관계의 잔금을 정리하는 날로 쓰세요.',
      '감정이 올라와도 그 자리에서 결론 내지 마세요.',
      '잘못된 걸 바로잡되, 방식은 부드럽게.',
      '가까운 사람과의 말이 오해로 번지기 쉬워요. 한 번 더 확인하세요.',
      '절차를 다시 확인하세요. 급하면 틀어집니다.'
    ],
    hae: [
      '중요한 이야기는 문자 대신 대면으로.',
      '서류·물건을 한 번 더 챙기세요. 잃기 쉬운 날입니다.',
      '부탁은 명확하게, 거절도 명확하게.',
      '중간 전달자 없이 직접 확인하세요.',
      '약속 장소와 시간을 다시 확인하세요.'
    ],
    gwiyin: [
      '먼저 연락해 보세요. 오늘의 인연이 다음 달을 바꿉니다.',
      '도움을 청하는 쪽이 유리한 날 — 혼자 하지 마세요.',
      '미팅·지원서 제출에 좋은 날입니다.',
      '오래 연락 못 한 사람에게 안부를 전해 보세요.',
      '부탁할 일이 있다면 오늘 꺼내세요.'
    ],
    hap: [
      '관계를 잇는 날 — 화해, 제안, 소개에 좋아요.',
      '오래 미뤄 둔 연락 하나를 오늘 보내 보세요.',
      '새 약속을 잡되, 조건은 글로 남기세요.',
      '함께하는 일이 잘 풀립니다. 혼자 결정하지 마세요.',
      '미팅·계약의 첫 대화를 여는 데 좋은 날입니다.'
    ],
    wealth: [
      '금액은 글로 남기세요. 구두 약속은 남기지 마세요.',
      '견적·정산·수금에 손대기 좋은 날입니다.',
      '작은 지출이 새기 쉬워요. 결제 전에 한 번 멈추세요.',
      '값을 깎기보다 조건을 명확히 하는 쪽이 이깁니다.',
      '들어오는 돈보다 나가는 돈을 먼저 확인하세요.'
    ],
    doc: [
      '계약서·제안서·원고처럼 문서가 되는 일에 힘이 붙습니다.',
      '배우거나 정리한 것을 기록으로 남기면 오래갑니다.',
      '증명서·서류 발급, 신청 업무에 좋은 날.',
      '초안은 오늘, 다듬는 건 내일.',
      '공부·강의·자료 정리에 집중하기 좋습니다.'
    ],
    jie: [
      '달의 기준이 바뀌는 날 — 이번 달 흐름이 새로 섭니다.',
      '이번 달 목표를 오늘 한 줄로 적어 두세요.',
      '새 달의 첫 결정은 하루 뒤에.',
      '몸의 리듬이 바뀌는 때 — 잠을 먼저 챙기세요.',
      '지난달 미련은 오늘 정리하고 넘어가세요.'
    ],
    calm: [
      '급한 결정 없이 흐름을 보기 좋은 날.',
      '쉬는 시간을 먼저 달력에 넣어 두세요.',
      '밀린 정리 하나만 끝내도 충분한 하루.',
      '새 일을 벌이기보다 하던 일을 마무리하세요.',
      '약속은 하나면 충분한 날.'
    ]
  };

  var EL_TIP = {
    목: [
      '아침에 10분 걷기 — 몸을 깨우면 판단이 맑아집니다.',
      '초록 잎 하나를 책상에 두세요. 눈이 먼저 쉬어요.',
      '새로 시작하는 일은 오전에 한 가지만 꺼내세요.'
    ],
    화: [
      '말의 온도를 한 단계 낮추세요. 오늘은 표현이 세집니다.',
      '따뜻한 차 한 잔으로 속도를 늦춰 보세요.',
      '밝은 자리보다 조용한 자리가 오늘의 결정에 낫습니다.'
    ],
    토: [
      '정리·청소·재고 확인처럼 손으로 하는 일이 잘 풀립니다.',
      '집 안의 한 칸만 비워 두세요. 생각이 트입니다.',
      '먹는 시간을 정해 두면 하루가 안정됩니다.'
    ],
    금: [
      '미뤄 둔 "아니오" 하나를 오늘 말해 보세요.',
      '지출과 약속을 한 번 쳐내면 마음이 가벼워집니다.',
      '물건을 버리는 결정은 오늘 잘 맞습니다.'
    ],
    수: [
      '물을 자주 마시고, 큰 결정은 오후로 미루세요.',
      '잠을 30분 더 자 두면 판단이 달라집니다.',
      '사람 많은 곳보다 물가나 조용한 길이 좋습니다.'
    ]
  };

  function prescribe(marks, term, gz) {
    var top = null;
    marks.forEach(function (mk) {
      if (mk.cat === 'gray' || mk.minor) return;
      if (!top || mk.weight > top.weight) top = mk;
    });
    var kind = top ? top.kind : (term ? 'jie' : 'calm');
    if (!ACT[kind]) kind = 'calm';
    var table = ACT[kind];
    var line1 = table[(gz.index * 7 + 3) % table.length];
    var tips = EL_TIP[M.GAN_EL[gz.ganIndex]] || EL_TIP.토;
    var line2 = tips[(gz.index + 1) % tips.length];
    return [line1, line2];
  }

  global.Timing = {
    CAT: CAT,
    buildTerms: buildTerms,
    natalOf: natalOf,
    needOf: needOf,
    dayInfo: dayInfo,
    saeunOf: saeunOf,
    addDays: addDays,
    isoOf: isoOf,
    parseISO: parseISO,
    dowOf: dowOf,
    daysInMonth: daysInMonth,
    zhiKo: zhiKo,
    monthGzOf: monthGzOf,
    monthDigest: monthDigest,
    yearDigest: yearDigest,
    MONTH_WARN: MONTH_WARN,
    MONTH_GOOD: MONTH_GOOD,
    CHEONEUL: CHEONEUL,
    _internal: { isHyeong: isHyeong, chungOf: chungOf, haeOf: haeOf, yukhapOf: yukhapOf, samhapGroupOf: samhapGroupOf }
  };
})(typeof window !== 'undefined' ? window : globalThis);

/*!
 * 윤이세 타이밍 캘린더 — 명리 관계·처방·.ics 코어
 * 기반: assets/manse.js (KASI 대조 완료 만세력 엔진) + vendor/lunar.js
 *
 * 원칙
 *  - 모든 판정은 내 원국(일간·일지·월지)과 그날 일진의 실제 관계로만 계산한다.
 *  - 색 배지 4종: 기회·귀인(금) / 주의·변동(적) / 재물·문서(청) / 절기(회)
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

  var CAT = {
    red:  { label: '주의·변동', color: '#C0563F', icon: '🔴', order: 0 },
    gold: { label: '기회·귀인', color: '#C08B32', icon: '🟡', order: 1 },
    blue: { label: '재물·문서', color: '#5C7E9E', icon: '🔵', order: 2 },
    gray: { label: '절기',      color: '#A9A296', icon: '⚪', order: 3 }
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

  /* ── 원국 요약 ─────────────────────────────────────── */
  function natalOf(res) {
    var d = res.pillars.day, mo = res.pillars.month, y = res.pillars.year, t = res.pillars.time;
    return {
      dayGanIndex: d.ganIndex, dayZhiIndex: d.zhiIndex,
      monthZhiIndex: mo.zhiIndex, yearZhiIndex: y.zhiIndex,
      timeZhiIndex: t ? t.zhiIndex : null,
      gan: d.gan, zhi: d.zhi, ganKo: d.ganKo, zhiKo: d.zhiKo,
      element: M.GAN_EL[d.ganIndex],
      pillars: res.pillars, tenGod: res.tenGod, res: res
    };
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

    // ── 주의·변동 ──
    if (chungOf(tz) === dz) {
      add('red', 'chung', 60, '일지 충', '내 일지 ' + zhiFull(dz) + ' ↔ 일진 ' + zhiFull(tz) + ' — 충(沖), 자리와 관계가 흔들리는 날');
    } else if (chungOf(tz) === mz) {
      add('red', 'chung', 35, '월지 충', '내 월지 ' + zhiFull(mz) + ' ↔ 일진 ' + zhiFull(tz) + ' — 충(沖), 일의 판이 흔들리는 날');
    }
    if (isHyeong(tz, dz)) {
      add('red', 'hyeong', 50, '일지 형', '내 일지 ' + zhiFull(dz) + ' ↔ 일진 ' + zhiFull(tz) + ' — 형(刑), 마찰과 서류의 엉킴');
    } else if (isHyeong(tz, mz)) {
      add('red', 'hyeong', 25, '월지 형', '내 월지 ' + zhiFull(mz) + ' ↔ 일진 ' + zhiFull(tz) + ' — 형(刑), 절차가 꼬이기 쉬운 날', true);
    }
    if (haeOf(tz) === dz) {
      add('red', 'hae', 40, '일지 해', '내 일지 ' + zhiFull(dz) + ' ↔ 일진 ' + zhiFull(tz) + ' — 해(害), 말과 뜻이 엇갈리는 날');
    } else if (haeOf(tz) === mz) {
      add('red', 'hae', 20, '월지 해', '내 월지 ' + zhiFull(mz) + ' ↔ 일진 ' + zhiFull(tz) + ' — 해(害), 전달이 어긋나기 쉬운 날', true);
    }

    // ── 기회·귀인 ──
    if (CHEONEUL[dg].indexOf(tz) >= 0) {
      add('gold', 'gwiyin', 65, '천을귀인',
        '천을귀인(天乙貴人) — 일간 ' + GAN[dg] + '의 귀인 자리 ' +
        CHEONEUL[dg].map(function (i) { return ZHI[i]; }).join('·') + ' 중 ' + zhiFull(tz) + '이 온 날');
    }
    if ((tg + 5) % 10 === dg) {
      add('gold', 'hap', 45, '천간합',
        '일간 ' + GAN[dg] + ' ↔ 일진 ' + GAN[tg] + ' — 천간합(合), 사람과 일이 붙는 날');
    }
    if (yukhapOf(tz) === dz) {
      add('gold', 'hap', 55, '일지 육합', '내 일지 ' + zhiFull(dz) + ' ↔ 일진 ' + zhiFull(tz) + ' — 육합(六合), 관계가 이어지는 날');
    } else if (yukhapOf(tz) === mz) {
      add('gold', 'hap', 22, '월지 육합', '내 월지 ' + zhiFull(mz) + ' ↔ 일진 ' + zhiFull(tz) + ' — 육합(六合), 일이 풀리는 날', true);
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
        add('gold', 'hap', 50, '삼합 완성',
          '일진 ' + zhiFull(tz) + ' + 내 ' + two.slice(0, 2).map(zhiFull).join('·') + ' — ' + SAMHAP_KO[sg] + ' 삼합이 완성되는 날');
      } else if (two.length === 1) {
        var where = two[0] === dz ? '내 일지 ' : (two[0] === mz ? '내 월지 ' : '내 원국 ');
        add('gold', 'hap', 22, '반합',
          where + zhiFull(two[0]) + ' ↔ 일진 ' + zhiFull(tz) + ' — ' + SAMHAP_KO[sg] + '의 반합', true);
      }
    }

    // ── 재물·문서 (십신) ──
    var tgName = TEN(dg, tg);
    if (tgName === '정재' || tgName === '편재') {
      add('blue', 'wealth', 32, '재물', '일진 천간 ' + GAN[tg] + ' — 내 일간 ' + GAN[dg] + ' 기준 ' + tgName + '(財), 돈이 오가는 신호');
    }
    if (tgName === '정인' || tgName === '편인') {
      add('blue', 'doc', 32, '문서', '일진 천간 ' + GAN[tg] + ' — 내 일간 ' + GAN[dg] + ' 기준 ' + tgName + '(印), 문서·공부의 신호');
    }
    var mainStem = HIDDEN[gz.zhi][0];
    var zgName = TEN(dg, GAN.indexOf(mainStem));
    if ((zgName === '정재' || zgName === '편재') && tgName !== '정재' && tgName !== '편재') {
      add('blue', 'wealth', 20, '재물', '일진 지지 ' + zhiFull(tz) + '의 본기 ' + mainStem + ' — ' + zgName + '(財), 재물 자리가 열린 날', true);
    }
    if ((zgName === '정인' || zgName === '편인') && tgName !== '정인' && tgName !== '편인') {
      add('blue', 'doc', 20, '문서', '일진 지지 ' + zhiFull(tz) + '의 본기 ' + mainStem + ' — ' + zgName + '(印), 문서 자리가 열린 날', true);
    }

    // ── 절기 ──
    var term = terms && terms.byDate ? terms.byDate[iso] : null;
    if (term) {
      add('gray', 'jie', 12, term.ko,
        term.isJie
          ? term.ko + ' 절입 ' + term.time + ' — ' + (term.monthText ? term.monthText + '월' : '월건') + '이 바뀝니다'
          : term.ko + ' ' + term.time + ' — 24절기', true);
    }

    // 점: 하루에 1~2개. 강한 신호만 점이 된다(약한 신호는 상세 설명에만)
    var strongRed = marks.some(function (mk) { return mk.cat === 'red' && !mk.minor; });
    var strongGold = marks.some(function (mk) { return mk.cat === 'gold' && !mk.minor; });
    var strongBlue = marks.some(function (mk) { return mk.cat === 'blue' && !mk.minor; });
    var dots = [];
    if (strongRed) dots.push({ cat: 'red' });
    if (strongGold) dots.push({ cat: 'gold' });
    if (!strongRed && !strongGold && strongBlue) dots.push({ cat: 'blue' });

    var headline, tone;
    if (strongRed && strongGold) { headline = '기회와 변동이 함께 · 조건 확인하고 움직이기'; tone = 'red'; }
    else if (strongRed) { headline = '속도 조절 · 결정은 하루 뒤로'; tone = 'red'; }
    else if (strongGold) { headline = '추진하기 좋은 날 · 먼저 손 내밀기'; tone = 'gold'; }
    else if (strongBlue) { headline = '계약·문서 체크 · 기록으로 남기기'; tone = 'blue'; }
    else if (term) { headline = '절기 전환 · 새 달의 기준이 서는 날'; tone = 'gray'; }
    else { headline = '잔잔한 날 · 흐름 정리'; tone = 'none'; }

    var lines = prescribe(marks, term, gz);

    return {
      iso: iso, y: y, m: m, d: d, dow: dowOf(iso),
      gz: gz, ganEl: M.GAN_EL[gz.ganIndex], zhiEl: M.ZHI_EL[gz.zhiIndex],
      lunarText: lunarText, term: term, marks: marks, dots: dots,
      tone: tone, headline: headline, lines: lines,
      tenGod: tgName
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
      '절기가 바뀌는 날 — 이번 달 기준이 새로 섭니다.',
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

  /* ── .ics ──────────────────────────────────────────── */
  function icsEscape(s) {
    return String(s == null ? '' : s)
      .replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\n');
  }
  function utf8Len(ch) {
    var c = ch.codePointAt(0);
    if (c < 0x80) return 1;
    if (c < 0x800) return 2;
    if (c < 0x10000) return 3;
    return 4;
  }
  function foldLine(line) {
    // RFC 5545: 75옥텟. 이모지는 서로게이트 쌍이라 코드포인트 단위로 센다.
    var out = '', bytes = 0, buf = '';
    var chars = Array.from ? Array.from(line) : line.split('');
    for (var i = 0; i < chars.length; i++) {
      var ch = chars[i];
      var b = utf8Len(ch);
      if (bytes + b > 72) { out += buf + '\r\n '; buf = ''; bytes = 0; }
      buf += ch; bytes += b;
    }
    return out + buf;
  }
  function fmtLocal(d) {
    return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) +
      'T' + pad2(d.getHours()) + pad2(d.getMinutes()) + '00';
  }
  function fmtUTC(d) {
    return d.getUTCFullYear() + pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate()) +
      'T' + pad2(d.getUTCHours()) + pad2(d.getUTCMinutes()) + pad2(d.getUTCSeconds()) + 'Z';
  }

  var ICS_ICON = { red: '🔴', gold: '🟡', blue: '🔵', gray: '⚪' };

  function buildICS(days, opts) {
    opts = opts || {};
    var now = new Date();
    var L = [];
    L.push('BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//YOONISE//Timing Calendar//KO',
      'CALSCALE:GREGORIAN', 'METHOD:PUBLISH');
    L.push('X-WR-CALNAME:' + icsEscape((opts.name ? opts.name + ' · ' : '') + '윤이세 타이밍 캘린더 (무료 7일)'));
    L.push('X-WR-TIMEZONE:Asia/Seoul');
    L.push('BEGIN:VTIMEZONE', 'TZID:Asia/Seoul',
      'BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:+0900', 'TZOFFSETTO:+0900',
      'TZNAME:KST', 'END:STANDARD', 'END:VTIMEZONE');

    days.forEach(function (info, k) {
      var strong = info.marks.filter(function (mk) { return !mk.minor && (mk.cat === 'red' || mk.cat === 'gold'); });
      if (!strong.length && !info.term) return;
      strong.sort(function (a, b) { return b.weight - a.weight; });
      var primary = strong.length ? strong[0] : null;
      var tag = primary
        ? (primary.cat === 'red' ? '속도 조절' : '타이밍 ON') + ' · ' + primary.label
        : (info.term.isJie ? '절입' : '절기') + ' · ' + info.term.ko + (info.term.isJie ? ' ' + info.term.time : '');
      var icon = primary ? ICS_ICON[primary.cat] : '⚪';
      var summary = icon + ' ' + tag + ' — ' + info.gz.text + '일';
      var desc = info.headline + '\n' +
        strong.map(function (mk) { return '· ' + mk.detail; }).join('\n') +
        (info.term ? (strong.length ? '\n' : '') + '· ' + info.term.ko + ' ' + info.term.time + (info.term.isJie ? ' (' + info.term.monthText + '월 시작)' : '') : '') + '\n' +
        '처방: ' + info.lines[0] + ' / ' + info.lines[1] + '\n' +
        '(윤이세 타이밍 캘린더 · 무료 7일 맛보기)';

      var dayStart = info.iso.replace(/-/g, '') + 'T090000';
      var dayEnd = info.iso.replace(/-/g, '') + 'T091500';
      var uid = 'ytc-' + info.iso.replace(/-/g, '') + '-' + k + '@yoonise-timing';

      L.push('BEGIN:VEVENT');
      L.push('UID:' + uid);
      L.push('DTSTAMP:' + fmtUTC(now));
      L.push('DTSTART;TZID=Asia/Seoul:' + dayStart);
      L.push('DTEND;TZID=Asia/Seoul:' + dayEnd);
      L.push('SUMMARY:' + icsEscape(summary));
      L.push('DESCRIPTION:' + icsEscape(desc));
      L.push('TRANSP:TRANSPARENT');
      L.push('BEGIN:VALARM', 'TRIGGER:-PT15H', 'ACTION:DISPLAY',
        'DESCRIPTION:' + icsEscape('내일 ' + tag + ' — 미리 챙기세요'), 'X-WR-ALARMUID:' + uid + '-a1', 'END:VALARM');
      L.push('BEGIN:VALARM', 'TRIGGER:-PT0M', 'ACTION:DISPLAY',
        'DESCRIPTION:' + icsEscape(tag + ' — ' + info.lines[0]), 'X-WR-ALARMUID:' + uid + '-a2', 'END:VALARM');
      L.push('END:VEVENT');
    });

    L.push('END:VCALENDAR');
    return L.map(foldLine).join('\r\n') + '\r\n';
  }

  global.Timing = {
    CAT: CAT,
    buildTerms: buildTerms,
    natalOf: natalOf,
    dayInfo: dayInfo,
    buildICS: buildICS,
    addDays: addDays,
    isoOf: isoOf,
    parseISO: parseISO,
    dowOf: dowOf,
    daysInMonth: daysInMonth,
    zhiKo: zhiKo,
    CHEONEUL: CHEONEUL,
    _internal: { isHyeong: isHyeong, chungOf: chungOf, haeOf: haeOf, yukhapOf: yukhapOf, samhapGroupOf: samhapGroupOf }
  };
})(typeof window !== 'undefined' ? window : globalThis);

/*!
 * 만세(萬世) 계산 엔진 — 윤이세사주 오행·아로마 테스트
 * 기반 라이브러리: lunar-javascript v1.7.8 (MIT) / vendor/lunar.js
 *
 * 원칙
 *  - 연주: 입춘(立春) 절입 시각 기준
 *  - 월주: 12절기(입춘·경칩·청명·입하·망종·소서·입추·백로·한로·입동·대설·소한) 절입 시각 기준
 *  - 일주: 율리우스 적일 기반 60갑자(자정 기준, 옵션에 따라 23시 기준)
 *  - 시주: 한국 사주명리 표준 12지시(30분 경계), 오자둔(五鼠遁)
 *    예) 자시 23:30~01:30, 오시 11:30~13:30, 미시 13:30~15:30
 *  - 절입 시각은 라이브러리 계산값(중국 표준시 = UTC+8)을 절대시각으로 환산해
 *    한국 표준시(UTC+9) 출생 시각과 비교한다.
 *  - 모든 계산은 브라우저 안에서만 수행되고 어디에도 전송되지 않는다.
 */
(function (global) {
  'use strict';

  var Lunar = global.Lunar, Solar = global.Solar, LunarYear = global.LunarYear, LunarUtil = global.LunarUtil;

  var GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
  var ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  var GAN_KO = ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계'];
  var ZHI_KO = ['자', '축', '인', '묘', '진', '사', '오', '미', '신', '유', '술', '해'];
  var GAN_HUN = ['갑옷 갑', '새 을', '남녘 병', '고무래 정', '무성할 무',
                 '몸 기', '별 경', '매울 신', '북방 임', '열째 천간 계'];
  var ZHI_ANIMAL = ['쥐', '소', '호랑이', '토끼', '용', '뱀', '말', '양', '원숭이', '닭', '개', '돼지'];

  var GAN_EL = ['목', '목', '화', '화', '토', '토', '금', '금', '수', '수'];
  var ZHI_EL = ['수', '토', '목', '목', '토', '화', '화', '토', '금', '금', '토', '수'];

  // 지장간(支藏干)
  var HIDDEN = {
    '子': ['癸'], '丑': ['己', '癸', '辛'], '寅': ['甲', '丙', '戊'], '卯': ['乙'],
    '辰': ['戊', '乙', '癸'], '巳': ['丙', '戊', '庚'], '午': ['丁', '己'], '未': ['己', '丁', '乙'],
    '申': ['庚', '壬', '戊'], '酉': ['辛'], '戌': ['戊', '辛', '丁'], '亥': ['壬', '甲']
  };

  // 12절기 (월을 여는 절). index 0 = 입춘 → 寅월
  var JIE = [
    { hanja: '立春', ko: '입춘', month: '寅' },
    { hanja: '驚蟄', ko: '경칩', month: '卯' },
    { hanja: '淸明', ko: '청명', month: '辰' },
    { hanja: '立夏', ko: '입하', month: '巳' },
    { hanja: '芒種', ko: '망종', month: '午' },
    { hanja: '小暑', ko: '소서', month: '未' },
    { hanja: '立秋', ko: '입추', month: '申' },
    { hanja: '白露', ko: '백로', month: '酉' },
    { hanja: '寒露', ko: '한로', month: '戌' },
    { hanja: '立冬', ko: '입동', month: '亥' },
    { hanja: '大雪', ko: '대설', month: '子' },
    { hanja: '小寒', ko: '소한', month: '丑' }
  ];
  // 라이브러리 표에서 쓸 수 있는 이름 변형(간체/번체)
  var JIE_ALIAS = {
    '立春': ['立春', 'LI_CHUN'], '驚蟄': ['惊蛰', '驚蟄', 'JING_ZHE'], '淸明': ['清明', '淸明', 'QING_MING'],
    '立夏': ['立夏', 'LI_XIA'], '芒種': ['芒种', '芒種', 'MANG_ZHONG'], '小暑': ['小暑', 'XIAO_SHU'],
    '立秋': ['立秋', 'LI_QIU'], '白露': ['白露', 'BAI_LU'], '寒露': ['寒露', 'HAN_LU'],
    '立冬': ['立冬', 'LI_DONG'], '大雪': ['大雪', 'DA_XUE'], '小寒': ['小寒', 'XIAO_HAN']
  };

  // 12지시 — 한국 사주명리 표준 30분 경계
  //  rep: 그 지시 안의 대표 시각(자정부터 분)
  var JISI = [
    { idx: 0, ko: '자', hanja: '子', start: '23:30', end: '01:30', rep: 30 },
    { idx: 1, ko: '축', hanja: '丑', start: '01:30', end: '03:30', rep: 150 },
    { idx: 2, ko: '인', hanja: '寅', start: '03:30', end: '05:30', rep: 270 },
    { idx: 3, ko: '묘', hanja: '卯', start: '05:30', end: '07:30', rep: 390 },
    { idx: 4, ko: '진', hanja: '辰', start: '07:30', end: '09:30', rep: 510 },
    { idx: 5, ko: '사', hanja: '巳', start: '09:30', end: '11:30', rep: 630 },
    { idx: 6, ko: '오', hanja: '午', start: '11:30', end: '13:30', rep: 750 },
    { idx: 7, ko: '미', hanja: '未', start: '13:30', end: '15:30', rep: 870 },
    { idx: 8, ko: '신', hanja: '申', start: '15:30', end: '17:30', rep: 990 },
    { idx: 9, ko: '유', hanja: '酉', start: '17:30', end: '19:30', rep: 1110 },
    { idx: 10, ko: '술', hanja: '戌', start: '19:30', end: '21:30', rep: 1230 },
    { idx: 11, ko: '해', hanja: '亥', start: '21:30', end: '23:30', rep: 1350 }
  ];
  var JISI_START = 23 * 60 + 30; // 자시가 시작되는 시각(조자시설의 일주 경계)

  // 시각 → 12지시 인덱스 (30분 경계: 23:30~01:30 = 子)
  function jisiIndex(hh, mm) {
    var t = (Number(hh) || 0) * 60 + (Number(mm) || 0);
    return Math.floor(mod(t + 30, 1440) / 120);
  }

  function jisiOf(hh, mm) {
    var j = JISI[jisiIndex(hh, mm)];
    return { idx: j.idx, ko: j.ko, hanja: j.hanja, start: j.start, end: j.end, rep: j.rep };
  }

  // 시/도 대표 경도 (동경)
  var REGIONS = [
    { key: 'seoul', name: '서울·경기·인천', lon: 126.98 },
    { key: 'gangwon', name: '강원', lon: 127.73 },
    { key: 'chung', name: '대전·충청·세종', lon: 127.38 },
    { key: 'jeolla', name: '광주·전라', lon: 126.85 },
    { key: 'daegu', name: '대구·경북', lon: 128.60 },
    { key: 'busan', name: '부산·울산·경남', lon: 129.08 },
    { key: 'jeju', name: '제주', lon: 126.53 },
    { key: 'other', name: '해외·기타', lon: 135.00 }
  ];

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function mod(n, m) { return ((n % m) + m) % m; }

  function ganZhiOf(index) {
    var i = mod(index, 60);
    return {
      index: i,
      ganIndex: i % 10, zhiIndex: i % 12,
      gan: GAN[i % 10], zhi: ZHI[i % 12],
      ganKo: GAN_KO[i % 10], zhiKo: ZHI_KO[i % 12],
      text: GAN[i % 10] + ZHI[i % 12],
      textKo: GAN_KO[i % 10] + ZHI_KO[i % 12]
    };
  }

  // 라이브러리가 돌려주는 Solar(중국 표준시 기준 벽시계) → 절대 시각(epoch ms)
  function solarToEpochCN(s) {
    return Date.UTC(s.getYear(), s.getMonth() - 1, s.getDay(), s.getHour() - 8, s.getMinute(), s.getSecond());
  }

  // 절기 표 만들기: 해당 양력 연도 앞뒤 음력연도의 절기표를 모아 12절만 추린다
  function buildJie(year) {
    var map = {}, out = [];
    for (var ly = year - 2; ly <= year + 1; ly++) {
      var table;
      try { table = Lunar.fromYmd(ly, 6, 1).getJieQiTable(); } catch (e) { continue; }
      for (var nameHan in JIE_ALIAS) {
        if (!JIE_ALIAS.hasOwnProperty(nameHan)) continue;
        var list = JIE_ALIAS[nameHan];
        for (var i = 0; i < list.length; i++) {
          var s = table[list[i]];
          if (!s || typeof s.getYear !== 'function') continue;
          var key = s.getYear() + '-' + s.getMonth() + '-' + s.getDay() + ' ' + s.getHour() + ':' + s.getMinute();
          if (map[key]) continue;
          map[key] = true;
          out.push({ hanja: nameHan, solar: s, epoch: solarToEpochCN(s) });
        }
      }
    }
    out.sort(function (a, b) { return a.epoch - b.epoch; });
    // 연속 중복 제거
    var clean = [];
    for (var j = 0; j < out.length; j++) {
      if (j && out[j].epoch === out[j - 1].epoch) continue;
      clean.push(out[j]);
    }
    for (var k = 0; k < clean.length; k++) {
      var meta = null;
      for (var m = 0; m < JIE.length; m++) if (JIE[m].hanja === clean[k].hanja) meta = JIE[m];
      clean[k].meta = meta;
    }
    return clean;
  }

  function epochToKstText(epoch) {
    var d = new Date(epoch + 9 * 3600 * 1000 + 30000); // 분 단위 반올림(KASI 표기와 동일하게)
    return d.getUTCFullYear() + '.' + pad(d.getUTCMonth() + 1) + '.' + pad(d.getUTCDate()) +
      ' ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes());
  }

  function yearMonthFor(birthEpoch, jie) {
    var lastJie = null, nextJie = null;
    for (var i = 0; i < jie.length; i++) {
      if (jie[i].epoch <= birthEpoch) lastJie = jie[i];
      else { nextJie = jie[i]; break; }
    }
    if (!lastJie) throw new Error('입춘 이전 시점의 절기 정보를 찾지 못했습니다. 연도를 확인해 주세요.');
    var lichun = null;
    for (var j = jie.length - 1; j >= 0; j--) {
      if (jie[j].hanja === '立春' && jie[j].epoch <= birthEpoch) { lichun = jie[j]; break; }
    }
    if (!lichun) throw new Error('입춘 정보를 찾지 못했습니다.');
    var yearNum = lichun.solar.getYear();
    var yearP = ganZhiOf(yearNum - 4);
    var k = JIE.indexOf(lastJie.meta);
    var monthZhiIndex = mod(2 + k, 12);
    var monthGanIndex = mod(yearP.ganIndex * 2 + 2 + k, 10);
    return {
      lastJie: lastJie, nextJie: nextJie, lichun: lichun, yearNum: yearNum, yearP: yearP,
      monthP: {
        ganIndex: monthGanIndex, zhiIndex: monthZhiIndex,
        gan: GAN[monthGanIndex], zhi: ZHI[monthZhiIndex],
        ganKo: GAN_KO[monthGanIndex], zhiKo: ZHI_KO[monthZhiIndex],
        text: GAN[monthGanIndex] + ZHI[monthZhiIndex],
        textKo: GAN_KO[monthGanIndex] + ZHI_KO[monthZhiIndex],
        jie: lastJie.meta
      }
    };
  }

  /**
   * opts: {
   *   name, gender('' | 'F' | 'M'),
   *   calendar: 'solar' | 'lunar',
   *   y, m, d,               // 입력한 달력 기준
   *   leap: bool,            // 음력 윤달 여부
   *   timeKnown: bool, hh, mm,
   *   longitude: number,     // 동경 경도
   *   trueSolar: bool,       // 진태양시(경도) 보정
   *   dst: bool,             // 서머타임(-1시간) 보정
   *   ziRule: '23' | '24'    // 일주가 바뀌는 시각
   * }
   */
  function compute(opts) {
    var cal = opts.calendar === 'lunar' ? 'lunar' : 'solar';
    var y = +opts.y, m = +opts.m, d = +opts.d;
    if (!y || !m || !d) throw new Error('생년월일을 모두 선택해 주세요.');

    var solarY, solarM, solarD, lunarY, lunarM, lunarD, lunarLeap = false, lunarText;

    if (cal === 'lunar') {
      var leapMonth = 0;
      try { leapMonth = LunarYear.fromYear(y).getLeapMonth(); } catch (e) { leapMonth = 0; }
      if (opts.leap && leapMonth !== m) {
        throw new Error(y + '년 음력 ' + m + '월은 윤달이 없습니다. 윤달 표시를 해제하고 다시 선택해 주세요.');
      }
      var lunar;
      try {
        lunar = Lunar.fromYmdHms(y, opts.leap ? -m : m, d, 12, 0, 0);
      } catch (e) {
        throw new Error('음력 ' + y + '년 ' + m + '월 ' + d + '일은 존재하지 않는 날짜입니다.');
      }
      var sc = lunar.getSolar();
      solarY = sc.getYear(); solarM = sc.getMonth(); solarD = sc.getDay();
      lunarY = y; lunarM = m; lunarD = d; lunarLeap = !!opts.leap;
      lunarText = (opts.leap ? '윤' : '') + m + '월 ' + d + '일';
    } else {
      if (m < 1 || m > 12 || d < 1 || d > 31) throw new Error('생년월일을 다시 확인해 주세요.');
      var sol;
      try {
        sol = Solar.fromYmdHms(y, m, d, 12, 0, 0);
        var lun = sol.getLunar();
        // 존재하지 않는 양력 날짜(예: 2월 30일) 검증
        if (lun.getSolar().getYear() !== y || lun.getSolar().getMonth() !== m || lun.getSolar().getDay() !== d) {
          throw new Error('x');
        }
        lunarY = lun.getYear(); lunarM = Math.abs(lun.getMonth()); lunarD = lun.getDay();
        lunarLeap = lun.getMonth() < 0;
        lunarText = (lunarLeap ? '윤' : '') + Math.abs(lun.getMonth()) + '월 ' + lun.getDay() + '일';
      } catch (e) {
        throw new Error('양력 ' + y + '년 ' + m + '월 ' + d + '일은 존재하지 않는 날짜입니다.');
      }
      solarY = y; solarM = m; solarD = d;
    }

    // ---- 시간 보정 ----
    var timeKnown = !!opts.timeKnown;
    var hh = timeKnown ? +opts.hh : 12;
    var mm = timeKnown ? +opts.mm : 0;

    var lonMin = 0;
    if (opts.trueSolar) {
      var lon = typeof opts.longitude === 'number' ? opts.longitude : 126.98;
      lonMin = (135 - lon) * 4;      // 표준자오선 135°E와의 차이(분)
    }
    var dstMin = opts.dst ? 60 : 0;
    var shiftMin = Math.round(lonMin) + dstMin;   // 실제 태양시 = 표준시 - shiftMin

    // 보정된 벽시계 시각 (일주·시주 계산용)
    var localMs = Date.UTC(solarY, solarM - 1, solarD, hh, mm, 0);
    var correctedMs = localMs - shiftMin * 60000;
    var cd = new Date(correctedMs);
    var cY = cd.getUTCFullYear(), cM = cd.getUTCMonth() + 1, cD = cd.getUTCDate(), cH = cd.getUTCHours(), cMi = cd.getUTCMinutes();

    // ---- 연주·월주: 절입 시각 비교 (한국 표준시 절대시각) ----
    var birthEpoch = localMs - 9 * 3600 * 1000 - shiftMin * 60000; // UTC epoch
    var jie = buildJie(solarY);
    var ym = yearMonthFor(birthEpoch, jie);
    var lastJie = ym.lastJie, nextJie = ym.nextJie;
    var lichun = ym.lichun, yearNum = ym.yearNum;
    var yearP = ym.yearP, monthP = ym.monthP;

    // 절입일인데 시간을 모르는 경우: 절입 전후 연·월주를 함께 알려 준다
    var onBirthday = null;
    for (var i = 0; i < jie.length; i++) {
      if (epochToKstText(jie[i].epoch).slice(0, 10) === solarY + '.' + pad(solarM) + '.' + pad(solarD)) {
        onBirthday = jie[i];
        break;
      }
    }
    var altYM = null;
    if (onBirthday) {
      var before = yearMonthFor(onBirthday.epoch - 1000, jie);
      var after = yearMonthFor(onBirthday.epoch + 1000, jie);
      altYM = {
        name: onBirthday.meta.ko, hanja: onBirthday.meta.hanja, at: epochToKstText(onBirthday.epoch),
        before: before.yearP.text + '년 ' + before.monthP.text + '월',
        after: after.yearP.text + '년 ' + after.monthP.text + '월'
      };
    }

    // ---- 일주 ----
    var dayLunar = Solar.fromYmd(cY, cM, cD).getLunar();
    var dayIndex = LunarUtil.getJiaZiIndex(dayLunar.getDayInGanZhi());
    var ziOvernight = false;
    // 조자시설: 자시가 시작되는 23:30에 일주가 바뀐다 (30분 경계 표준과 동일)
    if (timeKnown && opts.ziRule !== '24' && (cH * 60 + cMi) >= JISI_START) {
      dayIndex = mod(dayIndex + 1, 60);
      ziOvernight = true;
    }
    var dayP = ganZhiOf(dayIndex);

    // ---- 시주 ----
    var timeP = null, zhiTimeIndex = null;
    if (timeKnown) {
      var hourBranch = jisiIndex(cH, cMi); // 30분 경계: 23:30~01:30 → 子
      zhiTimeIndex = hourBranch;
      var hourGan = mod(dayP.ganIndex * 2 + hourBranch, 10);
      timeP = {
        ganIndex: hourGan, zhiIndex: hourBranch,
        gan: GAN[hourGan], zhi: ZHI[hourBranch],
        ganKo: GAN_KO[hourGan], zhiKo: ZHI_KO[hourBranch],
        text: GAN[hourGan] + ZHI[hourBranch],
        textKo: GAN_KO[hourGan] + ZHI_KO[hourBranch]
      };
    }

    // ---- 오행 분포 ----
    var counts = { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 };
    var chars = [];
    function pushChar(p, pos) {
      if (!p) return;
      var elG = GAN_EL[p.ganIndex], elZ = ZHI_EL[p.zhiIndex];
      counts[elG] += 1; counts[elZ] += 1;
      chars.push({ pos: pos, gan: p.gan, zhi: p.zhi, ganEl: elG, zhiEl: elZ });
    }
    pushChar(yearP, 'year'); pushChar(monthP, 'month'); pushChar(dayP, 'day'); pushChar(timeP, 'time');

    var total = 0;
    for (var e in counts) total += counts[e];
    var percents = {};
    for (var e2 in counts) percents[e2] = total ? Math.round((counts[e2] / total) * 1000) / 10 : 0;

    // ---- 지장간 ----
    var hidden = {
      year: HIDDEN[yearP.zhi], month: HIDDEN[monthP.zhi], day: HIDDEN[dayP.zhi],
      time: timeP ? HIDDEN[timeP.zhi] : null
    };

    return {
      input: {
        name: (opts.name || '').trim(), gender: opts.gender || '',
        calendar: cal, y: y, m: m, d: d, leap: !!opts.leap,
        timeKnown: timeKnown, hh: timeKnown ? hh : null, mm: timeKnown ? mm : null,
        trueSolar: !!opts.trueSolar, dst: !!opts.dst, ziRule: opts.ziRule || '23',
        region: opts.region || 'seoul', longitude: opts.longitude
      },
      solar: { y: solarY, m: solarM, d: solarD },
      lunar: { y: lunarY, m: lunarM, d: lunarD, leap: lunarLeap, text: lunarText },
      pillars: { year: yearP, month: monthP, day: dayP, time: timeP },
      dayMaster: {
        ganIndex: dayP.ganIndex, gan: dayP.gan, ganKo: dayP.ganKo,
        element: GAN_EL[dayP.ganIndex], hun: GAN_HUN[dayP.ganIndex]
      },
      counts: counts, percents: percents, total: total,
      hidden: hidden,
      jieqi: {
        altYM: altYM,
        prev: { name: lastJie.meta.ko, hanja: lastJie.meta.hanja, at: epochToKstText(lastJie.epoch) },
        next: nextJie ? { name: nextJie.meta.ko, hanja: nextJie.meta.hanja, at: epochToKstText(nextJie.epoch) } : null,
        lichun: epochToKstText(lichun.epoch),
        yearBasis: yearNum
      },
      apply: {
        shiftMin: shiftMin, lonMin: Math.round(lonMin), dstMin: dstMin,
        ziOvernight: ziOvernight,
        correctedText: cY + '-' + pad(cM) + '-' + pad(cD) + ' ' + pad(cH) + ':' + pad(cMi)
      },
      raw: { year: yearP.text, month: monthP.text, day: dayP.text, time: timeP ? timeP.text : null }
    };
  }

  // 오늘의 일진 (같은 엔진 사용)
  function todayInfo(now) {
    var t = now || new Date();
    var y = t.getFullYear(), m = t.getMonth() + 1, d = t.getDate();
    var lunar = Solar.fromYmdHms(y, m, d, 12, 0, 0).getLunar();
    var idx = LunarUtil.getJiaZiIndex(lunar.getDayInGanZhi());
    var gz = ganZhiOf(idx);
    return {
      date: y + '년 ' + m + '월 ' + d + '일', ganZhi: gz,
      ganEl: GAN_EL[gz.ganIndex], zhiEl: ZHI_EL[gz.zhiIndex],
      lunarText: (lunar.getMonth() < 0 ? '윤' : '') + Math.abs(lunar.getMonth()) + '월 ' + lunar.getDay() + '일'
    };
  }

  // 검증용: 해당 연도의 12절 시각(한국 표준시) 목록
  function jieTable(year) {
    return buildJie(year).map(function (j) {
      return { name: j.meta.ko, hanja: j.meta.hanja, kst: epochToKstText(j.epoch) };
    });
  }

  // 검증용: 양력 날짜의 일진(자정 기준)
  function dayGanZhiOf(y, m, d) {
    var gz = ganZhiOf(LunarUtil.getJiaZiIndex(Solar.fromYmd(y, m, d).getLunar().getDayInGanZhi()));
    return gz.text;
  }

  global.Manse = {
    compute: compute, todayInfo: todayInfo, jieTable: jieTable, dayGanZhiOf: dayGanZhiOf, buildJie: buildJie,
    JISI: JISI, jisiIndex: jisiIndex, jisiOf: jisiOf,
    GAN: GAN, ZHI: ZHI, GAN_KO: GAN_KO, ZHI_KO: ZHI_KO, GAN_HUN: GAN_HUN,
    ZHI_ANIMAL: ZHI_ANIMAL, GAN_EL: GAN_EL, ZHI_EL: ZHI_EL, HIDDEN: HIDDEN,
    JIE: JIE, REGIONS: REGIONS, ganZhiOf: ganZhiOf
  };
})(typeof window !== 'undefined' ? window : globalThis);

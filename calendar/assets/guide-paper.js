/* ==========================================================
   📜 감정서 종이 렌더러 — 1080×1440 (3:4) · 페이지 · PDF · 공유 (2026-11-26 v3)
   · 두 감정서가 **같은 렌더러**를 쓴다.
       ① 관리자 '서비스용 감정서 직접 만들기' (/calendar/yoon-key/)
       ② 첫 3일(72시간) 특별 혜택 감정서 (손님 달력 앱 · 관리자 상세)
   · 원본은 언제나 '글'이다. 화면에서 고친 최종본(관리자 수정본)을 그대로 받아
     페이지 이미지 · PDF · 공유 파일을 모두 이 한 곳에서 만든다.
     그래서 화면에서 고친 글이 저장물에서 초안으로 되돌아가지 않는다.
   · 표지 전용 페이지도, 직인만 있는 페이지도 없다 (2026-11-26 #22071).
       1장 위: 제목 → 이름·생년월일시 → 개인 사주 원국(4기둥·대운/세운 없음) → 도입부 → 본문
       마지막 장: 마무리 문단 + ‘— 윤이세’ 서명 + 실제 직인(yoonise-seal.png)
     약 1,450자 기준 3~4장, 본문 42px · 줄 1.5배 · 좌우 여백 68px.
   · 페이지 나눔은 문단(블록) 단위이고, 한 문단이 길면 줄 단위로만 나눈다.
     문장 중간에서 잘리지 않고, 마지막 장에 서명만 홀로 남지 않는다.
   ========================================================== */
(function (global) {
  'use strict';

  /* ── 종이 크기 — A4 세로 비율 1240×1754 (표지·본문 같은 규격) ── */
  var W = 1240, H = 1754;
  var M = { x: 74, top: 64, bottom: 52 };

  var C = {
    bg: '#FBF7F0', ink: '#2A2622', body: '#332D27', soft: '#8C8279',
    gold: '#B08D57', goldDeep: '#8A5E22',
    hair: 'rgba(150,126,94,.30)', hairSoft: 'rgba(150,126,94,.18)'
  };
  var SANS = '"Pretendard","Pretendard Variable","Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR","Noto Sans CJK KR",system-ui,sans-serif';
  var SERIF = '"Nanum Myeongjo","NanumMyeongjo","Noto Serif KR","Noto Serif CJK KR","AppleMyungjo","SamsungMyeongjo","Batang","바탕",serif';

  /* 본문 42px · 줄 63px(1.5배) — A4 폭에서 한 줄 30자 남짓 */
  var F = {
    brand: '800 17px ' + SANS,
    title: '600 42px ' + SERIF,
    for: '400 26px ' + SANS,
    meta: '600 24px ' + SANS,
    greet: '500 34px ' + SANS, greetB: '700 34px ' + SANS,
    chap: '800 14px ' + SANS,
    head: '700 40px ' + SERIF, headB: '700 40px ' + SERIF,
    body: '400 42px ' + SANS, bodyB: '700 42px ' + SANS,
    item: '400 42px ' + SANS, itemB: '700 42px ' + SANS,
    sign: '600 38px ' + SERIF,
    foot: '600 15px ' + SANS,
    chartK: '800 16px ' + SANS,
    chartN: '600 14px ' + SANS,
    chartPos: '700 15px ' + SANS,
    chartTen: '800 16px ' + SANS,
    chartTenZ: '800 17px ' + SANS,
    chartHz: '600 32px ' + SERIF,
    chartHid: '600 18px ' + SERIF,
    chartNote: '600 15px ' + SANS
  };
  var LH = { title: 54, for: 36, meta: 32, greet: 62, head: 52, body: 63, item: 63, chap: 22 };

  /* 오행 색 — 관리자 원국 표와 같은 오방색 */
  var EL = {
    '목': { bg: '#EDF7E8', fg: '#33693D' },
    '화': { bg: '#FCE9EE', fg: '#A93B57' },
    '토': { bg: '#FAF0D9', fg: '#7E5D22' },
    '금': { bg: '#EFF1F4', fg: '#4A5461' },
    '수': { bg: '#E8F1F9', fg: '#2C5C83' }
  };
  /* 지장간 — 관리자 화면과 같은 표(저장된 스냅샷에 없는 글자를 원국에 얹는 데만 쓴다) */
  var HIDDEN = {
    '子': ['癸'], '丑': ['己', '癸', '辛'], '寅': ['甲', '丙', '戊'], '卯': ['乙'],
    '辰': ['戊', '乙', '癸'], '巳': ['丙', '戊', '庚'], '午': ['丁', '己'], '未': ['己', '丁', '乙'],
    '申': ['庚', '壬', '戊'], '酉': ['辛'], '戌': ['戊', '辛', '丁'], '亥': ['壬', '甲']
  };
  var GAN_EL = { '甲': '목', '乙': '목', '丙': '화', '丁': '화', '戊': '토', '己': '토', '庚': '금', '辛': '금', '壬': '수', '癸': '수' };
  var ZHI_EL = { '子': '수', '丑': '토', '寅': '목', '卯': '목', '辰': '토', '巳': '화', '午': '화', '未': '토', '申': '금', '酉': '금', '戌': '토', '亥': '수' };
  var CHART_H = 234;                 /* 원국 상자 높이 */
  /* 1:1 상담 신청서 — 감정서 마지막 장 버튼이 가리키는 곳 (QR 없이 바로 연결) */
  var APPLY_URL = 'https://ksy7900-star.github.io/yoonise-oheng-aroma/apply/';
  var CTA_LABEL = '윤이세 1:1 맞춤 상담 알아보기 →';
  var CTA_BTN_Y = 320;               /* 상담 블록 위에서 잰 버튼 위치 */
  var CTA_BTN_H = 68;
  var CTA_BOTTOM = CTA_BTN_Y + CTA_BTN_H + 8;

  var SEAL_DEFAULT = 'assets/yoonise-seal.png';

  /* ── 글 다루기 ─────────────────────────────────────────── */

  function runsOf(text) {
    var parts = String(text == null ? '' : text).split('**');
    var out = [];
    for (var i = 0; i < parts.length; i++) if (parts[i] !== '') out.push({ t: parts[i], b: i % 2 === 1 });
    if (!out.length) out = [{ t: '', b: false }];
    return out;
  }
  function runsText(rs) { return (rs || []).map(function (r) { return r.t; }).join(''); }

  /* 글 → 블록. 머리글·꼬리글·CHAPTER 는 여기서 새로 매긴다. */
  function parse(text) {
    var lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
    var out = [], seen = 0;
    lines.forEach(function (line) {
      var t = line.replace(/\s+$/, '').trim();
      if (!t) return;
      var type = 'body';
      if (seen === 0 && /^『.*』$/.test(t)) type = 'title';
      else if (/님을 위한 개인 맞춤 감정서$/.test(t)) type = 'for';
      else if (/^안녕하세요,/.test(t)) type = 'greet';
      else if (/^[1-5]\.\s/.test(t)) type = 'head';
      else if (/^[①②③④⑤]/.test(t)) type = 'item';
      else if (/^[—–―-]\s*윤이세\s*$/.test(t)) type = 'sign';
      out.push({ type: type, text: t, runs: runsOf(t) });
      seen += 1;
    });
    return normalize(out);
  }

  /* 블록 배열(관리자 화면의 종이 DOM 에서 읽은 것)도 같은 모양으로 맞춘다 */
  function normalize(list) {
    var out = [];
    (list || []).forEach(function (b) {
      if (!b) return;
      if (b.type === 'brand' || b.type === 'foot' || b.type === 'chap') return;
      var text = b.text != null ? String(b.text) : runsText(b.runs);
      if (!text.trim()) return;
      out.push({ type: b.type || 'body', text: text, runs: b.runs && b.runs.length ? b.runs : runsOf(text) });
    });
    /* 소제목 번호(1. 2. …)는 본문에 이미 있다 — CHAPTER 줄을 또 넣지 않는다(2026-11-26).
       장을 줄이고 같은 말을 두 번 쓰지 않기 위해서다. 소제목은 위 여백과 금선으로 구분한다. */
    /* 서명이 없으면 붙인다 — 직인은 마지막 장에만, 마무리 글과 함께 */
    if (!out.some(function (b) { return b.type === 'sign'; })) {
      out.push({ type: 'sign', text: '— 윤이세' });
    }
    return out;
  }

  function blocks(input) {
    if (typeof input === 'string') return parse(input);
    if (Object.prototype.toString.call(input) === '[object Array]') return normalize(input);
    return [];
  }
  /* 제목·‘…님을 위한’ 줄은 1장 머리에서 한 번만 그린다 — 본문 흐름에서는 뺀다 */
  function bodyOf(list) {
    var seenTitle = false, seenFor = false, out = [];
    list.forEach(function (b) {
      if (b.type === 'title' && !seenTitle) { seenTitle = true; return; }
      if (b.type === 'for' && !seenFor) { seenFor = true; return; }
      out.push(b);
    });
    return out;
  }

  /* ── 줄 나누기 (측정) ─────────────────────────────────── */
  function wrap(m, rs, maxW, reg, bold) {
    var chars = [];
    (rs || []).forEach(function (r) {
      var t = String(r.t || '');
      for (var i = 0; i < t.length; i++) {
        var f = r.b ? bold : reg;
        m.font = f;
        chars.push({ c: t.charAt(i), b: !!r.b, w: m.measureText(t.charAt(i)).width });
      }
    });
    var lines = [], line = [], lineW = 0;
    function flush() { if (line.length) lines.push(line); line = []; lineW = 0; }
    var i = 0;
    while (i < chars.length) {
      if (chars[i].c === '\n') { flush(); i++; continue; }
      var word = [], w = 0;
      while (i < chars.length && chars[i].c !== '\n') {
        word.push(chars[i]); w += chars[i].w;
        var sp = chars[i].c === ' ';
        i++;
        if (sp) break;
      }
      if (!word.length) continue;
      if (lineW > 0 && lineW + w > maxW) { flush(); }
      if (w > maxW) {
        for (var k = 0; k < word.length; k++) {
          if (lineW > 0 && lineW + word[k].w > maxW) flush();
          line.push(word[k]); lineW += word[k].w;
        }
      } else {
        for (var j = 0; j < word.length; j++) line.push(word[j]);
        lineW += w;
      }
    }
    flush();
    return lines.map(function (ln) {
      var segs = [], cur = null;
      ln.forEach(function (ch) {
        if (!cur || cur.b !== ch.b) { cur = { b: ch.b, t: '' }; segs.push(cur); }
        cur.t += ch.c;
      });
      if (segs.length) segs[segs.length - 1].t = segs[segs.length - 1].t.replace(/\s+$/, '');
      if (segs.length) segs[0].t = segs[0].t.replace(/^\s+/, '');
      var w = 0;
      segs.forEach(function (sg) { w += measureSeg(m, sg, reg, bold); });
      return { segs: segs, w: w };
    });
  }
  function measureSeg(m, sg, reg, bold) {
    m.font = sg.b ? bold : reg;
    return m.measureText(sg.t).width;
  }
  function wrapPlain(m, text, maxW, font) {
    m.font = font;
    var words = String(text).split(' ');
    var lines = [], cur = '';
    words.forEach(function (wd) {
      var trial = cur ? cur + ' ' + wd : wd;
      if (cur && m.measureText(trial).width > maxW) { lines.push(cur); cur = wd; }
      else cur = trial;
    });
    if (cur) lines.push(cur);
    return lines;
  }

  function textOp(segs, x, y, reg, bold, color, align, ls) {
    /* y 는 상자 위에서 잰 기준선 위치다 — 그리는 순간의 상자 y 에 더해 쓴다.
       (페이지마다 자리가 달라지므로 만든 때의 절대 y 는 의미가 없다) */
    return function (c, yy) {
      var by = (yy == null ? 0 : yy) + (y || 0);
      var total = 0;
      segs.forEach(function (sg) { total += measureSeg(c, sg, reg, bold); });
      var cx = align === 'center' ? x - total / 2 : (align === 'right' ? x - total : x);
      segs.forEach(function (sg) {
        c.font = sg.b ? bold : reg;
        c.fillStyle = color;
        c.textAlign = 'left';
        try { c.letterSpacing = (ls || 0) + 'px'; } catch (e) { }
        c.fillText(sg.t, cx, by);
        try { c.letterSpacing = '0px'; } catch (e) { }
        c.font = sg.b ? bold : reg;
        cx += c.measureText(sg.t).width;
      });
    };
  }

  /* ── 사주 원국 (첫 장 위) ───────────────────────────────
     관리자 화면(/calendar/yoon-key/)의 원국 표와 같은 배열·색을 쓴다.
     시 | 일 | 월 | 년 · 십성 → 천간 → 지지 → 지지 십성 → 지장간.
     대운·세운은 넣지 않는다. 태어난 시각을 모르면 시주 칸은 비우고 ‘모름’으로 둔다. */
  function elOf(p, which) {
    if (!p) return '토';
    if (which === 'gan') return p.gan_el || GAN_EL[p.gan] || '토';
    return p.zhi_el || ZHI_EL[p.zhi] || '토';
  }
  function roundRect(c, x, y, w, h, r) {
    var rr = Math.min(r, h / 2, w / 2);
    c.beginPath();
    c.moveTo(x + rr, y);
    c.arcTo(x + w, y, x + w, y + h, rr);
    c.arcTo(x + w, y + h, x, y + h, rr);
    c.arcTo(x, y + h, x, y, rr);
    c.arcTo(x, y, x + w, y, rr);
    c.closePath();
  }
  function glyphPill(c, x, y, w, h, ch, el, missing, big) {
    var e = EL[el] || EL['토'];
    var fs = big ? F.chartHz : F.chartTen;
    c.font = fs;
    roundRect(c, x, y, w, h, big ? 9 : 7);
    c.fillStyle = missing ? '#F4F5F7' : e.bg;
    c.fill();
    if (big) { c.strokeStyle = 'rgba(150,126,94,.18)'; c.lineWidth = 1; c.stroke(); }
    c.fillStyle = missing ? '#B9BEC6' : e.fg;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(ch || '—', x + w / 2, y + h / 2 + (big ? 1 : 0));
    c.textBaseline = 'alphabetic';
  }

  function drawChart(c, x, y, w, saju) {
    var cols = [['time', '시'], ['day', '일'], ['month', '월'], ['year', '년']];
    var p = saju && saju.pillars ? saju.pillars : {};
    var known = !saju || saju.time_known !== false;

    roundRect(c, x, y, w, CHART_H, 12);
    c.fillStyle = '#FFFDF8'; c.fill();
    c.strokeStyle = 'rgba(150,126,94,.26)'; c.lineWidth = 1.2; c.stroke();

    c.font = F.chartK; c.fillStyle = C.goldDeep; c.textAlign = 'left';
    c.fillText('사주 원국', x + 20, y + 30);
    c.font = F.chartN; c.fillStyle = C.soft; c.textAlign = 'right';
    c.fillText('지장간 · 지지 속에 숨어 있는 기운', x + w - 20, y + 30);

    var pad = 18, gap = 8, colW = (w - pad * 2 - gap * 3) / 4;
    var top = y + 38;
    cols.forEach(function (col, i) {
      var k = col[0], v = p[k] || null;
      var isDay = k === 'day';
      var x0 = x + pad + i * (colW + gap);
      var miss = !v;
      c.textAlign = 'center';
      /* 자리 이름 */
      c.font = F.chartPos; c.fillStyle = C.soft;
      c.fillText(col[1], x0 + colW / 2, top + 10);
      /* 천간 십성 (일간 자리는 '일원') */
      c.font = F.chartTen;
      roundRect(c, x0, top + 17, colW, 26, 8);
      c.fillStyle = miss ? '#F4F5F7' : (isDay ? '#EFE0C0' : '#F7EEDC');
      c.fill();
      c.fillStyle = miss ? '#B9BEC6' : (isDay ? '#6B3A05' : '#7A4A0B');
      c.textBaseline = 'middle';
      c.fillText(miss ? (k === 'time' && !known ? '모름' : '—') : (isDay ? '일원' : (v.ten_gan || '—')), x0 + colW / 2, top + 32);
      c.textBaseline = 'alphabetic';
      /* 천간 · 지지 */
      glyphPill(c, x0, top + 47, colW, 40, v ? v.gan : '', elOf(v, 'gan'), miss, true);
      glyphPill(c, x0, top + 91, colW, 40, v ? v.zhi : '', elOf(v, 'zhi'), miss, true);
      /* 지지 십성 — 지지 바로 아래 */
      c.textAlign = 'center';
      c.font = F.chartTenZ;
      c.fillStyle = miss ? '#C7CBD1' : '#7A4A0B';
      c.fillText(miss ? '—' : (v.ten_zhi || '—'), x0 + colW / 2, top + 156);
      /* 지장간 */
      c.font = F.chartHid;
      var hid = v && HIDDEN[v.zhi] ? HIDDEN[v.zhi] : [];
      if (!hid.length) {
        c.fillStyle = '#C7CBD1';
        c.fillText('—', x0 + colW / 2, top + 182);
      } else {
        var parts = [], hw = 0;
        hid.forEach(function (h) { var tw = c.measureText(h).width; parts.push({ h: h, w: tw }); hw += tw + 4; });
        var hx = x0 + colW / 2 - (hw - 4) / 2;
        c.textAlign = 'left';
        parts.forEach(function (t) {
          c.fillStyle = (EL[GAN_EL[t.h]] || EL['토']).fg;
          c.fillText(t.h, hx, top + 182);
          hx += t.w + 4;
        });
      }
    });
  }

  function sajuInfo(opts) { return !!(opts && opts.saju && opts.saju.pillars); }
  /** 이름 · 성별 · 생년월일 · 시각 — 원국 위 한 줄 (원국 자료만 있을 때) */
  function metaFromSnapshot(s) {
    if (!s) return '';
    var p = [];
    if (s.name) p.push(s.name + ' 님');
    if (s.gender) p.push(s.gender);
    if (s.solar && s.solar.y) p.push(s.solar.y + '.' + s.solar.m + '.' + s.solar.d + ' (양력)');
    if (s.time_known === false) p.push('태어난 시각 모름');
    return p.join(' · ');
  }

  /* ── 첫 장 위 머리 — 제목 → 이름·생년월일시 → 원국 ───────── */
  function buildHead(m, list, opts) {
    var ops = [];
    var y = M.top;
    var maxW = W - M.x * 2;
    var title = opts.title || '';
    var forLine = '';
    list.forEach(function (b) {
      if (!title && b.type === 'title') title = b.text;
      else if (!forLine && b.type === 'for') forLine = b.text;
    });
    title = String(title || '').replace(/^『|』$/g, '');
    if (title) {
      var tl = wrapPlain(m, title, maxW - 40, F.title);
      if (tl.length > 2) tl = [tl[0], tl.slice(1).join(' ')];
      tl.forEach(function (t) {
        ops.push({ y: y + 34, draw: textOp([{ t: t, b: false }], W / 2, 0, F.title, F.title, C.ink, 'center', 0) });
        y += LH.title;
      });
      y += 14;
    }
    if (forLine) {
      ops.push({ y: y + 16, draw: textOp([{ t: forLine, b: false }], W / 2, 0, F.for, F.for, C.soft, 'center', 0) });
      y += LH.for;
    }
    var meta = String(opts.meta || '').trim();
    if (!meta && sajuInfo(opts)) meta = metaFromSnapshot(opts.saju);
    if (meta) {
      wrapPlain(m, meta, maxW - 20, F.meta).forEach(function (t) {
        ops.push({ y: y + 19, draw: textOp([{ t: t, b: false }], W / 2, 0, F.meta, F.meta, '#6B6157', 'center', 0) });
        y += LH.meta;
      });
    }
    var saju = opts.saju || null;
    if (saju && saju.pillars) {
      y += 10;
      ops.push({ y: y, h: CHART_H, draw: function (c, yy) { drawChart(c, M.x, yy, maxW, saju); } });
      y += CHART_H;
    }
    y += 14;
    return { ops: ops, height: y - M.top };
  }

  /** 한 줄 상자(h) 안에서 글자를 제자리에 놓는 그리기 — 기준선을 상자 아래쪽에 둔다 */
  function lineOp(segs, x, h, size, reg, bold, color, align, ls) {
    return textOp(segs, x, h / 2 + size * 0.36, reg, bold, color, align, ls);
  }

  /* ── 블록 → 줄 단위 그리기 단위 ─────────────────────────
     각 단위는 높이(h)와 draw(c, y) 만 가진다. 페이지 나눔은 이 높이만 본다. */
  function blockUnits(m, b) {
    var maxW = W - M.x * 2;
    var before = 0, after = 0, units = [];

    if (b.type === 'greet') {
      wrap(m, b.runs, maxW, F.greet, F.greetB).forEach(function (ln) {
        units.push({ h: LH.greet, draw: lineOp(ln.segs, M.x, LH.greet, 30, F.greet, F.greetB, C.ink, 'left', 0) });
      });
      return { units: units, before: 4, after: 16 };
    }
    if (b.type === 'chap') {
      units.push({ h: LH.chap, draw: function (c, y) {
        c.font = F.chap; c.fillStyle = C.gold; c.textAlign = 'left';
        try { c.letterSpacing = '5px'; } catch (e) { }
        c.fillText(b.text, M.x, y + 16);
        try { c.letterSpacing = '0px'; } catch (e) { }
      } });
      return { units: units, before: 16, after: 6 };
    }
    if (b.type === 'head') {
      var hi = 0;
      wrap(m, b.runs, maxW, F.head, F.headB).forEach(function (ln) {
        units.push({ h: LH.head, draw: (function (ln2, first) {
          return function (c, y) {
            if (first) {
              c.fillStyle = C.gold; c.globalAlpha = .7;
              c.fillRect(M.x, y + 2, 34, 2);
              c.globalAlpha = 1;
            }
            lineOp(ln2.segs, M.x, LH.head, 38, F.head, F.headB, C.ink, 'left', 0)(c, y);
          };
        })(ln, hi++ === 0) });
      });
      return { units: units, before: 20, after: 10 };
    }
    if (b.type === 'item') {
      var rs = b.runs.slice(), mark = '';
      if (rs.length && rs[0].t) {
        var s0 = rs[0].t;
        if (/^[①②③④⑤]/.test(s0)) {
          mark = s0.charAt(0);
          rs[0] = { t: s0.slice(1), b: rs[0].b };
          if (!rs[0].t) rs.shift();
        }
      }
      var indent = 46, lh = LH.item;
      var first = true;
      wrap(m, rs, maxW - indent, F.item, F.itemB).forEach(function (ln) {
        units.push({ h: lh, draw: (function (ln2, isFirst) {
          return function (c, y) {
            if (isFirst && mark) {
              c.font = F.item; c.fillStyle = C.body; c.textAlign = 'left';
              c.fillText(mark, M.x, y);
            }
            lineOp(ln2.segs, M.x + indent, lh, 42, F.item, F.itemB, C.body, 'left', 0)(c, y);
          };
        })(ln, first) });
        first = false;
      });
      return { units: units, before: 0, after: 10 };
    }
    if (b.type === 'sign') {
      var sealW = 196, sealH = Math.round(sealW * 381 / 720);
      var name = (b.text || '— 윤이세').replace(/\s+/g, ' ').trim();
      /* 마지막 장 — 서명·직인 아래에 1:1 상담 블록 (2026-11-26 #22119 · #22132 예시 그대로) */
      var u = { h: 34 + CTA_BOTTOM, draw: function (c, y) {
        c.fillStyle = C.hair; c.fillRect(M.x, y + 4, W - M.x * 2, 1);
        var ny = y + 86;
        c.font = F.sign; c.fillStyle = C.ink; c.textAlign = 'left';
        var nw = c.measureText(name).width;
        var sx = Math.max(M.x, (W - (nw + 22 + sealW)) / 2);
        c.fillText(name, sx, ny);
        if (SIGN.seal) {
          c.save();
          c.translate(sx + nw + 22 + sealW / 2, ny - sealH / 2 + 12);
          c.rotate(-4 * Math.PI / 180);
          c.globalAlpha = .96;
          c.drawImage(SIGN.seal, -sealW / 2, -sealH / 2, sealW, sealH);
          c.restore();
          c.globalAlpha = 1;
        }
        drawCta(c, y);
      } };
      return { units: [u], before: 26, after: 0, cta: { x: M.x, y: CTA_BTN_Y, w: W - M.x * 2, h: CTA_BTN_H } };
    }
    /* body */
    wrap(m, b.runs, maxW, F.body, F.bodyB).forEach(function (ln) {
      units.push({ h: LH.body, draw: lineOp(ln.segs, M.x, LH.body, 42, F.body, F.bodyB, C.body, 'left', 0) });
    });
    return { units: units, before: 0, after: 10 };
  }

  var SIGN = { seal: null };

  function loadSeal(src) {
    if (SIGN.seal) return Promise.resolve(SIGN.seal);
    return new Promise(function (res) {
      if (typeof Image !== 'function') { res(null); return; }
      var img = new Image();
      img.onload = function () { SIGN.seal = img; res(img); };
      img.onerror = function () { res(null); };   /* 직인을 못 읽어도 글은 나가야 한다 */
      img.src = src || SEAL_DEFAULT;
    });
  }
  function fontsReady() {
    try {
      if (document.fonts && document.fonts.ready) return document.fonts.ready.then(function () { }, function () { });
    } catch (e) { }
    return Promise.resolve();
  }

  /* ── 페이지 나눔 ────────────────────────────────────────
     마지막 문단과 서명·직인은 반드시 같은 장에 둔다 — 직인만 남는 장을 만들지 않는다. */
  function paginate(m, list, headH, k) {
    var pages = [], cur = null;
    var bottom = H - M.bottom;
    var startY = M.top + (headH || 0);
    function limitFor(i) {
      if (!k) return bottom;
      var room = (bottom - M.top) - (i === 0 ? (headH || 0) : 0);
      return (i === 0 ? M.top + (headH || 0) : M.top) + room * k;
    }
    function open(start) { cur = { ops: [], y: start == null ? M.top : start, filled: 0 }; pages.push(cur); }
    open(startY);

    var signBlock = null;
    list.forEach(function (b) { if (b.type === 'sign') signBlock = b; });

    list.forEach(function (b, bi) {
      var lim = limitFor(pages.length - 1);
      if (b.type === 'sign') {
        var Bs = blockUnits(m, b), hs = 0;
        Bs.units.forEach(function (u) { hs += u.h; });
        var limS = limitFor(pages.length - 1);
        cur.textEnd = cur.y;                 /* 서명 앞까지의 글 끝 — 마지막 장 밀도 계산에 쓴다 */
        var y0 = cur.y + Bs.before;
        var low = limS - hs - 8;
        if (y0 < low && (low - y0) <= 240) y0 = low;   /* 남는 자리가 조금이면 아래에 붙인다 */
        if (y0 + hs > limS) {
          if (cur.filled > 0) { open(); y0 = M.top + Bs.before; }
        }
        var signTop = y0;
        Bs.units.forEach(function (u) { cur.ops.push({ y: y0, h: u.h, draw: u.draw }); y0 += u.h; });
        cur.y = y0;
        cur.filled += 1;
        if (Bs.cta) {
          /* 상담 버튼 자리 — PDF 링크·앱 링크가 이 사각형 위에 얹힌다 */
          cur.cta = { x: Bs.cta.x, y: signTop + Bs.cta.y, w: Bs.cta.w, h: Bs.cta.h };
        }
        return;
      }
      var B = blockUnits(m, b);
      /* 이 블록이 마지막 본문이고 뒤에 서명이 오면, 둘이 같이 들어갈 자리를 미리 본다 */
      var tail = 0;
      if (signBlock && bi === list.length - 2) {
        var SB = blockUnits(m, signBlock);
        tail = SB.before;
        SB.units.forEach(function (u) { tail += u.h; });
      }
      var remain = B.units.slice();
      var firstChunk = true;
      var guard = 0;
      while (remain.length && guard++ < 400) {
        lim = limitFor(pages.length - 1);
        var beforeY = firstChunk ? B.before : 0;
        var avail = lim - (cur.y + beforeY) - (remain.length === B.units.length ? tail : 0);
        var fit = 0, acc = 0;
        for (var i = 0; i < remain.length; i++) {
          if (acc + remain[i].h > avail) break;
          acc += remain[i].h; fit += 1;
        }
        /* 소제목이 종이 맨 아래에 홀로 남지 않게 — 제목 + 본문 두 줄은 같이 들어가야 한다 */
        if (firstChunk && b.type === 'head') {
          var need = acc + B.after + 100;
          if (cur.y + beforeY + need > lim && cur.filled > 0) { open(); continue; }
        }
        /* 한 줄만 남기고 넘기는 모양을 피한다 — 두 줄 미만이면 통째로 다음 장 */
        var orphan = (fit > 0 && fit < remain.length && fit < 2 && remain.length >= 3);
        if (fit === 0 || orphan) {
          if (cur.filled > 0) { open(); continue; }
          fit = 1;
        }
        cur.y += beforeY;
        for (var kk = 0; kk < fit; kk++) {
          var u = remain[kk];
          cur.ops.push({ y: cur.y, h: u.h, draw: u.draw });
          cur.y += u.h;
        }
        cur.filled += fit;
        remain = remain.slice(fit);
        firstChunk = false;
        if (remain.length) { open(); }
      }
      cur.y += (remain.length ? 0 : B.after);
    });
    return pages;
  }

  /** 자연스러운 나눔 — 마지막 장이 너무 비면, 같은 장 수 안에서 고르게 나눠 본다 */
  function layoutPages(m, list, headH) {
    var natural = paginate(m, list, headH);
    if (natural.length < 3) return natural;
    var bottom = H - M.bottom;
    function fill(pg, i) {
      var top0 = i === 0 ? M.top + headH : M.top;
      return (pg.y - top0) / (bottom - top0);
    }
    function textFill(pg, i) {
      var top0 = i === 0 ? M.top + headH : M.top;
      var end = pg.textEnd || pg.y;
      return (end - top0) / (bottom - top0);
    }
    var last = textFill(natural[natural.length - 1], natural.length - 1);
    if (last >= 0.55) return natural;
    var best = natural;
    var ks = [0.96, 0.93, 0.90, 0.87, 0.84, 0.81];
    for (var i = 0; i < ks.length; i++) {
      var alt = paginate(m, list, headH, ks[i]);
      if (alt.length !== natural.length) continue;
      var f = textFill(alt[alt.length - 1], alt.length - 1);
      if (f > textFill(best[best.length - 1], best.length - 1)) best = alt;
      if (f >= 0.6) break;          /* 고르게 나뉘었으면 거기서 멈춘다 — 아래를 비우지 않게 */
    }
    return best;
  }

  /* ── 종이 한 장 그리기 ────────────────────────────────── */
  function newCanvas(w, h, scale) {
    var cv = document.createElement('canvas');
    scale = scale || 1;
    cv.width = Math.round(w * scale);
    cv.height = Math.round(h * scale);
    var c = cv.getContext('2d');
    if (!c) throw new Error('이 브라우저에서는 이미지를 만들 수 없어요 — 다른 브라우저로 열어 주세요.');
    c.setTransform(scale, 0, 0, scale, 0, 0);
    c.textBaseline = 'alphabetic';
    return { cv: cv, c: c };
  }
  function paperBase(c, w, h) {
    c.fillStyle = C.bg;
    c.fillRect(0, 0, w, h);
    var g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(255,253,248,.94)');
    g.addColorStop(.42, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(233,222,205,.34)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(150,126,94,.32)'; c.lineWidth = 1.6;
    c.strokeRect(26, 26, w - 52, h - 52);
    c.strokeStyle = 'rgba(150,126,94,.14)'; c.lineWidth = 1;
    c.strokeRect(36, 36, w - 72, h - 72);
  }

  /* 상담 블록 — 얇은 선 · PRIVATE CONSULTATION · 두 줄 제안 · 네이비 버튼 */
  function drawCta(c, y) {
    var mid = W / 2, inner = W - M.x * 2;
    /* 구분선 */
    c.fillStyle = C.hair; c.fillRect(M.x, y + 118, inner, 1);
    /* 라벨 */
    c.font = '800 16px ' + SANS; c.fillStyle = C.gold; c.textAlign = 'center';
    try { c.letterSpacing = '6px'; } catch (e) { }
    c.fillText('PRIVATE CONSULTATION', mid + 3, y + 150);
    try { c.letterSpacing = '0px'; } catch (e) { }
    /* 제목 두 줄 */
    c.font = '600 34px ' + SERIF; c.fillStyle = C.ink;
    c.fillText('당신의 방향이 조금 더', mid, y + 196);
    c.fillText('선명해지도록', mid, y + 234);
    /* 안내 두 줄 */
    c.font = '400 23px ' + SANS; c.fillStyle = '#6B6157';
    c.fillText('지금 고민하고 있는 선택이 있다면,', mid, y + 272);
    c.fillText('윤이세와 함께 조금 더 깊이 살펴보세요.', mid, y + 302);
    /* 네이비 버튼 */
    var bx = M.x, by = y + CTA_BTN_Y, bw = inner, bh = CTA_BTN_H;
    roundRect(c, bx, by, bw, bh, 14);
    c.fillStyle = '#16233A'; c.fill();
    c.font = '800 27px ' + SANS; c.fillStyle = '#E9C98D';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(CTA_LABEL, mid, by + bh / 2 + 1);
    c.textBaseline = 'alphabetic';
  }

  function drawPage(page, no, total, scale, head) {
    var o = newCanvas(W, H, scale), c = o.c;
    paperBase(c, W, H);
    if (no === 1 && head) head.ops.forEach(function (op) { op.draw(c, op.y); });
    page.ops.forEach(function (op) { op.draw(c, op.y); });
    /* 꼬리 — 반복되는 머리글 대신 아래에 작게 한 줄만 */
    var fy = H - 48;
    c.fillStyle = C.hairSoft;
    c.fillRect(M.x, fy - 24, W - M.x * 2, 1);
    c.font = F.foot; c.fillStyle = 'rgba(140,130,121,.9)';
    c.textAlign = 'left';
    c.fillText('윤이세사주', M.x, fy);
    c.textAlign = 'right';
    c.fillText(no + ' / ' + total, W - M.x, fy);
    if (page.cta) o.cv.__cta = page.cta;   /* PDF 링크·앱 버튼이 쓸 자리 */
    return o.cv;
  }

  /* ── 표지 1장 — 공식 고정 템플릿 (2026-11-26 #22153) ─────────
     생성할 때마다 문구·글꼴·크기·여백·직인 자리를 바꾸지 않는다. 개인 이름은 넣지 않는다. */
  function drawCover(scale) {
    var o = newCanvas(W, H, scale), c = o.c;
    paperBase(c, W, H);
    /* 이중 골드 테두리 */
    c.strokeStyle = 'rgba(176,141,87,.55)'; c.lineWidth = 2;
    c.strokeRect(70, 70, W - 140, H - 140);
    c.strokeStyle = 'rgba(176,141,87,.30)'; c.lineWidth = 1.2;
    c.strokeRect(86, 86, W - 172, H - 172);

    c.textAlign = 'center';
    /* YOONISE */
    c.font = '800 40px ' + SANS; c.fillStyle = C.gold;
    try { c.letterSpacing = '18px'; } catch (e) { }
    c.fillText('YOONISE', W / 2 + 9, 320);
    try { c.letterSpacing = '0px'; } catch (e) { }

    /* 2027 — 가장 크게, 얇은 명조 */
    c.font = '400 168px ' + SERIF; c.fillStyle = C.ink;
    try { c.letterSpacing = '6px'; } catch (e) { }
    c.fillText('2027', W / 2 + 3, 590);
    try { c.letterSpacing = '0px'; } catch (e) { }

    /* 제목 두 줄 */
    c.font = '600 56px ' + SERIF; c.fillStyle = C.ink;
    c.fillText('2027년 맞춤 운세 활용', W / 2, 700);
    c.fillText('가이드', W / 2, 770);

    /* 짧은 금선 */
    c.fillStyle = 'rgba(176,141,87,.65)';
    c.fillRect(W / 2 - 30, 830, 60, 2);

    /* 한 해의 길잡이 */
    c.font = '500 40px ' + SANS; c.fillStyle = '#6B6157';
    c.fillText('윤이세가 직접 전하는 한 해의 길잡이', W / 2, 930);

    /* 두 줄 */
    c.font = '500 40px ' + SANS; c.fillStyle = C.ink;
    c.fillText('당신의 선택에 지혜를,', W / 2, 1022);
    c.fillText('걸어가는 길에 행운을.', W / 2, 1082);

    /* 실제 서명·직인 — 원본 PNG 를 비율 그대로 */
    var sealW = 300, sealH = Math.round(sealW * 381 / 720);
    if (SIGN.seal) {
      c.save();
      c.translate(W / 2, 1318);
      c.rotate(-4 * Math.PI / 180);
      c.globalAlpha = .96;
      c.drawImage(SIGN.seal, -sealW / 2, -sealH / 2, sealW, sealH);
      c.restore();
      c.globalAlpha = 1;
    }

    /* — 윤이세 */
    c.font = '600 54px ' + SERIF; c.fillStyle = C.ink;
    c.fillText('— 윤이세', W / 2, 1500);

    /* 윤이세사주 */
    c.font = '700 26px ' + SANS; c.fillStyle = 'rgba(140,130,121,.95)';
    c.fillText('윤이세사주', W / 2, 1676);
    return o.cv;
  }

  /* ── 저장 파일 만들기 ─────────────────────────────────── */
  function toBlob(cv, type, q) {
    return new Promise(function (res, rej) {
      function fail() { rej(new Error('이미지를 만들지 못했어요 — 다시 시도해 주세요.')); }
      try {
        if (cv.toBlob) { cv.toBlob(function (b) { if (b && b.size > 0) res(b); else fail(); }, type || 'image/png', q); return; }
        var bin = atob(cv.toDataURL(type || 'image/png', q).split(',')[1]);
        var u8 = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        res(new Blob([u8], { type: type || 'image/png' }));
      } catch (e) { fail(); }
    });
  }
  function blobBytes(blob) {
    if (blob.arrayBuffer) return blob.arrayBuffer().then(function (b) { return new Uint8Array(b); });
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(new Uint8Array(fr.result)); };
      fr.onerror = function () { rej(new Error('파일을 읽지 못했어요.')); };
      fr.readAsArrayBuffer(blob);
    });
  }

  /* ── PDF — 페이지 이미지를 그대로 담는다 (3:4 비율 540×720pt) ─────
     이미지와 PDF 가 같은 그림·같은 장 구성이 된다. 외부 라이브러리 없이 만든다. */
  function buildPdf(jpegs, links) {
    var wPt = 620, hPt = 877;   /* 1240×1754 의 절반 — A4 세로 비율 그대로 */
    var enc = new TextEncoder();
    var parts = [], len = 0, offsets = [];
    function push(x) {
      var u = typeof x === 'string' ? enc.encode(x) : x;
      parts.push(u); len += u.length;
    }
    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    function obj(n, head, stream) {
      offsets[n] = len;
      push(n + ' 0 obj\n' + head + '\n');
      if (stream) { push('stream\n'); push(stream); push('\nendstream\n'); }
      push('endobj\n');
    }
    var n = jpegs.length;
    var byPage = {};
    (links || []).forEach(function (l) { if (l && l.rect) byPage[l.page] = l; });
    var annotNo = 3 + n * 3;          /* 페이지 객체 뒤에 링크 객체를 붙인다 */
    var used = 0;
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    var kids = [];
    for (var i = 0; i < n; i++) kids.push((3 + i * 3) + ' 0 R');
    obj(2, '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + n + ' >>');
    for (var k = 0; k < n; k++) {
      var pg = 3 + k * 3, im = pg + 1, ct = pg + 2;
      var lnk = byPage[k];
      var annots = '';
      if (lnk) {
        /* 캔버스 좌표(1240×1754) → PDF 좌표(620×877, 아래에서 위로) */
        var sx = wPt / W, sy = hPt / H;
        var x1 = lnk.rect.x * sx, x2 = (lnk.rect.x + lnk.rect.w) * sx;
        var y1 = hPt - (lnk.rect.y + lnk.rect.h) * sy, y2 = hPt - lnk.rect.y * sy;
        annots = ' /Annots [' + annotNo + ' 0 R]';
        lnk._rect = [x1, y1, x2, y2];
      }
      obj(pg, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + wPt + ' ' + hPt +
        '] /Resources << /XObject << /Im0 ' + im + ' 0 R >> >> /Contents ' + ct + ' 0 R' + annots + ' >>');
      offsets[im] = len;
      push(im + ' 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + W + ' /Height ' + H +
        ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpegs[k].length + ' >>\nstream\n');
      push(jpegs[k]);
      push('\nendstream\nendobj\n');
      var content = 'q ' + wPt + ' 0 0 ' + hPt + ' 0 0 cm /Im0 Do Q';
      obj(ct, '<< /Length ' + content.length + ' >>', content);
      if (lnk) {
        var r = lnk._rect.map(function (v) { return Math.round(v * 100) / 100; });
        obj(annotNo, '<< /Type /Annot /Subtype /Link /Rect [' + r.join(' ') + '] /Border [0 0 0]' +
          ' /F 4 /A << /S /URI /URI (' + APPLY_URL + ') >> >>');
        annotNo += 1; used += 1;
      }
    }
    var xref = len;
    var total = 2 + n * 3 + used;
    var x = 'xref\n0 ' + (total + 1) + '\n0000000000 65535 f \n';
    for (var j = 1; j <= total; j++) {
      x += ('0000000000' + (offsets[j] || 0)).slice(-10) + ' 00000 n \n';
    }
    push(x);
    push('trailer\n<< /Size ' + (total + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
    return new Blob(parts, { type: 'application/pdf' });
  }

  /* ── ZIP (압축 없이 담기) — 페이지 이미지를 한 파일로 ───── */
  var CRC_T = null;
  function crc32(u8) {
    if (!CRC_T) {
      CRC_T = new Uint32Array(256);
      for (var n = 0; n < 256; n++) {
        var c = n;
        for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        CRC_T[n] = c >>> 0;
      }
    }
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < u8.length; i++) crc = (crc >>> 8) ^ CRC_T[(crc ^ u8[i]) & 0xFF];
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function buildZip(entries) {
    var enc = new TextEncoder();
    var parts = [], central = [], len = 0;
    function push(u) { parts.push(u); len += u.length; }
    function u16(v) { return new Uint8Array([v & 255, (v >>> 8) & 255]); }
    function u32(v) { return new Uint8Array([v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]); }
    entries.forEach(function (e) {
      var nameB = enc.encode(e.name);
      var crc = crc32(e.bytes);
      var off = len;
      push(u32(0x04034b50)); push(u16(20)); push(u16(0x0800)); push(u16(0));
      push(u16(0)); push(u16(0));
      push(u32(crc)); push(u32(e.bytes.length)); push(u32(e.bytes.length));
      push(u16(nameB.length)); push(u16(0));
      push(nameB); push(e.bytes);
      var c = new Uint8Array(46 + nameB.length);
      var dv = new DataView(c.buffer);
      dv.setUint32(0, 0x02014b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 20, true);
      dv.setUint16(8, 0x0800, true); dv.setUint16(10, 0, true); dv.setUint16(12, 0, true); dv.setUint16(14, 0, true);
      dv.setUint32(16, crc, true); dv.setUint32(20, e.bytes.length, true); dv.setUint32(24, e.bytes.length, true);
      dv.setUint16(28, nameB.length, true); dv.setUint16(30, 0, true); dv.setUint16(32, 0, true);
      dv.setUint16(34, 0, true); dv.setUint16(36, 0, true); dv.setUint32(38, 0, true); dv.setUint32(42, off, true);
      c.set(nameB, 46);
      central.push(c);
    });
    var cdStart = len;
    central.forEach(push);
    var cdLen = len - cdStart;
    push(u32(0x06054b50)); push(u16(0)); push(u16(0));
    push(u16(entries.length)); push(u16(entries.length));
    push(u32(cdLen)); push(u32(cdStart)); push(u16(0));
    return new Blob(parts, { type: 'application/zip' });
  }

  /* ── 화면·저장 한 번에 ─────────────────────────────────── */
  function safeName(s) { return String(s || '').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '').trim(); }
  function namePrefix(name) { return '윤이세_감정서_' + (safeName(name) || '고객'); }

  /**
   * render(blocks|text, opts) → Promise<{ pages:[canvas], pageCount, names }>
   * opts: { seal, name, meta, saju, scale(미리보기 배율, 기본 1), title }
   */
  function render(input, opts) {
    opts = opts || {};
    var list = blocks(input);
    return Promise.all([loadSeal(opts.seal), fontsReady()]).then(function () {
      var m = document.createElement('canvas').getContext('2d');
      if (!m) throw new Error('이 브라우저에서는 이미지를 만들 수 없어요 — 다른 브라우저로 열어 주세요.');
      var head = buildHead(m, list, opts);
      var pages = layoutPages(m, bodyOf(list), head.height);
      var total = pages.length;
      var scale = opts.scale || 1;
      var out = { pages: [], pageCount: total, names: { prefix: namePrefix(opts.name) } };
      pages.forEach(function (p, i) { out.pages.push(drawPage(p, i + 1, total, scale, head)); });
      out.cover = drawCover(scale);   /* 표지 1장 — 고정 템플릿, 이름 없음 */
      out.pageCountAll = total + 1;
      out.all = [out.cover].concat(out.pages);
      out.pages.forEach(function (cv, i) { if (cv.__cta) out.cta = { page: i + 1, rect: cv.__cta }; });
      return out;
    });
  }

  /** 저장·공유용 파일 묶음 — 페이지 PNG · PDF · ZIP */
  function files(input, opts) {
    opts = opts || {};
    return render(input, opts).then(function (r) {
      var prefix = r.names.prefix;
      var q = opts.jpegQuality || 0.9;
      var all = [r.cover].concat(r.pages);
      var pagesP = Promise.all(all.map(function (cv) { return toBlob(cv, 'image/png'); }));
      var jpegP = Promise.all(all.map(function (cv) { return toBlob(cv, 'image/jpeg', q); }));
      return Promise.all([pagesP, jpegP]).then(function (a) {
        var pageBlobs = a[0], jpegs = a[1];
        return Promise.all(jpegs.map(blobBytes)).then(function (bytes) {
          var links = [];
          r.pages.forEach(function (cv, i) { if (cv.__cta) links.push({ page: i + 1, rect: cv.__cta }); });
          var pdf = buildPdf(bytes, links);
          return Promise.all(pageBlobs.map(blobBytes)).then(function (pbytes) {
            var zip = buildZip(pageBlobs.map(function (b, i) {
              return { name: i === 0 ? prefix + '_1p_표지.png' : prefix + '_' + (i + 1) + 'p.png', bytes: pbytes[i] };
            }));
            return {
              pages: pageBlobs, pdf: pdf, zip: zip,
              pageCount: pageBlobs.length, bodyCount: r.pages.length,
              names: {
                page: function (i) { return i === 1 ? prefix + '_1p_표지.png' : prefix + '_' + i + 'p.png'; },
                pagesZip: prefix + '_페이지.png.zip',
                pdf: prefix + '.pdf'
              }
            };
          });
        });
      });
    });
  }

  /* ── 내려받기 · 공유 ──────────────────────────────────── */
  function download(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      try { a.remove(); } catch (e) { }
      try { URL.revokeObjectURL(url); } catch (e) { }
    }, 8000);
  }
  function toFile(blob, name, type) {
    try { return new File([blob], name, { type: type || blob.type }); } catch (e) { return null; }
  }
  function canShare(list) {
    try {
      if (!navigator.canShare || !navigator.share || typeof File !== 'function') return false;
      if (!list || !list.length) return false;
      return navigator.canShare({ files: list });
    } catch (e) { return false; }
  }
  /** 파일 공유 — 안 되면 false 를 돌려주고 부른 쪽이 내려받기로 넘어간다 */
  /** 공유할 때 함께 나가는 문구 — 그림에는 링크를 넣을 수 없어 카톡 메시지에 URL을 함께 보낸다 */
  function shareText() {
    return '윤이세가 직접 쓴 2027 맞춤 감정서입니다.\n윤이세 1:1 맞춤 상담 알아보기 → ' + APPLY_URL;
  }
  function shareList(items, title, text) {
    var filesArr = [];
    items.forEach(function (it) {
      var f = toFile(it.blob, it.name, it.type);
      if (f) filesArr.push(f);
    });
    if (!filesArr.length || !canShare(filesArr)) return Promise.resolve(false);
    return navigator.share({ files: filesArr, title: title || '윤이세 감정서', text: text || shareText() })
      .then(function () { return true; }, function () { return false; });
  }
  /** 파일 공유가 되는 환경인지 — PNG 여러 장 · PDF 따로 */
  function shareReady() {
    try {
      if (!navigator.share || !navigator.canShare || typeof File !== 'function') return { pdf: false, pages: false, one: false };
      function f(type) { return new File([new Blob([new Uint8Array([1])], { type: type })], 'a.' + (type.indexOf('pdf') >= 0 ? 'pdf' : 'png'), { type: type }); }
      var png = f('image/png'), pdf = f('application/pdf');
      return {
        pdf: !!navigator.canShare({ files: [pdf] }),
        pages: !!navigator.canShare({ files: [png, png] }),
        one: !!navigator.canShare({ files: [png] })
      };
    } catch (e) { return { pdf: false, pages: false, one: false }; }
  }

  /* ── 화면 위 겹침 창 — 미리보기 · 보내기 방식 선택 · 안내 ──────
     두 감정서가 같은 창을 쓴다(관리자 · 손님 앱). 스타일은 여기서 한 번만 넣는다. */
  var CSS = [
    '.gpov{position:fixed; inset:0; z-index:2147483000; display:flex; align-items:center; justify-content:center; padding:12px; background:rgba(24,20,16,.62); -webkit-tap-highlight-color:transparent}',
    '.gpov__panel{width:100%; max-width:520px; max-height:94vh; display:flex; flex-direction:column; background:#FBF7F0; border-radius:16px; box-shadow:0 18px 50px rgba(20,14,8,.4); overflow:hidden; font-family:' + SANS + '}',
    '.gpov__panel.is-viewer{height:94vh; max-height:94vh}',
    '.gpov__bar{display:flex; align-items:center; gap:8px; padding:11px 12px 9px; border-bottom:1px solid rgba(150,126,94,.22); background:#F7F0E4}',
    '.gpov__bar b{font-size:12.5px; font-weight:800; color:#3A322A; letter-spacing:-.02em}',
    '.gpov__bar span{font-size:11px; font-weight:700; color:#8C8279; font-variant-numeric:tabular-nums}',
    '.gpov__x{margin-left:auto; border:0; background:none; font-size:16px; line-height:1; color:#6B6157; padding:4px 6px; cursor:pointer}',
    '.gpov__stage{position:relative; flex:1 1 auto; min-height:0; display:flex; align-items:center; justify-content:center; padding:6px 10px}',
    '.gpov__shot{position:relative; display:block; flex:0 0 auto; line-height:0}',
    '.gpov__shot img{display:block; width:100%; height:100%; border-radius:6px; box-shadow:0 4px 16px rgba(60,44,26,.22); object-fit:contain}',
    '.gpov__cta{position:absolute; display:block; border-radius:12px; background:transparent; cursor:pointer; -webkit-tap-highlight-color:rgba(22,35,58,.12)}',
    '.gpov__cta[hidden]{display:none}',
    '.gpov__nav{position:absolute; top:50%; transform:translateY(-50%); width:32px; height:52px; border:0; border-radius:10px; background:rgba(255,255,255,.86); color:#4A3F33; font-size:20px; font-weight:800; cursor:pointer; box-shadow:0 2px 8px rgba(60,44,26,.18)}',
    '.gpov__nav[disabled]{opacity:.25}',
    '.gpov__nav--prev{left:4px} .gpov__nav--next{right:4px}',
    '.gpov__thumb{display:flex; gap:6px; overflow-x:auto; padding:8px 12px 10px; border-top:1px solid rgba(150,126,94,.18)}',
    '.gpov__thumb button{flex:0 0 auto; padding:0; border:2px solid transparent; border-radius:6px; background:none; cursor:pointer}',
    '.gpov__thumb button.is-on{border-color:#B08D57}',
    '.gpov__thumb img{display:block; width:44px; height:auto; border-radius:4px}',
    '.gpov__acts{display:grid; gap:7px; padding:10px 12px 14px; border-top:1px solid rgba(150,126,94,.18)}',
    '.gpov__body{padding:16px 16px 4px; overflow:auto}',
    '.gpov__body h3{margin:0 0 6px; font-size:15px; font-weight:800; color:#2A2622; letter-spacing:-.02em}',
    '.gpov__body p{margin:0 0 8px; font-size:12px; line-height:1.7; color:#5C544B; word-break:keep-all}',
    '.gpov__body p b{color:#8A5E22}',
    '.gpov__pick{display:flex; align-items:center; gap:11px; width:100%; text-align:left; padding:13px 14px; border:1px solid rgba(150,126,94,.34); border-radius:12px; background:#fff; font-family:inherit; cursor:pointer}',
    '.gpov__pick i{flex:0 0 auto; width:34px; height:34px; border-radius:9px; background:#F7EEDC; color:#8A5E22; font-style:normal; font-weight:800; font-size:15px; display:flex; align-items:center; justify-content:center}',
    '.gpov__pick b{display:block; font-size:13px; font-weight:800; color:#2A2622}',
    '.gpov__pick span{display:block; margin-top:2px; font-size:10.5px; font-weight:600; color:#8C8279; line-height:1.55}',
    '.gpov__cancel{margin:2px 12px 14px; padding:10px; border:1px solid rgba(150,126,94,.3); border-radius:11px; background:#fff; font-family:inherit; font-size:12px; font-weight:700; color:#6B6157; cursor:pointer}',
    '.gpov__mini{display:grid; grid-template-columns:repeat(3,1fr); gap:6px; padding:9px 12px 12px; border-top:1px solid rgba(150,126,94,.18)}',
    '.gpov__mini button{min-height:42px; border-radius:11px; border:1px solid rgba(150,126,94,.34); background:#FFFDF8; font-family:inherit; font-size:11.5px; font-weight:800; color:#5C544B; cursor:pointer; padding:4px 2px; letter-spacing:-.03em}',
    '.gpov__mini button:active{background:#F7EEDC}',
    'body.gp-lock{overflow:hidden}'
  ].join('\n');

  function ensureCss() {
    if (document.getElementById('gpOverlayCss')) return;
    var st = document.createElement('style');
    st.id = 'gpOverlayCss';
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  /** 겹침 창 뼈대 — 닫기 · Esc · 바깥 누르기 */
  function overlay(panelHtml, onClose, panelClass) {
    ensureCss();
    var ov = document.createElement('div');
    ov.className = 'gpov';
    ov.innerHTML = '<div class="gpov__panel' + (panelClass ? ' ' + panelClass : '') + '" role="dialog" aria-modal="true">' + panelHtml + '</div>';
    document.body.appendChild(ov);
    document.body.classList.add('gp-lock');
    function close() {
      try { ov.remove(); } catch (e) { }
      if (!document.querySelector('.gpov')) document.body.classList.remove('gp-lock');
      document.removeEventListener('keydown', onKey);
      if (onClose) onClose();
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    var x = ov.querySelector('.gpov__x');
    if (x) x.addEventListener('click', close);
    return { root: ov, close: close };
  }

  /** 감정서 미리보기 — 1장부터 끝장까지 큰 그림 + 썸네일. acts: [{label, gold, onClick}] */
  function viewer(canvases, opts) {
    opts = opts || {};
    var list = (canvases || []).filter(Boolean);
    if (!list.length) return null;
    var urls = list.map(function (cv) { return cv.toDataURL('image/png'); });
    var head = '<div class="gpov__bar"><b>' + esc(opts.title || '최종 감정서 미리보기') + '</b>' +
      '<span class="gpov__n">1 / ' + list.length + '장</span><button type="button" class="gpov__x" aria-label="닫기">✕</button></div>';
    var stage = '<div class="gpov__stage">' +
      '<button type="button" class="gpov__nav gpov__nav--prev" aria-label="이전 장">‹</button>' +
      '<div class="gpov__shot"><img alt="감정서 1장">' +
      '<a class="gpov__cta" href="' + APPLY_URL + '" target="_blank" rel="noopener noreferrer" aria-label="윤이세 1:1 맞춤 상담 알아보기" hidden></a></div>' +
      '<button type="button" class="gpov__nav gpov__nav--next" aria-label="다음 장">›</button></div>';
    var th = '<div class="gpov__thumb">' + urls.map(function (u, i) {
      return '<button type="button" data-i="' + i + '"' + (i === 0 ? ' class="is-on"' : '') + '><img src="' + u + '" alt="' + (i + 1) + '장"></button>';
    }).join('') + '</div>';
    var acts = (opts.actions && opts.actions.length)
      ? '<div class="gpov__mini">' + opts.actions.map(function (a, i) {
        return '<button type="button" data-act="' + i + '">' + esc(a.label) + '</button>';
      }).join('') + '</div>'
      : '';
    var panel = head + stage + th + acts;
    var i = 0;
    var o = overlay(panel, opts.onClose, 'is-viewer');
    var img = o.root.querySelector('.gpov__stage img');
    var shot = o.root.querySelector('.gpov__shot');
    var ctaA = o.root.querySelector('.gpov__cta');
    var nEl = o.root.querySelector('.gpov__n');
    var prev = o.root.querySelector('.gpov__nav--prev');
    var next = o.root.querySelector('.gpov__nav--next');
    function show(k) {
      i = Math.max(0, Math.min(list.length - 1, k));
      img.src = urls[i];
      img.alt = '감정서 ' + (i + 1) + '장';
      nEl.textContent = (i + 1) + ' / ' + list.length + '장';
      prev.disabled = i === 0;
      next.disabled = i === list.length - 1;
      /* 마지막 장에 그린 상담 버튼 위에 실제 링크를 얹는다 — 누르면 /apply/ 로 바로 */
      var rc = list[i] && list[i].__cta;
      if (rc && ctaA) {
        ctaA.hidden = false;
        ctaA.style.left = (rc.x / W * 100) + '%';
        ctaA.style.top = (rc.y / H * 100) + '%';
        ctaA.style.width = (rc.w / W * 100) + '%';
        ctaA.style.height = (rc.h / H * 100) + '%';
      } else if (ctaA) {
        ctaA.hidden = true;
      }
      if (typeof fit === 'function') fit();
      Array.prototype.forEach.call(o.root.querySelectorAll('.gpov__thumb button'), function (b) {
        b.classList.toggle('is-on', Number(b.dataset.i) === i);
      });
    }
    function fit() {
      var st = stageEl.getBoundingClientRect();
      var availW = Math.max(120, st.width - 20);
      var availH = Math.max(120, st.height - 14);
      var w = Math.min(availW, availH * W / H);
      shot.style.width = Math.round(w) + 'px';
      shot.style.height = Math.round(w * H / W) + 'px';
    }
    window.addEventListener('resize', fit);
    img.addEventListener('load', fit);
    if (window.ResizeObserver) {
      try { new ResizeObserver(function () { fit(); }).observe(stageEl); } catch (e) { }
    }
    prev.addEventListener('click', function () { show(i - 1); });
    next.addEventListener('click', function () { show(i + 1); });
    o.root.querySelector('.gpov__thumb').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (b) show(Number(b.dataset.i));
    });
    /* 좌우로 밀어 넘기기 */
    var x0 = null;
    var stageEl = o.root.querySelector('.gpov__stage');
    stageEl.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    stageEl.addEventListener('touchend', function (e) {
      if (x0 == null) return;
      var dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 40) show(i + (dx < 0 ? 1 : -1));
      x0 = null;
    });
    if (opts.actions) {
      o.root.querySelector('.gpov__mini').addEventListener('click', function (e) {
        var b = e.target.closest('button[data-act]');
        if (!b) return;
        var a = opts.actions[Number(b.dataset.act)];
        if (a && a.onClick) a.onClick(o.close);
      });
    }
    show(0);
    if (opts.start) show(opts.start);
    fit();
    setTimeout(fit, 60);
    return o;
  }

  /** 보내기 방식 선택 — 'PDF로 보내기' / '페이지별 이미지로 보내기' */
  function chooser(opts) {
    opts = opts || {};
    var panel = '<div class="gpov__bar"><b>감정서 보내기</b><span>보낼 모양을 골라 주세요</span>' +
      '<button type="button" class="gpov__x" aria-label="닫기">✕</button></div>' +
      '<div class="gpov__body"><h3>어떤 모양으로 보낼까요?</h3>' +
      '<p>고른 뒤 기기의 공유 창이 열립니다 — 카카오톡을 고르시면 그대로 전달돼요.</p></div>' +
      '<div class="gpov__acts">' +
      '<button type="button" class="gpov__pick" data-pick="pdf"><i>PDF</i><span><b>PDF로 보내기</b><span>한 파일로 묶여 있어요. ' + (opts.pageCount ? opts.pageCount + '장' : '') + '을 한 번에 보냅니다.</span></span></button>' +
      '<button type="button" class="gpov__pick" data-pick="pages"><i>PNG</i><span><b>페이지별 이미지로 보내기</b><span>장마다 사진 한 장씩 — 카톡에서 바로 보이고 넘겨 보기 좋아요.</span></span></button>' +
      '</div><button type="button" class="gpov__cancel">취소</button>';
    return new Promise(function (resolve) {
      var done = false;
      var o = overlay(panel, function () { if (!done) { done = true; resolve(''); } });
      o.root.querySelector('.gpov__cancel').addEventListener('click', function () { o.close(); });
      o.root.querySelector('.gpov__acts').addEventListener('click', function (e) {
        var b = e.target.closest('button[data-pick]');
        if (!b) return;
        done = true;
        var v = b.dataset.pick;
        o.close();
        resolve(v);
      });
    });
  }

  /** 안내 창 — 저장으로 대신했을 때 · 환경 제한을 정직하게 알린다 */
  function notice(opts) {
    opts = opts || {};
    var extra = opts.copyUrl
      ? '<div class="gpov__acts"><button type="button" class="gpov__pick" data-copy="1"><i>링크</i>' +
        '<span><b>상담 신청서 주소 복사</b><span>' + esc(APPLY_URL) + '</span></span></button></div>'
      : '';
    var panel = '<div class="gpov__bar"><b>' + esc(opts.title || '안내') + '</b><button type="button" class="gpov__x" aria-label="닫기">✕</button></div>' +
      '<div class="gpov__body">' + (opts.html || '<p>' + esc(opts.text || '') + '</p>') + '</div>' + extra +
      '<button type="button" class="gpov__cancel">확인</button>';
    var o = overlay(panel, opts.onClose);
    o.root.querySelector('.gpov__cancel').addEventListener('click', function () { o.close(); });
    var cp = o.root.querySelector('[data-copy]');
    if (cp) cp.addEventListener('click', function () {
      var done = function (ok) {
        var b = cp.querySelector('b');
        if (b) b.textContent = ok ? '복사했어요' : '길게 눌러 복사해 주세요';
      };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(APPLY_URL).then(function () { done(true); }, function () { done(false); });
          return;
        }
      } catch (e) { }
      done(false);
    });
    return o;
  }

  global.GuidePaper = {
    W: W, H: H,
    blocks: blocks,
    parse: parse,
    normalize: normalize,
    paginate: function (input, opts) {
      opts = opts || {};
      var m = document.createElement('canvas').getContext('2d');
      var list = blocks(input);
      var head = buildHead(m, list, opts);
      return layoutPages(m, bodyOf(list), head.height).length;
    },
    render: render,
    files: files,
    chartHeight: function () { return CHART_H; },
    /** 배치 진단 — 장마다 글이 어디까지 찼는지 (관리자·검수용) */
    layout: function (input, opts) {
      opts = opts || {};
      var m = document.createElement('canvas').getContext('2d');
      var list = blocks(input);
      var head = buildHead(m, list, opts);
      var pages = layoutPages(m, bodyOf(list), head.height);
      var bottom = H - M.bottom;
      return {
        head: head.height, usable: bottom - M.top,
        pages: pages.map(function (p, i) {
          var top0 = i === 0 ? M.top + head.height : M.top;
          return { page: i + 1, start: top0, end: Math.round(p.y), fill: Math.round((p.y - top0) / (bottom - top0) * 100) };
        })
      };
    },
    viewer: viewer,
    chooser: chooser,
    notice: notice,
    buildPdf: buildPdf,
    buildZip: buildZip,
    download: download,
    shareList: shareList,
    shareText: shareText,
    APPLY_URL: APPLY_URL,
    shareReady: shareReady,
    canShare: canShare,
    toBlob: toBlob,
    loadSeal: loadSeal,
    safeName: safeName
  };
})(typeof window !== 'undefined' ? window : globalThis);

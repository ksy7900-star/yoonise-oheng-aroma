/* ==========================================================
   📜 감정서 종이 렌더러 — 표지 · 페이지 · PDF · 공유 (2026-11-26)
   · 두 감정서가 **같은 렌더러**를 쓴다.
       ① 관리자 '서비스용 감정서 직접 만들기' (/calendar/yoon-key/)
       ② 첫 3일(72시간) 특별 혜택 감정서 (손님 달력 앱)
   · 원본은 언제나 '글'이다. 화면에서 고친 최종본(관리자 수정본)을 그대로 받아
     표지 이미지 · 페이지별 이미지 · PDF · 공유 파일을 모두 이 한 곳에서 만든다.
     그래서 화면에서 고친 글이 저장물에서 초안으로 되돌아가지 않는다.
   · 페이지 나눔은 문단(블록) 단위이고, 한 문단이 길면 줄 단위로만 나눈다.
     문장 중간에서 잘리지 않는다. 페이지 번호 · 머리글 · 꼬리글을 넣는다.
   · 직인은 새로 그리지 않는다 — 저장소에 있는 assets/yoonise-seal.png 를 그대로 쓴다.
   ========================================================== */
(function (global) {
  'use strict';

  /* ── 종이 크기 — A4 비율(210:297)을 150dpi 로 ───────────── */
  var W = 1240, H = 1754;
  var M = { x: 104, top: 196, bottom: 146 };

  var C = {
    bg: '#FBF7F0', ink: '#2A2622', body: '#332D27', soft: '#8C8279',
    gold: '#B08D57', goldDeep: '#8A5E22',
    hair: 'rgba(150,126,94,.30)', hairSoft: 'rgba(150,126,94,.18)'
  };
  var SANS = '"Pretendard","Pretendard Variable","Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR","Noto Sans CJK KR",system-ui,sans-serif';
  var SERIF = '"Nanum Myeongjo","NanumMyeongjo","Noto Serif KR","Noto Serif CJK KR","AppleMyungjo","SamsungMyeongjo","Batang","바탕",serif';

  var F = {
    brand: '800 19px ' + SANS,
    title: '600 56px ' + SERIF,
    for: '400 29px ' + SANS,
    greet: '500 45px ' + SANS, greetB: '700 45px ' + SANS,
    chap: '800 18px ' + SANS,
    head: '700 49px ' + SERIF, headB: '700 49px ' + SERIF,
    body: '400 44px ' + SANS, bodyB: '700 44px ' + SANS,
    item: '400 44px ' + SANS, itemB: '700 44px ' + SANS,
    sign: '600 50px ' + SERIF,
    foot: '600 17px ' + SANS,
    page: '600 17px ' + SANS,
    cBrand: '800 26px ' + SANS,
    cYear: '600 168px ' + SERIF,
    cTitle: '600 46px ' + SERIF,
    cName: '500 50px ' + SANS,
    cSub: '500 25px ' + SANS,
    cSmall: '700 19px ' + SANS
  };
  var LH = { body: 76, item: 76, greet: 82, head: 78, title: 78, for: 46, chap: 26 };

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

  /* 글 → 블록. 표지·머리글·꼬리글·CHAPTER 는 여기서 새로 매긴다. */
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
    /* 소제목顺序 — CHAPTER 번호는 화면과 저장물이 같아야 한다 */
    var withChap = [], n = 0;
    out.forEach(function (b) {
      if (b.type === 'head') { n += 1; withChap.push({ type: 'chap', text: 'CHAPTER ' + (n < 10 ? '0' + n : n) }); }
      withChap.push(b);
    });
    /* 서명이 없으면 붙인다 — 직인은 마지막 장에만 */
    if (!withChap.some(function (b) { return b.type === 'sign'; })) {
      withChap.push({ type: 'sign', text: '— 윤이세' });
    }
    return withChap;
  }

  function blocks(input) {
    if (typeof input === 'string') return parse(input);
    if (Object.prototype.toString.call(input) === '[object Array]') return normalize(input);
    return [];
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
    /* 그리는 순간의 y 를 쓴다 — 페이지마다 자리가 달라지므로 만든 때의 y 는 기본값일 뿐이다 */
    return function (c, yy) {
      var total = 0;
      segs.forEach(function (sg) { total += measureSeg(c, sg, reg, bold); });
      var cx = align === 'center' ? x - total / 2 : (align === 'right' ? x - total : x);
      segs.forEach(function (sg) {
        c.font = sg.b ? bold : reg;
        c.fillStyle = color;
        c.textAlign = 'left';
        try { c.letterSpacing = (ls || 0) + 'px'; } catch (e) { }
        c.fillText(sg.t, cx, yy == null ? y : yy);
        try { c.letterSpacing = '0px'; } catch (e) { }
        c.font = sg.b ? bold : reg;
        cx += c.measureText(sg.t).width;
      });
    };
  }

  /* ── 블록 → 줄 단위 그리기 단위 ─────────────────────────
     각 단위는 높이(h)와 draw(c, y) 만 가진다. 페이지 나눔은 이 높이만 본다. */
  function blockUnits(m, b) {
    var maxW = W - M.x * 2;
    var before = 0, after = 0, keepNext = false, units = [];

    if (b.type === 'title') {
      var tl = wrapPlain(m, b.text, maxW - 40, F.title);
      tl.forEach(function (t) {
        units.push({ h: LH.title, draw: textOp([{ t: t, b: false }], W / 2, 0, F.title, F.title, C.ink, 'center', 0) });
      });
      units.push({ h: 34, draw: function (c, y) {
        c.fillStyle = C.gold; c.globalAlpha = .55;
        c.fillRect(W / 2 - 26, y + 6, 52, 2); c.globalAlpha = 1;
      } });
      after = 30;
      return { units: units, before: 0, after: after, keepNext: true };
    }
    if (b.type === 'for') {
      wrapPlain(m, b.text, maxW - 40, F.for).forEach(function (t) {
        units.push({ h: LH.for, draw: textOp([{ t: t, b: false }], W / 2, 0, F.for, F.for, C.soft, 'center', 0) });
      });
      return { units: units, before: 0, after: 40, keepNext: true };
    }
    if (b.type === 'greet') {
      wrap(m, b.runs, maxW, F.greet, F.greetB).forEach(function (ln) {
        units.push({ h: LH.greet, draw: textOp(ln.segs, M.x, 0, F.greet, F.greetB, C.ink, 'left', 0) });
      });
      return { units: units, before: 0, after: 26, keepNext: false };
    }
    if (b.type === 'chap') {
      units.push({ h: 28, draw: function (c, y) {
        c.font = F.chap; c.fillStyle = C.gold; c.textAlign = 'left';
        try { c.letterSpacing = '6px'; } catch (e) { }
        c.fillText(b.text, M.x, y + 20);
        try { c.letterSpacing = '0px'; } catch (e) { }
      } });
      /* 소제목 위 여백 — CHAPTER 글자와 제목이 겹치지 않게 충분히 둔다 */
      return { units: units, before: 46, after: 44, keepNext: true };
    }
    if (b.type === 'head') {
      wrap(m, b.runs, maxW, F.head, F.headB).forEach(function (ln) {
        units.push({ h: LH.head, draw: textOp(ln.segs, M.x, 0, F.head, F.headB, C.ink, 'left', 0) });
      });
      return { units: units, before: 0, after: 24, keepNext: true };
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
      var indent = 60, lh = LH.item;
      var first = true;
      wrap(m, rs, maxW - indent, F.item, F.itemB).forEach(function (ln) {
        units.push({ h: lh, draw: (function (ln2, isFirst) {
          return function (c, y) {
            if (isFirst && mark) {
              c.font = F.item; c.fillStyle = C.body; c.textAlign = 'left';
              c.fillText(mark, M.x, y);
            }
            textOp(ln2.segs, M.x + indent, y, F.item, F.itemB, C.body, 'left', 0)(c);
          };
        })(ln, first) });
        first = false;
      });
      return { units: units, before: 0, after: 22, keepNext: false };
    }
    if (b.type === 'sign') {
      var sealW = 232, sealH = Math.round(sealW * 381 / 720);
      var name = (b.text || '— 윤이세').replace(/\s+/g, ' ').trim();
      var u = { h: 26 + 54 + sealH * 0.62, draw: function (c, y) {
        c.fillStyle = C.hair; c.fillRect(M.x, y + 6, W - M.x * 2, 1);
        var ny = y + 78;
        c.font = F.sign; c.fillStyle = C.ink; c.textAlign = 'left';
        var nw = c.measureText(name).width;
        var sx = Math.max(M.x, (W - (nw + 30 + sealW)) / 2);
        c.fillText(name, sx, ny);
        if (SIGN.seal) {
          c.save();
          c.translate(sx + nw + 30 + sealW / 2, ny - sealH / 2 + 18);
          c.rotate(-4 * Math.PI / 180);
          c.globalAlpha = .96;
          c.drawImage(SIGN.seal, -sealW / 2, -sealH / 2, sealW, sealH);
          c.restore();
          c.globalAlpha = 1;
        }
      } };
      return { units: [u], before: 52, after: 0, keepNext: false };
    }
    /* body */
    wrap(m, b.runs, maxW, F.body, F.bodyB).forEach(function (ln) {
      units.push({ h: LH.body, draw: textOp(ln.segs, M.x, 0, F.body, F.bodyB, C.body, 'left', 0) });
    });
    return { units: units, before: 0, after: 26, keepNext: false };
  }

  var SIGN = { seal: null };

  function loadSeal(src) {
    if (SIGN.seal) return Promise.resolve(SIGN.seal);
    return new Promise(function (res, rej) {
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

  /* ── 페이지 나눔 ──────────────────────────────────────── */
  function paginate(m, list) {
    var pages = [], cur = null;
    var bottom = H - M.bottom;
    function open() { cur = { ops: [], y: M.top, filled: 0 }; pages.push(cur); }
    open();

    list.forEach(function (b) {
      if (b.type === 'brand' || b.type === 'foot') return;
      /* 서명 — 마지막 장에서는 종이 아래쪽에 놓는다. 짧은 글에서 서명이 글 중간에
         떠 있으면 편지가 끊긴 것처럼 보인다. */
      if (b.type === 'sign') {
        var Bs = blockUnits(m, b), hs = 0;
        Bs.units.forEach(function (u) { hs += u.h; });
        var y0 = cur.y + Bs.before;
        var low = bottom - hs - 10;
        if (y0 < low) y0 = low;
        if (y0 + hs > bottom) {
          if (cur.filled > 0) { open(); }
          y0 = Math.min(bottom - hs - 10, M.top + 40);
        }
        Bs.units.forEach(function (u) { cur.ops.push({ y: y0, h: u.h, draw: u.draw }); y0 += u.h; });
        cur.y = y0;
        cur.filled += 1;
        return;
      }
      var B = blockUnits(m, b);
      var remain = B.units.slice();
      var firstChunk = true;
      var guard = 0;
      while (remain.length && guard++ < 200) {
        var beforeY = firstChunk ? B.before : 0;
        var avail = bottom - (cur.y + beforeY);
        var fit = 0, acc = 0;
        for (var i = 0; i < remain.length; i++) {
          if (acc + remain[i].h > avail) break;
          acc += remain[i].h; fit += 1;
        }
        /* 소제목이 종이 맨 아래에 홀로 남지 않게 — 제목 + 본문 두 줄은 같이 들어가야 한다 */
        if (firstChunk && (b.type === 'head' || b.type === 'chap')) {
          var headNeed = acc + B.after + (b.type === 'chap' ? 78 + 152 : 152);
          if (cur.y + beforeY + headNeed > bottom && cur.filled > 0) { open(); continue; }
        }
        /* 다음 장에 한 줄만 걸치는 모양을 피한다 — 두 줄 이상 넘어가게.
           다만 두 줄만 남았을 때 억지로 한 줄로 줄이면 종이 아래가 크게 비므로 그때는 그대로 둔다. */
        if (fit > 2 && fit < remain.length && (remain.length - fit) === 1) fit -= 1;
        /* 한 줄만 남기고 넘기는 모양을 피한다 — 두 줄 미만이면 통째로 다음 장 */
        var orphan = (fit > 0 && fit < remain.length && fit < 2 && remain.length >= 3);
        if (fit === 0 || orphan) {
          if (cur.filled > 0) { open(); continue; }
          /* 빈 장에서도 안 들어가는 아주 긴 단위 — 그래도 그린다 */
          fit = 1; acc = remain[0].h;
        }
        cur.y += beforeY;
        for (var k = 0; k < fit; k++) {
          var u = remain[k];
          (function (unit, yy) {
            cur.ops.push({ y: yy, h: unit.h, draw: unit.draw });
          })(u, cur.y);
          cur.y += u.h;
        }
        cur.filled += fit;
        remain = remain.slice(fit);
        firstChunk = false;
        if (remain.length) { open(); }
      }
      cur.y += (remain.length ? 0 : B.after);
    });
    /* 마지막 장의 서명 뒤 여백이 너무 좁으면 그대로 둔다 */
    return pages;
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
    g.addColorStop(0, 'rgba(255,253,248,.92)');
    g.addColorStop(.38, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(233,222,205,.34)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(150,126,94,.34)'; c.lineWidth = 1.6;
    c.strokeRect(30, 30, w - 60, h - 60);
    c.strokeStyle = 'rgba(150,126,94,.16)'; c.lineWidth = 1;
    c.strokeRect(40, 40, w - 80, h - 80);
  }
  function brandLine(c, y) {
    c.font = F.brand; c.fillStyle = C.gold; c.textAlign = 'center';
    try { c.letterSpacing = '9px'; } catch (e) { }
    c.fillText('YOONISE', W / 2 + 4, y);
    try { c.letterSpacing = '0px'; } catch (e) { }
  }

  function drawPage(page, no, total, scale) {
    var o = newCanvas(W, H, scale), c = o.c;
    paperBase(c, W, H);
    brandLine(c, M.top - 66);
    page.ops.forEach(function (op) { op.draw(c, op.y); });
    /* 꼬리 — 페이지 번호는 표지 다음 장부터 1장으로 센다 */
    var fy = H - 78;
    c.fillStyle = C.hairSoft;
    c.fillRect(M.x, fy - 30, W - M.x * 2, 1);
    c.font = F.foot; c.fillStyle = 'rgba(140,130,121,.9)';
    c.textAlign = 'left';
    c.fillText('윤이세사주', M.x, fy);
    c.textAlign = 'right';
    c.fillText('2027 맞춤 운세 활용 가이드', W - M.x, fy);
    c.textAlign = 'center';
    c.font = F.page; c.fillStyle = C.soft;
    c.fillText(no + ' / ' + total, W / 2, fy);
    return o.cv;
  }

  /* ── 표지 ─────────────────────────────────────────────── */
  function drawCover(meta, scale) {
    meta = meta || {};
    var o = newCanvas(W, H, scale), c = o.c;
    paperBase(c, W, H);

    /* 위 — 브랜드와 금빛 선 */
    c.font = F.cBrand; c.fillStyle = C.gold; c.textAlign = 'center';
    try { c.letterSpacing = '16px'; } catch (e) { }
    c.fillText('YOONISE', W / 2 + 8, 172);
    try { c.letterSpacing = '0px'; } catch (e) { }
    c.fillStyle = 'rgba(176,141,87,.55)';
    c.fillRect(W / 2 - 34, 220, 68, 2);

    /* 2027 */
    c.font = F.cYear; c.fillStyle = C.ink; c.textAlign = 'center';
    try { c.letterSpacing = '10px'; } catch (e) { }
    c.fillText('2027', W / 2 + 5, 470);
    try { c.letterSpacing = '0px'; } catch (e) { }

    /* 제목 */
    var title = meta.title || '2027년 맞춤 운세 활용 가이드';
    var ty = 556;
    wrapPlain(c, title, W - 260, F.cTitle).forEach(function (t) {
      c.font = F.cTitle; c.fillStyle = C.ink; c.textAlign = 'center';
      c.fillText(t, W / 2, ty);
      ty += 64;
    });
    c.fillStyle = 'rgba(176,141,87,.42)';
    c.fillRect(W / 2 - 26, ty + 6, 52, 2);

    /* 받는 사람 — 표지에서 가장 먼저 눈에 들어오는 자리 */
    var nm = meta.name ? (/(님|씨)$/.test(meta.name) ? meta.name : meta.name + ' 님') : '';
    if (nm) {
      c.font = F.cName; c.fillStyle = C.ink; c.textAlign = 'center';
      c.fillText(nm, W / 2, 862);
    }
    var sub = meta.subtitle || '윤이세가 직접 전하는 한 해의 길잡이';
    c.font = F.cSub; c.fillStyle = C.soft; c.textAlign = 'center';
    c.fillText(sub, W / 2, 918);

    /* 가운데 한 줄 — 표지가 비어 보이지 않게, 이 글의 성격을 담담하게 */
    var note = meta.note || '한 해의 흐름을 미리 알고, 좋은 날을 챙기기 위한 글';
    c.font = F.cSub; c.fillStyle = 'rgba(140,130,121,.85)'; c.textAlign = 'center';
    c.fillText(note, W / 2, 1052);
    c.fillStyle = 'rgba(176,141,87,.30)';
    c.fillRect(W / 2 - 20, 1096, 40, 1);

    /* 아래 — 직인과 서명 (직인은 저장소의 yoonise-seal.png 그대로) */
    var sealW = 300, sealH = Math.round(sealW * 381 / 720);
    var sy = 1372;
    if (SIGN.seal) {
      c.save();
      c.translate(W / 2, sy - sealH / 2 + 12);
      c.rotate(-4 * Math.PI / 180);
      c.globalAlpha = .96;
      c.drawImage(SIGN.seal, -sealW / 2, -sealH / 2, sealW, sealH);
      c.restore();
      c.globalAlpha = 1;
    }
    c.font = F.sign; c.fillStyle = C.ink; c.textAlign = 'center';
    c.fillText('— 윤이세', W / 2, sy + 92);

    c.font = F.cSmall; c.fillStyle = 'rgba(140,130,121,.9)'; c.textAlign = 'center';
    try { c.letterSpacing = '3px'; } catch (e) { }
    c.fillText('윤이세사주', W / 2, H - 118);
    try { c.letterSpacing = '0px'; } catch (e) { }
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

  /* ── PDF (이미지 페이지만 담는 단순 PDF) ─────────────────
     외부 라이브러리 없이 만든다. 각 장을 JPEG 로 넣고 A4 크기에 꽉 채운다.
     PDF 를 만드는 데 실패해도 페이지 이미지·표지는 그대로 쓸 수 있다. */
  function buildPdf(jpegs) {
    var wPt = 595.276, hPt = 841.89;
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
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    var kids = [];
    for (var i = 0; i < n; i++) kids.push((3 + i * 3) + ' 0 R');
    obj(2, '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + n + ' >>');
    for (var k = 0; k < n; k++) {
      var pg = 3 + k * 3, im = pg + 1, ct = pg + 2;
      obj(pg, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + wPt + ' ' + hPt +
        '] /Resources << /XObject << /Im0 ' + im + ' 0 R >> >> /Contents ' + ct + ' 0 R >>');
      offsets[im] = len;
      push(im + ' 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + W + ' /Height ' + H +
        ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpegs[k].length + ' >>\nstream\n');
      push(jpegs[k]);
      push('\nendstream\nendobj\n');
      var content = 'q ' + wPt + ' 0 0 ' + hPt + ' 0 0 cm /Im0 Do Q';
      obj(ct, '<< /Length ' + content.length + ' >>', content);
    }
    var xref = len;
    var total = 2 + n * 3;
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

  /**
   * render(blocks|text, opts) → Promise<{
   *   cover: canvas, pages: [canvas], names: {...}, pageCount,
   *   coverBlob, pageBlobs: [Blob], pdfBlob, zipBlob
   * }>
   * opts: { seal, name, title, subtitle, scale(미리보기 배율, 기본 1), jpegQuality }
   */
  function render(input, opts) {
    opts = opts || {};
    var list = blocks(input);
    return Promise.all([loadSeal(opts.seal), fontsReady()]).then(function () {
      var m = document.createElement('canvas').getContext('2d');
      if (!m) throw new Error('이 브라우저에서는 이미지를 만들 수 없어요 — 다른 브라우저로 열어 주세요.');
      var pages = paginate(m, list);
      var total = pages.length;
      var scale = opts.scale || 1;
      var out = {
        pages: [], pageCount: total,
        names: { prefix: '윤이세_감정서_' + (safeName(opts.name) || '고객') }
      };
      out.cover = drawCover(opts, scale);
      pages.forEach(function (p, i) { out.pages.push(drawPage(p, i + 1, total, scale)); });
      return out;
    });
  }

  /** 저장·공유용 파일 묶음 — 표지 PNG · 페이지 PNG · PDF · ZIP */
  function files(input, opts) {
    opts = opts || {};
    return render(input, opts).then(function (r) {
      var names = r.names;
      var q = opts.jpegQuality || 0.9;
      var coverP = toBlob(r.cover, 'image/png');
      var pagesP = Promise.all(r.pages.map(function (cv) { return toBlob(cv, 'image/png'); }));
      var jpegP = Promise.all(
        [r.cover].concat(r.pages).map(function (cv) { return toBlob(cv, 'image/jpeg', q); })
      );
      return Promise.all([coverP, pagesP, jpegP]).then(function (all) {
        var coverBlob = all[0], pageBlobs = all[1], jpegs = all[2];
        return Promise.all(jpegs.map(blobBytes)).then(function (bytes) {
          var pdf = buildPdf(bytes);
          return Promise.all(pageBlobs.map(blobBytes)).then(function (pbytes) {
            var zip = buildZip(pageBlobs.map(function (b, i) {
              return { name: names.prefix + '_' + (i + 1) + 'p.png', bytes: pbytes[i] };
            }));
            return {
              cover: coverBlob, pages: pageBlobs, pdf: pdf, zip: zip,
              pageCount: pageBlobs.length,
              names: {
                cover: names.prefix + '_표지.png',
                page: function (i) { return names.prefix + '_' + i + 'p.png'; },
                pagesZip: names.prefix + '_페이지.png.zip',
                pdf: names.prefix + '.pdf'
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
      return navigator.canShare({ files: list });
    } catch (e) { return false; }
  }
  /** 파일 공유 — 안 되면 false 를 돌려주고 부른 쪽이 내려받기로 넘어간다 */
  function shareList(items, title) {
    var filesArr = [];
    items.forEach(function (it) {
      var f = toFile(it.blob, it.name, it.type);
      if (f) filesArr.push(f);
    });
    if (!filesArr.length || !canShare(filesArr)) return Promise.resolve(false);
    return navigator.share({ files: filesArr, title: title || '윤이세 감정서' })
      .then(function () { return true; }, function () { return false; });
  }

  global.GuidePaper = {
    W: W, H: H,
    blocks: blocks,
    parse: parse,
    normalize: normalize,
    paginate: function (input) {
      var m = document.createElement('canvas').getContext('2d');
      return paginate(m, blocks(input)).length;
    },
    render: render,
    files: files,
    cover: function (meta, scale) { return loadSeal(meta && meta.seal).then(function () { return drawCover(meta, scale); }); },
    pageCanvas: function (input, i, scale) {
      var m = document.createElement('canvas').getContext('2d');
      var pages = paginate(m, blocks(input));
      return drawPage(pages[i], i + 1, pages.length, scale);
    },
    drawCover: drawCover,
    buildPdf: buildPdf,
    buildZip: buildZip,
    download: download,
    shareList: shareList,
    canShare: canShare,
    toBlob: toBlob,
    loadSeal: loadSeal
  };
})(typeof window !== 'undefined' ? window : globalThis);

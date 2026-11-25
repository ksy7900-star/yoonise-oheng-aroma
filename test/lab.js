/* 오늘의 브리핑 개인화 — 브라우저 안 검증 랩 (배포 전 확인용, 사이트에는 안 쓰임) */
(function () {
  var M = window.Manse, T = window.Timing, B = window.TodayBrief;
  var out = document.getElementById('out');
  if (!M || !T || !B) { out.textContent = 'missing global: ' + [!!M, !!T, !!B].join(','); return; }

  function brHash(s) {
    var h = 2166136261, str = String(s);
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return h >>> 0;
  }
  function brDayNo(iso) {
    var p = String(iso).split('-');
    return Math.floor(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000);
  }
  /* calendar.js 의 brSeqBuild.pick 과 같은 규칙 */
  function makeSeq() {
    var recent = {};
    return {
      pick: function (key, pool, salt) {
        if (!pool || !pool.length) return 0;
        var used = recent[key] || (recent[key] = []);
        var base = brHash(key + '|' + 'SIG' + '|' + salt) % pool.length;
        for (var k = 0; k < pool.length; k++) {
          var i = (base + k) % pool.length;
          if (used.indexOf(i) < 0) { used.push(i); if (used.length > 13) used.shift(); return i; }
        }
        var old = used.shift(); used.push(old); return old;
      }
    };
  }

  function chart(y, mo, d, hh, mm, name) {
    var res = M.compute({ name: name, gender: 'F', calendar: 'solar', y: y, m: mo, d: d, leap: false,
      timeKnown: hh != null, hh: hh == null ? 12 : hh, mm: mm == null ? 0 : mm, trueSolar: false,
      dst: false, ziRule: '23', region: 'seoul', longitude: 126.98 });
    var natal = T.natalOf(res);
    return { name: name, res: res, natal: natal,
      sig: [natal.yearGanIndex, natal.yearZhiIndex, natal.monthGanIndex, natal.monthZhiIndex,
        natal.dayGanIndex, natal.dayZhiIndex, natal.timeGanIndex, natal.timeZhiIndex].join(','),
      toneSeed: brHash([natal.yearGanIndex, natal.yearZhiIndex, natal.monthGanIndex, natal.monthZhiIndex,
        natal.dayGanIndex, natal.dayZhiIndex, natal.timeGanIndex, natal.timeZhiIndex].join(',')) % 6 };
  }

  /* 달력(calendar.js)의 색 판정을 흉내 낸 근사 — 랩에서는 마크만 보고 고른다 */
  function kindOf(info) {
    var strong = info.marks.filter(function (m) { return !m.minor && m.cat !== 'gray'; });
    var red = strong.filter(function (m) { return m.cat === 'red'; });
    var gold = strong.filter(function (m) { return m.cat === 'gold'; });
    var blue = strong.filter(function (m) { return m.cat === 'blue'; });
    if (red.length) return red[0].kind;
    if (gold.length) return gold[0].kind;
    if (blue.length) return blue[0].kind;
    if (info.term && info.term.isJie) return 'jie';
    return 'calm';
  }

  var terms = T.buildTerms('2026-01-01', '2027-12-31');
  var charts = [
    chart(1974, 5, 19, 8, 30, '김윤희'),
    chart(1979, 6, 8, null, null, '김나영'),
    chart(1985, 3, 15, 14, 30, '테스트')
  ];

  var FROM = '2026-11-01', TO = '2026-12-31', result = {};

  charts.forEach(function (c) {
    var seq = makeSeq(), rows = [];
    var iso = FROM;
    while (iso <= TO) {
      var info = T.dayInfo(iso, c.natal, terms);
      var zhi = info.gz.zhiIndex;
      var branchTg = M.tenGodOf(c.natal.dayGanIndex, M.GAN.indexOf(M.HIDDEN[M.ZHI[zhi]][0]));
      var ctx = {
        iso: iso, dayNo: brDayNo(iso), sig: c.sig, toneSeed: c.toneSeed,
        kind: kindOf(info), key: '', tg: info.tenGod, stemEl: info.ganEl,
        branchTg: branchTg, counts: c.res.counts, who: c.name + ' 님, '
      };
      var rec = B.plan(ctx, seq.pick);
      var r = B.render(ctx, rec);
      var text = r.sentences.join(' ');
      rows.push({ iso: iso, gz: info.gz.text, tg: info.tenGod, el: info.ganEl,
        cnt: c.res.counts[info.ganEl], kind: ctx.kind, head: r.head,
        sentences: r.sentences, text: text, len: text.length, n: r.sentences.length });
      iso = T.addDays(iso, 1);
    }
    result[c.name] = { sig: c.sig, counts: c.res.counts, dm: c.res.dayMaster.gan + '(' + c.res.dayMaster.element + ')', rows: rows };
  });

  /* 검사 ① 오늘(2026-11-25) 세 사주가 서로 다른가 */
  var today = {};
  Object.keys(result).forEach(function (k) {
    var r = result[k].rows.filter(function (x) { return x.iso === '2026-11-25'; })[0];
    today[k] = r;
  });
  /* 검사 ② 같은 사주에서 연속 14일 안에 같은 문장이 다시 나오나 */
  var repeats = {};
  Object.keys(result).forEach(function (k) {
    var rows = result[k].rows, hits = [];
    for (var i = 0; i < rows.length; i++) {
      for (var j = i + 1; j < rows.length && j <= i + 13; j++) {
        rows[i].sentences.forEach(function (s) {
          if (rows[j].sentences.indexOf(s) >= 0 && s.length > 6) hits.push([rows[i].iso, rows[j].iso, s]);
        });
      }
    }
    /* 제목도 따로 */
    var heads = [];
    for (var a = 0; a < rows.length; a++) {
      for (var b = a + 1; b < rows.length && b <= a + 13; b++) {
        if (rows[a].head === rows[b].head) heads.push([rows[a].iso, rows[b].iso, rows[a].head]);
      }
    }
    repeats[k] = { sentences: hits, heads: heads };
  });

  /* 검사 ③ 길이·문장 수 범위 */
  var lens = [], ns = [];
  Object.keys(result).forEach(function (k) {
    result[k].rows.forEach(function (r) { lens.push(r.len); ns.push(r.n); });
  });

  var html = '';
  html += '<h4>① 오늘 2026-11-25 — 세 사주 비교</h4><table>';
  Object.keys(today).forEach(function (k) {
    var r = today[k];
    html += '<tr><td><b>' + k + '</b><br>' + result[k].dm + ' · ' + JSON.stringify(result[k].counts) + '</td>' +
      '<td>' + r.gz + ' · ' + r.tg + '(' + r.el + ' ' + r.cnt + '개) · ' + r.kind + '</td>' +
      '<td><b>' + r.head + '</b><br>' + r.text + '<br><i>' + r.n + '문장 · ' + r.len + '자</i></td></tr>';
  });
  html += '</table>';

  html += '<h4>② 14일 안 반복 검사</h4>';
  Object.keys(repeats).forEach(function (k) {
    html += '<div><b>' + k + '</b> — 문장 반복 ' + repeats[k].sentences.length + '건, 제목 반복 ' + repeats[k].heads.length + '건<br>' +
      repeats[k].sentences.slice(0, 8).map(function (h) { return h[0] + '↔' + h[1] + ' : ' + h[2]; }).join('<br>') +
      (repeats[k].heads.length ? '<br>제목: ' + repeats[k].heads.slice(0, 8).map(function (h) { return h[0] + '↔' + h[1] + ' : ' + h[2]; }).join(' / ') : '') +
      '</div>';
  });

  html += '<h4>③ 길이 (120~220자 목표) / 문장 3~5</h4><div>min ' + Math.min.apply(null, lens) +
    ' · max ' + Math.max.apply(null, lens) + ' · 평균 ' + Math.round(lens.reduce(function (a, b) { return a + b; }, 0) / lens.length) +
    '<br>문장 ' + Math.min.apply(null, ns) + '~' + Math.max.apply(null, ns) + '</div>';

  html += '<h4>④ 김윤희 11/24~12/8 이어보기</h4><table>';
  result['김윤희'].rows.slice(23, 38).forEach(function (r) {
    html += '<tr><td>' + r.iso + '<br>' + r.gz + ' ' + r.tg + '</td><td>' + r.kind + '</td><td><b>' + r.head + '</b><br>' + r.text + ' <i>(' + r.len + ')</i></td></tr>';
  });
  html += '</table>';

  html += '<h4>⑤ 김나영 11/24~12/8 이어보기</h4><table>';
  result['김나영'].rows.slice(23, 38).forEach(function (r) {
    html += '<tr><td>' + r.iso + '<br>' + r.gz + ' ' + r.tg + '</td><td>' + r.kind + '</td><td><b>' + r.head + '</b><br>' + r.text + ' <i>(' + r.len + ')</i></td></tr>';
  });
  html += '</table>';

  html += '<h4>⑥ 테스트 11/24~12/8 이어보기</h4><table>';
  result['테스트'].rows.slice(23, 38).forEach(function (r) {
    html += '<tr><td>' + r.iso + '<br>' + r.gz + ' ' + r.tg + '</td><td>' + r.kind + '</td><td><b>' + r.head + '</b><br>' + r.text + ' <i>(' + r.len + ')</i></td></tr>';
  });
  html += '</table>';

  out.innerHTML = html;
  window.__lab = { result: result, today: today, repeats: repeats, lens: { min: Math.min.apply(null, lens), max: Math.max.apply(null, lens) } };
  window.__labReady = true;
})();

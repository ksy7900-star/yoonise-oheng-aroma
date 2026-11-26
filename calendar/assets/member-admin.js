/* ==========================================================
   👑 회원 혜택 관리 — /calendar/yoon-key/ 여섯 번째 탭 (2026-11-26)
   · 정식 결제 회원 전용 혜택(친구 초대 4단계 · 인스타 인증)의 규칙을 여기서 고친다.
     저장하면 **재배포 없이** 고객 화면(혜택 팝업)과 이후 지급에 바로 반영된다.
     이미 발급된 할인권은 발급 당시 조건(금액·만료일)을 그대로 간직한다.
   · 인스타그램 인증은 관리자가 '승인'만 누르면 회원 상태에 따라 자동 분기된다.
       정식 회원 → 전 상품 10,000원 할인권 1매 / 무료 회원 → 기존 30일 이용권(M 코드)
   · 손님 화면과 같은 서버 상태(member_who)를 본다 — 코드 발급기·가입자·달력과 같은 기준.
   서버: public.admin_member_benefits(pin, action, payload) · docs/member-benefits-*.sql
   ========================================================== */
(function () {
  'use strict';

  var SB_URL = 'https://fifynkkaeqcjlovesuop.supabase.co';
  var SB_KEY = 'sb_publishable_JzSUlMOH9s38aer6y1BVEg_rHcQLGxF';

  var st = { rules: [], products: {}, dir: 'ledger', q: '', busy: false, opened: {} };

  function $(s) { return document.querySelector(s); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function won(n) { return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '원'; }
  function pin() { try { return window.YoonKeyPin ? (window.YoonKeyPin.get() || '') : ''; } catch (e) { return ''; } }
  function rpc(action, payload) {
    return fetch(SB_URL + '/rest/v1/rpc/admin_member_benefits', {
      method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY },
      body: JSON.stringify({ p_pin: pin(), p_action: action, p_payload: payload || {} })
    }).then(function (r) {
      return r.text().then(function (t) {
        var d = null;
        try { d = t ? JSON.parse(t) : null; } catch (e) { d = null; }
        if (!r.ok) throw new Error((d && (d.message || d.hint)) || ('HTTP ' + r.status));
        return d || {};
      });
    });
  }
  function msg(t, bad) {
    var el = $('#bnMsg');
    if (!el) return;
    el.textContent = t || '';
    el.style.color = bad ? '#BE123C' : '#047857';
  }
  function state(el, t) { var e = $(el); if (e) { e.textContent = t; e.hidden = !t; } }

  var AREA = { onepoint: '원포인트', signature: '시그니처', naming: '개명·작명', all: '모든 상품' };

  /* ── 규칙 목록 ───────────────────────────────────── */
  function rulesHTML() {
    return st.rules.map(function (r) {
      var isBurn = r.benefit === 'burn';
      var kind = r.coupon_kind || '';
      var applies = (r.applies_to || []).map(function (k) { return AREA[k] || k; }).join(' · ');
      return '<li class="bnr" data-id="' + r.id + '">' +
        '<div class="bnr__top">' +
        '<span class="bnr__who">' + (r.trigger === 'insta' ? '인스타 인증' : '친구 ' + r.stage + '명') + '</span>' +
        '<span class="bnr__kind">' + (isBurn ? '액운 태우기' : '상담 할인권') + '</span>' +
        '<label class="bnr__on"><input type="checkbox" data-f="active"' + (r.active ? ' checked' : '') + '> 사용</label>' +
        '</div>' +
        '<label class="bnr__lb">혜택 이름<input type="text" data-f="title" value="' + esc(r.title) + '"></label>' +
        '<div class="bnr__grid">' +
        (isBurn
          ? '<label class="bnr__lb">추가 횟수<input type="number" data-f="burn_count" min="0" max="99" value="' + (r.burn_count || 0) + '"></label>'
          : '<label class="bnr__lb">할인 방식<select data-f="coupon_kind">' +
            '<option value="amount"' + (kind === 'amount' ? ' selected' : '') + '>금액(원)</option>' +
            '<option value="percent"' + (kind === 'percent' ? ' selected' : '') + '>비율(%)</option>' +
            '</select></label>' +
            '<label class="bnr__lb">할인 값<input type="number" data-f="coupon_value" min="1" value="' + (r.coupon_value || 0) + '"></label>') +
        '<label class="bnr__lb">유효기간(개월)<input type="number" data-f="valid_months" min="1" max="60" value="' + (r.valid_months || 6) + '"></label>' +
        '</div>' +
        (isBurn ? '' :
          '<label class="bnr__lb">적용 상품' +
          '<span class="bnr__chk">' +
          '<label><input type="checkbox" data-f="apply_all"' + (((r.applies_to || []).indexOf('all') >= 0) ? ' checked' : '') + '> 모든 상품</label>' +
          '<label><input type="checkbox" data-f="apply_onepoint"' + ((r.applies_to || []).indexOf('onepoint') >= 0 ? ' checked' : '') + '> 원포인트</label>' +
          '<label><input type="checkbox" data-f="apply_signature"' + ((r.applies_to || []).indexOf('signature') >= 0 ? ' checked' : '') + '> 시그니처</label>' +
          '<label><input type="checkbox" data-f="apply_naming"' + ((r.applies_to || []).indexOf('naming') >= 0 ? ' checked' : '') + '> 개명·작명</label>' +
          '</span></label>' +
          '<p class="bnr__sub">고객 화면 표시: ' + esc(r.subtitle || '') + (applies ? ' · ' + esc(applies) : '') + '</p>') +
        '<p class="bnr__meta">' + (r.trigger === 'insta' ? '인스타 인증 · 계정당 1회' : '친구 ' + r.stage + '명 달성 · 계정당 1회') + '</p>' +
        '</li>';
    }).join('');
  }

  function collectRules() {
    var arr = [];
    Array.prototype.forEach.call(document.querySelectorAll('#bnRules .bnr'), function (li) {
      var id = Number(li.getAttribute('data-id'));
      var base = st.rules.filter(function (x) { return x.id === id; })[0] || {};
      function val(f) { var el = li.querySelector('[data-f="' + f + '"]'); return el ? el.value : ''; }
      function chk(f) { var el = li.querySelector('[data-f="' + f + '"]'); return el ? !!el.checked : false; }
      /* 2026-11-26 #23131 — '모든 상품'을 고르면 앞으로 추가되는 상품에도 그대로 적용된다(all) */
      var applies = [];
      if (chk('apply_all')) applies = ['all'];
      else {
        if (chk('apply_onepoint')) applies.push('onepoint');
        if (chk('apply_signature')) applies.push('signature');
        if (chk('apply_naming')) applies.push('naming');
      }
      var row = {
        id: id,
        title: val('title'),
        active: chk('active'),
        valid_months: Number(val('valid_months')) || 6
      };
      if (base.benefit === 'burn') row.burn_count = Number(val('burn_count')) || 0;
      else {
        row.coupon_kind = val('coupon_kind');
        row.coupon_value = Number(val('coupon_value')) || 0;
        row.applies_to = applies;
      }
      arr.push(row);
    });
    return arr;
  }

  function paintRules() {
    var ul = $('#bnRules');
    if (!ul) return;
    ul.innerHTML = rulesHTML();
    ul.hidden = false;
    state('#bnState', '');
    var n = $('#bnCount');
    if (n) n.textContent = ' · ' + st.rules.length + '개';
  }

  /* ── 인스타 인증 대기 ───────────────────────────── */
  function paintInsta(list) {
    var ul = $('#bnInstaList');
    if (!ul) return;
    if (!list || !list.length) { ul.hidden = true; state('#bnInstaState', '확인을 기다리는 인증이 없어요.'); return; }
    state('#bnInstaState', '');
    ul.innerHTML = list.map(function (i) {
      var who = i.nickname || i.email || (i.phone_masked || '') || (i.uniq || '');
      return '<li data-iid="' + i.id + '">' +
        '<span class="bnl__t">' + esc(who) + (i.member ? ' <b class="bnl__ok">정식</b>' : ' <b class="bnl__free">무료</b>') + '</span>' +
        '<span class="bnl__d">' + esc(i.phone_masked || '') + ' · ' + esc(String(i.created_at || '').slice(0, 10)) + '</span>' +
        '<span class="bnl__b"><button type="button" data-inst-ok="' + i.id + '">승인</button>' +
        '<button type="button" data-inst-no="' + i.id + '">반려</button></span></li>';
    }).join('');
    ul.hidden = false;
  }

  /* ── 회원 명부 ─────────────────────────────────── */
  function paintDir(list) {
    var ul = $('#bnDir');
    if (!ul) return;
    if (!list || !list.length) { ul.hidden = true; state('#bnDirState', '표시할 회원이 없어요.'); return; }
    state('#bnDirState', '');
    ul.innerHTML = list.map(function (m) {
      if (st.dir === 'ledger') {
        return '<li>' +
          '<span class="bnl__code">' + esc(m.code) + '</span>' +
          '<span class="bnl__t">' + esc(m.phone_masked) + (m.member ? ' <b class="bnl__ok">정식</b>' : ' <b class="bnl__free">무료</b>') + '</span>' +
          '<span class="bnl__d">' + esc(m.tier || '') + ' · 할인권 ' + (m.coupons_usable || 0) + '장 · 액운 ' + (m.burn_left || 0) + '회 · 기기 ' + (m.devices || 0) + '</span>' +
          '<span class="bnl__b"><button type="button" data-grant="' + esc(m.phone) + '">할인권 지급</button>' +
          '<button type="button" data-grantburn="' + esc(m.phone) + '">액운권 1회</button></span></li>';
      }
      return '<li data-uid="' + m.user_id + '">' +
        '<span class="bnl__t">' + esc(m.nickname) + ' <span class="bnl__d2">' + esc(m.email) + '</span></span>' +
        '<span class="bnl__d">친구 ' + m.refs + '명 · 할인권 ' + m.coupons_usable + '장(사용 ' + m.coupons_used + ') · 액운 ' + m.burn_left + '회' +
        (m.insta ? ' · 인증 ' + m.insta : '') + '</span>' +
        '<span class="bnl__b"><button type="button" data-hist="' + m.user_id + '">이력</button>' +
        '<button type="button" data-insta-user="' + m.user_id + '">인증 승인</button></span></li>';
    }).join('');
    ul.hidden = false;
  }

  function paintRecent(list) {
    var ul = $('#bnRecent');
    if (!ul) return;
    if (!list || !list.length) { ul.hidden = true; return; }
    var label = { usable: '사용 가능', used: '사용 완료', expired: '만료', revoked: '취소' };
    ul.innerHTML = list.map(function (c) {
      return '<li data-cid="' + c.id + '">' +
        '<span class="bnl__t">' + esc(c.title) + '</span>' +
        '<span class="bnl__d">' + esc(c.nickname || c.email || c.phone_masked || '') + ' · ' + esc(c.expires_at || '') +
        ' · <b>' + esc(label[c.status] || c.status) + '</b>' + (c.used_order_no ? ' · 주문 ' + esc(String(c.used_order_no).slice(0, 10)) + '…' : '') + '</span>' +
        '<span class="bnl__b">' + (c.status === 'used'
          ? '<button type="button" data-cunuse="' + c.id + '">사용 취소</button>'
          : (c.status === 'usable' ? '<button type="button" data-cuse="' + c.id + '">사용 처리</button>' : '')) +
        '</span></li>';
    }).join('');
    ul.hidden = false;
  }

  function paintSummary(s) {
    if (!s) return;
    var set = function (id, v) { var el = $(id); if (el) el.textContent = v; };
    set('#bnIssued', s.issued);
    set('#bnUsable', s.usable);
    set('#bnUsed', s.used);
    set('#bnInsta', s.insta_pending);
    set('#bnBurnLeft', s.burn_left);
  }

  /* ── 불러오기 ─────────────────────────────────── */
  function load() {
    if (!pin()) { state('#bnState', 'PIN을 먼저 넣어 주세요.'); return; }
    state('#bnState', '불러오는 중…');
    rpc('list').then(function (d) {
      if (!d || !d.ok) throw new Error((d && d.error) || '불러오지 못했어요');
      st.rules = d.rules || [];
      st.products = d.products || {};
      paintSummary(d.summary);
      paintRules();
      paintInsta(d.insta);
      paintRecent(d.recent);
      loadDir();
    }, function (e) { state('#bnState', '불러오지 못했어요 · ' + (e.message || '')); });
  }

  function loadDir() {
    state('#bnDirState', '불러오는 중…');
    var call = st.dir === 'ledger' ? rpc('directory') : rpc('members', { q: st.q });
    call.then(function (d) {
      paintDir((d && d.members) || []);
    }, function (e) { state('#bnDirState', '불러오지 못했어요 · ' + (e.message || '')); });
  }

  /* ── 누르는 일 ─────────────────────────────────── */
  function bind() {
    var root = $('#tabBenefits');
    if (!root) return;

    $('#bnReload').addEventListener('click', load);
    $('#bnDirReload').addEventListener('click', loadDir);
    $('#bnSave').addEventListener('click', function () {
      var btn = this;
      btn.disabled = true;
      msg('저장하는 중…');
      rpc('save_rules', { rules: collectRules() }).then(function (d) {
        btn.disabled = false;
        if (!d || !d.ok) throw new Error((d && d.error) || '저장 실패');
        msg('저장했어요 — 고객 화면과 이후 지급에 바로 반영됩니다.');
        load();
      }, function (e) { btn.disabled = false; msg('저장하지 못했어요 · ' + (e.message || ''), true); });
    });

    var search = $('#bnSearch');
    if (search) search.addEventListener('input', function () {
      st.q = search.value.trim();
      if (st.dir !== 'account') return;
      clearTimeout(search.__t);
      search.__t = setTimeout(loadDir, 350);
    });

    Array.prototype.forEach.call(root.querySelectorAll('[data-bndir]'), function (b) {
      b.addEventListener('click', function () {
        st.dir = b.getAttribute('data-bndir');
        Array.prototype.forEach.call(root.querySelectorAll('[data-bndir]'), function (x) {
          x.classList.toggle('is-on', x === b);
        });
        loadDir();
      });
    });

    root.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.getAttribute) return;
      var id;

      if ((id = t.getAttribute('data-inst-ok'))) {
        if (!confirm('이 인증을 승인할까요? 회원 상태에 따라 할인권 또는 30일 이용권이 자동 발급됩니다.')) return;
        t.disabled = true;
        rpc('insta_approve', { id: Number(id) }).then(function (d) {
          t.disabled = false;
          if (!d || !d.ok) {
            alert(d && d.error === 'need_phone' ? '번호를 알 수 없는 인증이에요 — 코드 발급기에서 30일 이용권을 만들어 주세요.' : '승인하지 못했어요 · ' + ((d && d.error) || ''));
            return;
          }
          alert(d.kind === 'month'
            ? '30일 이용권을 발급했어요 — 코드 ' + d.code + ' (카톡으로 보내 주세요)'
            : '전 상품 10,000원 할인권 1매를 자동 발급했어요.');
          load();
        }, function (err) { t.disabled = false; alert('승인하지 못했어요 · ' + err.message); });
        return;
      }
      if ((id = t.getAttribute('data-inst-no'))) {
        t.disabled = true;
        rpc('insta_reject', { id: Number(id) }).then(function () { t.disabled = false; load(); });
        return;
      }
      if ((id = t.getAttribute('data-cuse'))) {
        rpc('coupon_use', { id: Number(id) }).then(function () { load(); });
        return;
      }
      if ((id = t.getAttribute('data-cunuse'))) {
        rpc('coupon_unuse', { id: Number(id) }).then(function () { load(); });
        return;
      }
      if ((id = t.getAttribute('data-grant'))) {
        if (!confirm('이 번호로 전 상품 10,000원 할인권 1매를 지급할까요? (6개월 · 1회용)')) return;
        rpc('grant', { phone: id, coupon_kind: 'amount', coupon_value: 10000, valid_months: 6, note: '관리자 수동 지급' })
          .then(function (d) { alert(d && d.ok ? '지급했어요.' : '지급하지 못했어요 · ' + ((d && d.error) || '')); load(); });
        return;
      }
      if ((id = t.getAttribute('data-grantburn'))) {
        rpc('grant', { phone: id, benefit: 'burn', burn_count: 1, note: '관리자 수동 지급' })
          .then(function () { load(); });
        return;
      }
      if ((id = t.getAttribute('data-insta-user'))) {
        if (!confirm('이 회원의 인스타 인증을 승인할까요? (회원 상태에 따라 자동 분기 발급)')) return;
        rpc('insta_approve', { user_id: id }).then(function (d) {
          if (!d || !d.ok) { alert(d && d.error === 'need_phone' ? '이 회원은 연결된 번호가 없어요 — 코드 발급기에서 30일 이용권을 만들어 주세요.' : '승인하지 못했어요 · ' + ((d && d.error) || '')); return; }
          alert(d.kind === 'month' ? '30일 이용권을 발급했어요 — 코드 ' + d.code : '전 상품 10,000원 할인권 1매를 자동 발급했어요.');
          load();
        });
        return;
      }
      if ((id = t.getAttribute('data-hist'))) {
        var li = t.closest('li');
        var box = li.querySelector('.bn-hist');
        if (box) { box.parentNode.removeChild(box); return; }
        rpc('member', { user_id: id }).then(function (d) {
          var div = document.createElement('div');
          div.className = 'bn-hist';
          var cs = (d && d.coupons) || [];
          var bs = (d && d.burn) || [];
          div.innerHTML = (cs.length
            ? '<p class="bn-hist__t">상담 할인권</p><ul>' + cs.map(function (c) {
                return '<li>' + esc(c.title) + ' · ' + esc(c.expires_at) + ' · ' + esc(c.status) + '</li>';
              }).join('') + '</ul>'
            : '<p class="bn-hist__t">상담 할인권 없음</p>') +
            (bs.length
              ? '<p class="bn-hist__t">액운 태우기 추가 이용권</p><ul>' + bs.map(function (b) {
                  return '<li>총 ' + b.total + '회 중 ' + b.used + '회 사용' + (b.expires_at ? ' · ' + esc(b.expires_at) : '') + '</li>';
                }).join('') + '</ul>'
              : '');
          li.appendChild(div);
        });
        return;
      }
    });
  }

  window.YoonBenefitsAdmin = { load: load };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();

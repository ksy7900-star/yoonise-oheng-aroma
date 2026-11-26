-- ============================================================
-- 👑 정식 회원 혜택 — 상담 결제 A안 연동 + 관리자 「회원 혜택 관리」 (2026-11-26)
-- 2단계: 상담 상품을 서버 가격표/주문/결제 통보에 연결하고, 관리자 함수를 붙인다.
--   · payapp_product      : consult-onepoint(49,000) · consult-signature(100,000) 추가
--   · payapp_prepare_order: 할인권(p_coupon)을 받아 서버가 할인가를 계산해 주문에 남긴다
--   · payapp_feedback     : 결제 완료 통보 때 할인권 자동 사용 완료 / 취소·환불 때 되돌림
--   · claim_paid_unlock   : 상담 주문은 이용권 코드를 만들지 않는다(안전장치)
--   · admin_member_benefits : 규칙 저장·회원별 이력·인스타 승인·수동 지급/사용
-- 원칙: 기존 이용권 상품 4종의 가격·동작은 한 글자도 바꾸지 않는다(추가 분기만).
-- ============================================================
begin;

-- ────────────────────────────────────────────────────────────
-- ① 상품 가격표 — 상담 2종 추가(기존 4종 그대로)
-- ────────────────────────────────────────────────────────────
create or replace function public.payapp_product(p_product text)
returns jsonb
language sql
immutable
as $function$
  select case lower(btrim(coalesce(p_product, '')))
    when 'pass'        then jsonb_build_object('product','pass','price',14900,'goodname','2027년 1년 타이밍패스','tier','pass','letter','P')
    when 'allinone'    then jsonb_build_object('product','allinone','price',19900,'goodname','2027 올인원패키지','tier','allinone','letter','A')
    when 'diary'       then jsonb_build_object('product','diary','price',24900,'goodname','성찰에디션','tier','diary','letter','D')
    when 'up-allinone' then jsonb_build_object('product','up-allinone','price',7900,'goodname','2027 올인원 업그레이드','tier','allinone','letter','A')
    when 'consult-onepoint'  then jsonb_build_object('product','consult-onepoint','price',49000,'goodname','원포인트 리딩','tier',null,'letter',null)
    when 'consult-signature' then jsonb_build_object('product','consult-signature','price',100000,'goodname','시그니처 리딩','tier',null,'letter',null)
    else null end
$function$;

-- ────────────────────────────────────────────────────────────
-- ② 주문 예약 — 할인권을 함께 받는다(없으면 지금과 똑같이 정가)
--    p_coupon: member_coupons.id — 이 사람(계정·기기)의 쓸 수 있는 권만 인정
-- ────────────────────────────────────────────────────────────
drop function if exists public.payapp_prepare_order(text, text, text);

create or replace function public.payapp_prepare_order(p_phone text, p_product text, p_client_uid text default null, p_coupon bigint default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'extensions'
as $function$
declare
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), '');
  info  jsonb := public.payapp_product(p_product);
  uid   text := nullif(btrim(coalesce(p_client_uid, '')), '');
  v_no  text;
  v_n   int;
  v_me  uuid := auth.uid();
  c     public.member_coupons;
  v_list int;
  v_price int;
  v_disc int := 0;
  v_prod text := lower(btrim(coalesce(p_product, '')));
  v_key  text;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  if info is null then
    return jsonb_build_object('ok', false, 'error', 'bad_product');
  end if;
  if v_phone is null or v_phone !~ '^01[016789][0-9]{7,8}$' then
    return jsonb_build_object('ok', false, 'error', 'bad_phone');
  end if;
  if uid is not null and (length(uid) < 8 or length(uid) > 80) then
    uid := null;
  end if;

  v_list := (info->>'price')::int;
  v_price := v_list;

  -- 할인권 — 이 계정·이 기기의 것만, 쓸 수 있는 것만
  if p_coupon is not null then
    select * into c from public.member_coupons
     where id = p_coupon
       and revoked_at is null and used_at is null and expires_at >= v_today
       and (v_me is not null and owner_user = v_me or uid is not null and owner_client = uid);
    if c.id is null then
      return jsonb_build_object('ok', false, 'error', 'bad_coupon');
    end if;
    if v_prod = '' or not (v_prod = any(c.applies_to)) then
      return jsonb_build_object('ok', false, 'error', 'coupon_not_for_product');
    end if;
    v_disc := case c.kind
                when 'amount'  then greatest(v_list - c.value, 1000)
                when 'percent' then greatest(round(v_list * (100 - c.value) / 100.0)::int, 1000)
                else v_list end;
    v_disc := v_list - v_disc;
    v_price := v_list - v_disc;
  end if;

  -- 같은 번호로 짧은 시간에 너무 많이 만들지 않는다 (장난·스팸 방지)
  select count(*) into v_n from public.payapp_orders
   where phone = v_phone and created_at > now() - interval '1 hour';
  if v_n > 20 then
    return jsonb_build_object('ok', false, 'error', 'too_many');
  end if;

  -- 오래된 '예약' 상태 정리 (같은 번호)
  delete from public.payapp_orders
   where phone = v_phone and state = 'prepared' and created_at < now() - interval '6 hours';

  v_no := 'PA' || encode(extensions.gen_random_bytes(16), 'hex');
  insert into public.payapp_orders(order_no, product, price, phone, client_uid, state, coupon_id, list_price, discount, coupon_title)
  values (v_no, info->>'product', v_price, v_phone, uid, 'prepared',
          case when c.id is not null then c.id else null end,
          case when c.id is not null then v_list else null end,
          case when c.id is not null then v_disc else null end,
          case when c.id is not null then c.title else null end);

  return jsonb_build_object(
    'ok', true,
    'order_no', v_no,
    'product', info->>'product',
    'price', v_price,
    'list_price', v_list,
    'discount', v_disc,
    'coupon_id', c.id,
    'coupon_title', c.title,
    'goodname', info->>'goodname',
    'tier', info->>'tier'
  );
end $function$;

-- ────────────────────────────────────────────────────────────
-- ③ 결제 완료 통보 — 상담 주문은 코드 대신 '할인권 사용 완료'로 닫는다
--    (기존 이용권 분기는 그대로 — 상담 분기만 앞에 둔다)
-- ────────────────────────────────────────────────────────────
create or replace function public.payapp_feedback(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'extensions'
as $function$
declare
  v_linkkey   text;
  v_linkval   text;
  v_requestkey text;
  v_userid  text := btrim(coalesce(p->>'userid', ''));
  v_linkkey_in text := coalesce(p->>'linkkey', '');
  v_linkval_in text := coalesce(p->>'linkval', '');
  v_price_in text := btrim(coalesce(p->>'price', ''));
  v_state   text := btrim(coalesce(p->>'pay_state', ''));
  v_var1    text := btrim(coalesce(p->>'var1', ''));
  v_var2    text := btrim(coalesce(p->>'var2', ''));
  v_mulno   text := nullif(btrim(coalesce(p->>'mul_no', '')), '');
  v_recv    text := nullif(regexp_replace(coalesce(p->>'recvphone', ''), '[^0-9]', '', 'g'), '');
  v_hash    text := lower(btrim(coalesce(p->>'hash', '')));
  v_respdate text := btrim(coalesce(p->>'responsedate', ''));
  v_calc    text;
  o public.payapp_orders;
  v_tier    text;
  v_letter  text;
  v_code    text;
  v_note    text := null;
  v_ok      boolean := false;
  sg public.special_guide_requests;
  v_masked  text;
begin
  v_masked := case when v_recv is null then null
    else left(v_recv, 3) || '-****-' || right(v_recv, 4) end;

  select value into v_linkkey    from public.app_secrets where name = 'payapp_linkkey';
  select value into v_linkval    from public.app_secrets where name = 'payapp_linkval';
  select value into v_requestkey from public.app_secrets where name = 'payapp_requestkey';

  -- 검증 값이 아직 없으면: 기록만 남기고 승인하지 않는다 (캡처 모드)
  if nullif(btrim(coalesce(v_linkval, '')), '') is null then
    insert into public.payapp_capture(linkkey, linkval, requestkey, userid, pay_state, mul_no)
    values (v_linkkey_in, v_linkval_in, coalesce(p->>'requestkey', v_requestkey), v_userid, v_state, v_mulno);
    insert into public.payapp_events(ok, reason, userid, var1, var2, price, pay_state, mul_no, recvphone, payload)
    values (false, 'capture', v_userid, v_var1, v_var2, v_price_in, v_state, v_mulno, v_masked,
            p - 'linkkey' - 'linkval');
    return jsonb_build_object('ok', false, 'reason', 'capture');
  end if;

  -- ① 판매자·연동값·금액·해시 검증
  if v_userid <> 'yoonise' then
    v_note := 'bad_userid';
  elsif v_linkval_in <> v_linkval then
    v_note := 'bad_linkval';
  elsif nullif(btrim(coalesce(v_linkkey, '')), '') is not null and v_linkkey_in <> v_linkkey then
    v_note := 'bad_linkkey';
  elsif nullif(btrim(coalesce(v_requestkey, '')), '') is not null and v_hash <> '' then
    v_calc := encode(sha256(convert_to(v_userid || v_respdate || v_requestkey, 'UTF8')), 'hex');
    if v_hash <> v_calc then
      v_note := 'bad_hash';
    end if;
  end if;

  if v_note is not null then
    insert into public.payapp_events(ok, reason, userid, var1, var2, price, pay_state, mul_no, recvphone, payload)
    values (false, v_note, v_userid, v_var1, v_var2, v_price_in, v_state, v_mulno, v_masked,
            p - 'linkkey' - 'linkval');
    return jsonb_build_object('ok', false, 'reason', v_note);
  end if;

  -- ② 우리가 만든 주문인지 (var2 = 주문 토큰, var1 = 상품)
  select * into o from public.payapp_orders where order_no = v_var2;
  if o.id is null then
    insert into public.payapp_events(ok, reason, userid, var1, var2, price, pay_state, mul_no, recvphone, payload)
    values (false, 'unknown_order', v_userid, v_var1, v_var2, v_price_in, v_state, v_mulno, v_masked,
            p - 'linkkey' - 'linkval');
    return jsonb_build_object('ok', false, 'reason', 'unknown_order');
  end if;
  if v_var1 <> '' and v_var1 <> o.product then
    insert into public.payapp_events(ok, reason, userid, var1, var2, price, pay_state, mul_no, recvphone, payload)
    values (false, 'product_mismatch', v_userid, v_var1, v_var2, v_price_in, v_state, v_mulno, v_masked,
            p - 'linkkey' - 'linkval');
    return jsonb_build_object('ok', false, 'reason', 'product_mismatch');
  end if;
  if v_price_in <> o.price::text then
    insert into public.payapp_events(ok, reason, userid, var1, var2, price, pay_state, mul_no, recvphone, payload)
    values (false, 'price_mismatch', v_userid, v_var1, v_var2, v_price_in, v_state, v_mulno, v_masked,
            p - 'linkkey' - 'linkval');
    return jsonb_build_object('ok', false, 'reason', 'price_mismatch');
  end if;
  if v_recv is not null and v_recv <> o.phone then
    insert into public.payapp_events(ok, reason, userid, var1, var2, price, pay_state, mul_no, recvphone, payload)
    values (false, 'phone_mismatch', v_userid, v_var1, v_var2, v_price_in, v_state, v_mulno, v_masked,
            p - 'linkkey' - 'linkval');
    return jsonb_build_object('ok', false, 'reason', 'phone_mismatch');
  end if;

  -- ③ 상태 반영 (여러 번 와도 결과가 같다)
  if v_state = '4' then
    /* 2026-11-26 — 1:1 상담 주문은 이용권 코드가 없다. 주문을 닫고 할인권만 사용 완료로. */
    if o.product like 'consult-%' then
      update public.payapp_orders
         set state = 'paid',
             pay_state = v_state,
             mul_no = coalesce(v_mulno, mul_no),
             pay_date = coalesce(nullif(btrim(coalesce(p->>'pay_date', '')), ''), pay_date),
             pay_type = coalesce(nullif(btrim(coalesce(p->>'pay_type', '')), ''), pay_type),
             goodname = coalesce(nullif(btrim(coalesce(p->>'goodname', '')), ''), goodname),
             paid_at = coalesce(paid_at, now()),
             updated_at = now()
       where id = o.id
       returning * into o;

      if o.coupon_id is not null then
        update public.member_coupons
           set used_at = coalesce(used_at, now()), used_order_no = o.order_no
         where id = o.coupon_id and used_at is null;
      end if;

      insert into public.payapp_events(ok, reason, userid, var1, var2, price, pay_state, mul_no, recvphone, payload)
      values (true, 'paid_consult', v_userid, v_var1, v_var2, v_price_in, v_state, v_mulno, v_masked,
              p - 'linkkey' - 'linkval');

      return jsonb_build_object('ok', true, 'state', 'paid', 'kind', 'consult',
        'order_no', o.order_no, 'product', o.product, 'price', o.price,
        'list_price', o.list_price, 'discount', coalesce(o.discount, 0), 'coupon_id', o.coupon_id);
    end if;

    v_tier := public.payapp_product(o.product)->>'tier';
    v_letter := public.payapp_product(o.product)->>'letter';
    v_code := v_letter || public.code_digits(v_letter, o.phone);

    update public.payapp_orders
       set state = 'paid',
           pay_state = v_state,
           mul_no = coalesce(v_mulno, mul_no),
           pay_date = coalesce(nullif(btrim(coalesce(p->>'pay_date', '')), ''), pay_date),
           pay_type = coalesce(nullif(btrim(coalesce(p->>'pay_type', '')), ''), pay_type),
           goodname = coalesce(nullif(btrim(coalesce(p->>'goodname', '')), ''), goodname),
           entry_code = v_code,
           paid_at = coalesce(paid_at, now()),
           updated_at = now()
     where id = o.id
     returning * into o;

    -- 결제한 번호의 유효 코드를 원장에 남긴다 (관리자 발급기와 같은 규칙)
    insert into public.entry_code_ledger(code, tier, phone, issued_at, paid_at, issued_by)
    values (v_code, v_tier, o.phone, coalesce(o.paid_at, now()), coalesce(o.paid_at, now()), 'payapp')
    on conflict (code) do update
       set paid_at = coalesce(public.entry_code_ledger.paid_at, excluded.paid_at),
           tier = excluded.tier;

    /* 72시간 특별 선물 — 자동 접수 (오류가 나도 결제 기록은 남긴다) */
    if o.product <> 'up-allinone' then
      begin
        sg := public.special_guide_auto_apply(o.client_uid, v_code, o.phone, coalesce(o.paid_at, now()), null);
      exception when others then
        sg := null;
      end;
    end if;

    v_ok := true;
    insert into public.payapp_events(ok, reason, userid, var1, var2, price, pay_state, mul_no, recvphone, payload)
    values (true, 'paid', v_userid, v_var1, v_var2, v_price_in, v_state, v_mulno, v_masked,
            p - 'linkkey' - 'linkval');

    return jsonb_build_object('ok', true, 'state', 'paid', 'order_no', o.order_no,
      'tier', v_tier, 'claim_no', sg.claim_no, 'within_72h', sg.within_72h);
  end if;

  if v_state = '10' then
    update public.payapp_orders
       set state = case when state = 'paid' then state else 'pending' end,
           pay_state = v_state, mul_no = coalesce(v_mulno, mul_no), updated_at = now()
     where id = o.id;
    insert into public.payapp_events(ok, reason, userid, var1, var2, price, pay_state, mul_no, recvphone, payload)
    values (true, 'pending', v_userid, v_var1, v_var2, v_price_in, v_state, v_mulno, v_masked,
            p - 'linkkey' - 'linkval');
    return jsonb_build_object('ok', true, 'state', 'pending', 'order_no', o.order_no);
  end if;

  if v_state in ('8', '32') then
    update public.payapp_orders
       set state = 'canceled', pay_state = v_state, canceled_at = now(), updated_at = now()
     where id = o.id;
    /* 결제가 끝나지 않았으니 할인권은 그대로 살려 둔다 */
    if o.coupon_id is not null then
      update public.member_coupons
         set used_at = null, used_order_no = null
       where id = o.coupon_id and used_order_no = o.order_no;
    end if;
    insert into public.payapp_events(ok, reason, userid, var1, var2, price, pay_state, mul_no, recvphone, payload)
    values (true, 'canceled', v_userid, v_var1, v_var2, v_price_in, v_state, v_mulno, v_masked,
            p - 'linkkey' - 'linkval');
    return jsonb_build_object('ok', true, 'state', 'canceled', 'order_no', o.order_no);
  end if;

  if v_state in ('9', '64', '70', '71') then
    -- 승인취소·부분취소 — 결제 기록을 닫고, 이 주문으로 발급한 코드의 결제 표시도 지운다
    update public.payapp_orders
       set state = 'canceled', pay_state = v_state, canceled_at = now(), updated_at = now()
     where id = o.id
     returning * into o;
    if o.entry_code is not null then
      update public.entry_code_ledger set paid_at = null
       where code = o.entry_code and issued_by = 'payapp';
    end if;
    /* 환불된 상담 결제 — 그 주문으로 쓴 할인권은 다시 쓸 수 있게 되돌린다 */
    if o.coupon_id is not null then
      update public.member_coupons
         set used_at = null, used_order_no = null
       where id = o.coupon_id and used_order_no = o.order_no;
    end if;
    insert into public.payapp_events(ok, reason, userid, var1, var2, price, pay_state, mul_no, recvphone, payload)
    values (true, 'refunded', v_userid, v_var1, v_var2, v_price_in, v_state, v_mulno, v_masked,
            p - 'linkkey' - 'linkval');
    return jsonb_build_object('ok', true, 'state', 'canceled', 'order_no', o.order_no);
  end if;

  -- 그 밖(요청 1 등)는 기록만
  insert into public.payapp_events(ok, reason, userid, var1, var2, price, pay_state, mul_no, recvphone, payload)
  values (true, 'state_' || v_state, v_userid, v_var1, v_var2, v_price_in, v_state, v_mulno, v_masked,
          p - 'linkkey' - 'linkval');
  return jsonb_build_object('ok', true, 'state', 'noted', 'pay_state', v_state, 'order_no', o.order_no);
end $function$;

-- ────────────────────────────────────────────────────────────
-- ④ 상담 주문 확인 — /apply/ 가 결제하고 돌아와 '서버가 확인한 금액'을 읽는다
--    주문 번호는 추측할 수 없는 32자 토큰 — 번호를 아는 사람만 본다(개인정보 없음)
-- ────────────────────────────────────────────────────────────
create or replace function public.consult_order_status(p_order_no text, p_phone text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_no text := nullif(btrim(coalesce(p_order_no, '')), '');
  v_ph text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), '');
  o public.payapp_orders;
begin
  if v_no is null then return jsonb_build_object('ok', false, 'error', 'bad_request'); end if;
  select * into o from public.payapp_orders where order_no = v_no;
  if o.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if o.product not like 'consult-%' then return jsonb_build_object('ok', false, 'error', 'not_consult'); end if;
  if v_ph is not null and v_ph <> o.phone then return jsonb_build_object('ok', false, 'error', 'phone_mismatch'); end if;

  return jsonb_build_object(
    'ok', true,
    'order_no', o.order_no,
    'product', o.product,
    'goodname', coalesce(o.goodname, public.payapp_product(o.product)->>'goodname'),
    'state', o.state,
    'paid', (o.state = 'paid'),
    'canceled', (o.state = 'canceled'),
    'list_price', coalesce(o.list_price, o.price),
    'discount', coalesce(o.discount, 0),
    'price', o.price,
    'coupon_id', o.coupon_id,
    'coupon_title', o.coupon_title,
    'paid_at', o.paid_at
  );
end $$;
revoke all on function public.consult_order_status(text, text) from public;
grant execute on function public.consult_order_status(text, text) to anon, authenticated;

-- ────────────────────────────────────────────────────────────
-- ⑤ claim_paid_unlock 안전장치 — 상담 주문으로는 이용권 코드를 만들지 않는다
-- ────────────────────────────────────────────────────────────
create or replace function public.claim_paid_unlock(p_phone text, p_order_no text, p_client_uid text default null, p_saju jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $function$
declare
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), '');
  v_no  text := nullif(btrim(coalesce(p_order_no, '')), '');
  o public.payapp_orders;
  v_tier text;
  v_letter text;
  v_code text;
  sg public.special_guide_requests;
begin
  if v_phone is null or v_no is null then
    return jsonb_build_object('ok', false, 'error', 'bad_request');
  end if;

  select * into o from public.payapp_orders
   where order_no = v_no and phone = v_phone;
  if o.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  /* 1:1 상담 주문 — 달력 이용권이 아니므로 열어 줄 코드가 없다 */
  if o.product like 'consult-%' then
    return jsonb_build_object('ok', true, 'status', 'consult', 'order_no', o.order_no,
      'paid', (o.state = 'paid'), 'price', o.price, 'list_price', coalesce(o.list_price, o.price),
      'discount', coalesce(o.discount, 0));
  end if;

  if o.state = 'canceled' then
    return jsonb_build_object('ok', true, 'status', 'canceled');
  end if;
  if o.state <> 'paid' then
    return jsonb_build_object('ok', true, 'status', 'pending');
  end if;

  v_tier := public.payapp_product(o.product)->>'tier';
  v_letter := public.payapp_product(o.product)->>'letter';
  v_code := v_letter || public.code_digits(v_letter, v_phone);

  insert into public.entry_code_ledger(code, tier, phone, issued_at, paid_at, issued_by)
  values (v_code, v_tier, v_phone, coalesce(o.paid_at, now()), coalesce(o.paid_at, now()), 'payapp')
  on conflict (code) do update
     set paid_at = coalesce(public.entry_code_ledger.paid_at, excluded.paid_at),
         tier = excluded.tier;

  update public.payapp_orders
     set entry_code = v_code,
         client_uid = coalesce(client_uid, o.client_uid),
         claimed_at = coalesce(claimed_at, now()),
         claim_count = claim_count + 1,
         updated_at = now()
   where id = o.id
   returning * into o;

  /* 72시간 특별 선물 — 여기서 오류가 나도 결제 확인·달력 열기는 그대로 진행한다 */
  if o.product <> 'up-allinone' then
    begin
      sg := public.special_guide_auto_apply(
        coalesce(nullif(btrim(coalesce(p_client_uid, '')), ''), o.client_uid),
        v_code, v_phone, o.paid_at, null);
    exception when others then
      sg := null;
    end;
  end if;

  return jsonb_build_object(
    'ok', true, 'status', 'paid',
    'tier', v_tier, 'code', v_code, 'phone', v_phone,
    'product', o.product, 'paid_at', o.paid_at,
    'claim_no', sg.claim_no, 'claim_status', sg.status,
    'within_72h', coalesce(sg.within_72h, false),
    'needs_review', coalesce(sg.needs_review, false)
  );
end $function$;

commit;

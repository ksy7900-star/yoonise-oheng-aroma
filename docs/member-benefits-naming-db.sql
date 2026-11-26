-- ============================================================
-- 💳 개명·작명 결제 연동 · '전 상품 10,000원 할인권' 공통 적용 (2026-11-26 #23131)
--   · payapp_product 에 naming(200,000원) 추가 — /apply/ 개명·작명 탭도 서버 주문으로 결제한다.
--   · 10,000원 할인권(친구 3명 초대 · 인스타그램 인증)의 적용 상품을 'all'(모든 상품)로 바꾼다.
--       → 원포인트 49,000→39,000 · 시그니처 100,000→90,000 · 개명·작명 200,000→190,000
--       → 앞으로 추가되는 상품에도 그대로 적용된다.
--   · 50% 할인권(5명 원포인트 · 7명 시그니처)은 applies_to 가 지정 상품 그대로라 영향 없음.
--   · 이미 발급된 10,000원 할인권도 함께 갱신한다(쓰지 않은 권이 개명·작명에서 막히지 않게).
--   · 기존 결제·이용권·코드·신청서 흐름은 그대로 — 이 파일은 덧씌우기(create or replace)만 한다.
--   실행: Supabase 대시보드 → SQL Editor 에 이 파일 전체를 붙여넣고 Run.
-- ============================================================
begin;

-- ────────────────────────────────────────────────────────────
-- ① 상품표 — naming(개명·작명 200,000원) 추가
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
    when 'naming'            then jsonb_build_object('product','naming','price',200000,'goodname','개명·작명','tier',null,'letter',null)
    else null end
$function$;

-- ────────────────────────────────────────────────────────────
-- ② 정가표 — naming 추가 (고객 화면 금액 표시·서버 계산이 같이 본다)
-- ────────────────────────────────────────────────────────────
create or replace function public.member_list_prices()
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'onepoint',  jsonb_build_object('name', '원포인트 리딩', 'price', 49000),
    'signature', jsonb_build_object('name', '시그니처 리딩', 'price', 100000),
    'naming',    jsonb_build_object('name', '개명·작명', 'price', 200000)
  );
$$;
revoke all on function public.member_list_prices() from public;
grant execute on function public.member_list_prices() to anon, authenticated;

-- ────────────────────────────────────────────────────────────
-- ③ 보유 할인권 조회 — applies_to 에 'all' 이 있으면 모든 상품에 쓸 수 있다
-- ────────────────────────────────────────────────────────────
create or replace function public.member_coupons_for(p_client_uid text default null, p_product text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_client text := nullif(btrim(coalesce(p_client_uid, '')), '');
  who      jsonb := public.member_who(v_client);
  v_me     uuid := nullif(who ->> 'user', '')::uuid;
  v_phone  text := who ->> 'phone';
  v_prod   text := lower(btrim(coalesce(p_product, '')));
  v_today  date := (now() at time zone 'Asia/Seoul')::date;
  v_list   jsonb := '[]'::jsonb;
  c        record;
  v_price  int;
  v_after  int;
begin
  for c in select * from public.member_coupons
            where revoked_at is null and used_at is null and expires_at >= v_today
              and ((v_me is not null and owner_user = v_me)
                or (v_client is not null and owner_client = v_client)
                or (v_phone is not null and owner_phone = v_phone))
            order by expires_at, id
  loop
    /* 'all' = 모든 상품 공통(2026-11-26) */
    continue when v_prod <> '' and not (v_prod = any(c.applies_to)) and not ('all' = any(c.applies_to));
    v_price := coalesce((public.member_list_prices() -> v_prod ->> 'price')::int, 0);
    if v_price <= 0 then continue; end if;
    v_after := case c.kind
                 when 'amount'  then greatest(v_price - c.value, 1000)
                 when 'percent' then greatest(round(v_price * (100 - c.value) / 100.0)::int, 1000)
                 else v_price end;
    v_list := v_list || jsonb_build_object(
      'id', c.id, 'title', c.title, 'kind', c.kind, 'value', c.value,
      'applies_to', to_jsonb(c.applies_to),
      'expires_at', to_char(c.expires_at, 'YYYY-MM-DD'),
      'list_price', v_price, 'pay_price', v_after, 'discount', v_price - v_after
    );
  end loop;

  return jsonb_build_object('ok', true, 'coupons', v_list);
end $$;

-- ────────────────────────────────────────────────────────────
-- ④ 주문 예약 — 할인권 검증에 'all' 공통 적용을 더한다 (금액 계산은 그대로)
-- ────────────────────────────────────────────────────────────
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
  who   jsonb;
  v_me  uuid;
  v_ph  text;
  c     public.member_coupons;
  v_list int;
  v_price int;
  v_pay int;
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

  /* 서버 상품 키 → 할인권 적용 상품 키 (consult-onepoint → onepoint · naming → naming) */
  v_key := case when v_prod like 'consult-%' then substring(v_prod from 9) else v_prod end;

  if p_coupon is not null then
    who := public.member_who(uid);
    v_me := nullif(who ->> 'user', '')::uuid;
    v_ph := who ->> 'phone';

    select * into c from public.member_coupons
     where id = p_coupon
       and revoked_at is null and used_at is null and expires_at >= v_today
       and ((v_me is not null and owner_user = v_me)
         or (uid is not null and owner_client = uid)
         or (v_ph is not null and owner_phone = v_ph));
    if c.id is null then
      return jsonb_build_object('ok', false, 'error', 'bad_coupon');
    end if;
    /* 'all' = 모든 상품 공통(2026-11-26) */
    if v_key = '' or (not (v_key = any(c.applies_to)) and not ('all' = any(c.applies_to))) then
      return jsonb_build_object('ok', false, 'error', 'coupon_not_for_product');
    end if;

    v_pay := case c.kind
               when 'amount'  then greatest(v_list - c.value, 1000)
               when 'percent' then greatest(round(v_list * (100 - c.value) / 100.0)::int, 1000)
               else v_list end;
    v_disc := v_list - v_pay;
    v_price := v_pay;
  end if;

  select count(*) into v_n from public.payapp_orders
   where phone = v_phone and created_at > now() - interval '1 hour';
  if v_n > 20 then
    return jsonb_build_object('ok', false, 'error', 'too_many');
  end if;

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
-- ⑤ 결제 통보 — 개명·작명도 '코드 없는 상담형 결제'로 닫고 할인권을 사용 완료 처리
--    (취소·환불 때 되살아나는 분기는 기존 그대로)
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
    if o.product like 'consult-%' or o.product = 'naming' then
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
    insert into public.entry_code_ledger(code, tier, phone, issued_at, paid_at, issued_by, code_kind)
    values (v_code, v_tier, o.phone, coalesce(o.paid_at, now()), coalesce(o.paid_at, now()), 'payapp',
            case when v_tier = 'month' then 'gift' else 'paid' end)
    on conflict (code) do update
       set paid_at = coalesce(public.entry_code_ledger.paid_at, excluded.paid_at),
           tier = excluded.tier,
           code_kind = coalesce(excluded.code_kind, public.entry_code_ledger.code_kind);

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
-- ⑥ 규칙·기존 발급권 갱신 — 10,000원 할인권을 '모든 상품'으로
--    · 친구 3명 초대(stage 3) · 인스타그램 인증 두 칸 모두 (금액 10000 이 기준)
--    · 50% 할인권(5명·7명)은 건드리지 않는다
-- ────────────────────────────────────────────────────────────
update public.member_benefit_rules
   set title      = '전 상품 10,000원 할인권 1매',
       subtitle   = '원포인트 · 시그니처 · 개명·작명 모두 사용',
       applies_to = array['all']::text[],
       updated_at = now()
 where coupon_kind = 'amount'
   and coalesce(coupon_value, 0) = 10000;

update public.member_coupons
   set applies_to = array['all']::text[]
 where kind = 'amount'
   and coalesce(value, 0) = 10000;

commit;

-- ────────────────────────────────────────────────────────────
-- 확인용 (Run 후 아래 결과를 보면 된다)
--   ① naming 상품: price 200000
--   ② 10,000원 규칙 2줄: applies_to = ["all"], title = 전 상품 10,000원 할인권 1매
--   ③ 기존 10,000원 발급권: 모두 applies_to = ["all"]
-- ────────────────────────────────────────────────────────────
-- select public.payapp_product('naming') as naming;
-- select trigger_kind, stage, title, applies_to from public.member_benefit_rules
--   where coupon_kind = 'amount' and coupon_value = 10000 order by trigger_kind, stage;
-- select count(*) as ten_k_coupons,
--        count(*) filter (where 'all' = any(applies_to)) as all_products
--   from public.member_coupons where kind = 'amount' and value = 10000;

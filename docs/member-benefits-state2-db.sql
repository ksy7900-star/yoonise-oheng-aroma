-- ============================================================
-- 👑 정식 회원 혜택 — 회원 상태 단일 참조로 다시 붙이기 (2026-11-26 · #22975)
--   member_who(기기) 위에서 지급·현황·차감·상담 할인권·인스타 승인이 모두 같은 상태를 본다.
--   무료 회원(M·체험)은 정식 혜택에서 제외. 인스타 승인은 회원 상태에 따라 자동 분기:
--     정식 회원 → 상담 1만원 할인권 1매 / 무료 회원 → 기존 30일 이용권(M 코드, 원장 gift)
-- ============================================================
begin;

-- ────────────────────────────────────────────────────────────
-- ① 혜택 자동 지급 — 번호(정식 회원) 또는 계정을 기준으로 한 번만
-- ────────────────────────────────────────────────────────────
create or replace function public.grant_member_benefits(p_user uuid, p_client text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  who      jsonb := public.member_who(p_client);
  v_client text := nullif(btrim(coalesce(p_client, '')), '');
  v_phone  text := who ->> 'phone';
  v_member boolean := coalesce((who ->> 'member')::boolean, false);
  v_paid_tier text;
  v_count  int := 0;
  v_base   text;
  v_today  date := (now() at time zone 'Asia/Seoul')::date;
  v_prices jsonb := public.member_list_prices();
  v_exp    date;
  v_id     bigint;
  v_granted jsonb := '[]'::jsonb;
  r        record;
begin
  if p_user is not null then
    select paid_tier into v_paid_tier from public.profiles where id = p_user;
    if v_paid_tier in ('pass', 'allinone', 'diary') then v_member := true; end if;
  end if;
  if v_member is not true then
    return jsonb_build_object('ok', true, 'granted', '[]'::jsonb);
  end if;

  v_base := case when v_phone is not null then 'p:' || v_phone
                 when p_user is not null then 'u:' || p_user::text
                 else null end;
  if v_base is null then
    return jsonb_build_object('ok', true, 'granted', '[]'::jsonb);
  end if;

  perform pg_advisory_xact_lock(hashtext('member_benefit:' || v_base));

  -- 발급 때 알게 된 나머지 열쇠(계정·기기)를 비어 있는 발급권에 채운다
  update public.member_coupons
     set owner_client = coalesce(owner_client, v_client),
         owner_user   = coalesce(owner_user, p_user),
         owner_phone  = coalesce(owner_phone, v_phone)
   where grant_key like v_base || '|%';
  update public.member_burn_credits
     set owner_client = coalesce(owner_client, v_client),
         owner_user   = coalesce(owner_user, p_user),
         owner_phone  = coalesce(owner_phone, v_phone)
   where grant_key like v_base || '|%';

  if p_user is not null then
    select count(*) into v_count from public.referrals where referrer_id = p_user;
  end if;

  for r in select * from public.member_benefit_rules
            where active and trigger_kind = 'referral' and stage > 0
            order by stage
  loop
    continue when v_count < r.stage;
    v_exp := v_today + make_interval(months => greatest(coalesce(r.valid_months, 6), 1));

    if r.benefit_kind = 'coupon' and r.coupon_kind in ('amount', 'percent') and coalesce(r.coupon_value, 0) > 0 then
      insert into public.member_coupons
        (grant_key, owner_user, owner_client, owner_phone, source, stage, kind, value,
         applies_to, title, list_price, valid_months, expires_at)
      values
        (v_base || '|referral|' || r.stage::text,
         p_user, v_client, v_phone, 'referral', r.stage, r.coupon_kind, r.coupon_value,
         coalesce(r.applies_to, array['onepoint','signature']::text[]), r.title, v_prices,
         greatest(coalesce(r.valid_months, 6), 1), v_exp)
      on conflict (grant_key) do nothing
      returning id into v_id;
      if v_id is not null then
        v_granted := v_granted || jsonb_build_object(
          'kind', 'coupon', 'id', v_id, 'stage', r.stage, 'title', r.title,
          'coupon_kind', r.coupon_kind, 'value', r.coupon_value,
          'expires_at', to_char(v_exp, 'YYYY-MM-DD'));
      end if;
    end if;

    if r.benefit_kind = 'burn' and coalesce(r.burn_count, 0) > 0 then
      insert into public.member_burn_credits
        (grant_key, owner_user, owner_client, owner_phone, source, total, used, expires_at, note)
      values
        (v_base || '|referral|' || r.stage::text || '|burn',
         p_user, v_client, v_phone, 'referral', r.burn_count, 0, v_exp, r.title)
      on conflict (grant_key) do nothing
      returning id into v_id;
      if v_id is not null then
        v_granted := v_granted || jsonb_build_object(
          'kind', 'burn', 'id', v_id, 'stage', r.stage, 'title', r.title,
          'count', r.burn_count, 'expires_at', to_char(v_exp, 'YYYY-MM-DD'));
      end if;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'granted', v_granted);
end $$;

-- ────────────────────────────────────────────────────────────
-- ② 회원 혜택 현황 — 계정·기기·번호 어느 쪽으로 들어와도 같은 답
-- ────────────────────────────────────────────────────────────
create or replace function public.member_status(p_client_uid text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_client text := nullif(btrim(coalesce(p_client_uid, '')), '');
  who      jsonb;
  v_me     uuid;
  v_phone  text;
  v_refs   int := 0;
  v_today  date := (now() at time zone 'Asia/Seoul')::date;
  v_coupons jsonb := '[]'::jsonb;
  v_burn   jsonb := jsonb_build_object('total', 0, 'used', 0, 'remaining', 0);
  v_news   jsonb := '[]'::jsonb;
  v_insta  jsonb := null;
  v_stages jsonb := '[]'::jsonb;
  v_next   jsonb := null;
  r        record;
begin
  who := public.member_who(v_client);
  v_me := nullif(who ->> 'user', '')::uuid;
  v_phone := who ->> 'phone';

  if v_me is not null then
    select count(*) into v_refs from public.referrals where referrer_id = v_me;
    perform public.grant_member_benefits(v_me, v_client);
    who := public.member_who(v_client);
  elsif v_phone is not null then
    perform public.grant_member_benefits(null, v_client);
    who := public.member_who(v_client);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'title', c.title, 'kind', c.kind, 'value', c.value,
           'applies_to', to_jsonb(c.applies_to), 'source', c.source, 'stage', c.stage,
           'issued_at', to_char(c.issued_at at time zone 'Asia/Seoul', 'YYYY-MM-DD'),
           'expires_at', to_char(c.expires_at, 'YYYY-MM-DD'),
           'used_at', case when c.used_at is null then null
                           else to_char(c.used_at at time zone 'Asia/Seoul', 'YYYY-MM-DD') end,
           'status', case when c.revoked_at is not null then 'revoked'
                          when c.used_at is not null then 'used'
                          when c.expires_at < v_today then 'expired'
                          else 'usable' end,
           'usable', (c.revoked_at is null and c.used_at is null and c.expires_at >= v_today)
         ) order by c.issued_at desc, c.id desc), '[]'::jsonb)
    into v_coupons
    from public.member_coupons c
   where (v_me is not null and c.owner_user = v_me)
      or (v_client is not null and c.owner_client = v_client)
      or (v_phone is not null and c.owner_phone = v_phone);

  select jsonb_build_object(
           'total', coalesce(sum(b.total), 0),
           'used', coalesce(sum(b.used), 0),
           'remaining', coalesce(sum(greatest(b.total - b.used, 0)), 0))
    into v_burn
    from public.member_burn_credits b
   where ((v_me is not null and b.owner_user = v_me)
       or (v_client is not null and b.owner_client = v_client)
       or (v_phone is not null and b.owner_phone = v_phone))
     and (b.expires_at is null or b.expires_at >= v_today);

  select coalesce(jsonb_agg(n), '[]'::jsonb) into v_news
    from (
      select jsonb_build_object('kind', 'coupon', 'id', c.id, 'title', c.title) as n
        from public.member_coupons c
       where ((v_me is not null and c.owner_user = v_me)
           or (v_client is not null and c.owner_client = v_client)
           or (v_phone is not null and c.owner_phone = v_phone))
         and c.seen_at is null and c.revoked_at is null
      union all
      select jsonb_build_object('kind', 'burn', 'id', b.id,
               'title', coalesce(b.note, '액운 태우기 추가 이용권') || ' ' || b.total || '회')
        from public.member_burn_credits b
       where ((v_me is not null and b.owner_user = v_me)
           or (v_client is not null and b.owner_client = v_client)
           or (v_phone is not null and b.owner_phone = v_phone))
         and b.seen_at is null
    ) s;

  select jsonb_build_object('status', i.status,
                            'at', to_char(i.created_at at time zone 'Asia/Seoul', 'YYYY-MM-DD'))
    into v_insta
    from public.member_insta_requests i
   where (v_me is not null and i.uniq = 'u:' || v_me::text)
      or (v_phone is not null and i.uniq = 'p:' || v_phone)
      or (v_client is not null and i.uniq = 'c:' || v_client)
   order by i.created_at desc limit 1;

  for r in select * from public.member_benefit_rules
            where active and trigger_kind = 'referral' and stage > 0
            order by stage
  loop
    v_stages := v_stages || jsonb_build_object(
      'stage', r.stage, 'achieved', v_refs >= r.stage,
      'remaining', greatest(r.stage - v_refs, 0), 'title', r.title,
      'benefit', r.benefit_kind);
    if v_next is null and v_refs < r.stage then
      v_next := jsonb_build_object('stage', r.stage, 'remaining', r.stage - v_refs, 'title', r.title);
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'member', coalesce((who ->> 'member')::boolean, false),
    'paid', coalesce((who ->> 'paid')::boolean, false),
    'tier', who ->> 'tier',
    'code_kind', who ->> 'code_kind',
    'referrals', v_refs,
    'coupons', v_coupons,
    'burn', v_burn,
    'news', v_news,
    'insta', v_insta,
    'stages', v_stages,
    'next', v_next,
    'products', public.member_list_prices()
  );
end $$;

-- ────────────────────────────────────────────────────────────
-- ③ 액운 태우기 추가 이용권 차감 — 계정·기기·번호 어느 쪽이든 1회 차감
-- ────────────────────────────────────────────────────────────
create or replace function public.member_burn_use(p_client_uid text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_client text := nullif(btrim(coalesce(p_client_uid, '')), '');
  who      jsonb;
  v_me     uuid;
  v_phone  text;
  v_today  date := (now() at time zone 'Asia/Seoul')::date;
  b        public.member_burn_credits;
  v_key    text;
  v_left   int;
begin
  who := public.member_who(v_client);
  v_me := nullif(who ->> 'user', '')::uuid;
  v_phone := who ->> 'phone';
  v_key := coalesce(case when v_phone is not null then 'p:' || v_phone end,
                    case when v_me is not null then 'u:' || v_me::text end,
                    case when v_client is not null then 'c:' || v_client end);
  if v_key is null then
    return jsonb_build_object('ok', false, 'reason', 'no_identity', 'remaining', 0);
  end if;
  perform pg_advisory_xact_lock(hashtext('member_burn:' || v_key));

  select * into b from public.member_burn_credits
   where ((v_me is not null and owner_user = v_me)
       or (v_client is not null and owner_client = v_client)
       or (v_phone is not null and owner_phone = v_phone))
     and used < total
     and (expires_at is null or expires_at >= v_today)
   order by granted_at, id
   limit 1
   for update;

  if b.id is null then
    select coalesce(sum(greatest(total - used, 0)), 0) into v_left
      from public.member_burn_credits
     where ((v_me is not null and owner_user = v_me)
         or (v_client is not null and owner_client = v_client)
         or (v_phone is not null and owner_phone = v_phone))
       and (expires_at is null or expires_at >= v_today);
    return jsonb_build_object('ok', false, 'reason', 'none', 'remaining', coalesce(v_left, 0));
  end if;

  update public.member_burn_credits set used = used + 1 where id = b.id;

  select coalesce(sum(greatest(total - used, 0)), 0) into v_left
    from public.member_burn_credits
   where ((v_me is not null and owner_user = v_me)
       or (v_client is not null and owner_client = v_client)
       or (v_phone is not null and owner_phone = v_phone))
     and (expires_at is null or expires_at >= v_today);

  return jsonb_build_object('ok', true, 'id', b.id, 'remaining', coalesce(v_left, 0),
                            'total', b.total, 'used', b.used + 1);
end $$;

-- ────────────────────────────────────────────────────────────
-- ④ /apply/ — 이 사람이 지금 쓸 수 있는 상담 할인권
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
    continue when v_prod <> '' and not (v_prod = any(c.applies_to));
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
-- ⑤ 인스타그램 인증 확인 요청 — 번호가 있으면 번호 기준(회원 상태 분기용)
-- ────────────────────────────────────────────────────────────
create or replace function public.member_insta_submit(p_client_uid text default null, p_memo text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_client text := nullif(btrim(coalesce(p_client_uid, '')), '');
  who      jsonb;
  v_me     uuid;
  v_phone  text;
  v_uniq   text;
  v_row    public.member_insta_requests;
begin
  who := public.member_who(v_client);
  v_me := nullif(who ->> 'user', '')::uuid;
  v_phone := who ->> 'phone';
  v_uniq := case when v_phone is not null then 'p:' || v_phone
                 when v_me is not null then 'u:' || v_me::text
                 when v_client is not null then 'c:' || v_client
                 else null end;
  if v_uniq is null then
    return jsonb_build_object('ok', false, 'reason', 'no_identity');
  end if;

  select * into v_row from public.member_insta_requests where uniq = v_uniq;
  if v_row.id is not null then
    return jsonb_build_object('ok', true, 'status', v_row.status, 'already', true);
  end if;

  insert into public.member_insta_requests (uniq, owner_user, owner_client, nickname, memo)
  values (v_uniq, v_me, v_client, (select nickname from public.profiles where id = v_me),
          left(coalesce(p_memo, ''), 300))
  returning * into v_row;

  return jsonb_build_object('ok', true, 'status', v_row.status, 'already', false);
end $$;

-- ────────────────────────────────────────────────────────────
-- ⑥ 상담 주문 예약 — 할인권 주인 확인도 같은 회원 상태로
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

  -- 상담 상품 키 → 할인권 적용 상품 키 (consult-onepoint → onepoint)
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
    if v_key = '' or not (v_key = any(c.applies_to)) then
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

commit;

-- ============================================================
-- 👑 정식 회원 혜택 — 관리자 「회원 혜택 관리」 (2026-11-26)
-- /calendar/yoon-key/ 여섯 번째 탭이 부르는 함수 하나.
-- 기존 관리자 함수와 같은 방식: 6자리 PIN 확인(admin_check_pin) → SECURITY DEFINER.
--
-- p_action
--   list          : 규칙 + 요약 + 인스타 확인 대기 + 최근 발급
--   members       : 회원별 혜택 현황(검색 q)
--   member        : 한 회원의 할인권·이용권·인증 이력
--   save_rules    : 규칙 저장(재배포 없이 즉시 반영)
--   insta_approve : 인스타 인증 승인 → 1만원 할인권 자동 발급(중복 방지)
--   insta_reject  : 인스타 인증 반려
--   grant         : 예외 수동 지급(할인권 / 액운 태우기 이용권)
--   coupon_use    : 수동 사용 처리 · coupon_unuse : 사용 취소
--   burn_adjust   : 액운 태우기 이용권 수동 가감(delta)
-- ============================================================
begin;

create or replace function public.admin_member_benefits(p_pin text, p_action text, p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_pin  text;
  v_act  text := lower(btrim(coalesce(p_action, '')));
  v_pay  jsonb := coalesce(p_payload, '{}'::jsonb);
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_uid  uuid;
  v_uniq text;
  v_client text;
  v_nick text;
  r      record;
  r2     record;
  c      public.member_coupons;
  b      public.member_burn_credits;
  v_id   bigint;
  v_count int := 0;
  v_granted jsonb := '[]'::jsonb;
  v_rules jsonb;
begin
  v_pin := public.admin_check_pin(p_pin);
  if v_pin <> 'ok' then
    return jsonb_build_object('ok', false, 'error', 'pin_' || v_pin);
  end if;

  -- ── 규칙 + 요약 + 최근 발급 ─────────────────────────────
  if v_act = 'list' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', id, 'trigger', trigger_kind, 'stage', stage, 'sort', sort,
             'benefit', benefit_kind, 'title', title, 'subtitle', subtitle,
             'coupon_kind', coupon_kind, 'coupon_value', coupon_value,
             'applies_to', to_jsonb(applies_to), 'burn_count', burn_count,
             'valid_months', valid_months, 'active', active,
             'updated_at', updated_at) order by sort, stage), '[]'::jsonb)
      into v_rules
      from public.member_benefit_rules;

    return jsonb_build_object(
      'ok', true,
      'generated_at', now(),
      'rules', v_rules,
      'products', public.member_list_prices(),
      'summary', jsonb_build_object(
        'issued', (select count(*) from public.member_coupons),
        'usable', (select count(*) from public.member_coupons
                    where used_at is null and revoked_at is null and expires_at >= v_today),
        'used',   (select count(*) from public.member_coupons where used_at is not null),
        'expired',(select count(*) from public.member_coupons
                    where used_at is null and revoked_at is null and expires_at < v_today),
        'burn_total', (select coalesce(sum(total), 0) from public.member_burn_credits),
        'burn_used',  (select coalesce(sum(used), 0) from public.member_burn_credits),
        'burn_left',  (select coalesce(sum(greatest(total - used, 0)), 0) from public.member_burn_credits),
        'insta_pending', (select count(*) from public.member_insta_requests where status = 'pending')
      ),
      'insta', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', i.id, 'uniq', i.uniq, 'nickname', i.nickname, 'memo', i.memo,
                 'status', i.status, 'created_at', i.created_at,
                 'email', coalesce(u.email, ''),
                 'invite_code', coalesce(p.invite_code, ''),
                 'paid_tier', p.paid_tier) order by i.created_at desc)
          from public.member_insta_requests i
          left join public.profiles p on p.id = i.owner_user
          left join auth.users u on u.id = i.owner_user
         where i.status = 'pending'), '[]'::jsonb),
      'recent', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', c.id, 'title', c.title, 'kind', c.kind, 'value', c.value, 'source', c.source,
                 'stage', c.stage, 'issued_at', c.issued_at, 'expires_at', c.expires_at,
                 'used_at', c.used_at, 'used_order_no', c.used_order_no,
                 'nickname', coalesce(p.nickname, ''), 'email', coalesce(u.email, ''),
                 'status', case when c.revoked_at is not null then 'revoked'
                                when c.used_at is not null then 'used'
                                when c.expires_at < v_today then 'expired'
                                else 'usable' end
               ) order by c.issued_at desc, c.id desc)
          from (select * from public.member_coupons order by issued_at desc, id desc limit 40) c
          left join public.profiles p on p.id = c.owner_user
          left join auth.users u on u.id = c.owner_user), '[]'::jsonb)
    );
  end if;

  -- ── 회원별 혜택 현황 ───────────────────────────────────
  if v_act = 'members' then
    return jsonb_build_object('ok', true, 'members', coalesce((
      select jsonb_agg(jsonb_build_object(
               'user_id', p.id,
               'nickname', coalesce(nullif(btrim(p.nickname), ''), nullif(btrim(u.raw_user_meta_data ->> 'name'), ''), '이름 없음'),
               'email', coalesce(u.email, ''),
               'invite_code', coalesce(p.invite_code, ''),
               'paid_tier', p.paid_tier,
               'member', coalesce(p.paid_tier in ('pass', 'allinone', 'diary'), false),
               'refs', (select count(*) from public.referrals r where r.referrer_id = p.id),
               'coupons_usable', (select count(*) from public.member_coupons c
                                   where c.owner_user = p.id and c.used_at is null
                                     and c.revoked_at is null and c.expires_at >= v_today),
               'coupons_used', (select count(*) from public.member_coupons c
                                 where c.owner_user = p.id and c.used_at is not null),
               'burn_left', (select coalesce(sum(greatest(total - used, 0)), 0) from public.member_burn_credits b
                              where b.owner_user = p.id and (b.expires_at is null or b.expires_at >= v_today)),
               'insta', (select i.status from public.member_insta_requests i
                          where i.uniq = 'u:' || p.id::text order by i.created_at desc limit 1)
             ) order by p.created_at desc)
        from public.profiles p
        left join auth.users u on u.id = p.id
       where coalesce(btrim(v_pay ->> 'q'), '') = ''
          or coalesce(u.email, '') ilike '%' || btrim(v_pay ->> 'q') || '%'
          or coalesce(p.nickname, '') ilike '%' || btrim(v_pay ->> 'q') || '%'
          or coalesce(p.invite_code, '') ilike '%' || btrim(v_pay ->> 'q') || '%'
       limit 200), '[]'::jsonb));
  end if;

  if v_act = 'member' then
    v_uid := nullif(btrim(v_pay ->> 'user_id'), '')::uuid;
    if v_uid is null then return jsonb_build_object('ok', false, 'error', 'bad_user'); end if;
    return jsonb_build_object(
      'ok', true,
      'user_id', v_uid,
      'coupons', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', c.id, 'title', c.title, 'kind', c.kind, 'value', c.value,
                 'source', c.source, 'stage', c.stage, 'applies_to', to_jsonb(c.applies_to),
                 'issued_at', c.issued_at, 'expires_at', c.expires_at,
                 'used_at', c.used_at, 'used_order_no', c.used_order_no, 'note', c.note,
                 'status', case when c.revoked_at is not null then 'revoked'
                                when c.used_at is not null then 'used'
                                when c.expires_at < v_today then 'expired'
                                else 'usable' end
               ) order by c.issued_at desc, c.id desc)
          from public.member_coupons c where c.owner_user = v_uid), '[]'::jsonb),
      'burn', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', b.id, 'total', b.total, 'used', b.used, 'source', b.source,
                 'granted_at', b.granted_at, 'expires_at', b.expires_at, 'note', b.note)
               order by b.granted_at desc)
          from public.member_burn_credits b where b.owner_user = v_uid), '[]'::jsonb),
      'insta', (
        select jsonb_build_object('id', i.id, 'status', i.status, 'created_at', i.created_at,
                                  'handled_at', i.handled_at, 'coupon_id', i.coupon_id)
          from public.member_insta_requests i
         where i.uniq = 'u:' || v_uid::text order by i.created_at desc limit 1)
    );
  end if;

  -- ── 규칙 저장 — 재배포 없이 고객 화면·지급에 바로 반영 ─────────
  if v_act = 'save_rules' then
    for r in select value as x from jsonb_array_elements(coalesce(v_pay -> 'rules', '[]'::jsonb)) loop
      begin
        update public.member_benefit_rules set
          trigger_kind = coalesce(nullif(btrim(r.x ->> 'trigger'), ''), trigger_kind),
          stage        = coalesce((r.x ->> 'stage')::int, stage),
          benefit_kind = coalesce(nullif(btrim(r.x ->> 'benefit'), ''), benefit_kind),
          title        = coalesce(nullif(btrim(r.x ->> 'title'), ''), title),
          subtitle     = coalesce(r.x ->> 'subtitle', subtitle),
          coupon_kind  = nullif(btrim(coalesce(r.x ->> 'coupon_kind', '')), ''),
          coupon_value = coalesce((r.x ->> 'coupon_value')::int, 0),
          applies_to   = coalesce(
                           (select array_agg(value) from jsonb_array_elements_text(coalesce(r.x -> 'applies_to', '[]'::jsonb))),
                           applies_to),
          burn_count   = coalesce((r.x ->> 'burn_count')::int, burn_count),
          valid_months = greatest(coalesce((r.x ->> 'valid_months')::int, valid_months), 1),
          active       = coalesce((r.x ->> 'active')::boolean, active),
          sort         = coalesce((r.x ->> 'sort')::int, sort),
          updated_at   = now()
        where id = (r.x ->> 'id')::bigint;
        v_count := v_count + 1;
      exception when others then
        null;   -- 한 줄이 잘못돼도 나머지 줄은 저장한다
      end;
    end loop;
    return jsonb_build_object('ok', true, 'saved', v_count);
  end if;

  -- ── 인스타그램 인증 승인 → 할인권 자동 발급 ─────────────────
  if v_act in ('insta_approve', 'insta_reject') then
    v_id := nullif(btrim(coalesce(v_pay ->> 'id', '')), '')::bigint;
    if v_id is null then
      -- 신청 기록 없이 회원만 지정한 경우 — 승인은 새 기록을 만들어 처리한다
      v_uid := nullif(btrim(coalesce(v_pay ->> 'user_id', '')), '')::uuid;
      if v_uid is null then return jsonb_build_object('ok', false, 'error', 'bad_request'); end if;
      insert into public.member_insta_requests (uniq, owner_user, nickname, memo, status)
      select 'u:' || v_uid::text, v_uid, coalesce(p.nickname, ''), '관리자 직접 승인', 'pending'
        from public.profiles p where p.id = v_uid
      on conflict (uniq) do update set status = public.member_insta_requests.status
      returning id into v_id;
      if v_id is null then
        select id into v_id from public.member_insta_requests where uniq = 'u:' || v_uid::text;
      end if;
    end if;

    select * into r from public.member_insta_requests where id = v_id;
    if r.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;

    if v_act = 'insta_reject' then
      update public.member_insta_requests set status = 'rejected', handled_at = now() where id = r.id;
      return jsonb_build_object('ok', true, 'status', 'rejected');
    end if;

    if r.status = 'approved' then
      return jsonb_build_object('ok', true, 'status', 'approved', 'already', true, 'coupon_id', r.coupon_id);
    end if;

    v_uid := r.owner_user; v_client := r.owner_client;
    v_uniq := case when v_uid is not null then 'u:' || v_uid::text else 'c:' || v_client end;

    select * into c from public.member_coupons where grant_key = v_uniq || '|insta';
    if c.id is null then
      select * into r2 from public.member_benefit_rules where trigger_kind = 'insta' limit 1;
      if r2.id is null or not r2.active then
        return jsonb_build_object('ok', false, 'error', 'insta_rule_off');
      end if;
      insert into public.member_coupons
        (grant_key, owner_user, owner_client, source, stage, kind, value, applies_to, title, list_price, valid_months, expires_at, note)
      values
        (v_uniq || '|insta', v_uid, v_client, 'insta', 0, r2.coupon_kind, r2.coupon_value,
         coalesce(r2.applies_to, array['onepoint','signature']::text[]), r2.title,
         public.member_list_prices(), greatest(coalesce(r2.valid_months, 6), 1),
         v_today + make_interval(months => greatest(coalesce(r2.valid_months, 6), 1)),
         '인스타그램 인증 승인')
      on conflict (grant_key) do nothing
      returning id into v_id;
      if v_id is null then
        select id into v_id from public.member_coupons where grant_key = v_uniq || '|insta';
      end if;
    else
      v_id := c.id;
    end if;

    update public.member_insta_requests
       set status = 'approved', handled_at = now(), coupon_id = v_id
     where id = r.id;

    return jsonb_build_object('ok', true, 'status', 'approved', 'coupon_id', v_id,
      'title', coalesce((select title from public.member_coupons where id = v_id), ''));
  end if;

  -- ── 예외 수동 지급 ──────────────────────────────────────
  if v_act = 'grant' then
    v_uid := nullif(btrim(coalesce(v_pay ->> 'user_id', '')), '')::uuid;
    if v_uid is null then return jsonb_build_object('ok', false, 'error', 'bad_user'); end if;

    if lower(coalesce(v_pay ->> 'benefit', 'coupon')) = 'burn' then
      insert into public.member_burn_credits (grant_key, owner_user, source, total, used, expires_at, note)
      values ('manual:' || gen_random_uuid()::text, v_uid, 'manual',
              greatest(coalesce((v_pay ->> 'burn_count')::int, 1), 1), 0, null,
              coalesce(nullif(btrim(v_pay ->> 'note'), ''), '관리자 수동 지급'))
      returning id into v_id;
      return jsonb_build_object('ok', true, 'kind', 'burn', 'id', v_id);
    end if;

    insert into public.member_coupons
      (grant_key, owner_user, source, stage, kind, value, applies_to, title, list_price, valid_months, expires_at, note)
    values
      ('manual:' || gen_random_uuid()::text, v_uid, 'manual', 0,
       coalesce(nullif(btrim(v_pay ->> 'coupon_kind'), ''), 'amount'),
       greatest(coalesce((v_pay ->> 'coupon_value')::int, 10000), 1),
       coalesce((select array_agg(value) from jsonb_array_elements_text(coalesce(v_pay -> 'applies_to', '["onepoint","signature"]'::jsonb))),
                array['onepoint','signature']::text[]),
       coalesce(nullif(btrim(v_pay ->> 'title'), ''), '상담 할인권'),
       public.member_list_prices(),
       greatest(coalesce((v_pay ->> 'valid_months')::int, 6), 1),
       v_today + make_interval(months => greatest(coalesce((v_pay ->> 'valid_months')::int, 6), 1)),
       coalesce(nullif(btrim(v_pay ->> 'note'), ''), '관리자 수동 지급'))
    returning id into v_id;
    return jsonb_build_object('ok', true, 'kind', 'coupon', 'id', v_id);
  end if;

  -- ── 수동 사용 / 사용 취소 ────────────────────────────────
  if v_act in ('coupon_use', 'coupon_unuse') then
    v_id := nullif(btrim(coalesce(v_pay ->> 'id', '')), '')::bigint;
    if v_id is null then return jsonb_build_object('ok', false, 'error', 'bad_request'); end if;
    if v_act = 'coupon_use' then
      update public.member_coupons
         set used_at = now(), used_order_no = coalesce(nullif(btrim(v_pay ->> 'order_no'), ''), used_order_no)
       where id = v_id and used_at is null;
    else
      update public.member_coupons set used_at = null, used_order_no = null where id = v_id;
    end if;
    return jsonb_build_object('ok', true);
  end if;

  if v_act = 'burn_adjust' then
    v_id := nullif(btrim(coalesce(v_pay ->> 'id', '')), '')::bigint;
    if v_id is null then return jsonb_build_object('ok', false, 'error', 'bad_request'); end if;
    update public.member_burn_credits
       set used = least(greatest(used + coalesce((v_pay ->> 'delta')::int, 1), 0), total)
     where id = v_id
     returning * into b;
    return jsonb_build_object('ok', true, 'id', b.id, 'total', b.total, 'used', b.used);
  end if;

  return jsonb_build_object('ok', false, 'error', 'bad_action');
end $$;
revoke all on function public.admin_member_benefits(text, text, jsonb) from public;
grant execute on function public.admin_member_benefits(text, text, jsonb) to anon, authenticated;

commit;

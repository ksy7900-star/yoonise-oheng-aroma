-- ============================================================
-- 👑 초대 보상 지급 훅 (2026-11-26)
-- 기존 grant_referral_rewards(무료 회원 보상: PASS_2W/1M/3M/6M + 1만원·반값) 는 한 줄도 바꾸지 않고,
-- 끝에 정식 회원 전용 혜택 지급(grant_member_benefits)만 덧붙인다.
--   → 친구가 초대 링크로 들어와 attach_referrer 가 불릴 때, 정식 회원이면
--     그 순간 액운 태우기 추가 이용권·상담 할인권이 자동 발급된다(중복은 서버가 막는다).
-- ============================================================
begin;

CREATE OR REPLACE FUNCTION public.grant_referral_rewards(p_user uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_count int;
  r record;
  v_granted int := 0;
begin
  if not exists (select 1 from public.profiles where id = p_user) then
    return 0;
  end if;

  -- 같은 사람 보상 계산은 한 번에 하나씩 — 두 탭·두 기기에서 동시에 들어와도 중복 지급 없음
  perform pg_advisory_xact_lock(hashtext('grant_referral:' || p_user::text));

  select count(*) into v_count from public.referrals where referrer_id = p_user;
  if v_count < 1 then
    return 0;
  end if;

  -- 1·3·5·7명 칸 — 넘어선 단계마다 한 번만 지급
  for r in select * from public.referral_rules where active order by threshold loop
    if v_count >= r.threshold then
      if not exists (
        select 1 from public.entitlements
         where user_id = p_user and product_code = r.reward_product and source = 'referral'
      ) then
        insert into public.entitlements (user_id, product_code, source, expires_at)
        values (p_user, r.reward_product, 'referral',
                (now() at time zone 'Asia/Seoul')::date + r.reward_days);

        update public.referrals
           set reward_kind = r.reward_product, reward_granted_at = now()
         where id = (select id from public.referrals
                      where referrer_id = p_user and reward_kind is null
                      order by created_at limit 1);

        v_granted := v_granted + 1;
      end if;

      -- 5명 칸 — 1:1 상담 1만원 할인
      if r.threshold = 5 and not exists (
        select 1 from public.entitlements
         where user_id = p_user and product_code = 'CONSULT_10K_OFF' and source = 'referral'
      ) then
        insert into public.entitlements (user_id, product_code, source, expires_at)
        values (p_user, 'CONSULT_10K_OFF', 'referral', null);
        v_granted := v_granted + 1;
      end if;

      -- 7명 칸 — 1:1 원포인트 상담 반값(50%)
      if r.threshold = 7 and not exists (
        select 1 from public.entitlements
         where user_id = p_user and product_code = 'CONSULT_HALF' and source = 'referral'
      ) then
        insert into public.entitlements (user_id, product_code, source, expires_at)
        values (p_user, 'CONSULT_HALF', 'referral', null);
        v_granted := v_granted + 1;
      end if;
    end if;
  end loop;

  /* 2026-11-26 — 정식 회원이면 초대가 붙는 그 순간 전용 혜택(액운 추가 이용권·상담 할인권)도 함께 지급.
     grant_member_benefits 가 중복을 막으므로 몇 번을 불려도 결과가 같다. */
  begin
    perform public.grant_member_benefits(p_user, null);
  exception when others then
    null;
  end;

  return v_granted;
end $function$;

commit;

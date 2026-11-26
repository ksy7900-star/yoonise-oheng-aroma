-- ============================================================
-- 👑 회원 상태 단일 참조 보강 (2026-11-26)
--   · 번호 ↔ 계정 연결(member_accounts)을 두고, 로그인 세션이 없어도
--     같은 번호의 계정이 받은 할인권·추가 이용권을 그 기기에서 볼 수 있게 한다.
-- ============================================================
begin;


-- 번호에 묶인 계정들 — 로그인 세션이 없어도 같은 사람의 발급권을 찾는다
create table if not exists public.member_accounts (
  user_id uuid primary key,
  phone   text not null,
  updated_at timestamptz not null default now()
);
create index if not exists member_accounts_phone_idx on public.member_accounts (phone);
alter table public.member_accounts enable row level security;
revoke all on public.member_accounts from anon, authenticated;
grant select, insert, update, delete on public.member_accounts to service_role;

create or replace function public.member_users(p_user uuid, p_phone text)
returns uuid[]
language sql
security definer
set search_path = public
as $$
  select coalesce(
    (select array_agg(distinct x) from (
       select p_user as x where p_user is not null
       union all
       select a.user_id from public.member_accounts a where p_phone is not null and a.phone = p_phone
     ) s), '{}'::uuid[]);
$$;
revoke all on function public.member_users(uuid, text) from public;
grant execute on function public.member_users(uuid, text) to anon, authenticated;


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
  v_users  uuid[] := '{}';
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
  v_users := public.member_users(v_me, v_phone);

  if v_me is not null then
    select count(*) into v_refs from public.referrals where referrer_id = v_me;
    perform public.grant_member_benefits(v_me, v_client);
    who := public.member_who(v_client);
  elsif v_phone is not null then
    perform public.grant_member_benefits(case when coalesce(array_length(v_users, 1), 0) >= 1 then v_users[1] else null end, v_client);
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
   where (c.owner_user = any(v_users))
      or (v_client is not null and c.owner_client = v_client)
      or (v_phone is not null and c.owner_phone = v_phone);

  select jsonb_build_object(
           'total', coalesce(sum(b.total), 0),
           'used', coalesce(sum(b.used), 0),
           'remaining', coalesce(sum(greatest(b.total - b.used, 0)), 0))
    into v_burn
    from public.member_burn_credits b
   where ((b.owner_user = any(v_users))
       or (v_client is not null and b.owner_client = v_client)
       or (v_phone is not null and b.owner_phone = v_phone))
     and (b.expires_at is null or b.expires_at >= v_today);

  select coalesce(jsonb_agg(n), '[]'::jsonb) into v_news
    from (
      select jsonb_build_object('kind', 'coupon', 'id', c.id, 'title', c.title) as n
        from public.member_coupons c
       where ((c.owner_user = any(v_users))
           or (v_client is not null and c.owner_client = v_client)
           or (v_phone is not null and c.owner_phone = v_phone))
         and c.seen_at is null and c.revoked_at is null
      union all
      select jsonb_build_object('kind', 'burn', 'id', b.id,
               'title', coalesce(b.note, '액운 태우기 추가 이용권') || ' ' || b.total || '회')
        from public.member_burn_credits b
       where ((b.owner_user = any(v_users))
           or (v_client is not null and b.owner_client = v_client)
           or (v_phone is not null and b.owner_phone = v_phone))
         and b.seen_at is null
    ) s;

  select jsonb_build_object('status', i.status,
                            'at', to_char(i.created_at at time zone 'Asia/Seoul', 'YYYY-MM-DD'))
    into v_insta
    from public.member_insta_requests i
   where (i.uniq = 'u:' || coalesce(v_me::text, '') or (v_me is null and false))
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
  v_users  uuid[] := '{}';
  v_today  date := (now() at time zone 'Asia/Seoul')::date;
  b        public.member_burn_credits;
  v_key    text;
  v_left   int;
begin
  who := public.member_who(v_client);
  v_me := nullif(who ->> 'user', '')::uuid;
  v_phone := who ->> 'phone';
  v_users := public.member_users(v_me, v_phone);
  v_key := coalesce(case when v_phone is not null then 'p:' || v_phone end,
                    case when v_me is not null then 'u:' || v_me::text end,
                    case when v_client is not null then 'c:' || v_client end);
  if v_key is null then
    return jsonb_build_object('ok', false, 'reason', 'no_identity', 'remaining', 0);
  end if;
  perform pg_advisory_xact_lock(hashtext('member_burn:' || v_key));

  select * into b from public.member_burn_credits
   where ((owner_user = any(v_users))
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
     where ((owner_user = any(v_users))
         or (v_client is not null and owner_client = v_client)
         or (v_phone is not null and owner_phone = v_phone))
       and (expires_at is null or expires_at >= v_today);
    return jsonb_build_object('ok', false, 'reason', 'none', 'remaining', coalesce(v_left, 0));
  end if;

  update public.member_burn_credits set used = used + 1 where id = b.id;

  select coalesce(sum(greatest(total - used, 0)), 0) into v_left
    from public.member_burn_credits
   where ((owner_user = any(v_users))
       or (v_client is not null and owner_client = v_client)
       or (v_phone is not null and owner_phone = v_phone))
     and (expires_at is null or expires_at >= v_today);

  return jsonb_build_object('ok', true, 'id', b.id, 'remaining', coalesce(v_left, 0),
                            'total', b.total, 'used', b.used + 1);
end $$;

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
  v_users  uuid[] := public.member_users(nullif(who ->> 'user', '')::uuid, who ->> 'phone');
  v_prod   text := lower(btrim(coalesce(p_product, '')));
  v_today  date := (now() at time zone 'Asia/Seoul')::date;
  v_list   jsonb := '[]'::jsonb;
  c        record;
  v_price  int;
  v_after  int;
begin
  for c in select * from public.member_coupons
            where revoked_at is null and used_at is null and expires_at >= v_today
              and ((owner_user = any(v_users))
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

commit;

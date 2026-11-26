-- ============================================================
-- 👑 정식 회원 상태 단일화 + 코드 발급기 연동 (2026-11-26 · #22975)
--   · 서버 원장(entry_code_ledger)에 code_kind 를 남긴다 — P/A/D = paid(정식 결제), M = gift(무료 증정)
--   · 기기(client_uid)↔번호↔코드 연결(member_devices)을 서버가 확인해 만들고, 그 위에서
--     '정식 회원인가'를 한 곳(member_who)에서 판단한다.
--     → 코드 발급기 · 가입자 · 타이밍 달력 · 회원 혜택 · 상담 할인권이 모두 같은 상태를 본다.
--   · 무료 회원(M·체험)은 정식 혜택에서 제외한다(중복 금지).
-- ============================================================
begin;

-- ────────────────────────────────────────────────────────────
-- ① 원장에 코드 성격을 남긴다 (기존 행 보존, 값만 채운다)
-- ────────────────────────────────────────────────────────────
alter table public.entry_code_ledger add column if not exists code_kind text;

update public.entry_code_ledger
   set code_kind = case
         when tier = 'month' then 'gift'          -- 1개월 이용권 = 인스타 인증 무료 증정
         when tier in ('pass', 'allinone', 'diary') then 'paid'
         else null end
 where code_kind is null;

comment on column public.entry_code_ledger.code_kind is 'paid = 정식 결제(정식 회원) / gift = 무료 증정(무료 회원)';

-- 발급기 — P/A/D 는 paid, M 은 gift 로 원장에 함께 적는다(동작은 그대로)
create or replace function public.issue_entry_code(p_pin text, p_letter text, p_phone text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_pin   text;
  phone   text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), '');
  letter  text := upper(btrim(coalesce(p_letter, '')));
  v_code  text;
  v_tier  text;
  v_paid  timestamptz;
  v_kind  text;
begin
  v_pin := public.admin_check_pin(p_pin);
  if v_pin <> 'ok' then
    return jsonb_build_object('ok', false, 'error', 'pin_' || v_pin);
  end if;
  if letter not in ('P', 'A', 'D', 'M') then
    raise exception 'bad letter' using errcode = '22023';
  end if;
  if phone is null or phone !~ '^01[016789][0-9]{7,8}$' then
    raise exception 'bad phone' using errcode = '22023';
  end if;

  v_code := letter || public.code_digits(letter, phone);
  v_tier := case letter when 'P' then 'pass' when 'A' then 'allinone' when 'D' then 'diary' else 'month' end;
  -- M(1개월)은 인스타 인증 선물 코드라 '결제'로 보지 않는다.
  v_paid := case when letter in ('P','A','D') then now() else null end;
  v_kind := case when letter in ('P','A','D') then 'paid' else 'gift' end;

  insert into public.entry_code_ledger(code, tier, phone, issued_at, paid_at, issued_by, code_kind)
  values (v_code, v_tier, phone, now(), v_paid, 'yoon-key', v_kind)
  on conflict (code) do update
     set tier = excluded.tier,
         phone = coalesce(public.entry_code_ledger.phone, excluded.phone),
         paid_at = coalesce(public.entry_code_ledger.paid_at, excluded.paid_at),
         code_kind = coalesce(excluded.code_kind, public.entry_code_ledger.code_kind);

  return jsonb_build_object('ok', true, 'code', v_code, 'phone', phone,
                            'paid_at', v_paid, 'tier', v_tier, 'code_kind', v_kind);
end $function$;

-- 결제 통보로 발급되는 코드도 같은 표기를 남긴다
create or replace function public.payapp_ledger_kind(p_tier text)
returns text
language sql
immutable
as $$
  select case when p_tier in ('pass', 'allinone', 'diary') then 'paid'
              when p_tier = 'month' then 'gift' else null end;
$$;

-- ────────────────────────────────────────────────────────────
-- ② 기기 ↔ 번호 ↔ 코드 — 달력이 코드를 열면 서버가 확인해 적는다
-- ────────────────────────────────────────────────────────────
create table if not exists public.member_devices (
  client_uid  text primary key,
  phone       text not null,
  code        text,
  tier        text,
  code_kind   text,
  bound_at    timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.member_devices enable row level security;
revoke all on public.member_devices from anon, authenticated;
grant select, insert, update, delete on public.member_devices to service_role;

-- ────────────────────────────────────────────────────────────
-- ③ 이 사람은 누구인가 — 계정 · 기기 · 번호 · 등급을 한 번에 푼다
--    반환: { user, client, phone, code, tier, code_kind, member, paid }
-- ────────────────────────────────────────────────────────────
create or replace function public.member_who(p_client_uid text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_me     uuid := auth.uid();
  v_client text := nullif(btrim(coalesce(p_client_uid, '')), '');
  d        public.member_devices;
  l        public.entry_code_ledger;
  v_tier   text;
  v_paid_tier text;
  v_kind   text;
begin
  if v_client is not null and (length(v_client) < 8 or length(v_client) > 80) then
    v_client := null;
  end if;

  if v_client is not null then
    select * into d from public.member_devices where client_uid = v_client;
  end if;

  if d.phone is not null then
    select * into l from public.entry_code_ledger where phone = d.phone
     order by coalesce(paid_at, issued_at) desc limit 1;
  end if;

  if v_me is not null then
    select paid_tier into v_paid_tier from public.profiles where id = v_me;
  end if;

  v_tier := coalesce(l.tier, d.tier);
  v_kind := coalesce(l.code_kind, d.code_kind,
                     case when l.paid_at is not null then 'paid' end);

  return jsonb_build_object(
    'user', v_me,
    'client', v_client,
    'phone', d.phone,
    'code', coalesce(d.code, l.code),
    'tier', v_tier,
    'code_kind', v_kind,
    -- 정식 회원 = 1년 이용권(pass·allinone·diary)이고 무료 증정이 아닌 사람
    'member', (
      (v_tier in ('pass', 'allinone', 'diary') and v_kind is distinct from 'gift')
      or v_paid_tier in ('pass', 'allinone', 'diary')
    ),
    'paid', (v_kind = 'paid') or v_paid_tier in ('pass', 'allinone', 'diary')
  );
end $$;
revoke all on function public.member_who(text) from public;
grant execute on function public.member_who(text) to anon, authenticated;

-- ────────────────────────────────────────────────────────────
-- ④ 달력이 코드를 열면 부른다 — 서버 원장으로 확인한 뒤 기기 연결을 남긴다
--    · 원장에 없는 코드(예전 사주 기반 코드 등)는 연결하지 않는다(서버가 모르는 코드)
-- ────────────────────────────────────────────────────────────
create or replace function public.member_bind(p_client_uid text, p_code text, p_phone text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_client text := nullif(btrim(coalesce(p_client_uid, '')), '');
  v_code   text := upper(regexp_replace(coalesce(p_code, ''), '[\s\-_]', '', 'g'));
  v_phone  text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), '');
  l        public.entry_code_ledger;
begin
  if v_client is null or length(v_client) < 8 or length(v_client) > 80 then
    return jsonb_build_object('ok', false, 'reason', 'bad_client');
  end if;
  if v_code !~ '^[PADM][0-9]{5}$' then
    return jsonb_build_object('ok', false, 'reason', 'bad_code');
  end if;

  select * into l from public.entry_code_ledger where code = v_code;
  if l.code is null then
    return jsonb_build_object('ok', false, 'reason', 'not_registered');
  end if;
  if v_phone is not null and l.phone is not null and l.phone <> v_phone then
    return jsonb_build_object('ok', false, 'reason', 'phone_mismatch');
  end if;

  insert into public.member_devices (client_uid, phone, code, tier, code_kind, bound_at, updated_at)
  values (v_client, l.phone, l.code, l.tier,
          coalesce(l.code_kind, public.payapp_ledger_kind(l.tier)), now(), now())
  on conflict (client_uid) do update
     set phone = excluded.phone, code = excluded.code, tier = excluded.tier,
         code_kind = excluded.code_kind, updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'member', (l.tier in ('pass', 'allinone', 'diary')
               and coalesce(l.code_kind, public.payapp_ledger_kind(l.tier)) is distinct from 'gift'),
    'tier', l.tier,
    'code_kind', coalesce(l.code_kind, public.payapp_ledger_kind(l.tier)),
    'paid_at', l.paid_at,
    'phone_masked', case when l.phone is null then null
                    else left(l.phone, 3) || '-****-' || right(l.phone, 4) end
  );
end $$;
revoke all on function public.member_bind(text, text, text) from public;
grant execute on function public.member_bind(text, text, text) to anon, authenticated;

commit;

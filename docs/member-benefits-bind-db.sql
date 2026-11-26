-- ============================================================
-- 👑 member_bind — 기기 연결 + (로그인 상태면) 번호↔계정 연결 기록 (2026-11-26)
-- ============================================================
begin;

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

  /* 로그인한 채로 코드를 열었다면 '이 번호 = 이 계정'을 남긴다 — 나중에 로그인 없이 열어도 같은 혜택을 본다 */
  if auth.uid() is not null then
    insert into public.member_accounts (user_id, phone)
    values (auth.uid(), l.phone)
    on conflict (user_id) do update set phone = excluded.phone, updated_at = now();
    update public.member_coupons set owner_phone = coalesce(owner_phone, l.phone) where owner_user = auth.uid();
    update public.member_burn_credits set owner_phone = coalesce(owner_phone, l.phone) where owner_user = auth.uid();
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

commit;

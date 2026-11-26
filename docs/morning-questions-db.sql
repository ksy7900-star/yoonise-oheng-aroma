-- ============================================================
-- ☀️ 아침의 질문 — 관리자 문구 수정 (2026-11-26)
-- 대상: Supabase project fifynkkaeqcjlovesuop (public 스키마)
-- 원칙
--   · 손님 화면은 이 표가 없어도 기본 365개 질문으로 정상 동작한다(추가 전용).
--   · 손님은 PIN 없이 '읽기'만 한다(morning_questions_public).
--   · 쓰기(수정·추가·되돌리기)는 기존 관리자 PIN 확인(admin_login)을 그대로 거친다.
--   · 서버에는 질문 문구와 날짜만 둔다. 손님 사주·답변은 여기에 저장하지 않는다.
-- 롤백: 파일 맨 아래 3줄(주석 해제) 실행
-- ============================================================
begin;

-- ────────────────────────────────────────────────────────────
-- ① 표 — 날짜 하나에 문구 하나. 기본 365개에서 고친 날짜만 들어온다.
-- ────────────────────────────────────────────────────────────
create table if not exists public.morning_questions (
  day        date primary key,
  text       text not null,
  updated_at timestamptz not null default now()
);

alter table public.morning_questions enable row level security;
-- 정책 없음(비공개) + anon/authenticated 권한 회수 — entry_code_guard·app_secrets 와 동일 방식
revoke all on public.morning_questions from anon, authenticated;
grant select, insert, update, delete on public.morning_questions to service_role;

-- ────────────────────────────────────────────────────────────
-- ② 손님 읽기 — 오늘(한국 시간) 앞뒤로 필요한 기간만, PIN 없이
--    반환: { ok:true, items:[ { day:'YYYY-MM-DD', text:'...' } ] }
-- ────────────────────────────────────────────────────────────
create or replace function public.morning_questions_public()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'ok', true,
    'items', coalesce(jsonb_agg(
      jsonb_build_object('day', to_char(day, 'YYYY-MM-DD'), 'text', text)
      order by day), '[]'::jsonb)
  )
  from public.morning_questions
  where day >= ((now() at time zone 'Asia/Seoul')::date - 14)
    and day <= ((now() at time zone 'Asia/Seoul')::date + 400);
$$;

revoke all on function public.morning_questions_public() from public;
grant execute on function public.morning_questions_public() to anon, authenticated;

-- ────────────────────────────────────────────────────────────
-- ③ 관리자 — 목록 / 저장 / 되돌리기 / 추가  (PIN 확인은 admin_login 그대로)
--    p_action : 'list' | 'set' | 'clear'
--    p_day    : 'YYYY-MM-DD' (list 에서는 무시)
--    p_text   : 새 문구 (set 일 때 필수, 200자까지)
-- ────────────────────────────────────────────────────────────
create or replace function public.admin_morning_questions(
  p_pin    text,
  p_action text default 'list',
  p_day    date default null,
  p_text   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth jsonb;
  v_day  date;
  v_text text;
begin
  -- 기존 관리자 확인 함수를 그대로 쓴다 (오답 잠금·시도 기록도 그대로 적용된다)
  --   admin_login 은 관리자 화면이 쓰는 것과 같은 계약(jsonb · {ok:true} 또는 {ok:false,error})이다.
  --   (돌려주는 모양이 jsonb·json·문자열 어느 쪽이어도 읽히게 to_jsonb 로 감싼다)
  begin
    v_auth := to_jsonb(public.admin_login(p_pin));
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'pin_check_failed');
  end;
  if v_auth is null or coalesce((v_auth->>'ok')::boolean, false) is not true then
    return jsonb_build_object('ok', false,
      'error', coalesce(v_auth->>'error', 'pin_mismatch'));
  end if;

  if p_action = 'list' then
    return jsonb_build_object('ok', true,
      'today', (now() at time zone 'Asia/Seoul')::date,
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'day', to_char(day, 'YYYY-MM-DD'),
          'text', text,
          'updated_at', updated_at
        ) order by day)
        from public.morning_questions
        where day >= ((now() at time zone 'Asia/Seoul')::date - 14)
          and day <= ((now() at time zone 'Asia/Seoul')::date + 400)
      ), '[]'::jsonb));
  end if;

  if p_action = 'clear' then
    if p_day is null then
      return jsonb_build_object('ok', false, 'error', 'need_day');
    end if;
    delete from public.morning_questions where day = p_day;
    return jsonb_build_object('ok', true, 'day', to_char(p_day, 'YYYY-MM-DD'), 'cleared', true);
  end if;

  if p_action = 'set' then
    v_day := coalesce(p_day, (now() at time zone 'Asia/Seoul')::date);
    v_text := btrim(coalesce(p_text, ''));
    if length(v_text) < 5 then
      return jsonb_build_object('ok', false, 'error', 'too_short');
    end if;
    if length(v_text) > 200 then
      return jsonb_build_object('ok', false, 'error', 'too_long');
    end if;
    insert into public.morning_questions (day, text, updated_at)
      values (v_day, v_text, now())
    on conflict (day) do update
      set text = excluded.text, updated_at = now();
    return jsonb_build_object('ok', true,
      'day', to_char(v_day, 'YYYY-MM-DD'),
      'text', v_text);
  end if;

  return jsonb_build_object('ok', false, 'error', 'bad_action');
end;
$$;

revoke all on function public.admin_morning_questions(text, text, date, text) from public;
grant execute on function public.admin_morning_questions(text, text, date, text) to anon, authenticated;

commit;

-- 확인용 (넣은 뒤 손님 쪽과 같은 모양으로 한 번 읽어 본다)
-- select public.morning_questions_public();

-- ── 롤백 (되돌릴 때만) ─────────────────────────────────────
-- drop function if exists public.admin_morning_questions(text, text, date, text);
-- drop function if exists public.morning_questions_public();
-- drop table if exists public.morning_questions;

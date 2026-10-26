begin;

-- Challenge runs are created and finalized only by trusted server routes.
create table if not exists public.challenge_runs (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('endless', 'daily')),
  challenge_date date,
  language text not null default 'zh-TW',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  constraint challenge_runs_daily_date_chk check (
    (mode = 'daily' and challenge_date is not null) or
    (mode = 'endless' and challenge_date is null)
  )
);
alter table public.challenge_runs enable row level security;
revoke all on public.challenge_runs from anon, authenticated;
grant select, insert, update on public.challenge_runs to service_role;

alter table public.challenge_leaderboard
  add column if not exists mode text not null default 'endless',
  add column if not exists challenge_date date,
  add column if not exists run_id uuid references public.challenge_runs(id);
alter table public.challenge_leaderboard
  add constraint challenge_leaderboard_mode_chk check (mode in ('endless', 'daily'));
alter table public.challenge_leaderboard
  add constraint challenge_leaderboard_mode_date_chk check (
    (mode = 'daily' and challenge_date is not null) or
    (mode = 'endless' and challenge_date is null)
  );
create unique index if not exists challenge_leaderboard_run_idx
  on public.challenge_leaderboard (run_id) where run_id is not null;
create index if not exists challenge_leaderboard_daily_rank_idx
  on public.challenge_leaderboard (challenge_date, total_score desc, streak_count desc)
  where mode = 'daily';

-- Existing direct score inserts are untrusted. Only the service role may write scores.
drop policy if exists challenge_leaderboard_insert_own on public.challenge_leaderboard;
revoke insert, update, delete on public.challenge_leaderboard from anon, authenticated;
grant select, insert on public.challenge_leaderboard to service_role;

alter table public.profiles
  add column if not exists vip_plan text,
  add column if not exists vip_expires_at timestamptz;
alter table public.profiles
  add constraint profiles_vip_plan_chk check (vip_plan is null or vip_plan in ('monthly', 'lifetime'));

create table if not exists public.vip_purchase_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null check (plan in ('monthly', 'lifetime')),
  disclosure_version text not null,
  agreed_at timestamptz not null default now()
);
alter table public.vip_purchase_consents enable row level security;
revoke all on public.vip_purchase_consents from anon, authenticated;
grant insert, select on public.vip_purchase_consents to service_role;

-- One deterministic daily set shared across users, languages, and server instances.
create or replace function public.get_daily_challenge_questions(p_date date, p_language text)
returns table(id uuid, crop_image_path text, original_image_path text, author_name text, options jsonb)
language sql
stable
security invoker
set search_path = public
as $$
  select q.id, q.crop_image_path, q.original_image_path, q.author_name, q.options
  from public.questions q
  where q.status = 'active'
    and q.language = p_language
    and jsonb_typeof(q.options) = 'array'
    and jsonb_array_length(q.options) >= 2
  order by md5(p_date::text || ':' || q.id::text)
  limit 10;
$$;
revoke all on function public.get_daily_challenge_questions(date, text) from public;
grant execute on function public.get_daily_challenge_questions(date, text) to anon, authenticated;

create or replace function public.get_challenge_leaderboard(
  p_mode text,
  p_date date default null,
  p_limit integer default 50,
  p_user_id uuid default null
)
returns table(rank bigint, user_id uuid, username text, avatar_url text, total_score integer, streak_count integer)
language sql
stable
security invoker
set search_path = public
as $$
  with best_per_user as (
    select distinct on (l.user_id)
      l.user_id, l.username, l.avatar_url, l.total_score, l.streak_count, l.created_at
    from public.challenge_leaderboard l
    where l.mode = p_mode and (p_mode <> 'daily' or l.challenge_date = p_date)
    order by l.user_id, l.total_score desc, l.streak_count desc, l.created_at asc
  ), ranked as (
    select row_number() over (order by b.total_score desc, b.streak_count desc, b.created_at asc) as position,
      b.user_id, b.username, b.avatar_url, b.total_score, b.streak_count
    from best_per_user b
  )
  select r.position, r.user_id, r.username, r.avatar_url, r.total_score, r.streak_count
  from ranked r
  where r.position <= greatest(1, least(coalesce(p_limit, 50), 100)) or r.user_id = p_user_id
  order by r.position;
$$;
revoke all on function public.get_challenge_leaderboard(text, date, integer, uuid) from public;
grant execute on function public.get_challenge_leaderboard(text, date, integer, uuid) to anon, authenticated;

-- Atomic fixed-window limits shared across serverless instances.
create table if not exists public.api_rate_limit_buckets (
  bucket_key text not null,
  window_seconds integer not null check (window_seconds in (60, 3600)),
  bucket_start timestamptz not null,
  request_count integer not null default 0,
  primary key (bucket_key, window_seconds, bucket_start)
);
alter table public.api_rate_limit_buckets enable row level security;
revoke all on public.api_rate_limit_buckets from anon, authenticated;
grant select, insert, update, delete on public.api_rate_limit_buckets to service_role;

create or replace function public.consume_api_rate_limit(p_key text, p_window_seconds integer, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_bucket timestamptz;
  v_count integer;
begin
  if length(p_key) <> 64 or p_window_seconds not in (60, 3600) or p_limit < 1 or p_limit > 1000 then
    return false;
  end if;
  v_bucket := to_timestamp(floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds);
  insert into public.api_rate_limit_buckets(bucket_key, window_seconds, bucket_start, request_count)
    values (p_key, p_window_seconds, v_bucket, 1)
  on conflict (bucket_key, window_seconds, bucket_start)
    do update set request_count = public.api_rate_limit_buckets.request_count + 1
  returning request_count into v_count;
  delete from public.api_rate_limit_buckets
    where bucket_key = p_key and bucket_start < clock_timestamp() - interval '2 days';
  return v_count <= p_limit;
end;
$$;
revoke all on function public.consume_api_rate_limit(text, integer, integer) from public;
grant execute on function public.consume_api_rate_limit(text, integer, integer) to service_role;

commit;

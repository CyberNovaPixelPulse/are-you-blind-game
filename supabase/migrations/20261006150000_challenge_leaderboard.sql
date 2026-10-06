-- 挑戰模式排行榜。每一局結算新增一筆成績。
-- 在 Supabase Dashboard → SQL Editor 整份貼上後執行一次。

begin;

create table if not exists public.challenge_leaderboard (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  username text not null,
  avatar_url text,
  total_score integer not null,
  streak_count integer not null,
  created_at timestamptz not null default now(),
  constraint challenge_leaderboard_username_chk
    check (char_length(btrim(username)) between 1 and 40),
  constraint challenge_leaderboard_score_chk
    check (total_score >= 0 and streak_count >= 0)
);

comment on table public.challenge_leaderboard is '挑戰模式單局成績，依總分排行';
comment on column public.challenge_leaderboard.total_score is '本局總分，答對一題為 1000 + floor(剩餘毫秒 * 0.2)';
comment on column public.challenge_leaderboard.streak_count is '本局連續答對題數';

create index if not exists challenge_leaderboard_score_idx
  on public.challenge_leaderboard (total_score desc, created_at asc);

alter table public.challenge_leaderboard enable row level security;

drop policy if exists challenge_leaderboard_select_public on public.challenge_leaderboard;
create policy challenge_leaderboard_select_public
  on public.challenge_leaderboard
  for select
  to anon, authenticated
  using (true);

drop policy if exists challenge_leaderboard_insert_own on public.challenge_leaderboard;
create policy challenge_leaderboard_insert_own
  on public.challenge_leaderboard
  for insert
  to authenticated
  with check (user_id = auth.uid());

revoke all on public.challenge_leaderboard from anon, authenticated;
grant select on public.challenge_leaderboard to anon, authenticated;
grant insert on public.challenge_leaderboard to authenticated;

commit;

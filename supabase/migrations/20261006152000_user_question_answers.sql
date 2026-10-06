-- 登入玩家的作答歷史。抽題時優先避開這裡出現過的題目。
-- 在 Supabase Dashboard → SQL Editor 整份貼上後執行一次。

begin;

create table if not exists public.user_question_answers (
  user_id uuid not null references auth.users (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  answered_at timestamptz not null default now(),
  primary key (user_id, question_id)
);

comment on table public.user_question_answers is '玩家答過的題目，用來優先抽出尚未回答的題';

create index if not exists user_question_answers_user_idx
  on public.user_question_answers (user_id, answered_at desc);

alter table public.user_question_answers enable row level security;

drop policy if exists user_question_answers_select_own on public.user_question_answers;
create policy user_question_answers_select_own
  on public.user_question_answers
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists user_question_answers_insert_own on public.user_question_answers;
create policy user_question_answers_insert_own
  on public.user_question_answers
  for insert
  to authenticated
  with check (user_id = auth.uid());

revoke all on public.user_question_answers from anon, authenticated;
grant select, insert on public.user_question_answers to authenticated;

commit;

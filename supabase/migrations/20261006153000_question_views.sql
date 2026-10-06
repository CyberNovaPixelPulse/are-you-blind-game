-- 題目曝光次數。玩家看到題目時由 increment_question_views 加 1。
-- 在 Supabase Dashboard → SQL Editor 整份貼上後執行一次。

begin;

alter table public.questions
  add column if not exists view_count integer not null default 0;

alter table public.questions
  drop constraint if exists questions_view_count_chk;

alter table public.questions
  add constraint questions_view_count_chk check (view_count >= 0);

comment on column public.questions.view_count is '題目被抽中並顯示在畫面上的次數';

create or replace function public.protect_question_view_count()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.view_count is distinct from old.view_count
     and coalesce(current_setting('app.allow_view_count', true), '') <> '1' then
    new.view_count := old.view_count;
  end if;
  return new;
end;
$$;

drop trigger if exists questions_protect_view_count on public.questions;
create trigger questions_protect_view_count
  before update on public.questions
  for each row
  execute function public.protect_question_view_count();

create or replace function public.increment_question_views(target_question_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('app.allow_view_count', '1', true);
  update public.questions
  set view_count = view_count + 1
  where id = target_question_id;
end;
$$;

revoke all on function public.protect_question_view_count() from public, anon, authenticated;
revoke all on function public.increment_question_views(uuid) from public;
grant execute on function public.increment_question_views(uuid) to anon, authenticated;

commit;

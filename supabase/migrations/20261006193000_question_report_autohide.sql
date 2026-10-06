-- 同一題未解決檢舉滿 3 次時，自動把題目改成 hidden，退出公開抽題。
-- 在 Supabase Dashboard → SQL Editor 整份貼上後執行一次。

begin;

alter table public.question_reports
  add column if not exists status text;

update public.question_reports
set status = 'open'
where status is null or status not in ('open', 'resolved');

alter table public.question_reports
  alter column status set default 'open';

alter table public.question_reports
  alter column status set not null;

alter table public.question_reports
  drop constraint if exists question_reports_status_chk;

alter table public.question_reports
  add constraint question_reports_status_chk
  check (status in ('open', 'resolved'));

comment on column public.question_reports.status is 'open 未處理，resolved 已解決，不計入自動下架';

alter table public.questions
  add column if not exists hide_reason text;

alter table public.questions
  drop constraint if exists questions_hide_reason_chk;

alter table public.questions
  add constraint questions_hide_reason_chk
  check (hide_reason is null or hide_reason = 'reports');

comment on column public.questions.hide_reason is 'reports 表示因未解決檢舉滿 3 次而自動隱藏';

create index if not exists question_reports_open_question_idx
  on public.question_reports (question_id)
  where status <> 'resolved';

create or replace function public.question_open_report_count(target_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.question_reports
  where question_id = target_id
    and status <> 'resolved';
$$;

create or replace function public.apply_question_report_visibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  open_count integer;
begin
  if tg_op = 'INSERT' then
    open_count := public.question_open_report_count(new.question_id);
    if open_count >= 3 then
      update public.questions
      set status = 'hidden',
          hide_reason = 'reports'
      where id = new.question_id
        and (status is distinct from 'hidden' or hide_reason is distinct from 'reports');
    end if;
    return new;
  end if;

  if new.status = 'active' then
    open_count := public.question_open_report_count(new.id);
    if open_count >= 3 then
      new.status := 'hidden';
      new.hide_reason := 'reports';
    else
      new.hide_reason := null;
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.sync_question_is_active_flag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'questions'
      and column_name = 'is_active'
  ) then
    return new;
  end if;

  if new.status = 'hidden' and new.hide_reason = 'reports' then
    execute 'update public.questions set is_active = false where id = $1 and is_active is distinct from false'
      using new.id;
  elsif new.status = 'active' and old.hide_reason = 'reports' then
    execute 'update public.questions set is_active = true where id = $1 and is_active is distinct from true'
      using new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists question_reports_autohide on public.question_reports;
create trigger question_reports_autohide
  after insert on public.question_reports
  for each row
  execute function public.apply_question_report_visibility();

drop trigger if exists questions_report_visibility on public.questions;
create trigger questions_report_visibility
  before update on public.questions
  for each row
  execute function public.apply_question_report_visibility();

drop trigger if exists questions_sync_is_active_flag on public.questions;
create trigger questions_sync_is_active_flag
  after update on public.questions
  for each row
  execute function public.sync_question_is_active_flag();

drop policy if exists question_reports_insert_public on public.question_reports;
create policy question_reports_insert_public
  on public.question_reports
  for insert
  to anon, authenticated
  with check (
    reason_category in (
      '正解有爭議',
      '圖片太模糊/通靈',
      '選項重複或錯字',
      '其他問題'
    )
    and char_length(details) <= 500
    and status = 'open'
  );

revoke all on function public.question_open_report_count(uuid) from public, anon, authenticated;
revoke all on function public.apply_question_report_visibility() from public, anon, authenticated;
revoke all on function public.sync_question_is_active_flag() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'question_reports'
    ) then
      alter publication supabase_realtime add table public.question_reports;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'questions'
    ) then
      alter publication supabase_realtime add table public.questions;
    end if;
  end if;
end $$;

update public.questions as question
set status = 'hidden',
    hide_reason = 'reports'
where question.hide_reason is distinct from 'reports'
  and (
    select count(*)
    from public.question_reports as report
    where report.question_id = question.id
      and report.status <> 'resolved'
  ) >= 3;

commit;

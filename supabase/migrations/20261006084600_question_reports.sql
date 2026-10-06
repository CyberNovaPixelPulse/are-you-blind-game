-- 玩家回報有爭議的題目。既有資料庫若已建表，本檔不會覆寫欄位。

begin;

create table if not exists public.question_reports (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete cascade,
  reason_category text not null,
  details text not null default '',
  created_at timestamptz not null default now(),
  constraint question_reports_reason_chk
    check (
      reason_category in (
        '正解有爭議',
        '圖片太模糊/通靈',
        '選項重複或錯字',
        '其他問題'
      )
    ),
  constraint question_reports_details_chk
    check (char_length(details) <= 500)
);

comment on table public.question_reports is '玩家回報題目爭議';
comment on column public.question_reports.reason_category is '回報分類';
comment on column public.question_reports.details is '補充說明，可留空';

create index if not exists question_reports_question_id_idx
  on public.question_reports (question_id);

alter table public.question_reports enable row level security;

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
  );

grant insert on table public.question_reports to anon, authenticated;
grant all on table public.question_reports to service_role;

commit;

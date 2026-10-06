alter table public.questions
  add column if not exists quality_score integer default 0,
  add column if not exists score_breakdown jsonb default '{}'::jsonb;

update public.questions
set quality_score = 0
where quality_score is null;

update public.questions
set score_breakdown = '{}'::jsonb
where score_breakdown is null;

alter table public.questions
  drop constraint if exists questions_quality_score_chk;

alter table public.questions
  add constraint questions_quality_score_chk
  check (quality_score between 0 and 100);

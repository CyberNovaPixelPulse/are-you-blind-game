alter table public.questions
  add column if not exists language text default 'zh-TW';

update public.questions
set language = 'zh-TW'
where language is null;

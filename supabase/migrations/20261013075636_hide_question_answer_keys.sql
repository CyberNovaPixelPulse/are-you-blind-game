begin;

create table if not exists public.question_answer_keys (
  question_id uuid primary key references public.questions(id) on delete cascade,
  correct_option_id text not null,
  correct_answer text not null,
  updated_at timestamptz not null default now()
);
alter table public.question_answer_keys enable row level security;
revoke all on public.question_answer_keys from public, anon, authenticated;
grant all on public.question_answer_keys to service_role;

insert into public.question_answer_keys (question_id, correct_option_id, correct_answer)
select q.id, option->>'id', option->>'text'
from public.questions q
cross join lateral jsonb_array_elements(q.options) as item(option)
where item.option->>'is_correct' = 'true'
  and nullif(item.option->>'id', '') is not null
  and nullif(item.option->>'text', '') is not null
on conflict (question_id) do update
set correct_option_id = excluded.correct_option_id,
    correct_answer = excluded.correct_answer,
    updated_at = now();

create or replace function public.extract_question_answer_key()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_option_id text;
  v_answer text;
begin
  select item.option->>'id', item.option->>'text'
    into v_option_id, v_answer
  from pg_catalog.jsonb_array_elements(new.options) as item(option)
  where item.option->>'is_correct' = 'true'
  limit 1;

  if v_option_id is not null and v_answer is not null then
    insert into public.question_answer_keys(question_id, correct_option_id, correct_answer)
    values (new.id, v_option_id, v_answer)
    on conflict (question_id) do update
    set correct_option_id = excluded.correct_option_id,
        correct_answer = excluded.correct_answer,
        updated_at = now();
  else
    delete from public.question_answer_keys where question_id = new.id;
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(item.option - 'is_correct' order by item.ordinality),
    '[]'::jsonb
  ) into new.options
  from pg_catalog.jsonb_array_elements(new.options) with ordinality as item(option, ordinality);
  return new;
end;
$function$;
revoke all on function public.extract_question_answer_key() from public, anon, authenticated;

drop trigger if exists questions_extract_answer_key on public.questions;
create trigger questions_extract_answer_key
  before insert or update of options on public.questions
  for each row execute function public.extract_question_answer_key();

-- This causes the trigger to remove correct-answer flags from every existing
-- public question after all private answer keys have been backfilled.
update public.questions set options = options;

create or replace function public.get_daily_challenge_questions(p_date date, p_language text)
returns table(id uuid, crop_image_path text, original_image_path text, author_name text, options jsonb)
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select q.id, q.crop_image_path, q.original_image_path, q.author_name, q.options
  from public.questions q
  join public.question_answer_keys k on k.question_id = q.id
  where q.status = 'active'
    and q.language = p_language
    and jsonb_typeof(q.options) = 'array'
    and jsonb_array_length(q.options) >= 2
  order by md5(p_date::text || ':' || q.id::text)
  limit 10;
$function$;
revoke all on function public.get_daily_challenge_questions(date, text) from public;
grant execute on function public.get_daily_challenge_questions(date, text) to anon, authenticated;

create or replace function public.get_my_question_answers(p_question_ids uuid[])
returns table(question_id uuid, answer text)
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select k.question_id, k.correct_answer
  from public.question_answer_keys k
  join public.questions q on q.id = k.question_id
  where q.author_id = (select auth.uid())
    and k.question_id = any(coalesce(p_question_ids, '{}'::uuid[]))
  limit 100;
$function$;
revoke all on function public.get_my_question_answers(uuid[]) from public, anon;
grant execute on function public.get_my_question_answers(uuid[]) to authenticated;

commit;

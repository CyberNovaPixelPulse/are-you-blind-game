begin;

alter table public.question_answer_keys
  add column if not exists original_image_path text;
update public.question_answer_keys k
set original_image_path = coalesce(q.original_image_path, q.original_image_url)
from public.questions q
where q.id = k.question_id and k.original_image_path is null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('quiz-originals', 'quiz-originals', false, 307200, array['image/webp','image/jpeg','image/png']::text[])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.extract_question_answer_key()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_option_id text;
  v_answer text;
  v_original text;
begin
  if tg_op = 'INSERT' or new.options is distinct from old.options then
    select item.option->>'id', item.option->>'text'
      into v_option_id, v_answer
    from pg_catalog.jsonb_array_elements(new.options) as item(option)
    where item.option->>'is_correct' = 'true'
    limit 1;

    if tg_op = 'UPDATE' then
      select k.original_image_path into v_original
      from public.question_answer_keys k where k.question_id = new.id;
    end if;
    v_original := coalesce(new.original_image_path, v_original);

    if v_option_id is not null and v_answer is not null then
      insert into public.question_answer_keys(question_id, correct_option_id, correct_answer, original_image_path)
      values (new.id, v_option_id, v_answer, v_original)
      on conflict (question_id) do update
      set correct_option_id = excluded.correct_option_id,
          correct_answer = excluded.correct_answer,
          original_image_path = coalesce(excluded.original_image_path, public.question_answer_keys.original_image_path),
          updated_at = now();
    else
      delete from public.question_answer_keys where question_id = new.id;
    end if;
  elsif new.original_image_path is distinct from old.original_image_path
     or new.original_image_url is distinct from old.original_image_url then
    update public.question_answer_keys
    set original_image_path = coalesce(
          new.original_image_path,
          new.original_image_url,
          public.question_answer_keys.original_image_path
        ),
        updated_at = now()
    where question_id = new.id;
  end if;

  new.original_image_path := null;
  new.original_image_url := null;
  return new;
end;
$function$;

drop trigger if exists questions_extract_answer_key on public.questions;
create trigger questions_extract_answer_key
  before insert or update on public.questions
  for each row execute function public.extract_question_answer_key();

update public.questions
set original_image_path = null, original_image_url = null
where original_image_path is not null or original_image_url is not null;

revoke select on public.questions from public, anon, authenticated;
grant select (
  id, author_id, crop_image_url, created_at, author_name, crop_image_path,
  options, difficulty, status, solvability_score, category, language,
  quality_score, score_breakdown, view_count, like_count, dislike_count
) on public.questions to anon, authenticated;
grant select on public.questions to service_role;

create or replace function public.get_daily_challenge_questions(p_date date, p_language text)
returns table(id uuid, crop_image_path text, original_image_path text, author_name text, options jsonb)
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select q.id, q.crop_image_path, null::text, q.author_name, q.options
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

commit;

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
    and exists (
      select 1
      from jsonb_array_elements(q.options) as option_item
      where option_item->>'is_correct' = 'true'
    )
  order by md5(p_date::text || ':' || q.id::text)
  limit 10;
$$;

revoke all on function public.get_daily_challenge_questions(date, text) from public;
grant execute on function public.get_daily_challenge_questions(date, text) to anon, authenticated;

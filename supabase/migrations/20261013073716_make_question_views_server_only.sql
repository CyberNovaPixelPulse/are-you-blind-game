begin;

revoke execute on function public.increment_question_views(uuid) from public, anon, authenticated;
grant execute on function public.increment_question_views(uuid) to service_role;

commit;

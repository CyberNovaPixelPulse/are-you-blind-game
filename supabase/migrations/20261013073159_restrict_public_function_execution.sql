begin;

revoke execute on function public.add_pk_bot(uuid, text, text) from public, anon;
grant execute on function public.add_pk_bot(uuid, text, text) to authenticated, service_role;

revoke execute on function public.update_pk_bot_score(uuid, uuid, integer, integer) from public, anon;
grant execute on function public.update_pk_bot_score(uuid, uuid, integer, integer) to authenticated, service_role;

-- This function is invoked by the auth.users insert trigger; it is not a client API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create or replace function public.increment_question_views(target_question_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  update public.questions
  set view_count = coalesce(view_count, 0) + 1
  where id = target_question_id and status = 'active';
end;
$function$;

commit;

begin;
alter table public.question_publications drop constraint question_publications_state_check;
alter table public.question_publications add constraint question_publications_state_check check (state in ('pending','published','cancelled'));
alter table public.question_publication_images add column cleanup_pending boolean not null default true;
alter table public.question_publication_images add column cleanup_due_at timestamptz not null default now();
alter table public.question_publication_images add column cleanup_last_claimed_at timestamptz;
create index publication_images_cleanup_due on public.question_publication_images(cleanup_pending desc,cleanup_last_claimed_at nulls first,cleanup_due_at);

create or replace function public.publication_query(p_owner uuid,p_id uuid) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare a public.question_publications;
begin
  select * into a from public.question_publications where id=p_id;
  if not found then return jsonb_build_object('state','pending'); end if;
  if a.owner_id <> p_owner then raise insufficient_privilege; end if;
  return jsonb_build_object('state',a.state,'result',a.result,'cleanupPending',a.state='cancelled' and exists(
    select 1 from public.question_publication_images where publication_id=p_id and cleanup_pending));
end $$;

create function public.publication_cancel(p_owner uuid,p_id uuid,p_snapshot jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare a public.question_publications;
begin
  -- A cancellation that beats even begin creates a durable tombstone.
  insert into public.question_publications(id,owner_id,snapshot,state) values(p_id,p_owner,p_snapshot,'cancelled') on conflict(id) do nothing;
  select * into strict a from public.question_publications where id=p_id for update;
  if a.owner_id <> p_owner then raise insufficient_privilege; end if;
  if a.snapshot <> p_snapshot then raise invalid_parameter_value; end if;
  if a.state='published' then return public.publication_query(p_owner,p_id); end if;
  update public.question_publications set state='cancelled' where id=p_id;
  update public.question_publication_images set cleanup_due_at=now() where publication_id=p_id;
  return public.publication_query(p_owner,p_id);
end $$;

create function public.publication_path_matches(p_value text,p_bucket text,p_path text) returns boolean
language sql immutable strict security invoker set search_path = public as $$
 select p_value=p_path or split_part(p_value,'?',1) like '%/'||p_bucket||'/'||p_path
$$;

create function public.publication_image_referenced(p_bucket text,p_path text) returns boolean
language plpgsql security invoker set search_path = public as $$
declare referenced boolean;
begin
  if exists(select 1 from public.questions q where
    public.publication_path_matches(to_jsonb(q)->>'crop_image_path',p_bucket,p_path) or
    public.publication_path_matches(to_jsonb(q)->>'original_image_path',p_bucket,p_path) or
    public.publication_path_matches(to_jsonb(q)->>'original_image_url',p_bucket,p_path)) then return true; end if;
  if to_regclass('public.question_answer_keys') is not null then
    execute 'select exists(select 1 from public.question_answer_keys k where public.publication_path_matches(to_jsonb(k)->>''original_image_path'',$1,$2))'
      into referenced using p_bucket,p_path;
    return referenced;
  end if;
  return false;
end $$;

-- Fence new references at the same parent row lock used by cancellation and commit.
create function public.publication_guard_image_reference() returns trigger
language plpgsql security invoker set search_path = public as $$
declare p record; previous jsonb;
begin
  previous := case when tg_op='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  if tg_op='UPDATE' and to_jsonb(new)->>'crop_image_path' is not distinct from previous->>'crop_image_path'
    and to_jsonb(new)->>'original_image_path' is not distinct from previous->>'original_image_path'
    and to_jsonb(new)->>'original_image_url' is not distinct from previous->>'original_image_url' then return new; end if;
  for p in select a.id,a.state from public.question_publications a join public.question_publication_images i on i.publication_id=a.id
    where (to_jsonb(new)->>'crop_image_path' is distinct from previous->>'crop_image_path' and public.publication_path_matches(to_jsonb(new)->>'crop_image_path',i.bucket,i.object_path))
       or (to_jsonb(new)->>'original_image_path' is distinct from previous->>'original_image_path' and public.publication_path_matches(to_jsonb(new)->>'original_image_path',i.bucket,i.object_path))
       or (to_jsonb(new)->>'original_image_url' is distinct from previous->>'original_image_url' and public.publication_path_matches(to_jsonb(new)->>'original_image_url',i.bucket,i.object_path))
    order by a.id for update of a
  loop
    if p.state='cancelled' then raise sqlstate '55000' using message='cancelled publication images cannot acquire new references'; end if;
  end loop;
  return new;
end $$;
create trigger questions_publication_reference_guard before insert or update on public.questions
  for each row execute function public.publication_guard_image_reference();
do $$ begin
  if to_regclass('public.question_answer_keys') is not null then
    execute 'create trigger answer_keys_publication_reference_guard before insert or update on public.question_answer_keys for each row execute function public.publication_guard_image_reference()';
  end if;
end $$;

create function public.publication_cleanup_claim(p_limit integer default 50) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare resource record; resources jsonb := '[]'::jsonb; scanned integer := 0;
begin
  for resource in select i.* from public.question_publication_images i join public.question_publications a on a.id=i.publication_id
    where a.state='cancelled' and i.cleanup_due_at<=now()
    order by i.cleanup_pending desc,i.cleanup_last_claimed_at nulls first,i.cleanup_due_at,i.publication_id,i.role
    limit least(greatest(p_limit,1),50) for update of a,i skip locked
  loop
    scanned := scanned + 1;
    update public.question_publication_images set cleanup_due_at=now()+interval '5 minutes',cleanup_last_claimed_at=now()
      where publication_id=resource.publication_id and role=resource.role;
    if public.publication_image_referenced(resource.bucket,resource.object_path) then
      update public.question_publication_images set cleanup_pending=true,cleanup_due_at=now()+interval '24 hours' where publication_id=resource.publication_id and role=resource.role;
      continue;
    end if;
    resources := resources || jsonb_build_array(jsonb_build_object('publicationId',resource.publication_id,'bucket',resource.bucket,'path',resource.object_path));
  end loop;
  return jsonb_build_object('resources',resources,'scanned',scanned);
end $$;

create function public.publication_cleanup_complete(p_id uuid,p_bucket text,p_path text,p_success boolean) returns void
language plpgsql security invoker set search_path = public as $$
begin
  -- Keep manifests for repeated sweeps: an upload accepted before cancellation may arrive late.
  update public.question_publication_images i set cleanup_pending=not p_success,
    cleanup_due_at=now()+case when p_success then interval '24 hours' else interval '5 minutes' end
    where i.publication_id=p_id and i.bucket=p_bucket and i.object_path=p_path
      and exists(select 1 from public.question_publications a where a.id=p_id and a.state='cancelled');
end $$;

create or replace function public.publication_upload_intent(p_owner uuid,p_id uuid,p_role text,p_sha256 text,p_content_type text,p_bytes integer) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare a public.question_publications; bucket_name text; object_name text; ext text;
begin
  select * into strict a from public.question_publications where id=p_id for update;
  if a.owner_id <> p_owner then raise insufficient_privilege using message='publication owner mismatch'; end if;
  if a.state='cancelled' then raise sqlstate '55000' using message='publication cancelled'; end if;
  if p_role not in ('crop','original') or a.snapshot->p_role->>'sha256' is distinct from p_sha256
    or a.snapshot->p_role->>'contentType' is distinct from p_content_type
    or (a.snapshot->p_role->>'bytes')::integer is distinct from p_bytes then
    raise invalid_parameter_value using message='publication image mismatch';
  end if;
  if a.state = 'published' then
    return (select jsonb_build_object('bucket',bucket,'path',object_path) from public.question_publication_images where publication_id=p_id and role=p_role);
  end if;
  ext := case p_content_type when 'image/webp' then 'webp' when 'image/png' then 'png' when 'image/jpeg' then 'jpg' end;
  if ext is null then raise invalid_parameter_value using message='unsupported image'; end if;
  bucket_name := case p_role when 'crop' then 'quiz-images' else 'quiz-originals' end;
  object_name := p_owner::text||'/'||p_id::text||'/'||p_role||'.'||ext;
  insert into public.question_publication_images(publication_id,role,bucket,object_path,sha256)
    values(p_id,p_role,bucket_name,object_name,p_sha256) on conflict(publication_id,role) do nothing;
  update public.question_publications set last_active_at=now() where id=p_id;
  return jsonb_build_object('bucket',bucket_name,'path',object_name);
end $$;

create or replace function public.publication_upload_complete(p_owner uuid,p_id uuid,p_role text) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare a public.question_publications;
begin
  select * into a from public.question_publications where id=p_id and owner_id=p_owner for update;
  if not found then raise insufficient_privilege; end if;
  if a.state='cancelled' then return public.publication_query(p_owner,p_id); end if;
  update public.question_publication_images set available=true where publication_id=p_id and role=p_role;
  update public.question_publications set last_active_at=now() where id=p_id;
  return jsonb_build_object('state','pending');
end $$;

create or replace function public.publication_commit(p_owner uuid,p_id uuid,p_snapshot jsonb,p_question jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare a public.question_publications; completed integer; answer jsonb;
begin
  select * into strict a from public.question_publications where id=p_id for update;
  if a.owner_id <> p_owner then raise insufficient_privilege; end if;
  if a.snapshot <> p_snapshot then raise invalid_parameter_value using message='publication content mismatch'; end if;
  if a.state='cancelled' then return public.publication_query(p_owner,p_id); end if;
  if a.state='published' then return jsonb_build_object('state','published','result',a.result); end if;
  select count(*) into completed from public.question_publication_images where publication_id=p_id and available;
  if completed <> 2 then raise invalid_parameter_value using message='publication images incomplete'; end if;
  insert into public.questions(id,crop_image_path,original_image_path,author_id,author_name,difficulty,status,language,quality_score,score_breakdown,options)
    values(p_id,p_question->>'crop_image_path',p_question->>'original_image_path',p_owner,p_snapshot->>'authorName','normal','active',p_snapshot->>'language',
      (p_question->>'quality_score')::integer,p_question->'score_breakdown',p_question->'options');
  answer := jsonb_build_object('id',p_id,'quality_score',(p_question->>'quality_score')::integer);
  update public.question_publications set state='published',result=answer,last_active_at=now() where id=p_id;
  return jsonb_build_object('state','published','result',answer);
end $$;

revoke all on function public.publication_cancel(uuid,uuid,jsonb),public.publication_path_matches(text,text,text),
 public.publication_image_referenced(text,text),public.publication_guard_image_reference(),
 public.publication_cleanup_claim(integer),public.publication_cleanup_complete(uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.publication_cancel(uuid,uuid,jsonb),public.publication_path_matches(text,text,text),
 public.publication_image_referenced(text,text),public.publication_guard_image_reference(),
 public.publication_cleanup_claim(integer),public.publication_cleanup_complete(uuid,text,text,boolean) to service_role;
commit;

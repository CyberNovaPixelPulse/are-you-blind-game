begin;

create table public.question_publications (
  id uuid primary key,
  owner_id uuid not null,
  snapshot jsonb not null,
  state text not null default 'pending' check (state in ('pending','published')),
  result jsonb,
  last_active_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check ((state = 'published') = (result is not null))
);
create table public.question_publication_images (
  publication_id uuid not null references public.question_publications(id),
  role text not null check (role in ('crop','original')),
  bucket text not null,
  object_path text not null,
  sha256 text not null,
  available boolean not null default false,
  primary key(publication_id,role),
  unique(bucket,object_path)
);
alter table public.question_publications enable row level security;
alter table public.question_publication_images enable row level security;
revoke all on public.question_publications, public.question_publication_images from public, anon, authenticated;
grant select, insert, update on public.question_publications, public.question_publication_images to service_role;

create function public.publication_query(p_owner uuid,p_id uuid) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare a public.question_publications;
begin
  select * into a from public.question_publications where id=p_id;
  if not found then return jsonb_build_object('state','pending'); end if;
  if a.owner_id <> p_owner then raise insufficient_privilege using message='publication owner mismatch'; end if;
  return jsonb_build_object('state',a.state,'result',a.result);
end $$;

create function public.publication_begin(p_owner uuid,p_id uuid,p_snapshot jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare a public.question_publications;
begin
  insert into public.question_publications(id,owner_id,snapshot) values(p_id,p_owner,p_snapshot) on conflict(id) do nothing;
  select * into a from public.question_publications where id=p_id for update;
  if a.owner_id <> p_owner then raise insufficient_privilege using message='publication owner mismatch'; end if;
  if a.snapshot <> p_snapshot then raise invalid_parameter_value using message='publication content mismatch'; end if;
  return jsonb_build_object('state',a.state,'result',a.result);
end $$;

create function public.publication_upload_intent(p_owner uuid,p_id uuid,p_role text,p_sha256 text,p_content_type text,p_bytes integer) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare a public.question_publications; bucket_name text; object_name text; ext text;
begin
  select * into strict a from public.question_publications where id=p_id for update;
  if a.owner_id <> p_owner then raise insufficient_privilege using message='publication owner mismatch'; end if;
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

create function public.publication_upload_complete(p_owner uuid,p_id uuid,p_role text) returns jsonb
language plpgsql security invoker set search_path = public as $$
begin
  perform 1 from public.question_publications where id=p_id and owner_id=p_owner for update;
  if not found then raise insufficient_privilege; end if;
  update public.question_publication_images set available=true where publication_id=p_id and role=p_role;
  update public.question_publications set last_active_at=now() where id=p_id;
  return jsonb_build_object('state','pending');
end $$;

create function public.publication_commit(p_owner uuid,p_id uuid,p_snapshot jsonb,p_question jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare a public.question_publications; completed integer; answer jsonb;
begin
  select * into strict a from public.question_publications where id=p_id for update;
  if a.owner_id <> p_owner then raise insufficient_privilege; end if;
  if a.snapshot <> p_snapshot then raise invalid_parameter_value using message='publication content mismatch'; end if;
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

revoke all on function public.publication_query(uuid,uuid),public.publication_begin(uuid,uuid,jsonb),
  public.publication_upload_intent(uuid,uuid,text,text,text,integer),public.publication_upload_complete(uuid,uuid,text),
  public.publication_commit(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.publication_query(uuid,uuid),public.publication_begin(uuid,uuid,jsonb),
  public.publication_upload_intent(uuid,uuid,text,text,text,integer),public.publication_upload_complete(uuid,uuid,text),
  public.publication_commit(uuid,uuid,jsonb,jsonb) to service_role;

commit;

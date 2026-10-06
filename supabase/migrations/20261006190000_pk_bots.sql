-- PK 虛擬玩家：補位、答題進度與分數。
-- 在 Supabase Dashboard → SQL Editor 整份貼上後執行一次。

begin;

alter table public.pk_rooms
  add column if not exists question_ids uuid[] not null default '{}';

alter table public.pk_rooms
  add column if not exists started_at timestamptz;

alter table public.pk_participants
  add column if not exists is_bot boolean not null default false;

alter table public.pk_participants
  add column if not exists current_question integer not null default 0;

alter table public.pk_participants
  add column if not exists total_score integer not null default 0;

do $$
declare
  constraint_name text;
begin
  select con.conname into constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'pk_participants'
    and con.contype = 'f'
    and pg_get_constraintdef(con.oid) ilike '%auth.users%';
  if constraint_name is not null then
    execute format('alter table public.pk_participants drop constraint %I', constraint_name);
  end if;
end $$;

create or replace function public.add_pk_bot(
  target_room_id uuid,
  bot_name text,
  bot_avatar text
)
returns setof public.pk_participants
language plpgsql
security definer
set search_path = public
as $$
declare
  room public.pk_rooms;
  humans integer;
  seated integer;
  clean_name text;
begin
  if auth.uid() is null then
    raise exception '需要登入';
  end if;

  select * into room
  from public.pk_rooms
  where id = target_room_id
  for update;

  if room.id is null then
    raise exception '找不到房間';
  end if;
  if room.status <> 'waiting' then
    raise exception '房間目前不能加入';
  end if;
  if room.host_id <> auth.uid() then
    raise exception '只有房長可以加入虛擬玩家';
  end if;

  select count(*) into humans
  from public.pk_participants
  where room_id = room.id and is_bot = false;

  if room.mode = 'random' and humans >= 2 then
    return;
  end if;

  if room.mode = 'random' and exists (
    select 1 from public.pk_participants
    where room_id = room.id and is_bot = true
  ) then
    return;
  end if;

  select count(*) into seated
  from public.pk_participants
  where room_id = room.id;

  if seated >= room.max_players then
    raise exception '房間已滿';
  end if;

  clean_name := btrim(bot_name);
  if char_length(clean_name) < 1 or char_length(clean_name) > 40 then
    raise exception '虛擬玩家名稱無效';
  end if;

  return query
  insert into public.pk_participants (
    room_id, user_id, username, avatar_url, is_bot, current_question, total_score
  )
  values (
    room.id, gen_random_uuid(), clean_name, nullif(btrim(bot_avatar), ''), true, 0, 0
  )
  returning *;
end;
$$;

create or replace function public.update_pk_bot_score(
  target_room_id uuid,
  bot_user_id uuid,
  next_question integer,
  next_score integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception '需要登入';
  end if;
  if not exists (
    select 1 from public.pk_participants
    where room_id = target_room_id and user_id = auth.uid()
  ) then
    raise exception '你不在這個房間';
  end if;

  update public.pk_participants
  set current_question = greatest(current_question, greatest(next_question, 0)),
      total_score = greatest(total_score, greatest(next_score, 0))
  where room_id = target_room_id
    and user_id = bot_user_id
    and is_bot = true;
end;
$$;

drop policy if exists pk_participants_update_score on public.pk_participants;
create policy pk_participants_update_score
  on public.pk_participants
  for update
  to authenticated
  using (user_id = auth.uid() and is_bot = false)
  with check (user_id = auth.uid() and is_bot = false);

grant update (current_question, total_score) on public.pk_participants to authenticated;
grant execute on function public.add_pk_bot(uuid, text, text) to authenticated;
grant execute on function public.update_pk_bot_score(uuid, uuid, integer, integer) to authenticated;

commit;

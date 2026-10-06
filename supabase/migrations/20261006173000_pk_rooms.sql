-- 即時 PK：隨機 1v1 與 2~4 人好友房。
-- 在 Supabase Dashboard → SQL Editor 整份貼上後執行一次。

begin;

create table if not exists public.pk_rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique,
  host_id uuid not null references auth.users (id) on delete cascade,
  mode text not null,
  status text not null default 'waiting',
  max_players integer not null,
  question_ids uuid[] not null default '{}',
  started_at timestamptz,
  created_at timestamptz not null default now(),
  constraint pk_rooms_code_chk check (room_code ~ '^[A-Z2-9]{4}$'),
  constraint pk_rooms_mode_chk check (mode in ('random', 'private')),
  constraint pk_rooms_status_chk check (status in ('waiting', 'playing', 'finished')),
  constraint pk_rooms_capacity_chk check (max_players between 2 and 4)
);

comment on table public.pk_rooms is 'PK 房間。random 為 1v1 配對，private 為好友房';
comment on column public.pk_rooms.question_ids is '開賽時抽中的題目，依作答順序排列';
comment on column public.pk_rooms.started_at is '開賽時間。所有客戶端用它同步 3 秒倒數';

create index if not exists pk_rooms_waiting_random_idx
  on public.pk_rooms (created_at)
  where status = 'waiting' and mode = 'random';

create table if not exists public.pk_participants (
  room_id uuid not null references public.pk_rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  username text not null,
  avatar_url text,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id),
  constraint pk_participants_username_chk
    check (char_length(btrim(username)) between 1 and 40)
);

comment on table public.pk_participants is 'PK 房間裡的玩家';

create index if not exists pk_participants_room_idx
  on public.pk_participants (room_id, joined_at);

create or replace function public.enforce_pk_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  room public.pk_rooms;
  total integer;
begin
  perform pg_advisory_xact_lock(hashtext(new.room_id::text));
  select * into room from public.pk_rooms where id = new.room_id;
  if room.id is null or room.status <> 'waiting' then
    raise exception '房間目前不能加入';
  end if;
  select count(*) into total
  from public.pk_participants
  where room_id = new.room_id and user_id <> new.user_id;
  if total >= room.max_players then
    raise exception '房間已滿';
  end if;
  return new;
end;
$$;

drop trigger if exists pk_participants_capacity on public.pk_participants;
create trigger pk_participants_capacity
  before insert on public.pk_participants
  for each row
  execute function public.enforce_pk_capacity();

create or replace function public.start_pk_room(
  target_room_id uuid,
  next_question_ids uuid[]
)
returns setof public.pk_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  room public.pk_rooms;
  players integer;
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
    return next room;
    return;
  end if;

  if not exists (
    select 1 from public.pk_participants
    where room_id = room.id and user_id = auth.uid()
  ) then
    raise exception '你不在這個房間';
  end if;

  select count(*) into players
  from public.pk_participants
  where room_id = room.id;

  if players < 2 then
    raise exception '至少要 2 人才能開始';
  end if;

  if room.mode = 'private' and room.host_id <> auth.uid() then
    raise exception '只有房長可以開始';
  end if;

  if coalesce(cardinality(next_question_ids), 0) < 1 then
    raise exception '沒有題目';
  end if;

  update public.pk_rooms
  set status = 'playing',
      question_ids = next_question_ids,
      started_at = now()
  where id = room.id
  returning * into room;

  return next room;
end;
$$;

alter table public.pk_rooms enable row level security;
alter table public.pk_participants enable row level security;

drop policy if exists pk_rooms_select_auth on public.pk_rooms;
create policy pk_rooms_select_auth
  on public.pk_rooms
  for select
  to authenticated
  using (true);

drop policy if exists pk_rooms_insert_host on public.pk_rooms;
create policy pk_rooms_insert_host
  on public.pk_rooms
  for insert
  to authenticated
  with check (host_id = auth.uid());

drop policy if exists pk_participants_select_auth on public.pk_participants;
create policy pk_participants_select_auth
  on public.pk_participants
  for select
  to authenticated
  using (true);

drop policy if exists pk_participants_insert_own on public.pk_participants;
create policy pk_participants_insert_own
  on public.pk_participants
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists pk_participants_delete_own on public.pk_participants;
create policy pk_participants_delete_own
  on public.pk_participants
  for delete
  to authenticated
  using (user_id = auth.uid());

revoke all on public.pk_rooms from anon, authenticated;
revoke all on public.pk_participants from anon, authenticated;
grant select, insert on public.pk_rooms to authenticated;
grant select, insert, delete on public.pk_participants to authenticated;

revoke all on function public.enforce_pk_capacity() from public, anon, authenticated;
revoke all on function public.start_pk_room(uuid, uuid[]) from public;
grant execute on function public.start_pk_room(uuid, uuid[]) to authenticated;

alter table public.pk_rooms replica identity full;
alter table public.pk_participants replica identity full;

commit;

do $$
begin
  alter publication supabase_realtime add table public.pk_rooms;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.pk_participants;
exception
  when duplicate_object then null;
end $$;

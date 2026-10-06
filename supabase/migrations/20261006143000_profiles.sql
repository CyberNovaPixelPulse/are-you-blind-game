-- 玩家個人資料。Google 登入後由 auth.users 觸發建立。
-- 在 Supabase Dashboard → SQL Editor 整份貼上後執行一次。

begin;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  avatar_url text,
  is_vip boolean default false,
  created_at timestamptz default now(),
  constraint profiles_username_chk
    check (char_length(btrim(username)) between 1 and 40)
);

comment on table public.profiles is '玩家暱稱、頭像與 VIP 標記';
comment on column public.profiles.username is '顯示用暱稱，出題時預設帶入作者名稱';
comment on column public.profiles.avatar_url is 'Google 大頭貼網址';
comment on column public.profiles.is_vip is 'VIP。僅能由資料庫或 service role 變更';

alter table public.profiles enable row level security;

drop policy if exists profiles_select_public on public.profiles;
create policy profiles_select_public
  on public.profiles
  for select
  to anon, authenticated
  using (true);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant update (username, avatar_url) on public.profiles to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  display_name text;
  picture text;
begin
  display_name := left(
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      '玩家'
    ),
    40
  );
  picture := nullif(
    btrim(
      coalesce(
        new.raw_user_meta_data ->> 'avatar_url',
        new.raw_user_meta_data ->> 'picture'
      )
    ),
    ''
  );

  insert into public.profiles (id, username, avatar_url)
  values (new.id, display_name, picture)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

insert into public.profiles (id, username, avatar_url)
select
  users.id,
  left(
    coalesce(
      nullif(btrim(users.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(users.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(coalesce(users.email, ''), '@', 1), ''),
      '玩家'
    ),
    40
  ),
  nullif(
    btrim(
      coalesce(
        users.raw_user_meta_data ->> 'avatar_url',
        users.raw_user_meta_data ->> 'picture'
      )
    ),
    ''
  )
from auth.users as users
on conflict (id) do nothing;

commit;

begin;

-- Remove legacy permissive policies. PostgreSQL combines permissive policies
-- with OR, so the stricter policies alone would not close the old access path.
drop policy if exists "Host can update pk_rooms" on public.pk_rooms;
drop policy if exists "Allow public read pk_rooms" on public.pk_rooms;
drop policy if exists "Public can read pk_rooms" on public.pk_rooms;
drop policy if exists "Authenticated users can create pk_rooms" on public.pk_rooms;
drop policy if exists "Users can update their score" on public.pk_participants;
drop policy if exists "Allow public read pk_participants" on public.pk_participants;
drop policy if exists "Public can read participants" on public.pk_participants;
drop policy if exists "Users can join rooms" on public.pk_participants;
drop policy if exists "pk_rooms_select_auth" on public.pk_rooms;
drop policy if exists "pk_rooms_insert_host" on public.pk_rooms;
drop policy if exists "pk_participants_select_auth" on public.pk_participants;
drop policy if exists "pk_participants_insert_own" on public.pk_participants;
drop policy if exists "pk_participants_delete_own" on public.pk_participants;
drop policy if exists "pk_participants_update_score" on public.pk_participants;

create policy pk_rooms_select_authenticated
  on public.pk_rooms for select to authenticated using (true);

create policy pk_rooms_insert_self
  on public.pk_rooms for insert to authenticated
  with check (host_id = (select auth.uid()));

create policy pk_rooms_update_host
  on public.pk_rooms for update to authenticated
  using (host_id = (select auth.uid()))
  with check (host_id = (select auth.uid()));

create policy pk_participants_select_authenticated
  on public.pk_participants for select to authenticated using (true);

create policy pk_participants_insert_self
  on public.pk_participants for insert to authenticated
  with check (user_id = (select auth.uid()) and is_bot = false);

create policy pk_participants_update_self
  on public.pk_participants for update to authenticated
  using (user_id = (select auth.uid()) and is_bot = false)
  with check (user_id = (select auth.uid()) and is_bot = false);

create policy pk_participants_delete_self
  on public.pk_participants for delete to authenticated
  using (user_id = (select auth.uid()) and is_bot = false);

revoke all on public.pk_rooms from public, anon, authenticated;
revoke all on public.pk_participants from public, anon, authenticated;
grant select, insert, update on public.pk_rooms to authenticated;
grant select, insert, update, delete on public.pk_participants to authenticated;

commit;

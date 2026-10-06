-- Guess Meme：questions、options、quiz-images
-- 在 Supabase Dashboard → SQL Editor 整份貼上後執行一次。

begin;

-- ---------------------------------------------------------------------------
-- questions：局部圖、原圖、作者
-- 路徑是 quiz-images bucket 內的 object key，不是完整 URL。
-- ---------------------------------------------------------------------------
create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  crop_image_path text not null,
  original_image_path text not null,
  author_id uuid not null references auth.users (id) on delete cascade,
  author_name text not null,
  created_at timestamptz not null default now(),
  constraint questions_author_name_chk
    check (char_length(btrim(author_name)) between 1 and 40),
  constraint questions_image_path_chk
    check (
      crop_image_path <> original_image_path
      and starts_with(crop_image_path, author_id::text || '/')
      and starts_with(original_image_path, author_id::text || '/')
      and crop_image_path ~ '\.webp$'
      and original_image_path ~ '\.webp$'
      and crop_image_path !~ '\.\.'
      and original_image_path !~ '\.\.'
    )
);

comment on table public.questions is 'UGC 猜謎題：局部圖、原圖、作者';
comment on column public.questions.crop_image_path is '局部圖，quiz-images 內的 WebP 路徑';
comment on column public.questions.original_image_path is '原圖，quiz-images 內的 WebP 路徑';
comment on column public.questions.author_id is '作者，必須是目前登入使用者';
comment on column public.questions.author_name is '題目上顯示的作者名稱';

create index if not exists questions_author_id_idx
  on public.questions (author_id);
create index if not exists questions_created_at_idx
  on public.questions (created_at desc);

-- ---------------------------------------------------------------------------
-- options：選項文字、是否正確、專屬吐槽
-- 同一題最多一個 is_correct = true。
-- ---------------------------------------------------------------------------
create table if not exists public.options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete cascade,
  option_text text not null,
  is_correct boolean not null default false,
  taunt_text text not null,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  constraint options_text_chk
    check (char_length(btrim(option_text)) between 1 and 120),
  constraint options_taunt_chk
    check (char_length(btrim(taunt_text)) between 1 and 280),
  constraint options_sort_order_chk
    check (sort_order >= 0)
);

comment on table public.options is '題目選項。is_correct 與 taunt_text 不對玩家直接公開';
comment on column public.options.option_text is '選項文字';
comment on column public.options.is_correct is '是否為正解';
comment on column public.options.taunt_text is '選到此選項時顯示的專屬吐槽';

create index if not exists options_question_id_idx
  on public.options (question_id);
create unique index if not exists options_one_correct_idx
  on public.options (question_id)
  where is_correct;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.questions enable row level security;
alter table public.options enable row level security;

drop policy if exists questions_select_public on public.questions;
create policy questions_select_public
  on public.questions
  for select
  to anon, authenticated
  using (true);

drop policy if exists questions_insert_own on public.questions;
create policy questions_insert_own
  on public.questions
  for insert
  to authenticated
  with check (author_id = auth.uid());

drop policy if exists questions_update_own on public.questions;
create policy questions_update_own
  on public.questions
  for update
  to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

drop policy if exists questions_delete_own on public.questions;
create policy questions_delete_own
  on public.questions
  for delete
  to authenticated
  using (author_id = auth.uid());

drop policy if exists options_select_public on public.options;
create policy options_select_public
  on public.options
  for select
  to anon, authenticated
  using (true);

drop policy if exists options_insert_own_question on public.options;
create policy options_insert_own_question
  on public.options
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.questions q
      where q.id = question_id
        and q.author_id = auth.uid()
    )
  );

drop policy if exists options_update_own_question on public.options;
create policy options_update_own_question
  on public.options
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.questions q
      where q.id = question_id
        and q.author_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.questions q
      where q.id = question_id
        and q.author_id = auth.uid()
    )
  );

drop policy if exists options_delete_own_question on public.options;
create policy options_delete_own_question
  on public.options
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.questions q
      where q.id = question_id
        and q.author_id = auth.uid()
    )
  );

revoke all on table public.questions from public, anon, authenticated;
revoke all on table public.options from public, anon, authenticated;

grant select on table public.questions to anon, authenticated;
grant insert, update, delete on table public.questions to authenticated;

-- 玩家可讀選項文字，不能直接讀正解與吐槽。
grant select (id, question_id, option_text, sort_order, created_at)
  on table public.options to anon, authenticated;
grant insert, update, delete on table public.options to authenticated;

grant all on table public.questions to service_role;
grant all on table public.options to service_role;

-- ---------------------------------------------------------------------------
-- 猜題後才揭曉；作者編輯時才看得到自己的正解與吐槽
-- ---------------------------------------------------------------------------
create or replace function public.submit_guess(p_option_id uuid)
returns table (is_correct boolean, taunt_text text)
language sql
stable
security definer
set search_path = public
as $$
  select o.is_correct, o.taunt_text
  from public.options o
  where o.id = p_option_id;
$$;

create or replace function public.get_my_question_options(p_question_id uuid)
returns table (
  id uuid,
  option_text text,
  is_correct boolean,
  taunt_text text,
  sort_order smallint
)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.option_text, o.is_correct, o.taunt_text, o.sort_order
  from public.options o
  join public.questions q on q.id = o.question_id
  where o.question_id = p_question_id
    and q.author_id = auth.uid()
  order by o.sort_order, o.created_at;
$$;

revoke all on function public.submit_guess(uuid) from public;
revoke all on function public.get_my_question_options(uuid) from public;
grant execute on function public.submit_guess(uuid) to anon, authenticated, service_role;
grant execute on function public.get_my_question_options(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Storage：quiz-images
-- 公開讀取。只有登入者能上傳到自己的資料夾，且僅接受 ≤150KB 的 WebP。
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'quiz-images',
  'quiz-images',
  true,
  153600, -- 150 * 1024 bytes
  array['image/webp']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists quiz_images_public_read on storage.objects;
create policy quiz_images_public_read
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'quiz-images');

drop policy if exists quiz_images_insert_own on storage.objects;
create policy quiz_images_insert_own
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'quiz-images'
    and storage.extension(name) = 'webp'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists quiz_images_update_own on storage.objects;
create policy quiz_images_update_own
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'quiz-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'quiz-images'
    and storage.extension(name) = 'webp'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists quiz_images_delete_own on storage.objects;
create policy quiz_images_delete_own
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'quiz-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

commit;

notify pgrst, 'reload schema';

-- 出題上傳接受 WebP、JPEG、PNG。原圖壓縮後可能到 300KB。

update storage.buckets
set
  allowed_mime_types = array['image/webp', 'image/jpeg', 'image/jpg', 'image/png']::text[],
  file_size_limit = 307200
where id = 'quiz-images';

drop policy if exists quiz_images_insert_own on storage.objects;
create policy quiz_images_insert_own
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'quiz-images'
    and lower(storage.extension(name)) in ('webp', 'jpg', 'jpeg', 'png')
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
    and lower(storage.extension(name)) in ('webp', 'jpg', 'jpeg', 'png')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

alter table public.questions drop constraint if exists questions_image_path_chk;

alter table public.questions
  add constraint questions_image_path_chk
  check (
    crop_image_path <> original_image_path
    and crop_image_path !~ '\.\.'
    and original_image_path !~ '\.\.'
    and (
      (
        starts_with(crop_image_path, author_id::text || '/')
        and starts_with(original_image_path, author_id::text || '/')
        and crop_image_path ~ '\.(webp|jpe?g|png)$'
        and original_image_path ~ '\.(webp|jpe?g|png)$'
      )
      or (
        crop_image_path ~ '^https://'
        and original_image_path ~ '^https://'
      )
    )
  );

alter table public.questions
  add column if not exists country_code text default 'GLOBAL';

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
        and crop_image_path ~ '\.webp$'
        and original_image_path ~ '\.webp$'
      )
      or (
        crop_image_path ~ '^https://'
        and original_image_path ~ '^https://'
      )
    )
  );

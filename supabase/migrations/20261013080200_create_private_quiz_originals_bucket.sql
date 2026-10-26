begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('quiz-originals', 'quiz-originals', false, 307200, array['image/webp','image/jpeg','image/png']::text[])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

commit;

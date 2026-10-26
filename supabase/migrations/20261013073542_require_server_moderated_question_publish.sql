begin;

drop policy if exists "Authenticated users can insert questions" on public.questions;
drop policy if exists questions_insert_own on public.questions;
revoke insert on public.questions from public, anon, authenticated;
grant insert on public.questions to service_role;

commit;

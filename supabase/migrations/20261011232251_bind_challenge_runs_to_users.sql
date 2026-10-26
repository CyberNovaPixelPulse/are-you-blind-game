alter table public.challenge_runs
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists challenge_runs_user_idx on public.challenge_runs(user_id);

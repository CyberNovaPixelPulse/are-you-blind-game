begin;

revoke execute on function public.consume_api_rate_limit(text, integer, integer) from anon, authenticated;
drop policy if exists "Anon users can insert score" on public.challenge_leaderboard;
drop policy if exists "Authenticated users can insert score" on public.challenge_leaderboard;
create index if not exists challenge_leaderboard_user_idx on public.challenge_leaderboard(user_id);
create index if not exists vip_purchase_consents_user_idx on public.vip_purchase_consents(user_id, agreed_at desc);

commit;

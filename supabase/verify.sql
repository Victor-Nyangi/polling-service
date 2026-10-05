-- Verification script for schema.sql triggers.
-- Run in the Supabase SQL editor (requires a privileged role: it inserts
-- directly into auth.users). Everything is rolled back at the end.

begin;

do $$
declare
  v_author uuid := '11111111-1111-1111-1111-111111111111';
  v_voter  uuid := '22222222-2222-2222-2222-222222222222';
  v_count  integer;
  v_username text;
  v_post uuid;
  v_poll uuid;
  v_option_a uuid;
  v_option_b uuid;
  v_report uuid;
begin
  ----------------------------------------------------------------------------
  -- Profile bootstrap
  ----------------------------------------------------------------------------
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data
  ) values
    (v_author, '00000000-0000-0000-0000-000000000000',
     'authenticated', 'authenticated', 'author@example.test', '',
     now(), now(), '{}'::jsonb, '{}'::jsonb),
    (v_voter, '00000000-0000-0000-0000-000000000000',
     'authenticated', 'authenticated', 'voter@example.test', '',
     now(), now(), '{}'::jsonb,
     jsonb_build_object('full_name', 'Voter Person'));

  select count(*) into v_count
  from public.profiles
  where user_id in (v_author, v_voter);
  if v_count <> 2 then
    raise exception 'expected 2 auto-created profiles, got %', v_count;
  end if;

  select username into v_username
  from public.profiles where user_id = v_author;
  if v_username not like 'author%' then
    raise exception 'expected username derived from email, got %', v_username;
  end if;

  if (select display_name from public.profiles where user_id = v_voter)
     is distinct from 'Voter Person' then
    raise exception 'expected display_name seeded from raw_user_meta_data';
  end if;

  if (select onboarded_at from public.profiles where user_id = v_author)
     is not null then
    raise exception 'expected onboarded_at to start null';
  end if;

  ----------------------------------------------------------------------------
  -- Engagement notifications
  ----------------------------------------------------------------------------
  insert into public.posts (author_id, body)
  values (v_author, 'verify post')
  returning id into v_post;

  insert into public.polls (post_id, question)
  values (v_post, 'Verify question?')
  returning id into v_poll;

  insert into public.poll_options (poll_id, label, position)
  values (v_poll, 'Option A', 1) returning id into v_option_a;

  insert into public.poll_options (poll_id, label, position)
  values (v_poll, 'Option B', 2) returning id into v_option_b;

  -- A vote by someone else notifies the author.
  insert into public.poll_votes (poll_id, option_id, voter_id)
  values (v_poll, v_option_a, v_voter);

  select count(*) into v_count from public.notifications
  where recipient_id = v_author and type = 'poll_vote';
  if v_count <> 1 then
    raise exception 'expected 1 poll_vote notification, got %', v_count;
  end if;

  if (select payload ->> 'option_label' from public.notifications
      where recipient_id = v_author and type = 'poll_vote')
     is distinct from 'Option A' then
    raise exception 'expected option_label in the poll_vote payload';
  end if;

  -- Voting on your own poll does not notify you.
  insert into public.poll_votes (poll_id, option_id, voter_id)
  values (v_poll, v_option_b, v_author);

  select count(*) into v_count from public.notifications
  where recipient_id = v_author and type = 'poll_vote';
  if v_count <> 1 then
    raise exception 'self-vote should not notify, got % rows', v_count;
  end if;

  -- Reaction notifies once; removing and re-adding does not duplicate.
  insert into public.reactions (post_id, user_id, reaction_type)
  values (v_post, v_voter, 'like');
  delete from public.reactions where post_id = v_post and user_id = v_voter;
  insert into public.reactions (post_id, user_id, reaction_type)
  values (v_post, v_voter, 'like');

  select count(*) into v_count from public.notifications
  where recipient_id = v_author and type = 'post_reaction';
  if v_count <> 1 then
    raise exception 'expected dedupe to cap post_reaction at 1, got %', v_count;
  end if;

  -- Repost notifies once; toggling does not duplicate.
  insert into public.reposts (post_id, user_id) values (v_post, v_voter);
  delete from public.reposts where post_id = v_post and user_id = v_voter;
  insert into public.reposts (post_id, user_id) values (v_post, v_voter);

  select count(*) into v_count from public.notifications
  where recipient_id = v_author and type = 'post_repost';
  if v_count <> 1 then
    raise exception 'expected dedupe to cap post_repost at 1, got %', v_count;
  end if;

  ----------------------------------------------------------------------------
  -- Report review notifications
  ----------------------------------------------------------------------------
  insert into public.reports (reporter_id, target_type, target_post_id, reason)
  values (v_voter, 'post', v_post, 'verify reason')
  returning id into v_report;

  update public.reports
     set status = 'reviewed', reviewed_by = v_author, reviewed_at = now()
   where id = v_report;

  update public.reports
     set status = 'closed', reviewed_by = v_author, reviewed_at = now()
   where id = v_report;

  select count(*) into v_count from public.notifications
  where recipient_id = v_voter and type = 'report_reviewed';
  if v_count <> 2 then
    raise exception 'expected 2 report_reviewed notifications, got %', v_count;
  end if;

  -- A no-op update must not notify again.
  update public.reports set reason = 'verify reason edited' where id = v_report;

  select count(*) into v_count from public.notifications
  where recipient_id = v_voter and type = 'report_reviewed';
  if v_count <> 2 then
    raise exception 'unchanged status should not notify, got % rows', v_count;
  end if;

  ----------------------------------------------------------------------------
  -- Index and privileges
  ----------------------------------------------------------------------------
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'notifications_engagement_dedupe_idx'
  ) then
    raise exception 'expected notifications_engagement_dedupe_idx to exist';
  end if;

  if exists (
    select 1
    from information_schema.column_privileges
    where table_schema = 'public'
      and table_name = 'notifications'
      and grantee = 'authenticated'
      and privilege_type = 'UPDATE'
      and column_name <> 'read_at'
  ) then
    raise exception 'authenticated should hold UPDATE on read_at only';
  end if;

  if exists (
    select 1
    from information_schema.column_privileges
    where table_schema = 'public'
      and table_name = 'profiles'
      and grantee = 'authenticated'
      and privilege_type = 'UPDATE'
      and column_name in ('role', 'is_suspended')
  ) then
    raise exception 'authenticated must not hold UPDATE on profiles.role';
  end if;

  ----------------------------------------------------------------------------
  -- Ballot secrecy: tallies are public, voter identity is not
  ----------------------------------------------------------------------------
  select votes into v_count
  from public.poll_option_vote_counts
  where option_id = v_option_a;
  if v_count <> 1 then
    raise exception 'expected the aggregate view to report 1 vote, got %', v_count;
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'poll_votes'
      and cmd = 'SELECT'
      and qual = 'true'
  ) then
    raise exception 'poll_votes must not be publicly readable';
  end if;

  ----------------------------------------------------------------------------
  -- Anonymous ballots: cast_anonymous_vote and response milestones
  ----------------------------------------------------------------------------
  perform public.cast_anonymous_vote(v_poll, v_option_a, repeat('a', 32));

  if not exists (
    select 1 from public.poll_participants
    where poll_id = v_poll
      and token_hash = encode(sha256(convert_to(repeat('a', 32), 'UTF8')), 'hex')
      and used_at is not null
  ) then
    raise exception 'expected an open-mode vote to register a used participant';
  end if;

  begin
    perform public.cast_anonymous_vote(v_poll, v_option_b, repeat('a', 32));
    raise exception 'expected a repeat anonymous vote to be refused';
  exception when sqlstate 'PV005' then null;
  end;

  -- The first anonymous response notifies; the second is not a milestone.
  perform public.cast_anonymous_vote(v_poll, v_option_b, repeat('b', 32));

  select count(*) into v_count from public.notifications
  where recipient_id = v_author and type = 'poll_responses' and post_id = v_post;
  if v_count <> 1 then
    raise exception 'expected 1 poll_responses notification after 2 responses, got %', v_count;
  end if;

  update public.polls set participation_mode = 'invite' where id = v_poll;
  begin
    perform public.cast_anonymous_vote(v_poll, v_option_a, repeat('c', 32));
    raise exception 'expected an uninvited token to be refused';
  exception when sqlstate 'PV004' then null;
  end;

  -- An issued, unused invite, so the only thing left to refuse it is the close.
  insert into public.poll_participants (poll_id, token_hash)
  values (v_poll, encode(sha256(convert_to(repeat('d', 32), 'UTF8')), 'hex'));

  update public.polls set status = 'closed' where id = v_poll;
  begin
    perform public.cast_anonymous_vote(v_poll, v_option_a, repeat('d', 32));
    raise exception 'expected a closed poll to refuse an anonymous vote';
  exception when check_violation then null;
  end;

  raise notice 'verify.sql: all assertions passed';
end
$$;

rollback;

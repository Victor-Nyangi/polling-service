-- Verification script for schema.sql triggers.
-- Run in the Supabase SQL editor (requires a privileged role: it inserts
-- directly into auth.users). Everything is rolled back at the end.

begin;

do $$
declare
  v_author uuid := '11111111-1111-1111-1111-111111111111';
  v_voter  uuid := '22222222-2222-2222-2222-222222222222';
  v_count  integer;
  v_tokens text[];
  v_labels text[];
  v_invite_post uuid;
  v_invite_poll uuid;
  v_invite_a uuid;
  v_invite_b uuid;
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

  ----------------------------------------------------------------------------
  -- Participation mode is frozen once a poll has a ballot, even for a
  -- privileged role
  ----------------------------------------------------------------------------
  begin
    update public.polls set participation_mode = 'invite' where id = v_poll;
    raise exception 'expected the mode of a poll with votes to be frozen';
  exception when sqlstate 'PV007' then null;
  end;

  ----------------------------------------------------------------------------
  -- Invite mode: privileges
  ----------------------------------------------------------------------------
  if has_function_privilege('anon', 'public.issue_poll_invites(uuid, text[])', 'execute')
     or not has_function_privilege('authenticated', 'public.issue_poll_invites(uuid, text[])', 'execute') then
    raise exception 'issue_poll_invites must be executable by authenticated only';
  end if;

  if has_table_privilege('authenticated', 'public.poll_participants', 'insert')
     or has_column_privilege('authenticated', 'public.poll_participants', 'used_at', 'update')
     or has_column_privilege('authenticated', 'public.poll_participants', 'token_hash', 'update')
     or has_table_privilege('anon', 'public.poll_participants', 'select') then
    raise exception 'poll_participants: insert is issue_poll_invites only, used_at is not the owner''s, anon gets nothing';
  end if;

  if has_column_privilege('authenticated', 'public.poll_votes', 'participant_hash', 'select')
     or has_column_privilege('anon', 'public.poll_votes', 'participant_hash', 'select')
     or has_column_privilege('authenticated', 'public.poll_votes', 'created_at', 'select') then
    raise exception 'poll_votes.participant_hash and created_at must not be readable';
  end if;

  if has_column_privilege('authenticated', 'public.polls', 'question', 'update')
     or has_column_privilege('authenticated', 'public.polls', 'status', 'update')
     or not has_column_privilege('authenticated', 'public.polls', 'participation_mode', 'update') then
    raise exception 'authenticated should hold UPDATE on polls.participation_mode only';
  end if;

  ----------------------------------------------------------------------------
  -- Invite mode: end to end, as the owner, another user and anon
  ----------------------------------------------------------------------------
  -- Created open with no ballots, so the owner's switch to invite is allowed.
  insert into public.posts (author_id, body)
  values (v_author, 'verify invite post')
  returning id into v_invite_post;

  insert into public.polls (post_id, question)
  values (v_invite_post, 'Verify invite question?')
  returning id into v_invite_poll;

  insert into public.poll_options (poll_id, label, position)
  values (v_invite_poll, 'Invite A', 1) returning id into v_invite_a;

  insert into public.poll_options (poll_id, label, position)
  values (v_invite_poll, 'Invite B', 2) returning id into v_invite_b;

  -- Both claim forms: hosted auth.uid() reads request.jwt.claims, older images
  -- read request.jwt.claim.sub.
  perform set_config('request.jwt.claim.sub', v_voter::text, true),
          set_config('request.jwt.claims', json_build_object('sub', v_voter, 'role', 'authenticated')::text, true),
          set_config('role', 'authenticated', true);

  update public.polls set participation_mode = 'invite' where id = v_invite_poll;
  get diagnostics v_count = row_count;
  if v_count <> 0 then
    raise exception 'another user must not change a poll''s mode';
  end if;

  perform set_config('request.jwt.claim.sub', v_author::text, true),
          set_config('request.jwt.claims', json_build_object('sub', v_author, 'role', 'authenticated')::text, true);

  begin
    perform public.issue_poll_invites(v_invite_poll, array['too early']);
    raise exception 'expected issuing on an open poll to be refused';
  exception when sqlstate 'PV009' then null;
  end;

  update public.polls set participation_mode = 'invite' where id = v_invite_poll;
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'the owner should be able to change the mode of a poll with no votes';
  end if;

  select array_agg(i.token order by i.n), array_agg(i.label order by i.n)
    into v_tokens, v_labels
  from public.issue_poll_invites(v_invite_poll, array['Alice', null, '   '])
    with ordinality as i (token, label, n);

  if cardinality(v_tokens) <> 3
     or v_labels is distinct from array['Alice', null, null]::text[] then
    raise exception 'expected 3 invites labelled Alice, unnamed, unnamed; got %', v_labels;
  end if;

  if exists (select 1 from unnest(v_tokens) as t where t !~ '^[A-Za-z0-9_-]{64}$')
     or (select count(distinct t) from unnest(v_tokens) as t) <> 3 then
    raise exception 'expected 3 distinct 64-character base64url tokens';
  end if;

  -- The owner reads the stored rows: hashes only, matching cast_anonymous_vote.
  select count(*) into v_count
  from public.poll_participants as pp
  join unnest(v_tokens) as t
    on pp.token_hash = encode(sha256(convert_to(t, 'UTF8')), 'hex')
  where pp.poll_id = v_invite_poll
    and pp.used_at is null;
  if v_count <> 3 then
    raise exception 'expected 3 unused rows storing the sha256 of each token, got %', v_count;
  end if;

  if exists (
    select 1 from public.poll_participants as pp
    where pp.poll_id = v_invite_poll
      and (pp.token_hash = any (v_tokens) or pp.label = any (v_tokens))
  ) then
    raise exception 'a raw invite token must never be stored';
  end if;

  begin
    perform public.issue_poll_invites(v_invite_poll, array_fill('x'::text, array[201]));
    raise exception 'expected a batch of 201 to be refused';
  exception when sqlstate 'PV010' then null;
  end;

  begin
    perform public.issue_poll_invites(v_invite_poll, array[]::text[]);
    raise exception 'expected an empty batch to be refused';
  exception when sqlstate 'PV010' then null;
  end;

  begin
    perform public.issue_poll_invites(gen_random_uuid(), array['nobody']);
    raise exception 'expected issuing on a missing poll to be refused';
  exception when sqlstate 'PV002' then null;
  end;

  begin
    insert into public.poll_participants (poll_id, token_hash)
    values (v_invite_poll, repeat('0', 64));
    raise exception 'the owner must not insert invites directly';
  exception when insufficient_privilege then null;
  end;

  -- Another signed-in user: no invites, no list.
  perform set_config('request.jwt.claim.sub', v_voter::text, true),
          set_config('request.jwt.claims', json_build_object('sub', v_voter, 'role', 'authenticated')::text, true);

  begin
    perform public.issue_poll_invites(v_invite_poll, array['intruder']);
    raise exception 'expected a non-owner to be refused';
  exception when sqlstate 'PV008' then null;
  end;

  if exists (select 1 from public.poll_participants where poll_id = v_invite_poll) then
    raise exception 'another user must not read the invite list';
  end if;

  -- A signed-in ballot on an invite poll is refused by the trigger, which runs
  -- before the RLS check this row would otherwise pass.
  begin
    insert into public.poll_votes (poll_id, option_id, voter_id)
    values (v_invite_poll, v_invite_a, v_voter);
    raise exception 'expected a signed-in vote on an invite poll to be refused';
  exception when sqlstate 'PV006' then null;
  end;

  -- Anon: votes with an invite, and nothing else.
  perform set_config('request.jwt.claim.sub', '', true),
          set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true),
          set_config('role', 'anon', true);

  begin
    perform public.issue_poll_invites(v_invite_poll, array['anon']);
    raise exception 'expected anon to be refused issue_poll_invites';
  exception when insufficient_privilege then null;
  end;

  begin
    perform 1 from public.poll_participants;
    raise exception 'expected anon to be refused the invite list';
  exception when insufficient_privilege then null;
  end;

  perform public.cast_anonymous_vote(v_invite_poll, v_invite_b, v_tokens[1]);

  begin
    perform public.cast_anonymous_vote(v_invite_poll, v_invite_a, v_tokens[1]);
    raise exception 'expected a used invite to be refused';
  exception when sqlstate 'PV005' then null;
  end;

  begin
    perform public.cast_anonymous_vote(v_invite_poll, v_invite_a, repeat('c', 64));
    raise exception 'expected an uninvited token to be refused';
  exception when sqlstate 'PV004' then null;
  end;

  -- Back to the owner: turnout yes, choices no.
  perform set_config('request.jwt.claim.sub', v_author::text, true),
          set_config('request.jwt.claims', json_build_object('sub', v_author, 'role', 'authenticated')::text, true),
          set_config('role', 'authenticated', true);

  begin
    update public.polls set participation_mode = 'open' where id = v_invite_poll;
    raise exception 'expected the owner''s mode change to be refused once a vote exists';
  exception when sqlstate 'PV007' then null;
  end;

  select count(*) into v_count
  from public.poll_participants
  where poll_id = v_invite_poll and used_at is not null;
  if v_count <> 1
     or (select count(*) from public.poll_participants where poll_id = v_invite_poll) <> 3 then
    raise exception 'the owner should see 3 invites and exactly 1 used, got % used', v_count;
  end if;

  select coalesce(sum(votes), 0) into v_count
  from public.poll_option_vote_counts
  where poll_id = v_invite_poll;
  if v_count <> 1 then
    raise exception 'the owner should see a tally of 1, got %', v_count;
  end if;

  select count(*) into v_count from public.poll_votes where poll_id = v_invite_poll;
  if v_count <> 0 then
    raise exception 'the owner must not see anonymous ballot rows, saw %', v_count;
  end if;

  begin
    perform pv.participant_hash from public.poll_votes as pv;
    raise exception 'the owner must not be able to read participant_hash';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.poll_participants set used_at = null where poll_id = v_invite_poll;
    raise exception 'the owner must not rewrite used_at';
  exception when insufficient_privilege then null;
  end;

  update public.poll_participants
     set label = 'Bob'
   where poll_id = v_invite_poll
     and token_hash = encode(sha256(convert_to(v_tokens[2], 'UTF8')), 'hex');
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'the owner should be able to relabel an invite';
  end if;

  -- Revocation: an unused invite goes, and stops working; a used one stays.
  delete from public.poll_participants
   where poll_id = v_invite_poll
     and token_hash = encode(sha256(convert_to(v_tokens[2], 'UTF8')), 'hex');
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'the owner should be able to revoke an unused invite';
  end if;

  begin
    delete from public.poll_participants
     where poll_id = v_invite_poll
       and token_hash = encode(sha256(convert_to(v_tokens[1], 'UTF8')), 'hex');
    raise exception 'expected a used invite to be undeletable';
  exception when sqlstate 'PV011' then null;
  end;

  begin
    perform public.cast_anonymous_vote(v_invite_poll, v_invite_a, v_tokens[2]);
    raise exception 'expected a revoked invite to be refused';
  exception when sqlstate 'PV004' then null;
  end;

  perform set_config('role', 'none', true);

  -- The PV006 refusal is the trigger's, not the policy's: a privileged role,
  -- which bypasses RLS, is refused too.
  begin
    insert into public.poll_votes (poll_id, option_id, voter_id)
    values (v_invite_poll, v_invite_a, v_voter);
    raise exception 'expected a privileged signed-in vote on an invite poll to be refused';
  exception when sqlstate 'PV006' then null;
  end;

  -- An issued, unused invite, so the only thing left to refuse it is the close.
  update public.polls set status = 'closed' where id = v_invite_poll;
  begin
    perform public.cast_anonymous_vote(v_invite_poll, v_invite_a, v_tokens[3]);
    raise exception 'expected a closed poll to refuse an anonymous vote';
  exception when check_violation then null;
  end;

  -- The owner deleting the post still cascades through a used invite.
  perform set_config('role', 'authenticated', true);
  delete from public.posts where id = v_invite_post;
  perform set_config('role', 'none', true);
  if exists (select 1 from public.poll_participants where poll_id = v_invite_poll) then
    raise exception 'deleting the poll should cascade to its invites, used or not';
  end if;

  raise notice 'verify.sql: all assertions passed';
end
$$;

rollback;

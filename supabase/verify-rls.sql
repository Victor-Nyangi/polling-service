-- verify-rls.sql: cross-account row-level security checks for schema.sql.
--
-- WHAT IT ANSWERS. Can a signed-in user A read or change user B's rows, and
-- what can a caller with no session (anon) do to them? Every user-owned table
-- in schema.sql is covered: profiles, posts, polls, poll_options, poll_votes
-- (signed-in votes and anonymous participant_hash ballots), poll_participants
-- (invites), reactions, reposts, reports, notifications, plus the two RPCs that
-- bypass RLS on purpose (issue_poll_invites, cast_anonymous_vote) and the
-- public tally view. Positive controls check that A CAN still do what the
-- policies intend on A's own rows, so a database that refused everything would
-- not pass.
--
-- IT LEAVES NOTHING BEHIND. The whole script is one transaction that always
-- ends in ROLLBACK: the two throwaway users, their profiles, every fixture row
-- and the temp table holding the results are all discarded. On top of that,
-- every individual probe runs in its own subtransaction and is rolled back
-- straight after its outcome is recorded, so one probe can never change what
-- the next one sees. If the script stops on an error part-way, the transaction
-- was never committed and nothing was written either.
--
-- HOW TO RUN. Paste the whole file into the Supabase SQL editor (as the default
-- `postgres` role; it inserts into auth.users directly) after schema.sql, and
-- run it. The result grid shows one row per check, with row 0 a summary. In
-- psql, the same table is the last result before ROLLBACK, and a NOTICE
-- repeats the summary.
--
-- HOW TO READ IT. Each row is: area, actor (A / anon / owner), check,
-- expected, actual, result.
--   allowed: N rows      a write went through and affected N rows
--   allowed: N visible   a read returned N rows
--   denied: 0 rows       a write was silently filtered out by RLS
--   denied: 0 visible    a read was silently filtered out by RLS
--   denied: <SQLSTATE>   refused with an exception (42501 is both "permission
--                        denied" from a grant and "violates row-level security
--                        policy" from a WITH CHECK; PVxxx are schema.sql's own)
--   error: <SQLSTATE>    the probe failed for some other reason. This always
--                        FAILs: it means the check proved nothing.
-- An expected `denied: ...` PASSes on any form of denial, because a refusal
-- that arrives as an exception instead of as zero rows is still a refusal;
-- `actual` shows which form it took. An expected `allowed: ...` must match
-- exactly.
--
-- KNOWN FAILS AT THE TIME OF WRITING (2026-10-08). Two checks expect behaviour
-- the current schema.sql does not give, on purpose, so they show FAIL until a
-- decision is made. Each carries a `note`:
--   * reports: a user can file a report that is already closed and names
--     someone else as its reviewer. "users can create reports" checks only
--     reporter_id. Too permissive.
--   * reactions: switching your own like to a dislike is refused. The app does
--     it with an upsert (toggleReactionAction), whose conflict path is an
--     UPDATE, and reactions has no UPDATE policy. Too restrictive: an app bug,
--     not a hole.
-- Tested 2026-10-08 against a local supabase/postgres 17.6.1.166 image with
-- schema.sql applied: 140 checks, 138 PASS, those 2 FAIL. Not yet run against
-- the live database.
--
-- FIXTURES. Every fixture id comes from pg_temp.id('<key>') and every invite or
-- ballot hash from pg_temp.h('<key>'). An unknown key raises instead of
-- quietly matching nothing, so a typo cannot turn a check into a false
-- "denied: 0 rows". Keys: A, B (the users), and for each user X:
--   X_post, X_poll, X_opt1, X_opt2   a post with an open poll and two options
--   X_vote      X's signed-in vote on the OTHER user's open poll
--   X_ballot    an anonymous (participant_hash) ballot on X's own open poll
--   X_invite_post, X_invite_poll, X_invite_opt1, X_invite_opt2
--               a post with an invite-mode poll, no ballots yet
--   X_invite1, X_invite2   two unused invites on that poll (hash keys)
--   X_plain_post           a post with no poll
--   X_reaction, X_repost   X's like and repost of the other user's X_post
--   X_report               X's report of the other user's post
--   X_notification         a notification addressed to X
-- Impersonation follows Supabase's documented pattern: `set local role` plus
-- request.jwt.claims. request.jwt.claim.sub is set too, because auth.uid()
-- reads that older setting first.

begin;

------------------------------------------------------------------------------
-- Helpers. All temporary, all gone at ROLLBACK.
------------------------------------------------------------------------------

create temp table rls_results (
  seq integer not null,
  area text not null,
  actor text not null,
  check_name text not null,
  expected text not null,
  actual text not null,
  result text not null,
  note text
) on commit drop;

-- The probes run as anon and authenticated, and record their own outcome.
grant select, insert on pg_temp.rls_results to anon, authenticated;

create function pg_temp.id(p_key text)
returns uuid
language plpgsql
immutable
as $f$
declare
  v_prefix text;
  v_suffix text;
begin
  v_prefix := case split_part(p_key, '_', 1)
    when 'A' then 'aaaaaaaa'
    when 'B' then 'bbbbbbbb'
  end;

  v_suffix := case substr(p_key, 3)
    when '' then '000000000000'
    when 'post' then '000000000001'
    when 'poll' then '000000000002'
    when 'opt1' then '000000000003'
    when 'opt2' then '000000000004'
    when 'vote' then '000000000005'
    when 'ballot' then '000000000006'
    when 'invite_post' then '000000000011'
    when 'invite_poll' then '000000000012'
    when 'invite_opt1' then '000000000013'
    when 'invite_opt2' then '000000000014'
    when 'plain_post' then '000000000021'
    when 'reaction' then '000000000031'
    when 'repost' then '000000000032'
    when 'report' then '000000000033'
    when 'notification' then '000000000041'
  end;

  if v_prefix is null or v_suffix is null then
    raise exception 'verify-rls.sql: unknown fixture key %', p_key;
  end if;

  return (v_prefix || '-0000-4000-8000-' || v_suffix)::uuid;
end;
$f$;

create function pg_temp.h(p_key text)
returns text
language plpgsql
immutable
as $f$
begin
  if p_key not in (
    'A_invite1', 'A_invite2', 'A_ballot',
    'B_invite1', 'B_invite2', 'B_ballot'
  ) then
    raise exception 'verify-rls.sql: unknown hash key %', p_key;
  end if;

  return encode(sha256(convert_to('verify-rls ' || p_key, 'UTF8')), 'hex');
end;
$f$;

create function pg_temp.record_check(
  p_area text,
  p_check text,
  p_expected text,
  p_actual text,
  p_note text
)
returns void
language plpgsql
as $f$
declare
  v_actor text;
begin
  v_actor := case
    when current_user = 'anon' then 'anon'
    when current_user = 'authenticated' then
      case auth.uid()
        when pg_temp.id('A') then 'A'
        when pg_temp.id('B') then 'B'
        else 'authenticated (no sub)'
      end
    else 'owner'
  end;

  insert into pg_temp.rls_results
    (seq, area, actor, check_name, expected, actual, result, note)
  values (
    (select coalesce(max(r.seq), 0) + 1 from pg_temp.rls_results as r),
    p_area,
    v_actor,
    p_check,
    p_expected,
    p_actual,
    case
      when p_actual like 'error:%' then 'FAIL'
      when p_expected like 'denied%' and p_actual like 'denied%' then 'PASS'
      when p_expected = p_actual then 'PASS'
      else 'FAIL'
    end,
    p_note
  );
end;
$f$;

-- A read probe: how many rows of p_sql the current role can see.
create function pg_temp.expect_read(
  p_area text,
  p_check text,
  p_expected text,
  p_sql text,
  p_note text default null
)
returns void
language plpgsql
as $f$
declare
  v_n bigint;
  v_actual text;
begin
  begin
    execute format('select count(*) from (%s) as probe', p_sql) into v_n;
    v_actual := case
      when v_n = 0 then 'denied: 0 visible'
      else format('allowed: %s visible', v_n)
    end;
  exception
    when insufficient_privilege then
      v_actual := 'denied: 42501 ' || left(sqlerrm, 90);
    when others then
      v_actual := 'error: ' || sqlstate || ' ' || left(sqlerrm, 120);
  end;

  perform pg_temp.record_check(p_area, p_check, p_expected, v_actual, p_note);
end;
$f$;

-- A write probe: runs p_sql, records what happened, then undoes it. The
-- deliberate RLSRB exception rolls the probe's subtransaction back whether it
-- succeeded or not, so each probe sees exactly the fixtures and nothing a
-- previous probe did. SQLSTATEs listed in p_deny count as a refusal; any other
-- exception is an error and FAILs.
create function pg_temp.expect_write(
  p_area text,
  p_check text,
  p_expected text,
  p_sql text,
  p_deny text[] default array['42501'],
  p_note text default null
)
returns void
language plpgsql
as $f$
declare
  v_n bigint;
  v_actual text;
begin
  begin
    execute p_sql;
    get diagnostics v_n = row_count;
    v_actual := case
      when v_n = 0 then 'denied: 0 rows'
      else format('allowed: %s rows', v_n)
    end;
    raise exception 'undo probe' using errcode = 'RLSRB';
  exception
    when sqlstate 'RLSRB' then
      null;
    when others then
      if sqlstate = any (p_deny) then
        v_actual := 'denied: ' || sqlstate || ' ' || left(sqlerrm, 90);
      else
        v_actual := 'error: ' || sqlstate || ' ' || left(sqlerrm, 120);
      end if;
  end;

  perform pg_temp.record_check(p_area, p_check, p_expected, v_actual, p_note);
end;
$f$;

grant execute on function pg_temp.id(text) to anon, authenticated;
grant execute on function pg_temp.h(text) to anon, authenticated;
grant execute on function pg_temp.record_check(text, text, text, text, text)
  to anon, authenticated;
grant execute on function pg_temp.expect_read(text, text, text, text, text)
  to anon, authenticated;
grant execute on function pg_temp.expect_write(text, text, text, text, text[], text)
  to anon, authenticated;

------------------------------------------------------------------------------
-- Fixtures, inserted as the owner (the table owner bypasses RLS). The same
-- auth.users columns verify.sql uses; on_auth_user_created makes the profiles.
------------------------------------------------------------------------------

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
) values
  (pg_temp.id('A'), '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'rls_a@example.test', '',
   now(), now(), '{}'::jsonb, jsonb_build_object('display_name', 'RLS User A')),
  (pg_temp.id('B'), '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'rls_b@example.test', '',
   now(), now(), '{}'::jsonb, jsonb_build_object('display_name', 'RLS User B'));

insert into public.posts (id, author_id, body) values
  (pg_temp.id('A_post'), pg_temp.id('A'), 'verify-rls: A post with an open poll'),
  (pg_temp.id('A_invite_post'), pg_temp.id('A'), 'verify-rls: A post with an invite poll'),
  (pg_temp.id('A_plain_post'), pg_temp.id('A'), 'verify-rls: A plain post'),
  (pg_temp.id('B_post'), pg_temp.id('B'), 'verify-rls: B post with an open poll'),
  (pg_temp.id('B_invite_post'), pg_temp.id('B'), 'verify-rls: B post with an invite poll'),
  (pg_temp.id('B_plain_post'), pg_temp.id('B'), 'verify-rls: B plain post');

insert into public.polls (id, post_id, question, participation_mode) values
  (pg_temp.id('A_poll'), pg_temp.id('A_post'), 'verify-rls A open?', 'open'),
  (pg_temp.id('A_invite_poll'), pg_temp.id('A_invite_post'), 'verify-rls A invite?', 'invite'),
  (pg_temp.id('B_poll'), pg_temp.id('B_post'), 'verify-rls B open?', 'open'),
  (pg_temp.id('B_invite_poll'), pg_temp.id('B_invite_post'), 'verify-rls B invite?', 'invite');

insert into public.poll_options (id, poll_id, label, position) values
  (pg_temp.id('A_opt1'), pg_temp.id('A_poll'), 'A one', 1),
  (pg_temp.id('A_opt2'), pg_temp.id('A_poll'), 'A two', 2),
  (pg_temp.id('A_invite_opt1'), pg_temp.id('A_invite_poll'), 'A invite one', 1),
  (pg_temp.id('A_invite_opt2'), pg_temp.id('A_invite_poll'), 'A invite two', 2),
  (pg_temp.id('B_opt1'), pg_temp.id('B_poll'), 'B one', 1),
  (pg_temp.id('B_opt2'), pg_temp.id('B_poll'), 'B two', 2),
  (pg_temp.id('B_invite_opt1'), pg_temp.id('B_invite_poll'), 'B invite one', 1),
  (pg_temp.id('B_invite_opt2'), pg_temp.id('B_invite_poll'), 'B invite two', 2);

-- Signed-in votes cross over: A on B's poll, B on A's poll.
insert into public.poll_votes (id, poll_id, option_id, voter_id) values
  (pg_temp.id('A_vote'), pg_temp.id('B_poll'), pg_temp.id('B_opt1'), pg_temp.id('A')),
  (pg_temp.id('B_vote'), pg_temp.id('A_poll'), pg_temp.id('A_opt1'), pg_temp.id('B'));

-- Anonymous ballots, shaped as cast_anonymous_vote leaves them in open mode: a
-- used participant row and a ballot carrying the same hash.
insert into public.poll_participants (poll_id, token_hash, used_at) values
  (pg_temp.id('A_poll'), pg_temp.h('A_ballot'), now()),
  (pg_temp.id('B_poll'), pg_temp.h('B_ballot'), now());

insert into public.poll_votes (id, poll_id, option_id, participant_hash) values
  (pg_temp.id('A_ballot'), pg_temp.id('A_poll'), pg_temp.id('A_opt2'), pg_temp.h('A_ballot')),
  (pg_temp.id('B_ballot'), pg_temp.id('B_poll'), pg_temp.id('B_opt2'), pg_temp.h('B_ballot'));

-- Two unused invites on each invite poll. Those polls have no ballots, so their
-- mode can still change, which keeps the mode-change probes about RLS rather
-- than about the PV007 freeze.
insert into public.poll_participants (poll_id, token_hash, label) values
  (pg_temp.id('A_invite_poll'), pg_temp.h('A_invite1'), 'A guest one'),
  (pg_temp.id('A_invite_poll'), pg_temp.h('A_invite2'), 'A guest two'),
  (pg_temp.id('B_invite_poll'), pg_temp.h('B_invite1'), 'B guest one'),
  (pg_temp.id('B_invite_poll'), pg_temp.h('B_invite2'), 'B guest two');

insert into public.reactions (id, post_id, user_id, reaction_type) values
  (pg_temp.id('A_reaction'), pg_temp.id('B_post'), pg_temp.id('A'), 'like'),
  (pg_temp.id('B_reaction'), pg_temp.id('A_post'), pg_temp.id('B'), 'like');

insert into public.reposts (id, post_id, user_id) values
  (pg_temp.id('A_repost'), pg_temp.id('B_post'), pg_temp.id('A')),
  (pg_temp.id('B_repost'), pg_temp.id('A_post'), pg_temp.id('B'));

insert into public.reports (id, reporter_id, target_type, target_post_id, reason) values
  (pg_temp.id('A_report'), pg_temp.id('A'), 'post', pg_temp.id('B_post'), 'verify-rls A report'),
  (pg_temp.id('B_report'), pg_temp.id('B'), 'post', pg_temp.id('A_post'), 'verify-rls B report');

-- 'verify_rls' is outside both notification dedupe indexes.
insert into public.notifications (id, recipient_id, actor_id, type, payload) values
  (pg_temp.id('A_notification'), pg_temp.id('A'), pg_temp.id('B'), 'verify_rls',
   jsonb_build_object('fixture', 'A')),
  (pg_temp.id('B_notification'), pg_temp.id('B'), pg_temp.id('A'), 'verify_rls',
   jsonb_build_object('fixture', 'B'));

------------------------------------------------------------------------------
-- Setup, as the owner: the fixtures every probe below relies on are in place.
------------------------------------------------------------------------------

do $$
begin
  perform pg_temp.expect_read('setup', 'trigger created both profiles', 'allowed: 2 visible',
    $q$select 1 from public.profiles where user_id in (pg_temp.id('A'), pg_temp.id('B'))$q$);
  perform pg_temp.expect_read('setup', 'posts', 'allowed: 6 visible',
    $q$select 1 from public.posts where author_id in (pg_temp.id('A'), pg_temp.id('B'))$q$);
  perform pg_temp.expect_read('setup', 'polls', 'allowed: 4 visible',
    $q$select 1 from public.polls where id in (pg_temp.id('A_poll'), pg_temp.id('A_invite_poll'), pg_temp.id('B_poll'), pg_temp.id('B_invite_poll'))$q$);
  perform pg_temp.expect_read('setup', 'poll options', 'allowed: 8 visible',
    $q$select 1 from public.poll_options where poll_id in (pg_temp.id('A_poll'), pg_temp.id('A_invite_poll'), pg_temp.id('B_poll'), pg_temp.id('B_invite_poll'))$q$);
  perform pg_temp.expect_read('setup', 'ballots (2 signed-in, 2 anonymous)', 'allowed: 4 visible',
    $q$select 1 from public.poll_votes where id in (pg_temp.id('A_vote'), pg_temp.id('B_vote'), pg_temp.id('A_ballot'), pg_temp.id('B_ballot'))$q$);
  perform pg_temp.expect_read('setup', 'poll participants (4 invites, 2 used)', 'allowed: 6 visible',
    $q$select 1 from public.poll_participants where poll_id in (pg_temp.id('A_poll'), pg_temp.id('A_invite_poll'), pg_temp.id('B_poll'), pg_temp.id('B_invite_poll'))$q$);
  perform pg_temp.expect_read('setup', 'reactions, reposts, reports', 'allowed: 6 visible',
    $q$select id from public.reactions where id in (pg_temp.id('A_reaction'), pg_temp.id('B_reaction'))
       union all select id from public.reposts where id in (pg_temp.id('A_repost'), pg_temp.id('B_repost'))
       union all select id from public.reports where id in (pg_temp.id('A_report'), pg_temp.id('B_report'))$q$);
  perform pg_temp.expect_read('setup', 'notifications', 'allowed: 2 visible',
    $q$select 1 from public.notifications where id in (pg_temp.id('A_notification'), pg_temp.id('B_notification'))$q$);
end
$$;

------------------------------------------------------------------------------
-- As user A.
------------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
         json_build_object('sub', pg_temp.id('A'), 'role', 'authenticated')::text, true),
       set_config('request.jwt.claim.sub', pg_temp.id('A')::text, true);

do $$
begin
  -- profiles: public to read, self-service columns only, no deletes.
  perform pg_temp.expect_read('profiles', 'A reads B''s profile', 'allowed: 1 visible',
    $q$select 1 from public.profiles where user_id = pg_temp.id('B')$q$,
    p_note => 'public by design: "profiles are public to read"');
  perform pg_temp.expect_write('profiles', 'A edits B''s display_name', 'denied: 0 rows',
    $q$update public.profiles set display_name = 'hijacked' where user_id = pg_temp.id('B')$q$);
  perform pg_temp.expect_write('profiles', 'A sets B''s role', 'denied: 42501',
    $q$update public.profiles set role = 'user' where user_id = pg_temp.id('B')$q$);
  perform pg_temp.expect_write('profiles', 'A deletes B''s profile', 'denied: 0 rows',
    $q$delete from public.profiles where user_id = pg_temp.id('B')$q$);
  perform pg_temp.expect_write('profiles', 'A upserts a profile as B (the onboarding path)', 'denied: 42501',
    $q$insert into public.profiles (user_id, username, display_name)
       values (pg_temp.id('B'), 'rls_hijack', 'hijacked')
       on conflict (user_id) do update
         set user_id = excluded.user_id,
             username = excluded.username,
             display_name = excluded.display_name$q$);
  perform pg_temp.expect_write('profiles', 'A re-keys own profile to B''s user_id', 'denied: 42501',
    $q$update public.profiles set user_id = pg_temp.id('B') where user_id = pg_temp.id('A')$q$);
  perform pg_temp.expect_write('profiles', 'A promotes self to admin', 'denied: 42501',
    $q$update public.profiles set role = 'admin' where user_id = pg_temp.id('A')$q$);
  perform pg_temp.expect_write('profiles', 'A clears own is_suspended', 'denied: 42501',
    $q$update public.profiles set is_suspended = false where user_id = pg_temp.id('A')$q$);
  perform pg_temp.expect_write('profiles', 'control: A edits own display_name', 'allowed: 1 rows',
    $q$update public.profiles set display_name = 'RLS User A edited' where user_id = pg_temp.id('A')$q$);
  perform pg_temp.expect_write('profiles', 'control: A upserts own profile as onboarding does', 'allowed: 1 rows',
    $q$insert into public.profiles (user_id, username, display_name, bio, interests, onboarded_at)
       values (pg_temp.id('A'), 'rls_user_a', 'RLS User A', null, '{}', now())
       on conflict (user_id) do update
         set user_id = excluded.user_id,
             username = excluded.username,
             display_name = excluded.display_name,
             bio = excluded.bio,
             interests = excluded.interests,
             onboarded_at = excluded.onboarded_at$q$);

  -- posts: public to read, author-only writes.
  perform pg_temp.expect_read('posts', 'A reads B''s post', 'allowed: 1 visible',
    $q$select 1 from public.posts where id = pg_temp.id('B_post')$q$,
    p_note => 'public by design');
  perform pg_temp.expect_write('posts', 'A edits B''s post', 'denied: 0 rows',
    $q$update public.posts set body = 'hijacked' where id = pg_temp.id('B_post')$q$);
  perform pg_temp.expect_write('posts', 'A deletes B''s post', 'denied: 0 rows',
    $q$delete from public.posts where id = pg_temp.id('B_post')$q$);
  perform pg_temp.expect_write('posts', 'A posts as B', 'denied: 42501',
    $q$insert into public.posts (author_id, body) values (pg_temp.id('B'), 'forged')$q$);
  perform pg_temp.expect_write('posts', 'A hands own post to B', 'denied: 42501',
    $q$update public.posts set author_id = pg_temp.id('B') where id = pg_temp.id('A_plain_post')$q$);
  perform pg_temp.expect_write('posts', 'control: A creates a post', 'allowed: 1 rows',
    $q$insert into public.posts (author_id, body) values (pg_temp.id('A'), 'verify-rls new post')$q$);
  perform pg_temp.expect_write('posts', 'control: A edits own post', 'allowed: 1 rows',
    $q$update public.posts set body = 'edited' where id = pg_temp.id('A_plain_post')$q$);
  perform pg_temp.expect_write('posts', 'control: A deletes own post', 'allowed: 1 rows',
    $q$delete from public.posts where id = pg_temp.id('A_plain_post')$q$);

  -- polls: public to read; insert on your own post; update participation_mode only.
  perform pg_temp.expect_read('polls', 'A reads B''s poll', 'allowed: 1 visible',
    $q$select 1 from public.polls where id = pg_temp.id('B_poll')$q$,
    p_note => 'public by design');
  perform pg_temp.expect_write('polls', 'A attaches a poll to B''s post', 'denied: 42501',
    $q$insert into public.polls (post_id, question) values (pg_temp.id('B_plain_post'), 'forged?')$q$);
  perform pg_temp.expect_write('polls', 'A changes the mode of B''s poll', 'denied: 0 rows',
    $q$update public.polls set participation_mode = 'open' where id = pg_temp.id('B_invite_poll')$q$);
  perform pg_temp.expect_write('polls', 'A rewrites B''s poll question', 'denied: 42501',
    $q$update public.polls set question = 'hijacked?' where id = pg_temp.id('B_poll')$q$);
  perform pg_temp.expect_write('polls', 'A deletes B''s poll', 'denied: 0 rows',
    $q$delete from public.polls where id = pg_temp.id('B_poll')$q$);
  perform pg_temp.expect_write('polls', 'A rewrites own poll question (column not granted)', 'denied: 42501',
    $q$update public.polls set question = 'edited?' where id = pg_temp.id('A_poll')$q$);
  perform pg_temp.expect_write('polls', 'control: A adds a poll to own post', 'allowed: 1 rows',
    $q$insert into public.polls (post_id, question) values (pg_temp.id('A_plain_post'), 'verify-rls new?')$q$);
  perform pg_temp.expect_write('polls', 'control: A changes own vote-less poll''s mode', 'allowed: 1 rows',
    $q$update public.polls set participation_mode = 'open' where id = pg_temp.id('A_invite_poll')$q$);

  -- poll_options: public to read; insert by the poll's author; no edits.
  perform pg_temp.expect_write('poll_options', 'A adds an option to B''s poll', 'denied: 42501',
    $q$insert into public.poll_options (poll_id, label, position) values (pg_temp.id('B_poll'), 'forged', 9)$q$);
  perform pg_temp.expect_write('poll_options', 'A relabels B''s option', 'denied: 0 rows',
    $q$update public.poll_options set label = 'hijacked' where id = pg_temp.id('B_opt1')$q$);
  perform pg_temp.expect_write('poll_options', 'A deletes B''s option', 'denied: 0 rows',
    $q$delete from public.poll_options where id = pg_temp.id('B_opt1')$q$);
  perform pg_temp.expect_write('poll_options', 'control: A adds an option to own poll', 'allowed: 1 rows',
    $q$insert into public.poll_options (poll_id, label, position) values (pg_temp.id('A_poll'), 'A three', 3)$q$);

  -- poll_votes: you see only your own signed-in ballot; anonymous ballots and
  -- their participant_hash are nobody's to read; ballots are immutable.
  perform pg_temp.expect_read('poll_votes', 'A reads B''s signed-in vote', 'denied: 0 visible',
    $q$select 1 from public.poll_votes where id = pg_temp.id('B_vote')$q$);
  perform pg_temp.expect_read('poll_votes', 'A, as author of A_poll, reads its ballots (B''s + 1 anonymous)', 'denied: 0 visible',
    $q$select 1 from public.poll_votes where poll_id = pg_temp.id('A_poll')$q$);
  perform pg_temp.expect_read('poll_votes', 'A reads anonymous ballots on B''s poll', 'denied: 0 visible',
    $q$select 1 from public.poll_votes where poll_id = pg_temp.id('B_poll') and voter_id is null$q$);
  perform pg_temp.expect_read('poll_votes', 'A selects participant_hash', 'denied: 42501',
    $q$select participant_hash from public.poll_votes$q$);
  perform pg_temp.expect_read('poll_votes', 'A selects created_at', 'denied: 42501',
    $q$select created_at from public.poll_votes$q$);
  perform pg_temp.expect_write('poll_votes', 'A changes B''s vote', 'denied: 0 rows',
    $q$update public.poll_votes set option_id = pg_temp.id('A_opt2') where id = pg_temp.id('B_vote')$q$);
  perform pg_temp.expect_write('poll_votes', 'A deletes B''s vote', 'denied: 0 rows',
    $q$delete from public.poll_votes where id = pg_temp.id('B_vote')$q$);
  perform pg_temp.expect_write('poll_votes', 'A changes an anonymous ballot on B''s poll', 'denied: 0 rows',
    $q$update public.poll_votes set option_id = pg_temp.id('B_opt1') where id = pg_temp.id('B_ballot')$q$);
  perform pg_temp.expect_write('poll_votes', 'A deletes an anonymous ballot on B''s poll', 'denied: 0 rows',
    $q$delete from public.poll_votes where id = pg_temp.id('B_ballot')$q$);
  perform pg_temp.expect_write('poll_votes', 'A votes as B', 'denied: 42501',
    $q$insert into public.poll_votes (poll_id, option_id, voter_id)
       values (pg_temp.id('B_poll'), pg_temp.id('B_opt1'), pg_temp.id('B'))$q$);
  perform pg_temp.expect_write('poll_votes', 'A inserts an anonymous ballot directly', 'denied: 42501',
    $q$insert into public.poll_votes (poll_id, option_id, participant_hash)
       values (pg_temp.id('B_poll'), pg_temp.id('B_opt1'), repeat('9', 64))$q$);
  perform pg_temp.expect_write('poll_votes', 'A changes own vote (immutable by design)', 'denied: 0 rows',
    $q$update public.poll_votes set option_id = pg_temp.id('B_opt2') where id = pg_temp.id('A_vote')$q$);
  perform pg_temp.expect_write('poll_votes', 'A deletes own vote (immutable by design)', 'denied: 0 rows',
    $q$delete from public.poll_votes where id = pg_temp.id('A_vote')$q$);
  perform pg_temp.expect_read('poll_votes', 'control: A reads own vote', 'allowed: 1 visible',
    $q$select id, poll_id, option_id, voter_id from public.poll_votes where id = pg_temp.id('A_vote')$q$);
  perform pg_temp.expect_write('poll_votes', 'control: A votes as self', 'allowed: 1 rows',
    $q$insert into public.poll_votes (poll_id, option_id, voter_id)
       values (pg_temp.id('A_poll'), pg_temp.id('A_opt1'), pg_temp.id('A'))$q$);

  -- poll_participants: the poll author's invite list, read/relabel/revoke only.
  perform pg_temp.expect_read('poll_participants', 'A reads B''s invite list', 'denied: 0 visible',
    $q$select 1 from public.poll_participants where poll_id = pg_temp.id('B_invite_poll')$q$);
  perform pg_temp.expect_read('poll_participants', 'A reads B''s open-poll participants', 'denied: 0 visible',
    $q$select 1 from public.poll_participants where poll_id = pg_temp.id('B_poll')$q$);
  perform pg_temp.expect_write('poll_participants', 'A relabels B''s invite', 'denied: 0 rows',
    $q$update public.poll_participants set label = 'hijacked'
       where poll_id = pg_temp.id('B_invite_poll') and token_hash = pg_temp.h('B_invite1')$q$);
  perform pg_temp.expect_write('poll_participants', 'A revokes B''s unused invite', 'denied: 0 rows',
    $q$delete from public.poll_participants
       where poll_id = pg_temp.id('B_invite_poll') and token_hash = pg_temp.h('B_invite1')$q$);
  perform pg_temp.expect_write('poll_participants', 'A adds an invite to B''s poll', 'denied: 42501',
    $q$insert into public.poll_participants (poll_id, token_hash)
       values (pg_temp.id('B_invite_poll'), repeat('9', 64))$q$);
  perform pg_temp.expect_write('poll_participants', 'A stamps used_at on B''s invite', 'denied: 42501',
    $q$update public.poll_participants set used_at = now()
       where poll_id = pg_temp.id('B_invite_poll') and token_hash = pg_temp.h('B_invite1')$q$);
  perform pg_temp.expect_write('poll_participants', 'A issues invites on B''s poll (RPC)', 'denied: PV008',
    $q$select * from public.issue_poll_invites(pg_temp.id('B_invite_poll'), array['intruder'])$q$,
    p_deny => array['PV008']);
  perform pg_temp.expect_write('poll_participants', 'A inserts an invite directly on own poll', 'denied: 42501',
    $q$insert into public.poll_participants (poll_id, token_hash)
       values (pg_temp.id('A_invite_poll'), repeat('9', 64))$q$);
  perform pg_temp.expect_write('poll_participants', 'A clears used_at on own used participant', 'denied: 42501',
    $q$update public.poll_participants set used_at = null
       where poll_id = pg_temp.id('A_poll') and token_hash = pg_temp.h('A_ballot')$q$);
  perform pg_temp.expect_read('poll_participants', 'control: A reads own invite list', 'allowed: 2 visible',
    $q$select 1 from public.poll_participants where poll_id = pg_temp.id('A_invite_poll')$q$);
  perform pg_temp.expect_write('poll_participants', 'control: A relabels own invite', 'allowed: 1 rows',
    $q$update public.poll_participants set label = 'A guest renamed'
       where poll_id = pg_temp.id('A_invite_poll') and token_hash = pg_temp.h('A_invite1')$q$);
  perform pg_temp.expect_write('poll_participants', 'control: A revokes own unused invite', 'allowed: 1 rows',
    $q$delete from public.poll_participants
       where poll_id = pg_temp.id('A_invite_poll') and token_hash = pg_temp.h('A_invite1')$q$);
  perform pg_temp.expect_write('poll_participants', 'control: A issues an invite on own poll (RPC)', 'allowed: 1 rows',
    $q$select * from public.issue_poll_invites(pg_temp.id('A_invite_poll'), array['verify-rls'])$q$);

  -- reactions: public to read; insert and delete as yourself.
  perform pg_temp.expect_read('reactions', 'A reads B''s reaction', 'allowed: 1 visible',
    $q$select 1 from public.reactions where id = pg_temp.id('B_reaction')$q$,
    p_note => 'public by design');
  perform pg_temp.expect_write('reactions', 'A flips B''s reaction', 'denied: 0 rows',
    $q$update public.reactions set reaction_type = 'dislike' where id = pg_temp.id('B_reaction')$q$);
  perform pg_temp.expect_write('reactions', 'A removes B''s reaction', 'denied: 0 rows',
    $q$delete from public.reactions where id = pg_temp.id('B_reaction')$q$);
  perform pg_temp.expect_write('reactions', 'A reacts as B', 'denied: 42501',
    $q$insert into public.reactions (post_id, user_id, reaction_type)
       values (pg_temp.id('A_plain_post'), pg_temp.id('B'), 'like')$q$);
  perform pg_temp.expect_write('reactions', 'control: A reacts', 'allowed: 1 rows',
    $q$insert into public.reactions (post_id, user_id, reaction_type)
       values (pg_temp.id('B_plain_post'), pg_temp.id('A'), 'like')$q$);
  perform pg_temp.expect_write('reactions', 'control: A removes own reaction', 'allowed: 1 rows',
    $q$delete from public.reactions where id = pg_temp.id('A_reaction')$q$);
  perform pg_temp.expect_write('reactions', 'control: A switches own like to dislike (app upsert)', 'allowed: 1 rows',
    $q$insert into public.reactions (post_id, user_id, reaction_type)
       values (pg_temp.id('B_post'), pg_temp.id('A'), 'dislike')
       on conflict (post_id, user_id) do update
         set post_id = excluded.post_id,
             user_id = excluded.user_id,
             reaction_type = excluded.reaction_type$q$,
    p_note => 'KNOWN FAIL (too restrictive): toggleReactionAction upserts; reactions has no UPDATE policy, so the switch is refused');

  -- reposts: public to read; insert and delete as yourself.
  perform pg_temp.expect_read('reposts', 'A reads B''s repost', 'allowed: 1 visible',
    $q$select 1 from public.reposts where id = pg_temp.id('B_repost')$q$,
    p_note => 'public by design');
  perform pg_temp.expect_write('reposts', 'A removes B''s repost', 'denied: 0 rows',
    $q$delete from public.reposts where id = pg_temp.id('B_repost')$q$);
  perform pg_temp.expect_write('reposts', 'A reposts as B', 'denied: 42501',
    $q$insert into public.reposts (post_id, user_id) values (pg_temp.id('A_plain_post'), pg_temp.id('B'))$q$);
  perform pg_temp.expect_write('reposts', 'control: A reposts', 'allowed: 1 rows',
    $q$insert into public.reposts (post_id, user_id) values (pg_temp.id('B_plain_post'), pg_temp.id('A'))$q$);
  perform pg_temp.expect_write('reposts', 'control: A removes own repost', 'allowed: 1 rows',
    $q$delete from public.reposts where id = pg_temp.id('A_repost')$q$);

  -- reports: anyone signed in files as themselves; only staff read or update.
  perform pg_temp.expect_read('reports', 'A reads B''s report', 'denied: 0 visible',
    $q$select 1 from public.reports where id = pg_temp.id('B_report')$q$);
  perform pg_temp.expect_write('reports', 'A closes B''s report', 'denied: 0 rows',
    $q$update public.reports set status = 'closed' where id = pg_temp.id('B_report')$q$);
  perform pg_temp.expect_write('reports', 'A deletes B''s report', 'denied: 0 rows',
    $q$delete from public.reports where id = pg_temp.id('B_report')$q$);
  perform pg_temp.expect_write('reports', 'A files a report as B', 'denied: 42501',
    $q$insert into public.reports (reporter_id, target_type, target_post_id, reason)
       values (pg_temp.id('B'), 'post', pg_temp.id('A_plain_post'), 'forged')$q$);
  perform pg_temp.expect_read('reports', 'A reads own report (staff-only by design)', 'denied: 0 visible',
    $q$select 1 from public.reports where id = pg_temp.id('A_report')$q$);
  perform pg_temp.expect_write('reports', 'A files a report already closed, "reviewed" by B', 'denied: 42501',
    $q$insert into public.reports (reporter_id, target_type, target_post_id, reason, status, reviewed_by, reviewed_at)
       values (pg_temp.id('A'), 'post', pg_temp.id('B_plain_post'), 'pre-closed', 'closed', pg_temp.id('B'), now())$q$,
    p_note => 'KNOWN FAIL (too permissive): "users can create reports" checks reporter_id only, so status/reviewed_by/reviewed_at are the reporter''s to set');
  perform pg_temp.expect_write('reports', 'control: A files a report', 'allowed: 1 rows',
    $q$insert into public.reports (reporter_id, target_type, target_post_id, reason)
       values (pg_temp.id('A'), 'post', pg_temp.id('B_plain_post'), 'verify-rls')$q$);

  -- notifications: recipient reads and marks read; nothing else.
  perform pg_temp.expect_read('notifications', 'A reads B''s notification', 'denied: 0 visible',
    $q$select 1 from public.notifications where id = pg_temp.id('B_notification')$q$);
  perform pg_temp.expect_read('notifications', 'A reads any of B''s notifications', 'denied: 0 visible',
    $q$select 1 from public.notifications where recipient_id = pg_temp.id('B')$q$);
  perform pg_temp.expect_write('notifications', 'A marks B''s notification read', 'denied: 0 rows',
    $q$update public.notifications set read_at = now() where id = pg_temp.id('B_notification')$q$);
  perform pg_temp.expect_write('notifications', 'A rewrites B''s notification payload', 'denied: 42501',
    $q$update public.notifications set payload = '{}'::jsonb where id = pg_temp.id('B_notification')$q$);
  perform pg_temp.expect_write('notifications', 'A deletes B''s notification', 'denied: 0 rows',
    $q$delete from public.notifications where id = pg_temp.id('B_notification')$q$);
  perform pg_temp.expect_write('notifications', 'A sends B a notification', 'denied: 42501',
    $q$insert into public.notifications (recipient_id, actor_id, type)
       values (pg_temp.id('B'), pg_temp.id('A'), 'forged')$q$);
  perform pg_temp.expect_write('notifications', 'A rewrites own notification payload', 'denied: 42501',
    $q$update public.notifications set payload = '{}'::jsonb where id = pg_temp.id('A_notification')$q$);
  perform pg_temp.expect_read('notifications', 'control: A reads own notification', 'allowed: 1 visible',
    $q$select 1 from public.notifications where id = pg_temp.id('A_notification')$q$);
  perform pg_temp.expect_write('notifications', 'control: A marks own notification read', 'allowed: 1 rows',
    $q$update public.notifications set read_at = now()
       where id = pg_temp.id('A_notification') and recipient_id = pg_temp.id('A')$q$);

  -- Tallies are public; they are counts, never ballots.
  perform pg_temp.expect_read('poll_option_vote_counts', 'control: A reads B''s poll tallies', 'allowed: 2 visible',
    $q$select 1 from public.poll_option_vote_counts where poll_id = pg_temp.id('B_poll')$q$);
end
$$;

------------------------------------------------------------------------------
-- As anon: no session at all.
------------------------------------------------------------------------------

set local role anon;
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true),
       set_config('request.jwt.claim.sub', '', true);

do $$
begin
  perform pg_temp.expect_read('profiles', 'anon reads B''s profile', 'allowed: 1 visible',
    $q$select 1 from public.profiles where user_id = pg_temp.id('B')$q$,
    p_note => 'public by design');
  perform pg_temp.expect_write('profiles', 'anon edits B''s profile', 'denied: 42501',
    $q$update public.profiles set display_name = 'hijacked' where user_id = pg_temp.id('B')$q$);
  perform pg_temp.expect_write('profiles', 'anon deletes B''s profile', 'denied: 0 rows',
    $q$delete from public.profiles where user_id = pg_temp.id('B')$q$);
  perform pg_temp.expect_write('profiles', 'anon upserts a profile as B', 'denied: 42501',
    $q$insert into public.profiles (user_id, username, display_name)
       values (pg_temp.id('B'), 'rls_hijack', 'hijacked')
       on conflict (user_id) do update set display_name = excluded.display_name$q$);

  perform pg_temp.expect_read('posts', 'anon reads B''s post', 'allowed: 1 visible',
    $q$select 1 from public.posts where id = pg_temp.id('B_post')$q$,
    p_note => 'public by design');
  perform pg_temp.expect_write('posts', 'anon posts as B', 'denied: 42501',
    $q$insert into public.posts (author_id, body) values (pg_temp.id('B'), 'forged')$q$);
  perform pg_temp.expect_write('posts', 'anon edits B''s post', 'denied: 0 rows',
    $q$update public.posts set body = 'hijacked' where id = pg_temp.id('B_post')$q$);
  perform pg_temp.expect_write('posts', 'anon deletes B''s post', 'denied: 0 rows',
    $q$delete from public.posts where id = pg_temp.id('B_post')$q$);

  perform pg_temp.expect_read('polls', 'anon reads B''s poll', 'allowed: 1 visible',
    $q$select 1 from public.polls where id = pg_temp.id('B_poll')$q$,
    p_note => 'public by design');
  perform pg_temp.expect_write('polls', 'anon attaches a poll to B''s post', 'denied: 42501',
    $q$insert into public.polls (post_id, question) values (pg_temp.id('B_plain_post'), 'forged?')$q$);
  perform pg_temp.expect_write('polls', 'anon changes the mode of B''s poll', 'denied: 42501',
    $q$update public.polls set participation_mode = 'open' where id = pg_temp.id('B_invite_poll')$q$);
  perform pg_temp.expect_write('polls', 'anon deletes B''s poll', 'denied: 0 rows',
    $q$delete from public.polls where id = pg_temp.id('B_poll')$q$);

  perform pg_temp.expect_write('poll_options', 'anon adds an option to B''s poll', 'denied: 42501',
    $q$insert into public.poll_options (poll_id, label, position) values (pg_temp.id('B_poll'), 'forged', 9)$q$);
  perform pg_temp.expect_write('poll_options', 'anon relabels B''s option', 'denied: 0 rows',
    $q$update public.poll_options set label = 'hijacked' where id = pg_temp.id('B_opt1')$q$);
  perform pg_temp.expect_write('poll_options', 'anon deletes B''s option', 'denied: 0 rows',
    $q$delete from public.poll_options where id = pg_temp.id('B_opt1')$q$);

  perform pg_temp.expect_read('poll_votes', 'anon reads ballots on B''s poll', 'denied: 0 visible',
    $q$select 1 from public.poll_votes where poll_id = pg_temp.id('B_poll')$q$);
  perform pg_temp.expect_read('poll_votes', 'anon reads B''s signed-in vote', 'denied: 0 visible',
    $q$select 1 from public.poll_votes where id = pg_temp.id('B_vote')$q$);
  perform pg_temp.expect_read('poll_votes', 'anon selects participant_hash', 'denied: 42501',
    $q$select participant_hash from public.poll_votes$q$);
  perform pg_temp.expect_write('poll_votes', 'anon votes as B', 'denied: 42501',
    $q$insert into public.poll_votes (poll_id, option_id, voter_id)
       values (pg_temp.id('B_poll'), pg_temp.id('B_opt1'), pg_temp.id('B'))$q$);
  perform pg_temp.expect_write('poll_votes', 'anon inserts an anonymous ballot directly', 'denied: 42501',
    $q$insert into public.poll_votes (poll_id, option_id, participant_hash)
       values (pg_temp.id('B_poll'), pg_temp.id('B_opt1'), repeat('9', 64))$q$);
  perform pg_temp.expect_write('poll_votes', 'anon changes B''s vote', 'denied: 0 rows',
    $q$update public.poll_votes set option_id = pg_temp.id('A_opt2') where id = pg_temp.id('B_vote')$q$);
  perform pg_temp.expect_write('poll_votes', 'anon deletes ballots on B''s poll', 'denied: 0 rows',
    $q$delete from public.poll_votes where poll_id = pg_temp.id('B_poll')$q$);
  perform pg_temp.expect_write('poll_votes', 'anon votes on B''s invite poll without an invite (RPC)', 'denied: PV004',
    $q$select public.cast_anonymous_vote(pg_temp.id('B_invite_poll'), pg_temp.id('B_invite_opt1'), repeat('z', 40))$q$,
    p_deny => array['PV004']);
  perform pg_temp.expect_write('poll_votes', 'control: anon votes on an open poll (RPC)', 'allowed: 1 rows',
    $q$select public.cast_anonymous_vote(pg_temp.id('A_poll'), pg_temp.id('A_opt1'), repeat('z', 40))$q$);

  perform pg_temp.expect_read('poll_participants', 'anon reads B''s invite list', 'denied: 42501',
    $q$select 1 from public.poll_participants where poll_id = pg_temp.id('B_invite_poll')$q$);
  perform pg_temp.expect_write('poll_participants', 'anon relabels B''s invite', 'denied: 42501',
    $q$update public.poll_participants set label = 'hijacked' where poll_id = pg_temp.id('B_invite_poll')$q$);
  perform pg_temp.expect_write('poll_participants', 'anon revokes B''s invites', 'denied: 42501',
    $q$delete from public.poll_participants where poll_id = pg_temp.id('B_invite_poll')$q$);
  perform pg_temp.expect_write('poll_participants', 'anon adds an invite to B''s poll', 'denied: 42501',
    $q$insert into public.poll_participants (poll_id, token_hash)
       values (pg_temp.id('B_invite_poll'), repeat('9', 64))$q$);
  perform pg_temp.expect_write('poll_participants', 'anon issues invites on B''s poll (RPC)', 'denied: 42501',
    $q$select * from public.issue_poll_invites(pg_temp.id('B_invite_poll'), array['anon'])$q$);

  perform pg_temp.expect_read('reactions', 'anon reads B''s reaction', 'allowed: 1 visible',
    $q$select 1 from public.reactions where id = pg_temp.id('B_reaction')$q$,
    p_note => 'public by design');
  perform pg_temp.expect_write('reactions', 'anon reacts as B', 'denied: 42501',
    $q$insert into public.reactions (post_id, user_id, reaction_type)
       values (pg_temp.id('A_plain_post'), pg_temp.id('B'), 'like')$q$);
  perform pg_temp.expect_write('reactions', 'anon flips B''s reaction', 'denied: 0 rows',
    $q$update public.reactions set reaction_type = 'dislike' where id = pg_temp.id('B_reaction')$q$);
  perform pg_temp.expect_write('reactions', 'anon removes B''s reaction', 'denied: 0 rows',
    $q$delete from public.reactions where id = pg_temp.id('B_reaction')$q$);

  perform pg_temp.expect_read('reposts', 'anon reads B''s repost', 'allowed: 1 visible',
    $q$select 1 from public.reposts where id = pg_temp.id('B_repost')$q$,
    p_note => 'public by design');
  perform pg_temp.expect_write('reposts', 'anon reposts as B', 'denied: 42501',
    $q$insert into public.reposts (post_id, user_id) values (pg_temp.id('A_plain_post'), pg_temp.id('B'))$q$);
  perform pg_temp.expect_write('reposts', 'anon removes B''s repost', 'denied: 0 rows',
    $q$delete from public.reposts where id = pg_temp.id('B_repost')$q$);

  perform pg_temp.expect_read('reports', 'anon reads B''s report', 'denied: 0 visible',
    $q$select 1 from public.reports where id = pg_temp.id('B_report')$q$);
  perform pg_temp.expect_write('reports', 'anon files a report as B', 'denied: 42501',
    $q$insert into public.reports (reporter_id, target_type, target_post_id, reason)
       values (pg_temp.id('B'), 'post', pg_temp.id('A_plain_post'), 'forged')$q$);
  perform pg_temp.expect_write('reports', 'anon closes B''s report', 'denied: 0 rows',
    $q$update public.reports set status = 'closed' where id = pg_temp.id('B_report')$q$);
  perform pg_temp.expect_write('reports', 'anon deletes B''s report', 'denied: 0 rows',
    $q$delete from public.reports where id = pg_temp.id('B_report')$q$);

  perform pg_temp.expect_read('notifications', 'anon reads B''s notification', 'denied: 0 visible',
    $q$select 1 from public.notifications where id = pg_temp.id('B_notification')$q$);
  perform pg_temp.expect_write('notifications', 'anon marks B''s notification read', 'denied: 42501',
    $q$update public.notifications set read_at = now() where id = pg_temp.id('B_notification')$q$);
  perform pg_temp.expect_write('notifications', 'anon deletes B''s notification', 'denied: 0 rows',
    $q$delete from public.notifications where id = pg_temp.id('B_notification')$q$);
  perform pg_temp.expect_write('notifications', 'anon sends B a notification', 'denied: 42501',
    $q$insert into public.notifications (recipient_id, type) values (pg_temp.id('B'), 'forged')$q$);

  perform pg_temp.expect_read('poll_option_vote_counts', 'control: anon reads B''s poll tallies', 'allowed: 2 visible',
    $q$select 1 from public.poll_option_vote_counts where poll_id = pg_temp.id('B_poll')$q$);
end
$$;

------------------------------------------------------------------------------
-- Back to the owner: report.
------------------------------------------------------------------------------

reset role;
select set_config('request.jwt.claims', '', true),
       set_config('request.jwt.claim.sub', '', true);

do $$
declare
  v_total integer;
  v_failed integer;
begin
  select count(*), count(*) filter (where result <> 'PASS')
    into v_total, v_failed
  from pg_temp.rls_results;

  raise notice 'verify-rls.sql: % checks, % PASS, % FAIL (everything is rolled back)',
    v_total, v_total - v_failed, v_failed;
end
$$;

-- The result grid. Row 0 is the summary; FAIL rows say what broke.
select seq, area, actor, check_name, expected, actual, result, note
from (
  select
    0 as seq,
    'summary' as area,
    '' as actor,
    'all checks' as check_name,
    '0 FAIL' as expected,
    format('%s checks: %s PASS, %s FAIL',
      count(*),
      count(*) filter (where result = 'PASS'),
      count(*) filter (where result <> 'PASS')) as actual,
    case when count(*) filter (where result <> 'PASS') = 0 then 'PASS' else 'FAIL' end as result,
    'rolled back; nothing was written' as note
  from pg_temp.rls_results
  union all
  select seq, area, actor, check_name, expected, actual, result, note
  from pg_temp.rls_results
) as report
order by seq;

rollback;

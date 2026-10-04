create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  display_name text,
  bio text,
  avatar_url text,
  interests text[] not null default '{}',
  role text not null default 'user' check (role in ('user', 'moderator', 'admin')),
  is_suspended boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists onboarded_at timestamptz;

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (user_id) on delete cascade,
  body text,
  image_url text,
  hashtags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.polls (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null unique references public.posts (id) on delete cascade,
  question text not null,
  status text not null default 'active' check (status in ('active', 'closed')),
  closes_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls (id) on delete cascade,
  label text not null,
  position integer not null,
  created_at timestamptz not null default now(),
  unique (poll_id, position)
);

create table if not exists public.poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls (id) on delete cascade,
  option_id uuid not null references public.poll_options (id) on delete cascade,
  voter_id uuid not null references public.profiles (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (poll_id, voter_id)
);

create table if not exists public.reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  reaction_type text not null check (reaction_type in ('like', 'dislike')),
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);

create table if not exists public.reposts (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (user_id) on delete cascade,
  target_type text not null check (target_type in ('post', 'user')),
  target_post_id uuid references public.posts (id) on delete cascade,
  target_user_id uuid references public.profiles (user_id) on delete cascade,
  reason text not null,
  status text not null default 'open' check (status in ('open', 'reviewed', 'closed')),
  created_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles (user_id),
  reviewed_at timestamptz,
  constraint reports_target_check check (
    (target_type = 'post' and target_post_id is not null and target_user_id is null)
    or
    (target_type = 'user' and target_user_id is not null and target_post_id is null)
  )
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (user_id) on delete cascade,
  actor_id uuid references public.profiles (user_id) on delete set null,
  post_id uuid references public.posts (id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists posts_author_id_created_at_idx
  on public.posts (author_id, created_at desc);

create index if not exists polls_post_id_idx
  on public.polls (post_id);

create index if not exists poll_votes_poll_id_idx
  on public.poll_votes (poll_id);

create index if not exists reactions_post_id_idx
  on public.reactions (post_id);

create index if not exists reposts_post_id_idx
  on public.reposts (post_id);

create index if not exists notifications_recipient_id_created_at_idx
  on public.notifications (recipient_id, created_at desc);

-- Reactions and reposts are toggleable, so a remove/re-add loop would let one
-- user flood another's inbox. Caps engagement notifications at one per actor,
-- per post, per type. report_reviewed is excluded so that a reviewed -> closed
-- transition notifies twice.
create unique index if not exists notifications_engagement_dedupe_idx
  on public.notifications (recipient_id, actor_id, post_id, type)
  where type in ('poll_vote', 'post_reaction', 'post_repost');

-- Aggregate tallies for the feed. security_invoker = false is deliberate: the
-- view runs as its owner and so bypasses the row-level policy on poll_votes,
-- exposing totals without ever exposing voter_id. This is what lets results be
-- public while ballots stay secret.
drop view if exists public.poll_option_vote_counts;
create view public.poll_option_vote_counts
with (security_invoker = false) as
select
  po.poll_id,
  po.id as option_id,
  count(pv.id) as votes
from public.poll_options as po
left join public.poll_votes as pv on pv.option_id = po.id
group by po.poll_id, po.id;

grant select on public.poll_option_vote_counts to anon, authenticated;

alter table public.posts drop constraint if exists posts_body_or_image_check;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists set_posts_updated_at on public.posts;
create trigger set_posts_updated_at
before update on public.posts
for each row
execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_username text;
  candidate_username text;
  seeded_display_name text;
begin
  base_username := regexp_replace(
    lower(coalesce(split_part(new.email, '@', 1), '')),
    '[^a-z0-9_]',
    '',
    'g'
  );

  if base_username = '' then
    base_username := 'user';
  end if;

  -- 11 + '_' + 8 = 20 characters, the maximum allowed by the
  -- profiles_username_format constraint further down this file. Widening the
  -- local-part slice without widening the constraint makes sign-up fail for
  -- anyone with a long email local part.
  candidate_username :=
    left(base_username, 11) || '_' || left(replace(new.id::text, '-', ''), 8);

  seeded_display_name := coalesce(
    new.raw_user_meta_data ->> 'display_name',
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name'
  );

  begin
    insert into public.profiles (user_id, username, display_name)
    values (new.id, candidate_username, seeded_display_name)
    on conflict (user_id) do nothing;
  exception
    when unique_violation then
      -- Username collision only. Fall back to a value that cannot collide.
      -- Deliberately not `when others`: swallowing every error would recreate
      -- the profile-less-user bug this trigger exists to prevent.
      -- 'u_' + 18 hex characters of the user's uuid = 20 characters, the
      -- maximum the profiles_username_format constraint allows.
      insert into public.profiles (user_id, username, display_name)
      values (
        new.id,
        'u_' || left(replace(new.id::text, '-', ''), 18),
        seeded_display_name
      )
      on conflict (user_id) do nothing;
  end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

-- Backfill users who signed up before the trigger existed.
insert into public.profiles (user_id, username, display_name)
select
  u.id,
  left(
    coalesce(
      nullif(
        regexp_replace(
          lower(coalesce(split_part(u.email, '@', 1), '')),
          '[^a-z0-9_]', '', 'g'
        ),
        ''
      ),
      'user'
    ),
    11
  ) || '_' || left(replace(u.id::text, '-', ''), 8),
  coalesce(
    u.raw_user_meta_data ->> 'display_name',
    u.raw_user_meta_data ->> 'full_name',
    u.raw_user_meta_data ->> 'name'
  )
from auth.users u
left join public.profiles p on p.user_id = u.id
where p.user_id is null
on conflict do nothing;

create or replace function public.notify_poll_vote()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_post uuid;
  target_author uuid;
  poll_question text;
  chosen_label text;
  actor_name text;
begin
  select p.id, p.author_id, pl.question
    into target_post, target_author, poll_question
  from public.polls as pl
  join public.posts as p on p.id = pl.post_id
  where pl.id = new.poll_id;

  if target_author is null or target_author = new.voter_id then
    return new;
  end if;

  select po.label into chosen_label
  from public.poll_options as po where po.id = new.option_id;

  select pr.username into actor_name
  from public.profiles as pr where pr.user_id = new.voter_id;

  insert into public.notifications (recipient_id, actor_id, post_id, type, payload)
  values (
    target_author, new.voter_id, target_post, 'poll_vote',
    jsonb_build_object(
      'actor_username', actor_name,
      'question', poll_question,
      'option_label', chosen_label
    )
  )
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists notify_on_poll_vote on public.poll_votes;
create trigger notify_on_poll_vote
after insert on public.poll_votes
for each row
execute function public.notify_poll_vote();

create or replace function public.notify_post_reaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_author uuid;
  actor_name text;
begin
  select p.author_id into target_author
  from public.posts as p where p.id = new.post_id;

  if target_author is null or target_author = new.user_id then
    return new;
  end if;

  select pr.username into actor_name
  from public.profiles as pr where pr.user_id = new.user_id;

  insert into public.notifications (recipient_id, actor_id, post_id, type, payload)
  values (
    target_author, new.user_id, new.post_id, 'post_reaction',
    jsonb_build_object(
      'actor_username', actor_name,
      'reaction_type', new.reaction_type
    )
  )
  on conflict do nothing;

  return new;
end;
$$;

-- INSERT only. Switching like -> dislike is an UPDATE and deliberately does
-- not re-notify.
drop trigger if exists notify_on_post_reaction on public.reactions;
create trigger notify_on_post_reaction
after insert on public.reactions
for each row
execute function public.notify_post_reaction();

create or replace function public.notify_post_repost()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_author uuid;
  actor_name text;
begin
  select p.author_id into target_author
  from public.posts as p where p.id = new.post_id;

  if target_author is null or target_author = new.user_id then
    return new;
  end if;

  select pr.username into actor_name
  from public.profiles as pr where pr.user_id = new.user_id;

  insert into public.notifications (recipient_id, actor_id, post_id, type, payload)
  values (
    target_author, new.user_id, new.post_id, 'post_repost',
    jsonb_build_object('actor_username', actor_name)
  )
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists notify_on_post_repost on public.reposts;
create trigger notify_on_post_repost
after insert on public.reposts
for each row
execute function public.notify_post_repost();

create or replace function public.notify_report_reviewed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status not in ('reviewed', 'closed') then
    return new;
  end if;

  if new.reviewed_by is null or new.reviewed_by = new.reporter_id then
    return new;
  end if;

  -- Deliberately outside the engagement dedupe index, so reviewed -> closed
  -- produces two notifications.
  insert into public.notifications (recipient_id, actor_id, post_id, type, payload)
  values (
    new.reporter_id, new.reviewed_by, new.target_post_id, 'report_reviewed',
    jsonb_build_object('status', new.status, 'target_type', new.target_type)
  );

  return new;
end;
$$;

drop trigger if exists notify_on_report_reviewed on public.reports;
create trigger notify_on_report_reviewed
after update on public.reports
for each row
execute function public.notify_report_reviewed();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'poll_options_id_poll_id_unique'
  ) then
    alter table public.poll_options
      add constraint poll_options_id_poll_id_unique unique (id, poll_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'poll_votes_option_matches_poll_fk'
  ) then
    alter table public.poll_votes
      add constraint poll_votes_option_matches_poll_fk
      foreign key (option_id, poll_id)
      references public.poll_options (id, poll_id)
      on delete cascade;
  end if;
end
$$;

-- The username is rendered as `@{username}` throughout the UI and is the
-- `/u/[username]` path segment, so a stored `@handle` renders as `@@handle` and
-- anything outside `[a-z0-9_]` is not safely linkable. `validateUsername()` in
-- `src/lib/username.ts` enforces the same rule in the app; this is the
-- backstop, because the column was previously a bare `text not null unique`.
--
-- Pre-flight: this ALTER fails if any existing row violates the pattern. Run
--   select user_id, username from public.profiles
--   where username !~ '^[a-z0-9_]{3,20}$';
-- and fix those rows before applying this file.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_username_format'
  ) then
    alter table public.profiles
      add constraint profiles_username_format
      check (username ~ '^[a-z0-9_]{3,20}$');
  end if;
end
$$;

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;
alter table public.reactions enable row level security;
alter table public.reposts enable row level security;
alter table public.reports enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "profiles are public to read" on public.profiles;
drop policy if exists "users can insert their own profile" on public.profiles;
drop policy if exists "users can update their own profile" on public.profiles;
drop policy if exists "staff can read all reports" on public.reports;
drop policy if exists "users can create reports" on public.reports;
drop policy if exists "staff can update reports" on public.reports;
drop policy if exists "posts are public to read" on public.posts;
drop policy if exists "users can create their own posts" on public.posts;
drop policy if exists "users can update their own posts" on public.posts;
drop policy if exists "users can delete their own posts" on public.posts;
drop policy if exists "polls are public to read" on public.polls;
drop policy if exists "authors can create polls for their posts" on public.polls;
drop policy if exists "poll options are public to read" on public.poll_options;
drop policy if exists "authors can create poll options" on public.poll_options;
drop policy if exists "votes are public to read" on public.poll_votes;
drop policy if exists "users can read their own votes" on public.poll_votes;
drop policy if exists "users can vote once as themselves" on public.poll_votes;
drop policy if exists "reactions are public to read" on public.reactions;
drop policy if exists "users can react as themselves" on public.reactions;
drop policy if exists "users can remove their own reactions" on public.reactions;
drop policy if exists "reposts are public to read" on public.reposts;
drop policy if exists "users can create reposts as themselves" on public.reposts;
drop policy if exists "users can remove their own reposts" on public.reposts;
drop policy if exists "users can read their notifications" on public.notifications;
drop policy if exists "users can update their notifications" on public.notifications;

create policy "profiles are public to read"
  on public.profiles
  for select
  using (true);

create policy "users can insert their own profile"
  on public.profiles
  for insert
  with check (auth.uid() = user_id);

create policy "users can update their own profile"
  on public.profiles
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- RLS policies are row-level only, and a table-level UPDATE grant covers every
-- column. Without the revoke below, the "users can update their own profile"
-- policy lets any signed-in user PATCH their own row with role = 'admin' (or
-- is_suspended = false) straight against the REST API using the public anon
-- key. Revoke the table-wide grant and hand back only the self-service columns.
revoke update on public.profiles from anon, authenticated;

grant update (user_id, username, display_name, bio, avatar_url, interests, onboarded_at)
  on public.profiles to authenticated;

create policy "staff can read all reports"
  on public.reports
  for select
  using (
    exists (
      select 1
      from public.profiles
      where user_id = auth.uid()
        and role in ('moderator', 'admin')
    )
  );

create policy "users can create reports"
  on public.reports
  for insert
  with check (auth.uid() = reporter_id);

create policy "staff can update reports"
  on public.reports
  for update
  using (
    exists (
      select 1
      from public.profiles
      where user_id = auth.uid()
        and role in ('moderator', 'admin')
    )
  );

create policy "posts are public to read"
  on public.posts
  for select
  using (true);

create policy "users can create their own posts"
  on public.posts
  for insert
  with check (auth.uid() = author_id);

create policy "users can update their own posts"
  on public.posts
  for update
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

create policy "users can delete their own posts"
  on public.posts
  for delete
  using (auth.uid() = author_id);

create policy "polls are public to read"
  on public.polls
  for select
  using (true);

create policy "authors can create polls for their posts"
  on public.polls
  for insert
  with check (
    exists (
      select 1
      from public.posts
      where posts.id = post_id
        and posts.author_id = auth.uid()
    )
  );

create policy "poll options are public to read"
  on public.poll_options
  for select
  using (true);

create policy "authors can create poll options"
  on public.poll_options
  for insert
  with check (
    exists (
      select 1
      from public.polls
      join public.posts on posts.id = polls.post_id
      where polls.id = poll_id
        and posts.author_id = auth.uid()
    )
  );

-- Ballot secrecy: voter_id must not be publicly readable. Voters can see only
-- their own row, which is all the feed needs to highlight the viewer's choice.
create policy "users can read their own votes"
  on public.poll_votes
  for select
  using (auth.uid() = voter_id);

create policy "users can vote once as themselves"
  on public.poll_votes
  for insert
  with check (auth.uid() = voter_id);

create policy "reactions are public to read"
  on public.reactions
  for select
  using (true);

create policy "users can react as themselves"
  on public.reactions
  for insert
  with check (auth.uid() = user_id);

create policy "users can remove their own reactions"
  on public.reactions
  for delete
  using (auth.uid() = user_id);

create policy "reposts are public to read"
  on public.reposts
  for select
  using (true);

create policy "users can create reposts as themselves"
  on public.reposts
  for insert
  with check (auth.uid() = user_id);

create policy "users can remove their own reposts"
  on public.reposts
  for delete
  using (auth.uid() = user_id);

create policy "users can read their notifications"
  on public.notifications
  for select
  using (auth.uid() = recipient_id);

create policy "users can update their notifications"
  on public.notifications
  for update
  using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);

-- Notifications have no INSERT policy by design: producers are SECURITY DEFINER
-- triggers. Revoking the grant is defence in depth. Marking a notification read
-- must not permit rewriting its type or payload, so UPDATE is column-scoped.
revoke insert on public.notifications from anon, authenticated;
revoke update on public.notifications from anon, authenticated;
grant update (read_at) on public.notifications to authenticated;

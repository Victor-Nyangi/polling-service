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

grant update (user_id, username, display_name, bio, avatar_url, interests)
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

create policy "votes are public to read"
  on public.poll_votes
  for select
  using (true);

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

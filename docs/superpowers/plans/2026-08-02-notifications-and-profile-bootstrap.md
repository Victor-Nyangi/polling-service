# Notifications and Profile Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create profile rows automatically at signup, and produce notification rows from database triggers, so neither feature depends on application code remembering to act.

**Architecture:** All producers are `SECURITY DEFINER` Postgres triggers declared in `supabase/schema.sql`. The `notifications` table keeps no INSERT policy, so clients can read and mark-read only. Application changes are limited to reading the new `onboarded_at` column and rendering notification copy from structured payloads.

**Tech Stack:** PostgreSQL (Supabase), Next.js 16 App Router, TypeScript, `@supabase/ssr`.

## Global Constraints

- `supabase/schema.sql` must stay idempotent and re-runnable: `create ... if not exists`, `create or replace function`, `drop trigger if exists` before every `create trigger`, `do $$` guards for constraints.
- Every trigger function is `language plpgsql`, `security definer`, `set search_path = ''`. With an empty search path, all application tables must be schema-qualified as `public.<table>`.
- No new npm dependencies.
- DB columns are `snake_case`; TypeScript is `camelCase`. Conversion happens only in `platform.ts` (reads) and `actions.ts` (writes).
- Verification gates for TypeScript changes: `npm run typecheck`, `npm run lint`, `npm run build`. All three must pass before any commit.
- SQL changes cannot be verified by those gates. They are verified by running `supabase/verify.sql` in the Supabase SQL editor.

## Deviation from the spec

The spec places `renderNotification` in `src/lib/server/platform.ts`. This plan puts it in a new `src/lib/notifications.ts` instead. Reason: it is a pure presentation function with no data-access or `server-only` dependency, and `platform.ts` is already 307 lines of query-and-map code. If you prefer it inline in `platform.ts`, say so before Task 6 — nothing else in the plan changes.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `supabase/schema.sql` | Modify | All DDL: column, index, grants, trigger functions, triggers, backfill |
| `supabase/verify.sql` | Create | Transactional assertion script, rolled back at the end |
| `src/lib/notifications.ts` | Create | Pure `renderNotification(type, payload) -> { title, body }` |
| `src/lib/server/platform.ts` | Modify | Read `onboarded_at`; use the renderer in `getNotifications` |
| `src/app/actions.ts` | Modify | Stamp `onboarded_at`; scope mark-read by recipient |

## A note on the test cycle

This project has no test framework, and trigger behavior cannot be exercised
from `npm`. The red/green cycle for SQL tasks is therefore manual: you paste
`verify.sql` into the Supabase SQL editor and read the result. Tasks 1, 3, 4,
and 5 each say exactly what failure text to expect before implementing and what
success looks like after. Do not skip the "expected to fail" run — it is the
only evidence the assertion actually tests anything.

`verify.sql` wraps everything in `begin; ... rollback;`, so it leaves no data
behind. It inserts directly into `auth.users` to exercise the signup trigger,
which requires a privileged role; the Supabase SQL editor provides one.

---

### Task 1: Profile bootstrap trigger

**Files:**
- Modify: `supabase/schema.sql`
- Create: `supabase/verify.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: `public.profiles.onboarded_at timestamptz`; trigger `on_auth_user_created` on `auth.users`; function `public.handle_new_user()`.

- [ ] **Step 1: Write the failing assertions**

Create `supabase/verify.sql`:

```sql
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
begin
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

  raise notice 'verify.sql: all assertions passed';
end
$$;

rollback;
```

- [ ] **Step 2: Run it to verify it fails**

Paste `supabase/verify.sql` into the Supabase SQL editor and run.

Expected: `ERROR: column "onboarded_at" does not exist`. If instead you see
`expected 2 auto-created profiles, got 0`, the column already exists but the
trigger does not — also an acceptable red state.

If the `auth.users` insert itself errors on a NOT NULL column, add that column
to the insert with a sane default. The exact NOT NULL set varies across Supabase
versions; the rest of the script is unaffected.

- [ ] **Step 3: Add the column, function, trigger, and backfill**

In `supabase/schema.sql`, after the `create table if not exists public.profiles`
block, add:

```sql
alter table public.profiles
  add column if not exists onboarded_at timestamptz;
```

After the `set_updated_at` trigger definitions, add:

```sql
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

  candidate_username :=
    left(base_username, 20) || '_' || left(replace(new.id::text, '-', ''), 8);

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
      insert into public.profiles (user_id, username, display_name)
      values (
        new.id,
        'user_' || replace(new.id::text, '-', ''),
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
    20
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
```

Then extend the existing grant (added in commit `9181e2f`) to include the new
column. Replace:

```sql
grant update (user_id, username, display_name, bio, avatar_url, interests)
  on public.profiles to authenticated;
```

with:

```sql
grant update (user_id, username, display_name, bio, avatar_url, interests, onboarded_at)
  on public.profiles to authenticated;
```

Missing this makes `updateProfileAction` fail with a permission error in Task 2.

- [ ] **Step 4: Apply and re-run to verify it passes**

Run the full `supabase/schema.sql` in the Supabase SQL editor, then run
`supabase/verify.sql` again.

Expected: `NOTICE: verify.sql: all assertions passed`, no error.

- [ ] **Step 5: Commit**

```bash
git add supabase/schema.sql supabase/verify.sql
git commit -m "feat: create profile rows from an auth.users trigger"
```

---

### Task 2: Wire the onboarding signal to onboarded_at

**Files:**
- Modify: `src/lib/server/platform.ts` (`getCurrentUser`)
- Modify: `src/app/actions.ts` (`updateProfileAction`)

**Interfaces:**
- Consumes: `public.profiles.onboarded_at` from Task 1.
- Produces: `CurrentUser.needsOnboarding` now means "has not saved the onboarding form", not "has no profile row".

- [ ] **Step 1: Read the column in getCurrentUser**

In `src/lib/server/platform.ts`, extend the select:

```ts
  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "user_id, username, display_name, bio, avatar_url, interests, role, onboarded_at",
    )
    .eq("user_id", user.id)
    .maybeSingle();
```

and change the returned flag from `needsOnboarding: !profile` to:

```ts
    needsOnboarding: !profile?.onboarded_at,
```

- [ ] **Step 2: Stamp the column in updateProfileAction**

In `src/app/actions.ts`, in `updateProfileAction`, change the upsert to:

```ts
  const { error } = await supabase.from("profiles").upsert({
    user_id: user.id,
    username,
    display_name: displayName,
    bio: bio || null,
    interests,
    onboarded_at: new Date().toISOString(),
  });
```

- [ ] **Step 3: Run the gates**

```bash
npm run typecheck && npm run lint && npm run build
```

Expected: all three pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/server/platform.ts src/app/actions.ts
git commit -m "feat: gate onboarding on profiles.onboarded_at"
```

---

### Task 3: Notification privileges and dedupe index

**Files:**
- Modify: `supabase/schema.sql`
- Modify: `supabase/verify.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: `notifications_engagement_dedupe_idx`; column-restricted UPDATE on `public.notifications`.

- [ ] **Step 1: Write the failing assertion**

In `supabase/verify.sql`, immediately before the final
`raise notice 'verify.sql: all assertions passed';`, add:

```sql
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
```

- [ ] **Step 2: Run it to verify it fails**

Run `supabase/verify.sql`.

Expected: `ERROR: expected notifications_engagement_dedupe_idx to exist`.

- [ ] **Step 3: Add the index and grants**

In `supabase/schema.sql`, after the existing
`notifications_recipient_id_created_at_idx` index, add:

```sql
-- Reactions and reposts are toggleable, so a remove/re-add loop would let one
-- user flood another's inbox. Caps engagement notifications at one per actor,
-- per post, per type. report_reviewed is excluded so that a reviewed -> closed
-- transition notifies twice.
create unique index if not exists notifications_engagement_dedupe_idx
  on public.notifications (recipient_id, actor_id, post_id, type)
  where type in ('poll_vote', 'post_reaction', 'post_repost');
```

After the notifications RLS policies, add:

```sql
-- Notifications have no INSERT policy by design: producers are SECURITY DEFINER
-- triggers. Revoking the grant is defence in depth. Marking a notification read
-- must not permit rewriting its type or payload, so UPDATE is column-scoped.
revoke insert on public.notifications from anon, authenticated;
revoke update on public.notifications from anon, authenticated;
grant update (read_at) on public.notifications to authenticated;
```

- [ ] **Step 4: Apply and re-run to verify it passes**

Run `supabase/schema.sql`, then `supabase/verify.sql`.

Expected: `NOTICE: verify.sql: all assertions passed`.

- [ ] **Step 5: Commit**

```bash
git add supabase/schema.sql supabase/verify.sql
git commit -m "feat: add notification dedupe index and column-scoped update grant"
```

---

### Task 4: Engagement notification triggers

**Files:**
- Modify: `supabase/schema.sql`
- Modify: `supabase/verify.sql`

**Interfaces:**
- Consumes: the dedupe index from Task 3.
- Produces: notification rows of type `poll_vote`, `post_reaction`, `post_repost`. Payload keys: `actor_username` (all three), plus `question` and `option_label` for `poll_vote`, plus `reaction_type` for `post_reaction`. Task 6 renders these exact keys.

- [ ] **Step 1: Write the failing assertions**

In `supabase/verify.sql`, insert this block after the profile assertions from
Task 1 and before the Task 3 assertions. Add `v_post uuid; v_poll uuid;
v_option_a uuid; v_option_b uuid;` to the `declare` list.

```sql
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
```

- [ ] **Step 2: Run it to verify it fails**

Run `supabase/verify.sql`.

Expected: `ERROR: expected 1 poll_vote notification, got 0`.

- [ ] **Step 3: Add the three trigger functions**

In `supabase/schema.sql`, after the `handle_new_user` trigger, add:

```sql
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
```

`on conflict do nothing` with no conflict target covers the partial unique
index from Task 3.

- [ ] **Step 4: Apply and re-run to verify it passes**

Run `supabase/schema.sql`, then `supabase/verify.sql`.

Expected: `NOTICE: verify.sql: all assertions passed`.

- [ ] **Step 5: Commit**

```bash
git add supabase/schema.sql supabase/verify.sql
git commit -m "feat: notify post authors of votes, reactions, and reposts"
```

---

### Task 5: Report review notification trigger

**Files:**
- Modify: `supabase/schema.sql`
- Modify: `supabase/verify.sql`

**Interfaces:**
- Consumes: nothing from Task 4.
- Produces: notification rows of type `report_reviewed` with payload keys `status` and `target_type`. Task 6 renders these exact keys.

- [ ] **Step 1: Write the failing assertions**

In `supabase/verify.sql`, add `v_report uuid;` to the `declare` list, and insert
this block after the Task 4 assertions:

```sql
  -- Reviewing a report notifies the reporter on each status transition.
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
```

- [ ] **Step 2: Run it to verify it fails**

Run `supabase/verify.sql`.

Expected: `ERROR: expected 2 report_reviewed notifications, got 0`.

- [ ] **Step 3: Add the trigger function**

In `supabase/schema.sql`, after the `notify_post_repost` trigger, add:

```sql
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
```

- [ ] **Step 4: Apply and re-run to verify it passes**

Run `supabase/schema.sql`, then `supabase/verify.sql`.

Expected: `NOTICE: verify.sql: all assertions passed`.

- [ ] **Step 5: Commit**

```bash
git add supabase/schema.sql supabase/verify.sql
git commit -m "feat: notify reporters when a report is reviewed or closed"
```

---

### Task 6: Render notification copy in TypeScript

**Files:**
- Create: `src/lib/notifications.ts`
- Modify: `src/lib/server/platform.ts` (`getNotifications`)
- Modify: `src/app/actions.ts` (`markNotificationReadAction`)

**Interfaces:**
- Consumes: payload keys produced in Tasks 4 and 5 — `actor_username`, `question`, `option_label`, `reaction_type`, `status`. (`target_type` is stored by Task 5 but not rendered; it is there for future copy that distinguishes post from user reports.)
- Produces: `renderNotification(type: string, payload: Record<string, unknown>): { title: string; body: string }`.

- [ ] **Step 1: Create the renderer**

Create `src/lib/notifications.ts`:

```ts
export function renderNotification(
  type: string,
  payload: Record<string, unknown>,
): { title: string; body: string } {
  const actor =
    typeof payload.actor_username === "string" && payload.actor_username
      ? `@${payload.actor_username}`
      : "Someone";

  switch (type) {
    case "poll_vote": {
      const option =
        typeof payload.option_label === "string"
          ? payload.option_label
          : "an option";
      const question =
        typeof payload.question === "string" ? payload.question : "your poll";

      return {
        title: "New vote on your poll",
        body: `${actor} voted "${option}" on "${question}".`,
      };
    }
    case "post_reaction": {
      const verb = payload.reaction_type === "dislike" ? "disliked" : "liked";

      return {
        title: "New reaction on your post",
        body: `${actor} ${verb} your post.`,
      };
    }
    case "post_repost":
      return {
        title: "Your post was reposted",
        body: `${actor} reposted your post.`,
      };
    case "report_reviewed": {
      const status = payload.status === "closed" ? "closed" : "reviewed";

      return {
        title: "Your report was reviewed",
        body: `A moderator marked your report as ${status}.`,
      };
    }
    default:
      return { title: type, body: "New platform activity" };
  }
}
```

- [ ] **Step 2: Use it in getNotifications**

In `src/lib/server/platform.ts`, add the import:

```ts
import { renderNotification } from "@/lib/notifications";
```

and replace the body of the `data.map(...)` callback with:

```ts
  return data.map((notification) => {
    const payload =
      notification.payload && typeof notification.payload === "object"
        ? (notification.payload as Record<string, unknown>)
        : {};
    const { title, body } = renderNotification(
      String(notification.type),
      payload,
    );

    return {
      id: String(notification.id),
      type: String(notification.type),
      title,
      body,
      createdAt: String(notification.created_at ?? new Date().toISOString()),
      readAt:
        typeof notification.read_at === "string"
          ? notification.read_at
          : undefined,
    };
  });
```

- [ ] **Step 3: Scope mark-read by recipient**

In `src/app/actions.ts`, in `markNotificationReadAction`, change
`const { supabase } = await requireAuthenticatedUser(redirectTo);` to
`const { supabase, user } = await requireAuthenticatedUser(redirectTo);` and add
the recipient filter:

```ts
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("recipient_id", user.id);
```

- [ ] **Step 4: Run the gates**

```bash
npm run typecheck && npm run lint && npm run build
```

Expected: all three pass.

- [ ] **Step 5: Verify the copy end to end**

With `.env.local` pointed at the Supabase project, run `npm run dev`, sign in as
two users, vote on the other's poll, and confirm `/notifications` shows
`New vote on your poll` with the option and question in the body.

This is the only check that the rendered strings read correctly; `verify.sql`
asserts payload contents, not copy.

- [ ] **Step 6: Commit**

```bash
git add src/lib/notifications.ts src/lib/server/platform.ts src/app/actions.ts
git commit -m "feat: render notification copy from structured payloads"
```

---

## Rollout

1. Apply `supabase/schema.sql` in the Supabase SQL editor.
2. Run `supabase/verify.sql` and confirm the success notice.
3. Deploy the application.

Schema first is required: `getCurrentUser` reads `onboarded_at`, which does not
exist until step 1.

# Notification producers and profile bootstrap

Date: 2026-08-02
Status: approved, not yet implemented

## Problem

Two gaps make the app visibly broken once a real Supabase project is connected.

**No profile is created at signup.** `posts.author_id` has a foreign key to
`profiles.user_id`, but the only code that creates a profile row is
`updateProfileAction`. A confirmed user who skips onboarding and posts hits a raw
foreign-key violation surfaced as an error notice.

**Nothing produces notifications.** No code inserts into `public.notifications`,
so `/notifications` is permanently empty outside demo mode.

## Decisions

- Profiles are created by a database trigger on `auth.users`, not by application
  code, so the foreign key cannot be violated on any signup path.
- Notifications are produced by `SECURITY DEFINER` database triggers, never by
  client inserts.
- Notification `payload` stores structured fields; the user-facing sentence is
  rendered in TypeScript.

### Why triggers rather than server-action inserts

A client-side insert would need an RLS policy permitting
`recipient_id <> auth.uid()` — that is, any authenticated user may write any row
into any other user's inbox. The anon key is public and PostgREST is reachable
directly, so such a policy is a phishing surface. Triggers let `notifications`
keep no INSERT policy at all: the client can read and mark-read, nothing more.

Triggers are also atomic with the event they describe. An insert in a server
action can fail after the vote succeeds, producing silent gaps.

### Why structured payload rather than rendered strings

Copy built in SQL requires a migration to fix a typo, and the roadmap includes
multi-language support, which English baked into trigger bodies would block.

## Part 1 — Profile bootstrap

### Schema

Add `profiles.onboarded_at timestamptz`.

`public.handle_new_user()` — `SECURITY DEFINER`, `set search_path = ''`,
`after insert on auth.users`:

- `username`: email local-part, lowercased, stripped to `[a-z0-9_]`, truncated to
  20 characters, suffixed with `_` and the first 8 hex characters of the user's
  UUID. A local part that sanitizes to empty (phone signup, null email) falls
  back to `user`.
- `display_name`: seeded from `raw_user_meta_data` in order `display_name`,
  `full_name`, `name`. Null when absent.
- On `unique_violation`, retry once with `user_` plus the full UUID hex, which
  cannot collide. The handler catches `unique_violation` only — a blanket
  `when others` would let signups silently produce profile-less users, which is
  the bug being fixed.

Plus a one-time idempotent backfill for `auth.users` rows with no profile.

### Grant

`onboarded_at` must be added to the column list in the existing
`grant update (...) on public.profiles to authenticated`. The commit that
revoked table-wide UPDATE on `profiles` (9181e2f) grants a fixed column list;
omitting `onboarded_at` makes `updateProfileAction` fail with a permission error.

### Application

- `getCurrentUser()` returns `needsOnboarding: !profile?.onboarded_at`.
- `updateProfileAction` stamps `onboarded_at` when saving.

`!profile` cannot remain the signal, because the trigger makes it permanently
false. `display_name is null` was rejected because the trigger seeds
`display_name` for OAuth users, which would mark them onboarded before they saw
the form.

## Part 2 — Notification producers

### Dedupe index

```sql
create unique index if not exists notifications_engagement_dedupe_idx
  on public.notifications (recipient_id, actor_id, post_id, type)
  where type in ('poll_vote', 'post_reaction', 'post_repost');
```

Reactions and reposts are toggleable, so a remove/re-add loop would otherwise let
one user flood another's inbox. This caps engagement notifications at one per
actor, per post, per type, and incidentally bounds vote volume. `report_reviewed`
is excluded so that a reviewed→closed transition notifies twice.

`post_id` is non-null for all three indexed types, so no NULL-distinctness issue
arises.

### Triggers

All four are `SECURITY DEFINER` with `set search_path = ''`, skip
self-notification, and use `on conflict do nothing` (which, with no conflict
target, covers the partial index).

| Function | Fires on | Recipient | Actor | Payload keys |
|---|---|---|---|---|
| `notify_poll_vote` | insert on `poll_votes` | post author | `voter_id` | `actor_username`, `question`, `option_label` |
| `notify_post_reaction` | insert on `reactions` | post author | `user_id` | `actor_username`, `reaction_type` |
| `notify_post_repost` | insert on `reposts` | post author | `user_id` | `actor_username` |
| `notify_report_reviewed` | update on `reports` entering `reviewed`/`closed` | `reporter_id` | `reviewed_by` | `status`, `target_type` |

`notify_report_reviewed` returns early when the status is unchanged, when the new
status is not `reviewed` or `closed`, or when `reviewed_by` is null.

Reactions fire on INSERT only. Switching like→dislike is an UPDATE and does not
re-notify, which is the quieter and preferable behavior.

### Privileges

```sql
revoke insert on public.notifications from anon, authenticated;
revoke update on public.notifications from anon, authenticated;
grant update (read_at) on public.notifications to authenticated;
```

The INSERT revoke is defence in depth on top of the absent INSERT policy. The
UPDATE column restriction mirrors the `profiles` pattern: marking a notification
read must not permit rewriting its `type` or `payload`.

### Application

- `renderNotification(type, payload)` in `src/lib/server/platform.ts` returns
  `{ title, body }` and replaces the current `payload.title` / `payload.body`
  reads. Unrecognized types fall back to the raw `type` as title and a generic
  body, matching today's behavior.
- `markNotificationReadAction` gains `.eq("recipient_id", user.id)`.

`AppNotification` is unchanged, so `src/app/notifications/page.tsx` and
`src/lib/demo-data.ts` need no edits.

## Verification

`lint`, `typecheck`, and `build` cannot exercise any of this. There is no test
framework, and triggers require a live Supabase project.

Add `supabase/verify.sql`: a script that creates two throwaway users, exercises
each trigger, asserts the expected notification rows — including the self-notify
skip and the dedupe — and rolls back. Run once in the Supabase SQL editor after
applying `schema.sql`.

It must run as a privileged role, since it inserts directly into `auth.users` to
exercise `handle_new_user`. The Supabase SQL editor satisfies this; the script is
not runnable from the application.

This is the only automated check the change will have. Everything else is manual
verification through the UI.

## Rollout

1. Apply `supabase/schema.sql` in the Supabase SQL editor. It remains idempotent
   and re-runnable.
2. Run `supabase/verify.sql`.
3. Deploy the application changes.

Schema first is required: `getCurrentUser()` reads `onboarded_at`, which does not
exist until step 1.

## Out of scope

Findings 8–15 from the review: non-atomic poll creation, the unused `imageUrl`
field, the duplicate `getCurrentUser()` call per request, feed vote-count
scaling, dependency upgrades, and the absent test framework.

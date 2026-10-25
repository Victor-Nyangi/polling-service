# Digital Brand Platform

Authentic voting rounds: staff awards, recognition votes and feedback rounds,
where one person, one vote and a secret ballot are the point.

## Positioning

Most poll tools count clicks. This one is for the votes where the count has to
be defensible:

- **One person, one vote.** An invite-only poll accepts a ballot only through a
  one-time invite link, and the database refuses a second ballot from the same
  link and any signed-in ballot that skips the invite.
- **A secret ballot.** The owner sees turnout (which links were used, how many
  voted) and the tally, never who chose what. Only token hashes are stored.
- **Results when voting ends.** A round can hide its per-option counts from
  everyone, its owner included, until the closing time, so early votes can't
  steer late ones. The database withholds them, not just the page.
- **A real deadline.** Voting stops at `closes_at`, enforced by a trigger,
  whichever path the ballot takes.
- **Voters need no account.** Only the person running the round signs in.

The composer opens on the **Awards / voting round** preset (invite-only,
results after close, closes in a week). **Quick poll** (`/?preset=quick`) keeps
the open, live-results poll that anyone with the link can answer. Every setting
can be changed under either preset.

## Stack

- **Frontend:** Next.js App Router, React, TypeScript, Tailwind CSS
- **Backend:** Supabase Auth, PostgreSQL, Storage, Row Level Security
- **Hosting:** Vercel + Supabase Cloud
- **Product plan:** `digital-brand-platform-system-plan.md`

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Copy the environment template:

```bash
cp .env.example .env.local
```

3. Fill in your Supabase project values in `.env.local`.

4. Apply the SQL in `supabase/schema.sql` using the Supabase SQL editor, then
   run `supabase/verify.sql` and confirm it reports
   `verify.sql: all assertions passed`. Then run `supabase/verify-rls.sql`,
   which checks cross-account row-level security and shows one PASS/FAIL row
   per check (the header of that file lists the FAILs known when it was written).

5. Start the app:

```bash
npm run dev
```

The app runs without Supabase configured: with the environment variables unset
it falls back to demo mode, serving fixtures from `src/lib/demo-data.ts` and
short-circuiting every mutation with an informational notice. Useful for working
on layout and copy, but nothing persists.

## Scripts

- `npm run dev` — local development
- `npm run lint` — ESLint
- `npm run typecheck` — TypeScript checks
- `npm test` — Vitest unit tests (`npm run test:watch` to watch)
- `npm run build` — production build

All four checks run on every pull request via `.github/workflows/ci.yml`.

## Initial MVP priorities

1. Authentication and profile onboarding
2. Poll creation and the list of recent polls
3. Voting (signed-in, anonymous, and invite-only) and sharing by permalink
4. Basic moderation and notifications
5. Deployment hardening and observability

## Current implemented routes

- `/` — recent polls, how a voting round works, and the poll composer (opens on the Awards / voting round preset; `/?preset=quick` for a quick poll)
- `/p/[postId]` — public permalink for one poll post (works signed-out); its author also gets the Open / Invite-only switch, invite issuing, and turnout
- `/p/[postId]?invite=<token>` — an invite link: votes on an invite-only poll, signed in or not, then redirects to the bare permalink
- `/u/[username]` — public profile and that account's polls (works signed-out)
- `/auth/login` — email/password sign-in plus Google OAuth entrypoint
- `/auth/sign-up` — account creation
- `/onboarding` — profile setup
- `/notifications` — in-app notification center
- `/moderation` — report review queue
- `/api/health` — deployment health/config check

## Deployment

Target: **Vercel** for the app, **Supabase Cloud** for the database and auth.

Vercel is the deliberate choice rather than the default one. This project uses
Next.js 16's `proxy.ts` convention, which replaced `middleware.ts` in 16.0.
Third-party Next hosting adapters typically lag major releases, and the gaps
tend to land squarely on middleware/proxy and Server Actions — which is this
app's entire mutation layer. Vercel supports a Next release on the day it ships.

**Order matters: apply the schema before deploying the app.** `getCurrentUser()`
selects `profiles.onboarded_at`, which does not exist until step 1.

### 1. Create the Supabase project and apply the schema

1. Create a project at [supabase.com](https://supabase.com). Save the database
   password somewhere safe — a password manager, not a file in the repo.
2. In the SQL editor, run the full contents of `supabase/schema.sql`. It is
   idempotent, so re-running it later to pick up changes is safe.
3. Run `supabase/verify.sql`. It must report
   `verify.sql: all assertions passed`. This exercises the signup trigger, the
   notification triggers, and the column-level privileges; everything it creates
   is rolled back.
   Then run `supabase/verify-rls.sql`. It signs in as two throwaway users, a
   throwaway moderator, and as anon, tries to read and change the other user's rows in every user-owned
   table, and shows one row per check with PASS or FAIL. It also ends in
   `rollback`. Any FAIL that isn't in the file's "known fails" header is a
   regression.
4. From **Project Settings → API**, copy the project URL, the `anon` public key,
   and the `service_role` secret key.

### 2. Deploy to Vercel

1. Import the GitHub repository at [vercel.com/new](https://vercel.com/new).
   Next.js is auto-detected — no `vercel.json` and no build configuration.
2. Add the environment variables, for **Production** and **Preview** both:

   | Variable | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL from step 1.4 |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `anon` public key |
   | `SUPABASE_SERVICE_ROLE_KEY` | `service_role` secret key |

3. Deploy.

The `service_role` key bypasses row-level security entirely. It belongs only in
server-side environment variables — never in a `NEXT_PUBLIC_*` variable, and
never in code reachable from a component or a Server Action.

### 3. Configure Supabase Auth

This step is easy to skip and it silently breaks sign-in. Without the redirect
allowlist, `/auth/callback` never establishes a session, so both Google OAuth
and email confirmation dead-end on an apparently successful redirect.

Under **Authentication → URL Configuration**:

- **Site URL** — your production domain, e.g. `https://your-app.vercel.app`
- **Redirect URLs** — add both:
  - `https://your-app.vercel.app/auth/callback`
  - `https://*-<your-vercel-scope>.vercel.app/auth/callback` (only if you want
    preview deployments to support sign-in)

For Google sign-in, enable the Google provider under
**Authentication → Providers**, then create an OAuth client in the Google Cloud
Console and set its authorized redirect URI to the callback URL Supabase shows
you on that screen.

### 4. Verify the deployment

Check these in order — each one depends on the last.

1. `GET /api/health` returns `configured.supabasePublicEnv: true` and
   `configured.supabaseServiceRoleEnv: true`. If either is false, the
   environment variables did not reach the deployment.
2. Sign up with a real email address and confirm via the emailed link. You
   should land on `/onboarding` already signed in — if you land signed out, the
   redirect allowlist in step 3 is wrong.
3. Save the onboarding form. The "finish profile setup" banner should disappear.
4. Create a poll post, then vote on it from a second account. The first account
   should see a notification at `/notifications`.

Step 4 is the real end-to-end check: it proves the signup trigger, the
notification triggers, and session persistence are all working together.

### Ongoing

- **Schema changes**: edit `supabase/schema.sql`, re-run it in the SQL editor,
  then re-run `supabase/verify.sql` and `supabase/verify-rls.sql`. There is no
  migration tool — keep every statement re-runnable.
- **Pending re-paste (2026-10-25): the social features are removed, and this
  deletes data.** Likes/dislikes and reposts are gone from the app, and
  `schema.sql` now drops the `reactions` and `reposts` tables (with their six
  RLS policies, two triggers and two indexes), the `notify_post_reaction()` and
  `notify_post_repost()` trigger functions, and every `post_reaction` /
  `post_repost` notification, and narrows `notifications_engagement_dedupe_idx`
  to `poll_vote`. **The first paste on the live database permanently deletes
  every like, dislike, repost and the notifications they produced**; there is no
  undo short of a backup. Later pastes do nothing new. Polls, options, ballots,
  invites, reports, profiles and the other notification types are untouched.
  After pasting, re-run both verify files: `verify-rls.sql` should give
  **132 checks, 132 PASS, 0 FAIL** (the reactions FAIL accepted on 2026-10-11
  is gone with the table). The previous pending changes (2026-10-11 to
  2026-10-15: report and post `created_at` pinned, posts' UPDATE grant revoked,
  staff limited to a report's moderation columns, every grant stated outright)
  were pasted on 2026-10-20, giving 151 checks, 150 PASS, 1 FAIL.
- **Pending re-paste (2026-10-25, voting rounds; apply after the social-features
  removal above, both are in the same `schema.sql`)**: adds
  `polls.results_visibility` (`live`, the default for every existing poll, or
  `after_close`), with a check that `after_close` has a `closes_at`.
  `poll_option_vote_counts` now returns a null `votes` for an `after_close`
  poll that hasn't closed yet, plus a `total_votes` turnout column. On such a
  poll, `notify_poll_vote()` leaves the choice out of the owner's notification.
  This deletes nothing, and existing polls behave exactly as before. After
  pasting: `verify.sql` passes and `verify-rls.sql` gives **139 checks,
  139 PASS, 0 FAIL**.
- **Preview deployments**: Vercel builds every pull request. They share the
  production database unless you point Preview at a separate Supabase project.
- **Environments**: keep `development` and `production` only. Add staging when
  the release process is risky enough to need it.
- **After the core loop is live**: add error tracking (Sentry) and product
  analytics (PostHog or Plausible).

### Free-tier limits worth knowing

- **Vercel Hobby prohibits commercial use.** Fine for validating the idea; a
  real product needs Pro.
- **Supabase Free pauses the database after ~7 days of inactivity.** The first
  visitor after a quiet week gets errors until it wakes.
- Every page sets `dynamic = "force-dynamic"`, so nothing is CDN-cached and
  every request reaches the server. Irrelevant at low traffic, but it does mean
  the usual static-Next hosting economics do not apply here.

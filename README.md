# Digital Brand Platform

A web-first MVP foundation for a poll-centric social platform. The project is
designed to validate the core loop first, then expand into richer discovery,
analytics, privacy controls, messaging, and multilingual support.

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
   `verify.sql: all assertions passed`.

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
2. Poll-post creation and feed
3. Voting, likes, reposts, and sharing
4. Basic moderation and notifications
5. Deployment hardening and observability

## Current implemented routes

- `/` — feed, MVP overview, and poll composer
- `/p/[postId]` — public permalink for one poll post (works signed-out)
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
  then re-run `supabase/verify.sql`. There is no migration tool — keep every
  statement re-runnable.
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

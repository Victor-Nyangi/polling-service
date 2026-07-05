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

4. Apply the SQL in `supabase/schema.sql` using the Supabase SQL editor.

5. Start the app:

```bash
npm run dev
```

## Scripts

- `npm run dev` — local development
- `npm run lint` — ESLint
- `npm run typecheck` — TypeScript checks
- `npm run build` — production build

## Initial MVP priorities

1. Authentication and profile onboarding
2. Poll-post creation and feed
3. Voting, likes, reposts, and sharing
4. Basic moderation and notifications
5. Deployment hardening and observability

## Current implemented routes

- `/` — feed, MVP overview, and poll composer
- `/auth/login` — email/password sign-in plus Google OAuth entrypoint
- `/auth/sign-up` — account creation
- `/onboarding` — profile setup
- `/notifications` — in-app notification center
- `/moderation` — report review queue
- `/api/health` — deployment health/config check

## Deployment

- Deploy the app to Vercel
- Point production environment variables at the hosted Supabase project
- Keep only `development` and `production` environments initially
- Add error tracking and product analytics after the core loop is live

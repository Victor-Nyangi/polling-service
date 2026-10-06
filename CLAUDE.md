# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev        # local dev server
npm run build      # production build
npm run lint       # eslint (flat config, eslint-config-next)
npm run typecheck  # tsc --noEmit
npm test           # vitest run (single pass)
npm run test:watch # vitest (watch mode)
```

`lint` + `typecheck` + `test` + `build` are the verification gates, and `.github/workflows/ci.yml` runs all four on every pull request.

Tests are Vitest, colocated as `src/**/*.test.ts`, and cover only the pure helpers in `src/lib` — Vitest does not support async Server Components, and this codebase is almost entirely async Server Components, so anything touching a page, a component, or Supabase belongs in an end-to-end runner instead. There is deliberately no jsdom environment. When adding a helper to `src/lib`, add its unit test; when adding a page or action, rely on the other three gates.

Database changes are applied by pasting `supabase/schema.sql` into the Supabase SQL editor — there is no migration tool. The file is written to be idempotent (`create ... if not exists`, `drop policy if exists` before every `create policy`, `do $$` guards for constraints), so keep new statements re-runnable rather than adding one-shot DDL.

## Architecture

Next.js App Router + Supabase (Postgres, Auth, RLS). Product background lives in `digital-brand-platform-system-plan.md`; `README.md` tracks implemented routes.

**Everything is Server Components + Server Actions.** There is one Client Component, `src/components/invite-issuer.tsx` (it shows freshly issued invite links exactly once, as `useActionState` state, and needs the clipboard), and no client-side data fetching. Mutations are plain `<form action={someAction}>` posting to the `"use server"` functions in `src/app/actions.ts`; reads go through `src/lib/server/platform.ts` (marked `server-only`). `src/lib/supabase/browser.ts` exists but is currently unused — prefer the server path unless a feature genuinely needs interactivity.

**Demo mode is a first-class code path.** `hasSupabasePublicEnv()` (`src/lib/env.ts`) gates every data function: without Supabase env vars, `platform.ts` returns fixtures from `src/lib/demo-data.ts` and every action in `actions.ts` short-circuits via `requireConfigured()` with an info notice. Any new read function must have a demo fallback and any new action must call `requireConfigured()` first, or the app breaks for anyone without a `.env.local`.

**Feedback is redirect-based, not React state.** Actions end by redirecting to `buildNoticeHref(path, type, message)` (`src/lib/notice.ts`), which encodes `?notice=&message=`; pages read it with `readNotice(searchParams)` and render `<NoticeBanner>`. Follow this instead of returning values from actions. The one exception is `issuePollInvitesAction`, which returns the raw invite links to `InviteIssuer` because a redirect would have to put those bearer tokens in a URL or a cookie. Note `redirectWithNotice` throws (Next's `redirect`), so the `if (!x) throw new Error(...)` blocks after guards in `actions.ts` exist purely to narrow types for TypeScript — keep that shape when adding actions.

**Auth guards live in the action layer.** `requireAuthenticatedUser()` in `actions.ts` fetches the user and redirects with an error notice if missing; role checks (`moderator`/`admin`) happen in `getModerationReports()` *and* again in RLS policies. Server-side checks are defence-in-depth over RLS — add both.

**Session cookies are refreshed in `src/proxy.ts`.** Next.js 16 renamed the `middleware` file convention to `proxy` (exported function must be named `proxy`, or be the default export) — do not create a `middleware.ts`. The proxy runs `supabase.auth.getUser()` on every matched request to rotate the refresh token and write the new cookies, because Server Components can't write cookies. `src/lib/supabase/server.ts` implements `setAll()` with a try/catch: the writes succeed in Server Actions and route handlers, and throw harmlessly during Server Component render. Both layers are required — dropping either logs users out silently.

**Column privileges matter as much as RLS.** RLS policies are row-level, and Supabase's default table-level grants cover every column, so a `auth.uid() = user_id` update policy would otherwise let a user set their own `role` to `admin` via the public anon key. `schema.sql` revokes the table-wide UPDATE on `profiles` and grants back only the self-service columns. Apply the same pattern to any new table with privileged columns.

**Data shaping happens once, at the boundary.** `platform.ts` runs deeply-nested PostgREST selects (post → poll → options/votes, reactions, reposts) and maps the loose row shapes into the domain types in `src/lib/types.ts` (`FeedPost`, `CurrentUser`, `AppNotification`, `ModerationReport`). Vote counts and percentages are derived in TS from raw vote rows, not aggregated in SQL. Components consume only `src/lib/types.ts` — never raw Supabase rows.

Feed pages set `export const dynamic = "force-dynamic"` and actions call `revalidatePath("/")` after mutations.

## Conventions

- Path alias `@/*` → `src/*`.
- DB columns are `snake_case`; TS is `camelCase`. Conversion happens only in `platform.ts` (reads) and `actions.ts` (writes).
- Every form carries a hidden `redirectTo` input. Route all caller-supplied redirect targets through `safeRedirectPath()` (`src/lib/redirect.ts`) — a bare `startsWith("/")` check is an open redirect, since `//evil.com` and `/\evil.com` are protocol-relative URLs.
- Tailwind v4 (CSS-first, no `tailwind.config`). Theme colors are CSS vars in `src/app/globals.css` exposed via `@theme inline` — use semantic classes (`bg-card`, `text-muted`, `border-border`, `bg-accent`) so dark mode works; avoid raw palette colors.
- `SUPABASE_SERVICE_ROLE_KEY` is only surfaced as a boolean by `/api/health`. Never use the service-role client from a component or action — it bypasses RLS.

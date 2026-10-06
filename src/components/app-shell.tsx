import { cookies, headers } from "next/headers";
import Link from "next/link";
import { setThemeAction, signOutAction } from "@/app/actions";
import { NAV_ITEMS, currentNavHref } from "@/lib/nav";
import { safeRedirectPath } from "@/lib/redirect";
import { isDemoMode } from "@/lib/server/platform";
import {
  CURRENT_PATH_HEADER,
  THEME_COOKIE,
  THEME_LABELS,
  THEME_PREFERENCES,
  parseThemePreference,
} from "@/lib/theme";
import type { CurrentUser } from "@/lib/types";

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/**
 * System / Light / Dark, as three submit buttons in one plain form, so it
 * works without JavaScript: the action sets the cookie and redirects back to
 * the same path and query string (forwarded by src/proxy.ts).
 */
async function ThemeToggle() {
  const [cookieStore, requestHeaders] = await Promise.all([
    cookies(),
    headers(),
  ]);
  const current = parseThemePreference(cookieStore.get(THEME_COOKIE)?.value);
  const redirectTo = safeRedirectPath(requestHeaders.get(CURRENT_PATH_HEADER));

  return (
    <form action={setThemeAction}>
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <div
        role="group"
        aria-label="Theme"
        className="flex rounded-full border border-border p-0.5 font-mono text-xs uppercase tracking-wide"
      >
        {THEME_PREFERENCES.map((preference) => {
          const active = preference === current;

          return (
            <button
              key={preference}
              type="submit"
              name="theme"
              value={preference}
              aria-pressed={active}
              className={`rounded-full px-2.5 py-1 transition max-md:px-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.96] ${
                active
                  ? "bg-accent/10 font-medium text-accent"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {THEME_LABELS[preference]}
            </button>
          );
        })}
      </div>
    </form>
  );
}

export async function AppShell({
  currentUser,
  children,
}: {
  currentUser: CurrentUser | null;
  children: React.ReactNode;
}) {
  const demoMode = isDemoMode();
  const requestHeaders = await headers();
  const currentHref = currentNavHref(
    requestHeaders.get(CURRENT_PATH_HEADER),
    currentUser?.username,
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 py-4 lg:px-10 max-md:gap-y-1 max-md:px-4 max-md:pt-2 max-md:pb-0">
          <div>
            <Link
              href="/"
              className="font-display text-lg font-semibold tracking-tight max-md:leading-6"
            >
              Digital Brand Platform
            </Link>
            <p className="text-sm text-muted max-md:hidden">
              Poll-first social MVP for a hobby-scale launch.
            </p>
          </div>

          {/*
           * One list for every breakpoint. From md up it is the inline row it
           * has always been; below md it drops to its own full-bleed row under
           * the account controls and scrolls sideways instead of wrapping.
           */}
          <nav
            aria-label="Primary"
            className="flex items-center gap-5 text-sm text-muted max-md:order-last max-md:-mx-4 max-md:-mt-1 max-md:w-[calc(100%+2rem)] max-md:gap-0 max-md:overflow-x-auto max-md:px-1 max-md:[scrollbar-width:none] max-md:[&::-webkit-scrollbar]:hidden"
          >
            {NAV_ITEMS.map((item) => {
              const current = item.href === currentHref;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={current ? "page" : undefined}
                  className={`transition hover:text-foreground max-md:flex max-md:min-h-11 max-md:shrink-0 max-md:items-center max-md:border-b-2 max-md:px-3 max-md:whitespace-nowrap max-md:focus-visible:outline-2 max-md:focus-visible:-outline-offset-2 max-md:focus-visible:outline-accent ${
                    current
                      ? "max-md:border-accent max-md:font-medium"
                      : "max-md:border-transparent"
                  }`}
                >
                  {/* Colour sits on the span: the global `a { color: inherit }` in
                      globals.css is unlayered, so it beats text utilities on <a>. */}
                  <span className={current ? "max-md:text-foreground" : undefined}>
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </nav>

          <div className="flex flex-wrap items-center gap-3 max-md:gap-2">
            <ThemeToggle />
            {currentUser ? (
              <>
                <div className="hidden text-right md:block">
                  <p className="text-sm font-medium">{currentUser.displayName}</p>
                  <p className="font-mono text-xs uppercase tracking-wide text-muted">
                    {currentUser.role}
                  </p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-strong text-sm font-semibold text-white max-md:h-9 max-md:w-9">
                  {initials(currentUser.displayName)}
                </div>
                <form action={signOutAction}>
                  <button className="rounded-full border border-border px-4 py-2 text-sm font-medium transition active:scale-[0.97]">
                    Sign out
                  </button>
                </form>
              </>
            ) : (
              <div className="flex gap-2">
                <Link
                  href="/auth/login"
                  className="rounded-full border border-border px-4 py-2 text-sm font-medium transition active:scale-[0.97]"
                >
                  Sign in
                </Link>
                <Link
                  href="/auth/sign-up"
                  className="rounded-full bg-accent-strong px-4 py-2 text-sm font-medium transition hover:brightness-95 active:scale-[0.97]"
                >
                  {/* text-white on the spans, not the <a>: the global
                      `a { color: inherit }` would otherwise win and leave dark
                      text on the solid fill. The short label keeps the phone
                      row to one line next to the theme toggle. */}
                  <span className="text-white md:hidden">Join</span>
                  <span className="text-white max-md:hidden">Start building</span>
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8 lg:px-10">
        {demoMode ? (
          <div className="rounded-2xl border border-dashed border-border bg-card px-4 py-3 text-sm text-muted">
            Demo mode is active. Connect Supabase in <code>.env.local</code> to
            enable persistent auth, feed, notifications, and moderation data.
          </div>
        ) : null}
        {currentUser?.needsOnboarding ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
            Finish profile setup in the onboarding flow before creating content.
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}

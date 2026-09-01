import Link from "next/link";
import { signOutAction } from "@/app/actions";
import { isDemoMode } from "@/lib/server/platform";
import type { CurrentUser } from "@/lib/types";

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export async function AppShell({
  currentUser,
  children,
}: {
  currentUser: CurrentUser | null;
  children: React.ReactNode;
}) {
  const demoMode = isDemoMode();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-6 px-6 py-4 lg:px-10">
          <div>
            <Link
              href="/"
              className="font-display text-lg font-semibold tracking-tight"
            >
              Digital Brand Platform
            </Link>
            <p className="text-sm text-muted">
              Poll-first social MVP for a hobby-scale launch.
            </p>
          </div>

          <nav className="hidden items-center gap-5 text-sm text-muted md:flex">
            <Link href="/" className="transition hover:text-foreground">
              Feed
            </Link>
            <Link
              href="/notifications"
              className="transition hover:text-foreground"
            >
              Notifications
            </Link>
            <Link
              href="/moderation"
              className="transition hover:text-foreground"
            >
              Moderation
            </Link>
            <Link
              href="/onboarding"
              className="transition hover:text-foreground"
            >
              Profile
            </Link>
          </nav>

          <div className="flex items-center gap-3">
            {currentUser ? (
              <>
                <div className="hidden text-right md:block">
                  <p className="text-sm font-medium">{currentUser.displayName}</p>
                  <p className="font-mono text-xs uppercase tracking-wide text-muted">
                    {currentUser.role}
                  </p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-strong text-sm font-semibold text-white">
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
                  className="rounded-full bg-accent-strong px-4 py-2 text-sm font-medium text-white transition hover:brightness-95 active:scale-[0.97]"
                >
                  Start building
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

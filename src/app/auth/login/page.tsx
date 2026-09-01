import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { NoticeBanner } from "@/components/notice-banner";
import { readNotice } from "@/lib/notice";
import { getCurrentUser } from "@/lib/server/platform";
import { signInAction, signInWithGoogleAction } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [notice, currentUser] = await Promise.all([
    readNotice(searchParams),
    getCurrentUser(),
  ]);

  return (
    <AppShell currentUser={currentUser}>
      <div className="mx-auto w-full max-w-xl rounded-3xl border border-border bg-card p-8 shadow-sm">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Sign in
        </h1>
        <p className="mt-3 text-sm text-muted">
          Start with email/password or a single social provider for the simplest
          MVP auth stack.
        </p>
        <div className="mt-6">
          <NoticeBanner notice={notice} />
        </div>

        <form action={signInAction} className="mt-6 grid gap-4">
          <input type="hidden" name="redirectTo" value="/" />
          <input
            name="email"
            type="email"
            placeholder="Email address"
            className="rounded-2xl border border-border bg-background px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15"
            required
          />
          <input
            name="password"
            type="password"
            placeholder="Password"
            className="rounded-2xl border border-border bg-background px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15"
            required
          />
          <button className="rounded-full bg-accent-strong px-5 py-3 font-medium text-white transition hover:brightness-95 active:scale-[0.98]">
            Sign in
          </button>
        </form>

        <form action={signInWithGoogleAction} className="mt-3">
          <button className="w-full rounded-full border border-border px-5 py-3 font-medium transition active:scale-[0.98]">
            Continue with Google
          </button>
        </form>

        <p className="mt-6 text-sm text-muted">
          Need an account?{" "}
          <Link href="/auth/sign-up" className="font-medium text-accent">
            Create one
          </Link>
        </p>
      </div>
    </AppShell>
  );
}

import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { NoticeBanner } from "@/components/notice-banner";
import { readNotice } from "@/lib/notice";
import { getCurrentUser } from "@/lib/server/platform";
import { signUpAction } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function SignUpPage({
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
        <h1 className="text-3xl font-semibold tracking-tight">Create your account</h1>
        <p className="mt-3 text-sm text-muted">
          Start with email/password, then add Google login for a lightweight social
          sign-in option.
        </p>
        <div className="mt-6">
          <NoticeBanner notice={notice} />
        </div>

        <form action={signUpAction} className="mt-6 grid gap-4">
          <input type="hidden" name="redirectTo" value="/auth/sign-up" />
          <input
            name="email"
            type="email"
            placeholder="Email address"
            className="rounded-2xl border border-border bg-background px-4 py-3 outline-none focus:border-accent"
            required
          />
          <input
            name="password"
            type="password"
            placeholder="Password"
            className="rounded-2xl border border-border bg-background px-4 py-3 outline-none focus:border-accent"
            required
          />
          <button className="rounded-full bg-accent px-5 py-3 font-medium text-white">
            Create account
          </button>
        </form>

        <p className="mt-6 text-sm text-muted">
          Already have an account?{" "}
          <Link href="/auth/login" className="font-medium text-accent">
            Sign in
          </Link>
        </p>
      </div>
    </AppShell>
  );
}

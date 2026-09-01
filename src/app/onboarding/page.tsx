import { AppShell } from "@/components/app-shell";
import { NoticeBanner } from "@/components/notice-banner";
import { readNotice } from "@/lib/notice";
import { getCurrentUser } from "@/lib/server/platform";
import { updateProfileAction } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function OnboardingPage({
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
      <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Profile onboarding
          </h1>
          <p className="mt-3 text-sm leading-7 text-muted">
            The MVP only needs a username, display name, short bio, and interests.
            Keep the profile intentionally simple until real usage suggests more.
          </p>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
          <NoticeBanner notice={notice} />

          <form action={updateProfileAction} className="mt-6 grid gap-4">
            <input type="hidden" name="redirectTo" value="/onboarding" />
            <input
              name="username"
              placeholder="Username"
              defaultValue={currentUser?.username}
              className="rounded-2xl border border-border bg-background px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15"
              required
            />
            <input
              name="displayName"
              placeholder="Display name"
              defaultValue={currentUser?.displayName}
              className="rounded-2xl border border-border bg-background px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15"
              required
            />
            <textarea
              name="bio"
              rows={4}
              placeholder="Short bio"
              defaultValue={currentUser?.bio}
              className="rounded-2xl border border-border bg-background px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15"
            />
            <input
              name="interests"
              placeholder="Interests, comma-separated"
              defaultValue={currentUser?.interests.join(", ")}
              className="rounded-2xl border border-border bg-background px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15"
            />
            <button className="rounded-full bg-accent-strong px-5 py-3 font-medium text-white transition hover:brightness-95 active:scale-[0.98]">
              Save profile
            </button>
          </form>
        </section>
      </div>
    </AppShell>
  );
}

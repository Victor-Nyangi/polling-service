import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { NoticeBanner } from "@/components/notice-banner";
import { PollCard } from "@/components/poll-card";
import { PollComposer } from "@/components/poll-composer";
import { readNotice } from "@/lib/notice";
import { getCurrentUser, getFeedPosts } from "@/lib/server/platform";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [notice, currentUser, posts] = await Promise.all([
    readNotice(searchParams),
    getCurrentUser(),
    getFeedPosts(),
  ]);

  return (
    <AppShell currentUser={currentUser}>
      <section className="rounded-3xl border border-border bg-card p-8 shadow-sm">
        <span className="inline-flex rounded-full bg-accent/10 px-3 py-1 text-sm font-medium text-accent">
          MVP dashboard
        </span>
        <div className="mt-6 max-w-3xl space-y-4">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Build the poll-first social loop before everything else.
          </h1>
          <p className="text-lg leading-8 text-muted">
            This foundation now includes auth flows, profile onboarding, a poll
            composer, a feed, engagement actions, moderation scaffolding, and
            notifications pages designed for a hobby-scale rollout.
          </p>
        </div>
      </section>

      <NoticeBanner notice={notice} />

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="grid gap-6">
          <PollComposer currentUser={currentUser} />

          <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Implementation proposal</h2>
            <ul className="mt-4 grid gap-3 text-sm text-muted">
              <li>Next.js App Router for the web app and route handlers.</li>
              <li>Supabase for auth, PostgreSQL, storage, and access control.</li>
              <li>Vercel for low-friction hosting and preview deployments.</li>
              <li>In-app notifications before true push infrastructure.</li>
              <li>Moderation queue and report flow built into the MVP baseline.</li>
            </ul>
          </section>
        </div>

        <div className="grid gap-4">
          {posts.length === 0 ? (
            <EmptyState
              title="No poll posts yet"
              description="Create the first poll post to start validating the core engagement loop."
            />
          ) : (
            posts.map((post) => <PollCard key={post.id} post={post} />)
          )}
        </div>
      </div>
    </AppShell>
  );
}

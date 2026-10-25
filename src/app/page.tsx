import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { LoadError } from "@/components/load-error";
import { NoticeBanner } from "@/components/notice-banner";
import { PageSkeleton } from "@/components/page-skeleton";
import { PollCard } from "@/components/poll-card";
import { PollComposer } from "@/components/poll-composer";
import { readNotice } from "@/lib/notice";
import { readPollPreset } from "@/lib/poll-presets";
import { getCurrentUser, getFeedPosts } from "@/lib/server/platform";

export const dynamic = "force-dynamic";

type HomePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * `/` is the only route without its own `loading.tsx`, and it deliberately
 * stays that way: a `loading.tsx` here would create a Suspense boundary over
 * every nested segment, flushing a 200 shell before `/p/[postId]` and
 * `/u/[username]` can resolve their data — which is what made `notFound()`
 * in those routes return 200. Keeping the boundary inside this file gives the
 * feed its streaming skeleton without putting one above the permalink routes.
 */
export default function HomePage({ searchParams }: HomePageProps) {
  return (
    <Suspense fallback={<PageSkeleton cardCount={3} />}>
      <Feed searchParams={searchParams} />
    </Suspense>
  );
}

const ROUND_STEPS = [
  {
    title: "Set up the round",
    detail:
      "Pick the Awards / voting round preset: invite-only, results hidden until close, and a closing time.",
  },
  {
    title: "Send one link per voter",
    detail:
      "Issue invite links from the poll's page, labelled with names if you like. Each link casts exactly one ballot.",
  },
  {
    title: "Watch turnout, not choices",
    detail:
      "You see which links have been used and how many have voted. Nobody, you included, sees who chose what.",
  },
  {
    title: "Results at the deadline",
    detail:
      "Voting stops at the closing time, enforced by the database, and the tally appears for everyone at once.",
  },
] as const;

async function Feed({ searchParams }: HomePageProps) {
  const [notice, currentUser, posts, query] = await Promise.all([
    readNotice(searchParams),
    getCurrentUser(),
    getFeedPosts(),
    searchParams,
  ]);
  const preset = readPollPreset(query.preset);

  return (
    <AppShell currentUser={currentUser}>
      <section className="rounded-3xl border border-border bg-card p-8 shadow-sm">
        <span className="inline-flex rounded-full bg-accent/10 px-3 py-1 font-mono text-sm font-medium text-accent">
          Authentic voting rounds
        </span>
        <div className="mt-6 max-w-3xl space-y-4">
          <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">
            Run a vote people can trust.
          </h1>
          <p className="text-lg leading-8 text-muted">
            Staff awards, recognition votes and feedback rounds, where each
            ballot is one person and nobody sees who chose what. Send every
            voter a one-time invite link, set a closing time, and decide whether
            the results show live or only once voting ends. Voters don&apos;t
            need an account.
          </p>
        </div>
      </section>

      <NoticeBanner notice={notice} />

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="grid content-start gap-6">
          <PollComposer currentUser={currentUser} preset={preset} />

          <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
            <h2 className="font-display text-xl font-semibold">
              How a voting round works
            </h2>
            <ol className="mt-4 grid gap-3 divide-y divide-border text-sm [&>li]:pt-3 [&>li:first-child]:pt-0">
              {ROUND_STEPS.map((step, index) => (
                <li key={step.title} className="grid gap-1">
                  <span className="font-medium">
                    {index + 1}. {step.title}
                  </span>
                  <span className="text-muted">{step.detail}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div className="grid content-start gap-4">
          <h2 className="font-display text-xl font-semibold">Recent polls</h2>
          {posts.failed ? (
            <LoadError what="the polls" />
          ) : posts.data.length === 0 ? (
            <EmptyState
              title="No polls yet"
              description="Create the first voting round, or a quick poll, with the form on this page."
            />
          ) : (
            posts.data.map((post) => <PollCard key={post.id} post={post} />)
          )}
        </div>
      </div>
    </AppShell>
  );
}

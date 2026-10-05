import Link from "next/link";
import {
  createReportAction,
  setReactionAction,
  toggleRepostAction,
  voteOnPollAction,
} from "@/app/actions";
import type { FeedPost } from "@/lib/types";

function formatDate(isoTimestamp: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(isoTimestamp));
}

function votePercentage(post: FeedPost, optionVotes: number) {
  if (post.poll.totalVotes === 0) {
    return 0;
  }

  return Math.round((optionVotes / post.poll.totalVotes) * 100);
}

/**
 * `redirectTo` is where the engagement actions send the visitor afterwards, so
 * a vote cast on `/p/[postId]` comes back to that permalink instead of the
 * feed. Every form already carries it; the default keeps the feed unchanged.
 */
export function PollCard({
  post,
  redirectTo = "/",
}: {
  post: FeedPost;
  redirectTo?: string;
}) {
  // Anonymous ballots on an invite-mode poll need a pre-issued token, which
  // this app does not hand out yet, so a signed-out viewer gets the results
  // without buttons rather than a button that can only answer PV004. Signed-in
  // voters keep the existing path.
  const inviteOnly =
    post.poll.participationMode === "invite" && post.poll.viewerIsAnonymous === true;

  return (
    <article className="rounded-3xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-semibold">{post.author.displayName}</p>
          <p className="font-mono text-sm text-muted">
            <Link
              href={`/u/${post.author.username}`}
              className="transition hover:text-accent"
            >
              @{post.author.username}
            </Link>{" "}
            ·{" "}
            <Link
              href={`/p/${post.id}`}
              className="transition hover:text-accent"
            >
              {formatDate(post.createdAt)}
            </Link>
          </p>
        </div>
        <span className="rounded-full bg-background px-3 py-1 font-mono text-xs font-medium uppercase tracking-wide text-muted">
          {post.author.role}
        </span>
      </div>

      {post.body ? <p className="mt-4 text-sm leading-7">{post.body}</p> : null}

      {post.hashtags.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2 text-sm text-accent">
          {post.hashtags.map((tag) => (
            <span key={tag}>#{tag}</span>
          ))}
        </div>
      ) : null}

      <div className="mt-5 rounded-2xl border border-border bg-background p-4">
        <p className="font-mono text-sm font-medium uppercase tracking-wide text-muted">
          Poll
        </p>
        <h3 className="mt-2 font-display text-lg font-semibold">
          {post.poll.question}
        </h3>
        {inviteOnly ? (
          <p className="mt-2 text-sm text-muted">
            This poll is invite-only, so voting needs an invite link.
          </p>
        ) : null}
        <div className="mt-4 grid gap-3">
          {post.poll.options.map((option) => {
            const isSelected = post.poll.viewerVoteOptionId === option.id;
            const tally = (
              <div className="flex items-center justify-between gap-4">
                <span>{option.label}</span>
                <span className="font-mono text-sm text-muted">
                  {option.votes} votes · {votePercentage(post, option.votes)}%
                </span>
              </div>
            );

            if (inviteOnly) {
              return (
                <div
                  key={option.id}
                  className="rounded-2xl border border-border bg-card px-4 py-3"
                >
                  {tally}
                </div>
              );
            }

            return (
              <form key={option.id} action={voteOnPollAction} className="grid gap-2">
                <input type="hidden" name="redirectTo" value={redirectTo} />
                <input type="hidden" name="pollId" value={post.poll.id} />
                <input type="hidden" name="optionId" value={option.id} />
                <button
                  type="submit"
                  className={`rounded-2xl border px-4 py-3 text-left transition active:scale-[0.99] ${
                    isSelected
                      ? "border-accent bg-accent/10"
                      : "border-border bg-card hover:border-accent/50"
                  }`}
                >
                  {tally}
                </button>
              </form>
            );
          })}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3 text-sm">
        <form action={setReactionAction}>
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <input type="hidden" name="postId" value={post.id} />
          <input type="hidden" name="reactionType" value="like" />
          <button className="rounded-full border border-border px-4 py-2 transition active:scale-[0.96]">
            👍 {post.reactions.likes}
          </button>
        </form>

        <form action={setReactionAction}>
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <input type="hidden" name="postId" value={post.id} />
          <input type="hidden" name="reactionType" value="dislike" />
          <button className="rounded-full border border-border px-4 py-2 transition active:scale-[0.96]">
            👎 {post.reactions.dislikes}
          </button>
        </form>

        <form action={toggleRepostAction}>
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <input type="hidden" name="postId" value={post.id} />
          <button className="rounded-full border border-border px-4 py-2 transition active:scale-[0.96]">
            🔁 {post.reposts.viewerHasReposted ? "Reposted" : "Repost"} ·{" "}
            {post.reposts.count}
          </button>
        </form>

        <form action={createReportAction}>
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <input type="hidden" name="targetType" value="post" />
          <input type="hidden" name="targetPostId" value={post.id} />
          <input
            type="hidden"
            name="reason"
            value="Reported from the feed quick-action flow."
          />
          <button className="rounded-full border border-border px-4 py-2 transition hover:border-accent/50 active:scale-[0.96]">
            Report
          </button>
        </form>
      </div>
    </article>
  );
}

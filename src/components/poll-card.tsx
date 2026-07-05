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

export function PollCard({ post }: { post: FeedPost }) {
  return (
    <article className="rounded-3xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-semibold">{post.author.displayName}</p>
          <p className="text-sm text-muted">
            @{post.author.username} · {formatDate(post.createdAt)}
          </p>
        </div>
        <span className="rounded-full bg-background px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted">
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
        <p className="text-sm font-medium uppercase tracking-wide text-muted">
          Poll
        </p>
        <h3 className="mt-2 text-lg font-semibold">{post.poll.question}</h3>
        <div className="mt-4 grid gap-3">
          {post.poll.options.map((option) => {
            const isSelected = post.poll.viewerVoteOptionId === option.id;

            return (
              <form key={option.id} action={voteOnPollAction} className="grid gap-2">
                <input type="hidden" name="redirectTo" value="/" />
                <input type="hidden" name="pollId" value={post.poll.id} />
                <input type="hidden" name="optionId" value={option.id} />
                <button
                  type="submit"
                  className={`rounded-2xl border px-4 py-3 text-left transition ${
                    isSelected
                      ? "border-accent bg-violet-50"
                      : "border-border bg-card hover:border-accent/50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <span>{option.label}</span>
                    <span className="text-sm text-muted">
                      {option.votes} votes · {votePercentage(post, option.votes)}%
                    </span>
                  </div>
                </button>
              </form>
            );
          })}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3 text-sm">
        <form action={setReactionAction}>
          <input type="hidden" name="redirectTo" value="/" />
          <input type="hidden" name="postId" value={post.id} />
          <input type="hidden" name="reactionType" value="like" />
          <button className="rounded-full border border-border px-4 py-2">
            👍 {post.reactions.likes}
          </button>
        </form>

        <form action={setReactionAction}>
          <input type="hidden" name="redirectTo" value="/" />
          <input type="hidden" name="postId" value={post.id} />
          <input type="hidden" name="reactionType" value="dislike" />
          <button className="rounded-full border border-border px-4 py-2">
            👎 {post.reactions.dislikes}
          </button>
        </form>

        <form action={toggleRepostAction}>
          <input type="hidden" name="redirectTo" value="/" />
          <input type="hidden" name="postId" value={post.id} />
          <button className="rounded-full border border-border px-4 py-2">
            🔁 {post.reposts.viewerHasReposted ? "Reposted" : "Repost"} ·{" "}
            {post.reposts.count}
          </button>
        </form>

        <form action={createReportAction}>
          <input type="hidden" name="redirectTo" value="/" />
          <input type="hidden" name="targetType" value="post" />
          <input type="hidden" name="targetPostId" value={post.id} />
          <input
            type="hidden"
            name="reason"
            value="Reported from the feed quick-action flow."
          />
          <button className="rounded-full border border-border px-4 py-2">
            Report
          </button>
        </form>
      </div>
    </article>
  );
}

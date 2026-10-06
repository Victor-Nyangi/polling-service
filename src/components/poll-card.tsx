import Link from "next/link";
import {
  createReportAction,
  setReactionAction,
  toggleRepostAction,
  voteOnPollAction,
} from "@/app/actions";
import { INVITE_PARAM, type InviteParam, pollVoteAccess } from "@/lib/invite";
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

function inviteOnlyNote(invite: InviteParam, hasVoted: boolean) {
  if (invite.kind === "malformed") {
    return "This invite link isn't valid for this poll.";
  }

  return hasVoted
    ? "Your vote is in. This poll is invite-only."
    : "This poll is invite-only, so voting needs an invite link.";
}

/**
 * `redirectTo` is where the engagement actions send the visitor afterwards, so
 * a vote cast on `/p/[postId]` comes back to that permalink instead of the
 * feed. Every form already carries it; the default keeps the feed unchanged.
 * It never carries an invite token: the permalink page passes the bare path.
 *
 * `invite` is the permalink's `?invite=` param. Only an invite poll uses it:
 * with a well-formed token the buttons carry it as a hidden field, so the
 * vote goes through `cast_anonymous_vote` whoever is signed in; without one
 * the poll is results only, for everyone, since any other ballot on it is
 * refused (PV004 anonymous, PV006 signed in).
 */
export function PollCard({
  post,
  redirectTo = "/",
  invite = { kind: "none" },
}: {
  post: FeedPost;
  redirectTo?: string;
  invite?: InviteParam;
}) {
  const access = pollVoteAccess(post.poll.participationMode, invite);
  const permalink = `/p/${post.id}`;

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
        {access === "read-only" ? (
          <p className="mt-2 text-sm text-muted">
            {inviteOnlyNote(invite, Boolean(post.poll.viewerVoteOptionId))}
            {post.poll.viewerIsAuthor && redirectTo !== permalink ? (
              <>
                {" "}
                <Link href={permalink} className="text-accent transition hover:underline">
                  Manage invite links
                </Link>
              </>
            ) : null}
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

            if (access === "read-only") {
              return (
                <div
                  key={option.id}
                  className={`rounded-2xl border px-4 py-3 ${
                    isSelected ? "border-accent bg-accent/10" : "border-border bg-card"
                  }`}
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
                {access === "invite" && invite.kind === "token" ? (
                  <input type="hidden" name={INVITE_PARAM} value={invite.token} />
                ) : null}
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

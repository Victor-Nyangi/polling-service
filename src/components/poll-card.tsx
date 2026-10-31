import Link from "next/link";
import { createReportAction, voteOnPollAction } from "@/app/actions";
import { Spinner } from "@/components/spinner";
import { PendingGroup, SubmitButton } from "@/components/submit-button";
import { INVITE_PARAM, type InviteParam, pollVoteAccess } from "@/lib/invite";
import { PENDING_LABELS } from "@/lib/pending";
import {
  HIDDEN_RESULTS_LABEL,
  deadlineLabel,
  voteCountLabel,
} from "@/lib/poll-labels";
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

function readOnlyNote(post: FeedPost, invite: InviteParam, hasVoted: boolean) {
  if (post.poll.status === "closed") {
    return hasVoted ? "Your vote is in. Voting has closed." : "Voting has closed.";
  }

  if (invite.kind === "malformed") {
    return "This invite link isn't valid for this poll.";
  }

  return hasVoted
    ? "Your vote is in. This poll is invite-only."
    : "This poll is invite-only, so voting needs an invite link.";
}

/**
 * `redirectTo` is where the vote and report actions send the visitor
 * afterwards, so a vote cast on `/p/[postId]` comes back to that permalink
 * instead of the poll list. Every form already carries it; the default keeps
 * the poll list unchanged.
 * It never carries an invite token: the permalink page passes the bare path.
 *
 * `invite` is the permalink's `?invite=` param. Only an invite poll uses it:
 * with a well-formed token the buttons carry it as a hidden field, so the
 * vote goes through `cast_anonymous_vote` whoever is signed in; without one
 * the poll is results only, for everyone, since any other ballot on it is
 * refused (PV004 anonymous, PV006 signed in).
 *
 * A closed poll is results only for everyone, whatever its mode: the vote
 * trigger refuses a ballot after the deadline, so a button would only fail.
 * While a round hides its results, each option shows its label and no count;
 * the counts are not on the page to hide, because the database withheld them.
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
  const access =
    post.poll.status === "closed"
      ? "read-only"
      : pollVoteAccess(post.poll.participationMode, invite);
  const deadline = post.poll.closesAt ? deadlineLabel(post.poll.closesAt) : null;
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
            {readOnlyNote(post, invite, Boolean(post.poll.viewerVoteOptionId))}
            {post.poll.status !== "closed" &&
            post.poll.viewerIsAuthor &&
            redirectTo !== permalink ? (
              <>
                {" "}
                <Link href={permalink} className="text-accent transition hover:underline">
                  Manage invite links
                </Link>
              </>
            ) : null}
          </p>
        ) : null}
        {deadline || post.poll.resultsHidden ? (
          <p className="mt-2 font-mono text-xs uppercase tracking-wide text-muted">
            {[
              deadline
                ? `${post.poll.status === "closed" ? "Closed" : "Closes"} ${deadline}`
                : null,
              post.poll.resultsHidden
                ? `${HIDDEN_RESULTS_LABEL} · ${voteCountLabel(post.poll.totalVotes)} so far`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        ) : null}
        {/* One group, so voting one option locks the others until it lands. */}
        <PendingGroup className="mt-4 grid gap-3">
          {post.poll.options.map((option) => {
            const isSelected = post.poll.viewerVoteOptionId === option.id;
            const tally = (
              <div className="flex items-center justify-between gap-4">
                <span>{option.label}</span>
                {post.poll.resultsHidden ? (
                  isSelected ? (
                    <span className="font-mono text-sm text-muted">Your vote</span>
                  ) : null
                ) : (
                  <span className="font-mono text-sm text-muted">
                    {voteCountLabel(option.votes)} · {votePercentage(post, option.votes)}%
                  </span>
                )}
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
                <SubmitButton
                  pendingLabel={PENDING_LABELS.vote}
                  pendingContent={
                    <div className="flex items-center justify-between gap-4">
                      <span>{option.label}</span>
                      <span className="inline-flex items-center gap-2 font-mono text-sm text-accent">
                        <Spinner />
                        {PENDING_LABELS.vote}
                      </span>
                    </div>
                  }
                  className={`rounded-2xl border px-4 py-3 text-left transition enabled:active:scale-[0.99] aria-busy:border-accent ${
                    isSelected
                      ? "border-accent bg-accent/10"
                      : "border-border bg-card enabled:hover:border-accent/50"
                  }`}
                >
                  {tally}
                </SubmitButton>
              </form>
            );
          })}
        </PendingGroup>
      </div>

      <div className="mt-5 flex flex-wrap gap-3 text-sm">
        <form action={createReportAction}>
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <input type="hidden" name="targetType" value="post" />
          <input type="hidden" name="targetPostId" value={post.id} />
          <input
            type="hidden"
            name="reason"
            value="Reported from the poll card quick-action flow."
          />
          <SubmitButton
            pendingLabel={PENDING_LABELS.report}
            className="rounded-full border border-border px-4 py-2 transition enabled:hover:border-accent/50 enabled:active:scale-[0.96]"
          >
            Report
          </SubmitButton>
        </form>
      </div>
    </article>
  );
}

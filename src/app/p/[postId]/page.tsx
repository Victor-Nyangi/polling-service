import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { revokeInviteAction, setParticipationModeAction } from "@/app/actions";
import { AppShell } from "@/components/app-shell";
import { InviteIssuer } from "@/components/invite-issuer";
import { LoadError } from "@/components/load-error";
import { NoticeBanner } from "@/components/notice-banner";
import { PollCard } from "@/components/poll-card";
import { INVITE_PARAM, readInviteParam, summarizeTurnout } from "@/lib/invite";
import { readNotice } from "@/lib/notice";
import {
  getCurrentUser,
  getPollInvites,
  getPostById,
} from "@/lib/server/platform";
import type { FeedPost } from "@/lib/types";

export const dynamic = "force-dynamic";

type PostPageProps = {
  params: Promise<{ postId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * `generateMetadata` and the page body both need the post. There is no `fetch`
 * here to be memoized, so React's `cache` is what keeps it to one Supabase
 * round trip per request.
 */
const loadPost = cache(getPostById);

function voteLabel(totalVotes: number) {
  return totalVotes === 1 ? "1 vote" : `${totalVotes} votes`;
}

function describe(post: FeedPost) {
  const body = post.body?.trim();

  if (body) {
    return `${body} — ${voteLabel(post.poll.totalVotes)} so far on "${post.poll.question}".`;
  }

  return `${post.poll.options.map((option) => option.label).join(" · ")} — ${voteLabel(
    post.poll.totalVotes,
  )} so far.`;
}

/**
 * An invite link is a bearer credential in this page's URL. `no-referrer`
 * keeps it out of the Referer header of anything the page links to or loads.
 * next.config.ts sends the same policy as a response header for every
 * `/p/:postId`; this meta tag is the copy that travels with the HTML.
 *
 * Built from `params` only, never `searchParams`, so the token cannot reach
 * the title, description, or OpenGraph tags, and no canonical or og:url is
 * emitted for it to be copied into.
 */
export async function generateMetadata({
  params,
}: PostPageProps): Promise<Metadata> {
  const { postId } = await params;
  const post = await loadPost(postId);

  if (!post.data) {
    return {
      title: "Poll not found",
      description: "This poll is not available.",
      referrer: "no-referrer",
    };
  }

  const title = `${post.data.poll.question} — @${post.data.author.username}`;
  const description = describe(post.data);

  return {
    title,
    description,
    referrer: "no-referrer",
    openGraph: {
      title,
      description,
      type: "article",
      siteName: "Digital Brand Platform",
      publishedTime: post.data.createdAt,
      authors: [post.data.author.displayName],
    },
  };
}

export default async function PostPage({
  params,
  searchParams,
}: PostPageProps) {
  const { postId } = await params;
  const [notice, currentUser, post, query] = await Promise.all([
    readNotice(searchParams),
    getCurrentUser(),
    loadPost(postId),
    searchParams,
  ]);
  const invite = readInviteParam(query[INVITE_PARAM]);

  if (post.failed) {
    return (
      <AppShell currentUser={currentUser}>
        <NoticeBanner notice={notice} />
        <LoadError what="this poll" />
      </AppShell>
    );
  }

  if (!post.data) {
    notFound();
  }

  // The bare permalink, never the address this request came in on: every
  // form below redirects here, so an invite token cannot ride a redirect.
  const permalink = `/p/${post.data.id}`;

  return (
    <AppShell currentUser={currentUser}>
      <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
        <span className="inline-flex rounded-full bg-accent/10 px-3 py-1 font-mono text-sm font-medium text-accent">
          Shared poll
        </span>
        <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight">
          {post.data.poll.question}
        </h1>
        <p className="mt-3 text-sm text-muted">
          Asked by{" "}
          <Link
            href={`/u/${post.data.author.username}`}
            className="text-accent transition hover:underline"
          >
            @{post.data.author.username}
          </Link>{" "}
          · {voteLabel(post.data.poll.totalVotes)} ·{" "}
          {post.data.poll.status === "closed" ? "Closed" : "Open"}
        </p>
      </section>

      <NoticeBanner notice={notice} />

      <PollCard post={post.data} redirectTo={permalink} invite={invite} />

      {post.data.poll.viewerIsAuthor ? (
        <OwnerPanel post={post.data} permalink={permalink} />
      ) : null}

      <p className="text-sm text-muted">
        <Link href="/" className="text-accent transition hover:underline">
          Back to the feed
        </Link>
      </p>
    </AppShell>
  );
}

function formatIssued(isoTimestamp: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
    new Date(isoTimestamp),
  );
}

/**
 * The poll's owner controls: who can vote, and for an invite poll the links
 * and the turnout. Rendered only when the signed-in viewer is the author; the
 * actions and RLS each check that again.
 *
 * Turnout is used / not used per invite, and a count. Never a time of use and
 * never a choice: the page has no way to read which option an invite chose,
 * and it shows nothing that would let the owner line one up with the tally.
 */
async function OwnerPanel({
  post,
  permalink,
}: {
  post: FeedPost;
  permalink: string;
}) {
  const mode = post.poll.participationMode === "invite" ? "invite" : "open";
  const invites = mode === "invite" ? await getPollInvites(post.poll.id) : null;
  const turnout = invites ? summarizeTurnout(invites.data) : null;
  const canSwitch = post.poll.totalVotes === 0;

  return (
    <section className="grid gap-6 rounded-3xl border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="font-mono text-sm font-medium uppercase tracking-wide text-muted">
            Your poll
          </span>
          <h2 className="mt-2 font-display text-xl font-semibold">
            {mode === "invite" ? "Invite-only" : "Open to anyone"}
          </h2>
          <p className="mt-1 max-w-prose text-sm text-muted">
            {canSwitch
              ? "You can change who votes until the first vote arrives."
              : "Who can vote is fixed now that this poll has votes."}
          </p>
        </div>
        {canSwitch ? (
          <form action={setParticipationModeAction}>
            <input type="hidden" name="redirectTo" value={permalink} />
            <input type="hidden" name="pollId" value={post.poll.id} />
            <input
              type="hidden"
              name="mode"
              value={mode === "invite" ? "open" : "invite"}
            />
            <button className="rounded-full border border-border px-4 py-2 text-sm font-medium transition hover:border-accent/50 active:scale-[0.97]">
              {mode === "invite" ? "Open it to anyone" : "Make it invite-only"}
            </button>
          </form>
        ) : null}
      </div>

      {mode === "invite" && invites && turnout ? (
        <>
          <div className="grid gap-3">
            <h3 className="font-display text-lg font-semibold">Invite links</h3>
            <InviteIssuer pollId={post.poll.id} redirectTo={permalink} />
          </div>

          <div className="grid gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-display text-lg font-semibold">Turnout</h3>
              <p className="font-mono text-sm text-muted">{turnout.text}</p>
            </div>
            {invites.failed ? (
              <p className="text-sm text-muted">
                The invite list didn&apos;t load. Reload the page to try again.
              </p>
            ) : invites.data.length === 0 ? (
              <p className="text-sm text-muted">
                No invites yet. Issued invites appear here with whether each
                one has been used.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-2xl border border-border bg-background">
                {/* Keyed by position, not hash: a key is serialised into the
                    page payload, and a used invite's hash has no business
                    there. The list only changes on a full re-render. */}
                {invites.data.map((invite, index) => (
                  <li
                    key={index}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p
                        className={`truncate text-sm font-medium ${
                          invite.label ? "" : "text-muted"
                        }`}
                      >
                        {invite.label ?? "Unnamed"}
                      </p>
                      <p className="font-mono text-xs text-muted">
                        Issued {formatIssued(invite.issuedAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`rounded-full px-3 py-1 font-mono text-xs uppercase tracking-wide ${
                          invite.used
                            ? "bg-accent/10 text-accent"
                            : "border border-border text-muted"
                        }`}
                      >
                        {invite.used ? "Used" : "Not used"}
                      </span>
                      {invite.used || !invite.tokenHash ? null : (
                        <form action={revokeInviteAction}>
                          <input type="hidden" name="redirectTo" value={permalink} />
                          <input type="hidden" name="pollId" value={post.poll.id} />
                          <input
                            type="hidden"
                            name="tokenHash"
                            value={invite.tokenHash}
                          />
                          <button className="rounded-full border border-border px-3 py-1 text-sm transition hover:border-accent/50 active:scale-[0.96]">
                            Revoke
                          </button>
                        </form>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}

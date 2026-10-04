import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { AppShell } from "@/components/app-shell";
import { LoadError } from "@/components/load-error";
import { NoticeBanner } from "@/components/notice-banner";
import { PollCard } from "@/components/poll-card";
import { readNotice } from "@/lib/notice";
import { getCurrentUser, getPostById } from "@/lib/server/platform";
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

export async function generateMetadata({
  params,
}: PostPageProps): Promise<Metadata> {
  const { postId } = await params;
  const post = await loadPost(postId);

  if (!post.data) {
    return {
      title: "Poll not found",
      description: "This poll is not available.",
    };
  }

  const title = `${post.data.poll.question} — @${post.data.author.username}`;
  const description = describe(post.data);

  return {
    title,
    description,
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
  const [notice, currentUser, post] = await Promise.all([
    readNotice(searchParams),
    getCurrentUser(),
    loadPost(postId),
  ]);

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

      <PollCard post={post.data} redirectTo={permalink} />

      <p className="text-sm text-muted">
        <Link href="/" className="text-accent transition hover:underline">
          Back to the feed
        </Link>
      </p>
    </AppShell>
  );
}

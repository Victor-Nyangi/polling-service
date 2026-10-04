import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { LoadError } from "@/components/load-error";
import { NoticeBanner } from "@/components/notice-banner";
import { PollCard } from "@/components/poll-card";
import { readNotice } from "@/lib/notice";
import { getCurrentUser, getProfileByUsername } from "@/lib/server/platform";

export const dynamic = "force-dynamic";

type ProfilePageProps = {
  params: Promise<{ username: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Shared between `generateMetadata` and the page body so the profile and its
 * posts are read once per request.
 */
const loadProfile = cache(getProfileByUsername);

function joinedLabel(isoTimestamp: string) {
  return new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
  }).format(new Date(isoTimestamp));
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export async function generateMetadata({
  params,
}: ProfilePageProps): Promise<Metadata> {
  const { username } = await params;
  const page = await loadProfile(username);

  if (!page.data) {
    return {
      title: "Profile not found",
      description: "This profile is not available.",
    };
  }

  const { profile, posts } = page.data;
  const title = `${profile.displayName} (@${profile.username})`;
  const description =
    profile.bio?.trim() ||
    `${profile.displayName} has published ${posts.length === 1 ? "1 poll" : `${posts.length} polls`} since joining in ${joinedLabel(profile.joinedAt)}.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "profile",
      siteName: "Digital Brand Platform",
      username: profile.username,
    },
  };
}

export default async function ProfilePage({
  params,
  searchParams,
}: ProfilePageProps) {
  const { username } = await params;
  const [notice, currentUser, page] = await Promise.all([
    readNotice(searchParams),
    getCurrentUser(),
    loadProfile(username),
  ]);

  if (page.failed) {
    return (
      <AppShell currentUser={currentUser}>
        <NoticeBanner notice={notice} />
        <LoadError what="this profile" />
      </AppShell>
    );
  }

  if (!page.data) {
    notFound();
  }

  const { profile, posts } = page.data;
  const permalink = `/u/${profile.username}`;

  return (
    <AppShell currentUser={currentUser}>
      <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-start gap-5">
          {profile.avatarUrl ? (
            /* `avatar_url` holds an arbitrary remote URL and next.config.ts
               allowlists no image domains, so next/image would reject it at
               request time. A plain img is correct until there is an upload
               flow writing avatars to a known bucket. */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatarUrl}
              alt=""
              className="h-16 w-16 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-strong text-lg font-semibold text-white">
              {initials(profile.displayName)}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <h1 className="font-display text-3xl font-semibold tracking-tight">
              {profile.displayName}
            </h1>
            <p className="mt-1 font-mono text-sm text-muted">
              @{profile.username} · joined {joinedLabel(profile.joinedAt)}
            </p>
            {profile.bio ? (
              <p className="mt-3 max-w-2xl text-sm leading-7">{profile.bio}</p>
            ) : null}
          </div>

          <span className="rounded-full bg-background px-3 py-1 font-mono text-xs font-medium uppercase tracking-wide text-muted">
            {profile.role}
          </span>
        </div>
      </section>

      <NoticeBanner notice={notice} />

      <section className="grid gap-4">
        <h2 className="font-display text-xl font-semibold">
          Polls by @{profile.username}
        </h2>
        {posts.length === 0 ? (
          <EmptyState
            title="No polls yet"
            description="This account has not published a poll post yet."
          />
        ) : (
          posts.map((post) => (
            <PollCard key={post.id} post={post} redirectTo={permalink} />
          ))
        )}
      </section>

      <p className="text-sm text-muted">
        <Link href="/" className="text-accent transition hover:underline">
          Back to the feed
        </Link>
      </p>
    </AppShell>
  );
}

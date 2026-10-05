import "server-only";

import { cookies } from "next/headers";
import {
  BALLOT_MARKER_COOKIE,
  type BallotMarker,
  parseBallotMarker,
  participationModeOf,
} from "@/lib/anonymous-vote";
import { hasSupabasePublicEnv } from "@/lib/env";
import {
  demoCurrentUser,
  demoFeedPosts,
  demoNotifications,
  demoProfiles,
  demoReports,
} from "@/lib/demo-data";
import { embeddedRows, firstEmbedded } from "@/lib/embeds";
import { renderNotification } from "@/lib/notifications";
import { createClient } from "@/lib/supabase/server";
import { validateUsername } from "@/lib/username";
import type {
  AppNotification,
  CurrentUser,
  FeedPost,
  Loaded,
  ModerationReport,
  PollOption,
  PublicProfilePage,
} from "@/lib/types";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * `posts.id` is a uuid, and PostgREST turns a non-uuid filter value into a
 * Postgres cast error rather than an empty result. Without this guard
 * `/p/not-a-uuid` would render "something broke on our side" instead of a 404.
 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The single post projection, shared by the feed, `/p/[postId]`, and the post
 * list on `/u/[username]`. `mapFeedPost` depends on the exact embed shape this
 * select produces, so the three callers must not drift apart.
 */
const POST_SELECT = `
        id,
        body,
        image_url,
        hashtags,
        created_at,
        author:profiles!posts_author_id_fkey (
          user_id,
          username,
          display_name,
          avatar_url,
          role
        ),
        poll:polls (
          id,
          question,
          status,
          participation_mode,
          poll_options ( id, label, position ),
          poll_votes ( option_id )
        ),
        reactions ( reaction_type, user_id ),
        reposts ( user_id )
      `;

function formatProfile(profile: Record<string, unknown> | null | undefined) {
  return {
    id: String(profile?.user_id ?? ""),
    username: String(profile?.username ?? "new-user"),
    displayName: String(profile?.display_name ?? profile?.username ?? "New user"),
    avatarUrl:
      typeof profile?.avatar_url === "string" ? profile.avatar_url : undefined,
    role:
      profile?.role === "moderator" || profile?.role === "admin"
        ? profile.role
        : "user",
  } as const;
}

/**
 * What the post mapper needs to know about who is looking. `ballots` is set
 * only for an anonymous viewer: their `pv_ballots` marker cookie, written by
 * `voteOnPollAction` after a successful anonymous vote.
 */
type Viewer = {
  id: string | undefined;
  ballots: BallotMarker | undefined;
};

async function resolveViewer(currentUser: CurrentUser | null): Promise<Viewer> {
  if (currentUser) {
    return { id: currentUser.id, ballots: undefined };
  }

  const cookieStore = await cookies();

  return {
    id: undefined,
    ballots: parseBallotMarker(cookieStore.get(BALLOT_MARKER_COOKIE)?.value),
  };
}

function mapFeedPost(
  row: Record<string, unknown>,
  viewer: Viewer,
  voteCounts: Map<string, number>,
): FeedPost | null {
  const viewerId = viewer.id;
  // `polls.post_id` is `not null unique`, so PostgREST proves this embed is
  // to-one and returns a bare object rather than a one-element array. Branching
  // on the shape here is what silently dropped every post.
  const pollRow = firstEmbedded(row.poll);

  if (!pollRow) {
    return null;
  }

  const voteRows = embeddedRows(pollRow.poll_votes);
  const optionRows = embeddedRows(pollRow.poll_options);
  const reactionRows = embeddedRows(row.reactions);
  const repostRows = embeddedRows(row.reposts);
  // RLS restricts poll_votes to the viewer's own rows, so this is their vote
  // and nobody else's. Tallies come from the aggregate view instead.
  const viewerVote = voteRows[0];
  const viewerReaction = reactionRows.find((reaction) => reaction.user_id === viewerId);
  const options: PollOption[] = optionRows
    .map((option) => ({
      id: String(option.id),
      label: String(option.label ?? "Untitled option"),
      position: Number(option.position ?? 0),
      votes: voteCounts.get(String(option.id)) ?? 0,
    }))
    .sort((left, right) => left.position - right.position);
  const totalVotes = options.reduce((sum, option) => sum + option.votes, 0);
  const pollId = String(pollRow.id);
  // An anonymous viewer has no poll_votes row they can read (RLS keys on
  // auth.uid()), so their choice comes from the marker cookie instead — and
  // only if it names an option this poll actually has.
  const markedOptionId = viewer.ballots?.get(pollId.toLowerCase());
  const viewerVoteOptionId = viewer.ballots
    ? options.find((option) => option.id.toLowerCase() === markedOptionId)?.id
    : typeof viewerVote?.option_id === "string"
      ? viewerVote.option_id
      : undefined;

  return {
    id: String(row.id),
    body: typeof row.body === "string" ? row.body : undefined,
    imageUrl: typeof row.image_url === "string" ? row.image_url : undefined,
    hashtags: Array.isArray(row.hashtags)
      ? row.hashtags.map((tag) => String(tag))
      : [],
    createdAt: String(row.created_at ?? new Date().toISOString()),
    // `author:profiles!posts_author_id_fkey` is to-one, so this arrives as an
    // object today. Normalising it anyway means a schema change that flips the
    // shape degrades to the "New user" fallbacks instead of mis-rendering.
    author: formatProfile(firstEmbedded(row.author)),
    poll: {
      id: pollId,
      question: String(pollRow.question ?? "Untitled poll"),
      status: pollRow.status === "closed" ? "closed" : "active",
      options,
      totalVotes,
      viewerVoteOptionId,
      participationMode: participationModeOf(pollRow.participation_mode),
      viewerIsAnonymous: viewerId === undefined,
    },
    reactions: {
      likes: reactionRows.filter((reaction) => reaction.reaction_type === "like")
        .length,
      dislikes: reactionRows.filter(
        (reaction) => reaction.reaction_type === "dislike",
      ).length,
      viewerReaction:
        viewerReaction?.reaction_type === "like" ||
        viewerReaction?.reaction_type === "dislike"
          ? viewerReaction.reaction_type
          : undefined,
    },
    reposts: {
      count: repostRows.length,
      viewerHasReposted: repostRows.some((repost) => repost.user_id === viewerId),
    },
  };
}

/**
 * Tallies for every poll embedded in `rows`, read from the
 * `poll_option_vote_counts` view (which is `security_invoker = false`, so totals
 * are public while `poll_votes.voter_id` stays private).
 *
 * Returns `null` on a query failure so callers can report an outage instead of
 * rendering every poll as zero votes.
 */
async function loadVoteCounts(
  supabase: ServerClient,
  rows: Array<Record<string, unknown>>,
): Promise<Map<string, number> | null> {
  const voteCounts = new Map<string, number>();
  const pollIds = rows
    .flatMap((row) => embeddedRows(row.poll))
    .map((poll) => String(poll.id ?? ""))
    .filter(Boolean);

  if (pollIds.length === 0) {
    return voteCounts;
  }

  const { data: countRows, error } = await supabase
    .from("poll_option_vote_counts")
    .select("option_id, votes")
    .in("poll_id", pollIds);

  if (error) {
    return null;
  }

  for (const countRow of countRows ?? []) {
    voteCounts.set(String(countRow.option_id), Number(countRow.votes ?? 0));
  }

  return voteCounts;
}

export function isDemoMode() {
  return !hasSupabasePublicEnv();
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  if (!hasSupabasePublicEnv()) {
    return demoCurrentUser;
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "user_id, username, display_name, bio, avatar_url, interests, role, onboarded_at",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  return {
    id: user.id,
    email: user.email,
    username: String(profile?.username ?? user.email?.split("@")[0] ?? "new-user"),
    displayName: String(
      profile?.display_name ?? user.user_metadata.display_name ?? "New user",
    ),
    bio: typeof profile?.bio === "string" ? profile.bio : undefined,
    avatarUrl:
      typeof profile?.avatar_url === "string" ? profile.avatar_url : undefined,
    interests: Array.isArray(profile?.interests)
      ? profile.interests.map((interest) => String(interest))
      : [],
    role:
      profile?.role === "moderator" || profile?.role === "admin"
        ? profile.role
        : "user",
    needsOnboarding: !profile?.onboarded_at,
  };
}

export async function getFeedPosts(): Promise<Loaded<FeedPost[]>> {
  if (!hasSupabasePublicEnv()) {
    return { data: demoFeedPosts, failed: false };
  }

  const currentUser = await getCurrentUser();
  const viewer = await resolveViewer(currentUser);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("posts")
    .select(POST_SELECT)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error || !data) {
    return { data: [], failed: true };
  }

  const rows = data as Array<Record<string, unknown>>;
  const voteCounts = await loadVoteCounts(supabase, rows);

  if (!voteCounts) {
    return { data: [], failed: true };
  }

  return {
    data: rows
      .map((row) => mapFeedPost(row, viewer, voteCounts))
      .filter((post): post is FeedPost => Boolean(post)),
    failed: false,
  };
}

/**
 * One post for the `/p/[postId]` permalink. `data: null` with `failed: false`
 * means "no such post" (the caller should 404); `failed: true` means the read
 * itself broke.
 *
 * Deliberately not gated on a signed-in viewer: the whole point of a permalink
 * is that it works for someone who followed a shared link. RLS makes posts,
 * polls, options, reactions, and reposts publicly readable, and the vote view
 * is granted to `anon`.
 */
export async function getPostById(
  postId: string,
): Promise<Loaded<FeedPost | null>> {
  if (!hasSupabasePublicEnv()) {
    return {
      data: demoFeedPosts.find((post) => post.id === postId) ?? null,
      failed: false,
    };
  }

  if (!UUID_PATTERN.test(postId)) {
    return { data: null, failed: false };
  }

  const currentUser = await getCurrentUser();
  const viewer = await resolveViewer(currentUser);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("posts")
    .select(POST_SELECT)
    .eq("id", postId)
    .maybeSingle();

  if (error) {
    return { data: null, failed: true };
  }

  if (!data) {
    return { data: null, failed: false };
  }

  const rows = [data as Record<string, unknown>];
  const voteCounts = await loadVoteCounts(supabase, rows);

  if (!voteCounts) {
    return { data: null, failed: true };
  }

  // A post whose poll row is missing cannot be rendered by `PollCard`, and
  // every post in this product has one, so treat it as absent rather than
  // crashing the permalink.
  return {
    data: mapFeedPost(rows[0], viewer, voteCounts),
    failed: false,
  };
}

/**
 * A public profile plus that author's posts, for `/u/[username]`. The lookup
 * uses the normalised handle, so `/u/@Nyangi_Vic` resolves the same row as
 * `/u/nyangi_vic`, and a handle that could never exist (wrong characters,
 * wrong length) short-circuits to "not found" without a query.
 */
export async function getProfileByUsername(
  username: string,
): Promise<Loaded<PublicProfilePage | null>> {
  const handle = validateUsername(username);

  if (!handle.ok) {
    return { data: null, failed: false };
  }

  if (!hasSupabasePublicEnv()) {
    const profile = demoProfiles.find(
      (candidate) => candidate.username === handle.username,
    );

    if (!profile) {
      return { data: null, failed: false };
    }

    return {
      data: {
        profile,
        posts: demoFeedPosts.filter(
          (post) => post.author.username === handle.username,
        ),
      },
      failed: false,
    };
  }

  const currentUser = await getCurrentUser();
  const viewer = await resolveViewer(currentUser);
  const supabase = await createClient();
  const { data: profileRow, error: profileError } = await supabase
    .from("profiles")
    .select(
      "user_id, username, display_name, bio, avatar_url, role, created_at",
    )
    .eq("username", handle.username)
    .maybeSingle();

  if (profileError) {
    return { data: null, failed: true };
  }

  if (!profileRow) {
    return { data: null, failed: false };
  }

  const { data: postData, error: postError } = await supabase
    .from("posts")
    .select(POST_SELECT)
    .eq("author_id", profileRow.user_id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (postError || !postData) {
    return { data: null, failed: true };
  }

  const rows = postData as Array<Record<string, unknown>>;
  const voteCounts = await loadVoteCounts(supabase, rows);

  if (!voteCounts) {
    return { data: null, failed: true };
  }

  return {
    data: {
      profile: {
        ...formatProfile(profileRow as Record<string, unknown>),
        bio: typeof profileRow.bio === "string" ? profileRow.bio : undefined,
        joinedAt: String(profileRow.created_at ?? new Date().toISOString()),
      },
      posts: rows
        .map((row) => mapFeedPost(row, viewer, voteCounts))
        .filter((post): post is FeedPost => Boolean(post)),
    },
    failed: false,
  };
}

export async function getNotifications(): Promise<Loaded<AppNotification[]>> {
  if (!hasSupabasePublicEnv()) {
    return { data: demoNotifications, failed: false };
  }

  // Deliberately not gated on getCurrentUser(): it returns null both when the
  // visitor is signed out and when the request to Supabase failed, which would
  // render an outage as an empty inbox. RLS already scopes this to the
  // recipient, so a signed-out visitor gets no rows and a real failure surfaces
  // as an error instead.
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, payload, created_at, read_at")
    .order("created_at", { ascending: false })
    .limit(30);

  if (error || !data) {
    return { data: [], failed: true };
  }

  const notifications: AppNotification[] = data.map((notification) => {
    const payload =
      notification.payload && typeof notification.payload === "object"
        ? (notification.payload as Record<string, unknown>)
        : {};
    const { title, body } = renderNotification(
      String(notification.type),
      payload,
    );

    return {
      id: String(notification.id),
      type: String(notification.type),
      title,
      body,
      createdAt: String(notification.created_at ?? new Date().toISOString()),
      readAt:
        typeof notification.read_at === "string"
          ? notification.read_at
          : undefined,
    };
  });

  return { data: notifications, failed: false };
}

export async function getModerationReports(): Promise<Loaded<ModerationReport[]>> {
  if (!hasSupabasePublicEnv()) {
    return { data: demoReports, failed: false };
  }

  const currentUser = await getCurrentUser();

  // Short-circuit only when we positively know the viewer is not staff. A null
  // user is ambiguous (signed out, or the request failed), so let the query
  // run and report a genuine failure. The "staff can read all reports" policy
  // is the authoritative check either way.
  if (currentUser && currentUser.role !== "moderator" && currentUser.role !== "admin") {
    return { data: [], failed: false };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reports")
    .select(
      `
        id,
        target_type,
        reason,
        status,
        created_at,
        target_post:posts ( body ),
        target_user:profiles!reports_target_user_id_fkey ( username, display_name ),
        reporter:profiles!reports_reporter_id_fkey ( username )
      `,
    )
    .order("created_at", { ascending: false })
    .limit(25);

  if (error || !data) {
    return { data: [], failed: true };
  }

  const reports: ModerationReport[] = data.map((report) => {
    // These three were already shape-agnostic; routed through the shared
    // helper so there is one place left in this file that knows about embeds.
    const targetPost = firstEmbedded(report.target_post);
    const targetUser = firstEmbedded(report.target_user);
    const reporter = firstEmbedded(report.reporter);

    return {
      id: String(report.id),
      targetType: report.target_type === "user" ? "user" : "post",
      targetLabel:
        report.target_type === "user"
          ? `User: ${String(targetUser?.display_name ?? targetUser?.username ?? "Unknown")}`
          : `Post: ${String(targetPost?.body ?? "Untitled post")}`,
      reporterLabel: String(reporter?.username ?? "unknown"),
      reason: String(report.reason ?? ""),
      status:
        report.status === "reviewed" || report.status === "closed"
          ? report.status
          : "open",
      createdAt: String(report.created_at ?? new Date().toISOString()),
    };
  });

  return { data: reports, failed: false };
}

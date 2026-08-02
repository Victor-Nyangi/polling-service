import "server-only";

import { hasSupabasePublicEnv } from "@/lib/env";
import {
  demoCurrentUser,
  demoFeedPosts,
  demoNotifications,
  demoReports,
} from "@/lib/demo-data";
import { renderNotification } from "@/lib/notifications";
import { createClient } from "@/lib/supabase/server";
import type {
  AppNotification,
  CurrentUser,
  FeedPost,
  Loaded,
  ModerationReport,
  PollOption,
} from "@/lib/types";

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

function mapFeedPost(
  row: Record<string, unknown>,
  viewerId: string | undefined,
  voteCounts: Map<string, number>,
): FeedPost | null {
  const pollRows = Array.isArray(row.poll) ? row.poll : [];
  const pollRow = pollRows[0] as Record<string, unknown> | undefined;

  if (!pollRow) {
    return null;
  }

  const voteRows = Array.isArray(pollRow.poll_votes)
    ? (pollRow.poll_votes as Array<Record<string, unknown>>)
    : [];
  const optionRows = Array.isArray(pollRow.poll_options)
    ? (pollRow.poll_options as Array<Record<string, unknown>>)
    : [];
  const reactionRows = Array.isArray(row.reactions)
    ? (row.reactions as Array<Record<string, unknown>>)
    : [];
  const repostRows = Array.isArray(row.reposts)
    ? (row.reposts as Array<Record<string, unknown>>)
    : [];
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

  return {
    id: String(row.id),
    body: typeof row.body === "string" ? row.body : undefined,
    imageUrl: typeof row.image_url === "string" ? row.image_url : undefined,
    hashtags: Array.isArray(row.hashtags)
      ? row.hashtags.map((tag) => String(tag))
      : [],
    createdAt: String(row.created_at ?? new Date().toISOString()),
    author: formatProfile(row.author as Record<string, unknown>),
    poll: {
      id: String(pollRow.id),
      question: String(pollRow.question ?? "Untitled poll"),
      status: pollRow.status === "closed" ? "closed" : "active",
      options,
      totalVotes,
      viewerVoteOptionId:
        typeof viewerVote?.option_id === "string" ? viewerVote.option_id : undefined,
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
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("posts")
    .select(
      `
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
          poll_options ( id, label, position ),
          poll_votes ( option_id )
        ),
        reactions ( reaction_type, user_id ),
        reposts ( user_id )
      `,
    )
    .order("created_at", { ascending: false })
    .limit(20);

  if (error || !data) {
    return { data: [], failed: true };
  }

  const rows = data as Array<Record<string, unknown>>;
  const pollIds = rows
    .flatMap((row) => (Array.isArray(row.poll) ? row.poll : []))
    .map((poll) => String((poll as Record<string, unknown>).id ?? ""))
    .filter(Boolean);

  const voteCounts = new Map<string, number>();

  if (pollIds.length > 0) {
    const { data: countRows, error: countError } = await supabase
      .from("poll_option_vote_counts")
      .select("option_id, votes")
      .in("poll_id", pollIds);

    if (countError) {
      return { data: [], failed: true };
    }

    for (const countRow of countRows ?? []) {
      voteCounts.set(String(countRow.option_id), Number(countRow.votes ?? 0));
    }
  }

  return {
    data: rows
      .map((row) => mapFeedPost(row, currentUser?.id, voteCounts))
      .filter((post): post is FeedPost => Boolean(post)),
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
  // user is ambiguous — signed out, or the request failed — so let the query
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
    const targetPost = Array.isArray(report.target_post)
      ? report.target_post[0]
      : report.target_post;
    const targetUser = Array.isArray(report.target_user)
      ? report.target_user[0]
      : report.target_user;
    const reporter = Array.isArray(report.reporter)
      ? report.reporter[0]
      : report.reporter;

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

import "server-only";

import { hasSupabasePublicEnv } from "@/lib/env";
import {
  demoCurrentUser,
  demoFeedPosts,
  demoNotifications,
  demoReports,
} from "@/lib/demo-data";
import { createClient } from "@/lib/supabase/server";
import type {
  AppNotification,
  CurrentUser,
  FeedPost,
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

function toVoteCount(
  optionId: string,
  votes: Array<Record<string, unknown>> | null | undefined,
) {
  return (votes ?? []).filter((vote) => vote.option_id === optionId).length;
}

function mapFeedPost(
  row: Record<string, unknown>,
  viewerId?: string,
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
  const viewerVote = voteRows.find((vote) => vote.voter_id === viewerId);
  const viewerReaction = reactionRows.find((reaction) => reaction.user_id === viewerId);
  const options: PollOption[] = optionRows
    .map((option) => ({
      id: String(option.id),
      label: String(option.label ?? "Untitled option"),
      position: Number(option.position ?? 0),
      votes: toVoteCount(String(option.id), voteRows),
    }))
    .sort((left, right) => left.position - right.position);

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
      totalVotes: voteRows.length,
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
    .select("user_id, username, display_name, bio, avatar_url, interests, role")
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
    needsOnboarding: !profile,
  };
}

export async function getFeedPosts(): Promise<FeedPost[]> {
  if (!hasSupabasePublicEnv()) {
    return demoFeedPosts;
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
          poll_votes ( option_id, voter_id )
        ),
        reactions ( reaction_type, user_id ),
        reposts ( user_id )
      `,
    )
    .order("created_at", { ascending: false })
    .limit(20);

  if (error || !data) {
    return [];
  }

  return data
    .map((row) => mapFeedPost(row as Record<string, unknown>, currentUser?.id))
    .filter((post): post is FeedPost => Boolean(post));
}

export async function getNotifications(): Promise<AppNotification[]> {
  if (!hasSupabasePublicEnv()) {
    return demoNotifications;
  }

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return [];
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, payload, created_at, read_at")
    .eq("recipient_id", currentUser.id)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error || !data) {
    return [];
  }

  return data.map((notification) => {
    const payload =
      notification.payload && typeof notification.payload === "object"
        ? (notification.payload as Record<string, unknown>)
        : {};

    return {
      id: String(notification.id),
      type: String(notification.type),
      title: String(payload.title ?? notification.type),
      body: String(payload.body ?? "New platform activity"),
      createdAt: String(notification.created_at ?? new Date().toISOString()),
      readAt:
        typeof notification.read_at === "string"
          ? notification.read_at
          : undefined,
    };
  });
}

export async function getModerationReports(): Promise<ModerationReport[]> {
  if (!hasSupabasePublicEnv()) {
    return demoReports;
  }

  const currentUser = await getCurrentUser();

  if (!currentUser || (currentUser.role !== "moderator" && currentUser.role !== "admin")) {
    return [];
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
    return [];
  }

  return data.map((report) => {
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
}

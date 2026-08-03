export type AppRole = "user" | "moderator" | "admin";

/**
 * Result of a server-side read. `failed` distinguishes "the query errored"
 * from "there is genuinely nothing here" — collapsing both into an empty
 * array makes a backend outage look identical to an empty feed.
 */
export type Loaded<T> = {
  data: T;
  failed: boolean;
};

export type CurrentUser = {
  id: string;
  email?: string;
  username: string;
  displayName: string;
  bio?: string;
  avatarUrl?: string;
  interests: string[];
  role: AppRole;
  needsOnboarding?: boolean;
};

export type PollOption = {
  id: string;
  label: string;
  position: number;
  votes: number;
};

export type FeedPost = {
  id: string;
  body?: string;
  imageUrl?: string;
  hashtags: string[];
  createdAt: string;
  author: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
    role: AppRole;
  };
  poll: {
    id: string;
    question: string;
    status: "active" | "closed";
    options: PollOption[];
    totalVotes: number;
    viewerVoteOptionId?: string;
  };
  reactions: {
    likes: number;
    dislikes: number;
    viewerReaction?: "like" | "dislike";
  };
  reposts: {
    count: number;
    viewerHasReposted: boolean;
  };
};

export type AppNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  createdAt: string;
  readAt?: string;
};

export type ModerationReport = {
  id: string;
  targetType: "post" | "user";
  targetLabel: string;
  reporterLabel: string;
  reason: string;
  status: "open" | "reviewed" | "closed";
  createdAt: string;
};

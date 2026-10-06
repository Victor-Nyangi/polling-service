export type AppRole = "user" | "moderator" | "admin";

/**
 * Result of a server-side read. `failed` distinguishes "the query errored"
 * from "there is genuinely nothing here". Collapsing both into an empty
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
    /**
     * The viewer's ballot. For a signed-in viewer it comes from their own
     * `poll_votes` row; for an anonymous one, from the `pv_ballots` marker
     * cookie — a display hint, not proof (PV005 is the guarantee).
     */
    viewerVoteOptionId?: string;
    /** `polls.participation_mode`. Absent means open, the column default. */
    participationMode?: "open" | "invite";
    /** True when nobody is signed in, i.e. a vote would go the anonymous path. */
    viewerIsAnonymous?: boolean;
    /** True when the signed-in viewer asked this poll: they get its owner controls. */
    viewerIsAuthor?: boolean;
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

/**
 * The author shape used inside `FeedPost`, plus the two fields a standalone
 * public profile page needs. Signed-out visitors see exactly this — never
 * `CurrentUser`, which carries the viewer's email and onboarding state.
 */
export type PublicProfile = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  role: AppRole;
  bio?: string;
  joinedAt: string;
};

export type PublicProfilePage = {
  profile: PublicProfile;
  posts: FeedPost[];
};

/**
 * One row of an invite poll's turnout list, for its owner only. Deliberately
 * carries no time of use: whether an invite was used is the owner's to see,
 * and a used-at time set beside a live tally is a step towards reading which
 * way that person voted.
 */
export type PollInvite = {
  /**
   * `poll_participants.token_hash`, the key a revocation names. Present only
   * on an unused invite, the only kind that can be revoked, so a used
   * invite's hash never reaches the page.
   */
  tokenHash?: string;
  label?: string;
  issuedAt: string;
  used: boolean;
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

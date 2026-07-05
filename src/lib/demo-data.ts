import type {
  AppNotification,
  CurrentUser,
  FeedPost,
  ModerationReport,
} from "@/lib/types";

export const demoCurrentUser: CurrentUser = {
  id: "demo-user-1",
  email: "creator@example.com",
  username: "creator",
  displayName: "Victor Creator",
  bio: "Testing the first MVP loop for poll-based social posts.",
  interests: ["tech", "branding", "community"],
  role: "admin",
};

export const demoFeedPosts: FeedPost[] = [
  {
    id: "post-1",
    body: "What should the first public release focus on?",
    hashtags: ["mvp", "product", "strategy"],
    createdAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    author: {
      id: "demo-user-1",
      username: "creator",
      displayName: "Victor Creator",
      role: "admin",
    },
    poll: {
      id: "poll-1",
      question: "Which launch slice matters most?",
      status: "active",
      totalVotes: 41,
      viewerVoteOptionId: "poll-1-option-1",
      options: [
        { id: "poll-1-option-1", label: "Auth + onboarding", position: 1, votes: 18 },
        { id: "poll-1-option-2", label: "Feed + voting", position: 2, votes: 17 },
        { id: "poll-1-option-3", label: "Moderation basics", position: 3, votes: 6 },
      ],
    },
    reactions: {
      likes: 15,
      dislikes: 1,
      viewerReaction: "like",
    },
    reposts: {
      count: 4,
      viewerHasReposted: true,
    },
  },
  {
    id: "post-2",
    body: "Simple managed hosting feels right for a hobby build.",
    hashtags: ["vercel", "supabase"],
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
    author: {
      id: "demo-user-2",
      username: "opsally",
      displayName: "Sally Ops",
      role: "moderator",
    },
    poll: {
      id: "poll-2",
      question: "Best MVP hosting setup?",
      status: "active",
      totalVotes: 28,
      options: [
        { id: "poll-2-option-1", label: "Vercel + Supabase", position: 1, votes: 22 },
        { id: "poll-2-option-2", label: "Self-host everything", position: 2, votes: 2 },
        { id: "poll-2-option-3", label: "Firebase-only", position: 3, votes: 4 },
      ],
    },
    reactions: {
      likes: 11,
      dislikes: 0,
    },
    reposts: {
      count: 2,
      viewerHasReposted: false,
    },
  },
];

export const demoNotifications: AppNotification[] = [
  {
    id: "notif-1",
    type: "vote",
    title: "New vote on your poll",
    body: "Your launch-priority poll received 3 new votes in the last hour.",
    createdAt: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
  },
  {
    id: "notif-2",
    type: "report",
    title: "Moderation queue updated",
    body: "A new content report is waiting for review.",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
    readAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
  },
];

export const demoReports: ModerationReport[] = [
  {
    id: "report-1",
    targetType: "post",
    targetLabel: "Post: What should the first public release focus on?",
    reporterLabel: "creator",
    reason: "Testing the moderation workflow with a sample report.",
    status: "open",
    createdAt: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
  },
  {
    id: "report-2",
    targetType: "user",
    targetLabel: "User: opsally",
    reporterLabel: "creator",
    reason: "Sample user report to verify queue states and admin actions.",
    status: "reviewed",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
  },
];

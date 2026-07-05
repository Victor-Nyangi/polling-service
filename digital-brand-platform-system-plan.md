# Digital Brand Platform System Plan

## Objective

Build a poll-centric social platform that supports user-generated poll posts, engagement features, moderation, privacy controls, analytics, messaging, and platform administration, while starting with a simple web-first MVP suitable for a hobby project.

## Roles and Responsibilities

### User
- Register with social login, email, or SMS verification
- Create and customize a profile
- Create posts with a mandatory poll and optional text, images, hashtags, and emojis
- Vote in polls
- Rate polls
- Like or dislike polls
- Repost polls to their page
- Share polls externally by link
- Send direct messages

### Moderator
- Review and moderate polls, comments, and reported content
- Remove inappropriate content
- Moderate user behavior
- Operate under admin-approved promotion and role assignment

### Administrator
- Manage platform-wide settings and direction
- Manage users and roles
- Approve moderator promotions
- Maintain system functionality
- Access all platform features and audit data

## Recommended Product Scope

### Core Features
- Registration and authentication
- Profile creation and customization
- Poll-based post creation
- Voting
- Ratings
- Likes and dislikes
- Reposts
- External sharing by link

### Extended Features
- Direct messaging
- Push notifications
- Trending polls
- Search for users, polls, and topics
- Poll analytics
- Multi-language support
- Privacy controls
- Feedback and reporting system
- Social media integrations

## Recommended System Architecture

Build the first version as an **API-first modular monolith** to reduce delivery complexity while keeping modules clearly separated for future scaling.

### Client Applications
- Responsive web application
- Mobile application

### Backend Modules
- Auth and Identity
- Profiles and Roles
- Poll Posts
- Voting and Reactions
- Feed and Discovery
- Messaging and Notifications
- Moderation and Safety
- Analytics and Admin
- Privacy and Preferences
- Localization

### Infrastructure Components
- **Relational database** for transactional data such as users, polls, votes, reactions, and messages
- **Object storage** for profile pictures and post images
- **Redis** for caching, rate limiting, and queue support
- **Queue workers** for notifications, analytics processing, and media-related tasks
- **Search engine** using database full-text search initially, with Elasticsearch/OpenSearch as a later upgrade if needed
- **Push provider integration** such as Firebase Cloud Messaging and Apple Push Notification service

## Technical Implementation Proposal for the MVP

For a hobby project, the simplest practical stack is:

### Frontend
- **Next.js**
- **React**
- **TypeScript**
- **Tailwind CSS**

### Backend Platform
- **Supabase**
  - PostgreSQL
  - Authentication
  - Storage
  - Row Level Security

### Hosting
- **Vercel** for the web app
- **Supabase Cloud** for database, auth, and storage

### Optional Later Additions
- **Resend** or **Postmark** for transactional email
- **Sentry** for error tracking
- **PostHog** or **Plausible** for product analytics
- **Upstash Redis** if caching or rate limiting becomes necessary

## Rationale Behind the MVP Stack

### Why this stack
- It keeps infrastructure simple enough for one developer
- It reduces time spent on auth, storage, and database setup
- It is cheap or free to start
- It still supports growth if the project gains traction

### Why web-first
- A responsive web app is faster and cheaper to ship than native mobile apps
- It validates the core poll-sharing loop before investing in mobile clients
- It avoids early duplication across iOS and Android codebases

### Why managed services
- Managed hosting reduces operational burden
- It avoids spending hobby-project time on server management
- It provides a clean upgrade path instead of forcing premature microservices

## Hosting and Deployment Proposal

### Environments
- **Development**
- **Production**

Skip staging initially unless the team grows or the release process becomes risky.

### Deployment approach
- Deploy the Next.js app to **Vercel**
- Connect environment variables for the hosted Supabase project
- Use **Supabase Storage** for uploaded media
- Add preview deployments through GitHub/Vercel integration
- Add a health endpoint and basic monitoring before wider launch

## Functional Module Plan

### 1. Auth and Identity
- Social login support
- Email signup and verification
- SMS/OTP verification
- Session or token-based authentication
- Password recovery and account recovery flows
- Fraud and abuse protections around signup and login

### 2. Profiles and Roles
- User profile creation
- Profile photo, bio, and interests
- Privacy settings for profile visibility
- Role-based access control for users, moderators, and admins
- Moderator promotion workflow requiring admin approval

### 3. Poll Posts
- Post creation with required poll attachment
- Optional text, images, hashtags, and emojis
- Draft, publish, edit, and delete flows
- Repost and share support

### 4. Voting and Reactions
- Single-vote or configured poll voting logic
- Duplicate-vote prevention
- Poll rating system
- Like and dislike system
- Anti-spam and anti-manipulation safeguards

### 5. Feed and Discovery
- Home feed
- User profile pages
- Trending polls section
- Hashtag discovery
- Search by topic, poll, and user
- Ranking based on recency and engagement

### 6. Messaging and Notifications
- Direct messaging between users
- Push notifications for:
  - new polls
  - votes
  - comments
  - reposts
  - direct messages
- Notification preferences management

### 7. Moderation and Safety
- Report content or users
- Moderation queue
- Poll and comment removal
- User warnings, suspensions, or bans
- Audit logs for moderator and admin actions

### 8. Analytics and Admin
- Poll performance dashboards
- Metrics such as total votes, likes, shares, reposts, and engagement rate
- Demographic insights where legally permitted and consented to
- Admin dashboard for user and platform management

### 9. Privacy and Preferences
- User data visibility controls
- Consent and cookie preference handling
- Notification controls
- Data export and deletion request support

### 10. Localization
- Multiple language support
- Local language prioritization where relevant
- Translation-ready content and UI structure

## Suggested Data Model

- `users`
- `profiles`
- `roles`
- `role_assignments`
- `posts`
- `polls`
- `poll_options`
- `votes`
- `ratings`
- `reactions`
- `reposts`
- `shares`
- `comments`
- `hashtags`
- `conversations`
- `messages`
- `notifications`
- `notification_preferences`
- `reports`
- `moderation_actions`
- `audit_logs`
- `privacy_settings`
- `consents`
- `analytics_events`

## Delivery Roadmap

### Phase 1: Foundation
- Finalize requirements and UX flows
- Design data model and API contracts
- Implement authentication and profile management
- Implement roles and admin basics
- Implement poll post creation and voting
- Deliver initial feed and sharing links

### Phase 2: Core Engagement
- Add likes and dislikes
- Add ratings
- Add reposting
- Add comments if required for engagement
- Add push notifications
- Add basic moderation tooling

### Phase 3: Discovery and Retention
- Add search
- Add trending polls
- Add hashtag and interest-based discovery
- Add direct messaging

### Phase 4: Trust, Analytics, and Scale
- Add poll analytics dashboards
- Add privacy controls and consent management
- Add user feedback and issue reporting
- Add rate limits, fraud prevention, and operational auditability

### Phase 5: Expansion
- Add multi-language support
- Add advanced admin controls
- Add deeper social platform integrations
- Add smarter recommendations and personalization

## Non-Functional Requirements

- Role-based access control
- Scalability for spikes in voting and notifications
- Reliable asynchronous job processing
- Secure authentication and account verification
- Abuse prevention and rate limiting
- Audit trails for privileged actions
- Privacy-by-default behavior
- Monitoring, logging, and alerting
- Backup and recovery planning

## MVP Recommendation

Prioritize the first release around the platform’s core engagement loop:

1. User authentication and verification
2. Profile setup
3. Poll-based post creation
4. Voting
5. Feed
6. Basic sharing
7. Basic moderation
8. Push notifications

After the MVP is stable, add search, trending, messaging, analytics, privacy controls, and localization in that order.

## Practical Hobby-Project MVP Adjustment

To keep the first version realistic, defer these items until after the core loop is working:

- SMS verification
- Native mobile apps
- Direct messaging
- Advanced analytics
- Deep social integrations
- Multi-language rollout
- Full privacy-management dashboards

## Recommended Next Implementation Step

Convert this plan into:
- product requirements
- UX flows and wireframes
- database schema
- API specification
- phased engineering backlog

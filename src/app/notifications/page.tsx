import { markNotificationReadAction } from "@/app/actions";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { NoticeBanner } from "@/components/notice-banner";
import { readNotice } from "@/lib/notice";
import { getCurrentUser, getNotifications } from "@/lib/server/platform";

export const dynamic = "force-dynamic";

function timestamp(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [notice, currentUser, notifications] = await Promise.all([
    readNotice(searchParams),
    getCurrentUser(),
    getNotifications(),
  ]);

  return (
    <AppShell currentUser={currentUser}>
      <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
        <h1 className="text-3xl font-semibold tracking-tight">Notifications</h1>
        <p className="mt-3 text-sm text-muted">
          In-app notifications are the cheapest MVP starting point before web push
          or native push integrations.
        </p>
      </section>

      <NoticeBanner notice={notice} />

      {notifications.length === 0 ? (
        <EmptyState
          title="No notifications yet"
          description="New votes, reposts, and moderation events will show up here."
        />
      ) : (
        <div className="grid gap-4">
          {notifications.map((notification) => (
            <article
              key={notification.id}
              className="rounded-3xl border border-border bg-card p-6 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">{notification.title}</h2>
                  <p className="mt-2 text-sm text-muted">{notification.body}</p>
                </div>
                <span className="rounded-full bg-background px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted">
                  {notification.readAt ? "Read" : "Unread"}
                </span>
              </div>
              <div className="mt-4 flex items-center justify-between gap-4">
                <p className="text-xs text-muted">{timestamp(notification.createdAt)}</p>
                {!notification.readAt ? (
                  <form action={markNotificationReadAction}>
                    <input type="hidden" name="redirectTo" value="/notifications" />
                    <input
                      type="hidden"
                      name="notificationId"
                      value={notification.id}
                    />
                    <button className="rounded-full border border-border px-4 py-2 text-sm font-medium">
                      Mark as read
                    </button>
                  </form>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </AppShell>
  );
}

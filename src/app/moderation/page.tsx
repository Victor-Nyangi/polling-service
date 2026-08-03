import { reviewReportAction } from "@/app/actions";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { LoadError } from "@/components/load-error";
import { NoticeBanner } from "@/components/notice-banner";
import { readNotice } from "@/lib/notice";
import { getCurrentUser, getModerationReports } from "@/lib/server/platform";

export const dynamic = "force-dynamic";

function timestamp(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function ModerationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [notice, currentUser, reports] = await Promise.all([
    readNotice(searchParams),
    getCurrentUser(),
    getModerationReports(),
  ]);

  return (
    <AppShell currentUser={currentUser}>
      <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
        <h1 className="text-3xl font-semibold tracking-tight">Moderation queue</h1>
        <p className="mt-3 text-sm text-muted">
          Basic reporting and review gives the MVP enough trust-and-safety support
          without building a complex moderation suite too early.
        </p>
      </section>

      <NoticeBanner notice={notice} />

      {reports.failed ? (
        <LoadError what="the moderation queue" />
      ) : reports.data.length === 0 ? (
        <EmptyState
          title="No reports queued"
          description="Submitted content and user reports will appear here for moderator review."
        />
      ) : (
        <div className="grid gap-4">
          {reports.data.map((report) => (
            <article
              key={report.id}
              className="rounded-3xl border border-border bg-card p-6 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">{report.targetLabel}</h2>
                  <p className="mt-2 text-sm text-muted">
                    Reported by @{report.reporterLabel}
                  </p>
                </div>
                <span className="rounded-full bg-background px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted">
                  {report.status}
                </span>
              </div>

              <p className="mt-4 text-sm leading-7">{report.reason}</p>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                <p className="text-xs text-muted">{timestamp(report.createdAt)}</p>
                <div className="flex gap-3">
                  <form action={reviewReportAction}>
                    <input type="hidden" name="redirectTo" value="/moderation" />
                    <input type="hidden" name="reportId" value={report.id} />
                    <input type="hidden" name="status" value="reviewed" />
                    <button className="rounded-full border border-border px-4 py-2 text-sm font-medium">
                      Mark reviewed
                    </button>
                  </form>

                  <form action={reviewReportAction}>
                    <input type="hidden" name="redirectTo" value="/moderation" />
                    <input type="hidden" name="reportId" value={report.id} />
                    <input type="hidden" name="status" value="closed" />
                    <button className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white">
                      Close report
                    </button>
                  </form>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </AppShell>
  );
}

import { createPollPostAction } from "@/app/actions";
import type { CurrentUser } from "@/lib/types";

export function PollComposer({ currentUser }: { currentUser: CurrentUser | null }) {
  return (
    <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">Create a poll post</h2>
        <p className="text-sm text-muted">
          Keep the MVP focused: one clear question, 2-4 options, optional context,
          and hashtags for discovery later.
        </p>
        {currentUser ? (
          <p className="text-xs uppercase tracking-wide text-muted">
            Posting as @{currentUser.username}
          </p>
        ) : null}
      </div>

      <form action={createPollPostAction} className="mt-6 grid gap-4">
        <input type="hidden" name="redirectTo" value="/" />
        <textarea
          name="body"
          rows={4}
          placeholder="Add context for your poll..."
          className="rounded-2xl border border-border bg-background px-4 py-3 outline-none focus:border-accent"
        />
        <input
          name="question"
          placeholder="Poll question"
          className="rounded-2xl border border-border bg-background px-4 py-3 outline-none focus:border-accent"
          required
        />
        <div className="grid gap-3 md:grid-cols-2">
          <input
            name="option1"
            placeholder="Option 1"
            className="rounded-2xl border border-border bg-background px-4 py-3 outline-none focus:border-accent"
            required
          />
          <input
            name="option2"
            placeholder="Option 2"
            className="rounded-2xl border border-border bg-background px-4 py-3 outline-none focus:border-accent"
            required
          />
          <input
            name="option3"
            placeholder="Option 3 (optional)"
            className="rounded-2xl border border-border bg-background px-4 py-3 outline-none focus:border-accent"
          />
          <input
            name="option4"
            placeholder="Option 4 (optional)"
            className="rounded-2xl border border-border bg-background px-4 py-3 outline-none focus:border-accent"
          />
        </div>
        <input
          name="hashtags"
          placeholder="Hashtags, comma-separated"
          className="rounded-2xl border border-border bg-background px-4 py-3 outline-none focus:border-accent"
        />
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-muted">
            Requires auth when Supabase is connected. In demo mode, submissions
            show the intended flow without persistence.
          </p>
          <button
            type="submit"
            className="rounded-full bg-accent px-5 py-3 text-sm font-medium text-white transition hover:bg-accent-strong"
          >
            Publish poll
          </button>
        </div>
      </form>
    </section>
  );
}

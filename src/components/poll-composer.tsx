import { createPollPostAction } from "@/app/actions";
import type { CurrentUser } from "@/lib/types";

const PARTICIPATION_CHOICES = [
  {
    value: "open",
    title: "Open",
    detail: "Anyone can vote: once per account, or once per browser when signed out.",
  },
  {
    value: "invite",
    title: "Invite-only",
    detail:
      "Only people you send an invite link to. Each link casts one vote, and you see turnout, never who chose what.",
  },
] as const;

export function PollComposer({ currentUser }: { currentUser: CurrentUser | null }) {
  return (
    <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-col gap-2">
        <h2 className="font-display text-xl font-semibold">Create a poll post</h2>
        <p className="text-sm text-muted">
          Keep the MVP focused: one clear question, 2-4 options, optional context,
          and hashtags for discovery later.
        </p>
        {currentUser ? (
          <p className="font-mono text-xs uppercase tracking-wide text-muted">
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
          className="rounded-2xl border border-border bg-background px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15"
        />
        <input
          name="question"
          placeholder="Poll question"
          className="rounded-2xl border border-border bg-background px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15"
          required
        />
        <div className="grid gap-3 md:grid-cols-2">
          <input
            name="option1"
            placeholder="Option 1"
            className="rounded-2xl border border-border bg-background px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15"
            required
          />
          <input
            name="option2"
            placeholder="Option 2"
            className="rounded-2xl border border-border bg-background px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15"
            required
          />
          <input
            name="option3"
            placeholder="Option 3 (optional)"
            className="rounded-2xl border border-border bg-background px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15"
          />
          <input
            name="option4"
            placeholder="Option 4 (optional)"
            className="rounded-2xl border border-border bg-background px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15"
          />
        </div>
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-medium">Who can vote?</legend>
          <div className="grid gap-3 md:grid-cols-2">
            {PARTICIPATION_CHOICES.map((choice) => (
              <label
                key={choice.value}
                className="flex cursor-pointer gap-3 rounded-2xl border border-border bg-background px-4 py-3 transition has-[:checked]:border-accent has-[:checked]:bg-accent/10 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40"
              >
                <input
                  type="radio"
                  name="participationMode"
                  value={choice.value}
                  defaultChecked={choice.value === "open"}
                  className="mt-1 accent-[var(--accent)]"
                />
                {/*
                  Not text-muted: light --muted is 3.94:1 on the checked card
                  (--accent at 10% over --background). --foreground at 70% is
                  5.81:1 checked and 6.26:1 unchecked (light), 8.85:1 and
                  9.36:1 (dark).
                */}
                <span className="grid gap-1">
                  <span className="text-sm font-medium">{choice.title}</span>
                  <span className="text-sm text-foreground/70">{choice.detail}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <input
          name="hashtags"
          placeholder="Hashtags, comma-separated"
          className="rounded-2xl border border-border bg-background px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15"
        />
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-muted">
            Requires auth when Supabase is connected. In demo mode, submissions
            show the intended flow without persistence.
          </p>
          <button
            type="submit"
            className="rounded-full bg-accent-strong px-5 py-3 text-sm font-medium text-white transition hover:brightness-95 active:scale-[0.98]"
          >
            Publish poll
          </button>
        </div>
      </form>
    </section>
  );
}

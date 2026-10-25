import Link from "next/link";
import { createPollPostAction } from "@/app/actions";
import {
  CLOSE_CHOICES,
  POLL_PRESETS,
  POLL_PRESET_ORDER,
  type PollPreset,
} from "@/lib/poll-presets";
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

const RESULTS_CHOICES = [
  {
    value: "after_close",
    title: "After voting closes",
    detail:
      "Nobody sees the counts until the deadline, you included, so early votes can't steer late ones. Turnout still shows.",
  },
  {
    value: "live",
    title: "Live",
    detail: "Everyone sees the tally as votes arrive.",
  },
] as const;

const COPY = {
  round: {
    question: "What's being decided? e.g. Colleague of the year 2026",
    option: (n: number) => `Nominee ${n}`,
    context: "Context for voters: the award, who's eligible, what a vote means...",
  },
  quick: {
    question: "Poll question",
    option: (n: number) => `Option ${n}`,
    context: "Add context for your poll...",
  },
} as const;

/**
 * Not text-muted on the choice cards: light --muted is 3.94:1 on the checked
 * card (--accent at 10% over --background). --foreground at 70% is 5.81:1
 * checked and 6.26:1 unchecked (light), 8.85:1 and 9.36:1 (dark).
 */
function ChoiceCard({
  name,
  value,
  title,
  detail,
  checked,
}: {
  name: string;
  value: string;
  title: string;
  detail: string;
  checked: boolean;
}) {
  return (
    <label className="flex cursor-pointer gap-3 rounded-2xl border border-border bg-background px-4 py-3 transition has-[:checked]:border-accent has-[:checked]:bg-accent/10 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40">
      <input
        type="radio"
        name={name}
        value={value}
        defaultChecked={checked}
        className="mt-1 accent-[var(--accent)]"
      />
      <span className="grid gap-1">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-sm text-foreground/70">{detail}</span>
      </span>
    </label>
  );
}

/**
 * The preset is a link, not a form control: with no client script, switching
 * presets is a navigation to `/?preset=…`, and `key` remounts the form so its
 * defaults change with it. Every field stays editable under either preset.
 */
export function PollComposer({
  currentUser,
  preset,
}: {
  currentUser: CurrentUser | null;
  preset: PollPreset;
}) {
  const copy = COPY[preset.id];

  return (
    <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-semibold">Create a poll</h2>
        <nav aria-label="Poll type" className="flex flex-wrap gap-2">
          {POLL_PRESET_ORDER.map((id) => {
            const option = POLL_PRESETS[id];
            const active = option.id === preset.id;

            return (
              <Link
                key={id}
                href={`/?preset=${id}`}
                aria-current={active ? "page" : undefined}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition active:scale-[0.97] ${
                  active
                    ? "border-accent bg-accent/10 text-foreground"
                    : "border-border text-muted hover:border-accent/50"
                }`}
              >
                {option.title}
              </Link>
            );
          })}
        </nav>
        <p className="text-sm text-muted">{preset.summary}</p>
        {currentUser ? (
          <p className="font-mono text-xs uppercase tracking-wide text-muted">
            Posting as @{currentUser.username}
          </p>
        ) : null}
      </div>

      <form key={preset.id} action={createPollPostAction} className="mt-6 grid gap-4">
        <input type="hidden" name="redirectTo" value="/" />
        <input
          name="question"
          placeholder={copy.question}
          className="rounded-2xl border border-border bg-background px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15"
          required
        />
        <div className="grid gap-3 md:grid-cols-2">
          {[1, 2, 3, 4].map((n) => (
            <input
              key={n}
              name={`option${n}`}
              placeholder={n > 2 ? `${copy.option(n)} (optional)` : copy.option(n)}
              className="rounded-2xl border border-border bg-background px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15"
              required={n <= 2}
            />
          ))}
        </div>
        <textarea
          name="body"
          rows={3}
          placeholder={copy.context}
          className="rounded-2xl border border-border bg-background px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15"
        />
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-medium">Who can vote?</legend>
          <div className="grid gap-3 md:grid-cols-2">
            {PARTICIPATION_CHOICES.map((choice) => (
              <ChoiceCard
                key={choice.value}
                name="participationMode"
                value={choice.value}
                title={choice.title}
                detail={choice.detail}
                checked={choice.value === preset.participationMode}
              />
            ))}
          </div>
        </fieldset>
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-medium">When can people see results?</legend>
          <div className="grid gap-3 md:grid-cols-2">
            {RESULTS_CHOICES.map((choice) => (
              <ChoiceCard
                key={choice.value}
                name="resultsVisibility"
                value={choice.value}
                title={choice.title}
                detail={choice.detail}
                checked={choice.value === preset.resultsVisibility}
              />
            ))}
          </div>
        </fieldset>
        <label className="grid gap-2">
          <span className="text-sm font-medium">When does voting close?</span>
          <select
            name="closesIn"
            defaultValue={preset.closesIn}
            className="rounded-2xl border border-border bg-background px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15"
          >
            {CLOSE_CHOICES.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted">
            Counted from when you publish. The poll&apos;s page shows the exact
            time, in UTC. Hidden results need a deadline, and once the poll is
            published, neither setting can change.
          </span>
        </label>
        <input
          name="hashtags"
          placeholder="Tags, comma-separated (optional)"
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
            {preset.id === "round" ? "Publish round" : "Publish poll"}
          </button>
        </div>
      </form>
    </section>
  );
}

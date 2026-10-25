/**
 * The composer's presets, and the two round settings they default:
 * whether results show live, and when voting closes.
 *
 * A preset only chooses defaults. Every field stays on the form whichever
 * preset is showing, so an owner can still run an open, live-results poll from
 * the round preset or an invite-only one from the quick preset. The database
 * is what holds the rules: a hidden tally without a deadline is refused
 * (polls_hidden_results_need_close_check), and both settings are fixed once
 * the poll exists.
 */

export type PollPresetId = "round" | "quick";
export type ResultsVisibility = "live" | "after_close";

/**
 * Durations rather than a date picker. A `datetime-local` input sends a time
 * with no time zone and this app has no client script to supply one, so a
 * picked "17:00" would be read as the server's 17:00. "In 3 days" means the
 * same thing everywhere, and the poll's page then shows the exact time.
 */
export const CLOSE_CHOICES = [
  { value: "1h", label: "In 1 hour", ms: 60 * 60 * 1000 },
  { value: "1d", label: "In 1 day", ms: 24 * 60 * 60 * 1000 },
  { value: "3d", label: "In 3 days", ms: 3 * 24 * 60 * 60 * 1000 },
  { value: "7d", label: "In 1 week", ms: 7 * 24 * 60 * 60 * 1000 },
  { value: "14d", label: "In 2 weeks", ms: 14 * 24 * 60 * 60 * 1000 },
  { value: "none", label: "No deadline", ms: null },
] as const;

export type CloseChoice = (typeof CLOSE_CHOICES)[number]["value"];

export type PollPreset = {
  id: PollPresetId;
  title: string;
  summary: string;
  participationMode: "open" | "invite";
  resultsVisibility: ResultsVisibility;
  closesIn: CloseChoice;
};

export const POLL_PRESETS: Record<PollPresetId, PollPreset> = {
  round: {
    id: "round",
    title: "Awards / voting round",
    summary:
      "Staff awards, recognition votes and feedback rounds: one invite link per person, a secret ballot, and a closing time.",
    participationMode: "invite",
    resultsVisibility: "after_close",
    closesIn: "7d",
  },
  quick: {
    id: "quick",
    title: "Quick poll",
    summary: "Anyone with the link votes, and results show as votes arrive.",
    participationMode: "open",
    resultsVisibility: "live",
    closesIn: "none",
  },
};

/** The preset order on the page. The round comes first: it is the product. */
export const POLL_PRESET_ORDER: readonly PollPresetId[] = ["round", "quick"];

/** `?preset=` on `/`. Absent or unrecognised means the voting round. */
export function readPollPreset(value: string | string[] | undefined): PollPreset {
  const raw = Array.isArray(value) ? value[0] : value;

  return raw === "quick" ? POLL_PRESETS.quick : POLL_PRESETS.round;
}

/** Absent or unrecognised means live, the column default. */
export function resultsVisibilityOf(value: unknown): ResultsVisibility {
  return value === "after_close" ? "after_close" : "live";
}

export type RoundSettings =
  | { ok: true; resultsVisibility: ResultsVisibility; closesAt: string | null }
  | { ok: false; message: string };

export const HIDDEN_RESULTS_NEED_DEADLINE_MESSAGE =
  "Hidden results show when voting closes, so pick a closing time, or show results live.";

/**
 * The composer's `resultsVisibility` and `closesIn` fields, turned into the
 * two columns. An unrecognised `closesIn` is refused rather than read as "no
 * deadline", because silently dropping a deadline someone meant to set would
 * leave a round open for ever.
 */
export function parseRoundSettings(
  fields: { resultsVisibility: string; closesIn: string },
  now: Date = new Date(),
): RoundSettings {
  const resultsVisibility = resultsVisibilityOf(fields.resultsVisibility);
  const choice = CLOSE_CHOICES.find((candidate) => candidate.value === fields.closesIn);

  if (!choice) {
    return { ok: false, message: "Pick when voting closes." };
  }

  if (choice.ms === null) {
    return resultsVisibility === "after_close"
      ? { ok: false, message: HIDDEN_RESULTS_NEED_DEADLINE_MESSAGE }
      : { ok: true, resultsVisibility, closesAt: null };
  }

  return {
    ok: true,
    resultsVisibility,
    closesAt: new Date(now.getTime() + choice.ms).toISOString(),
  };
}

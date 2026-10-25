/**
 * Words for a poll's state, shared by every page that prints them.
 *
 * "Open" names a participation mode in the composer (Open vs Invite-only), so
 * the voting status never says a bare "Open" or "Closed": it reads "Voting
 * open" / "Voting closed", and an invite poll says "Invite-only" alongside it.
 */
export type PollStatus = "active" | "closed";
export type ParticipationMode = "open" | "invite";

/** "1 vote", "0 votes", "12 votes". */
export function voteCountLabel(count: number): string {
  return count === 1 ? "1 vote" : `${count} votes`;
}

export function pollStatusLabel(status: PollStatus): string {
  return status === "closed" ? "Voting closed" : "Voting open";
}

/** Absent or unrecognised means open, the column default. */
export function participationModeLabel(mode: ParticipationMode | undefined): string {
  return mode === "invite" ? "Invite-only" : "Open to anyone";
}

/**
 * A poll's deadline, in UTC and saying so. Pages render on the server, which
 * does not know the reader's time zone, and an unlabelled "17:00" read in the
 * wrong zone is the kind of mistake that makes someone miss a vote.
 * `null` for a value that does not parse.
 */
export function deadlineLabel(isoTimestamp: string): string | null {
  const time = Date.parse(isoTimestamp);

  if (!Number.isFinite(time)) {
    return null;
  }

  const formatted = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(time));

  return `${formatted} UTC`;
}

/** What a hidden tally says in its place. */
export const HIDDEN_RESULTS_LABEL = "Results show when voting closes";

/**
 * The facts after "Asked by @x" on a poll's permalink, in reading order: the
 * vote count, the voting status, then "Invite-only" for an invite poll, then
 * for a round its deadline and whether its results are being held back. An
 * open poll gets no mode word, since open is what a reader assumes.
 */
export function pollSummaryParts(poll: {
  totalVotes: number;
  status: PollStatus;
  participationMode?: ParticipationMode;
  closesAt?: string;
  resultsHidden?: boolean;
}): string[] {
  const parts = [voteCountLabel(poll.totalVotes), pollStatusLabel(poll.status)];

  if (poll.participationMode === "invite") {
    parts.push(participationModeLabel("invite"));
  }

  const deadline = poll.closesAt ? deadlineLabel(poll.closesAt) : null;

  if (deadline) {
    parts.push(`${poll.status === "closed" ? "Closed" : "Closes"} ${deadline}`);
  }

  if (poll.resultsHidden) {
    parts.push(HIDDEN_RESULTS_LABEL);
  }

  return parts;
}

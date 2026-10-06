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
 * The facts after "Asked by @x" on a poll's permalink, in reading order: the
 * vote count, the voting status, then "Invite-only" for an invite poll. An
 * open poll gets no mode word, since open is what a reader assumes.
 */
export function pollSummaryParts(poll: {
  totalVotes: number;
  status: PollStatus;
  participationMode?: ParticipationMode;
}): string[] {
  const parts = [voteCountLabel(poll.totalVotes), pollStatusLabel(poll.status)];

  if (poll.participationMode === "invite") {
    parts.push(participationModeLabel("invite"));
  }

  return parts;
}

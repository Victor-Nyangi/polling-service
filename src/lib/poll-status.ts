/**
 * Whether a poll has stopped accepting votes.
 *
 * `polls.status` and `polls.closes_at` are enforced by the
 * `enforce_votes_before_poll_close` trigger on `poll_votes` — that is the
 * guarantee, and it holds whoever writes the row. This helper exists only so
 * the action layer can refuse with a sentence a person can read instead of
 * surfacing a raw Postgres exception.
 *
 * It therefore errs open. A `closesAt` this layer cannot parse is treated as no
 * deadline and the insert is left to the trigger, because blocking a vote on a
 * value we failed to understand would be worse than a clumsy error message.
 */
export type PollCloseState = {
  status?: string | null;
  closesAt?: string | null;
};

export function isPollClosed(
  poll: PollCloseState,
  now: Date = new Date(),
): boolean {
  if (poll.status === "closed") {
    return true;
  }

  if (!poll.closesAt) {
    return false;
  }

  const closesAt = Date.parse(poll.closesAt);

  // Strictly after, matching `now() > closes_at` in the trigger: a vote landing
  // on the deadline itself counts.
  return Number.isFinite(closesAt) && now.getTime() > closesAt;
}

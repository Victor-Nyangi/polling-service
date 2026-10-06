import { createHmac, randomBytes } from "node:crypto";
import type { NoticeType } from "@/lib/notice";

/**
 * The pure half of the anonymous vote path: the participant token, the
 * "you voted X" marker cookie, and the mapping from `cast_anonymous_vote`'s
 * SQLSTATEs to notices. The Server Action and the data layer own the I/O; this
 * file owns every decision they make, so it can be unit-tested.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/**
 * `polls.participation_mode`, normalised. Anything but an exact `'invite'` is
 * open, matching the column default. Erring open only decides whether a
 * viewer is shown vote buttons; the database reads the real column and
 * refuses with PV004 or PV006 regardless.
 */
export function participationModeOf(value: unknown): "open" | "invite" {
  return value === "invite" ? "invite" : "open";
}

// ---------------------------------------------------------------------------
// Participant token
// ---------------------------------------------------------------------------

/**
 * One random secret per browser. httpOnly, so page script never sees it, and
 * it is never sent to the database as-is — see `deriveParticipantToken`.
 */
export const PARTICIPANT_COOKIE = "pv_participant";

/**
 * 400 days: the longest lifetime Chrome will honour (it clamps anything longer).
 * Long-lived on purpose — clearing it is how a browser gets a second ballot in
 * open mode, so the shorter it lives the weaker "one per browser" gets.
 */
export const ANONYMOUS_COOKIE_MAX_AGE = 60 * 60 * 24 * 400;

const BROWSER_TOKEN_BYTES = 32;
// 32 bytes as unpadded base64url is exactly 43 characters.
const BROWSER_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function mintBrowserToken(): string {
  return randomBytes(BROWSER_TOKEN_BYTES).toString("base64url");
}

/**
 * The cookie value if it is a token this code could have minted, otherwise
 * `null` so the caller mints a fresh one. A tampered or truncated cookie is not
 * worth rejecting the vote over: it only ever identifies its own browser.
 */
export function parseBrowserToken(value: string | undefined): string | null {
  return value && BROWSER_TOKEN_PATTERN.test(value) ? value : null;
}

/**
 * The token handed to `cast_anonymous_vote` for one poll:
 * `hex(HMAC-SHA256(key = browser token, message = poll id))`, 64 characters.
 *
 * Per poll, so that one browser's ballots on two polls carry unrelated
 * `participant_hash` values and cannot be joined. HMAC rather than
 * `${browserToken}:${pollId}` so the raw browser secret never leaves this
 * server — not in the RPC payload, not in any request log on the way to
 * Postgres. Knowing one poll's derived token reveals nothing about another's.
 */
export function deriveParticipantToken(
  browserToken: string,
  pollId: string,
): string {
  return createHmac("sha256", browserToken)
    .update(pollId.toLowerCase())
    .digest("hex");
}

// ---------------------------------------------------------------------------
// "You voted X" marker
// ---------------------------------------------------------------------------

/**
 * `pollId.optionId` pairs joined by `~`, newest first. A display hint only:
 * it lets the card highlight an anonymous viewer's choice without a schema
 * change. The guarantee that a browser votes once is PV005 in the database, so
 * a forged or stale marker changes what one browser sees and nothing else.
 */
export const BALLOT_MARKER_COOKIE = "pv_ballots";

/**
 * 40 pairs × 74 characters ≈ 2.9 KB, comfortably under the ~4 KB per-cookie
 * limit browsers enforce. Past the cap the oldest ballots stop being
 * highlighted; they are still counted and still refused on a repeat.
 */
export const BALLOT_MARKER_LIMIT = 40;

export type BallotMarker = Map<string, string>;

export function parseBallotMarker(value: string | undefined): BallotMarker {
  const marker: BallotMarker = new Map();

  if (!value) {
    return marker;
  }

  for (const entry of value.split("~")) {
    if (marker.size >= BALLOT_MARKER_LIMIT) {
      break;
    }

    const [pollId, optionId, ...rest] = entry.split(".");

    if (
      rest.length > 0 ||
      !pollId ||
      !optionId ||
      !isUuid(pollId) ||
      !isUuid(optionId)
    ) {
      continue;
    }

    const key = pollId.toLowerCase();

    // First occurrence wins, which is the newest given the write order.
    if (!marker.has(key)) {
      marker.set(key, optionId.toLowerCase());
    }
  }

  return marker;
}

/**
 * The marker with this ballot added at the front, any older entry for the same
 * poll dropped, and the list trimmed to the cap.
 */
export function recordBallot(
  existing: string | undefined,
  pollId: string,
  optionId: string,
): string {
  const key = pollId.toLowerCase();
  const entries = [`${key}.${optionId.toLowerCase()}`];

  for (const [markedPoll, markedOption] of parseBallotMarker(existing)) {
    if (entries.length >= BALLOT_MARKER_LIMIT) {
      break;
    }

    if (markedPoll !== key) {
      entries.push(`${markedPoll}.${markedOption}`);
    }
  }

  return entries.join("~");
}

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

export type VoteNotice = {
  type: NoticeType;
  message: string;
};

const FALLBACK_NOTICE: VoteNotice = {
  type: "error",
  message: "We couldn't record your vote. Try again.",
};

/**
 * `cast_anonymous_vote` refusals arrive through PostgREST as `error.code` =
 * the SQLSTATE the function raised (HTTP 400). Map the ones a person can act on
 * to a sentence; everything else, including transport failures with no code,
 * gets a generic error rather than a raw Postgres message. Closed, already
 * voted, and invite-only are `info`: each is the poll's rules working, not
 * something having gone wrong.
 */
export function anonymousVoteNotice(code: string | undefined): VoteNotice {
  switch (code) {
    // check_violation, raised by the enforce_votes_before_poll_close trigger.
    case "23514":
      return { type: "info", message: "This poll has closed." };
    case "PV005":
      return {
        type: "info",
        message: "You've already voted on this poll. Votes can't be changed.",
      };
    case "PV004":
      return { type: "info", message: "This poll is invite-only." };
    case "PV002":
      return { type: "error", message: "That poll is no longer available." };
    case "PV003":
      return { type: "error", message: "That option isn't part of this poll." };
    // PV001 means this server sent a malformed token, which is a bug here and
    // nothing the voter can fix — so it reads like any other failure.
    default:
      return FALLBACK_NOTICE;
  }
}

/**
 * The same refusals, read for a ballot cast through an invite link. There the
 * token is the person's invitation rather than this browser's identity, so
 * PV004 and PV005 are about the link, not the poll. PV006 (a signed-in ballot
 * on an invite poll) cannot come back from `cast_anonymous_vote`, but the
 * signed-in path can still race a mode switch into it, so it is mapped here
 * for both callers. Closed, missing poll, and wrong option read as they do
 * for an open poll.
 */
export function inviteVoteNotice(code: string | undefined): VoteNotice {
  switch (code) {
    case "PV004":
      return {
        type: "error",
        message: "This invite link isn't valid for this poll.",
      };
    case "PV005":
      return { type: "info", message: "This invite has already been used." };
    case "PV006":
      return {
        type: "info",
        message: "This poll is invite-only, so voting needs an invite link.",
      };
    case "23514":
    case "PV002":
    case "PV003":
      return anonymousVoteNotice(code);
    // The redirect after an invite vote drops the token from the address, so
    // retrying means opening the link again, and the message has to say so.
    default:
      return {
        type: "error",
        message: "We couldn't record your vote. Open your invite link again to retry.",
      };
  }
}

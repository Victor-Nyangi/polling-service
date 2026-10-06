import type { NoticeType } from "@/lib/notice";

/**
 * The pure half of invite mode: the invite link's shape, the owner's label
 * list, which way a poll card votes, the owner-side refusals, and the turnout
 * count. No Node imports on purpose: the invite issuer is a Client Component
 * and shares `parseInviteLabels` with the Server Action, so this file has to
 * bundle for the browser.
 */

/** The query parameter an invite link carries: `/p/<postId>?invite=<token>`. */
export const INVITE_PARAM = "invite";

/**
 * `issue_poll_invites()` returns 48 random bytes as unpadded base64url, which
 * is exactly 64 characters. Anything else cannot be an invite this database
 * issued, so it is refused before a round trip.
 */
const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{64}$/;

export function isInviteToken(value: unknown): value is string {
  return typeof value === "string" && INVITE_TOKEN_PATTERN.test(value);
}

export type InviteParam =
  | { kind: "none" }
  | { kind: "token"; token: string }
  | { kind: "malformed" };

/**
 * The `?invite=` search param as the page sees it. An empty value counts as
 * absent; a repeated param uses the first, like `readNotice`.
 */
export function readInviteParam(
  value: string | string[] | undefined,
): InviteParam {
  const first = Array.isArray(value) ? value[0] : value;

  if (first === undefined || first === "") {
    return { kind: "none" };
  }

  return isInviteToken(first)
    ? { kind: "token", token: first }
    : { kind: "malformed" };
}

/** The path half of an invite link. base64url needs no percent-encoding. */
export function invitePath(postId: string, token: string): string {
  return `/p/${postId}?${INVITE_PARAM}=${token}`;
}

/**
 * `path` with any `invite` query parameter removed, so a redirect after an
 * invite vote can never carry the token on into the address bar, history, or
 * a Referer. Other parameters survive; an empty query string is dropped.
 */
export function withoutInviteParam(path: string): string {
  const hashIndex = path.indexOf("#");
  const beforeHash = hashIndex === -1 ? path : path.slice(0, hashIndex);
  const queryIndex = beforeHash.indexOf("?");

  if (queryIndex === -1) {
    return beforeHash;
  }

  const params = new URLSearchParams(beforeHash.slice(queryIndex + 1));
  params.delete(INVITE_PARAM);
  const query = params.toString();
  const base = beforeHash.slice(0, queryIndex);

  return query ? `${base}?${query}` : base;
}

// ---------------------------------------------------------------------------
// Which way a poll card votes
// ---------------------------------------------------------------------------

export type VoteAccess = "vote" | "invite" | "read-only";

/**
 * - `vote`: an open poll. Buttons, and the action picks signed-in or
 *   anonymous by session, as before.
 * - `invite`: an invite poll opened through a well-formed invite link.
 *   Buttons that carry the token, for signed-in and anonymous viewers alike.
 * - `read-only`: an invite poll without a usable link. No buttons for anyone,
 *   signed in or not, because a signed-in ballot on an invite poll can only
 *   come back as PV006.
 */
export function pollVoteAccess(
  mode: "open" | "invite" | undefined,
  invite: InviteParam,
): VoteAccess {
  if (mode !== "invite") {
    return "vote";
  }

  return invite.kind === "token" ? "invite" : "read-only";
}

// ---------------------------------------------------------------------------
// Issuing
// ---------------------------------------------------------------------------

/** `issue_poll_invites()` refuses a batch over this with PV010. */
export const MAX_INVITES_PER_BATCH = 200;

/** Long enough for a full name or a role; short enough to fit a list row. */
export const MAX_INVITE_LABEL_LENGTH = 80;

const BATCH_SIZE_MESSAGE = `Issue between 1 and ${MAX_INVITES_PER_BATCH} invites at a time.`;

export type ParsedInviteLabels =
  | { ok: true; labels: string[]; named: number; unnamed: number }
  | { ok: false; message: string };

/**
 * One invite per line of the owner's textarea. A blank line is an unnamed
 * invite (sent as `""`, which `issue_poll_invites()` stores as a null label).
 *
 * The one exception is the empty segment after a final line break: that is
 * the caret's line, not a line the owner wrote, so `"Ada\n"` is one invite and
 * `"Ada\n\n"` is two. The issuer shows the resulting count live, so what is
 * issued is never a surprise.
 */
export function parseInviteLabels(text: string): ParsedInviteLabels {
  const normalised = text.replace(/\r\n?/g, "\n");

  if (normalised === "") {
    return {
      ok: false,
      message: "Add one line per invite. A blank line makes an unnamed invite.",
    };
  }

  const lines = normalised.split("\n");

  if (normalised.endsWith("\n")) {
    lines.pop();
  }

  if (lines.length > MAX_INVITES_PER_BATCH) {
    return { ok: false, message: BATCH_SIZE_MESSAGE };
  }

  const labels: string[] = [];

  for (const [index, line] of lines.entries()) {
    const label = line.trim();

    if (label.length > MAX_INVITE_LABEL_LENGTH) {
      return {
        ok: false,
        message: `Line ${index + 1} is over ${MAX_INVITE_LABEL_LENGTH} characters. Shorten that label.`,
      };
    }

    labels.push(label);
  }

  const named = labels.filter(Boolean).length;

  return { ok: true, labels, named, unnamed: labels.length - named };
}

/**
 * What the issuer's Server Action hands back to the one Client Component that
 * calls it. `links` exists only in this response: the raw tokens are never
 * written to a cookie, the database, a log, or a URL the owner is sent to.
 */
export type IssuedInvite = { label: string | null; url: string };

export type IssueInvitesResult =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "issued"; links: IssuedInvite[] };

// ---------------------------------------------------------------------------
// Owner-side refusals
// ---------------------------------------------------------------------------

export type InviteAdminNotice = { type: NoticeType; message: string };

/**
 * SQLSTATEs the owner's controls can hit: switching the mode, issuing, and
 * revoking. PV007 and PV011 are `info` because each is the poll's own rule
 * holding, not something breaking.
 */
export function inviteAdminNotice(code: string | undefined): InviteAdminNotice {
  switch (code) {
    case "PV002":
      return { type: "error", message: "That poll is no longer available." };
    case "PV007":
      return {
        type: "info",
        message:
          "This poll already has votes, so who can vote is now fixed.",
      };
    case "PV008":
      return {
        type: "error",
        message: "Only the person who asked this poll can manage its invites.",
      };
    case "PV009":
      return {
        type: "error",
        message: "Switch this poll to invite-only before issuing invite links.",
      };
    case "PV010":
      return { type: "error", message: BATCH_SIZE_MESSAGE };
    case "PV011":
      return {
        type: "info",
        message: "That invite has been used, so it can't be revoked.",
      };
    default:
      return {
        type: "error",
        message: "We couldn't update the invites. Try again.",
      };
  }
}

// ---------------------------------------------------------------------------
// Turnout
// ---------------------------------------------------------------------------

/** `poll_participants.token_hash`: hex sha256, the row key a revocation names. */
const TOKEN_HASH_PATTERN = /^[0-9a-f]{64}$/;

export function isTokenHash(value: string): boolean {
  return TOKEN_HASH_PATTERN.test(value);
}

export type TurnoutSummary = { used: number; total: number; text: string };

/**
 * "N of M used". Counts invites, never ballots: whether an invite was used is
 * the owner's to see, which option it chose is not, and nothing here can tell.
 */
export function summarizeTurnout(
  invites: ReadonlyArray<{ used: boolean }>,
): TurnoutSummary {
  const total = invites.length;
  const used = invites.filter((invite) => invite.used).length;

  return { used, total, text: `${used} of ${total} used` };
}

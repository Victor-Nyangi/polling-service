import { describe, expect, it } from "vitest";
import {
  BALLOT_MARKER_LIMIT,
  anonymousVoteNotice,
  deriveParticipantToken,
  isUuid,
  mintBrowserToken,
  parseBallotMarker,
  parseBrowserToken,
  participationModeOf,
  recordBallot,
} from "@/lib/anonymous-vote";

const POLL_A = "7b0c7c55-2a43-4f4e-9d8a-0a1b2c3d4e5f";
const POLL_B = "1f2e3d4c-5b6a-4978-8695-a4b3c2d1e0f9";
const OPTION_1 = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const OPTION_2 = "11111111-2222-4333-8444-555555555555";

function pollId(index: number) {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

describe("anonymousVoteNotice", () => {
  it("reads a closed poll as info, not a failure", () => {
    expect(anonymousVoteNotice("23514")).toEqual({
      type: "info",
      message: "This poll has closed.",
    });
  });

  it("tells a repeat voter they already voted", () => {
    const notice = anonymousVoteNotice("PV005");

    expect(notice.type).toBe("info");
    expect(notice.message).toMatch(/already voted/);
  });

  it("names an invite-only poll", () => {
    expect(anonymousVoteNotice("PV004")).toEqual({
      type: "info",
      message: "This poll is invite-only.",
    });
  });

  it("maps a missing poll and a foreign option to errors", () => {
    expect(anonymousVoteNotice("PV002").type).toBe("error");
    expect(anonymousVoteNotice("PV003").type).toBe("error");
  });

  it("treats a bad token as a generic failure, since the voter cannot fix it", () => {
    expect(anonymousVoteNotice("PV001")).toEqual(anonymousVoteNotice(undefined));
    expect(anonymousVoteNotice("PV001").type).toBe("error");
  });

  it("falls back to a generic error for unknown codes and no code at all", () => {
    for (const code of [undefined, "", "22P02", "PGRST202", "42501"]) {
      expect(anonymousVoteNotice(code)).toEqual({
        type: "error",
        message: "We couldn't record your vote. Try again.",
      });
    }
  });
});

describe("browser token", () => {
  it("mints 32 random bytes as 43 base64url characters", () => {
    const token = mintBrowserToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
  });

  it("never mints the same token twice", () => {
    const tokens = new Set(Array.from({ length: 50 }, mintBrowserToken));

    expect(tokens.size).toBe(50);
  });

  it("accepts a minted token back from the cookie", () => {
    const token = mintBrowserToken();

    expect(parseBrowserToken(token)).toBe(token);
  });

  it("rejects anything this code could not have minted", () => {
    for (const value of [undefined, "", "short", "x".repeat(44), `${"a".repeat(42)}=`]) {
      expect(parseBrowserToken(value)).toBeNull();
    }
  });
});

describe("deriveParticipantToken", () => {
  const browserToken = "Q2hlY2sgdGhhdCB0aGlzIGlzIDMyIGJ5dGVzIGxvbmc";

  it("is stable for one browser and one poll", () => {
    expect(deriveParticipantToken(browserToken, POLL_A)).toBe(
      deriveParticipantToken(browserToken, POLL_A),
    );
  });

  it("differs per poll, so one browser's ballots cannot be joined", () => {
    expect(deriveParticipantToken(browserToken, POLL_A)).not.toBe(
      deriveParticipantToken(browserToken, POLL_B),
    );
  });

  it("differs per browser on the same poll", () => {
    expect(deriveParticipantToken(browserToken, POLL_A)).not.toBe(
      deriveParticipantToken(mintBrowserToken(), POLL_A),
    );
  });

  it("does not contain the browser secret", () => {
    expect(deriveParticipantToken(browserToken, POLL_A)).not.toContain(browserToken);
  });

  it("clears cast_anonymous_vote's 32-character floor", () => {
    expect(deriveParticipantToken(browserToken, POLL_A)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("ignores the case of the poll id", () => {
    expect(deriveParticipantToken(browserToken, POLL_A.toUpperCase())).toBe(
      deriveParticipantToken(browserToken, POLL_A),
    );
  });
});

describe("ballot marker", () => {
  it("is empty without a cookie", () => {
    expect(parseBallotMarker(undefined).size).toBe(0);
    expect(parseBallotMarker("").size).toBe(0);
  });

  it("round-trips a recorded ballot", () => {
    const marker = parseBallotMarker(recordBallot(undefined, POLL_A, OPTION_1));

    expect(marker.get(POLL_A)).toBe(OPTION_1);
  });

  it("keeps ballots on several polls, newest first", () => {
    const value = recordBallot(recordBallot(undefined, POLL_A, OPTION_1), POLL_B, OPTION_2);

    expect(value.startsWith(POLL_B)).toBe(true);
    expect([...parseBallotMarker(value)]).toEqual([
      [POLL_B, OPTION_2],
      [POLL_A, OPTION_1],
    ]);
  });

  it("replaces an older entry for the same poll instead of duplicating it", () => {
    const value = recordBallot(recordBallot(undefined, POLL_A, OPTION_1), POLL_A, OPTION_2);

    expect(value).toBe(`${POLL_A}.${OPTION_2}`);
  });

  it("drops malformed entries and keeps the valid ones", () => {
    const value = ["garbage", `${POLL_A}.${OPTION_1}`, `${POLL_B}.not-a-uuid`, `${POLL_B}.${OPTION_1}.extra`, "."].join(
      "~",
    );

    expect([...parseBallotMarker(value)]).toEqual([[POLL_A, OPTION_1]]);
  });

  it("caps the number of ballots it keeps, dropping the oldest", () => {
    let value: string | undefined;

    for (let index = 0; index < BALLOT_MARKER_LIMIT + 10; index += 1) {
      value = recordBallot(value, pollId(index), OPTION_1);
    }

    const marker = parseBallotMarker(value);

    expect(marker.size).toBe(BALLOT_MARKER_LIMIT);
    expect(marker.has(pollId(BALLOT_MARKER_LIMIT + 9))).toBe(true);
    expect(marker.has(pollId(0))).toBe(false);
  });

  it("stays well under the 4 KB cookie limit when full", () => {
    let value: string | undefined;

    for (let index = 0; index < BALLOT_MARKER_LIMIT * 2; index += 1) {
      value = recordBallot(value, pollId(index), OPTION_1);
    }

    expect(value?.length ?? 0).toBeLessThan(3200);
  });

  it("caps an oversized cookie it did not write itself", () => {
    const value = Array.from(
      { length: BALLOT_MARKER_LIMIT * 3 },
      (_, index) => `${pollId(index)}.${OPTION_1}`,
    ).join("~");

    expect(parseBallotMarker(value).size).toBe(BALLOT_MARKER_LIMIT);
  });

  it("only uses characters that are legal in a cookie value", () => {
    const value = recordBallot(recordBallot(undefined, POLL_A, OPTION_1), POLL_B, OPTION_2);

    expect(value).toMatch(/^[0-9a-f.~-]+$/);
  });
});

describe("participationModeOf", () => {
  it("reads only an exact 'invite' as invite mode", () => {
    expect(participationModeOf("invite")).toBe("invite");
    expect(participationModeOf("open")).toBe("open");
    expect(participationModeOf(undefined)).toBe("open");
    expect(participationModeOf("INVITE")).toBe("open");
  });
});

describe("isUuid", () => {
  it("accepts a uuid and rejects anything else", () => {
    expect(isUuid(POLL_A)).toBe(true);
    expect(isUuid("poll-1")).toBe(false);
    expect(isUuid("")).toBe(false);
  });
});

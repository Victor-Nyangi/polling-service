import { describe, expect, it } from "vitest";
import {
  participationModeLabel,
  pollStatusLabel,
  pollSummaryParts,
  voteCountLabel,
} from "@/lib/poll-labels";

describe("voteCountLabel", () => {
  it("is singular for exactly one vote", () => {
    expect(voteCountLabel(1)).toBe("1 vote");
  });

  it("is plural otherwise, zero included", () => {
    expect(voteCountLabel(0)).toBe("0 votes");
    expect(voteCountLabel(2)).toBe("2 votes");
    expect(voteCountLabel(41)).toBe("41 votes");
  });
});

describe("pollStatusLabel", () => {
  it("never says a bare Open or Closed", () => {
    expect(pollStatusLabel("active")).toBe("Voting open");
    expect(pollStatusLabel("closed")).toBe("Voting closed");
  });
});

describe("participationModeLabel", () => {
  it("names each mode", () => {
    expect(participationModeLabel("invite")).toBe("Invite-only");
    expect(participationModeLabel("open")).toBe("Open to anyone");
  });

  it("treats an absent mode as open, the column default", () => {
    expect(participationModeLabel(undefined)).toBe("Open to anyone");
  });
});

describe("pollSummaryParts", () => {
  it("adds Invite-only after the status for an invite poll", () => {
    expect(
      pollSummaryParts({ totalVotes: 3, status: "active", participationMode: "invite" }),
    ).toEqual(["3 votes", "Voting open", "Invite-only"]);
  });

  it("adds no mode word for an open poll, explicit or defaulted", () => {
    expect(
      pollSummaryParts({ totalVotes: 1, status: "active", participationMode: "open" }),
    ).toEqual(["1 vote", "Voting open"]);
    expect(pollSummaryParts({ totalVotes: 0, status: "closed" })).toEqual([
      "0 votes",
      "Voting closed",
    ]);
  });
});

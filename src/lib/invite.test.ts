import { describe, expect, it } from "vitest";
import { inviteVoteNotice } from "@/lib/anonymous-vote";
import {
  MAX_INVITES_PER_BATCH,
  MAX_INVITE_LABEL_LENGTH,
  inviteAdminNotice,
  invitePath,
  isInviteToken,
  isTokenHash,
  parseInviteLabels,
  pollVoteAccess,
  readInviteParam,
  summarizeTurnout,
  withoutInviteParam,
} from "@/lib/invite";

// 64 base64url characters, the shape issue_poll_invites() returns.
const TOKEN = "Ab3_-xYz".repeat(8);
const POST = "7b0c7c55-2a43-4f4e-9d8a-0a1b2c3d4e5f";

describe("isInviteToken", () => {
  it("accepts exactly 64 base64url characters", () => {
    expect(TOKEN).toHaveLength(64);
    expect(isInviteToken(TOKEN)).toBe(true);
  });

  it("refuses the wrong length, padding, and non-url-safe base64", () => {
    expect(isInviteToken(TOKEN.slice(1))).toBe(false);
    expect(isInviteToken(`${TOKEN}A`)).toBe(false);
    expect(isInviteToken(`${TOKEN.slice(1)}=`)).toBe(false);
    expect(isInviteToken(`${TOKEN.slice(1)}+`)).toBe(false);
    expect(isInviteToken(`${TOKEN.slice(1)}/`)).toBe(false);
    expect(isInviteToken(` ${TOKEN.slice(1)}`)).toBe(false);
  });

  it("refuses non-strings", () => {
    expect(isInviteToken(undefined)).toBe(false);
    expect(isInviteToken(null)).toBe(false);
    expect(isInviteToken(42)).toBe(false);
  });
});

describe("readInviteParam", () => {
  it("is none when absent or empty", () => {
    expect(readInviteParam(undefined)).toEqual({ kind: "none" });
    expect(readInviteParam("")).toEqual({ kind: "none" });
  });

  it("reads a well-formed token", () => {
    expect(readInviteParam(TOKEN)).toEqual({ kind: "token", token: TOKEN });
  });

  it("flags anything else as malformed", () => {
    expect(readInviteParam("garbage")).toEqual({ kind: "malformed" });
  });

  it("uses the first of a repeated param", () => {
    expect(readInviteParam([TOKEN, "garbage"])).toEqual({
      kind: "token",
      token: TOKEN,
    });
    expect(readInviteParam(["garbage", TOKEN])).toEqual({ kind: "malformed" });
  });
});

describe("invitePath / withoutInviteParam", () => {
  it("builds the permalink with the token", () => {
    expect(invitePath(POST, TOKEN)).toBe(`/p/${POST}?invite=${TOKEN}`);
  });

  it("strips the token and leaves the bare permalink", () => {
    expect(withoutInviteParam(invitePath(POST, TOKEN))).toBe(`/p/${POST}`);
  });

  it("keeps other params and drops a fragment", () => {
    expect(withoutInviteParam(`/p/x?a=1&invite=${TOKEN}&b=2#top`)).toBe(
      "/p/x?a=1&b=2",
    );
  });

  it("strips every repeat of the param", () => {
    expect(withoutInviteParam(`/p/x?invite=a&invite=b`)).toBe("/p/x");
  });

  it("leaves a path without a query alone", () => {
    expect(withoutInviteParam("/p/x")).toBe("/p/x");
  });
});

describe("pollVoteAccess", () => {
  const token = { kind: "token", token: TOKEN } as const;

  it("votes normally on an open poll, with or without a link", () => {
    expect(pollVoteAccess("open", { kind: "none" })).toBe("vote");
    expect(pollVoteAccess("open", token)).toBe("vote");
    expect(pollVoteAccess(undefined, { kind: "malformed" })).toBe("vote");
  });

  it("votes through the invite on an invite poll opened by a link", () => {
    expect(pollVoteAccess("invite", token)).toBe("invite");
  });

  it("is read-only on an invite poll without a usable link", () => {
    expect(pollVoteAccess("invite", { kind: "none" })).toBe("read-only");
    expect(pollVoteAccess("invite", { kind: "malformed" })).toBe("read-only");
  });
});

describe("parseInviteLabels", () => {
  it("makes one invite per line, trimmed", () => {
    expect(parseInviteLabels("  Ada \nGrace")).toEqual({
      ok: true,
      labels: ["Ada", "Grace"],
      named: 2,
      unnamed: 0,
    });
  });

  it("reads blank lines as unnamed invites", () => {
    expect(parseInviteLabels("Ada\n\n   \nGrace")).toEqual({
      ok: true,
      labels: ["Ada", "", "", "Grace"],
      named: 2,
      unnamed: 2,
    });
  });

  it("ignores only the caret line after a final line break", () => {
    expect(parseInviteLabels("Ada\n")).toMatchObject({ labels: ["Ada"] });
    expect(parseInviteLabels("Ada\n\n")).toMatchObject({ labels: ["Ada", ""] });
    expect(parseInviteLabels("\n")).toMatchObject({ labels: [""], unnamed: 1 });
    expect(parseInviteLabels("\n\n\n")).toMatchObject({ unnamed: 3 });
  });

  it("treats CRLF and CR as line breaks", () => {
    expect(parseInviteLabels("Ada\r\nGrace\rLin\r\n")).toMatchObject({
      labels: ["Ada", "Grace", "Lin"],
    });
  });

  it("refuses an empty textarea", () => {
    expect(parseInviteLabels("")).toMatchObject({ ok: false });
  });

  it("caps the batch at 200, the same rule as PV010", () => {
    expect(parseInviteLabels("\n".repeat(MAX_INVITES_PER_BATCH))).toMatchObject({
      ok: true,
      unnamed: MAX_INVITES_PER_BATCH,
    });
    expect(parseInviteLabels("\n".repeat(MAX_INVITES_PER_BATCH + 1))).toEqual({
      ok: false,
      message: inviteAdminNotice("PV010").message,
    });
  });

  it("names the line whose label is too long", () => {
    const long = "x".repeat(MAX_INVITE_LABEL_LENGTH + 1);
    const result = parseInviteLabels(`Ada\n${long}`);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toMatch(/^Line 2 /);
    expect(
      parseInviteLabels("x".repeat(MAX_INVITE_LABEL_LENGTH)).ok,
    ).toBe(true);
  });
});

describe("inviteVoteNotice", () => {
  it("reads PV004 as a bad link and PV005 as a spent invite", () => {
    expect(inviteVoteNotice("PV004")).toEqual({
      type: "error",
      message: "This invite link isn't valid for this poll.",
    });
    expect(inviteVoteNotice("PV005")).toEqual({
      type: "info",
      message: "This invite has already been used.",
    });
  });

  it("maps PV006 even though the invite path cannot reach it", () => {
    expect(inviteVoteNotice("PV006").type).toBe("info");
  });

  it("reads closed, missing poll, and wrong option as an open poll does", () => {
    expect(inviteVoteNotice("23514").message).toBe("This poll has closed.");
    expect(inviteVoteNotice("PV002").message).toBe(
      "That poll is no longer available.",
    );
    expect(inviteVoteNotice("PV003").message).toBe(
      "That option isn't part of this poll.",
    );
  });

  it("tells the voter to reopen the link on anything else", () => {
    for (const code of [undefined, "PV001", "XX000"]) {
      expect(inviteVoteNotice(code)).toEqual({
        type: "error",
        message: "We couldn't record your vote. Open your invite link again to retry.",
      });
    }
  });
});

describe("inviteAdminNotice", () => {
  it("maps every owner-side refusal to its own sentence", () => {
    const codes = ["PV002", "PV007", "PV008", "PV009", "PV010", "PV011"];
    const messages = codes.map((code) => inviteAdminNotice(code).message);

    expect(new Set(messages).size).toBe(codes.length);
    expect(messages).not.toContain(inviteAdminNotice(undefined).message);
  });

  it("reads the frozen mode and a used invite as the rules holding", () => {
    expect(inviteAdminNotice("PV007").type).toBe("info");
    expect(inviteAdminNotice("PV011").type).toBe("info");
  });

  it("never leaks a raw code or message for an unknown failure", () => {
    expect(inviteAdminNotice("42501")).toEqual(inviteAdminNotice(undefined));
  });
});

describe("isTokenHash", () => {
  it("accepts lowercase hex sha256 only", () => {
    expect(isTokenHash("a".repeat(64))).toBe(true);
    expect(isTokenHash("A".repeat(64))).toBe(false);
    expect(isTokenHash("a".repeat(63))).toBe(false);
    expect(isTokenHash(TOKEN)).toBe(false);
  });
});

describe("summarizeTurnout", () => {
  it("counts used invites out of all invites", () => {
    expect(
      summarizeTurnout([
        { used: true },
        { used: false },
        { used: false },
        { used: true },
      ]),
    ).toEqual({ used: 2, total: 4, text: "2 of 4 used" });
  });

  it("reads an empty list as 0 of 0", () => {
    expect(summarizeTurnout([]).text).toBe("0 of 0 used");
  });
});

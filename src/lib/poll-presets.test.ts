import { describe, expect, it } from "vitest";
import {
  CLOSE_CHOICES,
  HIDDEN_RESULTS_NEED_DEADLINE_MESSAGE,
  POLL_PRESETS,
  parseRoundSettings,
  readPollPreset,
  resultsVisibilityOf,
} from "@/lib/poll-presets";

const NOW = new Date("2026-10-25T09:00:00.000Z");

describe("POLL_PRESETS", () => {
  it("defaults a voting round to invite-only, hidden results and a deadline", () => {
    expect(POLL_PRESETS.round).toMatchObject({
      participationMode: "invite",
      resultsVisibility: "after_close",
      closesIn: "7d",
    });
  });

  it("keeps open mode as the quick poll's default", () => {
    expect(POLL_PRESETS.quick).toMatchObject({
      participationMode: "open",
      resultsVisibility: "live",
      closesIn: "none",
    });
  });

  it("gives every preset defaults the composer can submit", () => {
    for (const preset of Object.values(POLL_PRESETS)) {
      expect(
        parseRoundSettings(
          { resultsVisibility: preset.resultsVisibility, closesIn: preset.closesIn },
          NOW,
        ).ok,
      ).toBe(true);
    }
  });
});

describe("readPollPreset", () => {
  it("reads the quick preset", () => {
    expect(readPollPreset("quick").id).toBe("quick");
    expect(readPollPreset(["quick", "round"]).id).toBe("quick");
  });

  it("falls back to the voting round for anything else", () => {
    expect(readPollPreset(undefined).id).toBe("round");
    expect(readPollPreset("round").id).toBe("round");
    expect(readPollPreset("QUICK").id).toBe("round");
    expect(readPollPreset([]).id).toBe("round");
  });
});

describe("resultsVisibilityOf", () => {
  it("treats anything but after_close as live, the column default", () => {
    expect(resultsVisibilityOf("after_close")).toBe("after_close");
    expect(resultsVisibilityOf("live")).toBe("live");
    expect(resultsVisibilityOf("hidden")).toBe("live");
    expect(resultsVisibilityOf(undefined)).toBe("live");
  });
});

describe("parseRoundSettings", () => {
  it("turns a duration into a closing time from now", () => {
    expect(
      parseRoundSettings({ resultsVisibility: "after_close", closesIn: "3d" }, NOW),
    ).toEqual({
      ok: true,
      resultsVisibility: "after_close",
      closesAt: "2026-10-28T09:00:00.000Z",
    });
    expect(
      parseRoundSettings({ resultsVisibility: "live", closesIn: "1h" }, NOW),
    ).toEqual({ ok: true, resultsVisibility: "live", closesAt: "2026-10-25T10:00:00.000Z" });
  });

  it("allows no deadline with live results", () => {
    expect(
      parseRoundSettings({ resultsVisibility: "live", closesIn: "none" }, NOW),
    ).toEqual({ ok: true, resultsVisibility: "live", closesAt: null });
  });

  it("refuses hidden results with no deadline, since they would never show", () => {
    expect(
      parseRoundSettings({ resultsVisibility: "after_close", closesIn: "none" }, NOW),
    ).toEqual({ ok: false, message: HIDDEN_RESULTS_NEED_DEADLINE_MESSAGE });
  });

  it("refuses an unrecognised duration instead of dropping the deadline", () => {
    for (const closesIn of ["", "2d", "forever", "7D"]) {
      expect(
        parseRoundSettings({ resultsVisibility: "live", closesIn }, NOW).ok,
      ).toBe(false);
    }
  });

  it("has a distinct value for every choice", () => {
    const values = CLOSE_CHOICES.map((choice) => choice.value);
    expect(new Set(values).size).toBe(values.length);
  });
});

import { describe, expect, it } from "vitest";
import { ONBOARDING_REQUIRED_MESSAGE, needsOnboarding } from "@/lib/onboarding";

describe("needsOnboarding", () => {
  it("is done once onboarded_at is set", () => {
    expect(needsOnboarding({ onboarded_at: "2026-10-15T09:00:00.000Z" })).toBe(false);
  });

  it("is not done while onboarded_at is null", () => {
    expect(needsOnboarding({ onboarded_at: null })).toBe(true);
  });

  it("is not done when the column is absent from the row", () => {
    expect(needsOnboarding({})).toBe(true);
  });

  it("treats a missing profile row as not onboarded", () => {
    expect(needsOnboarding(null)).toBe(true);
    expect(needsOnboarding(undefined)).toBe(true);
  });

  it("does not count an empty timestamp as done", () => {
    expect(needsOnboarding({ onboarded_at: "" })).toBe(true);
  });
});

describe("ONBOARDING_REQUIRED_MESSAGE", () => {
  it("is the sentence the banner shows", () => {
    expect(ONBOARDING_REQUIRED_MESSAGE).toBe(
      "Finish profile setup in the onboarding flow before creating content.",
    );
  });
});

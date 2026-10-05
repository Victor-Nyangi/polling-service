import { describe, expect, it } from "vitest";
import { isPollClosed } from "@/lib/poll-status";

const now = new Date("2026-10-04T12:00:00.000Z");

describe("isPollClosed", () => {
  it("treats an active poll with no deadline as open", () => {
    expect(isPollClosed({ status: "active", closesAt: null }, now)).toBe(false);
  });

  it("closes on status alone, deadline or not", () => {
    expect(isPollClosed({ status: "closed", closesAt: null }, now)).toBe(true);
    expect(
      isPollClosed({ status: "closed", closesAt: "2099-01-01T00:00:00Z" }, now),
    ).toBe(true);
  });

  it("closes once the deadline has passed", () => {
    expect(
      isPollClosed({ status: "active", closesAt: "2026-10-04T11:59:59Z" }, now),
    ).toBe(true);
  });

  it("stays open before the deadline", () => {
    expect(
      isPollClosed({ status: "active", closesAt: "2026-10-04T12:00:01Z" }, now),
    ).toBe(false);
  });

  it("accepts a vote landing exactly on the deadline, as the trigger does", () => {
    expect(
      isPollClosed({ status: "active", closesAt: "2026-10-04T12:00:00Z" }, now),
    ).toBe(false);
  });

  it("errs open on a missing or unparseable deadline", () => {
    expect(isPollClosed({}, now)).toBe(false);
    expect(isPollClosed({ status: null, closesAt: null }, now)).toBe(false);
    expect(isPollClosed({ status: "active", closesAt: "soon" }, now)).toBe(false);
  });

  it("does not close on an unknown status", () => {
    expect(isPollClosed({ status: "draft", closesAt: null }, now)).toBe(false);
  });
});

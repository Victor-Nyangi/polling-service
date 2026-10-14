import { describe, expect, it } from "vitest";
import { isStaffRole } from "@/lib/roles";

describe("isStaffRole", () => {
  it("accepts the two staff roles", () => {
    expect(isStaffRole("moderator")).toBe(true);
    expect(isStaffRole("admin")).toBe(true);
  });

  it("rejects an ordinary user", () => {
    expect(isStaffRole("user")).toBe(false);
  });

  it("rejects a missing profile or role", () => {
    expect(isStaffRole(undefined)).toBe(false);
    expect(isStaffRole(null)).toBe(false);
    expect(isStaffRole("")).toBe(false);
  });

  it("does not loosen the match", () => {
    expect(isStaffRole("Admin")).toBe(false);
    expect(isStaffRole(" moderator")).toBe(false);
    expect(isStaffRole(["admin"])).toBe(false);
  });
});

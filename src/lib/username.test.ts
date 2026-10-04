import { describe, expect, it } from "vitest";
import {
  normalizeUsername,
  validateUsername,
  USERNAME_PATTERN,
} from "@/lib/username";

describe("normalizeUsername", () => {
  it("strips a single leading @", () => {
    expect(normalizeUsername("@nyangi_vic")).toBe("nyangi_vic");
  });

  it("lowercases", () => {
    expect(normalizeUsername("Nyangi_VIC")).toBe("nyangi_vic");
  });

  it("trims surrounding whitespace, inside and outside the @", () => {
    expect(normalizeUsername("  @ nyangi_vic  ")).toBe("nyangi_vic");
  });

  it("handles a missing value", () => {
    expect(normalizeUsername(undefined)).toBe("");
    expect(normalizeUsername(null)).toBe("");
    expect(normalizeUsername("")).toBe("");
  });

  it("leaves characters it is not allowed to silently rewrite", () => {
    expect(normalizeUsername("nyangi.vic")).toBe("nyangi.vic");
    expect(normalizeUsername("nyangi vic")).toBe("nyangi vic");
  });
});

describe("validateUsername", () => {
  it("accepts a valid username unchanged", () => {
    expect(validateUsername("nyangi_vic")).toEqual({
      ok: true,
      username: "nyangi_vic",
    });
    expect(validateUsername("abc")).toEqual({ ok: true, username: "abc" });
    expect(validateUsername("a".repeat(20))).toEqual({
      ok: true,
      username: "a".repeat(20),
    });
  });

  it("accepts a username with a leading @ and returns it stripped", () => {
    // The bug this helper exists for: `@nyangi_vic` was stored verbatim and
    // rendered as `@@nyangi_vic`.
    expect(validateUsername("@nyangi_vic")).toEqual({
      ok: true,
      username: "nyangi_vic",
    });
  });

  it("accepts uppercase input and returns it lowercased", () => {
    expect(validateUsername("Nyangi_Vic")).toEqual({
      ok: true,
      username: "nyangi_vic",
    });
    expect(validateUsername("@NYANGI_VIC")).toEqual({
      ok: true,
      username: "nyangi_vic",
    });
  });

  it("rejects an empty username", () => {
    expect(validateUsername("")).toMatchObject({ ok: false, reason: "empty" });
    expect(validateUsername("   ")).toMatchObject({
      ok: false,
      reason: "empty",
    });
    expect(validateUsername("@")).toMatchObject({ ok: false, reason: "empty" });
    expect(validateUsername(undefined)).toMatchObject({
      ok: false,
      reason: "empty",
    });
  });

  it("rejects a username that is too short", () => {
    expect(validateUsername("ab")).toMatchObject({
      ok: false,
      reason: "too-short",
    });
    expect(validateUsername("@ab")).toMatchObject({
      ok: false,
      reason: "too-short",
    });
  });

  it("rejects a username that is too long", () => {
    expect(validateUsername("a".repeat(21))).toMatchObject({
      ok: false,
      reason: "too-long",
    });
  });

  it("rejects invalid characters instead of stripping them", () => {
    for (const value of [
      "nyangi.vic",
      "nyangi vic",
      "nyangi-vic",
      "nyangi@vic",
      "nyangi/vic",
      "nyangi+vic",
      "nyängi_vic",
      "@@nyangi_vic",
    ]) {
      expect(validateUsername(value)).toMatchObject({
        ok: false,
        reason: "invalid-characters",
      });
    }
  });

  it("gives every rejection a non-empty message", () => {
    for (const value of ["", "ab", "a".repeat(21), "nyangi.vic"]) {
      const result = validateUsername(value);

      expect(result.ok).toBe(false);

      if (!result.ok) {
        expect(result.message.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("USERNAME_PATTERN", () => {
  it("matches the constraint applied to profiles.username in schema.sql", () => {
    expect(USERNAME_PATTERN.source).toBe("^[a-z0-9_]{3,20}$");
  });
});

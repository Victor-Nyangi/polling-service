import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "@/lib/redirect";

describe("safeRedirectPath", () => {
  it("passes through an ordinary same-origin path", () => {
    expect(safeRedirectPath("/onboarding")).toBe("/onboarding");
  });

  it("preserves query strings and fragments on an allowed path", () => {
    expect(safeRedirectPath("/moderation?status=open#queue")).toBe(
      "/moderation?status=open#queue",
    );
  });

  it("falls back when the value is missing", () => {
    expect(safeRedirectPath(undefined)).toBe("/");
    expect(safeRedirectPath(null)).toBe("/");
    expect(safeRedirectPath("")).toBe("/");
  });

  it("uses the caller's fallback instead of the default", () => {
    expect(safeRedirectPath(undefined, "/notifications")).toBe("/notifications");
    expect(safeRedirectPath("https://evil.com", "/moderation")).toBe(
      "/moderation",
    );
  });

  it("rejects absolute URLs", () => {
    expect(safeRedirectPath("https://evil.com")).toBe("/");
    expect(safeRedirectPath("http://evil.com")).toBe("/");
    expect(safeRedirectPath("javascript:alert(1)")).toBe("/");
  });

  // The two cases the leading-slash check alone would let through: browsers
  // resolve both against the current scheme and navigate off-site.
  it("rejects protocol-relative URLs that still start with a slash", () => {
    expect(safeRedirectPath("//evil.com")).toBe("/");
    expect(safeRedirectPath("//evil.com/path?a=b")).toBe("/");
  });

  it("rejects backslash-flavoured protocol-relative URLs", () => {
    expect(safeRedirectPath("/\\evil.com")).toBe("/");
    expect(safeRedirectPath("/\\/evil.com")).toBe("/");
  });

  it("rejects values that do not start with a slash at all", () => {
    expect(safeRedirectPath("onboarding")).toBe("/");
    expect(safeRedirectPath(" /onboarding")).toBe("/");
  });

  // Known gap, deliberately not asserted as passing. The WHATWG URL parser
  // strips ASCII tab and newline before resolving, so "/\t/evil.com" reaches
  // the browser as "//evil.com" -- protocol-relative, and off-site. Enabling
  // this test requires stripping those characters before the prefix checks.
  it.todo("rejects tab- and newline-obfuscated protocol-relative targets");
});

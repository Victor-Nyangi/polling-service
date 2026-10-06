import { describe, expect, it } from "vitest";
import { NAV_ITEMS, currentNavHref } from "@/lib/nav";

describe("NAV_ITEMS", () => {
  it("lists each destination once", () => {
    const hrefs = NAV_ITEMS.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});

describe("currentNavHref", () => {
  it("marks the link whose href is the current pathname", () => {
    expect(currentNavHref("/")).toBe("/");
    expect(currentNavHref("/notifications")).toBe("/notifications");
    expect(currentNavHref("/moderation")).toBe("/moderation");
    expect(currentNavHref("/onboarding")).toBe("/onboarding");
  });

  it("ignores the query string, fragment and a trailing slash", () => {
    expect(currentNavHref("/?notice=success&message=Saved")).toBe("/");
    expect(currentNavHref("/moderation?status=open#queue")).toBe("/moderation");
    expect(currentNavHref("/notifications/")).toBe("/notifications");
  });

  it("marks nothing for pages outside the nav", () => {
    expect(currentNavHref("/p/123")).toBeNull();
    expect(currentNavHref("/auth/login")).toBeNull();
    expect(currentNavHref("/notifications/extra")).toBeNull();
    expect(currentNavHref("/feed")).toBeNull();
  });

  it("marks nothing without a path", () => {
    expect(currentNavHref(null)).toBeNull();
    expect(currentNavHref(undefined)).toBeNull();
    expect(currentNavHref("")).toBeNull();
  });

  it("treats the viewer's own public profile as Profile", () => {
    expect(currentNavHref("/u/creator", "creator")).toBe("/onboarding");
    expect(currentNavHref("/u/Creator/", "creator")).toBe("/onboarding");
    expect(currentNavHref("/u/%40creator?tab=polls", "creator")).toBe(
      "/onboarding",
    );
  });

  it("does not mark Profile on someone else's profile or when signed out", () => {
    expect(currentNavHref("/u/opsally", "creator")).toBeNull();
    expect(currentNavHref("/u/creator")).toBeNull();
    expect(currentNavHref("/u/creator", null)).toBeNull();
    expect(currentNavHref("/u/creator", "")).toBeNull();
  });

  it("survives a malformed escape in the username segment", () => {
    expect(currentNavHref("/u/%E0%A4%A", "creator")).toBeNull();
  });
});

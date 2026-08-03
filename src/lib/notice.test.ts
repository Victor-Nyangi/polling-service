import { describe, expect, it } from "vitest";
import { buildNoticeHref, readNotice } from "@/lib/notice";

describe("buildNoticeHref", () => {
  it("encodes the notice type and message onto the target path", () => {
    expect(buildNoticeHref("/onboarding", "success", "Profile saved.")).toBe(
      "/onboarding?notice=success&message=Profile+saved.",
    );
  });

  it("percent-encodes characters that would break the query string", () => {
    const href = buildNoticeHref("/", "error", "Email & password are required?");

    expect(href).toBe(
      "/?notice=error&message=Email+%26+password+are+required%3F",
    );
    expect(new URL(href, "https://example.test").searchParams.get("message")).toBe(
      "Email & password are required?",
    );
  });

  it("routes the target through the redirect guard", () => {
    expect(buildNoticeHref("//evil.com", "info", "hi")).toBe(
      "/?notice=info&message=hi",
    );
    expect(buildNoticeHref("https://evil.com", "info", "hi")).toBe(
      "/?notice=info&message=hi",
    );
  });
});

describe("readNotice", () => {
  it("returns null when no search params are supplied", async () => {
    await expect(readNotice()).resolves.toBeNull();
  });

  it("reads a well-formed notice", async () => {
    await expect(
      readNotice(Promise.resolve({ notice: "success", message: "Vote recorded." })),
    ).resolves.toEqual({ type: "success", message: "Vote recorded." });
  });

  it("accepts every supported notice type", async () => {
    for (const type of ["success", "error", "info"] as const) {
      await expect(
        readNotice(Promise.resolve({ notice: type, message: "m" })),
      ).resolves.toEqual({ type, message: "m" });
    }
  });

  it("takes the first value when a param is repeated", async () => {
    await expect(
      readNotice(
        Promise.resolve({ notice: ["error", "success"], message: ["first", "second"] }),
      ),
    ).resolves.toEqual({ type: "error", message: "first" });
  });

  it("returns null when either half of the pair is missing", async () => {
    await expect(
      readNotice(Promise.resolve({ notice: "success" })),
    ).resolves.toBeNull();
    await expect(
      readNotice(Promise.resolve({ message: "orphaned" })),
    ).resolves.toBeNull();
    await expect(readNotice(Promise.resolve({}))).resolves.toBeNull();
  });

  it("rejects an unrecognised notice type rather than rendering it", async () => {
    await expect(
      readNotice(Promise.resolve({ notice: "warning", message: "m" })),
    ).resolves.toBeNull();
  });
});

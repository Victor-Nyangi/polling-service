import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  THEME_PREFERENCES,
  parseThemePreference,
  themeAttribute,
} from "@/lib/theme";

describe("parseThemePreference", () => {
  it("accepts each known preference", () => {
    for (const preference of THEME_PREFERENCES) {
      expect(parseThemePreference(preference)).toBe(preference);
    }
  });

  it("falls back to system when the cookie is missing", () => {
    expect(parseThemePreference(undefined)).toBe("system");
    expect(parseThemePreference(null)).toBe("system");
    expect(parseThemePreference("")).toBe("system");
  });

  it("falls back to system on anything it does not recognise", () => {
    expect(parseThemePreference("Dark")).toBe("system");
    expect(parseThemePreference(" dark")).toBe("system");
    expect(parseThemePreference("sepia")).toBe("system");
    expect(parseThemePreference('dark"><script>')).toBe("system");
    expect(parseThemePreference(["dark"])).toBe("system");
    expect(parseThemePreference(1)).toBe("system");
  });
});

describe("themeAttribute", () => {
  it("omits the attribute for system so the media query decides", () => {
    expect(themeAttribute("system")).toBeUndefined();
  });

  it("forces the chosen theme otherwise", () => {
    expect(themeAttribute("light")).toBe("light");
    expect(themeAttribute("dark")).toBe("dark");
  });
});

/**
 * CSS cannot share one declaration block between a media query and an
 * attribute selector, so globals.css repeats the dark tokens twice: once for
 * the OS preference, once for an explicit choice. This keeps the copies from
 * drifting apart.
 */
describe("globals.css dark tokens", () => {
  const css = readFileSync(
    resolve(process.cwd(), "src/app/globals.css"),
    "utf8",
  );

  function declarations(selector: string): string[] {
    const start = css.indexOf(`${selector} {`);
    expect(start, `${selector} block`).toBeGreaterThan(-1);
    const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
    return body
      .split(";")
      .map((line) => line.trim())
      .filter(Boolean);
  }

  it("defines the same dark tokens for the OS preference and the explicit choice", () => {
    const fromMedia = declarations(':root:not([data-theme="light"])');
    const fromChoice = declarations(':root[data-theme="dark"]');

    expect(fromMedia.length).toBeGreaterThan(0);
    expect(fromChoice).toEqual(fromMedia);
  });

  it("defines every light token again in the dark set", () => {
    const tokenNames = (lines: string[]) =>
      lines.map((line) => line.split(":")[0]).sort();

    expect(tokenNames(declarations(':root[data-theme="dark"]'))).toEqual(
      tokenNames(declarations(':root,\n[data-theme="light"]')),
    );
  });
});

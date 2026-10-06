/**
 * The pure half of the colour-theme toggle. The root layout reads the cookie
 * and sets `data-theme` on <html>; the Server Action writes the cookie; this
 * file owns every decision both of them make, so it can be unit-tested.
 *
 * `system` is the default and is deliberately not written to <html>: with no
 * `data-theme` attribute, `prefers-color-scheme` in globals.css decides.
 */

export const THEME_COOKIE = "theme";

/** One year. A display preference, so nothing is lost if it expires. */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const THEME_PREFERENCES = ["system", "light", "dark"] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export const THEME_LABELS: Record<ThemePreference, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

/**
 * The cookie (or form) value if it is one of the three known preferences,
 * otherwise `system`. Matching is exact: a tampered or stale value falls back
 * to the OS setting rather than guessing.
 */
export function parseThemePreference(value: unknown): ThemePreference {
  return THEME_PREFERENCES.includes(value as ThemePreference)
    ? (value as ThemePreference)
    : "system";
}

/**
 * The `data-theme` attribute for <html>, or `undefined` to omit it so the
 * media query decides. React drops attributes whose value is `undefined`.
 */
export function themeAttribute(
  preference: ThemePreference,
): "light" | "dark" | undefined {
  return preference === "system" ? undefined : preference;
}

/**
 * Request header the proxy sets to the current path plus query string, so the
 * header toggle (a Server Component, which cannot see the URL) can post a
 * `redirectTo` that returns the visitor to exactly where they were. The proxy
 * always overwrites it, and the action still routes it through
 * `safeRedirectPath`, so a client-supplied value cannot redirect off-site.
 */
export const CURRENT_PATH_HEADER = "x-pv-path";

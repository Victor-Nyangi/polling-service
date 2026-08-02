const FALLBACK_PATH = "/";

/**
 * Narrows a caller-supplied redirect target to a same-origin path.
 *
 * A leading-slash check alone is not enough: `//evil.com` and `/\evil.com` are
 * protocol-relative URLs that browsers resolve against the current scheme, so
 * they navigate off-site while still passing `startsWith("/")`.
 */
export function safeRedirectPath(
  value: string | null | undefined,
  fallback = FALLBACK_PATH,
): string {
  if (!value || !value.startsWith("/")) {
    return fallback;
  }

  if (value.startsWith("//") || value.startsWith("/\\")) {
    return fallback;
  }

  return value;
}

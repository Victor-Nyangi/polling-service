import { normalizeUsername } from "@/lib/username";

/**
 * The header's primary navigation. One list, rendered once by
 * src/components/app-shell.tsx and restyled per breakpoint with responsive
 * classes, so phones and desktops can never disagree about where the links go.
 */
export const NAV_ITEMS = [
  { href: "/", label: "Feed" },
  { href: "/notifications", label: "Notifications" },
  { href: "/moderation", label: "Moderation" },
  { href: "/onboarding", label: "Profile" },
] as const;

export type NavHref = (typeof NAV_ITEMS)[number]["href"];

const PROFILE_HREF: NavHref = "/onboarding";

function pathnameOf(currentPath: string): string {
  const pathname = currentPath.split(/[?#]/, 1)[0] ?? "";
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * Which nav link, if any, is the page being viewed, for `aria-current="page"`.
 *
 * `currentPath` is the path plus query string the proxy forwards as
 * CURRENT_PATH_HEADER. Matching is exact on the pathname, so a post permalink
 * or the auth pages mark nothing. The one widening is Profile: the viewer's
 * own public page (`/u/<their username>`) counts as Profile too, compared the
 * way `/u/[username]` resolves handles. Someone else's profile marks nothing,
 * because the Profile link is not about them.
 */
export function currentNavHref(
  currentPath: string | null | undefined,
  ownUsername?: string | null,
): NavHref | null {
  if (!currentPath) {
    return null;
  }

  const pathname = pathnameOf(currentPath);
  const exact = NAV_ITEMS.find((item) => item.href === pathname);

  if (exact) {
    return exact.href;
  }

  const profileMatch = /^\/u\/([^/]+)$/.exec(pathname);
  const own = normalizeUsername(ownUsername);

  if (
    profileMatch &&
    own !== "" &&
    normalizeUsername(decodeSegment(profileMatch[1])) === own
  ) {
    return PROFILE_HREF;
  }

  return null;
}

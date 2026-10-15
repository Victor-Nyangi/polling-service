/**
 * Whether an account still has to finish onboarding, decided one way for the
 * whole app: the banner in `AppShell` (via `getCurrentUser`) and the content
 * guards in `actions.ts` both call this, so the page can never say "go ahead"
 * while the action refuses, or the other way round.
 *
 * Onboarding is finished when the profile row has `onboarded_at` set, which
 * only `updateProfileAction` writes. A missing profile row counts as not
 * onboarded.
 */
export function needsOnboarding(
  profile: { onboarded_at?: unknown } | null | undefined,
): boolean {
  return !profile?.onboarded_at;
}

/** Shown by the banner, and returned by an action that refuses for this reason. */
export const ONBOARDING_REQUIRED_MESSAGE =
  "Finish profile setup in the onboarding flow before creating content.";

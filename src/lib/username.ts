/**
 * Usernames are rendered as `@{username}` everywhere (`poll-card`,
 * `poll-composer`, and `renderNotification` in `src/lib/notifications.ts`), so a
 * stored value that already carries an `@` renders as `@@handle`. The username
 * is also the `/u/[username]` path segment, so it has to stay lowercase and
 * URL-safe.
 *
 * `handle_new_user()` in `supabase/schema.sql` seeds exactly this shape at
 * sign-up and a check constraint on `profiles.username` enforces it in the
 * database. This helper is the application-side half of the same rule, so the
 * user gets a readable message instead of a Postgres constraint error.
 */
export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;

export type UsernameRejection =
  | "empty"
  | "too-short"
  | "too-long"
  | "invalid-characters";

export type UsernameCheck =
  | { ok: true; username: string }
  | { ok: false; reason: UsernameRejection; message: string };

/**
 * Trims, drops a single leading `@`, and lowercases.
 *
 * Only these three are applied silently: `@Nyangi_Vic` and `nyangi_vic` are the
 * same handle to a human, so rewriting them is not a surprise. Every other
 * difference is rejected by `validateUsername` with a message rather than
 * quietly rewritten into a handle the user did not choose.
 */
export function normalizeUsername(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .replace(/^@/, "")
    .trim()
    .toLowerCase();
}

/**
 * Normalises then validates. Length is checked before the character class so
 * the message names the actual problem instead of always blaming characters.
 */
export function validateUsername(
  value: string | null | undefined,
): UsernameCheck {
  const username = normalizeUsername(value);

  if (username.length === 0) {
    return {
      ok: false,
      reason: "empty",
      message: "Choose a username.",
    };
  }

  if (username.length < USERNAME_MIN_LENGTH) {
    return {
      ok: false,
      reason: "too-short",
      message: `Usernames need at least ${USERNAME_MIN_LENGTH} characters.`,
    };
  }

  if (username.length > USERNAME_MAX_LENGTH) {
    return {
      ok: false,
      reason: "too-long",
      message: `Usernames can be at most ${USERNAME_MAX_LENGTH} characters.`,
    };
  }

  if (!USERNAME_PATTERN.test(username)) {
    return {
      ok: false,
      reason: "invalid-characters",
      message:
        "Usernames can use only lowercase letters, numbers, and underscores.",
    };
  }

  return { ok: true, username };
}

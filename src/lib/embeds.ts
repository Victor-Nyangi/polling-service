/**
 * PostgREST embed-shape normalisers.
 *
 * A nested `select` returns an embedded relationship as an **array** when the
 * relationship is to-many, and as a **single object** when PostgREST can prove
 * it is to-one — which it does from a unique constraint or a one-to-one foreign
 * key. `polls.post_id` is `not null unique`, so `poll:polls ( ... )` comes back
 * as an object, not a one-element array.
 *
 * That difference silently dropped every post from the feed and from
 * `/p/[postId]`: the mapper did `Array.isArray(row.poll) ? row.poll : []`, which
 * yields `[]` for an object, so `pollRow` was `undefined` and the post was
 * mapped to `null`. A green build cannot catch this, because the shape is
 * decided by the database schema at request time and the rows are typed as
 * `unknown`.
 *
 * So: never branch on the shape at the call site. Run every embed through one of
 * these two, which accept either shape and are exercised against both in
 * `embeds.test.ts`.
 */

type EmbeddedRow = Record<string, unknown>;

function isRow(value: unknown): value is EmbeddedRow {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Every row of an embedded relationship, whether PostgREST returned an array
 * (to-many) or a bare object (to-one). Anything else — `null`, a missing key, a
 * scalar — is an empty list.
 */
export function embeddedRows(value: unknown): EmbeddedRow[] {
  if (Array.isArray(value)) {
    return value.filter(isRow);
  }

  return isRow(value) ? [value] : [];
}

/**
 * The single row of a to-one embedded relationship, accepting either shape.
 * `undefined` when the relationship is absent.
 */
export function firstEmbedded(value: unknown): EmbeddedRow | undefined {
  return embeddedRows(value)[0];
}

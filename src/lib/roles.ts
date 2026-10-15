/**
 * Whether a `profiles.role` value belongs to staff (moderator or admin).
 *
 * The RLS policies on `reports` are the guarantee: they check the same two
 * roles in SQL. This helper lets the action layer refuse a non-staff caller
 * with a readable sentence before it writes, instead of letting RLS filter the
 * write to zero rows and reporting success. Anything that is not exactly one
 * of the two staff roles, including a missing profile, is not staff.
 */
export function isStaffRole(role: unknown): boolean {
  return role === "moderator" || role === "admin";
}

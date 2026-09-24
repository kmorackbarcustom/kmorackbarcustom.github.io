// KMO booking-consumer query-result truth helpers.
//
// A query or network failure must never be folded into an empty/not-found
// outcome: an error has to throw so the caller reaches LOAD_ERROR, while only a
// successful query that genuinely returned no row / no rows may become
// SHOP_NOT_FOUND, NO_SERVICES or NO_STAFF.
//
// Pure by construction: no framework, network or database imports, so it can be
// unit-tested directly from `tests/`.

/** Minimal shape of a settled data-access result: either data, an error, or neither. */
export interface QueryOutcome<T> {
  data: T | null;
  error: { message?: string } | null;
}

const errorMessage = (error: { message?: string }, what: string): string =>
  error.message || `Failed to fetch ${what}`;

/**
 * Single-row read: throws on query error, and returns null only when the
 * successful query genuinely produced no row.
 */
export function singleRowOrNull<T>(outcome: QueryOutcome<T>, what: string): T | null {
  if (outcome.error) throw new Error(errorMessage(outcome.error, what));
  return outcome.data ?? null;
}

/**
 * Multi-row read: throws on query error, and returns an empty array only when
 * the successful query genuinely produced no rows.
 */
export function multipleRowsOrThrow<T>(outcome: QueryOutcome<T[]>, what: string): T[] {
  if (outcome.error) throw new Error(errorMessage(outcome.error, what));
  return outcome.data ?? [];
}

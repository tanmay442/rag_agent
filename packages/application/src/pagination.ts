/** Clamp and sanitise pagination parameters. Used by every admin
 *  list use-case (documents, users, audit, tickets). */
export function sanitizePagination(
  rawLimit: number | undefined | null,
  rawOffset: number | undefined | null,
  maxLimit: number,
  defaultLimit = 25,
): { limit: number; offset: number } {
  return {
    limit: Math.min(Math.max(Math.floor(rawLimit ?? defaultLimit), 1), maxLimit),
    offset: Math.max(Math.floor(rawOffset ?? 0), 0),
  };
}

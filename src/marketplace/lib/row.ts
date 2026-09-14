/**
 * A database row whose exact shape depends on the caller.
 *
 * Used only in the SHAPING code — the loops and helpers that run after a read,
 * turning rows into what a page renders. It is not a substitute for the
 * generated types: the queries themselves are still checked against
 * db/types.ts at `.from(...).select(...)`, which is where a wrong table name,
 * a misspelt column or a bad enum value gets caught.
 *
 * It exists because three things in this codebase are genuinely not knowable
 * from the schema:
 *
 *   1. jsonb. `listings.attributes`, `media`, and every bilingual `name` are
 *      `Json`, so `attributes.year` has no static type by definition.
 *   2. Per-call selects. The same table is read with a dozen different column
 *      lists and embedded joins; one Row type would describe none of them.
 *   3. Fields bolted on after the read — attachOffers() writes
 *      `listing_offers` onto rows that were never selected with it.
 *
 * Prefer a real type wherever the shape IS knowable. Reach for this when the
 * alternative is a cast on every line.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LooseRow = Record<string, any>;

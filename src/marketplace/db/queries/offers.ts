import { getMarketplaceDb } from '@/marketplace/db/client';

/**
 * Attaching a listing's offers to rows on their way to normalizeListing().
 *
 * ── Why this is a second query and not an embed ─────────────────────────────
 *
 * `listings ( …, listing_offers ( … ) )` is one round trip instead of two and
 * was the first implementation. It has one property that disqualifies it: a
 * PostgREST embed is resolved against the SCHEMA CACHE, so on a database where
 * §25 has not been run yet the whole select fails with
 *
 *     Could not find a relationship between 'listings' and 'listing_offers'
 *
 * and that is not a missing badge — it is the browse grid, the home page and
 * the car page all throwing, because the offer rides along with the listing
 * they need. Shipping code whose failure mode is "the marketplace is down
 * until someone runs a migration" is not a trade worth one round trip.
 *
 * Fetched separately, a missing table costs exactly what it should: no offers.
 *
 * ── Not silent ──────────────────────────────────────────────────────────────
 *
 * The miss is logged once, with the fix in it. A tolerant read that says
 * nothing is how §25 stays unapplied for a month while sellers wonder why
 * their offers do nothing.
 */

let warned = false;

/** One shared empty list, so a listing with no offers costs no allocation. */
const EMPTY: unknown[] = [];

export async function attachOffers<T>(rows: T): Promise<T> {
  const list = Array.isArray(rows) ? rows : rows ? [rows] : [];
  if (!list.length) return rows;

  const ids = [...new Set(list.map((r) => r?.id).filter(Boolean))];
  if (!ids.length) return rows;

  let data = null;

  try {
    /**
     * Active AND in its window. `active` is the seller's off switch, not the
     * schedule — see the comments on listing_offers.starts_at/ends_at: a null
     * start means "from now" and a null end means "until I turn it off", so
     * both are ordinary states rather than missing data.
     *
     * The PRICE was never wrong: lib/offer.js isOfferLive re-checks the window
     * when the row is shaped, so an expired offer never reached a price label.
     * This filter is about not shipping rows that are going to be discarded —
     * and about the callers that read these rows WITHOUT going through the
     * shaping layer, which is how an offer that ended on the 26th was still
     * being offered as a filter in the rail on the 27th.
     *
     * Two `.or()` calls, because PostgREST ANDs them together: (no start OR
     * started) AND (no end OR not ended).
     */
    const nowIso = new Date().toISOString();

    const result = await getMarketplaceDb()
      .from('listing_offers')
      .select('id, listing_id, label, discount_type, discount_value, starts_at, ends_at, active')
      .in('listing_id', ids)
      .eq('active', true)
      .or(`starts_at.is.null,starts_at.lte.${nowIso}`)
      .or(`ends_at.is.null,ends_at.gte.${nowIso}`);

    if (result.error) throw new Error(result.error.message);
    data = result.data;
  } catch (err) {
    if (!warned) {
      warned = true;
      console.warn(
        `[offers] listing_offers is unreadable (${
          err instanceof Error ? err.message : String(err)
        }). Prices will show without offers. ` +
          'Run src/marketplace/db/schema.sql §25 on this database.'
      );
    }
    // Every row gets an empty list rather than being left undefined, so the
    // shaping layer takes one path whether or not the table is there.
    for (const row of list) if (row) row.listing_offers = EMPTY;
    return rows;
  }

  const byListing = new Map<string, unknown[]>();
  for (const offer of data ?? []) {
    const bucket = byListing.get(offer.listing_id);
    if (bucket) bucket.push(offer);
    else byListing.set(offer.listing_id, [offer]);
  }

  for (const row of list) {
    if (row) row.listing_offers = byListing.get(row.id) ?? EMPTY;
  }

  return rows;
}

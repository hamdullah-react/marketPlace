'use server';

import { revalidatePath } from 'next/cache';
import { getMarketplaceDb } from '@/marketplace/db/client';
import { after as later } from 'next/server';
import { notifyShowroomFollowers } from '@/marketplace/db/queries/notifications';
import { vendorForAction } from '@/marketplace/auth/session';

/**
 * State changes and deletion for a seller's own listings.
 *
 * Separate from save-listing.js on purpose: that one builds a whole listing out
 * of a form, these change one column or remove one row. Mixing them would mean
 * the delete path carried the validator, the media handling and the spec writer
 * it has no use for.
 *
 * ── Where the vendor comes from ─────────────────────────────────────────────
 *
 * The SESSION, via vendorForAction(). It used to come from a hidden field in
 * the form, which meant the ownership check was theatre: every write was
 * scoped by .eq('vendor_id', …) to an id the caller had just supplied. Anyone
 * could post anyone's vendor id and the query would dutifully scope to it.
 *
 * Now the id is derived from who is signed in and the form's copy is ignored,
 * so those .eq() clauses finally mean what they always looked like they meant.
 */

const str = (fd, k) => {
  const v = fd.get(k);
  return typeof v === 'string' ? v.trim() : '';
};

/** Fresh on every result, so useActionResult can tell two identical outcomes apart. */
const stamp = () => Date.now() + Math.random();

const bump = () => {
  revalidatePath('/[locale]/marketplace/seller/listings', 'page');
  revalidatePath('/[locale]/marketplace/cars', 'page');
};

/**
 * The states this action will move a listing to.
 *
 * Not every listing_state value — `sold_out`, `expired` and `removed` are
 * outcomes the system reaches on its own, and `rejected` belongs to staff
 * review. Letting a row button set those would let a seller mark their own
 * listing rejected, which means nothing and cannot be undone from here.
 */
const ALLOWED_STATES = ['live', 'draft', 'pending_review'];

export async function setListingState(prevState, formData) {
  const listingId = str(formData, 'listingId');
  const next = str(formData, 'state');

  // Staff may pass a vendor to act for; a seller's own is used regardless of
  // what the form claims.
  const { vendorId, error: denied } = await vendorForAction(str(formData, 'vendorId') || null);
  if (denied) return { ok: false, error: denied, token: stamp() };

  if (!listingId) return { ok: false, error: 'NOT_FOUND', token: stamp() };
  if (!ALLOWED_STATES.includes(next)) return { ok: false, error: 'STATE_NOT_ALLOWED', token: stamp() };

  try {
    const db = getMarketplaceDb();

    const { data: current, error: readError } = await db
      .from('listings')
      .select('id, slug, name, state, published_at, media')
      .eq('id', listingId)
      .eq('vendor_id', vendorId)
      .maybeSingle();

    if (readError) return { ok: false, error: 'SAVE_FAILED', detail: readError.message, token: stamp() };
    if (!current) return { ok: false, error: 'NOT_FOUND', token: stamp() };

    // The same rule the form enforces on publish. Skipping it here would give a
    // seller a one-click way around it, and a live listing with no photo gets
    // no clicks — better refused than quietly ignored.
    if (next === 'live') {
      const media = Array.isArray(current.media) ? current.media : [];
      if (media.length === 0) return { ok: false, error: 'MEDIA_REQUIRED', token: stamp() };
    }

    const patch = { state: next };

    // Stamped once, the first time it goes live, and never rewritten — the
    // browse list orders by it, so re-publishing an old listing must not jump
    // it to the top of the results as though it were new.
    if (next === 'live' && !current.published_at) patch.published_at = new Date().toISOString();

    const { error } = await db
      .from('listings').update(patch).eq('id', listingId).eq('vendor_id', vendorId);

    if (error) return { ok: false, error: 'SAVE_FAILED', detail: error.message, token: stamp() };

    /* ── The FIRST time it goes live, and only then ───────────────────
       `published_at` is stamped once and never rewritten, so an empty one is
       the precise definition of "this car is new" — a seller pausing and
       re-publishing an old listing must not announce it again to the same
       people. That is the whole guard, and it is the same field the browse
       list orders by, so the two cannot disagree.

       Not awaited and unable to fail the publish: the car is live either way,
       and a notification is a courtesy on top of that.

       A bulk upload of forty cars will send forty notifications, one per car.
       Stated rather than pretended away — batching them into "12 new cars at
       Riyadh Motors" needs a digest with a schedule behind it, which is a
       feature and not a tweak to this line. */
    if (next === 'live' && !current.published_at) {
      later(() =>
        notifyShowroomFollowers({
          vendorId,
          listing: { id: current.id, name: current.name },
          vendorName: null,
          href: current.slug ? `/marketplace/listing/${current.slug}` : null,
        })
      );
    }

    bump();
    return { ok: true, error: null, token: stamp(), saved: next, from: current.state };
  } catch (err) {
    return { ok: false, error: 'SAVE_FAILED', detail: err.message, token: stamp() };
  }
}

/**
 * Removes a listing, unless something bought it.
 *
 * order_lines references listings with `on delete restrict`, so a sold listing
 * would fail at the database with a foreign-key message naming a constraint the
 * seller has never heard of. Checking first turns that into a sentence they can
 * act on. Variants, specs, enquiries and saved-listing rows all cascade, so
 * they need no handling.
 *
 * Media is deliberately left alone: media_assets is the vendor's own library,
 * shared across listings, so deleting a car must not delete photos another
 * listing is still using.
 */
export async function deleteListing(prevState, formData) {
  const listingId = str(formData, 'listingId');

  const { vendorId, error: denied } = await vendorForAction(str(formData, 'vendorId') || null);
  if (denied) return { ok: false, error: denied, token: stamp() };

  if (!listingId) return { ok: false, error: 'NOT_FOUND', token: stamp() };

  try {
    const db = getMarketplaceDb();

    const { count, error: countError } = await db
      .from('order_lines')
      .select('id', { count: 'exact', head: true })
      .eq('listing_id', listingId);

    if (countError) return { ok: false, error: 'DELETE_FAILED', detail: countError.message, token: stamp() };

    if ((count ?? 0) > 0) {
      return { ok: false, error: 'IN_USE_BY_ORDERS', params: { count }, token: stamp() };
    }

    // Scoped by vendor as well as id, so a wrong id deletes nothing rather than
    // someone else's car.
    const { data, error } = await db
      .from('listings').delete().eq('id', listingId).eq('vendor_id', vendorId).select('id');

    if (error) return { ok: false, error: 'DELETE_FAILED', detail: error.message, token: stamp() };
    if (!data?.length) return { ok: false, error: 'NOT_FOUND', token: stamp() };

    bump();
    return { ok: true, error: null, token: stamp(), saved: 'deleted' };
  } catch (err) {
    return { ok: false, error: 'DELETE_FAILED', detail: err.message, token: stamp() };
  }
}

/**
 * Removes several listings at once.
 *
 * Not a loop around deleteListing(). Two reasons, and both of them show up the
 * moment a seller ticks thirty rows:
 *
 *   · A loop is 2 round trips per listing. This is 2 in total — one to find
 *     which of them are sold, one to delete the rest.
 *   · A loop has no way to be partly right. If the eleventh listing is sold,
 *     the seller needs the other twenty-nine gone AND to be told which one
 *     stayed, rather than an error that leaves them guessing how far it got.
 *
 * So the sold ones are found first and simply left out of the delete, and the
 * result says how many went and how many were kept. Same rule as removing a
 * catalog template: what is in use is reported, not force-deleted.
 *
 * Media is left alone for the same reason as the single delete — media_assets
 * is the vendor's shared library, and a photo may belong to a car that stays.
 */
export async function deleteListings(prevState, formData) {
  const { vendorId, error: denied } = await vendorForAction(str(formData, 'vendorId') || null);
  if (denied) return { ok: false, error: denied, token: stamp() };

  // getAll: the checkboxes all post under one name, and get() would silently
  // take the first tick and delete exactly one row.
  const ids = [...new Set(
    formData.getAll('listingIds').filter((v) => typeof v === 'string' && v.trim())
  )];

  if (!ids.length) return { ok: false, error: 'NOTHING_SELECTED', token: stamp() };

  try {
    const db = getMarketplaceDb();

    // Which of them something has bought. order_lines is `on delete restrict`,
    // so including one of these would fail the whole delete at the database and
    // take the innocent rows down with it.
    const { data: sold, error: soldError } = await db
      .from('order_lines')
      .select('listing_id')
      .in('listing_id', ids);

    if (soldError) {
      return { ok: false, error: 'DELETE_FAILED', detail: soldError.message, token: stamp() };
    }

    const blocked = new Set((sold ?? []).map((r) => r.listing_id));
    const deletable = ids.filter((id) => !blocked.has(id));

    if (!deletable.length) {
      return { ok: false, error: 'IN_USE_BY_ORDERS', params: { count: blocked.size }, token: stamp() };
    }

    // Scoped by vendor as well as id, so an id belonging to someone else
    // deletes nothing instead of their car.
    const { data, error } = await db
      .from('listings')
      .delete()
      .in('id', deletable)
      .eq('vendor_id', vendorId)
      .select('id');

    if (error) return { ok: false, error: 'DELETE_FAILED', detail: error.message, token: stamp() };

    bump();
    return {
      ok: true,
      error: null,
      token: stamp(),
      saved: 'deleted',
      deleted: data?.length ?? 0,
      // Counted separately from `deleted`: a seller who ticked thirty and got
      // twenty-nine deserves to know the thirtieth was sold, not to wonder
      // whether it failed.
      kept: blocked.size,
    };
  } catch (err) {
    return { ok: false, error: 'DELETE_FAILED', detail: err.message, token: stamp() };
  }
}

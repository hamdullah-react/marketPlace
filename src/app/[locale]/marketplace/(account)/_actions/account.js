'use server';

/**
 * A buyer acting on their own things: saved cars and delivery addresses.
 *
 * Every one of these derives the user from the SESSION and scopes its write by
 * it. Nothing takes a user id from a form — there is no legitimate reason for
 * one to travel in a request, and a column called `user_id` that a caller can
 * set is not ownership, it is a suggestion.
 */

import { revalidatePath } from 'next/cache';
import { getMarketplaceDb } from '@/marketplace/db/client';
import { getViewer } from '@/marketplace/auth/session';

const str = (fd, k) => {
  const v = fd.get(k);
  return typeof v === 'string' ? v.trim() : '';
};

const stamp = () => Date.now() + Math.random();
const ok = (data = {}) => ({ ok: true, error: null, errors: {}, token: stamp(), ...data });
const bad = (error, errors = {}) => ({ ok: false, error, errors, token: stamp() });

function bump() {
  revalidatePath('/[locale]/marketplace/account', 'page');
  revalidatePath('/[locale]/marketplace/account/saved', 'page');
  revalidatePath('/[locale]/marketplace/account/addresses', 'page');
}

/* ── Saved cars ──────────────────────────────────────────────────────────── */

/**
 * Save or unsave, in one action.
 *
 * A toggle rather than separate save/unsave actions because the heart is one
 * button and the client's idea of the current state can be stale — two actions
 * would let a double click end up saving twice or unsaving something already
 * gone. The DATABASE decides which way it goes, and reports which way it went.
 */
export async function toggleSavedListing(prevState, formData) {
  const viewer = await getViewer();
  if (!viewer) return bad('NOT_SIGNED_IN');

  const listingId = str(formData, 'listingId');
  if (!listingId) return bad('NOT_FOUND');

  const db = getMarketplaceDb();

  const { data: existing } = await db
    .from('saved_listings')
    .select('id')
    .eq('user_id', viewer.userId)
    .eq('listing_id', listingId)
    .maybeSingle();

  if (existing) {
    const { error } = await db.from('saved_listings').delete().eq('id', existing.id);
    if (error) return bad('SAVE_FAILED');
    bump();
    return ok({ saved: false, total: await savedTotal(db, viewer.userId) });
  }

  const { error } = await db
    .from('saved_listings')
    .insert({ user_id: viewer.userId, listing_id: listingId });

  // 23505 — the unique (user_id, listing_id) index fired, which means two
  // clicks raced and the car is saved. That is the outcome the user wanted.
  if (error && error.code !== '23505') return bad('SAVE_FAILED');

  bump();
  return ok({ saved: true, total: await savedTotal(db, viewer.userId) });
}

/**
 * The count AFTER the write, so the header badge is told a fact rather than
 * left adding one to whatever it happened to be showing.
 *
 * A running tally in the browser drifts: two tabs, a failed save, a double tap
 * that raced into the 23505 above — each leaves the badge a number that no
 * query would produce. Counting here costs one `head: true` round trip on a
 * two-column index and ends the whole class of problem.
 *
 * Null on failure, and the client keeps its optimistic number in that case.
 * A badge that is one out is better than a badge that snaps to zero because a
 * count query failed after the save itself succeeded.
 */
async function savedTotal(db, userId) {
  const { count, error } = await db
    .from('saved_listings')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  return error ? null : (count ?? 0);
}

/* ── Addresses ───────────────────────────────────────────────────────────── */

export async function saveAddress(prevState, formData) {
  const viewer = await getViewer();
  if (!viewer) return bad('NOT_SIGNED_IN');

  const id = str(formData, 'id');
  const fullName = str(formData, 'fullName');
  const phone = str(formData, 'phone');
  const city = str(formData, 'city');

  const errors = {};
  if (!fullName) errors.fullName = 'NAME_REQUIRED';
  if (!phone) errors.phone = 'PHONE_REQUIRED';
  if (!city) errors.city = 'CITY_REQUIRED';
  if (Object.keys(errors).length) return bad('VALIDATION', errors);

  const db = getMarketplaceDb();
  const isDefault = formData.get('isDefault') === 'on' || formData.get('isDefault') === 'true';

  const row = {
    label: str(formData, 'label') || null,
    full_name: fullName,
    phone,
    city,
    district: str(formData, 'district') || null,
    street: str(formData, 'street') || null,
    building: str(formData, 'building') || null,
    postal_code: str(formData, 'postalCode') || null,
    notes: str(formData, 'notes') || null,
    is_default: isDefault,
  };

  /**
   * Exactly one default.
   *
   * Cleared BEFORE the write, and only across this user's own rows. Doing it
   * afterwards would leave a window where two addresses both claim to be the
   * default, and whichever the checkout read first would win.
   */
  if (isDefault) {
    await db
      .from('addresses')
      .update({ is_default: false })
      .eq('user_id', viewer.userId);
  }

  if (id) {
    const { data, error } = await db
      .from('addresses')
      .update(row)
      .eq('id', id)
      // Scoped, so a hand-edited id edits nothing rather than someone else's
      // delivery address.
      .eq('user_id', viewer.userId)
      .select('id');

    if (error) return bad('SAVE_FAILED');
    if (!data?.length) return bad('NOT_FOUND');
  } else {
    // The first address a person adds is their default whether they ticked the
    // box or not — otherwise checkout has a list with nothing selected.
    const { count } = await db
      .from('addresses')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', viewer.userId);

    const { error } = await db
      .from('addresses')
      .insert({ ...row, user_id: viewer.userId, is_default: isDefault || (count ?? 0) === 0 });

    if (error) return bad('SAVE_FAILED');
  }

  bump();
  return ok({ saved: 'address' });
}

export async function deleteAddress(prevState, formData) {
  const viewer = await getViewer();
  if (!viewer) return bad('NOT_SIGNED_IN');

  const id = str(formData, 'id');
  if (!id) return bad('NOT_FOUND');

  const db = getMarketplaceDb();

  const { data, error } = await db
    .from('addresses')
    .delete()
    .eq('id', id)
    .eq('user_id', viewer.userId)
    .select('id, is_default');

  if (error) return bad('DELETE_FAILED');
  if (!data?.length) return bad('NOT_FOUND');

  /**
   * Deleting the default promotes the next one.
   *
   * Otherwise a user with three addresses and none marked default reaches
   * checkout with nothing selected and no way to tell why.
   */
  if (data[0].is_default) {
    const { data: next } = await db
      .from('addresses')
      .select('id')
      .eq('user_id', viewer.userId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (next) await db.from('addresses').update({ is_default: true }).eq('id', next.id);
  }

  bump();
  return ok({ saved: 'deleted' });
}

/** Promote one address to default. Same single-default rule as saveAddress. */
export async function setDefaultAddress(prevState, formData) {
  const viewer = await getViewer();
  if (!viewer) return bad('NOT_SIGNED_IN');

  const id = str(formData, 'id');
  if (!id) return bad('NOT_FOUND');

  const db = getMarketplaceDb();

  await db.from('addresses').update({ is_default: false }).eq('user_id', viewer.userId);

  const { data, error } = await db
    .from('addresses')
    .update({ is_default: true })
    .eq('id', id)
    .eq('user_id', viewer.userId)
    .select('id');

  if (error) return bad('SAVE_FAILED');
  if (!data?.length) return bad('NOT_FOUND');

  bump();
  return ok({ saved: 'default' });
}

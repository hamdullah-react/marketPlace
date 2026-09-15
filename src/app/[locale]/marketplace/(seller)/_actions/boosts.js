'use server';

import { revalidatePath } from 'next/cache';
import { getMarketplaceDb } from '@/marketplace/db/client';
import { vendorForAction } from '@/marketplace/auth/session';
import { getBoostPlans } from '@/marketplace/db/queries/boosts';
import { isMissingSchema } from '@/marketplace/db/queries/engagement';
import { notifyAdmins } from '@/marketplace/lib/realtime';

/**
 * A seller asking for one of their cars to be featured.
 *
 * The request is all a seller can do. Featuring itself — is_featured and
 * featured_until on the listing — is written only by an admin approving it
 * (admin/_actions/boosts.js), and the listings_protect_promotion trigger
 * refuses those columns to anyone else.
 */

const str = (fd, k) => {
  const v = fd.get(k);
  return typeof v === 'string' ? v.trim() : '';
};
const stamp = () => Date.now() + Math.random();
const ok = (data = {}) => ({ ok: true, error: null, token: stamp(), ...data });
const bad = (error, extra = {}) => ({ ok: false, error, token: stamp(), ...extra });

const refresh = () => {
  revalidatePath('/[locale]/marketplace/seller/listings', 'page');
  revalidatePath('/[locale]/marketplace/seller/promotions', 'page');
  revalidatePath('/[locale]/marketplace/admin', 'layout');
};

export async function requestBoost(prevState, formData) {
  const { viewer, vendorId, error: denied } = await vendorForAction(str(formData, 'vendorId') || null);
  if (denied) return bad(denied);

  const listingId = str(formData, 'listingId');
  const days = Number(str(formData, 'days'));
  const note = str(formData, 'note').slice(0, 300) || null;

  if (!listingId) return bad('NOT_FOUND');
  if (!Number.isInteger(days) || days < 1) return bad('BOOST_DAYS');

  try {
    const db = getMarketplaceDb();

    const { data: listing, error: readError } = await db
      .from('listings')
      .select('id, state')
      .eq('id', listingId)
      .eq('vendor_id', vendorId)
      .maybeSingle();

    if (readError) return bad('SAVE_FAILED', { detail: readError.message });
    if (!listing) return bad('NOT_FOUND');
    if (listing.state !== 'live') return bad('BOOST_NOT_LIVE');

    // Only a plan an admin has created and switched on can be requested, and
    // its price is SNAPSHOTTED on the request — editing or deleting the plan
    // later must not change what an existing request was quoted.
    const { ready, plans } = await getBoostPlans({ activeOnly: true });
    if (!ready) return bad('BOOST_SETUP');
    const plan = plans.find((p) => p.days === days);
    if (!plan) return bad(plans.length ? 'BOOST_DAYS' : 'BOOST_NO_PLANS');

    const { error } = await db.from('listing_boosts').insert({
      listing_id: listingId,
      vendor_id: vendorId,
      days,
      note,
      requested_by: viewer?.userId ?? null,
      price: plan.price,
    });

    if (error) {
      if (isMissingSchema(error)) return bad('BOOST_SETUP');
      // listing_boosts_one_pending: a request is already waiting.
      if (error.code === '23505') return bad('BOOST_PENDING');
      return bad('SAVE_FAILED', { detail: error.message });
    }

    refresh();
    // Every open admin panel chimes and shows the new request.
    notifyAdmins('boost_new', { listingId });
    return ok({ requested: days });
  } catch (err) {
    return bad('SAVE_FAILED', { detail: err.message });
  }
}

export async function cancelBoostRequest(prevState, formData) {
  const { vendorId, error: denied } = await vendorForAction(str(formData, 'vendorId') || null);
  if (denied) return bad(denied);

  const boostId = str(formData, 'boostId');
  if (!boostId) return bad('NOT_FOUND');

  const { data, error } = await getMarketplaceDb()
    .from('listing_boosts')
    .update({ state: 'cancelled' })
    .eq('id', boostId)
    .eq('vendor_id', vendorId)
    .eq('state', 'pending')
    .select('id');

  if (error) return bad(isMissingSchema(error) ? 'BOOST_SETUP' : 'SAVE_FAILED', { detail: error.message });
  if (!data?.length) return bad('BOOST_NOT_PENDING');

  refresh();
  notifyAdmins('boost_changed', { id: boostId });
  return ok({ cancelled: boostId });
}

/**
 * Removes one of the seller's own requests from their list — a waiting one, or
 * one that is rejected, cancelled or over.
 *
 * NOT a running boost: that is a live placement on the marketplace, and the
 * record of it is what the platform team ends, not something to erase mid-run.
 */
export async function deleteBoostRequest(prevState, formData) {
  const { vendorId, error: denied } = await vendorForAction(str(formData, 'vendorId') || null);
  if (denied) return bad(denied);

  const boostId = str(formData, 'boostId');
  if (!boostId) return bad('NOT_FOUND');

  const db = getMarketplaceDb();

  const { data: boost, error } = await db
    .from('listing_boosts')
    .select('id, state, ends_at')
    .eq('id', boostId)
    .eq('vendor_id', vendorId)
    .maybeSingle();

  if (error) return bad(isMissingSchema(error) ? 'BOOST_SETUP' : 'DELETE_FAILED', { detail: error.message });
  if (!boost) return bad('NOT_FOUND');

  if (boost.state === 'approved' && boost.ends_at && Date.parse(boost.ends_at) > Date.now()) {
    return bad('BOOST_RUNNING');
  }

  const { error: deleteError } = await db
    .from('listing_boosts')
    .delete()
    .eq('id', boostId)
    .eq('vendor_id', vendorId);

  if (deleteError) return bad('DELETE_FAILED', { detail: deleteError.message });

  refresh();
  // A waiting request vanishing changes every admin's queue.
  if (boost.state === 'pending') notifyAdmins('boost_changed', { id: boostId });
  return ok({ deleted: boostId });
}

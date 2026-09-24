'use server';

/**
 * Moderation — the only code that sets reviews.hidden.
 *
 * ── Hide, don't delete ──────────────────────────────────────────────────────
 *
 * Hiding is reversible and leaves the row where it is: the author still sees
 * it on their account marked as taken down, the showroom still sees it on their
 * Reviews page, and the rating rollup stops counting it the moment it is hidden
 * and counts it again if it comes back. An appeal has something to appeal
 * about, and a mistake costs one press to undo.
 *
 * Deleting is kept for the thing hiding cannot answer — a bot, an advert, a
 * phone number posted in public — and it is audited like everything else.
 *
 * ── A reason is required to hide ────────────────────────────────────────────
 *
 * The buyer is shown it on their own page, and "your review was removed" with
 * no sentence after it is how a marketplace loses the person who wrote it. It
 * is stored on the row and written into the audit log with the admin's name.
 */

import { revalidatePath } from 'next/cache';
import { adminForAction } from '@/marketplace/auth/session';
import { getMarketplaceDb } from '@/marketplace/db/client';
import { writeAudit } from '@/marketplace/db/queries/admin';
import { notifyBuyerRequests, notifyVendorLeads } from '@/marketplace/lib/realtime';

const str = (fd, k) => {
  const v = fd.get(k);
  return typeof v === 'string' ? v.trim() : '';
};

const stamp = () => Date.now() + Math.random();
const ok = (data = {}) => ({ ok: true, error: null, token: stamp(), ...data });
const bad = (error, extra = {}) => ({ ok: false, error, token: stamp(), ...extra });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const refresh = () => {
  revalidatePath('/[locale]/marketplace/admin/reviews', 'page');
  revalidatePath('/[locale]/marketplace/vendors/[slug]', 'page');
  revalidatePath('/[locale]/marketplace/vendors/[slug]/reviews', 'page');
  revalidatePath('/[locale]/marketplace/seller/reviews', 'page');
  revalidatePath('/[locale]/marketplace/account/reviews', 'page');
};

/** Take a review down, or put it back. */
export async function setReviewHidden(prevState, formData) {
  const { viewer, error: denied } = await adminForAction();
  if (denied) return bad(denied);

  const reviewId = str(formData, 'reviewId');
  const hide = str(formData, 'decision') === 'hide';
  const reason = str(formData, 'reason').slice(0, 300);

  if (!UUID.test(reviewId)) return bad('NOT_FOUND');
  if (hide && !reason) return bad('REASON_REQUIRED');

  const db = getMarketplaceDb();

  const { data: review, error: readError } = await db
    .from('reviews')
    .select('id, vendor_id, buyer_user_id, rating, hidden')
    .eq('id', reviewId)
    .maybeSingle();

  if (readError?.code === '42P01') return bad('REVIEWS_NOT_MIGRATED');
  if (!review) return bad('NOT_FOUND');

  const patch = hide
    ? { hidden: true, hidden_reason: reason, hidden_by: viewer.userId, hidden_at: new Date().toISOString() }
    : { hidden: false, hidden_reason: null, hidden_by: null, hidden_at: null };

  let { error } = await db.from('reviews').update(patch).eq('id', reviewId);

  /* hidden_by / hidden_at arrive with the REVIEWS section of schema.sql. On a
     database that has not had it run, moderation still WORKS — the two columns
     that matter have been there since §8 — it just keeps no trail. Better than
     an admin unable to take down an advert because of a migration. */
  if (error?.code === '42703') {
    ({ error } = await db
      .from('reviews')
      .update(hide ? { hidden: true, hidden_reason: reason } : { hidden: false, hidden_reason: null })
      .eq('id', reviewId));
  }

  if (error) return bad('SAVE_FAILED', { detail: error.message });

  await writeAudit(
    viewer,
    hide ? 'review.hide' : 'review.show',
    'review',
    reviewId,
    { hidden: review.hidden },
    { hidden: hide, reason: hide ? reason : null, vendor: review.vendor_id }
  );

  // Both parties: the rating on the storefront has just moved, and the person
  // who wrote it is owed the news before they notice it missing.
  notifyVendorLeads(review.vendor_id, 'review_changed', { id: reviewId, hidden: hide });
  notifyBuyerRequests(review.buyer_user_id, 'review_changed', { id: reviewId, hidden: hide });

  refresh();
  return ok({ reviewId, hidden: hide });
}

/**
 * Remove a review outright — for what hiding cannot fix.
 *
 * Audited with the rating and the first of the text, because after this there
 * is no row left to look at and the log is the only record that it existed.
 */
export async function deleteReviewAsAdmin(prevState, formData) {
  const { viewer, error: denied } = await adminForAction();
  if (denied) return bad(denied);

  const reviewId = str(formData, 'reviewId');
  if (!UUID.test(reviewId)) return bad('NOT_FOUND');

  const db = getMarketplaceDb();

  const { data: review } = await db
    .from('reviews')
    .select('id, vendor_id, buyer_user_id, rating, body')
    .eq('id', reviewId)
    .maybeSingle();

  if (!review) return bad('NOT_FOUND');

  const { error } = await db.from('reviews').delete().eq('id', reviewId);
  if (error) return bad('DELETE_FAILED', { detail: error.message });

  await writeAudit(
    viewer,
    'review.delete',
    'review',
    reviewId,
    { rating: review.rating, body: (review.body ?? '').slice(0, 200), vendor: review.vendor_id },
    null
  );

  notifyVendorLeads(review.vendor_id, 'review_changed', { id: reviewId, deleted: true });
  notifyBuyerRequests(review.buyer_user_id, 'review_changed', { id: reviewId, deleted: true });

  refresh();
  return ok({ reviewId, deleted: true });
}

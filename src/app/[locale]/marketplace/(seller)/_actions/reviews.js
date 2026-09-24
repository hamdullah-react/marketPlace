'use server';

/**
 * A showroom answering a review.
 *
 * ── Why a reply and not an edit ─────────────────────────────────────────────
 *
 * A seller may add to a review and may never change one. Everything here is
 * scoped to `vendor_reply`, and the rating, the words and the verified badge
 * are untouchable from this side — which is the entire reason a rating is worth
 * reading. The one power a showroom has over a review is to answer it in
 * public, underneath, signed as them.
 *
 * ── Including the hidden ones ───────────────────────────────────────────────
 *
 * A review taken down by moderation can still be replied to. It is about them,
 * they can see it on their Reviews page, and if it comes back — because the
 * buyer rewrote it, or an appeal succeeded — the answer is already there.
 */

import { revalidatePath } from 'next/cache';
import { getMarketplaceDb } from '@/marketplace/db/client';
import { vendorForAction } from '@/marketplace/auth/session';
import { notifyBuyerRequests } from '@/marketplace/lib/realtime';
import { REPLY_MAX } from '@/marketplace/lib/review';

const str = (fd, k) => {
  const v = fd.get(k);
  return typeof v === 'string' ? v.trim() : '';
};

const stamp = () => Date.now() + Math.random();
const ok = (data = {}) => ({ ok: true, error: null, token: stamp(), ...data });
const bad = (error, extra = {}) => ({ ok: false, error, token: stamp(), ...extra });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Write, change or clear the showroom's answer to one review.
 *
 * An empty box means "take my reply down", which is the same action with the
 * same authority and does not deserve a second one.
 */
export async function replyToReview(prevState, formData) {
  const wanted = str(formData, 'vendorId') || null;
  const { vendorId, error: denied } = await vendorForAction(wanted);
  if (denied) return bad(denied);

  const locale = str(formData, 'locale') || 'ar';
  const reviewId = str(formData, 'reviewId');
  const reply = str(formData, 'reply').slice(0, REPLY_MAX);

  if (!UUID.test(reviewId)) return bad('NOT_FOUND');

  const db = getMarketplaceDb();

  const { data: review, error: readError } = await db
    .from('reviews')
    .select('id, buyer_user_id, vendor_reply')
    .eq('id', reviewId)
    // The showroom comes from the SESSION. A review id alone is never enough to
    // put words under a rating left on somebody else.
    .eq('vendor_id', vendorId)
    .maybeSingle();

  if (readError?.code === '42P01') return bad('REVIEWS_NOT_MIGRATED');
  if (!review) return bad('NOT_FOUND');

  const clearing = !reply;

  const { error } = await db
    .from('reviews')
    .update({
      vendor_reply: clearing ? null : reply,
      // The timestamp goes with the words. A cleared reply that kept its date
      // leaves "replied 3 days ago" under a review with no reply on it.
      vendor_replied_at: clearing ? null : new Date().toISOString(),
    })
    .eq('id', reviewId)
    .eq('vendor_id', vendorId);

  if (error) return bad('SAVE_FAILED', { detail: error.message });

  /* The buyer, on their own topic — somebody answered them. Only for a reply
     that was actually written: being told a showroom deleted its answer is a
     notification nobody wants. */
  if (!clearing) {
    notifyBuyerRequests(review.buyer_user_id, 'review_changed', { id: reviewId, replied: true });
  }

  revalidatePath(`/${locale}/marketplace/seller/reviews`);
  revalidatePath('/[locale]/marketplace/vendors/[slug]', 'page');
  revalidatePath('/[locale]/marketplace/vendors/[slug]/reviews', 'page');
  revalidatePath('/[locale]/marketplace/account/reviews', 'page');

  return ok({ reviewId, cleared: clearing });
}

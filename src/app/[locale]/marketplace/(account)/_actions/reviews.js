'use server';

/**
 * Writing, changing and withdrawing a review — the buyer's side.
 *
 * ── The lead comes from the database, never from the form ───────────────────
 *
 * The form posts a lead id and nothing else that matters. Which showroom the
 * review lands on, which car it names and whether it counts as a verified deal
 * are all read from that lead AFTER it has been confirmed to belong to the
 * person in the session. A vendor_id in a POST body would otherwise be a way to
 * one-star a showroom you have never dealt with.
 *
 * ── Eligibility is asked here as well as on the page ────────────────────────
 *
 * The account page hides the button for a deal that cannot be reviewed yet.
 * That is a courtesy, not a control: the page was rendered at some point in the
 * past and the rule is time-based, so the answer is asked again at the moment
 * of the write. lib/review.js is the only place the rule is written down.
 */

import { revalidatePath } from 'next/cache';
import { getMarketplaceDb } from '@/marketplace/db/client';
import { recordNotification } from '@/marketplace/db/queries/notifications';
import { currentViewer } from '@/marketplace/auth/session';
import { notifyVendorLeads } from '@/marketplace/lib/realtime';
import {
  reviewEligibility,
  isVerifiedDeal,
  normalizeRating,
  BODY_MAX,
} from '@/marketplace/lib/review';

const str = (fd, k) => {
  const v = fd.get(k);
  return typeof v === 'string' ? v.trim() : '';
};

const stamp = () => Date.now() + Math.random();
const ok = (data = {}) => ({ ok: true, error: null, token: stamp(), ...data });
const bad = (error, extra = {}) => ({ ok: false, error, token: stamp(), ...extra });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 42703 / 42P01 — the REVIEWS section of schema.sql has not been run here. */
const notMigrated = (error) => error?.code === '42703' || error?.code === '42P01';

const refresh = (locale) => {
  revalidatePath(`/${locale}/marketplace/account/reviews`);
  revalidatePath('/[locale]/marketplace/vendors/[slug]', 'page');
  revalidatePath('/[locale]/marketplace/vendors/[slug]/reviews', 'page');
  revalidatePath('/[locale]/marketplace/seller/reviews', 'page');
};

/**
 * Leave a review, or change one already left.
 *
 * One action for both because they are one decision from where the buyer is
 * standing — the form is the same form, and which of the two it is depends on
 * whether a review for that deal already exists.
 */
export async function saveReview(prevState, formData) {
  const viewer = await currentViewer();
  if (!viewer) return bad('NOT_SIGNED_IN');

  const locale = str(formData, 'locale') || 'ar';
  const leadId = str(formData, 'leadId');
  const reviewId = str(formData, 'reviewId');
  const rating = normalizeRating(str(formData, 'rating'));
  const body = str(formData, 'body').slice(0, BODY_MAX) || null;

  if (!rating) return bad('RATING_REQUIRED');

  const db = getMarketplaceDb();

  /* ── Changing one that exists ─────────────────────────────────────────── */
  if (reviewId) {
    if (!UUID.test(reviewId)) return bad('NOT_FOUND');

    const { data: mine, error: readError } = await db
      .from('reviews')
      .select('id, vendor_id, hidden')
      .eq('id', reviewId)
      .eq('buyer_user_id', viewer.userId)
      .maybeSingle();

    if (readError && notMigrated(readError)) return bad('REVIEWS_NOT_MIGRATED');
    if (!mine) return bad('NOT_FOUND');

    /* A hidden review is editable, deliberately. Moderation took it down for
       what it said; rewriting it is exactly the remedy, and leaving the author
       locked out means their only option is to delete and start again. */
    const { error } = await db
      .from('reviews')
      .update({ rating, body })
      .eq('id', reviewId)
      .eq('buyer_user_id', viewer.userId);

    if (error) return bad('SAVE_FAILED', { detail: error.message });

    notifyVendorLeads(mine.vendor_id, 'review_changed', { id: reviewId });
    refresh(locale);
    return ok({ reviewId, updated: true });
  }

  /* ── A new one ────────────────────────────────────────────────────────── */
  if (!UUID.test(leadId)) return bad('NOT_FOUND');

  const { data: lead, error: leadError } = await db
    .from('leads')
    .select('id, vendor_id, listing_id, stage, created_at, contact_name')
    .eq('id', leadId)
    .eq('buyer_user_id', viewer.userId)
    .maybeSingle();

  if (leadError?.code === '42P01') return bad('LEADS_NOT_MIGRATED');
  // NOT_FOUND rather than a refusal: a lead id that is not theirs must not be
  // distinguishable from one that does not exist.
  if (!lead) return bad('NOT_FOUND');

  const verdict = reviewEligibility(lead);
  if (!verdict.ok) {
    return bad(
      verdict.reason === 'TOO_SOON'
        ? 'REVIEW_TOO_SOON'
        : verdict.reason === 'TOO_LATE'
          ? 'REVIEW_TOO_LATE'
          : 'NOT_FOUND',
      { availableAt: verdict.availableAt }
    );
  }

  const row = {
    lead_id: lead.id,
    vendor_id: lead.vendor_id,
    listing_id: lead.listing_id,
    buyer_user_id: viewer.userId,
    // Snapshot, for the same reason leads keep contact_name: a public review
    // must not change its byline because somebody renamed themselves later.
    buyer_name: viewer.fullName || null,
    rating,
    body,
    // The showroom's own verdict on its own pipeline. It is the one part of a
    // review the seller controls, and it is a badge, not permission to write.
    verified_purchase: isVerifiedDeal(lead),
  };

  const { data: created, error } = await db.from('reviews').insert(row).select('id').maybeSingle();

  if (error) {
    if (notMigrated(error)) return bad('REVIEWS_NOT_MIGRATED');
    // 23505 — reviews_lead_once. They already reviewed this deal, most likely
    // in another tab or by pressing twice.
    if (error.code === '23505') return bad('ALREADY_REVIEWED');
    return bad('SAVE_FAILED', { detail: error.message });
  }

  // The showroom's dashboard: somebody just rated them, which is worth a chime.
  notifyVendorLeads(lead.vendor_id, 'review_new', { id: created?.id ?? null, rating });

  /* ── The two records a new review deserves ──────────────────────────────
     `review_new` and `review_to_moderate` have been declared in the KINDS
     table since the bell was built and NEITHER was ever recorded — the wording
     existed and nothing called it, so a showroom learned it had been rated by
     happening to open its Reviews page, and the platform learned it never.

     The showroom, because a rating moves its average and its position in the
     browse list. The platform, because a one-star review is the thing somebody
     should read before the seller rings up about it. */
  await recordNotification({
    audience: 'vendor',
    vendorId: lead.vendor_id,
    kind: 'review_new',
    data: { buyer: lead.contact_name ?? null, rating },
    href: '/marketplace/seller/reviews',
  });

  await recordNotification({
    audience: 'admin',
    kind: 'review_to_moderate',
    data: { rating, vendor: null },
    href: '/marketplace/admin/reviews',
  });
  refresh(locale);

  return ok({ reviewId: created?.id ?? null, created: true });
}

/**
 * Withdrawing a review.
 *
 * A hard delete, and the rating recomputes on its own — the rollup trigger in
 * schema.sql fires on delete too. The showroom's reply goes with it, which is
 * correct: a reply to nothing is not a thing anybody should be reading.
 */
export async function deleteReview(prevState, formData) {
  const viewer = await currentViewer();
  if (!viewer) return bad('NOT_SIGNED_IN');

  const locale = str(formData, 'locale') || 'ar';
  const reviewId = str(formData, 'reviewId');
  if (!UUID.test(reviewId)) return bad('NOT_FOUND');

  const db = getMarketplaceDb();

  const { data: mine } = await db
    .from('reviews')
    .select('id, vendor_id')
    .eq('id', reviewId)
    .eq('buyer_user_id', viewer.userId)
    .maybeSingle();

  if (!mine) return bad('NOT_FOUND');

  const { error } = await db
    .from('reviews')
    .delete()
    .eq('id', reviewId)
    // Scoped by author as well as id at the database, not only in the read
    // above: between the two, nothing may turn this into someone else's row.
    .eq('buyer_user_id', viewer.userId);

  if (error) return bad('DELETE_FAILED', { detail: error.message });

  notifyVendorLeads(mine.vendor_id, 'review_changed', { id: reviewId, deleted: true });
  refresh(locale);

  return ok({ reviewId, deleted: true });
}

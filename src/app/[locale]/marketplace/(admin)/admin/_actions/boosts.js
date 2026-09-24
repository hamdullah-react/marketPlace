'use server';

import { revalidatePath } from 'next/cache';
import { adminForAction } from '@/marketplace/auth/session';
import { getMarketplaceDb } from '@/marketplace/db/client';
import { writeAudit } from '@/marketplace/db/queries/admin';
import { isMissingSchema } from '@/marketplace/db/queries/engagement';
import { raiseBoostCharge } from '@/marketplace/db/queries/billing';
import { activateBoost } from '@/marketplace/db/queries/boosts';
import { notifyVendorLeads, notifyAdmins } from '@/marketplace/lib/realtime';

/**
 * Approve, reject or end a boost. The only code that sets a listing's
 * is_featured / featured_until.
 */

const str = (fd, k) => {
  const v = fd.get(k);
  return typeof v === 'string' ? v.trim() : '';
};
const stamp = () => Date.now() + Math.random();
const ok = (data = {}) => ({ ok: true, error: null, token: stamp(), ...data });
const bad = (error, extra = {}) => ({ ok: false, error, token: stamp(), ...extra });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_MS = 24 * 60 * 60 * 1000;

const refresh = () => {
  revalidatePath('/[locale]/marketplace/admin', 'layout');
  revalidatePath('/[locale]/marketplace/seller/listings', 'page');
  revalidatePath('/[locale]/marketplace/seller/promotions', 'page');
  revalidatePath('/[locale]/marketplace/admin/finance', 'page');
  revalidatePath('/[locale]/marketplace/seller/payouts', 'page');
  revalidatePath('/[locale]/marketplace/cars', 'page');
  revalidatePath('/[locale]/marketplace', 'page');
};

export async function decideBoost(prevState, formData) {
  const { viewer, error: denied } = await adminForAction();
  if (denied) return bad(denied);

  const boostId = str(formData, 'boostId');
  const decision = str(formData, 'decision');
  const note = str(formData, 'note').slice(0, 500) || null;

  if (!UUID.test(boostId)) return bad('NOT_FOUND');
  if (!['approve', 'reject', 'end'].includes(decision)) return bad('SAVE_FAILED');

  const db = getMarketplaceDb();

  const { data: boost, error } = await db
    .from('listing_boosts')
    /* `price` is not decoration: raiseBoostCharge bills from it, and a boost
       read without it looks exactly like a free one. That is what silently
       un-billed every approved promotion until now. */
    .select('id, listing_id, vendor_id, days, price, state, ends_at, listings ( id, state, featured_until )')
    .eq('id', boostId)
    .maybeSingle();

  if (error) return bad(isMissingSchema(error) ? 'BOOST_SETUP' : 'SAVE_FAILED', { detail: error.message });
  if (!boost) return bad('NOT_FOUND');

  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const reviewed = { reviewed_by: viewer.userId, reviewed_at: nowIso, review_note: note };

  // Set only by the approve branch, and only when raising the charge failed.
  let billingError = null;
  // The end date, when approval put the promotion straight on air — which now
  // happens only for a free one. Null means "waiting to be paid for".
  let granted = null;

  if (decision === 'approve') {
    if (boost.state !== 'pending') return bad('BOOST_NOT_PENDING');
    if (boost.listings?.state !== 'live') return bad('BOOST_NOT_LIVE');

    /* ── Approved, and NOT yet on the grid ──────────────────────────────
       The car is not featured here. Approval says the platform agreed to run
       the promotion; the placement starts when the money is recorded, which is
       what activateBoost() does from Finance.

       It used to feature the car at this moment, with the charge left unpaid
       beside it — so a showroom received the whole benefit and the invoice was
       a formality. `starts_at` and `ends_at` stay null for the same reason:
       the run has not begun, and dating it from today would silently burn days
       a showroom has not paid for. */
    const { data: moved, error: moveError } = await db
      .from('listing_boosts')
      .update({ ...reviewed, state: 'approved', starts_at: null, ends_at: null })
      .eq('id', boostId)
      .eq('state', 'pending')
      .select('id');
    if (moveError) return bad('SAVE_FAILED', { detail: moveError.message });
    if (!moved?.length) return bad('BOOST_NOT_PENDING');

    /* The showroom owes for it from here.
       Approval is the billable moment: not the request, which they may still
       cancel, and not the start date, which is now whenever they pay.
       The result is CARRIED, not thrown — a billing row that could not be
       written must not make the admin press Approve twice on a request that
       has already moved. It is reported instead, as a figure to reconcile. */
    const billed = await raiseBoostCharge(boost, { recordedBy: viewer.userId });
    if (!billed.ok) billingError = billed.error;
    if (billed.ok && billed.charge) {
      await writeAudit(viewer, 'charge.raise', 'charge', billed.charge.id, null, {
        ref: billed.charge.ref, amount: Number(boost.price ?? 0), boost: boostId, vendor: boost.vendor_id,
      });
    }

    /* ── Unless there is nothing to pay ─────────────────────────────────
       A free promotion is a real thing an admin may grant (raiseBoostCharge
       returns skipped: 'FREE'), and there is no payment coming to start it —
       so it goes on air now. Anything with a price waits. */
    if (billed.ok && billed.skipped === 'FREE') {
      const live = await activateBoost(boostId, { now });
      if (!live.ok) return bad('SAVE_FAILED', { detail: live.detail });
      granted = live.endsAt ?? null;
    }

    await writeAudit(viewer, 'boost.approve', 'listing', boost.listing_id, { boost: boostId }, {
      days: boost.days,
      awaiting_payment: !granted,
      ends_at: granted,
    });
  } else if (decision === 'reject') {
    const { data: moved, error: moveError } = await db
      .from('listing_boosts')
      .update({ ...reviewed, state: 'rejected' })
      .eq('id', boostId)
      .eq('state', 'pending')
      .select('id');
    if (moveError) return bad('SAVE_FAILED', { detail: moveError.message });
    if (!moved?.length) return bad('BOOST_NOT_PENDING');

    await writeAudit(viewer, 'boost.reject', 'listing', boost.listing_id, { boost: boostId }, { note });
  } else {
    if (boost.state !== 'approved') return bad('BOOST_NOT_ACTIVE');

    const { error: endError } = await db
      .from('listing_boosts')
      .update({ ...reviewed, state: 'cancelled', ends_at: nowIso })
      .eq('id', boostId);
    if (endError) return bad('SAVE_FAILED', { detail: endError.message });

    const { error: unfeatureError } = await db
      .from('listings')
      .update({ is_featured: false, featured_until: null })
      .eq('id', boost.listing_id);
    if (unfeatureError) return bad('SAVE_FAILED', { detail: unfeatureError.message });

    await writeAudit(viewer, 'boost.end', 'listing', boost.listing_id, { boost: boostId, ends_at: boost.ends_at }, { ends_at: nowIso });
  }

  refresh();
  // The showroom's dashboard chimes and its Promotions page updates; other
  // admins' queues drop the request they no longer need to look at.
  notifyVendorLeads(boost.vendor_id, 'boost_changed', { id: boostId, decision });
  notifyAdmins('boost_changed', { id: boostId, decision });
  // `billingError` is null on every path but a failed charge, so the form only
  // mentions money when something about it actually needs attention.
  /* `awaitingPayment` is what the admin's screen says out loud: the request is
     approved and the car is NOT on the grid until Finance records the money. */
  return ok({
    decision,
    billingError: billingError ?? null,
    awaitingPayment: decision === 'approve' && !granted && !billingError,
  });
}

/**
 * Deletes a request from the record — History entries, typically. A running
 * boost must be ended first, so a live placement is never erased mid-run.
 */
export async function deleteBoost(prevState, formData) {
  const { viewer, error: denied } = await adminForAction();
  if (denied) return bad(denied);

  const boostId = str(formData, 'boostId');
  if (!UUID.test(boostId)) return bad('NOT_FOUND');

  const db = getMarketplaceDb();

  const { data: boost, error } = await db
    .from('listing_boosts')
    .select('id, vendor_id, listing_id, days, state, ends_at')
    .eq('id', boostId)
    .maybeSingle();

  if (error) return bad(isMissingSchema(error) ? 'BOOST_SETUP' : 'DELETE_FAILED', { detail: error.message });
  if (!boost) return bad('NOT_FOUND');

  if (boost.state === 'approved' && boost.ends_at && Date.parse(boost.ends_at) > Date.now()) {
    return bad('BOOST_RUNNING');
  }

  const { error: deleteError } = await db.from('listing_boosts').delete().eq('id', boostId);
  if (deleteError) return bad('DELETE_FAILED', { detail: deleteError.message });

  await writeAudit(viewer, 'boost.delete', 'listing', boost.listing_id, { boost: boostId, state: boost.state, days: boost.days }, null);

  refresh();
  notifyVendorLeads(boost.vendor_id, 'boost_changed', { id: boostId, deleted: true });
  if (boost.state === 'pending') notifyAdmins('boost_changed', { id: boostId });
  return ok({ deleted: boostId });
}

/**
 * The ORDER featured cars appear in — set by dragging the Running tab.
 *
 * Takes the running boosts in the order the admin dragged them and writes
 * 1, 2, 3 … onto their listings (listings.featured_rank). The home page's
 * featured row and the top of All Cars read that column, so first here is
 * first there.
 *
 * Only boosts that are actually RUNNING can be ordered: the ids are checked
 * against the same query the tab is built from rather than trusted, so a stale
 * page cannot rank a boost that has ended.
 *
 * A running boost the admin did not send — one that started after their page
 * loaded — keeps whatever rank it had; it is not silently pushed to the end.
 */
export async function reorderFeatured(prevState, formData) {
  const { viewer, error: denied } = await adminForAction();
  if (denied) return bad(denied);

  let ids;
  try {
    ids = JSON.parse(str(formData, 'order') || '[]');
  } catch {
    return bad('SAVE_FAILED');
  }
  if (!Array.isArray(ids) || !ids.length || ids.length > 200) return bad('SAVE_FAILED');
  if (ids.some((id) => typeof id !== 'string' || !UUID.test(id))) return bad('NOT_FOUND');

  const db = getMarketplaceDb();

  const { data: running, error } = await db
    .from('listing_boosts')
    .select('id, listing_id')
    .eq('state', 'approved')
    .gt('ends_at', new Date().toISOString())
    .in('id', ids);

  if (error) return bad(isMissingSchema(error) ? 'BOOST_SETUP' : 'SAVE_FAILED', { detail: error.message });

  const listingOf = new Map((running ?? []).map((b) => [b.id, b.listing_id]));
  const ordered = ids.map((id) => listingOf.get(id)).filter(Boolean);
  if (!ordered.length) return bad('NOT_FOUND');

  // One statement per car: a handful of rows, and a single failure says which.
  for (let i = 0; i < ordered.length; i += 1) {
    const { error: rankError } = await db
      .from('listings')
      .update({ featured_rank: i + 1 })
      .eq('id', ordered[i]);

    if (rankError) {
      // 42703: schema.sql has not been run since featured_rank was added.
      if (rankError.code === '42703') return bad('BOOST_RANK_SETUP');
      return bad('SAVE_FAILED', { detail: rankError.message });
    }
  }

  await writeAudit(viewer, 'boost.reorder', 'listings', null, null, { order: ordered });

  refresh();
  return ok({ ordered: ordered.length });
}

/* ── Boost plans — created, priced and removed by an admin ────────────────── */

const refreshPlans = () => {
  revalidatePath('/[locale]/marketplace/admin/content/boost-plans', 'page');
  revalidatePath('/[locale]/marketplace/seller/promotions', 'page');
};

/**
 * Creates a plan, or updates one when `planId` is sent.
 *
 * Requests already made keep the price they were sent at (listing_boosts.price),
 * so repricing here only affects requests made afterwards.
 */
export async function saveBoostPlan(prevState, formData) {
  const { viewer, error: denied } = await adminForAction();
  if (denied) return bad(denied);

  const planId = str(formData, 'planId');
  const daysRaw = str(formData, 'days');
  const priceRaw = str(formData, 'price');
  const days = Number(daysRaw);
  const price = Number(priceRaw);

  if (planId && !UUID.test(planId)) return bad('NOT_FOUND');
  if (daysRaw === '' || !Number.isInteger(days) || days < 1 || days > 365) return bad('BOOST_PLAN_DAYS');
  if (priceRaw === '' || !Number.isFinite(price) || price < 0) return bad('BOOST_PRICE_INVALID');

  const row = { days, price, active: formData.get('active') === 'on' };
  const db = getMarketplaceDb();

  const { data, error } = planId
    ? await db.from('boost_plans').update(row).eq('id', planId).select('id')
    : await db.from('boost_plans').insert(row).select('id');

  if (error) {
    // days is unique: two "7 day" plans would be one choice shown twice.
    if (error.code === '23505') return bad('BOOST_PLAN_EXISTS');
    return bad(isMissingSchema(error) ? 'BOOST_SETUP' : 'SAVE_FAILED', { detail: error.message });
  }
  if (planId && !data?.length) return bad('NOT_FOUND');

  await writeAudit(viewer, planId ? 'boost.plan.update' : 'boost.plan.create', 'boost_plans', data?.[0]?.id ?? planId, null, row);

  refreshPlans();
  return ok({ saved: true });
}

/** Removes a plan. Requests that used it keep their snapshotted price. */
export async function deleteBoostPlan(prevState, formData) {
  const { viewer, error: denied } = await adminForAction();
  if (denied) return bad(denied);

  const planId = str(formData, 'planId');
  if (!UUID.test(planId)) return bad('NOT_FOUND');

  const { data, error } = await getMarketplaceDb()
    .from('boost_plans')
    .delete()
    .eq('id', planId)
    .select('id, days, price');

  if (error) return bad(isMissingSchema(error) ? 'BOOST_SETUP' : 'DELETE_FAILED', { detail: error.message });
  if (!data?.length) return bad('NOT_FOUND');

  await writeAudit(viewer, 'boost.plan.delete', 'boost_plans', planId, data[0], null);

  refreshPlans();
  return ok({ deleted: planId });
}

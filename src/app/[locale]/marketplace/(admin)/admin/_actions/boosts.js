'use server';

import { revalidatePath } from 'next/cache';
import { adminForAction } from '@/marketplace/auth/session';
import { getMarketplaceDb } from '@/marketplace/db/client';
import { writeAudit } from '@/marketplace/db/queries/admin';
import { isMissingSchema } from '@/marketplace/db/queries/engagement';
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
    .select('id, listing_id, vendor_id, days, state, ends_at, listings ( id, state, featured_until )')
    .eq('id', boostId)
    .maybeSingle();

  if (error) return bad(isMissingSchema(error) ? 'BOOST_SETUP' : 'SAVE_FAILED', { detail: error.message });
  if (!boost) return bad('NOT_FOUND');

  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const reviewed = { reviewed_by: viewer.userId, reviewed_at: nowIso, review_note: note };

  if (decision === 'approve') {
    if (boost.state !== 'pending') return bad('BOOST_NOT_PENDING');
    if (boost.listings?.state !== 'live') return bad('BOOST_NOT_LIVE');

    // A car that is already featured gets the new days added to the end of
    // the current boost, not overlapping it.
    const runningUntil = boost.listings?.featured_until ? Date.parse(boost.listings.featured_until) : 0;
    const start = Math.max(now, runningUntil || 0);
    const endsIso = new Date(start + boost.days * DAY_MS).toISOString();

    const { data: moved, error: moveError } = await db
      .from('listing_boosts')
      .update({ ...reviewed, state: 'approved', starts_at: new Date(start).toISOString(), ends_at: endsIso })
      .eq('id', boostId)
      .eq('state', 'pending')
      .select('id');
    if (moveError) return bad('SAVE_FAILED', { detail: moveError.message });
    if (!moved?.length) return bad('BOOST_NOT_PENDING');

    const { error: featureError } = await db
      .from('listings')
      .update({ is_featured: true, featured_until: endsIso })
      .eq('id', boost.listing_id);
    if (featureError) return bad('SAVE_FAILED', { detail: featureError.message });

    await writeAudit(viewer, 'boost.approve', 'listing', boost.listing_id, { boost: boostId }, { days: boost.days, ends_at: endsIso });
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
  return ok({ decision });
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

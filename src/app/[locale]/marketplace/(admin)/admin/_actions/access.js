'use server';

/**
 * Who may use their dashboard — the only code that moves `access_until` or sets
 * `access_blocked`.
 *
 * ── Every one of these is audited ───────────────────────────────────────────
 *
 * These are the actions a showroom will ring up about: "you said I had until
 * the end of the month", "who switched us off". Each writes the before and
 * after dates to audit_log with the admin's name, and the log is written by the
 * service role so its subject cannot edit it (§17.12).
 *
 * ── And every one is REAL TIME ──────────────────────────────────────────────
 *
 * A seller sitting on the blocked screen while the admin presses Extend must
 * see it open, not be told to refresh — and a showroom being switched off must
 * lose the dashboard at once rather than at its next navigation. Both come from
 * the same broadcast: `access_changed` on the showroom's own private topic.
 */

import { revalidatePath } from 'next/cache';
import { adminForAction } from '@/marketplace/auth/session';
import { getMarketplaceDb } from '@/marketplace/db/client';
import { writeAudit } from '@/marketplace/db/queries/admin';
import { getVendorAccess } from '@/marketplace/db/queries/access';
import { notifyVendorLeads } from '@/marketplace/lib/realtime';
import { extendedTo } from '@/marketplace/lib/access';

const str = (fd, k) => {
  const v = fd.get(k);
  return typeof v === 'string' ? v.trim() : '';
};

const num = (fd, k) => Number(str(fd, k));

const stamp = () => Date.now() + Math.random();
const ok = (data = {}) => ({ ok: true, error: null, token: stamp(), ...data });
const bad = (error, extra = {}) => ({ ok: false, error, token: stamp(), ...extra });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const refresh = () => {
  revalidatePath('/[locale]/marketplace/admin/subscriptions', 'page');
  revalidatePath('/[locale]/marketplace/admin', 'page');
  revalidatePath('/[locale]/marketplace/subscription', 'page');
  // Every seller page re-derives access from the session, so the dashboard has
  // to be re-rendered for the change to show on a tab that is already open.
  revalidatePath('/[locale]/marketplace/seller', 'layout');
};

/** 42703 — the VENDOR ACCESS section of schema.sql has not been run here. */
const notMigrated = (error) => error?.code === '42703';

/**
 * Give a showroom more time.
 *
 * Adds to what is left rather than replacing it — somebody renewing a week
 * early keeps that week — and starts from today when the date has already
 * passed, so nobody pays for the fortnight they spent locked out. The rule is
 * extendedTo() in lib/access.js, shared with everything else that reasons about
 * these dates.
 */
export async function extendAccess(prevState, formData) {
  const { viewer, error: denied } = await adminForAction();
  if (denied) return bad(denied);

  const vendorId = str(formData, 'vendorId');
  const days = num(formData, 'days');
  const note = str(formData, 'note').slice(0, 300) || null;

  if (!UUID.test(vendorId)) return bad('NOT_FOUND');
  if (!Number.isFinite(days) || days < 1 || days > 3650) return bad('ACCESS_DAYS_INVALID');

  const db = getMarketplaceDb();
  const vendor = await getVendorAccess(vendorId);
  if (!vendor) return bad('NOT_FOUND');

  const until = extendedTo(vendor, days);

  /* Extending also LIFTS a manual block. An admin who has just taken payment
     and pressed "+30 days" means "they are back in", and leaving the switch
     down would hand them a screen that still says blocked with a date a month
     out — which reads as a bug and generates the support call this is meant to
     end. Clearing it is the intent of the press. */
  const { error } = await db
    .from('vendors')
    .update({
      access_until: until,
      access_blocked: false,
      access_block_reason: null,
      access_blocked_at: null,
      access_blocked_by: null,
    })
    .eq('id', vendorId);

  if (error) return bad(notMigrated(error) ? 'ACCESS_NOT_MIGRATED' : 'SAVE_FAILED', { detail: error.message });

  await writeAudit(
    viewer,
    'access.extend',
    'vendor',
    vendorId,
    { access_until: vendor.access_until, was_blocked: vendor.access_blocked },
    { access_until: until, days, note }
  );

  notifyVendorLeads(vendorId, 'access_changed', { allowed: true, until });
  refresh();

  return ok({ vendorId, until });
}

/** Switch a showroom off now, whatever its date says. */
export async function blockVendor(prevState, formData) {
  const { viewer, error: denied } = await adminForAction();
  if (denied) return bad(denied);

  const vendorId = str(formData, 'vendorId');
  const reason = str(formData, 'reason').slice(0, 300);

  if (!UUID.test(vendorId)) return bad('NOT_FOUND');
  // The showroom is shown this on the screen it lands on. "Your dashboard is
  // closed" with no sentence after it is how a seller becomes an ex-seller.
  if (!reason) return bad('ACCESS_REASON_REQUIRED');

  const db = getMarketplaceDb();
  const vendor = await getVendorAccess(vendorId);
  if (!vendor) return bad('NOT_FOUND');

  const { error } = await db
    .from('vendors')
    .update({
      access_blocked: true,
      access_block_reason: reason,
      access_blocked_at: new Date().toISOString(),
      access_blocked_by: viewer.userId,
    })
    .eq('id', vendorId);

  if (error) return bad(notMigrated(error) ? 'ACCESS_NOT_MIGRATED' : 'SAVE_FAILED', { detail: error.message });

  await writeAudit(
    viewer,
    'access.block',
    'vendor',
    vendorId,
    { was_blocked: vendor.access_blocked, access_until: vendor.access_until },
    { reason }
  );

  // Takes the dashboard away from an open tab at once — see LiveAccess and
  // useLiveLeads, which both listen for this.
  notifyVendorLeads(vendorId, 'access_changed', { allowed: false, reason });
  refresh();

  return ok({ vendorId, blocked: true });
}

/**
 * Lift a manual block.
 *
 * Only the switch. The DATE is untouched, deliberately: unblocking a showroom
 * whose subscription also expired should leave them expired rather than
 * silently granting time nobody paid for. The admin's list shows them as
 * expired straight afterwards, and Extend is the button that changes that.
 */
export async function unblockVendor(prevState, formData) {
  const { viewer, error: denied } = await adminForAction();
  if (denied) return bad(denied);

  const vendorId = str(formData, 'vendorId');
  if (!UUID.test(vendorId)) return bad('NOT_FOUND');

  const db = getMarketplaceDb();
  const vendor = await getVendorAccess(vendorId);
  if (!vendor) return bad('NOT_FOUND');

  const { error } = await db
    .from('vendors')
    .update({
      access_blocked: false,
      access_block_reason: null,
      access_blocked_at: null,
      access_blocked_by: null,
    })
    .eq('id', vendorId);

  if (error) return bad(notMigrated(error) ? 'ACCESS_NOT_MIGRATED' : 'SAVE_FAILED', { detail: error.message });

  await writeAudit(
    viewer,
    'access.unblock',
    'vendor',
    vendorId,
    { reason: vendor.access_block_reason },
    { access_until: vendor.access_until }
  );

  notifyVendorLeads(vendorId, 'access_changed', { allowed: true });
  refresh();

  return ok({ vendorId, blocked: false });
}

/** How long the free period is, for showrooms created from now on. */
export async function saveTrialDays(prevState, formData) {
  const { viewer, error: denied } = await adminForAction();
  if (denied) return bad(denied);

  const days = num(formData, 'trialDays');
  if (!Number.isFinite(days) || days < 0 || days > 365) return bad('TRIAL_DAYS_INVALID');

  const db = getMarketplaceDb();
  const { error } = await db.from('site_settings').update({ trial_days: days }).eq('id', true);

  if (error) return bad(notMigrated(error) ? 'ACCESS_NOT_MIGRATED' : 'SAVE_FAILED', { detail: error.message });

  /* Deliberately NOT retroactive: the database trigger reads this at the moment
     a showroom is created, so changing it moves nobody's existing date. An
     admin shortening the trial must not close a dashboard somebody is using. */
  await writeAudit(viewer, 'access.trial_days', 'site_settings', 'trial_days', null, { days });

  refresh();
  return ok({ days });
}

/** Create or edit a renewal plan. */
export async function saveVendorPlan(prevState, formData) {
  const { viewer, error: denied } = await adminForAction();
  if (denied) return bad(denied);

  const planId = str(formData, 'planId');
  const days = num(formData, 'days');
  const price = num(formData, 'price');

  if (!Number.isFinite(days) || days < 1 || days > 3650) return bad('PLAN_DAYS_INVALID');
  if (!Number.isFinite(price) || price < 0) return bad('PLAN_PRICE_INVALID');

  const row = {
    name: { ar: str(formData, 'nameAr').slice(0, 80), en: str(formData, 'nameEn').slice(0, 80) },
    days,
    price,
    active: str(formData, 'active') !== 'false',
    sort: Number.isFinite(num(formData, 'sort')) ? num(formData, 'sort') : 0,
  };

  const db = getMarketplaceDb();

  const { error } = planId
    ? await db.from('vendor_plans').update(row).eq('id', planId)
    : await db.from('vendor_plans').insert(row);

  if (error) {
    return bad(error.code === '42P01' ? 'ACCESS_NOT_MIGRATED' : 'SAVE_FAILED', { detail: error.message });
  }

  await writeAudit(viewer, planId ? 'plan.update' : 'plan.add', 'vendor_plan', planId || null, null, row);

  refresh();
  return ok();
}

/** Remove a renewal plan. */
export async function deleteVendorPlan(prevState, formData) {
  const { viewer, error: denied } = await adminForAction();
  if (denied) return bad(denied);

  const planId = str(formData, 'planId');
  if (!UUID.test(planId)) return bad('NOT_FOUND');

  const db = getMarketplaceDb();
  const { error } = await db.from('vendor_plans').delete().eq('id', planId);
  if (error) return bad('DELETE_FAILED', { detail: error.message });

  await writeAudit(viewer, 'plan.remove', 'vendor_plan', planId, null, null);

  refresh();
  return ok({ planId });
}

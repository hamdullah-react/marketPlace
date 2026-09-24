'use server';

/**
 * Asking to renew.
 *
 * ── This is the one seller write the paywall must not block ─────────────────
 *
 * Every other seller action goes through vendorForAction(), which refuses a
 * lapsed showroom. That is right for publishing a car and wrong here: the
 * showroom that needs this button is the one already locked out. So it resolves
 * through vendorForRenewal(), which is narrowly named for exactly this and used
 * nowhere else.
 *
 * ── What it does NOT do ─────────────────────────────────────────────────────
 *
 * It does not take money and it does not grant a single day. It raises a CHARGE
 * — the same kind of row a boost raises — and tells the seller where to
 * transfer. Access moves when an admin records the payment, because the platform
 * records money when it can see it has arrived, not when somebody says they have
 * sent it. A seller who could grant their own access would not need to pay.
 *
 * ── The plan is SNAPSHOTTED ─────────────────────────────────────────────────
 *
 * Price, length and name are copied onto the charge. A showroom that asked for
 * 90 days at 900 has asked for that, whatever an admin later edits the plan to.
 */

import { revalidatePath } from 'next/cache';
import { getMarketplaceDb } from '@/marketplace/db/client';
import { vendorForRenewal } from '@/marketplace/auth/session';
import { notifyAdmins } from '@/marketplace/lib/realtime';
import { DUE_DAYS } from '@/marketplace/lib/billing';

const str = (fd, k) => {
  const v = fd.get(k);
  return typeof v === 'string' ? v.trim() : '';
};

const stamp = () => Date.now() + Math.random();
const ok = (data = {}) => ({ ok: true, error: null, token: stamp(), ...data });
const bad = (error, extra = {}) => ({ ok: false, error, token: stamp(), ...extra });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_MS = 86_400_000;

const refresh = (locale) => {
  revalidatePath(`/${locale}/marketplace/subscription`);
  revalidatePath('/[locale]/marketplace/seller/billing', 'page');
  revalidatePath('/[locale]/marketplace/admin/finance', 'page');
  revalidatePath('/[locale]/marketplace/admin/subscriptions', 'page');
};

/** Raise a renewal charge for one of the published plans. */
export async function requestRenewal(prevState, formData) {
  const wanted = str(formData, 'vendorId') || null;
  const { vendorId, error: denied } = await vendorForRenewal(wanted);
  if (denied) return bad(denied);

  const locale = str(formData, 'locale') || 'ar';
  const planId = str(formData, 'planId');
  if (!UUID.test(planId)) return bad('PLAN_NOT_FOUND');

  const db = getMarketplaceDb();

  const { data: plan, error: planError } = await db
    .from('vendor_plans')
    .select('id, name, days, price, active')
    .eq('id', planId)
    .maybeSingle();

  if (planError) return bad(planError.code === '42P01' ? 'ACCESS_NOT_MIGRATED' : 'SAVE_FAILED');
  // A plan an admin retired between the page rendering and the press.
  if (!plan || plan.active === false) return bad('PLAN_NOT_FOUND');

  const days = Number(plan.days);
  if (!Number.isFinite(days) || days < 1) return bad('PLAN_DAYS_INVALID');

  const label = plan.name?.en || plan.name?.ar || `${days} days`;
  const labelAr = plan.name?.ar || plan.name?.en || `${days} يوم`;

  const { data: created, error } = await db
    .from('vendor_charges')
    .insert({
      vendor_id: vendorId,
      kind: 'subscription',
      plan_id: plan.id,
      access_days: days,
      amount: Number(plan.price ?? 0),
      description: {
        ar: `تجديد الاشتراك — ${labelAr}`,
        en: `Subscription renewal — ${label}`,
      },
      due_at: new Date(Date.now() + DUE_DAYS * DAY_MS).toISOString(),
    })
    .select('id, ref')
    .maybeSingle();

  if (error) {
    // 23505 — vendor_charges_one_open_renewal. They already have one waiting,
    // which is information rather than a failure.
    if (error.code === '23505') return bad('RENEWAL_ALREADY_REQUESTED');
    if (error.code === '42703' || error.code === '42P01') return bad('ACCESS_NOT_MIGRATED');
    return bad('SAVE_FAILED', { detail: error.message });
  }

  /* Every admin's panel, so somebody picks it up. This is the most
     time-critical notification in the app: at the other end of it is a seller
     sitting in front of a locked dashboard. */
  notifyAdmins('renewal_requested', { id: created?.id ?? null, vendor: vendorId, ref: created?.ref ?? null });

  refresh(locale);
  return ok({ ref: created?.ref ?? null, days, chargeId: created?.id ?? null });
}

/**
 * Withdraw a renewal request that has not been paid.
 *
 * For the seller who picked the wrong plan. Only an UNPAID one, and only their
 * own: once an admin has recorded the payment the charge is a receipt, and a
 * receipt is not the payer's to delete.
 */
export async function cancelRenewal(prevState, formData) {
  const wanted = str(formData, 'vendorId') || null;
  const { vendorId, error: denied } = await vendorForRenewal(wanted);
  if (denied) return bad(denied);

  const locale = str(formData, 'locale') || 'ar';
  const chargeId = str(formData, 'chargeId');
  if (!UUID.test(chargeId)) return bad('NOT_FOUND');

  const db = getMarketplaceDb();

  const { data: gone, error } = await db
    .from('vendor_charges')
    .delete()
    .eq('id', chargeId)
    // Scoped by showroom, kind AND state at the database, not only in a read
    // above: a charge id on its own must never be enough to delete somebody
    // else's row, or a paid one.
    .eq('vendor_id', vendorId)
    .eq('kind', 'subscription')
    .eq('state', 'due')
    .select('id');

  if (error) return bad('DELETE_FAILED', { detail: error.message });
  if (!gone?.length) return bad('NOT_FOUND');

  refresh(locale);
  return ok({ chargeId });
}

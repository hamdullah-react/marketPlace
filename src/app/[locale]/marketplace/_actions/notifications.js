'use server';

import { revalidatePath } from 'next/cache';
import { adminForAction, vendorForAction } from '@/marketplace/auth/session';
import { markNotificationsRead } from '@/marketplace/db/queries/notifications';
import { getMarketplaceDb } from '@/marketplace/db/client';

/**
 * Clearing the bell.
 *
 * ── The browser says WHICH bell; the session says whether it may ────────────
 *
 * `audience` arrives from the form, and on its own it is only a request. An
 * admin bell is cleared only by somebody adminForAction() accepts as staff, and
 * a showroom's only by a member of that showroom — and the vendor id comes back
 * from the SESSION, never from the form, so no amount of editing the payload
 * clears a neighbour's notifications.
 *
 * ── Marked read for everyone here, deliberately ─────────────────────────────
 *
 * Read state is shared within a showroom (see schema.sql). One salesperson
 * opening the bell clears it for the desk, which is the behaviour a shared
 * queue wants: the badge means "nobody here has looked", and somebody has now
 * looked.
 */
const stamp = () => Date.now() + Math.random();
const ok = (data = {}) => ({ ok: true, error: null, token: stamp(), ...data });
const bad = (error) => ({ ok: false, error, token: stamp() });

export async function markAllNotificationsRead(prevState, formData) {
  const audience = formData.get('audience') === 'admin' ? 'admin' : 'vendor';

  if (audience === 'admin') {
    const { viewer, error: denied } = await adminForAction();
    if (denied) return bad(denied);

    const done = await markNotificationsRead({ audience: 'admin', userId: viewer.userId });
    if (!done.ok) return bad(done.error);

    revalidatePath('/[locale]/marketplace/admin', 'layout');
    return ok();
  }

  const wanted = formData.get('vendorId');
  const { viewer, vendorId, error: denied } = await vendorForAction(
    typeof wanted === 'string' ? wanted : null
  );
  if (denied) return bad(denied);

  const done = await markNotificationsRead({ audience: 'vendor', vendorId, userId: viewer.userId });
  if (!done.ok) return bad(done.error);

  revalidatePath('/[locale]/marketplace/seller', 'layout');
  return ok();
}

/**
 * Register this device for push, or drop it.
 *
 * ── The browser proves nothing; the session does ────────────────────────────
 *
 * The endpoint and keys come from the browser and are just an address. WHO that
 * address belongs to is decided here, from the session — a showroom's id is
 * never taken from the form, so no amount of editing the payload registers a
 * device against somebody else's notifications.
 *
 * ── Upsert on the endpoint ──────────────────────────────────────────────────
 *
 * Re-subscribing the same browser returns the same endpoint URL, so this is an
 * update rather than a second row. Without that, every visit to the dashboard
 * would add another copy of the same phone and it would buzz four times.
 */
export async function subscribeToPush(prevState, formData) {
  const audience = formData.get('audience') === 'admin' ? 'admin' : 'vendor';

  let sub;
  try {
    sub = JSON.parse(String(formData.get('subscription') ?? ''));
  } catch {
    return bad('SAVE_FAILED');
  }

  const endpoint = sub?.endpoint;
  const p256dh = sub?.keys?.p256dh;
  const auth = sub?.keys?.auth;
  if (!endpoint || !p256dh || !auth) return bad('SAVE_FAILED');

  const userAgent = String(formData.get('userAgent') ?? '').slice(0, 300) || null;

  let row;
  if (audience === 'admin') {
    const { viewer, error: denied } = await adminForAction();
    if (denied) return bad(denied);
    row = { audience: 'admin', vendor_id: null, user_id: viewer.userId };
  } else {
    const wanted = formData.get('vendorId');
    const { viewer, vendorId, error: denied } = await vendorForAction(
      typeof wanted === 'string' ? wanted : null
    );
    if (denied) return bad(denied);
    row = { audience: 'vendor', vendor_id: vendorId, user_id: viewer.userId };
  }

  const { error } = await getMarketplaceDb()
    .from('push_subscriptions')
    .upsert({ ...row, endpoint, p256dh, auth, user_agent: userAgent }, { onConflict: 'endpoint' });

  if (error) {
    console.warn('[push] subscribe failed:', error.message);
    return bad(error.code === '42P01' ? 'PUSH_NOT_MIGRATED' : 'SAVE_FAILED');
  }

  return ok({ subscribed: true });
}

/** Stop pushing to this one device. Scoped to the endpoint the browser holds. */
export async function unsubscribeFromPush(prevState, formData) {
  const endpoint = String(formData.get('endpoint') ?? '');
  if (!endpoint) return bad('SAVE_FAILED');

  /* Only somebody who can already act here may unregister a device, but the
     endpoint is the browser's own — it cannot name another person's. */
  const audience = formData.get('audience') === 'admin' ? 'admin' : 'vendor';
  const denied =
    audience === 'admin' ? (await adminForAction()).error : (await vendorForAction(null)).error;
  if (denied) return bad(denied);

  const { error } = await getMarketplaceDb()
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint);

  if (error) return bad('SAVE_FAILED');
  return ok({ subscribed: false });
}

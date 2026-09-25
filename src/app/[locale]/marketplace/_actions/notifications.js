'use server';

import { revalidatePath } from 'next/cache';
import { adminForAction, currentViewer, vendorForAction } from '@/marketplace/auth/session';
import { markNotificationsRead } from '@/marketplace/db/queries/notifications';
import { getMarketplaceDb } from '@/marketplace/db/client';
import { pushNotification } from '@/marketplace/lib/push';

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

/**
 * Who this request is allowed to act as.
 *
 * `audience` arrives from the form and on its own is only a REQUEST. What it
 * resolves to comes from the session every time: a showroom's id is never taken
 * from the payload, and a buyer is always themselves. So no amount of editing
 * the form reaches another person's bell or another showroom's devices.
 */
async function resolveAudience(formData) {
  const asked = formData.get('audience');

  if (asked === 'admin') {
    const { viewer, error } = await adminForAction();
    return error ? { error } : { audience: 'admin', userId: viewer.userId, vendorId: null };
  }

  if (asked === 'buyer') {
    // Any signed-in person is a buyer. There is no membership to check and
    // nothing to be a member of — which is the whole difference between this
    // audience and the other two.
    const viewer = await currentViewer();
    if (!viewer) return { error: 'NOT_SIGNED_IN' };
    return { audience: 'buyer', userId: viewer.userId, vendorId: null };
  }

  const wanted = formData.get('vendorId');
  const { viewer, vendorId, error } = await vendorForAction(
    typeof wanted === 'string' ? wanted : null
  );
  return error ? { error } : { audience: 'vendor', userId: viewer.userId, vendorId };
}

export async function markAllNotificationsRead(prevState, formData) {
  const who = await resolveAudience(formData);
  if (who.error) return bad(who.error);

  const done = await markNotificationsRead(who);
  if (!done.ok) return bad(done.error);

  /* Only the surface that owns this bell. A buyer clearing theirs must not
     rebuild a dashboard they cannot see. */
  if (who.audience === 'admin') revalidatePath('/[locale]/marketplace/admin', 'layout');
  else if (who.audience === 'vendor') revalidatePath('/[locale]/marketplace/seller', 'layout');
  else revalidatePath('/[locale]/marketplace', 'layout');

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

  const who = await resolveAudience(formData);
  if (who.error) return bad(who.error);

  const row = { audience: who.audience, vendor_id: who.vendorId, user_id: who.userId };

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
  const who = await resolveAudience(formData);
  if (who.error) return bad(who.error);

  const { error } = await getMarketplaceDb()
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint);

  if (error) return bad('SAVE_FAILED');
  return ok({ subscribed: false });
}

/**
 * Send this showroom (or the platform) a test notification, now.
 *
 * ── Why a button for this exists at all ─────────────────────────────────────
 *
 * Every step before the send can be checked from a dashboard — the keys are
 * set or they are not, the device registered or it did not, the row is in the
 * table or it is missing. Whether a notification ACTUALLY ARRIVES on a phone
 * with the browser closed cannot be checked from here at all; it can only be
 * tested by sending one. The alternative is waiting for a real lead and
 * guessing, which is how a broken notification system stays broken for a week.
 *
 * ── It is a real push, not a simulation ─────────────────────────────────────
 *
 * Same sender, same payload shape, same service worker as a genuine event, so a
 * test that arrives proves the whole path and a test that does not narrows it
 * to one place. It is deliberately NOT recorded in `notifications`: the bell is
 * a record of things that happened to the business, and "somebody pressed
 * test" is not one of them.
 *
 * ── Scoped by the SESSION ───────────────────────────────────────────────────
 *
 * The audience comes from the form and is only a request; who it resolves to
 * comes from adminForAction()/vendorForAction(), exactly as subscribeToPush
 * does. Nobody can make this ring somebody else's phone.
 */
export async function sendTestPush(prevState, formData) {
  const who = await resolveAudience(formData);
  if (who.error) return bad(who.error);

  const { audience, vendorId, userId } = who;

  /* Awaited, unlike every other push in the app. A test whose result nobody
     waits for cannot report how many devices it reached, which is the only
     thing the person pressing it wants to know. */
  const sent = await pushNotification({
    audience,
    vendorId,
    userId,
    kind: 'push_test',
    data: {},
    href:
      audience === 'admin'
        ? '/marketplace/admin'
        : audience === 'buyer'
          ? '/marketplace/account/requests'
          : '/marketplace/seller',
  });

  if (!sent.ok) {
    // PUSH_OFF is the keys being absent on this server — by far the most
    // common answer, and the one with a specific fix.
    return bad(sent.error === 'PUSH_OFF' ? 'PUSH_NOT_CONFIGURED' : 'SAVE_FAILED');
  }
  // Registered on another device, or nowhere yet. Silence here would read as
  // success on a device that is about to receive nothing.
  if (!sent.sent) return bad('PUSH_NO_DEVICES');

  return ok({ sent: sent.sent });
}
